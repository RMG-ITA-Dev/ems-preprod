-- BUG 0601-132 (follow-up): Make lockout thresholds configurable via global_settings.
--
-- Adds two settings with safe defaults:
--   AUTH_MAX_FAILED_ATTEMPTS = 5
--   AUTH_LOCKOUT_MINUTES     = 15
--
-- Updates record_failed_login() to read these values from global_settings
-- at call time, falling back to the original hardcoded defaults if the
-- rows are missing or contain an invalid value. Validation has two parts:
--   1. Regex guard (^[1-9][0-9]*$) — must be a positive integer.
--   2. Upper-bound guard (compared as numeric, which never overflows) — a
--      value above the bound would otherwise overflow the ::integer cast and
--      raise, aborting the function. Because secure-signin swallows the RPC
--      error and still returns INVALID_CREDENTIALS, an aborting function
--      would silently freeze the failed-login counter. Out-of-range values
--      therefore fall back to the hardcoded default instead of casting.
--
-- Also adds guard_auth_lockout_settings() — a BEFORE INSERT OR UPDATE trigger
-- on global_settings that restricts writes to AUTH_MAX_FAILED_ATTEMPTS /
-- AUTH_LOCKOUT_MINUTES to admins (and no-JWT service_role/postgres). Since these
-- rows now drive a security control and RLS on global_settings is disabled
-- (20260115000154), this trigger is what actually prevents an authenticated
-- user from weakening the lockout policy through a direct PostgREST write.

-- 1. Insert default settings (idempotent: ON CONFLICT DO NOTHING)
INSERT INTO public.global_settings (setting_key, setting_value)
VALUES
  ('AUTH_MAX_FAILED_ATTEMPTS', '5'),
  ('AUTH_LOCKOUT_MINUTES',     '15')
ON CONFLICT (setting_key) DO NOTHING;

-- 2. Replace record_failed_login() to read thresholds from global_settings
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email        text        := lower(trim(p_email));
  v_max          integer;
  v_lockout      interval;
  v_reset        interval    := interval '15 minutes';
  v_now          timestamptz := now();
  v_existing     public.auth_login_attempts%ROWTYPE;
  v_new_count    integer;
  v_locked_until timestamptz;
  v_remaining    integer;
  v_raw          text;
BEGIN
  -- Read configurable thresholds with defensive parsing.
  -- Regex guard (^[1-9][0-9]*$) ensures the value is a positive integer, and
  -- the numeric upper-bound guard rejects values that would overflow the
  -- ::integer cast (and, for the interval, blow past a sane maximum). Any
  -- non-numeric, zero, or out-of-range value falls back to the original
  -- hardcoded default so a bad setting can never disable lockout — whether by
  -- causing a cast exception or by silently freezing the counter.

  SELECT setting_value INTO v_raw
  FROM public.global_settings
  WHERE setting_key = 'AUTH_MAX_FAILED_ATTEMPTS'
  LIMIT 1;
  IF v_raw ~ '^[1-9][0-9]*$' AND v_raw::numeric <= 1000 THEN
    v_max := v_raw::integer;
  ELSE
    v_max := 5;
  END IF;

  SELECT setting_value INTO v_raw
  FROM public.global_settings
  WHERE setting_key = 'AUTH_LOCKOUT_MINUTES'
  LIMIT 1;
  -- 525600 minutes = 1 year; a generous ceiling that stays well within int range.
  IF v_raw ~ '^[1-9][0-9]*$' AND v_raw::numeric <= 525600 THEN
    v_lockout := make_interval(mins => v_raw::integer);
  ELSE
    v_lockout := interval '15 minutes';
  END IF;

  -- Atomic upsert so two parallel first-failures don't race on the PK.
  INSERT INTO public.auth_login_attempts (email_normalized, attempts_count, last_attempt_at)
  VALUES (v_email, 0, v_now)
  ON CONFLICT (email_normalized) DO NOTHING;

  SELECT * INTO v_existing
  FROM public.auth_login_attempts
  WHERE email_normalized = v_email
  FOR UPDATE;

  -- Already locked and still in force: report remaining time, don't bump.
  IF v_existing.locked_until IS NOT NULL AND v_existing.locked_until > v_now THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_existing.locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  -- Inactivity reset: if last failure is older than v_reset, start over at 1.
  IF v_existing.last_attempt_at < (v_now - v_reset) THEN
    v_new_count := 1;
  ELSE
    v_new_count := v_existing.attempts_count + 1;
  END IF;

  IF v_new_count >= v_max THEN
    v_locked_until := v_now + v_lockout;
  ELSE
    v_locked_until := NULL;
  END IF;

  UPDATE public.auth_login_attempts
  SET attempts_count  = v_new_count,
      last_attempt_at = v_now,
      locked_until    = v_locked_until
  WHERE email_normalized = v_email;

  -- BUG 0601-132: propagate is_blocked to the staff row.
  IF v_locked_until IS NOT NULL THEN
    BEGIN
      -- Authorize the write past prevent_self_blocked_change() (see migration
      -- 20260602000000). This RPC runs via service_role so auth.uid() is NULL,
      -- but the flag keeps the trusted-writer contract uniform.
      PERFORM set_config('app.allow_blocked_change', 'on', true);
      UPDATE public.staff
      SET is_blocked = true
      WHERE lower(trim(email)) = v_email
        AND is_blocked = false;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[0601-132] record_failed_login: could not set staff.is_blocked: %', SQLERRM;
    END;

    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  RETURN jsonb_build_object('locked', false, 'remaining_seconds', 0);
END;
$$;

-- ============================================================
-- 3. Protect the lockout thresholds from non-admin client writes
-- ============================================================
-- record_failed_login() now consumes AUTH_MAX_FAILED_ATTEMPTS /
-- AUTH_LOCKOUT_MINUTES from global_settings, so these rows became a security
-- control. RLS on global_settings was disabled in migration 20260115000154
-- ("disable for beta testing") with no later re-enable, leaving the admin-only
-- "Admins can manage settings" policy inert. With Supabase's default table
-- grants, any authenticated user could then weaken the lockout policy via a
-- direct PostgREST write (e.g. AUTH_LOCKOUT_MINUTES=1) before brute-forcing
-- another account — the UI admin guard in Settings.tsx does not cover the API.
--
-- This trigger enforces admin-only writes to those two keys regardless of the
-- RLS state (triggers always fire, RLS on or off). Legitimate writers:
--   * admins via the Settings UI (is_admin() = true)
--   * no-JWT contexts (service_role / postgres: this migration's INSERT, Studio)
-- Deleting a key is intentionally allowed: record_failed_login() then falls
-- back to the hardcoded secure defaults (5 / 15 min), which is not a weakening.
CREATE OR REPLACE FUNCTION public.guard_auth_lockout_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.setting_key IN ('AUTH_MAX_FAILED_ATTEMPTS', 'AUTH_LOCKOUT_MINUTES')
     AND auth.uid() IS NOT NULL          -- not service_role / postgres
     AND NOT public.is_admin() THEN      -- not an administrator
    RAISE EXCEPTION 'FORBIDDEN: % can only be changed by an administrator', NEW.setting_key
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- Idempotent: drop before create so re-running the migration is safe.
DROP TRIGGER IF EXISTS trg_guard_auth_lockout_settings ON public.global_settings;
CREATE TRIGGER trg_guard_auth_lockout_settings
  BEFORE INSERT OR UPDATE ON public.global_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_auth_lockout_settings();

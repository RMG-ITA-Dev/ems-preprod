-- BUG 0514-115: Account Lockout Policy
--
-- Mitigates brute-force login attempts by tracking per-account failed
-- password attempts and temporarily locking the account after a threshold.
--
-- Policy:
--   * MAX_FAILED_ATTEMPTS = 5
--   * LOCKOUT_DURATION   = 15 minutes
--   * COUNTER_RESET      = 15 minutes of inactivity OR a successful login
--
-- Architecture:
--   public.auth_login_attempts (private table, deny-all via RLS).
--   Three SECURITY DEFINER functions act as the only access path:
--     - check_login_allowed(text)  -> jsonb { allowed, remaining_seconds }
--     - record_failed_login(text)  -> jsonb { locked, remaining_seconds }
--     - reset_login_attempts(text) -> void
--   All three normalize input with lower(trim(p_email)).

-- 1. Table
CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  email_normalized text PRIMARY KEY,
  attempts_count   integer     NOT NULL DEFAULT 0,
  last_attempt_at  timestamptz NOT NULL DEFAULT now(),
  locked_until     timestamptz
);

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

-- Deny-all to anon/authenticated/public. The three RPCs are the only path.
REVOKE ALL ON public.auth_login_attempts FROM anon, authenticated, public;

-- 2. check_login_allowed
CREATE OR REPLACE FUNCTION public.check_login_allowed(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email   text := lower(trim(p_email));
  v_locked  timestamptz;
  v_remaining integer;
BEGIN
  SELECT locked_until INTO v_locked
  FROM public.auth_login_attempts
  WHERE email_normalized = v_email;

  IF v_locked IS NOT NULL AND v_locked > now() THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_locked - now()))::integer);
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining_seconds', v_remaining
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_seconds', 0
  );
END;
$$;

-- 3. record_failed_login
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email    text := lower(trim(p_email));
  v_max      integer       := 5;
  v_lockout  interval      := interval '15 minutes';
  v_reset    interval      := interval '15 minutes';
  v_now      timestamptz   := now();
  v_existing public.auth_login_attempts%ROWTYPE;
  v_new_count integer;
  v_locked_until timestamptz;
  v_remaining integer;
BEGIN
  -- Atomic upsert ensures the row exists before we lock it. This closes a race
  -- where two parallel first-failures for the same email would both reach the
  -- INSERT branch and the second would fail on the primary key.
  INSERT INTO public.auth_login_attempts (email_normalized, attempts_count, last_attempt_at)
  VALUES (v_email, 0, v_now)
  ON CONFLICT (email_normalized) DO NOTHING;

  SELECT * INTO v_existing
  FROM public.auth_login_attempts
  WHERE email_normalized = v_email
  FOR UPDATE;

  -- Already locked and lock still in force: just report remaining time, don't bump.
  IF v_existing.locked_until IS NOT NULL AND v_existing.locked_until > v_now THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_existing.locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  -- Inactivity-based counter reset: if last failure was longer ago than v_reset, start over at 1.
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
  SET attempts_count = v_new_count,
      last_attempt_at = v_now,
      locked_until = v_locked_until
  WHERE email_normalized = v_email;

  IF v_locked_until IS NOT NULL THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  RETURN jsonb_build_object('locked', false, 'remaining_seconds', 0);
END;
$$;

-- 4. reset_login_attempts
--
-- Only callable post-login (role 'authenticated'), and a caller may only clear
-- their own counter. Without this guard, anon could call the RPC with the
-- public anon key to wipe any lockout row mid-attack, defeating the policy.
-- Admin/SQL-editor calls (role 'postgres' / 'service_role') have no JWT
-- context, so the guard lets them through for support unblocking.
CREATE OR REPLACE FUNCTION public.reset_login_attempts(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email     text := lower(trim(p_email));
  v_jwt_email text := lower(trim(coalesce((auth.jwt() ->> 'email'), '')));
BEGIN
  -- When a JWT is present (authenticated user), the email must match.
  -- When no JWT is present (postgres / service_role from Studio), allow.
  IF auth.jwt() IS NOT NULL AND v_jwt_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'RESET_FORBIDDEN: caller email mismatch';
  END IF;

  DELETE FROM public.auth_login_attempts
  WHERE email_normalized = v_email;
END;
$$;

-- 5. Grants
--   * check_login_allowed   → anon + authenticated (must run pre-login).
--   * record_failed_login   → anon + authenticated (must run on failed login).
--   * reset_login_attempts  → authenticated ONLY (anon must never clear the
--     counter; admin/Studio path uses 'postgres' which bypasses grants).
REVOKE ALL ON FUNCTION public.check_login_allowed(text)  FROM public;
REVOKE ALL ON FUNCTION public.record_failed_login(text)  FROM public;
REVOKE ALL ON FUNCTION public.reset_login_attempts(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.check_login_allowed(text)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_login_attempts(text) TO authenticated;

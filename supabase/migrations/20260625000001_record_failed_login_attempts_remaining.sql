-- BUG 0625-146: Expose attempts_remaining in record_failed_login response.
--
-- The non-locked return branch previously returned only { locked, remaining_seconds }.
-- This migration adds 'attempts_remaining' so the secure-signin edge function can
-- forward the countdown to the client and display it in the INVALID_CREDENTIALS toast.
--
-- Only the jsonb_build_object in the non-locked return path changes. All thresholds,
-- locking logic, staff.is_blocked propagation, and grants are untouched.

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
  -- hardcoded default so a bad setting can never disable lockout.

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

  -- BUG 0625-146: include attempts_remaining so the caller can surface the
  -- countdown to the user without a separate query.
  RETURN jsonb_build_object(
    'locked', false,
    'remaining_seconds', 0,
    'attempts_remaining', GREATEST(0, v_max - v_new_count)
  );
END;
$$;

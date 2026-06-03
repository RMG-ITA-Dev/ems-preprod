-- BUG 0601-132: Account Blocked Admin Control
--
-- Adds an admin-visible persistent blocked state to the staff table.
-- Extends the existing lockout engine (0514-115) with three changes:
--
--   1. staff.is_blocked (boolean) — the admin-facing flag shown in
--      Administración → Personal. Toggled ON by record_failed_login when
--      the threshold is reached; toggled OFF on successful login (via
--      reset_login_attempts) or by admin manual unlock.
--
--   2. record_failed_login() extended — propagates is_blocked = true to
--      the staff row when the lockout fires. The update is wrapped in an
--      exception block so a staff-table error never silently swallows the
--      auth_login_attempts write.
--
--   3. reset_login_attempts() extended — also sets staff.is_blocked = false
--      for the email. This covers the auto-unlock path: after 15 min the
--      user logs in successfully, secure-signin calls reset_login_attempts,
--      and the admin switch goes back to OFF automatically.
--
--   4. admin_unblock_account(p_staff_id uuid) — new SECURITY DEFINER RPC
--      callable only by service_role (used by the unlock-account Edge
--      Function). Atomically clears auth_login_attempts and staff.is_blocked.
--
--   5. prevent_self_blocked_change() trigger — blocks a non-admin authenticated
--      user from changing their own is_blocked via the "Users can update their
--      linked staff record" RLS policy, so a lockout cannot be self-cleared
--      from a still-active session. Only admins / the no-JWT service_role +
--      SECURITY DEFINER lockout paths may flip the flag.

-- ============================================================
-- 1. Add is_blocked column to staff
-- ============================================================
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. Extend record_failed_login() to propagate is_blocked = true
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email        text        := lower(trim(p_email));
  v_max          integer     := 5;
  v_lockout      interval    := interval '15 minutes';
  v_reset        interval    := interval '15 minutes';
  v_now          timestamptz := now();
  v_existing     public.auth_login_attempts%ROWTYPE;
  v_new_count    integer;
  v_locked_until timestamptz;
  v_remaining    integer;
BEGIN
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

  -- BUG 0601-132: propagate is_blocked to the staff row so the admin
  -- switch in Administración → Personal shows ON. Wrapped in EXCEPTION so
  -- any staff-table failure never aborts the lockout counter write above.
  IF v_locked_until IS NOT NULL THEN
    BEGIN
      PERFORM set_config('app.allow_blocked_change', 'on', true);
      UPDATE public.staff
      SET is_blocked = true
      WHERE lower(trim(email)) = v_email
        AND is_blocked = false;
    EXCEPTION WHEN OTHERS THEN
      -- Log and continue; the auth_login_attempts row is already written.
      RAISE WARNING '[0601-132] record_failed_login: could not set staff.is_blocked: %', SQLERRM;
    END;

    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  RETURN jsonb_build_object('locked', false, 'remaining_seconds', 0);
END;
$$;

-- ============================================================
-- 3. Extend reset_login_attempts() to also clear staff.is_blocked
-- ============================================================
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

  -- BUG 0601-132: clear the admin-visible blocked flag at the same time.
  -- This covers the auto-unlock path: 15 min pass → user logs in
  -- successfully → secure-signin calls this RPC (with the user's own JWT) →
  -- admin switch goes to OFF. The transaction-local flag authorizes the write
  -- past prevent_self_blocked_change(), which otherwise can't distinguish this
  -- trusted reset from a self-service UPDATE (both carry the user's JWT).
  BEGIN
    PERFORM set_config('app.allow_blocked_change', 'on', true);
    UPDATE public.staff
    SET is_blocked = false
    WHERE lower(trim(email)) = v_email
      AND is_blocked = true;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[0601-132] reset_login_attempts: could not clear staff.is_blocked: %', SQLERRM;
  END;
END;
$$;

-- ============================================================
-- 4. New RPC: admin_unblock_account(p_staff_id uuid)
-- ============================================================
-- Called exclusively by the unlock-account Edge Function (service_role).
-- Atomically:
--   a) sets staff.is_blocked = false
--   b) deletes the auth_login_attempts row for that email
-- Returns jsonb { ok, email } so the caller can send the reset email.
CREATE OR REPLACE FUNCTION public.admin_unblock_account(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
BEGIN
  -- Resolve email from staff record.
  SELECT lower(trim(email)) INTO v_email
  FROM public.staff
  WHERE staff_id = p_staff_id
    AND deleted_at IS NULL;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'STAFF_NOT_FOUND');
  END IF;

  -- Clear the persistent blocked flag. Authorize the write past
  -- prevent_self_blocked_change() (this RPC is service_role-only, so auth.uid()
  -- is already NULL, but the flag keeps the trusted-writer contract uniform).
  PERFORM set_config('app.allow_blocked_change', 'on', true);
  UPDATE public.staff
  SET is_blocked = false
  WHERE staff_id = p_staff_id;

  -- Clear the lockout row so the user is not stuck behind locked_until.
  DELETE FROM public.auth_login_attempts
  WHERE email_normalized = v_email;

  RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$$;

-- Only service_role may call this RPC (the Edge Function uses service_role key).
REVOKE ALL ON FUNCTION public.admin_unblock_account(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_account(uuid) TO service_role;

-- ============================================================
-- 5. Protect is_blocked from self-service tampering
-- ============================================================
-- The "Users can update their linked staff record" RLS policy lets any
-- authenticated user UPDATE every column on their own staff row, including
-- is_blocked. Without a guard, a user with a still-valid session could set
-- their own is_blocked back to false and hide a lockout that fired on another
-- device, even though only admins / the service_role lockout path should ever
-- control this flag.
--
-- A BEFORE UPDATE trigger enforces that. Legitimate writers run WITHOUT an
-- end-user JWT (auth.uid() IS NULL):
--   * service_role — unlock-account Edge Function → admin_unblock_account
--   * the SECURITY DEFINER lockout RPCs (record_failed_login /
--     reset_login_attempts), invoked by secure-signin via service_role
-- An authenticated end user may only change is_blocked if they are an admin.
-- The app never writes is_blocked directly from the client (it is read-only in
-- the UI; unblock goes through the Edge Function), so this never blocks a
-- legitimate client path.
CREATE OR REPLACE FUNCTION public.prevent_self_blocked_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Reject only a genuine change to the flag that did NOT come from a trusted
  -- lockout function. Those functions (record_failed_login /
  -- reset_login_attempts / admin_unblock_account) set this transaction-local
  -- flag before touching the row. This indirection is required because
  -- reset_login_attempts runs with the *user's own JWT* (so secure-signin can
  -- enforce its jwt-email guard on a successful login), which auth.uid() alone
  -- cannot tell apart from a self-service UPDATE. A direct PostgREST UPDATE on
  -- the staff table cannot set the flag, so self-service tampering is rejected
  -- while the auto-unlock-on-login path keeps working.
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     AND current_setting('app.allow_blocked_change', true) IS DISTINCT FROM 'on'
     AND auth.uid() IS NOT NULL          -- not service_role / postgres (edge fns, Studio)
     AND NOT public.is_admin() THEN      -- not an administrator
    RAISE EXCEPTION 'FORBIDDEN: is_blocked can only be changed by an administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- Idempotent: drop before create so re-running the migration is safe.
DROP TRIGGER IF EXISTS trg_prevent_self_blocked_change ON public.staff;
CREATE TRIGGER trg_prevent_self_blocked_change
  BEFORE UPDATE OF is_blocked ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_blocked_change();

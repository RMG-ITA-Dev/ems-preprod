-- Fix BUG 0511-109 / 0511-110: Conditional No-Reingreso guard.
--
-- 0511-109: Admin creates staff with switch "Activo"=OFF (is_active=false,
--           termination_date=NULL). Flipping it on later raises
--           REACTIVATION_BLOCKED even though the staff never left.
--
-- 0511-110: That same staff later signs up at /auth. The AFTER INSERT trigger
--           link_auth_user_to_staff runs `UPDATE staff SET is_active=true`,
--           which trips the same guard. GoTrue surfaces this as the generic
--           "Database error saving new user" and the signup is aborted.
--
-- Both bugs share the same root cause: the guard introduced in
-- 20260222071755 fires on ANY false->true transition, regardless of whether
-- the row was ever actually terminated. This change makes the guard
-- conditional on evidence of a real exit (termination_date or deleted_at),
-- matching the frontend rule already in StaffForm.tsx (isReactivationBlocked).
--
-- Bypass closure: the conditional guard alone could be bypassed in two
-- UPDATEs (first clear termination_date / deleted_at while still inactive,
-- then flip is_active=true on the now-NULL row). To preserve the no-reingreso
-- invariant at the DB level (independent of the frontend), we also forbid
-- clearing termination_date or deleted_at once they've been set. They remain
-- editable between NOT NULL values (e.g. correcting a wrong exit date).

CREATE OR REPLACE FUNCTION public.prevent_staff_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Block direct reactivation of a row with evidence of a prior exit.
  IF OLD.is_active = false
     AND NEW.is_active = true
     AND (OLD.termination_date IS NOT NULL OR OLD.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'REACTIVATION_BLOCKED: Staff reactivation is not permitted. Delete the record and create a new one.';
  END IF;

  -- Make exit evidence immutable once set: prevents the two-step bypass
  -- where termination_date is cleared first and is_active is flipped after.
  IF OLD.termination_date IS NOT NULL AND NEW.termination_date IS NULL THEN
    RAISE EXCEPTION 'TERMINATION_DATE_IMMUTABLE: Cannot clear termination_date once set.';
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'DELETED_AT_IMMUTABLE: Cannot clear deleted_at once set.';
  END IF;

  RETURN NEW;
END;
$$;

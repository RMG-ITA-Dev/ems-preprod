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

CREATE OR REPLACE FUNCTION public.prevent_staff_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.is_active = false
     AND NEW.is_active = true
     AND (OLD.termination_date IS NOT NULL OR OLD.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'REACTIVATION_BLOCKED: Staff reactivation is not permitted. Delete the record and create a new one.';
  END IF;
  RETURN NEW;
END;
$$;

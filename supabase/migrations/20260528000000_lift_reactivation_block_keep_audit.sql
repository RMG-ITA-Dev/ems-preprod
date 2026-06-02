-- Fix BUG 0526-123: lift the No-Reingreso block on already-terminated staff.
--
-- Background:
--   * 20260222071755 added trg_prevent_staff_reactivation that blocked any
--     OLD.is_active=false -> NEW.is_active=true transition.
--   * 20260520000000 (BUG 0511-109/110) made that block conditional on
--     OLD.termination_date IS NOT NULL OR OLD.deleted_at IS NOT NULL, and
--     added two audit-immutability guards (TERMINATION_DATE_IMMUTABLE,
--     DELETED_AT_IMMUTABLE) to close a bypass.
--
-- 0526-123 reverses the reactivation policy: an admin must be able to
-- reactivate a terminated user to regularize timesheet entries dated
-- before the termination_date. The hour-loading restriction continues to
-- be enforced by trg_enforce_termination_date on public.time_entries
-- (NOT touched here).
--
-- This migration redefines public.prevent_staff_reactivation() in place
-- (the trigger trg_prevent_staff_reactivation on public.staff is kept
-- intact) so that:
--   * the REACTIVATION_BLOCKED branch is removed entirely, and
--   * the two IMMUTABLE branches (audit-evidence protection) remain.
--
-- The function name is preserved on purpose to keep the trigger wiring
-- and the existing toast handlers in src/hooks/mutations/useStaffMutations.ts
-- functional without a rename cascade. The comment above explains why
-- the name no longer matches the body.

CREATE OR REPLACE FUNCTION public.prevent_staff_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Reactivation block intentionally removed for BUG 0526-123.
  -- (Previously raised REACTIVATION_BLOCKED on the OLD.is_active=false ->
  --  NEW.is_active=true transition when termination_date or deleted_at
  --  was set. Admins must now be able to reactivate to regularize
  --  prior-period timesheets.)

  -- termination_date is unconditionally immutable once set — protects
  -- audit evidence and keeps trg_enforce_termination_date blocking
  -- post-exit hour entries even on reactivated rows.
  -- P1 fix: the TD-4 active→active cleanup exception was removed because
  -- it becomes a bypass hole after reactivation (OLD.is_active = true on
  -- every subsequent save).
  IF OLD.termination_date IS NOT NULL
     AND NEW.termination_date IS NULL THEN
    RAISE EXCEPTION 'TERMINATION_DATE_IMMUTABLE: Cannot clear termination_date once set.';
  END IF;

  -- Soft-deleted rows cannot be reactivated. The 0526-123 policy change
  -- only lifted the block for rows that were terminated but NOT deleted.
  IF OLD.deleted_at IS NOT NULL
     AND OLD.is_active = false
     AND NEW.is_active = true THEN
    RAISE EXCEPTION 'REACTIVATION_BLOCKED: Cannot reactivate a soft-deleted staff row. Create a new record instead.';
  END IF;

  -- deleted_at is never reversible. Soft-deletes are one-way regardless
  -- of is_active state (aligned with the errors.deletedAtImmutable toast:
  -- "create a new record instead").
  IF OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'DELETED_AT_IMMUTABLE: Cannot clear deleted_at on a staff row. Soft-deleted records cannot be restored; create a new record instead.';
  END IF;

  RETURN NEW;
END;
$$;

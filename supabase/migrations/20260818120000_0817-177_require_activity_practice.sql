-- 0817-177: Require every activity code to belong to a practice.
--
-- Settings unifies Prácticas/Categorías/Actividades into one ABM tab; the
-- "Global" (unlinked) activity bucket is removed from the UI. This migration
-- makes that invariant durable at the schema level.
--
-- Targeted backfill + fail-fast: `service_id` didn't exist yet when
-- 20251204045534 seeded the original 8 activity codes (PLN/FLD/REV/DOC/ADM/
-- MTG/TRV/TRN). Every deployed environment has since assigned them a
-- práctica by hand — the operator verified 0 orphans in Dev/Lovable before
-- this ticket (see bugs/0817-177/plan_v2.md) — but a from-scratch migration
-- replay (CI's route-parity job, or any fresh install) never gets that
-- manual fix and still finds them NULL. Backfill exactly those 8 known
-- codes to Auditoría (code=1 — the classic audit-engagement lifecycle they
-- represent), the same pattern already used and operator-approved for
-- staff.service_id in 20260812140000_0810-173_staff_society_and_service.sql.
-- Anything else unexpectedly NULL still aborts below instead of being
-- silently assigned.
UPDATE public.activity_codes
   SET service_id = (SELECT service_id FROM public.services WHERE code = 1) -- Auditoría
 WHERE service_id IS NULL
   AND activity_code IN ('PLN', 'FLD', 'REV', 'DOC', 'ADM', 'MTG', 'TRV', 'TRN');

DO $$
DECLARE
  v_orphans integer;
BEGIN
  SELECT COUNT(*) INTO v_orphans
    FROM public.activity_codes
   WHERE service_id IS NULL;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'activity_codes has % row(s) with service_id IS NULL — cannot apply NOT NULL. '
      'Assign a practice to every row (or decide a backfill target) before re-running this migration.',
      v_orphans;
  END IF;
END $$;

ALTER TABLE public.activity_codes
  ALTER COLUMN service_id SET NOT NULL;

-- 0817-177: Require every activity code to belong to a practice.
--
-- Settings unifies Prácticas/Categorías/Actividades into one ABM tab; the
-- "Global" (unlinked) activity bucket is removed from the UI. This migration
-- makes that invariant durable at the schema level.
--
-- Fail-fast, no backfill: the operator verified 0 rows with service_id IS NULL
-- before this ticket (see bugs/0817-177/plan_v2.md). If that has changed by
-- the time this runs, abort with a clear diagnostic rather than silently
-- assigning an unrelated practice to orphaned rows.
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

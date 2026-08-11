-- Phase 3 — Engagement Staff Assignments
-- Plan: docs/plans/scheduler-phase-3-assignments.md (Plan v2)
--
-- `public.engagement_assignments` already exists from the scheduler-v2 era
-- (created via Lovable prompt; captured in types.ts but in no committed
-- migration). This migration ALTERS it into the Phase 3 shape:
--   • adds category_id (backfilled from staff.category_id, then NOT NULL + FK)
--   • adds a date-range CHECK
--   • adds three partial indexes on the soft-delete hot read paths
--   • replaces the leadership-only RLS with the canonical dual-policy shape
--     (admin manage-all + is_engagement_team_member), SELECT to authenticated
--
-- Deliberately untouched: the dormant engagement_staffing_requirements table
-- and the legacy requirement_id column (stays NULL; future phase decides).
--
-- Idempotent (IF NOT EXISTS / DROP ... IF EXISTS) so re-runs are safe.

-- =====================================================================
-- A. Defensive: if a fresh env somehow lacks the table, materialize the
--    minimum shape we depend on. In the live DB this is a no-op.
-- =====================================================================
-- The status / hours / allocation contract mirrors the scheduler-v2 era
-- conventions so a fresh environment behaves like the live one. Phase 3
-- inserts deliberately OMIT status (the column default governs) and the
-- UI enforces the same numeric bounds client-side.
CREATE TABLE IF NOT EXISTS public.engagement_assignments (
  assignment_id      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id      UUID        NOT NULL REFERENCES public.engagements(engagement_id) ON DELETE CASCADE,
  staff_id           UUID        NOT NULL REFERENCES public.staff(staff_id),
  start_date         DATE        NOT NULL,
  end_date           DATE        NOT NULL,
  hours_per_week     NUMERIC     NOT NULL DEFAULT 40
    CONSTRAINT chk_assignment_hours CHECK (hours_per_week > 0 AND hours_per_week <= 80),
  allocation_percent NUMERIC     NOT NULL DEFAULT 100
    CONSTRAINT chk_assignment_allocation CHECK (allocation_percent > 0 AND allocation_percent <= 100),
  status             TEXT        NOT NULL DEFAULT 'PROPOSED'
    CONSTRAINT chk_assignment_status CHECK (status IN ('PROPOSED','PROVISIONAL','CONFIRMED','COMPLETED','CANCELLED')),
  notes              TEXT,
  requirement_id     UUID,
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID
);

-- =====================================================================
-- B. Add category_id — Phase 3's only schema addition
-- =====================================================================
ALTER TABLE public.engagement_assignments
  ADD COLUMN IF NOT EXISTS category_id UUID;

-- =====================================================================
-- C. Backfill from staff.category_id for any pre-existing rows
-- =====================================================================
UPDATE public.engagement_assignments ea
   SET category_id = s.category_id
  FROM public.staff s
 WHERE ea.staff_id = s.staff_id
   AND ea.category_id IS NULL;

-- =====================================================================
-- D. Pre-flight before NOT NULL: staff.category_id may be NULL on
--    legacy rows. Fail loudly with cleanup guidance instead of letting
--    the ALTER below abort with a generic constraint error.
-- =====================================================================
DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*)
    INTO missing_count
    FROM public.engagement_assignments
   WHERE category_id IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce engagement_assignments.category_id NOT NULL: % rows remain NULL after staff.category_id backfill. Populate staff.category_id or assignment.category_id first.',
      missing_count;
  END IF;
END $$;

-- =====================================================================
-- E. Enforce NOT NULL + FK once backfill/pre-flight passes
-- =====================================================================
ALTER TABLE public.engagement_assignments
  ALTER COLUMN category_id SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'engagement_assignments_category_id_fkey'
       AND table_name = 'engagement_assignments'
  ) THEN
    ALTER TABLE public.engagement_assignments
      ADD CONSTRAINT engagement_assignments_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES public.categories(category_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- =====================================================================
-- F. Date sanity. The scheduler-v2 era may have created an equivalent
--    CHECK under the name chk_assignment_dates — drop it so exactly one
--    date constraint remains, under the Phase 3 canonical name.
-- =====================================================================
ALTER TABLE public.engagement_assignments
  DROP CONSTRAINT IF EXISTS chk_assignment_dates;
ALTER TABLE public.engagement_assignments
  DROP CONSTRAINT IF EXISTS engagement_assignments_dates_chk;
ALTER TABLE public.engagement_assignments
  ADD  CONSTRAINT engagement_assignments_dates_chk CHECK (end_date >= start_date);

-- =====================================================================
-- G. Indexes — partial on soft delete for hot read paths.
--    Phases 4 (Gantt) and 5 (timesheet authorization) rely on these
--    and add no further indexes.
--    A scheduler-v2 era idx_assignments_staff_dates (non-partial) may
--    exist on the live DB; it is deliberately NOT dropped — unknown
--    scheduler-v2 views/functions may query without the deleted_at
--    predicate and would lose their index. Revisit in the cleanup PR.
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_eng_assign_engagement_active
  ON public.engagement_assignments (engagement_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_eng_assign_staff_dates_active
  ON public.engagement_assignments (staff_id, start_date, end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_eng_assign_category_active
  ON public.engagement_assignments (category_id) WHERE deleted_at IS NULL;

-- =====================================================================
-- H. updated_at trigger (same helper every other table uses).
--    The column is added defensively first: if the live table somehow
--    lacks it, the trigger would otherwise install silently and every
--    UPDATE would fail at runtime. A scheduler-v2 era trigger name
--    (trg_engagement_assignments_updated_at) is dropped so the row is
--    touched exactly once per UPDATE.
-- =====================================================================
ALTER TABLE public.engagement_assignments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_engagement_assignments_updated_at
  ON public.engagement_assignments;
DROP TRIGGER IF EXISTS update_engagement_assignments_updated_at
  ON public.engagement_assignments;
CREATE TRIGGER update_engagement_assignments_updated_at
  BEFORE UPDATE ON public.engagement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- I. RLS — drop any pre-existing scheduler-v2 policies and replace with
--    the dual-policy canonical shape (docs/database-schema.sql:2274-2286).
-- =====================================================================
ALTER TABLE public.engagement_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read assignments" ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership can insert assignments"  ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership can update assignments"  ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership can delete assignments"  ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership manages assignments"     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select        ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_admin_manage  ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_manage   ON public.engagement_assignments;

CREATE POLICY ea_admin_manage ON public.engagement_assignments
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Order-safety guard (PR #230 adversarial verification): ea_select /
-- ea_team_manage are the PRE-D5 permissive policies, replaced by
-- 20260717233000 (D5) as a data-confidentiality boundary. If this file
-- is (re-)applied on a database that already carries the D5 matrix —
-- e.g. an operator re-runs Phase 3 after the 20260720120000 convergence
-- migration repaired a drifted history — recreating them would silently
-- re-open the leak D5 closed (permissive policies OR together). Skip
-- them when the D5 matrix is present; on a pre-D5 database this block
-- behaves exactly as before.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'engagement_assignments'
       AND policyname = 'ea_select_firmwide'
  ) THEN
    CREATE POLICY ea_select ON public.engagement_assignments
      FOR SELECT TO authenticated USING (true);

    CREATE POLICY ea_team_manage ON public.engagement_assignments
      FOR ALL TO authenticated
      USING (public.is_engagement_team_member(engagement_id))
      WITH CHECK (public.is_engagement_team_member(engagement_id));
  END IF;
END $$;

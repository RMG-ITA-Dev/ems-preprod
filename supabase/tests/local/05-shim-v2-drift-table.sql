-- Local/CI harness shim — world-D ("drifted history") lane ONLY.
-- Runs INSTEAD of the Phase 3 migration, right after 00-shim-supabase:
-- materializes the scheduler-v2 era engagement_assignments exactly as
-- the live table stood before Phase 3 — NO category_id, the legacy
-- trigger name, a legacy non-partial index, and the legacy permissive
-- RLS policies — then seeds uncategorized rows (the live SEED-SCHED
-- analog). The corrective migration
-- (20260720120000_engagement_assignments_category_id_backfill.sql) must
-- repair ALL of it on its own; the D5 leakage suite then proves the
-- final matrix. Column set mirrors the Phase 3 migration's defensive
-- CREATE (the documented v2 shape), minus category_id.

CREATE TABLE public.engagement_assignments (
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

-- Legacy scheduler-v2 artifacts. The trigger and policies below MUST be
-- replaced by the corrective migration; the non-partial index is
-- deliberately RETAINED (matching Phase 3's documented decision —
-- unknown scheduler-v2 views/functions may rely on it; revisit in the
-- cleanup PR), so the converged world-D state carries it alongside the
-- three canonical partial indexes.
CREATE INDEX idx_assignments_staff_dates
  ON public.engagement_assignments (staff_id, start_date, end_date);

CREATE TRIGGER trg_engagement_assignments_updated_at
  BEFORE UPDATE ON public.engagement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.engagement_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read assignments" ON public.engagement_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leadership manages assignments" ON public.engagement_assignments
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_engagement_team_member(engagement_id))
  WITH CHECK (public.is_admin() OR public.is_engagement_team_member(engagement_id));

-- Seed the drift world: categorized staff, but assignments created
-- BEFORE category_id existed (the live SEED-SCHED situation). Ids use a
-- d-prefix so they stay outside both the 10-shim baseline (b*) and the
-- leakage-suite fixture id sets.
INSERT INTO public.categories (category_id, category_name)
VALUES ('d0000000-0000-4000-8000-000000000001', 'Drift Category');

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('d1000000-0000-4000-8000-000000000001', 'Drift Client', 'DR-TAX-001');

INSERT INTO public.staff (staff_id, first_name, last_name, category_id) VALUES
  ('d5000000-0000-4000-8000-000000000001', 'Drift', 'StaffOne', 'd0000000-0000-4000-8000-000000000001'),
  ('d5000000-0000-4000-8000-000000000002', 'Drift', 'StaffTwo', 'd0000000-0000-4000-8000-000000000001');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name)
VALUES ('de000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Drift Engagement');

INSERT INTO public.engagement_assignments
  (assignment_id, engagement_id, staff_id, start_date, end_date, deleted_at)
VALUES
  ('da000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31', NULL),
  ('da000000-0000-4000-8000-000000000002', 'de000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002', '2025-01-01', '2025-12-31', now());

-- Prove the pre-repair leak: with the legacy USING (true) policy, ANY
-- authenticated user reads every assignment row — the exposure the D5
-- matrix closed and the corrective migration must close again here.
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.engagement_assignments;
  IF n < 2 THEN
    RAISE EXCEPTION 'harness error: legacy permissive policy did not expose the drift rows (leak not reproduced)';
  END IF;
  RAISE NOTICE 'harness: authenticated reads % assignment rows under legacy USING(true) PRE-repair (leak reproduced; corrective migration must close it)', n;
END $$;
ROLLBACK;

-- Sanity: the drift shape really lacks category_id (guards against a
-- future edit accidentally converging this fixture with Phase 3).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'engagement_assignments'
       AND column_name = 'category_id'
  ) THEN
    RAISE EXCEPTION 'harness error: drift fixture must NOT have category_id (world-D precondition)';
  END IF;
END $$;

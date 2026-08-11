-- Local/CI harness shim, part 2 — runs AFTER the Phase 3 migration
-- (engagement_assignments must exist).
--
-- 1. Recreates the scheduler-v2 era staffing views that PR #222's
--    adversarial review proved leak through view-owner privileges
--    (vw_engagement_staffing_summary readable by anon on the live
--    project). Definitions are REPRESENTATIVE reconstructions — the
--    live views are Lovable-created artifacts with no committed DDL —
--    but they reproduce the property under test: owner-privilege views
--    over engagement_assignments/staff, granted to the API roles.
-- 2. Seeds baseline "live" rows OUTSIDE the leakage suite's fixture id
--    set, so the suite's fixture-scoped assertions are proven correct
--    on a database that already contains data (PR #222 finding 3).
-- 3. Pre-asserts the leak as anon, so the run demonstrates
--    vulnerable-before / denied-after across the D5 migration.

-- ── 1. Views + API grants (mimicking the live exposure) ───────────────
CREATE VIEW public.vw_engagement_staffing_summary AS
SELECT e.engagement_id,
       e.engagement_code,
       e.engagement_name,
       e.start_date  AS engagement_start,
       e.end_date    AS engagement_end,
       e.status      AS engagement_status,
       c.client_legal_name,
       count(ea.assignment_id) FILTER (WHERE ea.deleted_at IS NULL) AS active_assignments
  FROM public.engagements e
  JOIN public.clients c USING (client_id)
  LEFT JOIN public.engagement_assignments ea ON ea.engagement_id = e.engagement_id
 GROUP BY e.engagement_id, e.engagement_code, e.engagement_name,
          e.start_date, e.end_date, e.status, c.client_legal_name;

CREATE VIEW public.vw_staffing_alerts AS
SELECT 'assignment'::text                AS alert_type,
       ea.assignment_id                  AS entity_id,
       e.engagement_id,
       e.engagement_code,
       e.engagement_name,
       s.staff_id,
       s.first_name || ' ' || s.last_name AS staff_name,
       ea.start_date,
       ea.end_date,
       now()                             AS detected_at
  FROM public.engagement_assignments ea
  JOIN public.engagements e USING (engagement_id)
  JOIN public.staff s ON s.staff_id = ea.staff_id
 WHERE ea.deleted_at IS NULL;

CREATE VIEW public.vw_staff_weekly_capacity AS
SELECT s.staff_id,
       s.first_name,
       s.last_name,
       s.weekly_capacity_hours,
       cat.category_id,
       cat.category_name,
       cat.display_order
  FROM public.staff s
  LEFT JOIN public.categories cat ON cat.category_id = s.category_id
 WHERE s.deleted_at IS NULL;

GRANT SELECT ON public.vw_engagement_staffing_summary,
                public.vw_staffing_alerts,
                public.vw_staff_weekly_capacity
   TO anon, authenticated;

-- ── 2. Baseline "live" data outside the fixture id set ────────────────
INSERT INTO public.categories (category_id, category_name)
VALUES ('b0000000-0000-4000-8000-000000000001', 'Baseline Category');

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('b1000000-0000-4000-8000-000000000001', 'Baseline Client', 'BL-TAX-001');

INSERT INTO public.staff (staff_id, first_name, last_name, category_id)
VALUES ('b5000000-0000-4000-8000-000000000001', 'Base', 'Line', 'b0000000-0000-4000-8000-000000000001');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name)
VALUES ('be000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Baseline Engagement');

INSERT INTO public.engagement_assignments
  (assignment_id, engagement_id, staff_id, category_id, start_date, end_date)
VALUES
  ('ba000000-0000-4000-8000-000000000001', 'be000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31'),
  ('ba000000-0000-4000-8000-000000000002', 'be000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '2025-01-01', '2025-12-31');

-- ── 3. Prove the leak exists PRE-hardening (anon reads the view) ──────
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.vw_engagement_staffing_summary;
  IF n < 1 THEN
    RAISE EXCEPTION 'harness error: staffing view returned no rows pre-hardening (leak not reproduced)';
  END IF;
  RAISE NOTICE 'harness: anon reads % staffing-summary rows PRE-hardening (leak reproduced; D5 must close it)', n;
END $$;
ROLLBACK;

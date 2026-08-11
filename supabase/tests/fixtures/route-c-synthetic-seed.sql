-- Route C synthetic seed (bugs/scheduler/fase_2/plan_v2.md, Verification Steps §3).
--
-- Populates the scheduler-owned tables (wo_staffing_requirements,
-- wo_staffing_requirement_skills, engagement_assignments, skills, staff_skills) with data
-- representative of the live app, on top of the 80-migration checkpoint (72 base + 8
-- scheduler, via preseed-development-gaps.sh) — BEFORE development's 59 migrations are
-- copied in and pushed. Plan v2 asks for this explicitly so Ruta C exercises
-- development's backfills / NOT NULL enforcement / category convergence against
-- non-empty scheduler tables instead of a vacuous no-op on empty ones.
--
-- Run once, right after preseed-development-gaps.sh completes and BEFORE step 4
-- (copying development's 59 migrations + `supabase db push --include-all`).
--
-- Uses the base seed's stable identifiers (staff email, engagement_code) rather than
-- hardcoded UUIDs — every FK id here is generated at insert time by gen_random_uuid() in
-- the base migration (20251204045534), so this script re-derives them via SELECT.
-- Idempotent: safe to re-run against the same stack (ON CONFLICT / NOT EXISTS guards).

-- =====================================================================
-- 1. Skills taxonomy — created empty by 20260412073936; the scheduler's own
--    migrations never seed it.
-- =====================================================================
-- category is a stable code set (chk_skills_category_code, 20260412140000), not free
-- text — 'framework' for accounting standards, 'industry' for domain audit skills.
INSERT INTO public.skills (name, category) VALUES
  ('IFRS', 'framework'),
  ('Auditoría de Inventarios', 'industry')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 2. Staff-skill assignments for the staff used in the assignments below.
-- =====================================================================
INSERT INTO public.staff_skills (staff_id, skill_id, proficiency_level)
SELECT s.staff_id, k.skill_id, 'Advanced'
  FROM public.staff s, public.skills k
 WHERE s.email = 'lvargas@firm.com' AND k.name = 'IFRS'
ON CONFLICT (staff_id, skill_id) DO NOTHING;

INSERT INTO public.staff_skills (staff_id, skill_id, proficiency_level)
SELECT s.staff_id, k.skill_id, 'Intermediate'
  FROM public.staff s, public.skills k
 WHERE s.email = 'crojas@firm.com' AND k.name = 'Auditoría de Inventarios'
ON CONFLICT (staff_id, skill_id) DO NOTHING;

-- =====================================================================
-- 3. wo_staffing_requirements — on the base-seeded work order (MSC-2024-AUD,
--    approval_status default 'Draft'). One requirement per staff category used
--    below (Senior, Staff/Asistente — same category_id regardless of the §1.1
--    rename patch, since it only UPDATEs category_name, never the id).
-- =====================================================================
INSERT INTO public.wo_staffing_requirements (wo_id, category_id, staff_count)
SELECT wo.wo_id, cat.category_id, req.staff_count
  FROM public.work_orders wo
  JOIN public.engagements e  ON e.engagement_id = wo.engagement_id
  CROSS JOIN LATERAL (VALUES
    ('lvargas@firm.com', 2),
    ('crojas@firm.com',  3)
  ) AS req(staff_email, staff_count)
  JOIN public.staff s        ON s.email = req.staff_email
  JOIN public.categories cat ON cat.category_id = s.category_id
 WHERE e.engagement_code = 'MSC-2024-AUD'
ON CONFLICT (wo_id, category_id) DO NOTHING;

-- =====================================================================
-- 4. wo_staffing_requirement_skills — tie each requirement above to the
--    matching skill from step 1.
-- =====================================================================
INSERT INTO public.wo_staffing_requirement_skills (requirement_id, skill_id, min_proficiency_level)
SELECT r.id, k.skill_id, 'Advanced'
  FROM public.wo_staffing_requirements r
  JOIN public.work_orders wo   ON wo.wo_id = r.wo_id
  JOIN public.engagements e    ON e.engagement_id = wo.engagement_id
  JOIN public.categories cat   ON cat.category_id = r.category_id
  JOIN public.skills k         ON k.name = 'IFRS'
 WHERE e.engagement_code = 'MSC-2024-AUD'
   AND cat.category_id = (SELECT category_id FROM public.staff WHERE email = 'lvargas@firm.com')
ON CONFLICT (requirement_id, skill_id) DO NOTHING;

INSERT INTO public.wo_staffing_requirement_skills (requirement_id, skill_id, min_proficiency_level)
SELECT r.id, k.skill_id, 'Intermediate'
  FROM public.wo_staffing_requirements r
  JOIN public.work_orders wo   ON wo.wo_id = r.wo_id
  JOIN public.engagements e    ON e.engagement_id = wo.engagement_id
  JOIN public.categories cat   ON cat.category_id = r.category_id
  JOIN public.skills k         ON k.name = 'Auditoría de Inventarios'
 WHERE e.engagement_code = 'MSC-2024-AUD'
   AND cat.category_id = (SELECT category_id FROM public.staff WHERE email = 'crojas@firm.com')
ON CONFLICT (requirement_id, skill_id) DO NOTHING;

-- =====================================================================
-- 5. engagement_assignments — representative rows across both base-seeded
--    engagements. category_id mirrors the assigned staff's own category
--    (real client behavior), dates are non-overlapping per staff member,
--    status is omitted so the column DEFAULT ('PROPOSED') governs, matching
--    useEngagementAssignmentMutations.ts (G5 of plan_v2.md).
-- =====================================================================
INSERT INTO public.engagement_assignments
  (engagement_id, staff_id, category_id, start_date, end_date, hours_per_week, allocation_percent)
SELECT e.engagement_id, s.staff_id, s.category_id,
       a.start_date, a.end_date, a.hours_per_week, a.allocation_percent
  FROM public.engagements e
  CROSS JOIN LATERAL (VALUES
    ('MSC-2024-AUD', 'lvargas@firm.com', DATE '2026-08-01', DATE '2026-10-31', 30, 75),
    ('MSC-2024-AUD', 'crojas@firm.com',  DATE '2026-08-01', DATE '2026-10-31', 40, 100),
    ('BNB-2024-TAX', 'dflores@firm.com', DATE '2026-09-01', DATE '2026-11-30', 20, 50),
    ('BNB-2024-TAX', 'agutierrez@firm.com', DATE '2026-09-01', DATE '2026-09-30', 10, 25)
  ) AS a(engagement_code, staff_email, start_date, end_date, hours_per_week, allocation_percent)
  JOIN public.staff s ON s.email = a.staff_email
 WHERE e.engagement_code = a.engagement_code
   AND NOT EXISTS (
     SELECT 1 FROM public.engagement_assignments ea
      WHERE ea.engagement_id = e.engagement_id
        AND ea.staff_id = s.staff_id
        AND ea.start_date = a.start_date
   );

-- =====================================================================
-- 6. Verification (informational — does not fail the seed).
-- =====================================================================
DO $$
DECLARE
  v_req integer; v_req_skills integer; v_assignments integer;
BEGIN
  SELECT count(*) INTO v_req FROM public.wo_staffing_requirements;
  SELECT count(*) INTO v_req_skills FROM public.wo_staffing_requirement_skills;
  SELECT count(*) INTO v_assignments FROM public.engagement_assignments;
  RAISE NOTICE 'Route C synthetic seed: % wo_staffing_requirements, % wo_staffing_requirement_skills, % engagement_assignments',
    v_req, v_req_skills, v_assignments;
END $$;

-- Phase 5 harness shim — minimal timesheet surface for the RPC guard.
-- Idempotent; additive only; never applied outside the disposable test DB.

-- categories: 00-shim already defines display_order (L36 — nullable,
-- DEFAULT 0; the Phase 5 suite's fixtures MUST set it explicitly on both
-- submitter and approver categories). Only the approver flag is missing:
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS can_approve_timesheets boolean NOT NULL DEFAULT false;

-- timesheet_periods: minimal — the Phase 5 RPC's approver-arm evidence
-- conjunct binds to the period for (staff, week) so disclosure is limited to
-- the rendered approval dataset (PR #224 P1-01). Live has more columns; only
-- (period_id, staff_id, week_start_date) are read here.
CREATE TABLE IF NOT EXISTS public.timesheet_periods (
  period_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        uuid NOT NULL REFERENCES public.staff(staff_id),
  week_start_date date NOT NULL
);
GRANT ALL ON public.timesheet_periods TO anon, authenticated, service_role;

-- time_entries: minimal — just what get_timesheet_approvers and the Phase 5
-- RPC's approver-arm evidence conjunct read. PK name matches live (time_id);
-- period_id + is_forecast mirror the live columns the evidence guard now binds
-- to (PR #224 P1-01); live's activity_id NOT NULL + five BEFORE triggers are
-- deliberately omitted — which is why the Phase 5 suite is harness-only (§2.2
-- convention delta 2 in the plan).
CREATE TABLE IF NOT EXISTS public.time_entries (
  time_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES public.staff(staff_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements(engagement_id),
  date_worked   date NOT NULL,
  hours_logged  numeric NOT NULL DEFAULT 0,
  period_id     uuid REFERENCES public.timesheet_periods(period_id),
  is_forecast   boolean NOT NULL DEFAULT false
);
-- Additive upgrade for a persistent scratch cluster where an older shape of
-- the table may already exist (the runner drops the DB each run, so this is a
-- belt-and-suspenders no-op on a fresh DB).
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.timesheet_periods(period_id);
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS is_forecast boolean NOT NULL DEFAULT false;
-- Permissive PostgREST-style grants, matching the shim's convention.
GRANT ALL ON public.time_entries TO anon, authenticated, service_role;

-- get_timesheet_approvers — copied VERBATIM from the applied migration
-- supabase/migrations/20251208004900_08e21236-2dd4-4158-8721-e4e21abd519f.sql
-- (repo-canonical applied SQL; cross-check docs/database-schema.sql:582–627,
-- a hand-maintained mirror, agrees). Do not restyle; the guard must exercise
-- the real display_order + can_approve_timesheets logic, including the
-- sliding [p_week_start, +7 days) window.
CREATE OR REPLACE FUNCTION public.get_timesheet_approvers(p_staff_id uuid, p_week_start date)
 RETURNS TABLE(approver_staff_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_submitter_display_order INTEGER;
BEGIN
  -- Get the submitter's display_order
  SELECT c.display_order INTO v_submitter_display_order
  FROM staff s
  JOIN categories c ON s.category_id = c.category_id
  WHERE s.staff_id = p_staff_id;

  -- If submitter has no category or display_order, return empty
  IF v_submitter_display_order IS NULL THEN
    RETURN;
  END IF;

  -- Return approvers from engagements where staff logged time that week
  -- Approvers must have LOWER display_order (higher rank) and not be self
  RETURN QUERY
  SELECT DISTINCT potential_approver.staff_id
  FROM (
    -- Get manager_id from engagements where staff logged time
    SELECT e.manager_id AS staff_id
    FROM time_entries te
    JOIN engagements e ON te.engagement_id = e.engagement_id
    WHERE te.staff_id = p_staff_id
      AND te.date_worked >= p_week_start
      AND te.date_worked < p_week_start + INTERVAL '7 days'
      AND e.manager_id IS NOT NULL
    
    UNION
    
    -- Get partner_id from engagements where staff logged time
    SELECT e.partner_id AS staff_id
    FROM time_entries te
    JOIN engagements e ON te.engagement_id = e.engagement_id
    WHERE te.staff_id = p_staff_id
      AND te.date_worked >= p_week_start
      AND te.date_worked < p_week_start + INTERVAL '7 days'
      AND e.partner_id IS NOT NULL
    
    -- NOTE: supervisor_id fallback removed - approvers now come ONLY from engagement team
  ) potential_approver
  JOIN staff approver_s ON potential_approver.staff_id = approver_s.staff_id
  JOIN categories approver_c ON approver_s.category_id = approver_c.category_id
  WHERE potential_approver.staff_id != p_staff_id  -- No self-approval
    AND approver_c.display_order < v_submitter_display_order  -- Must be higher rank
    AND approver_c.can_approve_timesheets = true;  -- Must have permission
END;
$function$;

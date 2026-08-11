-- =============================================================================
-- Scheduler Phase 5 — timesheet authorization advisory helper.
-- Plan: docs/plans/scheduler-phase-5-timesheet-authorization.md (Plan v2, rev. 5).
--
-- ONE SECURITY DEFINER function. No table changes, no policy changes, no
-- index changes. The D5 RLS matrix on engagement_assignments
-- (20260717233000_engagement_assignments_d5_rls.sql) is untouched;
-- can_read_engagement_assignments remains the exact disjunction of the three
-- board-read SELECT policies (PR #222 P1 invariant) and is not called here at
-- all (rev. 2 dropped the point probe, D5-4).
-- Ordering: must run AFTER 20260716120000 (table shape + indexes) and AFTER
-- 20260717233000 (has_firmwide_assignment_visibility, is_engagement_team_member).
-- Also calls the pre-scheduler get_timesheet_approvers(uuid, date).
--
-- §A get_staff_assignment_segments — the grids' sole batch data path (D5-1).
--    Viewer-level admit/deny (D5-2); deny RAISEs 'EA_SEGMENTS_DENIED' so clients
--    can distinguish "denied" (-> render no warnings, fail-open) from "no
--    segments" (-> flag cells). A silent empty result on denial would
--    false-flag every cell for exactly the viewers D5 excludes.
--      (1) caller IS the staff member (any app_role — D5 denies semisenior/
--          staff/no-role their own rows; this is the Phase 5 self path), OR
--      (2) firmwide visibility (admin/partner/director), OR
--      (3) caller is an eligible timesheet approver for (staff, week) per
--          get_timesheet_approvers — categories-model (display_order +
--          can_approve_timesheets), app_role-independent: heals the
--          categories-vs-user_roles disjunction for structural leads (D5-3).
--    The RETURN is per-engagement scoped for the approver arm (PR #223 P1-01,
--    rev.3): self/firmwide see the full staff-week; an approver sees ONLY
--    engagements they lead (is_engagement_team_member — the exact time_entries
--    team-read set, migration 20260107032620:54-70) AND on which the target
--    logged POSITIVE hours inside the REQUESTED [p_week_start, p_week_end]
--    interval (bounded by p_week_end, not the +7d eligibility window, so a
--    Sat/Sun entry cannot authorize a Mon-Fri window; hours_logged > 0 matches
--    the UI's hours>0 flag) — i.e. exactly the rendered approval-grid cells.
--    This closes the staff-wide oracle (rev.1), the entry-less led-engagement
--    residual (rev.2), and the partial-week / zero-hour escapes (rev.3).
--    EVERY returned endpoint is CLAMPED to the probed week
--    (GREATEST(start,p_week_start)/LEAST(end,p_week_end)) so a Jan-Dec segment
--    probed through one July week never discloses Jan/Dec — for all arms.
--    Returns ONLY (engagement_id, start_date, end_date) — no
--    allocation_percent / hours_per_week / notes / status (privacy narrowing,
--    cf. scheduler-staff-load). Span capped at one timesheet week (<= 6 days)
--    AND p_week_start pinned to the canonical Monday (ISODOW = 1):
--    get_timesheet_approvers' entry window is a sliding
--    [p_week_start, +7 days) with no normalization, so unaligned starts would
--    let an approver slide a ±6-day halo around any logged day. Together the
--    caps block range harvesting (D5-2).
--
-- §C least-privilege EXECUTE — D5 §C idiom verbatim.
--
-- SECURITY DEFINER + postgres ownership is the same anti-recursion mechanism
-- as the D5 helpers (owner is RLS-exempt; table is not FORCE RLS). Probe
-- shape uses idx_eng_assign_staff_dates_active (Phase 3 migration §G
-- covenant: "Phases 4 (Gantt) and 5 (timesheet authorization) rely on these
-- and add no further indexes.").
--
-- Idempotent (CREATE OR REPLACE / guarded DO blocks) so re-runs are safe;
-- the RLS harness applies this file twice to prove it.
-- =============================================================================

-- §A. Batch segment fetch — the grids' sole data path.
CREATE OR REPLACE FUNCTION public.get_staff_assignment_segments(
  p_staff_id   uuid,
  p_week_start date,
  p_week_end   date
)
RETURNS TABLE (engagement_id uuid, start_date date, end_date date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_staff_id uuid := public.get_my_staff_id();
  v_is_self      boolean;
  v_is_firmwide  boolean;
  v_is_approver  boolean;
  v_authorized   boolean;
BEGIN
  IF p_staff_id IS NULL OR p_week_start IS NULL OR p_week_end IS NULL
     OR p_week_end < p_week_start
     OR (p_week_end - p_week_start) > 6              -- one timesheet week max
     OR EXTRACT(ISODOW FROM p_week_start) <> 1 THEN  -- canonical Monday only (D5-2 halo gate)
    RAISE EXCEPTION 'EA_SEGMENTS_INVALID_RANGE';
  END IF;

  v_is_self     := (v_caller_staff_id IS NOT NULL AND p_staff_id = v_caller_staff_id);   -- (1)
  v_is_firmwide := public.has_firmwide_assignment_visibility();                          -- (2)
  v_is_approver := EXISTS (                                                              -- (3)
    SELECT 1
    FROM public.get_timesheet_approvers(p_staff_id, p_week_start) g
    WHERE g.approver_staff_id = v_caller_staff_id
  );
  v_authorized := v_is_self OR v_is_firmwide OR v_is_approver;

  -- NULL-safe deny (Greptile r3607763303): anything that is not TRUE is denied.
  IF v_authorized IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'EA_SEGMENTS_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    ea.engagement_id,
    GREATEST(ea.start_date, p_week_start)::date AS start_date,  -- clamp to the requested week:
    LEAST(ea.end_date,   p_week_end)::date      AS end_date     -- never disclose out-of-week endpoints
  FROM public.engagement_assignments ea
  WHERE ea.staff_id = p_staff_id
    AND ea.deleted_at IS NULL
    AND ea.start_date <= p_week_end       -- overlap probe; uses
    AND ea.end_date   >= p_week_start     -- idx_eng_assign_staff_dates_active
    AND (
          v_is_self
          OR v_is_firmwide
          -- Approver arm (minimum-necessary): return an engagement's window ONLY
          -- when the caller leads it AND the target logged POSITIVE hours on it
          -- inside the REQUESTED [p_week_start, p_week_end] interval — i.e. a cell
          -- the approver actually renders. Three guards, each closing a distinct
          -- escape:
          --   * is_engagement_team_member (== the time_entries team SELECT policy,
          --     migration 20260107032620:54-70) — bounds disclosure to engagements
          --     whose hours the approver already reads; excludes UNLED engagements.
          --   * date_worked <= p_week_end (the REQUESTED end, NOT +7 days) — with a
          --     Friday p_week_end a Sat/Sun entry must NOT authorize a Mon-Fri
          --     window; the evidence window equals the rendered interval
          --     (PR #223 rev.3 P1-01). Adapts automatically to 5- or 6-day config.
          --   * hours_logged > 0 — matches the UI's hours>0 flag, so a zero-hour
          --     row (schema allows CHECK hours_logged >= 0) can neither authorize
          --     nor return a window (PR #223 rev.3 P2-03).
          --   * is_forecast = false — the evidence must be ACTUAL logged time, the
          --     same set the whole authorization domain uses: submit_timesheet_safe
          --     (schema :1133/:1147/:1205), the self grid (useTimesheetWeek :126),
          --     and every dashboard read all filter is_forecast = false. A forecast
          --     PLAN is not logged work and must never disclose a segment boundary
          --     (PR #224 P1-01).
          --   * period_id IN (the timesheet_period for this staff+week) — binds the
          --     evidence to EXACTLY the rendered approval dataset, which the approval
          --     detail fetches with `.eq("period_id", periodId)`
          --     (useTimesheetApprovals :299). date_worked-in-week alone let an
          --     actual entry ORPHANED from the viewed period (in-week date, wrong/NULL
          --     period_id) disclose a segment for an engagement absent from the grid.
          --     The client passes the viewed period's week_start_date as p_week_start,
          --     so the canonical period here == the rendered period; a missing period
          --     yields no match (fail-closed) (PR #224 P1-01).
          -- get_timesheet_approvers stays the TOP-LEVEL staff-week eligibility gate
          -- (it may admit via a Sat/Sun, zero-hour, forecast, or wrong-period entry —
          -- that only decides whether the caller may ASK; the RETURN above discloses
          -- nothing beyond the rendered, positive-hours, actual, in-period cells).
          -- Excludes entry-less led engagements (rev.2 P1-01), out-of-interval / zero-
          -- hour rows (rev.3), and forecast / orphan-period rows (PR #224).
          OR (
               public.is_engagement_team_member(ea.engagement_id)
               AND EXISTS (
                 SELECT 1
                 FROM public.time_entries te
                 WHERE te.staff_id      = p_staff_id
                   AND te.engagement_id = ea.engagement_id
                   AND te.date_worked  >= p_week_start
                   AND te.date_worked  <= p_week_end     -- requested interval, not +7d (P1-01)
                   AND te.hours_logged  > 0              -- match UI hours>0 flag (P2-03)
                   AND te.is_forecast   = false          -- actuals only (PR #224 P1-01)
                   AND te.period_id IN (                 -- belongs to the rendered approval period
                     SELECT tp.period_id
                     FROM public.timesheet_periods tp
                     WHERE tp.staff_id = p_staff_id
                       AND tp.week_start_date = p_week_start
                   )
               )
             )
        )
  ORDER BY ea.engagement_id, ea.start_date;
END;
$$;

COMMENT ON FUNCTION public.get_staff_assignment_segments(uuid, date, date) IS
  'Phase 5 advisory: active assignment segments for one staff member across one timesheet week. Admit: self OR firmwide (admin/partner/director) OR eligible timesheet approver for (staff, week) per get_timesheet_approvers; deny raises EA_SEGMENTS_DENIED (never a silent empty result). RETURN scoped per-engagement for the approver arm to engagements the caller leads (is_engagement_team_member) AND on which the target logged POSITIVE, NON-FORECAST hours inside the REQUESTED [p_week_start, p_week_end] interval AND in the timesheet_period for (staff, p_week_start) — exactly the rendered approval-grid cells (which the detail fetches by period_id), nothing more — with endpoints clamped to the probed week for all arms; success + zero rows = authoritatively unassigned. Returns only (engagement_id, start_date, end_date). Span capped at 6 days; p_week_start must be the canonical Monday (ISODOW = 1).';

-- §C. Least-privilege EXECUTE — copied from the D5 §C idiom verbatim.
-- Supabase grants EXECUTE on new functions DIRECTLY to anon/authenticated/
-- service_role (survives a PUBLIC-only revoke; the RLS-harness shim models
-- this via ALTER DEFAULT PRIVILEGES, so a PUBLIC-only revoke FAILS the ACL
-- assertions). The helper is called by authenticated clients only, so that is
-- the sole grantee. service_role is revoked deliberately: edge functions
-- using the service key bypass RLS and can read the table directly — they
-- never need this helper.
REVOKE EXECUTE ON FUNCTION public.get_staff_assignment_segments(uuid, date, date) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'service_role'] LOOP
    IF to_regrole(r) IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.get_staff_assignment_segments(uuid, date, date) FROM %I',
      r
    );
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.get_staff_assignment_segments(uuid, date, date) TO authenticated;

# Scheduler — Objective and Scope

> **Read this first.** Any Claude Code session working on the Scheduler feature
> (branch `sruizmier-scheduler-v2` or its descendants) should read this file
> before proposing plans or writing code. The recent changelog index
> (`docs/changelogs/`) references this document — if you find yourself asking
> "what is the Scheduler for?", the answer is below.

## What the Scheduler is

The Scheduler is a cross-cutting tool in the EMS that answers two questions
at any point in time:

1. **Who is working on which engagements?** — firm-wide visibility into
   current and historical staffing across every active engagement.
2. **Is every logged timesheet hour authorized?** — an alert fires when a
   staff member logs time on an engagement they are not assigned to. The
   alert is visible to both the staff member (in their own timesheet
   grid) and to the timesheet approver (in `ApprovalTimesheetGrid.tsx`).

The Scheduler also **suggests** qualified candidates when a user is
assigning staff to a work order, by matching the staff member's recorded
competencies (`staff_skills`, shipped in Phase 1) against the work order's
stated staffing requirements (Phase 2, next).

## Guiding principles

- **Suggest, never block.** The Scheduler proposes matches and warns on
  mismatches. It does not prevent an assignment, a timesheet submission,
  or an approval. The scheduler user may knowingly assign a staff who
  does not hold the required competencies; the system only warns. The
  approver may still approve a timesheet entry that the Scheduler has
  flagged as unauthorized.
- **Minimum-proficiency semantics.** When a work order states a required
  skill at a level (e.g. "IFRS — Intermediate"), that level is interpreted
  as a **minimum (≥)**. Staff at Intermediate and Advanced both match;
  Beginner does not. There is no "exact match required" mode.
- **Work-order is the source of truth for staffing requirements.** Number
  of staff per category and desired competencies per category are captured
  on the work order by whoever creates or edits it (admin, partner,
  manager). Engagement-level totals are derived from the sum of the
  engagement's work orders, not entered separately.
- **Competency data already exists per staff.** Phase 1 shipped the
  `skills` catalog and `staff_skills` per-staff competencies (with
  proficiency level and HR evaluation date). Phase 2 and later phases
  build on that foundation — do not duplicate it.

## Core features (by phase)

| Phase | Status | Deliverable |
|-------|--------|-------------|
| 1 | Shipped (2026-04-12 / 04-19) | `skills` catalog table; `staff_skills` junction table with proficiency + HR evaluation date; Settings → Skills admin tab; competency assignment grid on Staff Add/Edit forms with Excel-like styling |
| 2 | Planned next | **Work-order staffing requirements**: per work order, per staff category (Senior, Manager, etc.), how many staff are needed and which competencies are desired (with minimum proficiency). UI lives on the work-order detail page. See `docs/plans/scheduler-phase-2-staffing-requirements.md`. |
| 3 | Not started | **Staff ↔ engagement assignments**: new table recording who is assigned to each engagement, in what category, for what date range. Assignment UI surfaces candidate matches based on Phase-1 competencies and Phase-2 requirements, and visually flags mismatches without blocking. |
| 4 | Not started | **Timesheet authorization alert**: in both the staff-facing timesheet grid (`TimesheetGrid.tsx`) and the approver's `ApprovalTimesheetGrid.tsx`, flag entries logged on engagements where the staff is not currently assigned. Non-blocking — the approver may still approve; the staff may still submit. |
| 5 | Not started | **Competency-gap reporting**: aggregate view of which competencies are under-supplied relative to cumulative work-order demand across the firm, to inform hiring and training. |

## Non-goals

- **Blocking.** The Scheduler never blocks an assignment, a timesheet
  submission, or an approval based on a competency or assignment
  mismatch. It only warns. If you find yourself adding a hard
  validation that prevents a save, you have stepped outside the
  Scheduler's scope.
- **Replacing timesheet capacity enforcement.** The existing weekly
  min/max-hours logic (`getEffectiveWeeklyLimits` in
  `src/lib/timesheetUtils.ts` and the `submit_timesheet_safe` RPC)
  stays as-is. The Scheduler's alert is about **authorization** (is
  this staff assigned to this engagement?), not **capacity** (has this
  staff exceeded their weekly hours?). The two systems coexist.
- **Replacing the approval workflow.** Approvers continue to approve
  timesheet-by-timesheet via the existing flow
  (`useTimesheetApprovals.ts`, `ApprovalTimesheetGrid.tsx`). The
  Scheduler only adds a warning badge alongside flagged entries.
- **Auto-assigning staff.** The Scheduler proposes candidates; a human
  always picks. There is no "auto-fill" button planned.

## Data-model anchors

- **Already exists (Phase 1):**
  - `public.skills` — admin-managed taxonomy.
  - `public.staff_skills` — per-staff competencies with
    `proficiency_level` (`Beginner | Intermediate | Advanced`) and
    `last_evaluated_date`.
  - See `supabase/migrations/20260412073936_*.sql` and
    `docs/changelogs/CHANGELOG-2026-04-12.md`.
- **Planned (Phase 2):**
  - `public.wo_staffing_requirements` — one row per work-order × staff
    category, with `staff_count`.
  - `public.wo_staffing_requirement_skills` — junction listing the
    competencies desired for each requirement, with minimum
    `proficiency_level`.
- **Planned (Phase 3):**
  - `public.engagement_staff_assignments` — per engagement, per staff,
    per category, with `start_date` and `end_date`. Joins to
    `time_entries` by `(staff_id, engagement_id)` to power the Phase-4
    alert.
- **Reused, no schema change:**
  - `public.time_entries` (`staff_id`, `engagement_id`, `date_worked`)
    is the join key for the Phase-4 authorization alert.
  - `public.work_orders` and `public.engagements` are unchanged.

## Who does what in the UI

| Role | Ability |
|------|---------|
| Admin | Full manage on every Scheduler entity (requirements, assignments, alerts). |
| Engagement partner / manager (`is_engagement_team_member()`) | Create and edit work-order staffing requirements for their own engagements; create and edit staff assignments for their own engagements. |
| Other authenticated users | Read-only view of requirements and assignments. |

RLS policies follow the existing `work_orders` pattern — see
`docs/database-schema.sql:2274-2286` for the canonical shape (admin
manage-all combined with `is_engagement_team_member()` writes).

## For future Claude Code sessions

If you are reading this because you were asked to "check the latest
changelogs" on the `sruizmier-scheduler-v2` branch, then after reading
the most recent files in `docs/changelogs/` you should also open
`docs/plans/scheduler-phase-2-staffing-requirements.md` to see the next
concrete chunk of work. **Do not restart the scoping conversation from
scratch** — the direction is set, and the user has already approved the
phasing above. New questions are welcome; rewording the same five phases
into a different five is not.

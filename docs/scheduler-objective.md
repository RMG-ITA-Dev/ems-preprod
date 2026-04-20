# Scheduler — Objective and Scope

> **Read this first.** Any Claude Code session working on the Scheduler feature
> (branch `sruizmier-scheduler-v2` or its descendants) should read this file
> before proposing plans, writing code, redesigning UI, or re-scoping the
> feature. The recent changelog index (`docs/changelogs/`) references this
> document. If you find yourself asking "what is the Scheduler for?" or
> "what should the main UI be?", the answer is below.
>
> **Important:** before implementing Scheduler UI, also read the relevant
> Ruizmier design-system / UI/UX `.md` files (colors, density, spacing,
> typography, components, interaction rules). The Scheduler must look and
> feel like a native Ruizmier system module, not like a generic third-party
> project-management screen.

## What the Scheduler is

The Scheduler is a **cross-cutting, time-based staffing coordination,
visibility, and control tool** inside EMS.

It is not primarily a form, not primarily a table, and not primarily a
matching engine. Its main operational surface should be a **two-level
Gantt-based interface** supported by structured staffing requirements,
structured staff competencies, formal assignment records, and non-blocking
warning logic.

At a business level, the Scheduler exists to answer four core questions:

1. **What engagements are active across time, and what is their staffing situation?**
2. **Which staff are assigned to a given engagement, and over what periods?**
3. **Are staffing decisions aligned with the desired competency requirements of the work?**
4. **Is every logged timesheet hour authorized?** — i.e., is the staff member
   logging time actually assigned to that engagement during the relevant period?

The Scheduler is therefore both:

- an **operational visibility tool**, and
- a **control-support tool**

It is meant to improve staffing clarity, staffing judgment, and staffing
oversight without replacing human managerial discretion.

### Main interface model: two-level Gantt

The main operational interface of the Scheduler shall be a **two-level
Gantt system**.

#### Level 1 — Firmwide operational view

At the first level, the **rows are Engagements**.

This is the high-level operational view of the firm’s work across time.
It should allow leadership to see the engagement portfolio over the
timeline and understand the staffing situation at an engagement level
before drilling into details.

**Visibility rules at Level 1:**

- **Partners and Directors** have broad firmwide operational visibility.
- **Managers and In-Charge Seniors** may use this level, but only for the
  engagements they manage, lead, or are responsible for.
- This level is not intended to expose unrestricted firmwide visibility
  to all users.

When the user clicks on an Engagement in Level 1, the system should drill
into that engagement and open Level 2.

#### Level 2 — Engagement staffing view

At the second level, the **rows are Staff**.

This view is the engagement-level staffing board. It should show which
staff are assigned to the selected engagement, during which periods, and
with what level of overall load across the firm.

This is the practical day-to-day staffing surface where engagement
leadership can understand team composition and staffing pressure over time.

### Load and role color logic

The Scheduler should use **subtle, Ruizmier-aligned colors**. Colors must
not be bright, loud, or overly saturated. They must preserve the existing
Ruizmier UI/UX identity.

#### Regular staff load indication

For regular staff in the Level-2 engagement staffing view, color should
indicate how many engagements the person is assigned to:

- **Green**: assigned to **1 engagement**
- **Yellow**: assigned to **2 or 3 engagements**
- **Red**: assigned to **4 or more engagements**

These must be implemented as muted, elegant Ruizmier-compatible tones,
not as harsh traffic-light colors.

#### Leadership role identity colors

Certain leadership roles should **not** use load-indication colors.

Instead:

- **In-Charge Seniors and Managers** use **Ruizmier Purple**
- **Directors and Partners** use **Ruizmier Teal**

For these roles, color indicates role identity, not staffing load.

---

## Guiding principles

- **Suggest, never block.** The Scheduler proposes matches and warns on
  mismatches. It does not prevent an assignment, a timesheet submission,
  or an approval. A scheduler user may knowingly assign a staff member
  who does not fully meet the desired competencies; the system only warns.
  Likewise, the approver may still approve a timesheet entry that the
  Scheduler has flagged as unauthorized.
- **Minimum-proficiency semantics.** When a work order states a required
  skill at a level (for example, "IFRS — Intermediate"), that level is
  interpreted as a **minimum (≥)**. Staff at Intermediate and Advanced
  both match. Beginner does not. There is no "exact match required" mode.
- **Work-order is the source of truth for staffing requirements.** Number
  of staff per category and desired competencies per category are captured
  on the work order by whoever creates or edits it (admin, partner,
  manager). Engagement-level staffing expectations are derived from the
  engagement’s work orders, not entered separately as a competing source.
- **Work-order requirements are setup data, not the main interface.**
  Work-order staffing requirements are essential, but they are not the
  center of the user experience. They define what the work needs. The
  Gantt is the main operational surface.
- **Competency data already exists per staff.** Phase 1 shipped the
  `skills` catalog and `staff_skills` per-staff competencies (with
  proficiency level and HR evaluation date). Phase 2 and later phases
  build on that foundation — do not duplicate it.
- **Assignment records are the operational truth for the Gantt.** The
  Gantt should be powered by explicit staff-to-engagement assignment
  records over time. Without them, the Gantt is only a visual shell.
- **The Scheduler supports judgment; it does not replace judgment.**
  The Scheduler should improve decision quality and operational clarity,
  not override partner, director, manager, or in-charge judgment with
  rigid automation.
- **The UI must remain Ruizmier-native.** Do not invent colors,
  interaction patterns, spacing, density, or component behavior in
  isolation. Review the relevant Ruizmier UI/UX `.md` files before
  implementing Scheduler screens.

## Core features (by phase)

| Phase | Status | Deliverable |
|-------|--------|-------------|
| 1 | Shipped (2026-04-12 / 04-19) | `skills` catalog table; `staff_skills` junction table with proficiency + HR evaluation date; Settings → Skills admin tab; competency assignment grid on Staff Add/Edit forms with Excel-like styling |
| 2 | Planned next | **Work-order staffing requirements**: per work order, per staff category (Senior, Manager, etc.), how many staff are needed and which competencies are desired (with minimum proficiency). UI lives on the work-order detail page. This is setup data that will later feed assignment and Gantt logic. See `docs/plans/scheduler-phase-2-staffing-requirements.md`. |
| 3 | Not started | **Staff ↔ engagement assignments**: new table recording who is assigned to each engagement, in what category, for what date range. This is the core operational truth behind the Gantt. Assignment UI later surfaces candidate matches based on Phase-1 competencies and Phase-2 requirements, and visually flags mismatches without blocking. |
| 4 | Not started | **Two-level Gantt UI**: main Scheduler interface. Level 1 = engagements as rows, role-filtered visibility by user type. Level 2 = staff as rows for a selected engagement, with muted Ruizmier-aligned load / role color logic. |
| 5 | Not started | **Timesheet authorization alert and warning overlays**: in both the staff-facing timesheet grid (`TimesheetGrid.tsx`) and the approver’s `ApprovalTimesheetGrid.tsx`, flag entries logged on engagements where the staff is not currently assigned during that period. Also support other non-blocking operational warnings such as competency mismatch overlays. |
| 6 | Not started | **Competency-gap and staffing-gap reporting**: aggregate view of which competencies or staffing categories are under-supplied relative to cumulative work-order demand across the firm, to inform hiring, training, and resource planning. |

## Non-goals

- **Blocking.** The Scheduler never blocks an assignment, a timesheet
  submission, or an approval based on a competency or assignment
  mismatch. It only warns. If you find yourself adding a hard
  validation that prevents a save, you have stepped outside the
  Scheduler’s scope.
- **Replacing timesheet capacity enforcement.** The existing weekly
  min/max-hours logic (`getEffectiveWeeklyLimits` in
  `src/lib/timesheetUtils.ts` and the `submit_timesheet_safe` RPC)
  stays as-is. The Scheduler’s alert is about **authorization** (is
  this staff assigned to this engagement during this period?), not
  **capacity** (has this staff exceeded their weekly hours?). The two
  systems coexist.
- **Replacing the approval workflow.** Approvers continue to approve
  timesheet-by-timesheet via the existing flow
  (`useTimesheetApprovals.ts`, `ApprovalTimesheetGrid.tsx`). The
  Scheduler only adds warning signals alongside flagged entries.
- **Auto-assigning staff.** The Scheduler may propose candidates, rank
  likely matches, or highlight mismatches. A human still decides. There
  is no "auto-fill the team" button planned.
- **Becoming a generic project-management tool.** The Scheduler is a
  staffing coordination and control system for EMS, not a generic task
  or milestone tracker.
- **Reducing the feature to forms.** Staffing requirements forms are
  necessary, but they are not the main interface. The Gantt is the
  main operational surface.

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
    per category, with `start_date` and `end_date`. This table powers
    the Gantt and joins to `time_entries` by `(staff_id, engagement_id)`
    to support the timesheet authorization alert.
- **Reused, no schema change:**
  - `public.time_entries` (`staff_id`, `engagement_id`, `date_worked`)
    is the join key for the Phase-5 authorization alert.
  - `public.work_orders` and `public.engagements` remain the existing
    business anchors. Work orders define staffing demand; engagements
    define the parent business unit over which staffing is visualized.

## Who does what in the UI

| Role | Ability |
|------|---------|
| Admin | Full manage on every Scheduler entity (requirements, assignments, alerts, all operational views). |
| Partner / Director | Broad operational visibility at Level 1 across the engagement portfolio; visibility into Level 2 for selected engagements; manage Scheduler entities according to broader authority rules. |
| Engagement partner / manager / In-Charge Senior (`is_engagement_team_member()` or future equivalent role rule) | Create and edit work-order staffing requirements for their own engagements; create and edit staff assignments for their own engagements; use the Level-1 view only for the engagements they manage / lead; drill into Level 2 for those engagements. |
| Other authenticated users | No unrestricted firmwide operational view by default. Read-only access to requirements / assignments only where explicitly allowed by future policy design. |

RLS policies should follow the existing `work_orders` pattern where
appropriate — see `docs/database-schema.sql:2274-2286` for the canonical
shape (admin manage-all combined with `is_engagement_team_member()`
writes) — but future Scheduler-specific visibility rules must also
respect the two-level Gantt model and the narrower visibility of
Managers and In-Charge Seniors at Level 1.

## For future Claude Code sessions

If you are reading this because you were asked to "check the latest
changelogs" on the `sruizmier-scheduler-v2` branch, then after reading
the most recent files in `docs/changelogs/` you should also open:

- `docs/plans/scheduler-phase-2-staffing-requirements.md`
- this file (`docs/scheduler-objective.md`)
- the relevant Ruizmier UI/UX / design-system `.md` files

**Do not restart the scoping conversation from scratch.** The direction
is set:

- the Scheduler is Gantt-centered
- the Gantt has two levels
- Level 1 rows are Engagements
- Level 2 rows are Staff
- work-order requirements are setup data
- assignment records power the Gantt
- competency and authorization logic are advisory, not blocking
- the UI must remain consistent with the Ruizmier design system

New implementation questions are welcome. Reframing the Scheduler into a
different kind of feature without a deliberate product decision is not.

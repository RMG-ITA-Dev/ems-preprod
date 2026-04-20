# Changelog — 2026-04-20

## Scheduler Documentation Set

Documentation-only session. No code, schema, or UI changes were made.
Two reference documents were added so that future Claude Code sessions
working on the Scheduler feature can pick up the intent and the next
concrete step without re-running the scoping conversation.

### New files

| File | Purpose |
|---|---|
| `docs/scheduler-objective.md` | **Canonical description of the Scheduler feature's purpose, guiding principles, phases, and non-goals.** Future Claude Code sessions working on the `sruizmier-scheduler-v2` branch should read this file first, alongside the latest changelogs, to orient without re-running the scoping conversation. Covers what the Scheduler is (assignment visibility + timesheet authorization alert + match suggestions), the core principle that it suggests but never blocks, the minimum-proficiency semantics for skill matching, the five-phase build plan, the data-model anchors, and the role/RLS model. |
| `docs/plans/scheduler-phase-2-staffing-requirements.md` | Detailed implementation plan for **Phase 2 — Work-Order Staffing Requirements**. Specifies the two new tables (`wo_staffing_requirements` and `wo_staffing_requirement_skills`), the new query hook (`useWorkOrderStaffingRequirements`) and the six mutations in a new `useWorkOrderStaffingMutations.ts`, the UI changes on `src/pages/WorkOrderEdit.tsx` (Excel-like grid mirroring `StaffForm.tsx:786-959`, final-state diff sync mirroring `StaffForm.tsx:408-445`), the RLS shape (mirror `work_orders`), the i18n keys to add, and the verification walk. |

### For future sessions

**When asked to "check the latest changelogs" on the
`sruizmier-scheduler-v2` branch, also read
`docs/scheduler-objective.md`.** That file is the durable source of
truth for what the Scheduler is trying to accomplish. The per-phase
plans in `docs/plans/` are the concrete next steps; `Phase 2 —
Work-Order Staffing Requirements` is queued and approved for
implementation.

### Phase-1 recap (already shipped)

- `public.skills` catalog table with admin CRUD UI in Settings →
  Skills (changelogs `2026-04-12`).
- `public.staff_skills` junction with proficiency level (Beginner /
  Intermediate / Advanced) and HR evaluation date.
- Excel-like competency assignment grid on Staff Add/Edit forms with
  full diff-sync, duplicate guards at three layers, and Spanish
  Talento Humano terminology (changelogs `2026-04-19`).

### Phase-2 summary (next implementation session)

Per work order, capture how many staff of each category are needed and
which competencies are desired (with minimum proficiency). The
Scheduler will later use this to suggest qualified candidates during
assignment (Phase 3) and to flag firm-wide gaps (Phase 5) — but never
to block assignments or timesheet entries. See the plan file for
table definitions, hook signatures, and the verification walk.

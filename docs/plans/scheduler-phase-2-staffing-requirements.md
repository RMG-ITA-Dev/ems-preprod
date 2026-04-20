# Phase 2 — Work-Order Staffing Requirements

> **Prerequisites.** Read `docs/scheduler-objective.md` first for the overall
> Scheduler vision and non-goals. This file specifies the next concrete chunk
> of work on top of Phase 1 (`skills` + `staff_skills`, shipped 2026-04-12 /
> 04-19).

## Goal

Let whoever creates or edits a work order capture, per staff category, **how
many staff are needed** and **which competencies are desired** at what
**minimum proficiency level**. This data feeds Phase 3 (assignments) and
Phase 5 (gap reporting). It is captured but not yet acted on by the rest of
the system in this phase.

## Out of scope (deferred to later phases)

- The `engagement_staff_assignments` table and any assignment UI (Phase 3).
- Match-suggestion UI showing which staff satisfy a requirement (Phase 3).
- The timesheet authorization alert in `TimesheetGrid.tsx` and
  `ApprovalTimesheetGrid.tsx` (Phase 4).
- Firm-wide competency-gap reporting (Phase 5).
- Any changes to the existing `work_orders`, `engagements`,
  `time_entries`, `skills`, or `staff_skills` tables.

## Data model

Two new tables, both following the shape used by Phase-1's `staff_skills`
(see `supabase/migrations/20260412073936_*.sql:42-75`).

### `public.wo_staffing_requirements`

One row per work order × staff category. The category is the same enum used
across the EMS for staff levels.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, `default gen_random_uuid()` | |
| `work_order_id` | `uuid NOT NULL` | FK → `work_orders(id)` ON DELETE CASCADE |
| `staff_category` | `text NOT NULL` | CHECK against the staff-category code set already used by `staff.category` (Senior, Manager, Director, Partner, Semisenior, SQR, Specialist IT, Specialist Tax — confirm the exact codes against the existing column before writing the CHECK) |
| `staff_count` | `int NOT NULL` | CHECK `staff_count > 0` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | trigger to bump on update |

- **Indexes:** `(work_order_id)` for the per-WO fetch.
- **Unique:** `UNIQUE (work_order_id, staff_category)` — one row per
  category per work order. Frontend pre-selection of categories already
  present prevents duplicate insert; the constraint is the safety net.
- **RLS:** mirror `work_orders`:
  - `SELECT` for any authenticated user.
  - `INSERT/UPDATE/DELETE` for admin OR
    `is_engagement_team_member(<engagement_id of the parent WO>)`.
  - Pull the engagement id by joining `work_orders` in the policy
    expression.

### `public.wo_staffing_requirement_skills`

Junction table listing the desired competencies for each requirement, with
minimum proficiency.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `requirement_id` | `uuid NOT NULL` | FK → `wo_staffing_requirements(id)` ON DELETE CASCADE |
| `skill_id` | `uuid NOT NULL` | FK → `skills(id)` ON DELETE RESTRICT |
| `min_proficiency_level` | `text NOT NULL` | CHECK `IN ('Beginner','Intermediate','Advanced')` — same enum as `staff_skills.proficiency_level`, no default |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

- **Indexes:** `(requirement_id)` and `(skill_id)`.
- **Unique:** `UNIQUE (requirement_id, skill_id)` — a skill appears at
  most once per requirement; if you need a stricter level, you update the
  row, not insert a second.
- **RLS:** same shape as `wo_staffing_requirements`, with the engagement
  id reached via two joins (`requirement_id → wo_staffing_requirements
  → work_orders → engagement_id`).

### Migration file

- Path: `supabase/migrations/<timestamp>_wo_staffing_requirements.sql`
  (timestamp generated at write time).
- Includes both `CREATE TABLE`s, indexes, RLS enable + policies, and the
  `updated_at` trigger on `wo_staffing_requirements`.
- After commit + push to `main` via the PR, ask Lovable: **"Apply pending
  Supabase migrations."**

## Hooks

### `src/hooks/useEmsData.ts`

Add a new query hook:

```ts
export function useWorkOrderStaffingRequirements(workOrderId: string | undefined)
```

- Returns `wo_staffing_requirements` rows for the given WO, joined with
  `wo_staffing_requirement_skills(*, skill:skills(*))`.
- Query key: `['workOrderStaffingRequirements', workOrderId]`.
- Disabled when `workOrderId` is undefined.

Define a `WorkOrderStaffingRequirementWithSkills` interface in the same
file, mirroring the shape of `StaffSkillWithSkill` from Phase 1.

### `src/hooks/mutations/useWorkOrderStaffingMutations.ts` (new file)

Six focused mutations, mirroring `useStaffCompetencyMutations.ts`:

| Hook | Action |
|---|---|
| `useCreateStaffingRequirement` | Insert one row in `wo_staffing_requirements`. |
| `useUpdateStaffingRequirement` | Update `staff_count` (the only mutable field besides `staff_category`, which we do not allow to change — delete + re-add instead). |
| `useDeleteStaffingRequirement` | Delete by id (cascade removes child skills). |
| `useCreateRequirementSkill` | Insert one row in `wo_staffing_requirement_skills`. |
| `useUpdateRequirementSkill` | Update `min_proficiency_level` for an existing row. |
| `useDeleteRequirementSkill` | Delete by id. |

Each mutation:
- Invalidates `['workOrderStaffingRequirements', workOrderId]`.
- Maps PG error 23505 to a user-friendly toast (e.g. "Esta categoría ya
  está agregada" or "Esta competencia ya está agregada"), using the same
  pattern as `useStaffCompetencyMutations.ts:55-77`.
- Surfaces other errors via the standard `toast.error` helper.

Re-export from `src/hooks/mutations/index.ts`.

## UI

### `src/pages/WorkOrderEdit.tsx`

Add a new card section titled **"Requisitos de Dotación"** /
**"Staffing Requirements"** between the existing form sections (insert it
after the work-order metadata, before any expense-related sections).

Structure inside the card:

- A list of category groups. Each category group renders an Excel-like
  grid (same styling as the StaffForm competencies grid,
  `src/components/forms/StaffForm.tsx:786-959`):
  - Header band: `bg-muted/50`.
  - Borderless inputs (`border-0 bg-transparent focus:ring-1
    shadow-none`).
  - Trash icon buttons at `h-8 w-8`.
  - Mobile via `overflow-x-auto`.
- Per category group:
  - A short header row with the category name and a numeric input for
    `staff_count`.
  - A skills sub-table listing the desired competencies and their
    minimum proficiency. Columns: Skill (Select), Min Proficiency
    (Select), Action.
  - A "+ Agregar Competencia" in-table button row (`colSpan={3}`,
    `rounded-none`, ghost variant) — same shape as the StaffForm
    competencies grid uses.
- Below all category groups: a "+ Agregar Categoría" ghost button.
  Clicking it opens a Select listing categories not yet present on this
  work order; picking one inserts a new requirement row with
  `staff_count = 1` and an empty skills list.

### Save flow

Use the same final-state diff approach as `StaffForm.tsx:408-445`:
- On load, seed the form state from `useWorkOrderStaffingRequirements`.
- On submit, compare submitted vs original by `(staff_category)` and by
  `(requirement_id, skill_id)`:
  - Categories present originally but not submitted → delete
    requirement.
  - Categories submitted but not originally present → create
    requirement, then bulk-insert its skills.
  - Categories present in both with a different `staff_count` → update.
  - Same diff for skills inside each requirement.
- Errors stop the partial save and toast the offending row's first
  inline message.

No future-date constraints (no dates here). No HR-evaluation field
(this is a requirement, not an evaluation).

## i18n

Add new keys under `workOrder.staffingRequirements.*` in both
`src/locales/en.json` and `src/locales/es.json`:

| Key | EN | ES |
|---|---|---|
| `title` | Staffing Requirements | Requisitos de Dotación |
| `addCategory` | + Add Category | + Agregar Categoría |
| `addSkill` | + Add Competency | + Agregar Competencia |
| `category` | Category | Categoría |
| `staffCount` | # Staff | N° de Personal |
| `skill` | Competency | Competencia |
| `minLevel` | Minimum Level | Nivel Mínimo |
| `remove` | Remove | Eliminar |
| `empty` | No categories defined yet. | Aún no hay categorías definidas. |
| `errors.duplicateCategory` | This category is already added. | Esta categoría ya está agregada. |
| `errors.duplicateSkill` | This competency is already added. | Esta competencia ya está agregada. |
| `errors.partialSave` | Work order saved, but some staffing rows could not be saved. | Orden de trabajo guardada, pero algunas filas de dotación no pudieron guardarse. |

Reuse the existing `skill.categories.*` keys (already in `en.json` and
`es.json` from Phase 1) for the Skill option labels rendered as
`Name — Category`.

Reuse `staff.competencies.levels.beginner / intermediate / advanced`
(also from Phase 1) for the Min Proficiency Select options.

## Verification

After implementation:

1. `npm run build` — no TypeScript errors.
2. `npx vitest run` — full test suite passes (no new tests required for
   this phase, but existing ones must stay green).
3. `git push -u origin <branch>`, open PR into
   `sruizmier-scheduler-v2`, merge.
4. Lovable prompt: **"Apply pending Supabase migrations."**
5. Browser walk on a fresh dev server (`npm run dev`):
   1. Open an existing work order.
   2. Add two categories (e.g. Senior with 2, Manager with 1).
   3. Add two skills under Senior, one under Manager. Set proficiency
      levels.
   4. Save → reload → confirm the data persisted.
   5. Edit `staff_count`, remove a skill, add a new one → save → reload
      → confirm the diff was applied correctly.
   6. Try to add a category that already exists — the Select should not
      list it. If you bypass via DevTools, the PG UNIQUE constraint
      should fire and produce the toast.
   7. As a non-admin / non-engagement-team-member user, confirm the
      section renders read-only.

## Files to touch (summary)

| File | Action |
|---|---|
| `supabase/migrations/<timestamp>_wo_staffing_requirements.sql` | Create |
| `src/hooks/useEmsData.ts` | Add `useWorkOrderStaffingRequirements` and `WorkOrderStaffingRequirementWithSkills` interface |
| `src/hooks/mutations/useWorkOrderStaffingMutations.ts` | Create (six mutations) |
| `src/hooks/mutations/index.ts` | Re-export the six new mutations |
| `src/pages/WorkOrderEdit.tsx` | Add Staffing Requirements card section + save-flow diff |
| `src/locales/en.json` | Add `workOrder.staffingRequirements.*` keys |
| `src/locales/es.json` | Same in Spanish |
| `docs/changelogs/CHANGELOG-<implementation date>.md` | Document the implementation when it ships |

## Files explicitly not touched

- `src/integrations/supabase/types.ts` — auto-regenerated by Lovable
  after the migration is applied.
- `supabase/config.toml` — managed by Lovable Cloud.
- Any file under `src/components/timesheet/` or
  `src/hooks/useTimesheet*.ts` — Phase 4 territory.
- `src/components/forms/StaffForm.tsx` — Phase 1 already shipped, no
  edits required for Phase 2.

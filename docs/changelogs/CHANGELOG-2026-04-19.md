# Changelog — 2026-04-19

## Staff Competency Assignment in Add/Edit Forms

Adds the ability to assign zero or more competencies to each staff member directly from the Staff Add and Staff Edit forms. Each competency assignment carries a proficiency level (Beginner / Intermediate / Advanced) and an HR verification date (Fecha de Evaluación, verified by Talento Humano). No database schema changes were required — this feature builds entirely on the existing `skills` catalog and `staff_skills` join table.

### New files

| File | Description |
|---|---|
| `src/hooks/mutations/useStaffCompetencyMutations.ts` | Three focused mutation hooks: `useCreateStaffCompetency`, `useUpdateStaffCompetency`, `useDeleteStaffCompetency`. Includes PG error 23505 mapping to a user-friendly "already assigned" toast. |
| `docs/changelogs/CHANGELOG-2026-04-19.md` | This file. |

### Modified files

| File | Change |
|---|---|
| `src/hooks/useEmsData.ts` | Added `StaffSkillWithSkill` interface; extended `StaffFull` to include `staff_skills?: StaffSkillWithSkill[]`; extended `useStaffFull()` query to join `staff_skills(*, skill:skills(*))`; added `useActiveSkills()` hook (returns active catalog entries ordered by name, query key `['skills', 'active']`). |
| `src/hooks/mutations/index.ts` | Barrel-exported the three new competency mutation hooks. |
| `src/components/forms/StaffForm.tsx` | Added `useFieldArray` for competencies array; extended Zod schema with `competencies` array validation (required fields, no future dates, no duplicates via `superRefine`); seeded competencies from `staff.staff_skills` on edit load; added competency sync logic in `onSubmit` using a final-state diff (delete removed, update changed, insert new); gated role-sync dialog on competency sync success; added atomic rollback on create failure (attempt staff delete if competency inserts fail); added Competencies card section with responsive table/card layout. |
| `src/locales/en.json` | Added `staff.competencies.*` keys (title, addButton, name, category, level, verifiedDate, verifiedDateHint, empty, remove, levels.beginner/intermediate/advanced, errors.*). |
| `src/locales/es.json` | Same keys in Spanish (Talento Humano terminology throughout). |

### Key behaviors

- **Competencies on new staff**: the Add form supports competencies from the start — no "save first" step required. On create, staff is inserted first, then competencies are bulk-inserted. If competency insert fails, the staff row is rolled back and the user stays on the form.
- **Sync by final state**: on edit save, the diff algorithm compares submitted `skill_id`s against originals — no row-identity tracking needed. Replacing a competency in a row is automatically treated as delete-old + insert-new.
- **Inactive skill guard**: active skills that are not yet assigned to this staff appear in the Add dropdown. Existing assignments of skills that were later deactivated remain visible and editable but do not appear as new choices.
- **3-layer duplicate protection**: (1) dropdown excludes already-selected skills per row, (2) Zod `superRefine` blocks submit if duplicates exist, (3) PG UNIQUE constraint maps to a toast on the rare path where both prior layers are bypassed.
- **No future dates**: `max={todayISO()}` on the native date input and a matching Zod refinement using the same helper — browser and validator always agree.
- **Role-sync gate**: the category→role sync dialog only opens after competencies have been saved successfully.
- **Dirty tracking**: automatic via react-hook-form's `formState.isDirty` (driven by `useFieldArray`) — `usePageLeaveLock` picks it up with no changes.

### Out of scope

- Staff list page (`src/pages/Staff.tsx`) — unchanged.
- Competency catalog CRUD (`src/components/forms/SkillForm.tsx`) — unchanged.
- Database migrations — not needed (reuses existing tables and RLS policies).

## Polish — Competencies Section (StaffForm)

Refines the competencies section in `src/components/forms/StaffForm.tsx` to better match Ruizmier design patterns.

### Changes

| File | Change |
|---|---|
| `src/components/forms/StaffForm.tsx` | (1) Removed the outline `[+ Agregar Competencia]` button from the section header (top-right). (2) Added a single ghost-style button below the rows (and below the empty-state message) using `variant="ghost" size="sm"` with `text-info hover:text-info hover:bg-info/10`, matching the "+ Agregar Gasto" pattern in `WorkOrderForm`. (3) Skill `<SelectItem>` options now render as `Name — Category`, where the category is resolved via `t('skill.categories.{key}')` with a fallback to the raw key. The closed/selected state inherits the same label automatically via Radix Select. |

### Notes

- No new i18n keys required — `skill.categories.*` already exist in both `en.json` and `es.json`.
- No mutation, query hook, schema, or table-column changes.
- Empty-state message is preserved; the Add button is now a single instance always rendered below.

## Fixes — Competencies Section Regressions (StaffForm)

Three regressions introduced during the polish pass have been corrected.

### Changes

| File | Change |
|---|---|
| `src/components/forms/StaffForm.tsx` | (1) Removed `[&_p.text-destructive]:hidden` from the competency row wrapper so per-field `<FormMessage>` errors render again under the offending input (e.g. empty skill, future date, duplicate). (2) Stopped concatenating raw `err.message` into the partialSave toast — the i18n string stands alone; the raw error stays in `console.error` for debugging. (3) Replaced the flat `Object.values(errors)[0]` probe in the `onInvalid` handler with a recursive `findFirstErrorMessage` helper that walks nested `useFieldArray` errors to find the first leaf `.message`; fallback now uses the new `validation.formInvalid` key (previous fallback incorrectly reused `staff.competencies.errors.partialSave`, which tells the user their staff "was saved" when in fact validation blocked submit). |
| `src/locales/en.json`, `src/locales/es.json` | Added `validation.formInvalid` — EN "Please fix the errors and try again." / ES "Por favor corrige los errores e intenta de nuevo." |

### Why

Per-field errors are the primary affordance telling a user which row to fix; hiding them while also showing a wrong-content toast made invalid submits feel broken. The new behavior: each invalid row shows its own inline error AND a summary toast with the first actual leaf message.

## Polish — Competencies Excel-like Grid (StaffForm)

Converted the competencies section in `src/components/forms/StaffForm.tsx` from a CSS-Grid-of-bordered-inputs to a real `<table>` with a `bg-muted/50` header band, `border-b`/`border-r` shared grid lines, borderless `SelectTrigger` and `Input` fields that only show a focus ring (`border-0 bg-transparent focus:ring-1 shadow-none`), trash icon buttons at `h-8 w-8`, and the "+ Agregar Competencia" action rendered as an in-table row with `colSpan={4}` and `rounded-none`. Mobile handled via `overflow-x-auto` horizontal scroll (no stacked-card breakpoint). Matches `TimesheetGrid.tsx` styling (`src/components/timesheet/TimesheetGrid.tsx:699–947`) so both grids read as siblings. Also fixed `todayISO()` to use the local clock instead of `toISOString()` (UTC), preventing the date-picker `max` from drifting to tomorrow after 8 pm in UTC−4.

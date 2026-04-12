# Plan v1: Skills Tracking Tables for EMS Scheduler

## Summary

Create two new database tables (`skills` and `staff_skills`) to support skill-based scheduling. Phase 1 of the GANTT scheduler foundation.

## Deliverables (4 files)


| #   | File                                            | Action                              |
| --- | ----------------------------------------------- | ----------------------------------- |
| 1   | `supabase/migrations/20260412120000_<uuid>.sql` | CREATE — SQL migration              |
| 2   | `src/integrations/supabase/customTypes.ts`      | CREATE — Companion TypeScript types |
| 3   | `docs/database-schema.sql`                      | EDIT — Append new tables + RLS      |
| 4   | `docs/changelogs/CHANGELOG-2026-04-12.md`       | CREATE — Changelog entry            |


## File 1: SQL Migration

Two tables with RLS, triggers, and constraints:

`**public.skills**` — Admin-managed taxonomy

- `skill_id` UUID PK, `name` VARCHAR (case-insensitive unique via `LOWER(TRIM(name))` index), `category` VARCHAR, `is_active` BOOLEAN
- CHECK constraints: `TRIM(name) <> ''`, `TRIM(category) <> ''`
- RLS: Admin ALL, authenticated SELECT

`**public.staff_skills**` — Junction table

- `staff_skill_id` UUID PK, `staff_id` FK → staff (CASCADE), `skill_id` FK → skills (RESTRICT)
- `proficiency_level` VARCHAR with CHECK (`'Beginner'`, `'Intermediate'`, `'Advanced'`) — no default
- `last_evaluated_date` DATE nullable
- UNIQUE(`staff_id`, `skill_id`), FK indexes
- RLS: Admin ALL, authenticated SELECT

Both tables reuse `update_updated_at_column()` trigger. Nullable timestamps match existing convention.

## File 2: Companion TypeScript Types

`src/integrations/supabase/customTypes.ts` — sibling to `types.ts` (which cannot be edited manually). Exports `SkillRow/Insert/Update`, `StaffSkillRow/Insert/Update`, `PROFICIENCY_LEVELS` const array, and `ProficiencyLevel` type. Will be superseded when Lovable regenerates `types.ts`.

## File 3: Schema Doc Update

Append both table definitions and RLS policies to `docs/database-schema.sql` after the staff table block.

## File 4: Changelog

`docs/changelogs/CHANGELOG-2026-04-12.md` documenting the new tables, constraints, and purpose.

## Key Design Decisions


| Decision                     | Choice                        | Rationale                                                               |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Proficiency type             | CHECK (not ENUM)              | Only `app_role` uses ENUM (cross-table). Single-table values use CHECK. |
| No proficiency DEFAULT       | Explicit required             | Silent 'Beginner' default masks frontend bugs.                          |
| Case-insensitive unique name | `LOWER(TRIM(name))` index     | Taxonomy: "IFRS" and "ifrs" must not coexist.                           |
| Staff FK: CASCADE            | Staff deleted → skills gone   | Skill assignments meaningless without staff.                            |
| Skill FK: RESTRICT           | Must unassign before deleting | Prevents accidental wipe of active assignments.                         |
| Admin-only management        | No staff self-update          | Not in spec — don't add unspecified features.                           |


## Post-Deployment Verification

After `"Apply pending Supabase migrations"`:

- Duplicate `(staff_id, skill_id)` → unique violation ✓
- `proficiency_level = 'Expert'` → CHECK violation ✓
- `name = '  '` → CHECK violation ✓
- Case-insensitive duplicate → unique index violation ✓
- Delete skill with assignments → RESTRICT violation ✓
- Delete staff with assignments → CASCADE removes rows ✓
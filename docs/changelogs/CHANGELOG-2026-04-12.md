# Changelog — 2026-04-12

## Skills Tracking Tables (Scheduler Phase 1)

### New Tables

#### `public.skills`
- Admin-managed skill taxonomy (e.g. "IFRS", "Tax Planning", "Data Analytics")
- Case-insensitive unique names via `LOWER(TRIM(name))` index
- CHECK constraints prevent blank names and categories
- RLS: Admin ALL, authenticated SELECT

#### `public.staff_skills`
- Junction table linking staff to skills
- `proficiency_level` restricted to `Beginner | Intermediate | Advanced` (CHECK, no default)
- `last_evaluated_date` for tracking when proficiency was last assessed
- UNIQUE(`staff_id`, `skill_id`) — one skill per staff member
- FK behavior: CASCADE on staff deletion, RESTRICT on skill deletion
- FK indexes on both `staff_id` and `skill_id`
- RLS: Admin ALL, authenticated SELECT

### Companion Files
- `src/integrations/supabase/customTypes.ts` — TypeScript types for immediate frontend use

### Design Decisions
- CHECK constraint (not ENUM) for proficiency — matches codebase convention for single-table values
- No proficiency default — forces explicit frontend assignment
- Admin-only management — no staff self-update (not in spec)

---

## Skills Management Tab in Settings (Scheduler Phase 1b)

### New Migration
- `chk_skills_category_code` CHECK constraint on `skills.category`
- Enforces closed code set: `framework`, `industry`, `tool`, `language`, `certification`, `other`

### New Files
- `src/hooks/mutations/useSkillMutations.ts` — Create/Update/Delete mutations
- `src/components/forms/SkillForm.tsx` — Sheet-based add/edit form with category Select dropdown

### Modified Files
- `src/integrations/supabase/customTypes.ts` — Added `SKILL_CATEGORIES` const + `SkillCategory` type
- `src/hooks/useEmsData.ts` — Added `Skill` interface + `useSkills()` query hook
- `src/hooks/mutations/index.ts` — Re-exported skill mutations
- `src/pages/Settings.tsx` — Added admin-only "Skills" tab after Industries with DataTable + SkillForm
- `src/locales/en.json` — Added `settings.skills`, `entities.skill`, `skill.*` keys
- `src/locales/es.json` — Added Spanish translations ("Competencias")

### Design Decisions
- Category stored as stable code, rendered via i18n labels — prevents free-text drift
- Tab is admin-only, placed after Industries
- Follows Activity Codes tab pattern exactly (DataTable + Sheet form + mutations)

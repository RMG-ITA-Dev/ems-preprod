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

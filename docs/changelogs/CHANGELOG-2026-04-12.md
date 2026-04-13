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

---

## Dual Lock File Fix + Partial-Week Test Unskip (Code Review Quick Wins)

### Package Manager Lock File Cleanup

**Problem**: Both `package-lock.json` and `bun.lock` were committed. CI uses `npm ci` (see `.github/workflows/test.yml` line 23), so any developer running `bun install` locally would get a different dependency tree than CI — silent drift risk.

**Changes**:

- **Deleted**: `bun.lock` (1291 lines removed)
- **Modified**: `.gitignore` — Added `bun.lock` entry after `lerna-debug.log*` (line 9) to prevent re-commit
- **Modified**: `package.json` — Added `"packageManager": "npm@10.9.7"` field after `"type": "module"` (line 6). This matches the npm version shipped with Node 20 (used by CI) and, when Corepack is enabled locally, enforces the exact package manager version.

### Partial-Week Test Deterministic Fix (BUG 0306-74)

**Problem**: `src/pages/__tests__/TimeSheet.partial-week.test.tsx` was `describe.skip`'d because it depended on real system time. The test mocks `hire_date: "2026-03-27"` (a Friday) and asserts that 8 hours logged meets the prorated weekly minimum (40h × 1/5 workable days = 8h). When the real date advanced past that week, `TimeSheet` computed a different current week and the prorated minimum calculation no longer applied, causing intermittent failures.

**Changes** to `src/pages/__tests__/TimeSheet.partial-week.test.tsx`:

1. **Added time-freezing hooks** (inserted after the `matchMedia` polyfill, before hook mocks):
   ```typescript
   beforeAll(() => {
     vi.useFakeTimers();
     vi.setSystemTime(new Date("2026-03-27T12:00:00"));
   });

   afterAll(() => {
     vi.useRealTimers();
   });
   ```
   Freezing to Friday 2026-03-27 guarantees `hire_date` always falls within the current week. `afterAll` restores real timers so no cross-file contamination.

2. **Unskipped the test**: Changed `describe.skip("TimeSheet partial week hire date (BUG 0306-74)", ...)` → `describe("TimeSheet partial week hire date (BUG 0306-74)", ...)`.

3. **Removed the 10-line skip TODO comment block** that referenced the BUG 0306-74 deferred fix — the deterministic fix is now in place.

4. **Expanded Vitest imports** (follow-up style fix, commit `86e9e46`): Changed `import { describe, it, expect, vi } from "vitest"` → `import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"`. Although `vitest.config.ts` sets `globals: true` (making this unnecessary at runtime), the file's existing convention is explicit imports.

### Verification
- `npm run build` — passes
- `npx vitest run` — **57 files passed, 515 tests passed, 0 skipped** (previously 514 passed + 1 skipped)
- Targeted re-run of `TimeSheet.partial-week.test.tsx` — 1/1 passing

### Files Changed Summary

| File | Change | Lines |
|------|--------|-------|
| `bun.lock` | DELETED | −1291 |
| `.gitignore` | Added `bun.lock` entry | +1 |
| `package.json` | Added `packageManager` field | +1 |
| `src/pages/__tests__/TimeSheet.partial-week.test.tsx` | Added fake timers, unskipped, removed TODO, expanded imports | +11 −11 |

### Commits
- `7219349` — Fix dual lock file and unskip partial-week test
- `86e9e46` — Explicitly import beforeAll/afterAll in partial-week test

(Also on `sruizmier-scheduler-v2` as `8503e38` and `d05f76c` via cherry-pick.)

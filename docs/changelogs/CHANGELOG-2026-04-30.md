## BUG 0213-36 — backend revert

**Date:** 2026-04-30
**Reason:** Bug was not really a Bug.
**Revert migration:** `supabase/migrations/20260430164017_revert_0213_36_backend.sql`
**Reverts:** `supabase/migrations/20260430160000_fix_0213_36_submit_safe.sql` (file deleted)
**Body source of truth:** verbatim copy of `supabase/migrations/20260402083351_6edc1bd6-3cf7-4656-a364-8f566a548cfd.sql`

### Frontend NOT reverted (intentional)

`src/pages/TimeSheet.tsx:385` still hardcodes `isAutoApproved: false`. The UI
therefore continues to behave exactly as it did under the fix; this revert
only re-enables the OR-branch in `submit_timesheet_safe` for non-UI callers
(RPC consumers, tests, future frontend changes).

### Test surface trimmed

Removed from `src/hooks/__tests__/submitApprovalRequired.test.ts`:
- The `describe("submit_timesheet_safe migration SQL (BUG 0213-36)", ...)` block (2 `it` cases that read the now-deleted fix migration via `readFileSync`).
- The unused `import { readFileSync } from "fs";` and `import { join } from "path";` imports.

The decision-matrix `describe` block (`effectiveAutoApprove(...)`) is preserved untouched. The `effectiveAutoApprove` helper continues to model the post-fix logic (`return !approvalRequired`); it is now an isolated unit test that no longer asserts the live RPC formula. Live-formula coverage is provided by the post-apply SQL verification below.

### Post-apply verification

- Body diff vs pre-fix source (`20260402083351_6edc1bd6-...sql`): empty — body bytes identical, both 254 lines.
- Ledger (`SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20260430143647' ORDER BY version`):
  - `version = 20260430164153, name = (null)` — Lovable Cloud assigned its own ledger version (~16 minutes after the file timestamp `20260430164017`). This is the expected behavior already documented under Q1 of the prior fix entry: file-timestamp ≠ ledger-version on this project.
- Regex (A) `v_effective_auto := p_is_auto_approved OR COALESCE` against `pg_get_functiondef(...)`: **1** ✅
- Regex (B) `v_effective_auto := COALESCE(v_skip_approval, false);` against `pg_get_functiondef(...)`: **0** ✅
- Vitest BUG 0213-36 sweep across 4 files: **29/29 passing** (down from 31, matching the 2 deleted SQL-regex tests). Files: `submitApprovalRequired.test.ts` (9), `useTimesheetMutations.test.tsx` (11), `TimeSheet.submit-guards.test.tsx` (5), `CategoryForm.defaultAppRole.test.tsx` (4).

### Files changed in this turn

- **Created:** `supabase/migrations/20260430164017_revert_0213_36_backend.sql`
- **Deleted:** `supabase/migrations/20260430160000_fix_0213_36_submit_safe.sql`
- **Edited:** `src/hooks/__tests__/submitApprovalRequired.test.ts`
- **Appended:** `docs/changelogs/CHANGELOG-2026-04-30.md` (this section)

No frontend, locale, edge function, or other test file was modified. No schema changes beyond the function body.

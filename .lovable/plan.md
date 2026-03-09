

# Plan v3 -- BUG 0227-65: Manager/Supervisor Selector Shows Partners

## Objective

Filter the "Gerente/Supervisor" dropdown to show only management-tier staff (display_order 3-4), excluding leadership-tier staff (display_order 1-2).

## Root Cause

In `src/hooks/useCategoryStaff.ts` lines 48-61, `managementOptions` uses `displayOrder <= 4` which includes Partners (1) and Directors (2) alongside Managers (3) and Seniors (4).

## Target Files

| File | Action |
|---|---|
| `src/hooks/useCategoryStaff.ts` | Edit 3 lines (48, 54, 55) |
| `docs/changelogs/CHANGELOG-2026-03-08.md` | Append entry |

**No changes to:** `src/components/forms/EngagementForm.tsx` — it consumes `managerOptions` (legacy alias of `managementOptions` at line 67); fixing the hook is sufficient.

## Step 1: Edit `src/hooks/useCategoryStaff.ts`

Three edits inside the `managementOptions` block (lines 48-61):

**Line 48** — comment:
```
// Before:
// Management options for dropdowns (Manager/Supervisor) - includes both management tier AND leadership tier
// After:
// Management options for dropdowns (Manager/Supervisor) - management tier only
```

**Line 54** — comment:
```
// Before:
// Include management tier (3-4) and leadership tier (1-2)
// After:
// Include management tier only (3-4): Gerente, Senior
```

**Line 55** — filter:
```
// Before:
return displayOrder != null && displayOrder <= 4;
// After:
return displayOrder != null && displayOrder >= 3 && displayOrder <= 4;
```

## Step 2: Changelog Append

**File:** `docs/changelogs/CHANGELOG-2026-03-08.md`

Append:

```markdown
## BUG 0227-65 — Fix Manager/Supervisor selector to exclude Partners and Directors

**Priority:** Medium | **Route:** PRINCIPAL-Encargos | **Status:** Fixed

**Root cause:** `managementOptions` filter in `src/hooks/useCategoryStaff.ts` used `displayOrder <= 4` instead of `>= 3 && <= 4`, which included the leadership tier (Partner display_order=1, Director display_order=2) in the management dropdown.

**Fix:** Single-line filter change in `useCategoryStaff.ts` line 55: `displayOrder <= 4` → `displayOrder >= 3 && displayOrder <= 4`. Two comment updates on lines 48 and 54 to reflect the corrected scope.

**Files modified:**
- `src/hooks/useCategoryStaff.ts` — 3 line edits (lines 48, 54, 55)

**No backend, DB, or schema changes.**

**Not modified:** `src/components/forms/EngagementForm.tsx` — consumes `managerOptions` (legacy alias of `managementOptions`); fixing the hook automatically fixes the dropdown everywhere it's used.
```

## Verification

1. Create Encargo — "Gerente/Supervisor" dropdown shows only Manager and Senior staff
2. Partners and Directors do NOT appear in the dropdown
3. Edit existing Encargo — same correct filtered list
4. Partner/Director dropdown (`leadershipOptions`) remains unchanged


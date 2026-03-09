# 260308 _EMS2.0.7_Debugg_Session

**Date:** 2026-03-08
**Version:** EMS 2.0.7

---

## BUG 0227-65 — Fix Manager/Supervisor selector to exclude Partners and Directors

**Priority:** Medium | **Route:** PRINCIPAL-Encargos | **Status:** Fixed

**Root cause:** `managementOptions` filter in `src/hooks/useCategoryStaff.ts` used `displayOrder <= 4` instead of `>= 3 && <= 4`, which included the leadership tier (Partner display_order=1, Director display_order=2) in the management dropdown.

**Fix:** Single-line filter change in `useCategoryStaff.ts` line 55: `displayOrder <= 4` → `displayOrder >= 3 && displayOrder <= 4`. Two comment updates on lines 48 and 54 to reflect the corrected scope.

**Files modified:**
- `src/hooks/useCategoryStaff.ts` — 3 line edits (lines 48, 54, 55)

**No backend, DB, or schema changes.**

**Not modified:** `src/components/forms/EngagementForm.tsx` — consumes `managerOptions` (legacy alias of `managementOptions`); fixing the hook automatically fixes the dropdown everywhere it's used.


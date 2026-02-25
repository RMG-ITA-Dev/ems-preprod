# Plan v2: BUG-0220-52-regression-hardening -- Restore Internal/ADMIN Engagements in Manual Entry + Fix Build Error

**Bug Origin**: BUG 0220-52 stopwatch fix filtered internal engagements via `useApprovedEngagements`, which is also consumed by `ManualEntryDialog`, causing manual entry to lose internal/ADMIN engagements.

---

## Root Cause

`ManualEntryDialog` (line 74) calls `useApprovedEngagements()`, which now hard-filters `.eq("is_internal", false)` on both Group A and Group B queries (lines 32, 55). Manual entry is the only way to record time against internal/admin jobs in the tracker, so this is a regression.

Additionally, `TimeSheet.submit-guards.test.tsx` imports a non-existent `TestWrapper` from `@/test/utils` (the project exports `render` as a custom render with providers, not a `TestWrapper` component).

---

## Locked Decisions


| Decision              | Value                                                             |
| --------------------- | ----------------------------------------------------------------- |
| Stopwatch behavior    | Unchanged -- continues excluding internal engagements             |
| Manual entry behavior | Restored -- includes active internal/ADMIN engagements            |
| Backend changes       | None (no DB migrations, no RPC changes)                           |
| Architecture          | Dedicated hook with separate query key (no boolean flag coupling) |


---

## File-by-File Changes

### 1. `src/hooks/useManualEntryEngagements.ts` (CREATE)

Create a dedicated hook for the manual entry dialog. This mirrors the logic of `useApprovedEngagements` but **omits** the `.eq("is_internal", false)` filters and **re-includes** `is_internal.eq.true` in the Group B non-admin visibility `.or()` clause.

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Engagement } from "@/hooks/useEmsData";

/**
 * Engagement list for manual timer entry dialog.
 * Includes internal/ADMIN engagements (unlike useApprovedEngagements which is tracker-only).
 */
export function useManualEntryEngagements() {
  return useQuery({
    queryKey: ["engagements-for-manual-entry"],
    queryFn: async () => {
      // Group A: Engagements with approved WOs (including internal)
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select("engagement_id")
        .eq("approval_status", "Approved");
      if (woError) throw woError;

      const approvedIds = [...new Set(
        (workOrders || []).map(wo => wo.engagement_id)
      )];

      let groupA: Engagement[] = [];
      if (approvedIds.length > 0) {
        const { data, error } = await supabase
          .from("engagements")
          .select(`*, client:clients(*), partner:staff!engagements_partner_id_fkey(*), manager:staff!engagements_manager_id_fkey(*)`)
          .in("engagement_id", approvedIds)
          .eq("status", "active")
          // NO is_internal filter -- manual entry includes internal
          .order("created_at", { ascending: false });
        if (error) throw error;
        groupA = (data || []) as Engagement[];
      }

      // Group B: work_order_required=false
      const { data: isAdminResult } = await supabase.rpc("is_admin");
      const isAdmin = !!isAdminResult;
      const { data: myStaffId } = await supabase.rpc("get_my_staff_id");

      let groupBQuery = supabase
        .from("engagements")
        .select(`*, client:clients(*), partner:staff!engagements_partner_id_fkey(*), manager:staff!engagements_manager_id_fkey(*)`)
        .eq("work_order_required", false)
        .eq("status", "active")
        // NO is_internal filter
        .order("created_at", { ascending: false });

      if (!isAdmin && myStaffId) {
        groupBQuery = groupBQuery.or(
          `is_internal.eq.true,partner_id.eq.${myStaffId},manager_id.eq.${myStaffId}`
        );
      }

      const { data: groupBData, error: groupBError } = await groupBQuery;
      if (groupBError) throw groupBError;
      const groupB = (groupBData || []) as Engagement[];

      const merged = new Map<string, Engagement>();
      for (const e of groupA) merged.set(e.engagement_id, e);
      for (const e of groupB) merged.set(e.engagement_id, e);
      return Array.from(merged.values());
    },
  });
}
```

Key differences from `useApprovedEngagements`:

- Query key: `"engagements-for-manual-entry"` (no cache coupling)
- No `.eq("is_internal", false)` on Group A (line 32 of original) or Group B (line 55)
- Group B non-admin `.or()` includes `is_internal.eq.true` (restoring pre-0220-52 behavior for manual entry)

### 2. `src/components/tracker/ManualEntryDialog.tsx` (MODIFY)

**Line 31**: Replace import:

```typescript
// BEFORE:
import { useApprovedEngagements } from "@/hooks/useApprovedEngagements";
// AFTER:
import { useManualEntryEngagements } from "@/hooks/useManualEntryEngagements";
```

**Line 74**: Replace hook call:

```typescript
// BEFORE:
const { data: engagements = [] } = useApprovedEngagements();
// AFTER:
const { data: engagements = [] } = useManualEntryEngagements();
```

No other changes. The existing stale-engagement guard on line 148 (`if (!engagements.some(...))`) continues to work against the new list.

### 3. `src/hooks/useApprovedEngagements.ts` (NO CHANGES)

Verify unchanged. This hook remains tracker-specific with `is_internal = false` filters intact. Optionally add a clarifying comment at the top.

### 4. `src/pages/__tests__/TimeSheet.submit-guards.test.tsx` (FIX BUILD ERROR)

**Line 4**: Replace non-existent `TestWrapper` import with the project's standard pattern:

```typescript
// BEFORE:
import { TestWrapper } from "@/test/utils";
// AFTER:
import { render as customRender } from "@/test/utils";
```

**Lines 44-48**: Replace `TestWrapper` usage:

```typescript
// BEFORE:
render(
  <TestWrapper>
    <TimeSheet />
  </TestWrapper>
);
// AFTER:
customRender(<TimeSheet />);
```

Note: `@/test/utils` exports a custom `render` that wraps with `QueryClientProvider` automatically.

### 5. `docs/CHANGELOG-2026-02-22.md` (APPEND)

Append at end of file:

```markdown
---

### Bug 0220-52 Regression Fix: Restore Internal Engagements in Manual Entry

**Related Bug**: 0220-52 (Tracker Engagement Selector Excludes Internal Engagements)

- **Problem**: The 0220-52 fix for the stopwatch also affected the "+ Nuevo Registro de Tiempo" (manual entry) dialog, which shares the same `useApprovedEngagements` hook. Internal/ADMIN engagements disappeared from the manual entry dropdown, but manual entry is the only way to record time against admin jobs.
- **Root Cause**: `ManualEntryDialog` consumed `useApprovedEngagements`, which now hard-filters `is_internal = false`.
- **Fix**: Created dedicated `useManualEntryEngagements` hook with its own query key (`engagements-for-manual-entry`) that includes internal engagements. `ManualEntryDialog` now uses this hook. `useApprovedEngagements` remains unchanged (tracker-only, excludes internal).
- **Unchanged**: Stopwatch filtering (Bug 0220-52 fix preserved). Timesheet grid unaffected. No DB/RPC changes.
- **Build Fix**: Fixed `TimeSheet.submit-guards.test.tsx` compile error (replaced non-existent `TestWrapper` with project-standard `render` from `@/test/utils`).
```

---

## What Stays Unchanged

- `src/hooks/useApprovedEngagements.ts` -- tracker-safe, no modifications
- `src/components/tracker/TrackerBar.tsx` -- still uses `useApprovedEngagements`
- `src/pages/TrackerRecord.tsx` -- start guard unchanged
- Timesheet grid -- separate data path (`useTimesheetWeek`)
- All existing 0220-52 tests

---

## Execution Order

1. Create `src/hooks/useManualEntryEngagements.ts`
2. Modify `src/components/tracker/ManualEntryDialog.tsx` (swap hook)
3. Fix `src/pages/__tests__/TimeSheet.submit-guards.test.tsx` (build error)
4. Append `docs/CHANGELOG-2026-02-22.md`

---

## Acceptance Criteria

1. Manual entry dialog ("+ Nuevo Registro de Tiempo") shows active internal/ADMIN engagements in dropdown.
2. Stopwatch ("Usar cronometro") still excludes internal engagements.
3. ManualEntryDialog stale-engagement guard still blocks invalid IDs.
4. No DB migrations or RPC changes.
5. Build error in `TimeSheet.submit-guards.test.tsx` resolved.
6. `pnpm test` and `pnpm lint` pass.

---

## Verification

```text
pnpm test
pnpm lint
```

Add **at least 1 automated test** for `ManualEntryDialog` proving internal engagements are visible there while still excluded in `TrackerBar`.  
Right now the plan relies mostly on manual QA for the core regression behavior. That’s workable, but less foolproof.

Manual QA:

1. Open Tracker > "+ Nuevo Registro de Tiempo" -- internal engagements (ADM, Feriados) visible in dropdown.
2. Open Tracker > "Usar cronometro" -- internal engagements NOT visible.
3. Create and save a manual entry against an internal engagement successfully.

---

## Risk Register


| Risk                                              | Severity | Mitigation                                                   |
| ------------------------------------------------- | -------- | ------------------------------------------------------------ |
| Reintroducing internal engagements into stopwatch | High     | `useApprovedEngagements` is not touched; dedicated hook used |
| Cache contamination between hooks                 | Medium   | Separate query keys                                          |
| Test suite red from unrelated compile error       | Medium   | Explicit build fix included in this plan                     |


---

## Rollback Plan

1. Revert: delete `useManualEntryEngagements.ts`, restore `useApprovedEngagements` import in `ManualEntryDialog.tsx`.
2. No database rollback needed.
3. Re-run tests to confirm prior behavior restored.
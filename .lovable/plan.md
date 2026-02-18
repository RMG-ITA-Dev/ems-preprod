

# Plan_0213-32_C05_v2: Fix Approval Persistence After Partial Approval (Optimistic + Refetch)

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-32 |
| Title | Inconsistencia en el proceso de aprobacion despues de una aprobacion parcial |
| Priority | Alta |
| Route | OPERACIONES - Aprobaciones |

## Changes from v1

| Change | Detail |
|--------|--------|
| Removed "always navigate back" | v1 forced navigation after every save as a workaround. v2 keeps the user on the detail page after partial approval, showing persisted statuses correctly. Navigation only happens when all pending lines are resolved (stillPending === 0). |
| Added optimistic cache update | Before mutations fire, the detail query cache is updated optimistically so approved/rejected lines reflect immediately with no flash. |
| Added await + refetch after mutations | After mutations complete, the detail query is invalidated and refetched before clearing local state. This replaces optimistic data with authoritative DB state. |
| staleTime + refetchOnMount | Detail query gets `staleTime: 0` and `refetchOnMount: 'always'` to guarantee fresh data on every visit. |

## Problem

After a partial approval (approving some engagement lines, leaving others pending), the system shows all records as pending again. The approver sees previously approved lines reset to pending with active toggles, as if no decision was saved.

## Root Cause

1. `processDecisions` clears `approvalDecisions` state synchronously after mutations resolve, but the background query refetch (from `invalidateQueries`) is asynchronous. During this gap, the component renders with stale cached data (all lines as "pending") plus empty decisions map -- making everything appear actionable/pending.
2. `useStaffTimesheetForApproval` has `staleTime: 5 * 60 * 1000`, so re-entering the detail view may serve cached pre-approval data.

## Solution

### Fix 1 -- Optimistic cache update + awaited refetch in processDecisions

In `src/pages/TimesheetApprovalDetail.tsx`:

1. Import `useQueryClient` (already available via TanStack Query).
2. Get `queryClient` instance and define the detail query key.
3. Before firing mutations, apply an optimistic update to the cached `StaffTimesheetForApproval` data -- setting decided lines' statuses to `approved` or `rejected` immediately.
4. Make `processDecisions` async. After `Promise.all(promises)` resolves, await `invalidateQueries` + `refetchQueries` on the detail key to replace optimistic data with authoritative DB state.
5. Only then clear `approvalDecisions` and close the reject dialog.
6. Navigate back only when `stillPending === 0`.

```typescript
import { useQueryClient } from "@tanstack/react-query";

// Inside component:
const queryClient = useQueryClient();

const processDecisions = async (notes: string) => {
  const detailKey = ["staff-timesheet-for-approval", periodId, /* staffRecord?.staff_id from hook */];

  // Step A: Optimistic cache update
  queryClient.setQueryData(detailKey, (prev: StaffTimesheetForApproval | null | undefined) => {
    if (!prev) return prev;
    return {
      ...prev,
      lineApprovals: prev.lineApprovals.map((la) => {
        const decision = approvalDecisions.get(la.approval_id);
        if (decision === "approve") return { ...la, status: "approved" as const };
        if (decision === "reject") return { ...la, status: "rejected" as const };
        return la;
      }),
    };
  });

  // Step B: Fire mutations
  const promises: Promise<void>[] = [];
  // ... (existing mutation logic unchanged) ...

  // Step C: Await mutations, then sync cache with DB
  await Promise.all(promises);
  await queryClient.invalidateQueries({ queryKey: detailKey });
  await queryClient.refetchQueries({ queryKey: detailKey, type: "active" });

  // Step D: Clear local state AFTER cache is synced
  setApprovalDecisions(new Map());
  setRejectDialogOpen(false);

  // Step E: Navigate only when all lines resolved
  if (summary.stillPending === 0) {
    navigate("/timesheet/approvals");
  }
};
```

To access `staffRecord.staff_id` for the query key, destructure the hook result already available via `useStaffTimesheetForApproval`. Since the component uses `periodId` from `useParams` and the query key includes `staffRecord?.staff_id`, we need to get `staffRecord` from `useCurrentStaff`:

```typescript
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
// ...
const { staffRecord } = useCurrentStaff();
```

The `StaffTimesheetForApproval` type import is needed for the optimistic updater:

```typescript
import type { StaffTimesheetForApproval } from "@/hooks/useTimesheetApprovals";
```

### Fix 2 -- Fresh data on every detail view mount

In `src/hooks/useTimesheetApprovals.ts`, update the `useStaffTimesheetForApproval` query options:

```typescript
// Before (line 337):
staleTime: 5 * 60 * 1000,

// After:
staleTime: 0,
refetchOnMount: "always" as const,
refetchOnWindowFocus: true,
```

The summary list query (`usePendingApprovalSummaries`) keeps its existing `staleTime: 5 * 60 * 1000` since it is properly invalidated by mutations and only shows pending items.

### Fix 3 -- Documentation

Append entry to `docs/CHANGELOG-2026-02-17.md`.

## What the Approver Sees After the Fix

1. Opens period detail: sees 2 pending engagement lines with toggles.
2. Sets line A to "Approve", leaves line B pending.
3. Clicks "Guardar Decisiones".
4. Immediately: line A shows "Aprobada" badge (optimistic), line B stays with toggle.
5. Within ~1s: DB refetch confirms state -- no flash, no reset.
6. Summary reads "0 a aprobar, 0 a rechazar, 1 pendientes".
7. User can now decide on line B or click Cancel to return to list.

## Changelog Entry

```text
---

## BUG #0213-32: Fix Approval Persistence After Partial Approval

**Date:** 2026-02-18
**Priority:** Alta
**Version:** v2.0.9
**Route:** OPERACIONES -> Aprobaciones

### Problem

After partially approving timesheet lines (e.g., approving 1 of 2 engagement lines), the detail view showed all lines as pending again. Previously approved/rejected lines lost their visual status and displayed toggles as if no decision had been made.

### Root Cause

1. `processDecisions` cleared `approvalDecisions` state synchronously after mutations, but query refetch was async. During the gap, stale cached data (all pending) was rendered with empty decisions.
2. `useStaffTimesheetForApproval` had a 5-minute staleTime, potentially serving cached pre-approval data on re-entry.

### Solution

1. **Optimistic cache update:** Before firing mutations, the detail query cache is updated to reflect decided statuses immediately. No flash of stale "pending" data.
2. **Awaited refetch after mutations:** After mutations resolve, the detail query is invalidated and refetched before clearing local state. Replaces optimistic data with authoritative DB state.
3. **Conditional navigation:** User stays on the detail page after partial approval (can continue deciding). Navigates back only when all pending lines are resolved.
4. **Fresh data on mount:** `staleTime: 0` and `refetchOnMount: 'always'` on the detail query ensures fresh data every visit.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/TimesheetApprovalDetail.tsx` | Optimistic update + awaited refetch in processDecisions; import queryClient, useCurrentStaff, StaffTimesheetForApproval type |
| `src/hooks/useTimesheetApprovals.ts` | staleTime=0, refetchOnMount='always', refetchOnWindowFocus=true on detail query |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Optimistic state diverges from DB | Refetch immediately after mutations replaces optimistic data |
| No staleTime on detail query | Only used on one page; cost is one fetch per visit |
| User stays on page after partial save | Correct behavior per requirement; can continue or navigate back manually |
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/TimesheetApprovalDetail.tsx` | MODIFY | Optimistic cache update before mutations, awaited refetch after, conditional navigation, new imports |
| `src/hooks/useTimesheetApprovals.ts` | MODIFY | `staleTime: 0`, `refetchOnMount: 'always'`, `refetchOnWindowFocus: true` on detail query |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-32 changelog entry |

## Acceptance Criteria

1. After partial approval, the user stays on the detail page and previously decided lines show their persisted status (badge, no toggle) -- not reset to pending.
2. Remaining pending lines still show active toggles.
3. Summary counter updates correctly after save.
4. Navigating away and back to the same period shows correct persisted statuses.
5. When all lines are decided, user is navigated back to the approvals list automatically.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Optimistic state briefly differs from DB | Refetch replaces optimistic data within ~1s |
| Detail query always refetches on mount | Single indexed query; negligible cost |
| Mutation error after optimistic update | Refetch will restore correct DB state; existing error toasts remain |


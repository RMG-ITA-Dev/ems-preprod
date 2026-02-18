# Plan_0213-32_C01_v3: Apply Mandatory Corrections to Approval Persistence Fix

## Bug Reference


| Field    | Value                                                                        |
| -------- | ---------------------------------------------------------------------------- |
| ID       | 0213-32                                                                      |
| Title    | Inconsistencia en el proceso de aprobacion despues de una aprobacion parcial |
| Priority | Alta                                                                         |
| Route    | OPERACIONES - Aprobaciones                                                   |


## What This Plan Does

Applies 3 corrections to the already-implemented v2 code in `TimesheetApprovalDetail.tsx`, plus adds a missing i18n key and documents the changes.

## Verified Code State

The current implementation (v2) at lines 96-154 has:

- Optimistic cache update (correct)
- `type: "active"` on refetchQueries (needs fix)
- No try/catch (needs fix -- no rollback on failure)
- No `isSaving` state (needs fix -- double-submit possible)
- `common.saveError` missing from both locale files (needs fix)

## Changes

### 1. `src/pages/TimesheetApprovalDetail.tsx`

**Add `isSaving` state** (line 43, after `rejectNotes` state):

```typescript
const [isSaving, setIsSaving] = useState(false);
```

**Rewrite `processDecisions**` (lines 96-154) with try/catch/finally:

```typescript
const processDecisions = async (notes: string) => {
  setIsSaving(true);
  const detailKey = ["staff-timesheet-for-approval", periodId, staffRecord?.staff_id];

  // Snapshot for rollback
  const previousData = queryClient.getQueryData(detailKey);

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

  if (summary.toApprove.length > 0) {
    promises.push(
      new Promise((resolve, reject) => {
        bulkApprove.mutate(summary.toApprove, {
          onSuccess: () => resolve(),
          onError: reject,
        });
      })
    );
  }

  if (summary.toReject.length > 0) {
    promises.push(
      new Promise((resolve, reject) => {
        bulkReject.mutate(
          { approvalIds: summary.toReject, notes },
          {
            onSuccess: () => resolve(),
            onError: reject,
          }
        );
      })
    );
  }

  try {
    // Step C: Await mutations, then sync cache with DB
    await Promise.all(promises);
    await queryClient.invalidateQueries({ queryKey: detailKey });
    await queryClient.refetchQueries({ queryKey: detailKey, type: "all" });

    // Step D: Clear local state AFTER cache is synced
    setApprovalDecisions(new Map());
    setRejectDialogOpen(false);

    // Step E: Navigate only when all lines resolved
    if (summary.stillPending === 0) {
      navigate("/timesheet/approvals");
    }
  } catch (error) {
    // Restore snapshot immediately, then reconcile with DB
    queryClient.setQueryData(detailKey, previousData);
    await queryClient.invalidateQueries({ queryKey: detailKey });
    await queryClient.refetchQueries({ queryKey: detailKey, type: "all" });
    toast.error(t("common.saveError"));
  } finally {
    setIsSaving(false);
  }
};
```

**Add `toast` import** (line 16 area):

```typescript
import { toast } from "sonner";
```

**Disable button with `isSaving**` (line 223):

```typescript
// Before:
disabled={!hasDecisions || isProcessing}

// After:
disabled={!hasDecisions || isProcessing || isSaving}
```

### 2. `src/locales/en.json`

Add after `"stay": "Stay"` (line 57, inside `common` block):

```json
"saveError": "Error saving changes. Please try again."
```

### 3. `src/locales/es.json`

Same position inside `common` block:

```json
"saveError": "Error al guardar los cambios. Intente nuevamente."
```

### 4. `docs/CHANGELOG-2026-02-17.md`

Append addendum to the existing BUG #0213-32 entry noting v3 corrections: `isSaving` guard, snapshot rollback with DB reconciliation on failure, `type: "all"` on refetch, `common.saveError` i18n key.

## 5. Hardening

1. **Snapshot restore typing**
  - `const previousData = queryClient.getQueryData(detailKey);` is fine, but if you want cleaner TS, you can type it:
    - `const previousData = queryClient.getQueryData<StaffTimesheetForApproval | null>(detailKey);`  
    Not required.
2. **Promise wrapping**
  - The `new Promise((resolve, reject) => bulkApprove.mutate(...))` pattern is OK. If you ever switch to `mutateAsync`, this could simplify, but it’s not required for correctness.

## Files Summary


| File                                    | Action | Description                                                                                                                |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/TimesheetApprovalDetail.tsx` | MODIFY | Add isSaving state, try/catch/finally with snapshot rollback + DB reconciliation, type:"all", toast import, button disable |
| `src/locales/en.json`                   | MODIFY | Add `common.saveError`                                                                                                     |
| `src/locales/es.json`                   | MODIFY | Add `common.saveError`                                                                                                     |
| `docs/CHANGELOG-2026-02-17.md`          | MODIFY | Append v3 corrections addendum                                                                                             |


## Risk Assessment


| Risk                                            | Mitigation                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Partial mutation failure leaves DB inconsistent | Snapshot restore for instant UI recovery + invalidate + refetch for DB reconciliation |
| isSaving stuck on error                         | `finally` block always clears it                                                      |
| previousData undefined                          | Refetch after restore corrects any edge case                                          |
| Minimal change surface                          | 4 localized edits; no architectural changes                                           |

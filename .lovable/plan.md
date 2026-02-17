# Plan v2: Filter Tracker Engagement Dropdowns to Approved Work Orders Only (Final)

## Problem

The stopwatch (TrackerBar), manual entry dialog (ManualEntryDialog), and timer edit page (TrackerEdit) show all active engagements. Users can select an engagement whose Work Order is not approved, record time, and only get blocked at export. The validation should happen upstream -- unapproved engagements should not appear in the dropdown, and stale selections should be guarded at start/save time.

## Only two tiny implementation cautions (non-blocking)

1. Ensure `useEngagements()` and your new hook truly match “select shape” everywhere the tracker expects it (you already state it matches lines 317–321; good).
2. In ManualEntryDialog and TrackerBar, the empty-state Alert should be placed where it won’t shift layouts awkwardly (but that’s purely UI polish).

## File Changes

### 1. NEW: `src/hooks/useApprovedEngagements.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Engagement } from "@/hooks/useEmsData";

export function useApprovedEngagements() {
  return useQuery({
    queryKey: ["approved-engagements-for-tracker"],
    queryFn: async () => {
      // Step 1: Get engagement IDs with approved WOs
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select("engagement_id")
        .eq("approval_status", "Approved");
      if (woError) throw woError;

      const approvedIds = [...new Set(
        (workOrders || []).map(wo => wo.engagement_id)
      )];
      if (approvedIds.length === 0) return [];

      // Step 2: Fetch engagements -- same select shape as useEngagements()
      const { data, error } = await supabase
        .from("engagements")
        .select(`
          *,
          client:clients(*),
          partner:staff!engagements_partner_id_fkey(*),
          manager:staff!engagements_manager_id_fkey(*)
        `)
        .in("engagement_id", approvedIds)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Engagement[];
    },
  });
}
```

Key details:

- Dedupes via `Set` before `.in()`.
- Same select/joins as `useEngagements()` (lines 317-321) so the return type is identical.
- Separate query key avoids cache contamination with the full engagements list used on admin pages.

---

### 2. MODIFY: `src/components/tracker/TrackerBar.tsx`

**a) Import swap:**

- Replace `useEngagements` import with `useApprovedEngagements`.
- Keep `useActivityCodes` from `useEmsData`.

**b) Data source swap:**

- `const { data: engagements = [] } = useApprovedEngagements();`
- Remove the `activeEngagements` filter line (hook already returns active + approved).
- Replace all `activeEngagements` references with `engagements`.

**c) Stale-state guard -- tighten `canStart` (line 64):**

```typescript
const isEngagementApproved = engagements.some(
  e => e.engagement_id === engagementId
);
const canStart = engagementId && activityId && isEngagementApproved
  && (remainingHours === null || remainingHours > 0);
```

**d) Empty-state alert when no approved engagements exist:**
Add an `<Alert>` above the selectors when `engagements.length === 0`:

```typescript
{engagements.length === 0 && (
  <Alert>
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>{t("tracker.noApprovedEngagements")}</AlertDescription>
  </Alert>
)}
```

---

### 3. MODIFY: `src/components/tracker/ManualEntryDialog.tsx`

**a) Import swap:** same as TrackerBar.

**b) Data source swap:**

- `const { data: engagements = [] } = useApprovedEngagements();`
- Remove `activeEngagements` filter.
- Map over `engagements` directly in `<SelectContent>`.

**c) Stale-state guard on submit:**

```typescript
const handleSubmit = () => {
  if (!engagementId || !activityId) return;
  if (!engagements.some(e => e.engagement_id === engagementId)) {
    toast.error(t("tracker.woNotApproved"));
    return;
  }
  // ... existing logic
};
```

**d) Empty-state alert** inside dialog body when `engagements.length === 0`.

---

### 4. MODIFY: `src/pages/TrackerEdit.tsx`

**a) Add import:** `import { useApprovedEngagements } from "@/hooks/useApprovedEngagements";`
Keep existing `useEngagements` for fallback lookup.

**b) Replace `activeEngagements` memo (lines 152-156):**

```typescript
const { data: approvedEngagements = [] } = useApprovedEngagements();

const activeEngagements = useMemo(() => {
  // Include current entry's engagement even if its WO is unapproved
  if (
    entry?.engagement_id &&
    !approvedEngagements.find(e => e.engagement_id === entry.engagement_id)
  ) {
    const currentEng = engagements?.find(
      e => e.engagement_id === entry.engagement_id
    );
    return currentEng
      ? [currentEng, ...approvedEngagements]
      : approvedEngagements;
  }
  return approvedEngagements;
}, [approvedEngagements, entry?.engagement_id, engagements]);
```

**c) Unapproved warning alert** below engagement dropdown:

```typescript
{entry?.engagement_id &&
  !approvedEngagements.some(e => e.engagement_id === entry.engagement_id) && (
  <Alert variant="destructive" className="mt-2">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>{t("tracker.woNotApprovedEdit")}</AlertDescription>
  </Alert>
)}
```

**d) Block save if unapproved (in `handleSave`, line 164):**

```typescript
const isApproved = approvedEngagements.some(
  e => e.engagement_id === engagementId
);
if (!isApproved) {
  toast.error(t("tracker.woNotApprovedSave"));
  return;
}
```

---

### 5. MODIFY: `src/locales/en.json` -- Add 4 keys (in tracker section, after line 141)

```json
"woNotApproved": "Work Order is not approved for this engagement.",
"woNotApprovedSave": "Cannot save: the Work Order for this engagement is not approved. Select an approved engagement.",
"woNotApprovedEdit": "This engagement's Work Order is not approved. Select an approved engagement to save.",
"noApprovedEngagements": "No approved engagements available. Ask a manager to approve the Work Order."
```

### 6. MODIFY: `src/locales/es.json` -- Add matching keys

```json
"woNotApproved": "La Orden de Trabajo no está aprobada para este encargo.",
"woNotApprovedSave": "No se puede guardar: la Orden de Trabajo de este encargo no está aprobada. Seleccione un encargo aprobado.",
"woNotApprovedEdit": "La Orden de Trabajo de este encargo no está aprobada. Seleccione un encargo aprobado para guardar.",
"noApprovedEngagements": "No hay encargos con Orden de Trabajo aprobada. Solicite a un gerente que apruebe la Orden de Trabajo."
```

---

## Existing Safety Nets (No Changes)

The DB trigger (`check_wo_approved`) and the WO-specific export toast from Plan v3 remain intact as defense-in-depth.

## File Summary


| File                                           | Action                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/hooks/useApprovedEngagements.ts`          | NEW -- shared hook returning active engagements with approved WOs                                 |
| `src/components/tracker/TrackerBar.tsx`        | MODIFY -- use `useApprovedEngagements`, stale guard on `canStart`, empty-state Alert              |
| `src/components/tracker/ManualEntryDialog.tsx` | MODIFY -- use `useApprovedEngagements`, stale guard on submit, empty-state Alert                  |
| `src/pages/TrackerEdit.tsx`                    | MODIFY -- use `useApprovedEngagements` with fallback, block save if unapproved, destructive Alert |
| `src/locales/en.json`                          | MODIFY -- add 4 tracker i18n keys                                                                 |
| `src/locales/es.json`                          | MODIFY -- add 4 tracker i18n keys                                                                 |


## Risk

Low. DB trigger remains as safety net. Purely UI/data filtering plus local guards. No database changes.

## Acceptance Tests

1. **Stopwatch dropdown**: Engagement with WO in `Draft`/`Pending_Approval` does not appear.
2. **Manual Entry dropdown**: Same filtering.
3. **Stale selection guard (Stopwatch)**: Stale `engagementId` in state -- Start button stays disabled.
4. **Stale selection guard (Manual Entry)**: Stale `engagementId` -- Save blocked with toast.
5. **Edit existing unapproved entry**: Page loads, shows destructive Alert; Save blocked until user picks an approved engagement.
6. **Empty list**: No approved WOs exist -- Alert shown, controls disabled.
7. **Happy path**: Approved engagement works unchanged in all three entry points.
8. **Export safety net**: If something slips through, DB trigger + WO-specific export toast still fires.

## Documentation

Append entry to `docs/CHANGELOG-2026-02-13.md`.


# Plan_0213-40_v4: Fix Lost Client Dropdown on Engagement Edit

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-40 |
| Title | Al ingresar a cualquier Encargo se borra el dato guardado del dropdown |
| Priority | Baja |
| Route | PRINCIPAL - Encargos |
| Type | Funcional |
| Base Plan | Plan_0213-40_v3 (with 2 CODEX refinements) |

## Problem

When editing an existing Engagement, the **Client** dropdown shows its placeholder ("Seleccionar un cliente") instead of the saved client name. All other fields load correctly.

## Root Cause

1. **Inactive client filter**: `clients?.filter((c) => c.is_active)` excludes the engagement's client if it is inactive. Radix Select shows the placeholder when `value` has no matching `SelectItem`.
2. **Race condition**: `form.reset()` fires before `useClients()` data loads, so Radix Select locks in the placeholder.

## Changes from v3 (per CODEX review)

1. **`isDirty` added to effect dependency array**: Line 156 already destructures `const { isDirty } = form.formState;`. The reset effect will now include `isDirty` in its dependency array so React always sees the current value, avoiding stale-closure edge cases.
2. **`status.inactive` key confirmed as single adjective**: Both locale files use plain words ("Inactive" / "Inactivo"). No action needed, but noted for future maintainers.

## Changes

### 1. `src/components/forms/EngagementForm.tsx`

**a) Add `useRef` to imports** (line 1):

```typescript
// FROM:
import { useEffect, useMemo, useState } from "react";
// TO:
import { useEffect, useMemo, useRef, useState } from "react";
```

**b) Add memoized client options** (after line 105, near data hooks):

```typescript
const clientOptions = useMemo(
  () => clients?.filter(c => c.is_active || c.client_id === engagement?.client_id) ?? [],
  [clients, engagement?.client_id]
);
```

**c) Add reset guard ref** (after the line above):

```typescript
const initializedEngagementIdRef = useRef<string | null>(null);
```

**d) Update `useEffect` for `form.reset()`** (lines 137-153):

From:
```typescript
useEffect(() => {
    if (engagement) {
      form.reset({
        engagement_name: engagement.engagement_name,
        engagement_code: engagement.engagement_code || "",
        client_id: engagement.client_id,
        partner_id: engagement.partner_id || "",
        manager_id: engagement.manager_id || "",
        status: engagement.status,
        start_date: engagement.start_date ? new Date(engagement.start_date) : undefined,
        end_date: engagement.end_date ? new Date(engagement.end_date) : undefined,
      });
      setWorkOrderRequired(engagement.work_order_required ?? true);
      setActivityRequired(engagement.activity_required ?? true);
      setIsInternal(engagement.is_internal ?? false);
    }
  }, [engagement, form]);
```

To:
```typescript
useEffect(() => {
    if (
      engagement &&
      clients &&
      !isDirty &&
      initializedEngagementIdRef.current !== engagement.engagement_id
    ) {
      initializedEngagementIdRef.current = engagement.engagement_id;
      form.reset({
        engagement_name: engagement.engagement_name,
        engagement_code: engagement.engagement_code || "",
        client_id: engagement.client_id,
        partner_id: engagement.partner_id || "",
        manager_id: engagement.manager_id || "",
        status: engagement.status,
        start_date: engagement.start_date ? new Date(engagement.start_date) : undefined,
        end_date: engagement.end_date ? new Date(engagement.end_date) : undefined,
      });
      setWorkOrderRequired(engagement.work_order_required ?? true);
      setActivityRequired(engagement.activity_required ?? true);
      setIsInternal(engagement.is_internal ?? false);
    }
  }, [engagement, clients, form, isDirty]);
```

Key points:
- `clients` guard -- waits for client data before resetting (FIX-2: race condition)
- `!isDirty` -- prevents overwriting user edits; `isDirty` is already destructured at line 156 and now explicitly in the dependency array per CODEX comment #1
- `initializedEngagementIdRef` -- prevents refetch resets but allows re-init for different engagement IDs

Note: `isDirty` is already destructured at line 156 (`const { isDirty } = form.formState;`), so using it directly in the dependency array is clean and avoids the stale-proxy issue CODEX flagged.

**e) Update Client dropdown** (lines 312-316):

From:
```typescript
{clients?.filter((c) => c.is_active).map((client) => (
    <SelectItem key={client.client_id} value={client.client_id}>
      {client.client_legal_name}
    </SelectItem>
  ))}
```

To:
```typescript
{clientOptions.map((client) => (
    <SelectItem key={client.client_id} value={client.client_id}>
      {client.client_legal_name}
      {!client.is_active && ` (${t("status.inactive")})`}
    </SelectItem>
  ))}
```

### 2. `docs/CHANGELOG-2026-02-17.md`

Append:

```text
---

## BUG #0213-40: Fix Lost Client Dropdown on Engagement Edit

**Date:** 2026-02-18
**Priority:** Baja
**Version:** v2.0.10
**Route:** PRINCIPAL -> Encargos

### Report
When opening an existing Engagement for editing, the Client dropdown showed the
placeholder ("Seleccionar un cliente") instead of the saved client name. All other
fields loaded correctly.

### Root Cause
Two compounding issues:
1. The Client dropdown filtered items with `.filter(c => c.is_active)`, excluding
   inactive clients. If the engagement's client was inactive, Radix Select showed
   the placeholder because the selected value had no matching SelectItem.
2. `form.reset()` fired before `useClients()` data was loaded, causing Radix Select
   to lock in the placeholder when no SelectItems existed at render time.

### Fix
1. Include the current engagement's client in the dropdown even if inactive, with
   a visual "(Inactivo)"/"(Inactive)" suffix via `t("status.inactive")`.
2. Guard `form.reset()` to only fire when both engagement and clients data are available.
3. Use an engagement ID ref + isDirty check to prevent background refetches from
   resetting user edits.
4. Memoize filtered client list with `useMemo`.

| File | Change |
|------|--------|
| `src/components/forms/EngagementForm.tsx` | Include inactive client in dropdown; guard form.reset(); add useMemo for client options |
| `docs/CHANGELOG-2026-02-17.md` | This entry |
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/forms/EngagementForm.tsx` | MODIFY | FIX-1: inactive client filter with useMemo; FIX-2: guard reset until clients loaded; FIX-3: engagement ID ref + isDirty guard with proper deps |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-40 changelog entry |

## Acceptance Criteria

1. Editing any existing Engagement shows the correct saved client name in the Client dropdown.
2. If the engagement's client is inactive, the dropdown shows the client name with "(Inactivo)" / "(Inactive)" suffix.
3. Creating a new Engagement shows only active clients.
4. Partner and Manager dropdowns continue to work correctly.
5. Background refetches do not reset the form while the user is editing.
6. Navigating to a different engagement re-initializes the form correctly.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `isDirty` prevents legitimate re-init | Only blocks when user has edits; different engagement_id resets the ref |
| Extra deps trigger effect | Ref guard + isDirty check prevent redundant/destructive resets |
| New engagement (no engagement prop) | `engagement` is falsy so effect is a no-op; `engagement?.client_id` is undefined so OR short-circuits in filter |
| `status.inactive` becomes a phrase | Key confirmed as single adjective in both locales; noted for maintainers |


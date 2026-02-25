

# Plan v9: Admin-Only Add/Edit on Staff (Personal) Page

**Plan ID**: UI-0225-staff-admin-gate-v1

---

## Problem

Currently all users who can access the Staff page can click "Nuevo Miembro del Personal" and click rows to edit staff records. Only admins should be able to add or edit personnel. Non-admin users should see the list in read-only mode.

---

## Fix

### File: `src/pages/Staff.tsx` (MODIFY)

1. Import `useUserRole` hook.
2. Gate `newButtonLabel`, `onNewClick`, and `onRowClick` behind `isAdmin`, identical to the pattern used in Plan v8 for Settings.

```tsx
// Add import:
import { useUserRole } from "@/hooks/useUserRole";

// Inside component:
const { isAdmin } = useUserRole();

// DataTable props:
newButtonLabel={isAdmin ? t("staff.newStaff") : undefined}
onNewClick={isAdmin ? () => navigate("/staff/new") : undefined}
onRowClick={isAdmin ? (row) => navigate(`/staff/${row.staff_id}`) : undefined}
```

### File: `docs/CHANGELOG-2026-02-24.md` (MODIFY)

Append entry documenting admin-only gating on Staff page.

---

## What Stays Unchanged

- Staff list remains visible to all users with access to the page.
- StaffNew, StaffEdit, StaffForm components unchanged (route-level access is already admin-gated via sidebar visibility; this adds the UI-level guard).
- No backend/RLS changes needed.

---

## Acceptance Criteria

1. Non-admin users see the Staff list without "New" button and without clickable rows.
2. Admin users retain full add/edit functionality.


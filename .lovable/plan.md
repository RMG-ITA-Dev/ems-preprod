

# Plan v8: Admin-Only CRUD on Settings Reference Tables

**Plan ID**: UI-0225-settings-admin-gate-v1

---

## Problem

All authenticated users can currently click the "New" button and click rows to open edit/delete forms on the Industries, Rates (Categories), Activities, and Expense Types tabs in Settings. Only admins should be able to add, edit, or delete these records. Non-admin users should see the list in read-only mode (no "New" button, no row-click to edit).

---

## Fix

### File: `src/pages/Settings.tsx` (MODIFY)

For each of the four DataTable instances (Industries, Rates, Activities, Expense Types), conditionally pass `onNewClick`, `newButtonLabel`, and `onRowClick` only when `isAdmin` is true. When `isAdmin` is false, these props are omitted (undefined), which means the DataTable will not render the "New" button and rows will not be clickable.

**Industries tab (lines 359-375)**:
```tsx
<DataTable
  data={industries || []}
  columns={industryColumns}
  searchPlaceholder={t("common.search")}
  searchKeys={["industry_name"]}
  isLoading={industriesLoading}
  newButtonLabel={isAdmin ? t("industry.newIndustry") : undefined}
  onNewClick={isAdmin ? () => { setSelectedIndustry(null); setIndustryFormOpen(true); } : undefined}
  onRowClick={isAdmin ? (row) => { setSelectedIndustry(row); setIndustryFormOpen(true); } : undefined}
  getRowId={(row) => row.industry_id}
/>
```

**Rates tab (lines 384-400)**: Same pattern -- guard `onNewClick`, `newButtonLabel`, `onRowClick` with `isAdmin`.

**Activities tab (lines 409-432)**: Same pattern.

**Expense Types tab (lines 441-457)**: Same pattern.

Total: 4 DataTable instances updated, 3 props each conditionally gated behind `isAdmin`.

---

## What Stays Unchanged

- The tabs themselves remain visible to all users (they can still view the data).
- The DataTable component itself needs no changes (it already handles undefined `onNewClick`/`onRowClick` gracefully by not rendering the button and not making rows clickable).
- The form Sheet components (IndustryForm, CategoryForm, etc.) stay in the DOM but will never open for non-admins since there is no trigger.
- Global Settings and Holidays tabs remain admin-only (already gated).
- No backend/RLS changes needed (RLS already restricts write operations to admins).

---

## Acceptance Criteria

1. Non-admin users see the Industries, Rates, Activities, and Expense Types tabs as read-only lists (no "New" button, no clickable rows).
2. Admin users retain full CRUD functionality (New button, row click to edit, delete).
3. No visual regressions on the Account or Global Settings tabs.

---

## Changelog

Append to `docs/CHANGELOG-2026-02-24.md`: Admin-only CRUD gating on Settings reference table tabs.


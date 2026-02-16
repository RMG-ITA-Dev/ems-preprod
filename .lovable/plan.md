

# Relocate "EMS 2.0" Brand + Add User Context to Header (v3 -- Final)

## Summary

Two layout changes applied globally across the entire frontend:

1. **Header title** becomes `"{UserPrefix} [Staff Name] - [Page Title]"` (e.g., "Usuario: Isaac Cori - Panel de Control") using i18n keys with colon included in the translation.
2. **"EMS 2.0"** moves from the sidebar header to the **true center of the top header bar** (teal, IBM Plex Sans, bold). Visible on all breakpoints regardless of sidebar state.
3. **Public/standalone pages** are explicitly handled for brand consistency.

---

## Coverage Audit

### "EMS 2.0" occurrences in the codebase:

| Location | Action |
|----------|--------|
| `src/components/layout/AppSidebar.tsx` (line 73) | **REMOVE** |
| `src/pages/Auth.tsx` (line 137) | **LEAVE AS-IS** -- login page has its own independent branding |
| `index.html` (title/meta tags) | **LEAVE AS-IS** -- browser tab title |
| README, docs, migrations | **LEAVE AS-IS** -- documentation only |

### Route coverage (all 25 authenticated routes use AppLayout):

Index, Clients, ClientNew, ClientEdit, Engagements, EngagementNew, EngagementEdit, WorkOrders, WorkOrderNew, WorkOrderEdit, WorksheetList, WorksheetNew, WorksheetEdit, TimeSheet, TimesheetApprovals, TimesheetApprovalDetail, TrackerList, TrackerRecord, Expenses, ExpenseNew, ExpenseEdit, Staff, StaffNew, StaffEdit, Settings.

### Public/standalone pages (3 pages, handled explicitly below):

| Page | Current state | Action |
|------|--------------|--------|
| `Auth.tsx` | Has its own "EMS 2.0" branding | **LEAVE AS-IS** |
| `ResetPassword.tsx` | No "EMS 2.0" branding anywhere | **ADD** centered "EMS 2.0" above the card |
| `NotFound.tsx` | No branding, no `ProtectedRoute` wrapper | **WRAP** in conditional: if authenticated, render inside `AppLayout`; if not, show standalone page with "EMS 2.0" branding |

---

## Changes

### 1. `src/components/layout/AppHeader.tsx` -- 3-zone true-centered header

**New layout using CSS Grid `grid-cols-[1fr_auto_1fr]`:**

```text
[LEFT: min-w-0 truncate]          [CENTER: auto]          [RIGHT: justify-self-end]
[=] Usuario: Isaac Cori - Panel   EMS 2.0                 [bell] [ICA]
```

Implementation details:

- Change the header's inner container from `flex justify-between` to `grid grid-cols-[1fr_auto_1fr] items-center`.
- **Left zone** (`min-w-0`): Sidebar trigger (keep existing `hidden md:block` -- do NOT add trigger on mobile) + composite title with `truncate` class and `title` attribute containing the full text for accessibility.
- **Center zone**: "EMS 2.0" in `text-primary font-bold text-xl` with `fontFamily: "IBM Plex Sans"`. On mobile use `text-lg`. This zone is `auto`-sized so it stays perfectly centered regardless of left/right content width.
- **Right zone** (`justify-self-end`): Bell icon + user avatar dropdown (unchanged structure).
- **Composite title format**: `{t("header.userPrefix")} {displayName} - {title}`. Uses the existing `displayName` variable (already computed at line 38-42). If no staff record is linked and no user metadata name exists, fall back to just `{title}`.
- On mobile, the full string is kept (truncation via CSS, full text accessible via `title` attribute). The prefix is NOT hidden on mobile.
- Add `useTranslation` import.
- **i18n cleanup** of hardcoded English strings in the dropdown:
  - Line 70: `'User'` fallback -> `t("common.user")`
  - Line 78: `"Linked to staff: "` -> `t("header.linkedToStaff")`
  - Line 86: `"Not linked to staff record"` -> `t("header.notLinkedToStaff")`
  - Line 93: `"Sign out"` already uses text -- replace with `t("nav.signOut")` (key confirmed to exist in both locale files)

### 2. `src/components/layout/AppSidebar.tsx` -- Remove brand + redundant username

- **Remove** the entire `<SidebarHeader>` block (lines 68-75). Sidebar uses `collapsible="offcanvas"` (collapses fully off-screen), so no spacer/placeholder is needed.
- **Remove** the `SidebarHeader` import from the UI import list (line 28).
- **Sidebar Footer**: Remove the `userName` display text (lines 154-157) since the user's name now appears prominently in the header. Keep only the sign-out icon button.
- Remove the `userName` variable computation (lines 62-64) since it is no longer used.

### 3. `src/pages/NotFound.tsx` -- Conditional layout with brand

Currently `NotFound` renders standalone for both authenticated and unauthenticated users (route `path="*"` has no `ProtectedRoute` wrapper in `App.tsx`).

Change:
- Import `useAuth` to check if user is authenticated.
- Import `AppLayout` for the authenticated case.
- **If authenticated**: Render inside `<AppLayout title="404">` so the full header (with "EMS 2.0" center + user prefix) is visible. The 404 content renders in the main area.
- **If not authenticated**: Render standalone with a centered "EMS 2.0" brand above the 404 card (same teal styling: `text-primary font-bold text-xl`, IBM Plex Sans). Also i18n the hardcoded "Oops! Page not found" and "Return to Home" strings.
- Handle `loading` state from `useAuth` to avoid flash.

### 4. `src/pages/ResetPassword.tsx` -- Add brand

This page is always standalone (no sidebar/header). Currently has no "EMS 2.0" branding.

Change:
- Add a centered "EMS 2.0" text above the card, matching Auth.tsx styling: `text-primary font-bold text-2xl` with `fontFamily: "IBM Plex Sans"`. Placed between the top of the page and the card, with appropriate margin.

### 5. `src/locales/en.json` -- Add i18n keys

```json
"header": {
  "userPrefix": "User:",
  "linkedToStaff": "Linked to staff:",
  "notLinkedToStaff": "Not linked to staff record"
}
```

Note: `nav.signOut` already exists ("Sign out" / "Cerrar sesion"). No new key needed for sign-out.

### 6. `src/locales/es.json` -- Add i18n keys

```json
"header": {
  "userPrefix": "Usuario:",
  "linkedToStaff": "Vinculado al personal:",
  "notLinkedToStaff": "No vinculado a registro de personal"
}
```

### 7. No changes to these files (confirmed):

- `App.tsx` -- route structure unchanged (NotFound handles its own layout internally)
- `AppLayout.tsx` -- structure unchanged
- `MobileBottomNav.tsx` -- unaffected
- `MobileMoreDrawer.tsx` -- unaffected
- `Auth.tsx` -- keeps its own independent branding
- All 25 page components -- they already pass `title` props

---

## Visual Result

```text
Desktop (sidebar open):
+--SIDEBAR---+---HEADER BAR (white bg, grid 1fr auto 1fr)-------------------+
|  PRINCIPAL |  [=] Usuario: Isaac Cori - Panel de Co...  EMS 2.0  [b] [ICA] |
|  Panel...  |                                                                |
|  Clientes  |  (page content)                                                |
|  ...       |                                                                |
|  [logout]  |                                                                |
+------------+----------------------------------------------------------------+

Desktop (sidebar collapsed -- offcanvas, fully hidden):
+---HEADER BAR (white bg, grid 1fr auto 1fr)---------------------------+
| [=] Usuario: Isaac Cori - Panel de Control   EMS 2.0     [b] [ICA]   |
|                                                                       |
| (page content)                                                        |
+-----------------------------------------------------------------------+

Mobile (<768px):
+---HEADER BAR (grid 1fr auto 1fr)------------------+
| Usuario: Isaac C...  EMS 2.0  [b] [IC]            |
+----------------------------------------------------+
| (page content)                                     |
+----------------------------------------------------+
| [home] [time] [track] [exp] [more]                 |
+----------------------------------------------------+

404 (not authenticated):
+----------------------------------------------------+
|                    EMS 2.0                          |
|                                                    |
|                     404                            |
|           Oops! Page not found                     |
|             Return to Home                         |
+----------------------------------------------------+

404 (authenticated -- inside AppLayout):
+---HEADER BAR----------------------------------------+
| [=] Usuario: Isaac Cori - 404    EMS 2.0   [b] [ICA]|
|                                                      |
|                     404                              |
|           Oops! Page not found                       |
|             Return to Home                           |
+------------------------------------------------------+

Reset Password:
+----------------------------------------------------+
|                    EMS 2.0                          |
|                                                    |
|          [Reset Password Card]                     |
+----------------------------------------------------+
```

---

## Files Summary

| # | File | Action |
|---|------|--------|
| 1 | `src/components/layout/AppHeader.tsx` | 3-zone grid layout (`1fr auto 1fr`): user prefix + title left (truncate), "EMS 2.0" true-centered, actions right; i18n all hardcoded strings |
| 2 | `src/components/layout/AppSidebar.tsx` | Remove `SidebarHeader` ("EMS 2.0"), remove userName from footer, keep only sign-out icon |
| 3 | `src/pages/NotFound.tsx` | Conditional: authenticated users get `AppLayout` wrapper; unauthenticated get standalone with "EMS 2.0" brand |
| 4 | `src/pages/ResetPassword.tsx` | Add centered "EMS 2.0" brand above the card |
| 5 | `src/locales/en.json` | Add `header.userPrefix`, `header.linkedToStaff`, `header.notLinkedToStaff` |
| 6 | `src/locales/es.json` | Add `header.userPrefix`, `header.linkedToStaff`, `header.notLinkedToStaff` |

---

## Acceptance Tests

1. **Desktop, sidebar open** -- Header shows "Usuario: Isaac Cori - Panel de Control" on the left (truncates if needed), "EMS 2.0" (teal) perfectly centered, bell + avatar on the right. Sidebar has NO "EMS 2.0" branding. Sidebar footer has NO username text, only sign-out icon.
2. **Desktop, sidebar collapsed** -- Same header. Brand does NOT disappear. Center stays centered.
3. **Long page title test** -- Navigate to a page with a long title. "EMS 2.0" must remain centered; the left title truncates with ellipsis.
4. **Mobile/Tablet** -- Same header format (truncates but full text in `title` attribute). "EMS 2.0" still visible and centered. Bottom nav works normally.
5. **Language switch to English** -- Header shows "User: Isaac Cori - Dashboard". Dropdown shows "Linked to staff:" and "Sign out" in English.
6. **User not linked to staff** -- Header falls back to just the page title (no prefix). Dropdown shows "Not linked to staff record".
7. **Login page** -- Still shows its own independent "EMS 2.0" branding. Unaffected.
8. **Reset Password page** -- Shows centered "EMS 2.0" above the card. Teal, IBM Plex Sans, bold.
9. **404 page (authenticated)** -- Renders inside AppLayout with header showing "Usuario: Isaac Cori - 404" and centered "EMS 2.0".
10. **404 page (not authenticated)** -- Renders standalone with centered "EMS 2.0" brand above the 404 content.


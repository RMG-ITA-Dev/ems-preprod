

# Plan v10: Separate User Roles Tab + Reorder Global Settings Last

**Plan ID**: UI-0225-settings-tab-reorder-v1

---

## Problem

Currently, the "Gestion de Roles de Usuario" (UserRolesManager) component lives inside the "Configuracion Global" tab. The user wants:

1. UserRolesManager gets its own dedicated tab, placed after "Feriados"
2. "Configuracion Global" becomes the last tab

---

## Changes

### File: `src/pages/Settings.tsx` (MODIFY)

**Tab triggers (lines 340-352)** -- Reorder the admin-only tabs so the sequence is:

```
Account | Industries | Rates | Activities | Expense Types | Holidays | User Roles | Global Settings
```

Specifically:
- Move `holidays` tab trigger before `roles` (new)
- Add a new `roles` tab trigger using `t("userRoles.title")`
- Move `global` tab trigger to last position

**Tab content (lines 441-624)** -- Three changes:

1. **Remove** `<UserRolesManager />` from inside the `global` TabsContent (line 443).
2. **Add** a new `TabsContent value="roles"` containing only `<UserRolesManager />`, placed after holidays.
3. **Reorder** so holidays content comes before roles, and global content comes last.

### File: `src/locales/en.json` and `src/locales/es.json` (MODIFY)

Add a new key `settings.userRoles` for the tab label:
- en: `"userRoles": "User Roles"`
- es: `"userRoles": "Roles de Usuario"`

---

## What Stays Unchanged

- UserRolesManager component itself -- no changes needed
- Global Settings card content -- unchanged, just no longer shares a tab with UserRolesManager
- Non-admin users still cannot see the Holidays, User Roles, or Global Settings tabs
- The `isGlobalTabActive` / focus mode logic stays tied to `activeTab === "global"`

---

## Acceptance Criteria

1. Admin sees tabs in order: Account, Industries, Rates, Activities, Expense Types, Holidays, User Roles, Global Settings
2. User Roles tab shows only the UserRolesManager component
3. Global Settings tab shows only the settings card (no UserRolesManager)
4. Non-admin users do not see the Holidays, User Roles, or Global Settings tabs


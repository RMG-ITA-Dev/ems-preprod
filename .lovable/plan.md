

# Remove "Usuario:" Prefix from Header User Name

## What Changes

The header currently shows **"Usuario: Isaac Cori Alvarez"**. After this change it will show just **"Isaac Cori Alvarez"**.

Since the header is a shared component used on every authenticated page (Dashboard, Clients, Engagements, Staff, etc.), this single change covers all pages automatically.

## Technical Details

### 1. `src/components/layout/AppHeader.tsx`

**Lines 81-83** -- Remove the `t("header.userPrefix")` usage:

- Line 81: Change `title={\`${t("header.userPrefix")} ${displayName || t("common.user")}\`}` to `title={displayName || t("common.user")}`
- Line 83: Change `{t("header.userPrefix")} {displayName || t("common.user")}` to `{displayName || t("common.user")}`

No other file uses `header.userPrefix`. The i18n keys (`header.userPrefix` in en.json and es.json) can be left in place as dormant -- removing them is optional and harmless either way.

### Files changed: 1

| File | Change |
|------|--------|
| `AppHeader.tsx` | Remove two references to `t("header.userPrefix")` (lines 81, 83) |

No changes to: MobileMoreDrawer (it does not use this prefix), locale files, or any other component.


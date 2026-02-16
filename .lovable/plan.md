
# Header/Sidebar Layout Reorganization + Brand Rename (v9 -- Final)

## Verified Ground Truth (every claim proven by file reads)

### AppSidebar.tsx (152 lines)
- Line 28: Imports `SidebarFooter` (NO `SidebarHeader` -- confirmed absent from import list and JSX)
- Line 9: `LogOut` IS imported
- Line 15: `useTranslation` IS imported; line 32: `const { t } = useTranslation()` exists
- Line 33: `const { signOut } = useAuth()` exists
- Line 56-59: `handleSignOut` EXISTS (calls `signOut()` then `navigate("/auth")`)
- Line 63: `SidebarContent className="px-3 py-4"`
- Lines 139-149: `SidebarFooter` with simple sign-out icon button (centered via `justify-center`)
- NO `SidebarHeader` block, NO `userName` variable, NO "EMS 2.0" in this file

### AppHeader.tsx (123 lines)
- Line 51: Uses `grid grid-cols-[1fr_auto_1fr] items-center` (IS CSS grid, 3-zone)
- Lines 46-48: `compositeTitle` variable EXISTS
- Lines 32-38: `userInitials` computation exists
- Lines 40-44: `displayName` computation exists
- Lines 68-76: Center zone with "EMS 2.0" brand (line 74)
- Lines 85-119: Full `DropdownMenu` with avatar circle trigger
- Line 1: Imports `Bell, Menu, LogOut, UserCheck, UserX`
- Line 8: Imports `Badge`
- Lines 9-15: Imports `DropdownMenu*`
- Line 100: Uses `text-success` class (valid -- defined in index.css line 65)

### NotFound.tsx (59 lines)
- Line 3: `useTranslation` IS imported
- Line 5: `useAuth` IS imported
- Line 6: `AppLayout` IS imported
- Lines 15-17: Uses `t("notFound.title")` and `t("notFound.returnHome")`
- Line 52: "EMS 2.0" EXISTS (unauthenticated standalone view)

### ResetPassword.tsx (154 lines)
- Line 71: "EMS 2.0" EXISTS (invalid-session state)
- Line 97: "EMS 2.0" EXISTS (valid-session state)

### Auth.tsx
- Line 137: "EMS 2.0" EXISTS

### MobileMoreDrawer.tsx (134 lines)
- Line 2: `useTranslation` IS imported; line 30: `const { t } = useTranslation()` exists
- Line 19: `useAuth` IS imported; line 31: `const { signOut } = useAuth()` -- destructures ONLY `signOut`
- Line 127: Uses `t("auth.signOut")` -- BUG: key `auth.signOut` does NOT exist
- NO profile section (no avatar, no name, no email, no staff badge, no `useCurrentStaff`)

### index.html (35 lines)
- Line 6: `<title>EMS 2.0 - Engagement Management System</title>`
- Line 8: `<meta name="author" content="EMS 2.0" />`
- Line 11: `<meta property="og:title" content="EMS 2.0 - Engagement Management System" />`
- Line 17: `<meta name="twitter:title" content="EMS 2.0 - Engagement Management System" />`

### i18n keys -- ALL 7 EXIST (verified by search):
| Key | en.json | es.json |
|-----|---------|---------|
| `header.userPrefix` | "User:" | "Usuario:" |
| `header.linkedToStaff` | "Linked to staff:" | "Vinculado al personal:" |
| `header.notLinkedToStaff` | "Not linked to staff record" | "No vinculado a registro de personal" |
| `notFound.title` | "Oops! Page not found" | "Pagina no encontrada!" |
| `notFound.returnHome` | "Return to Home" | "Volver al Inicio" |
| `common.user` | "User" | "Usuario" |
| `nav.signOut` | "Sign out" | "Cerrar sesion" |

### `text-success` -- VALID (defined in src/index.css line 65 as HSL `142 76% 36%`, used in 22 files)

### `entities.staff` -- DOES NOT EXIST in any locale file. Must NOT be used.

No locale file changes needed. No SidebarHeader removal needed.

---

## "EMS 2.0" Audit (7 user-facing instances across 4 files + 4 metadata in index.html)

| File | Line | Action |
|------|------|--------|
| `src/components/layout/AppHeader.tsx` | 74 | **REPLACE** with `RuizmierGroup - EMS 2.0` |
| `src/pages/Auth.tsx` | 137 | **REPLACE** with `RuizmierGroup - EMS 2.0` |
| `src/pages/ResetPassword.tsx` | 71 | **REPLACE** with `RuizmierGroup - EMS 2.0` |
| `src/pages/ResetPassword.tsx` | 97 | **REPLACE** with `RuizmierGroup - EMS 2.0` |
| `src/pages/NotFound.tsx` | 52 | **REPLACE** with `RuizmierGroup - EMS 2.0` |
| `index.html` | 6 | **REPLACE** title |
| `index.html` | 8 | **REPLACE** author |
| `index.html` | 11 | **REPLACE** og:title |
| `index.html` | 17 | **REPLACE** twitter:title |

Exempted: `src/lib/logger.ts` line 2 (code comment, not user-facing).

---

## Detailed Changes

### 1. `src/components/layout/AppHeader.tsx` (123 lines)

**Current layout (grid 1fr auto 1fr):**
```
LEFT: [=] {compositeTitle}  |  CENTER: EMS 2.0  |  RIGHT: [bell] [ICA dropdown]
```

**New layout (same grid):**
```
LEFT: [=] {title}  |  CENTER: RuizmierGroup - EMS 2.0 (md+ only)  |  RIGHT: [bell] Usuario: Name
```

**Imports to REMOVE:**
- Line 1: Remove `LogOut`, `UserCheck`, `UserX` from lucide import (keep `Bell`, `Menu`)
- Line 6: Remove `useNavigate` import
- Line 8: Remove `Badge` import
- Lines 9-15: Remove entire `DropdownMenu*` import block

**Variables/functions to REMOVE:**
- Lines 25, 27-30: Remove `navigate` and `handleSignOut`
- Lines 32-38: Remove `userInitials` computation
- Lines 46-48: Remove `compositeTitle` variable

**Left zone (lines 52-66):**
- Line 62: Change `title={compositeTitle}` to `title={title}`
- Line 64: Change `{compositeTitle}` to `{title}`

**Center zone (lines 68-76):**
- Line 69: Change `"flex items-center justify-center px-2"` to `"hidden md:flex items-center justify-center px-2"`
- Line 74: Change `EMS 2.0` to `RuizmierGroup - EMS 2.0`

**Right zone (lines 78-120):**
- Keep the Bell button (lines 80-83)
- Remove the entire `DropdownMenu` block (lines 85-119)
- After the Bell, add plain text:
```jsx
<span
  className="text-sm font-semibold text-foreground truncate"
  title={`${t("header.userPrefix")} ${displayName || t("common.user")}`}
>
  {t("header.userPrefix")} {displayName || t("common.user")}
</span>
```
- Add `min-w-0` to the right zone container div (line 79) for truncation safety

**Keep:** `useAuth` (for `user`), `useCurrentStaff` (for `displayName`/`staffRecord`), `useTranslation`, `Bell`, `Menu`, `Button`, `SidebarTrigger`

### 2. `src/components/layout/AppSidebar.tsx` (152 lines)

No SidebarHeader exists. No removal needed.

**A) Top spacer (line 63):**
- Change `<SidebarContent className="px-3 py-4">` to `<SidebarContent className="px-3 pb-4">`
- Insert `<div className="h-16" />` as first child inside SidebarContent (before line 64's `<SidebarGroup>`)
- Result: exactly 64px top offset (matching header h-16), no double-push

**B) Footer (lines 139-149) -- replace sign-out button with avatar + dropdown:**

**New imports to ADD:**
- `useCurrentStaff` from `@/hooks/useCurrentStaff`
- `DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger` from `@/components/ui/dropdown-menu`
- `Badge` from `@/components/ui/badge`
- `UserCheck, UserX` from lucide-react (add to existing lucide import on lines 1-14)

**Note:** `LogOut` is ALREADY imported (line 9). `useTranslation` and `{ t }` ALREADY in scope (lines 15, 32). `useAuth` ALREADY imported (line 17). `handleSignOut` ALREADY defined (lines 56-59).

**Inside the component function, ADD after line 34:**
- `const { user } = useAuth()` -- WAIT: line 33 already has `const { signOut } = useAuth()`. Change to `const { user, signOut } = useAuth()`
- `const { data: staffRecord } = useCurrentStaff()`
- `userInitials` computation (copied from current AppHeader lines 32-38):
```typescript
const userInitials = staffRecord?.initials
  ? staffRecord.initials
  : staffRecord
    ? `${staffRecord.first_name[0]}${staffRecord.last_name[0]}`.toUpperCase()
    : user?.user_metadata?.first_name && user?.user_metadata?.last_name
      ? `${user.user_metadata.first_name[0]}${user.user_metadata.last_name[0]}`.toUpperCase()
      : user?.email?.substring(0, 2).toUpperCase() || "U";
```
- `displayName` computation (copied from current AppHeader lines 40-44):
```typescript
const displayName = staffRecord
  ? `${staffRecord.first_name} ${staffRecord.last_name}`
  : user?.user_metadata?.first_name
    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
    : null;
```

**Replace lines 139-149 with:**
```jsx
<SidebarFooter className="p-4 border-t border-sidebar-border">
  <div className="flex items-center justify-start">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-9 w-9 rounded-full bg-accent flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity">
          <span className="text-accent-foreground font-medium text-sm">{userInitials}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{displayName || t("common.user")}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          {staffRecord ? (
            <div className="flex items-center gap-2 text-xs">
              <UserCheck className="h-3.5 w-3.5 text-success" />
              <span className="text-muted-foreground">{t("header.linkedToStaff")} </span>
              {staffRecord.category?.category_name && (
                <Badge variant="secondary" className="text-xs">
                  {staffRecord.category.category_name}
                </Badge>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserX className="h-3.5 w-3.5" />
              <span>{t("header.notLinkedToStaff")}</span>
            </div>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</SidebarFooter>
```

**Key compile-safety notes:**
- `handleSignOut` is ALREADY defined at lines 56-59 (calls `signOut()` then `navigate("/auth")`). Reused directly.
- `LogOut` is ALREADY imported at line 9. Reused directly.
- `t(...)` is ALREADY in scope from line 32.
- `text-success` is VALID (defined in index.css).
- `t("entities.staff")` is NOT used. Badge only renders if `staffRecord.category?.category_name` is truthy.
- Footer uses `justify-start` (not `justify-center`) to position avatar in lower-LEFT.

This is the ONE AND ONLY full user dropdown on desktop.

### 3. `src/components/layout/MobileMoreDrawer.tsx` (134 lines)

**A) New imports to ADD:**
- `useCurrentStaff` from `@/hooks/useCurrentStaff`
- `Badge` from `@/components/ui/badge`
- `UserCheck, UserX` from lucide-react (add to existing lucide import on lines 3-12)

**Inside the component function (after line 32), ADD:**
- Change line 31 from `const { signOut } = useAuth()` to `const { user, signOut } = useAuth()`
- `const { data: staffRecord } = useCurrentStaff()`
- `userInitials` computation (same as sidebar, copied from AppHeader)
- `displayName` computation (same as sidebar, copied from AppHeader)

**B) Insert profile block (between line 65 DrawerHeader closing and line 66 div.px-4):**

```jsx
{/* Profile section */}
<div className="px-4 pb-4 mb-2 border-b border-border">
  <div className="flex items-center gap-3">
    <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
      <span className="text-accent-foreground font-medium text-sm">{userInitials}</span>
    </div>
    <div className="min-w-0">
      <p className="text-sm font-medium truncate">{displayName || t("common.user")}</p>
      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
    </div>
  </div>
  <div className="mt-2 px-1">
    {staffRecord ? (
      <div className="flex items-center gap-2 text-xs">
        <UserCheck className="h-3.5 w-3.5 text-success" />
        <span className="text-muted-foreground">{t("header.linkedToStaff")} </span>
        {staffRecord.category?.category_name && (
          <Badge variant="secondary" className="text-xs">
            {staffRecord.category.category_name}
          </Badge>
        )}
      </div>
    ) : (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <UserX className="h-3.5 w-3.5" />
        <span>{t("header.notLinkedToStaff")}</span>
      </div>
    )}
  </div>
</div>
```

**C) Fix broken i18n key (line 127):**
- Change `t("auth.signOut")` to `t("nav.signOut")`

### 4. `src/pages/Auth.tsx`
- Line 137: Replace `EMS 2.0` with `RuizmierGroup - EMS 2.0`

### 5. `src/pages/ResetPassword.tsx`
- Line 71: Replace `EMS 2.0` with `RuizmierGroup - EMS 2.0`
- Line 97: Replace `EMS 2.0` with `RuizmierGroup - EMS 2.0`

### 6. `src/pages/NotFound.tsx`
- Line 52: Replace `EMS 2.0` with `RuizmierGroup - EMS 2.0`

### 7. `index.html`
- Line 6: `<title>RuizmierGroup - EMS 2.0 - Engagement Management System</title>`
- Line 8: `<meta name="author" content="RuizmierGroup - EMS 2.0" />`
- Line 11: `<meta property="og:title" content="RuizmierGroup - EMS 2.0 - Engagement Management System" />`
- Line 17: `<meta name="twitter:title" content="RuizmierGroup - EMS 2.0 - Engagement Management System" />`

### 8. Locale files -- NO CHANGES
All 7 required keys verified to exist. `entities.staff` is NOT used anywhere in v9.

---

## Compile-Safety Checklist

| Potential issue | Status |
|----------------|--------|
| `handleSignOut` undefined in sidebar | SAFE -- already defined at lines 56-59 |
| `LogOut` not imported in sidebar | SAFE -- already imported at line 9 |
| `t(...)` not in scope in sidebar | SAFE -- already from line 32 |
| `t("entities.staff")` used as fallback | NOT USED -- badge only renders if `category_name` is truthy |
| `text-success` not a valid class | VALID -- defined in index.css line 65 |
| `t("auth.signOut")` broken key | FIXED to `t("nav.signOut")` |
| `useTranslation` missing in MobileMoreDrawer | SAFE -- already imported line 2, used line 30 |
| Footer avatar not left-aligned | FIXED -- uses `justify-start` instead of `justify-center` |

---

## Files Summary

| # | File | Action |
|---|------|--------|
| 1 | `AppHeader.tsx` | Remove dropdown/avatar/compositeTitle/handleSignOut/navigate; left = title only; center = brand with `hidden md:flex`; right = bell + plain text "Usuario: Name" with `min-w-0 truncate` |
| 2 | `AppSidebar.tsx` | Change `py-4` to `pb-4` + add `h-16` spacer; replace footer with avatar + upward dropdown (reusing existing `handleSignOut`, `LogOut`, `t()`) |
| 3 | `MobileMoreDrawer.tsx` | Add profile section (avatar/name/email/badge) at top; fix `auth.signOut` to `nav.signOut` |
| 4 | `Auth.tsx` | Replace "EMS 2.0" line 137 |
| 5 | `ResetPassword.tsx` | Replace "EMS 2.0" lines 71, 97 |
| 6 | `NotFound.tsx` | Replace "EMS 2.0" line 52 |
| 7 | `index.html` | Replace 4 metadata occurrences lines 6, 8, 11, 17 |

No changes to: `App.tsx`, `AppLayout.tsx`, `MobileBottomNav.tsx`, locale files, page components.

---

## Post-Change Verification Checklist

**Repo search:**
```
grep -rn "EMS 2\.0" src/ index.html
```
Expected: all matches show "RuizmierGroup - EMS 2.0" except `src/lib/logger.ts` line 2 (code comment, exempted).

**UI tests:**

| # | Test | Expected |
|---|------|----------|
| 1 | Desktop, sidebar open | Header: `[=] Panel de Control` left, `RuizmierGroup - EMS 2.0` centered (teal), `[bell] Usuario: Isaac Cori Alvarez` right as plain text. No avatar/dropdown in header. |
| 2 | Desktop, sidebar collapsed | Same header. Brand stays centered. |
| 3 | Sidebar footer | ICA avatar at bottom-LEFT. Click opens upward dropdown: name, email, staff badge (only if category exists), sign-out. Only user dropdown on desktop. |
| 4 | "PRINCIPAL" alignment | Starts below header bar line (h-16 spacer + pb-4 only, no double gap). |
| 5 | Long title/name | Left truncates. Right truncates. Center does not wrap. |
| 6 | Mobile (<768px) | Header: title left, bell + "Usuario: Name" right (truncated). Brand HIDDEN. Bottom nav works. |
| 7 | MobileMoreDrawer | Profile at top: avatar, name, email, staff badge. Sign-out works (uses `nav.signOut`). |
| 8 | Language switch | All strings render correctly in both EN and ES. No raw keys. |
| 9 | Auth page | "RuizmierGroup - EMS 2.0" on left panel. |
| 10 | ResetPassword | "RuizmierGroup - EMS 2.0" above card (both states). |
| 11 | NotFound (auth) | Inside AppLayout, header has brand. |
| 12 | NotFound (unauth) | Standalone with "RuizmierGroup - EMS 2.0". |
| 13 | Browser tab | "RuizmierGroup - EMS 2.0 - Engagement Management System". |

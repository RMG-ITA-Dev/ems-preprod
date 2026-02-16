

# Move Avatar+Dropdown to Header Right + Purple User Name (v9.2)

## Verified Current State (every file read on disk)

### AppHeader.tsx (66 lines)
- Line 1: Imports `Bell, Menu` from lucide (NO `LogOut`, `UserCheck`, `UserX`)
- Line 4: `useAuth` imported; line 14: `const { user } = useAuth()`
- Line 5: `useCurrentStaff` imported; line 15: `const { data: staffRecord } = useCurrentStaff()`
- Lines 17-21: `displayName` computation exists
- NO `userInitials`, NO `handleSignOut`, NO `useNavigate`, NO `DropdownMenu` imports, NO `Badge`
- Lines 52-63: Right zone has bell + plain text span (no avatar, no dropdown)
- Line 58: User name styled `text-sm font-semibold text-foreground truncate`

### AppSidebar.tsx (209 lines)
- Lines 33-39: Imports `DropdownMenu*`
- Line 40: Imports `Badge`
- Lines 14-15: Imports `UserCheck, UserX` from lucide
- Line 9: `LogOut` imported
- Line 44: `const { user, signOut } = useAuth()`
- Line 45: `const { data: staffRecord } = useCurrentStaff()`
- Lines 48-54: `userInitials` computation
- Lines 56-60: `displayName` computation
- Lines 62-65: `handleSignOut` function
- Lines 166-206: Full avatar + DropdownMenu in SidebarFooter

### MobileMoreDrawer.tsx (184 lines)
- Lines 85-114: Profile section with avatar, name, email, staff badge -- ALREADY COMPLETE
- Line 177: Uses `t("nav.signOut")` -- ALREADY FIXED
- No changes needed

### Auth.tsx (352 lines)
- Line 137: "RuizmierGroup - EMS 2.0" -- ALREADY DONE

### ResetPassword.tsx (154 lines)
- Line 71: "RuizmierGroup - EMS 2.0" -- ALREADY DONE
- Line 97: "RuizmierGroup - EMS 2.0" -- ALREADY DONE

### NotFound.tsx (59 lines)
- Line 52: "RuizmierGroup - EMS 2.0" -- ALREADY DONE

### index.html (35 lines)
- Lines 6, 8, 11, 17: All "RuizmierGroup - EMS 2.0" -- ALREADY DONE

### `text-brand-purple` -- VALID
- CSS variable: `--brand-purple: 255 82% 65%` (index.css line 80)
- Tailwind config: `brand.purple` mapped to `hsl(var(--brand-purple))` (tailwind.config.ts line 83)
- Already used in codebase (e.g., button.tsx default variant)

---

## Summary of What v9.2 Does

Two targeted changes (everything else from v9 is already done and confirmed):

1. **Move** the avatar circle (ICA) + its full DropdownMenu from the sidebar footer to the header right zone, positioned AFTER the user name text
2. **Restyle** the "Usuario: Name" text to `text-base font-bold text-brand-purple` (bigger + purple)

---

## Changes

### 1. `src/components/layout/AppHeader.tsx` (66 lines)

**Add imports:**
- Line 1: Change `import { Bell, Menu } from "lucide-react"` to `import { Bell, Menu, LogOut, UserCheck, UserX } from "lucide-react"`
- Add `import { useNavigate } from "react-router-dom"` (new line after line 6)
- Add `import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"`
- Add `import { Badge } from "@/components/ui/badge"`

**Inside component function (after line 15), add:**
- `const navigate = useNavigate()`
- `userInitials` computation (copy from AppSidebar lines 48-54):
```typescript
const userInitials = staffRecord?.initials
  ? staffRecord.initials
  : staffRecord
    ? `${staffRecord.first_name[0]}${staffRecord.last_name[0]}`.toUpperCase()
    : user?.user_metadata?.first_name && user?.user_metadata?.last_name
      ? `${user.user_metadata.first_name[0]}${user.user_metadata.last_name[0]}`.toUpperCase()
      : user?.email?.substring(0, 2).toUpperCase() || "U";
```
- Change `const { user } = useAuth()` to `const { user, signOut } = useAuth()`
- Add `handleSignOut`:
```typescript
const handleSignOut = async () => {
  await signOut();
  navigate("/auth");
};
```

**Replace right zone (lines 51-63) with:**
```jsx
{/* Right zone: bell + purple user name + avatar dropdown */}
<div className="flex items-center gap-3 justify-self-end min-w-0">
  <Button variant="ghost" size="icon" className="relative flex-shrink-0">
    <Bell className="h-5 w-5 text-muted-foreground" />
    <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-accent rounded-full" />
  </Button>
  <span
    className="text-base font-bold text-brand-purple truncate hidden sm:inline"
    title={`${t("header.userPrefix")} ${displayName || t("common.user")}`}
  >
    {t("header.userPrefix")} {displayName || t("common.user")}
  </span>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="h-9 w-9 rounded-full bg-accent flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity flex-shrink-0">
        <span className="text-accent-foreground font-medium text-sm">{userInitials}</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-64">
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
```

**Key details:**
- User name: `text-base font-bold text-brand-purple` (bigger than previous `text-sm`, brand purple color)
- User name: `hidden sm:inline` to prevent mobile overflow; avatar always visible on all screen sizes
- Dropdown opens downward with `align="end"` (standard header behavior)
- No `t("entities.staff")` used; badge renders only if `staffRecord.category?.category_name` is truthy

### 2. `src/components/layout/AppSidebar.tsx` (209 lines)

**Revert footer (replace lines 166-206) to simple sign-out button:**
```jsx
<SidebarFooter className="p-4 border-t border-sidebar-border">
  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton onClick={handleSignOut} tooltip={t("nav.signOut")}>
        <LogOut className="h-4 w-4" />
        <span>{t("nav.signOut")}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</SidebarFooter>
```

**Remove imports no longer needed:**
- Lines 33-39: Remove entire `DropdownMenu*` import block
- Line 40: Remove `Badge` import
- Lines 14-15: Remove `UserCheck, UserX` from lucide import (keep `LogOut` and all nav icons)
- Line 20: Remove `useCurrentStaff` import

**Remove from component function:**
- Line 45: Remove `const { data: staffRecord } = useCurrentStaff()`
- Lines 48-54: Remove `userInitials` computation
- Lines 56-60: Remove `displayName` computation
- Change line 44 from `const { user, signOut } = useAuth()` back to `const { signOut } = useAuth()` (user no longer needed)

**Keep:** `handleSignOut` (lines 62-65), `LogOut` import, `useAuth`, `useNavigate`, `useTranslation`

### 3-7. No changes needed

| File | Status |
|------|--------|
| `MobileMoreDrawer.tsx` | Already has profile section + `nav.signOut` fix from v9 |
| `Auth.tsx` | Already has "RuizmierGroup - EMS 2.0" |
| `ResetPassword.tsx` | Already has "RuizmierGroup - EMS 2.0" (both states) |
| `NotFound.tsx` | Already has "RuizmierGroup - EMS 2.0" + i18n + AppLayout |
| `index.html` | Already has "RuizmierGroup - EMS 2.0" in all 4 metadata |
| Locale files | All keys exist, no additions needed |

---

## Compile-Safety Checklist

| Item | Status |
|------|--------|
| `handleSignOut` defined in AppHeader | SAFE -- added via plan |
| `LogOut` imported in AppHeader | SAFE -- added to lucide import |
| `text-brand-purple` valid Tailwind class | SAFE -- `brand.purple` in tailwind.config.ts, `--brand-purple` in index.css |
| `t("entities.staff")` not used | SAFE -- badge only renders if `category_name` is truthy |
| `text-success` valid | SAFE -- defined in index.css line 65 |
| Sidebar `SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton` in scope | SAFE -- already imported (lines 28-30) |
| `handleSignOut` still works in sidebar | SAFE -- kept (lines 62-65) |

---

## Visual Result

```text
Desktop header right zone (after change):
  [bell]  Usuario: Isaac Cori Alvarez  (ICA)
          ^purple, bold, text-base^      ^avatar, dropdown on click^

Dropdown (opens downward from avatar, aligned right):
+---------------------------+
| Isaac Cori Alvarez        |
| icori@ruizmier.com        |
|---------------------------|
| Vinculado al personal:    |
| [Gerente]                 |
|---------------------------|
| Cerrar sesion             |
+---------------------------+

Sidebar footer (simplified):
| [LogOut icon] Cerrar sesion |

Mobile (<768px):
  [bell] (ICA)       <-- user name hidden, avatar always visible
  MobileMoreDrawer still has full profile section (unchanged from v9)
```

---

## Files Summary

| # | File | Action |
|---|------|--------|
| 1 | `AppHeader.tsx` | Add avatar+dropdown to right zone after user name; style name as `text-base font-bold text-brand-purple`; add DropdownMenu/Badge/LogOut/UserCheck/UserX/useNavigate imports + userInitials/handleSignOut logic |
| 2 | `AppSidebar.tsx` | Revert footer to simple sign-out button; remove DropdownMenu/Badge/UserCheck/UserX/useCurrentStaff imports + userInitials/displayName/staffRecord |

No changes to: MobileMoreDrawer, Auth, ResetPassword, NotFound, index.html, locale files.

---

## Post-Change Verification

**UI tests:**

| # | Test | Expected |
|---|------|----------|
| 1 | Desktop header right | Bell, then "Usuario: Isaac Cori Alvarez" in purple bold text-base, then ICA avatar circle. Click avatar opens dropdown with name/email/badge/sign-out. |
| 2 | Desktop sidebar footer | Simple "Cerrar sesion" button with LogOut icon. No avatar, no dropdown. |
| 3 | Mobile header | Bell + ICA avatar visible. "Usuario: Name" hidden (sm:inline). |
| 4 | MobileMoreDrawer | Profile section unchanged: avatar, name, email, staff badge, sign-out. |
| 5 | Sign-out from header dropdown | Calls handleSignOut, redirects to /auth. |
| 6 | Sign-out from sidebar footer | Same behavior. |
| 7 | Branding everywhere | "RuizmierGroup - EMS 2.0" on all surfaces (confirmed, no changes needed). |
| 8 | Browser tab | "RuizmierGroup - EMS 2.0 - Engagement Management System" (confirmed). |


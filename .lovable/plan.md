

# Align Sidebar Icons with Dashboard Tab Icons

## What Changes

Match the sidebar icons for Clients and Engagements to their dashboard counterparts:

| Sidebar Item | Current Icon | New Icon | Matches Dashboard Tab |
|-------------|-------------|----------|----------------------|
| Clients | `Building2` | `Briefcase` | Cartera (client portfolio) |
| Engagements | `Briefcase` | `FolderKanban` | Encargo (engagement drill-down) |

`Building2` is reserved exclusively for "Practica" (firm-wide practice view) in the dashboard.

## Technical Details

### File: `src/components/layout/AppSidebar.tsx`

**Imports (lines 1-14):**
- Remove `Building2` from lucide import
- Add `FolderKanban` to lucide import
- `Briefcase` stays (reassigned to Clients)

**Nav items (lines 42-44):**
- Line 43: Change Clients from `icon: Building2` to `icon: Briefcase`
- Line 44: Change Engagements from `icon: Briefcase` to `icon: FolderKanban`

### Files changed: 1

| File | Change |
|------|--------|
| `AppSidebar.tsx` | Swap Clients icon to `Briefcase`, Engagements icon to `FolderKanban`; update imports |


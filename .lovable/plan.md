

# Document Undocumented Changes in Changelog

## Context

An audit identified 7 significant file changes between stable snapshots that were never documented. These group into 3 logical changelog entries, plus one correction to an existing entry.

## 1. Correction: Remove `useTimesheetWeek.ts` from Plan v2

The audit confirmed that `useTimesheetWeek.ts` is byte-identical between snapshots -- the approved-WO filter already existed before the Plan v2 implementation period. The changelog inaccurately lists it as modified.

**Action:** Remove the `useTimesheetWeek.ts` row from the Plan v2 "Files Modified" table (line 158 of `CHANGELOG-2026-02-17.md`). Add a note that the filter pre-existed.

---

## 2. New Entry: Expense Ownership Tracking ("My Expenses" Toggle)

Documents changes to:
- `src/pages/Expenses.tsx` -- Added `useCurrentStaff`, `Switch`/`Label` imports, `myExpensesOnly` state, `created_by_staff_id` filter logic, and a Switch toggle in the toolbar
- `src/hooks/useExpenseLogMutations.ts` -- Added `created_by_staff_id?: string | null` to the create mutation type
- `src/locales/en.json` / `src/locales/es.json` -- Added "My Expenses" / "Mis Gastos" keys

---

## 3. New Entry: UI Reorganization and Branding Consolidation

Documents the header/sidebar/branding restructuring:
- `src/components/layout/AppSidebar.tsx` -- Removed `SidebarHeader` with "EMS 2.0" branding (moved to header center zone), changed Clients icon from `Building2` to `Briefcase`, changed Engagements icon from `Briefcase` to `FolderKanban`, removed `userName` computation, adjusted padding
- `src/pages/Auth.tsx` -- Changed "EMS 2.0" to "RuizmierGroup - EMS 2.0"
- `src/pages/ResetPassword.tsx` -- Added "RuizmierGroup - EMS 2.0" header to both password-reset views
- `src/pages/Clients.tsx` -- Removed `Building2` icon from client name cells (consistency with new `Briefcase` icon usage)
- `src/components/layout/MobileMoreDrawer.tsx` -- Added `useCurrentStaff`, user initials calculation, display name logic, `UserCheck`/`UserX` icons, `Badge` import for staff info display in the mobile "More" drawer

---

## 4. New Entry: NotFound (404) Page Rewrite

Documents:
- `src/pages/NotFound.tsx` -- Complete rewrite: added authentication check, `AppLayout` wrapper for authenticated users (shows header), i18n support (`notFound.title`, `notFound.returnHome`), standalone branded page for unauthenticated users

---

## File to Modify

| File | Action |
|------|--------|
| `docs/CHANGELOG-2026-02-17.md` | MODIFY -- fix Plan v2 entry + append 3 new changelog sections |

## Technical Details

All three new entries will follow the established changelog format (Problem/Solution/Files Modified/Risk Assessment). They will be appended after the existing Plan v2 entry. The entries are purely retroactive documentation -- no code changes.


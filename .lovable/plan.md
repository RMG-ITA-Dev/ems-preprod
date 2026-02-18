# Plan: Update README.md

## Task

1. Save current `README.md` as `README_Backup_2.md` (exact copy).
2. Create a new `README.md` reflecting the current state of the system (v2.0.10, February 2026).

## Content Strategy

Follow the style of the **current README.md** (no emojis, `---` separators, tables, clean Markdown). Incorporate all features and changes from changelogs through 2026-02-18.

## Key Updates for the New README


| Section                         | What Changes                                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version badge                   | `2.0` -> `2.0 (do not change)`                                                                                                                                                      |
| Core Modules table              | Add **Worksheets**, **Time Tracker**, **Timesheet Approvals**; update descriptions to match current state (e.g., Dashboard now has 4 tabs)                                          |
| Business Logic                  | Add: Rate Locking, Month-End Deadline Rule, Holiday Blocking, Non-Chargeable Engagement Policies, Auto-Approval, Weekly Limit Enforcement, Approved Line Protection                 |
| Internationalization            | Add: locale-aware numeric inputs, validation message localization (factory pattern)                                                                                                 |
| Design System                   | Add Brand Purple `#7c3aed` (already present); confirm all tokens current                                                                                                            |
| Database Schema - Core Tables   | Add `holidays`, `staff_capacity` merged note (`weekly_capacity_hours` on `staff`), `activity_worksheets`, `activity_worksheet_cells`; update `engagements` with policy flags        |
| Database Schema - Key Functions | Add: `enforce_holiday_blocking`, `enforce_activity_default`, `protect_approved_time_entries`, `validate_timer_duration`, `prevent_imported_timer_delete`, `assign_user_role_atomic` |
| Global Settings                 | Add `HOLIDAY_ENGAGEMENT_ID`, `ADM_ACTIVITY_ID`                                                                                                                                      |
| User Roles                      | Update enum to include all 8 roles (admin, partner, director, manager, senior, semisenior, staff, viewer)                                                                           |
| Dashboard Architecture          | Already current; keep as-is                                                                                                                                                         |
| Fiscal Year                     | Already current; keep as-is                                                                                                                                                         |
| Design Consistency Rules        | Already current; keep as-is                                                                                                                                                         |
| Project Structure               | Add `tracker/`, `worksheet/` directories (already listed); confirm current                                                                                                          |
| Edge Functions                  | List current: `assign-user-role`, `dashboard-data`                                                                                                                                  |
| Documentation table             | Add all 5 changelogs                                                                                                                                                                |
| Development section             | Keep as-is                                                                                                                                                                          |
| Deployment section              | Keep URLs current                                                                                                                                                                   |
| Last Updated                    | Change to `February 18, 2026`                                                                                                                                                       |


## Files


| File                 | Action             | Description                               |
| -------------------- | ------------------ | ----------------------------------------- |
| `README_Backup_2.md` | CREATE             | Exact copy of current `README.md`         |
| `README.md`          | CREATE (overwrite) | New version with all updates listed above |


## Style Rules (from current README)

- No emojis in headers
- `---` horizontal rules between major sections
- Tables for structured data
- No embedded SQL (reference `docs/database-schema.sql` instead)
- Clean, professional tone
- Badge shields at top
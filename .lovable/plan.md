

# Plan v1 -- Backup README and Create Updated README

## Context

The current `README.md` is dated February 18, 2026 and is missing all changes from the Feb 24 debug session and subsequent audit reconciliation (Feb 26). Multiple new features, settings, database functions, triggers, and edge functions are undocumented.

## Scope

**In scope**: Backup current README, create updated README reflecting current codebase state.

**Out of scope**: Content changes to other documentation files.

## File-by-File Changes

### W1: Backup -- `README_Backup_3.md`

Copy current `README.md` contents verbatim to `README_Backup_3.md` (following existing convention of `README_Backup.md`, `README_Backup_2.md`).

### W2: Updated `README.md`

All changes below applied to the existing README structure:

#### 1. Header Badge
- Update version badge from `Version-2.0` to `Version-2.0.5`

#### 2. Business Logic Section -- Add missing items
Add after "Hire Date Validation" bullet:
- **Per-Engagement Approval Policy**: `approval_required` flag on engagements; when false, timesheet lines auto-approve on submission regardless of staff category
- **Engagement Date Range Validation**: Four-layer defense (dropdown filtering, per-cell lock, DB trigger, submit gate) prevents time entry outside engagement `start_date`/`end_date`
- **Min/Max Timesheet Limits**: Dual-bound model (`DAILY_MIN`/`DAILY_MAX`/`WEEKLY_MIN`/`WEEKLY_MAX`) replaces legacy single-limit (`DAILY_LIMIT`/`WEEKLY_LIMIT`); atomic RPC with cross-field feasibility validation

#### 3. Engagements Table Description
Update from:
```
engagements | Projects/jobs with partner/manager assignments and policy flags (`work_order_required`, `activity_required`, `is_internal`)
```
To:
```
engagements | Projects/jobs with partner/manager assignments and policy flags (`work_order_required`, `activity_required`, `is_internal`, `approval_required`)
```

#### 4. Key Database Functions -- Add missing
Add to the functions table:
| `submit_timesheet_safe(uuid, uuid, uuid[], boolean)` | Submit timesheet with line approval management, min/max validation, and engagement date range gate |
| `update_timesheet_minmax_settings(numeric, numeric, numeric, numeric, integer)` | Atomic update of DAILY/WEEKLY MIN/MAX settings with feasibility validation |
| `check_time_entry_engagement_dates()` | Trigger function: validates time entry dates against engagement date range |

#### 5. Key Database Triggers -- Add missing
Add to the triggers table:
| `check_time_entry_engagement_dates` | Validates time entry dates fall within engagement `start_date`/`end_date` range |
| `enforce_termination_date` | Prevents time entry after staff termination date |
| `reset_timer_import_on_unlink` | Resets import tracking when timer entry is unlinked |
| `prevent_staff_reactivation` | Prevents reactivation of soft-deleted staff records |
| `validate_submission_has_entries` | Ensures timesheet has entries before submission |

#### 6. Global Settings -- Update table
Replace `DAILY_LIMIT` and `WEEKLY_LIMIT` rows with:
| `DAILY_MIN` | `8` | Minimum hours per day |
| `DAILY_MAX` | `8` | Maximum hours per day |
| `WEEKLY_MIN` | `40` | Minimum hours per week |
| `WEEKLY_MAX` | `40` | Maximum hours per week |

Note: Legacy `DAILY_LIMIT`/`WEEKLY_LIMIT` remain in DB but are inert.

#### 7. Edge Functions -- Add missing
Update the table to include all 5 functions:
| `assign-user-role` | Atomic first-user-admin role assignment during bootstrap |
| `dashboard-data` | Aggregates dashboard analytics (utilization, hours, budget vs actual) |
| `manage-auth-user` | Auth user management (create, update, delete) |
| `test-minmax-settings` | Backend integration tests for min/max settings RPC |
| `test-resubmission-state` | Backend integration tests for timesheet resubmission state |

#### 8. Documentation Table -- Add missing changelogs
Add rows:
| Changelog (Feb 22) | `docs/CHANGELOG-2026-02-22.md` |
| Changelog (Feb 24) | `docs/CHANGELOG-2026-02-24.md` |

#### 9. Last Updated Date
Change from `*Last Updated: February 18, 2026*` to `*Last Updated: February 26, 2026*`

## Acceptance Criteria

1. `README_Backup_3.md` contains exact copy of pre-change README.
2. Updated README includes all 9 categories of changes listed above.
3. No structural changes to existing README sections (preserve headings, table format, order).
4. All new content matches actual codebase state verified via changelog and source files.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Missing a recent change | Cross-referenced with CHANGELOG-2026-02-24.md (all 12 sections) and audit report |
| Backup naming collision | Verified `README_Backup_3.md` does not exist |

## Definition of Done

- `README_Backup_3.md` created with verbatim copy.
- `README.md` updated with all 9 change categories.
- No code or backend changes.


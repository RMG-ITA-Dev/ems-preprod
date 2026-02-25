
## BUG 0213-36: Replace DAILY_LIMIT/WEEKLY_LIMIT with Min/Max Model

**Migration**: `<timestamp>_bug_0213_36_replace_limits_with_minmax.sql`

### Changes

- Added global settings DAILY_MIN (8), DAILY_MAX (8), WEEKLY_MIN (40), WEEKLY_MAX (40).
- Compatibility backfill: existing DAILY_LIMIT=8 mapped to DAILY_MAX; WEEKLY_LIMIT=40 mapped to WEEKLY_MAX.
- DAILY_LIMIT and WEEKLY_LIMIT remain in DB as inert historical data; removed from all runtime code.
- Added update_timesheet_minmax_settings() RPC for backend-authoritative atomic settings write. Validates feasibility invariants server-side and writes all four settings in one transaction.
- submit_timesheet_safe() now validates WEEKLY_MIN <= actual_hours <= WEEKLY_MAX using period-scoped query (period_id + staff_id + is_forecast=false). Raises WEEKLY_MIN_NOT_MET or WEEKLY_MAX_EXCEEDED.
- Settings UI: 2x2 min/max field grid replaces old limit fields. Save calls atomic RPC.
- TimeSheet: submit gating enforces dual-bound check.
- TimesheetGrid: daily coloring uses DAILY_MIN/DAILY_MAX.
- TrackerRecord: daily guard uses DAILY_MAX.
- Dashboard edge function: uses WEEKLY_MAX for weekly_limit payload field.
- Partner/Director auto-approval behavior unchanged.
- Backend integration tests via test-minmax-settings edge function.
- CI guard prevents reintroduction of old settings in runtime code.
- EN/ES i18n parity for all new labels/errors. Old keys kept as dead code.
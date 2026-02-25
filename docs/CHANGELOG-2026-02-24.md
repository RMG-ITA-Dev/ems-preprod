
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

---

## Enhancement: Searchable Engagement Selector with Unified Display

**Plan**: BUG-0220-52-followup-search-display-v3

### Changes

- Created reusable `EngagementCombobox` component (`src/components/tracker/EngagementCombobox.tsx`) using existing `Popover` + `Command` (cmdk) UI primitives. The component accepts an array of engagements and renders a searchable dropdown with `CommandInput` for filtering and `CommandItem` for each engagement. Props: `engagements`, `value`, `onValueChange`, `disabled`, `placeholder`.
- Integrated `EngagementCombobox` into Stopwatch (`TrackerBar.tsx` lines 91-123), replacing the basic `Select` engagement dropdown. Activity selector remains as `Select`.
- Integrated `EngagementCombobox` into Manual Entry (`ManualEntryDialog.tsx` lines 270-292), replacing the basic `Select` engagement dropdown. This fixes the display format from `engagement_code || engagement_name` (showing only one) to the unified `CODE - Name` format (showing both). Activity selector remains as `Select`.
- Both selectors now support case-insensitive partial matching by engagement code or engagement name via cmdk's built-in filtering. The `CommandItem` value is set to `"code name"` string which cmdk filters against.
- Display format: `CODE - Name` with bold code (`font-medium`) and muted name text (`text-muted-foreground`). Falls back to Name only when code is null/missing.
- Trigger button shows selected engagement as `CODE - Name` or the placeholder text, with `ChevronsUpDown` icon. Selected item shows `Check` icon.
- Popover width matches trigger width via `w-[--radix-popover-trigger-width]`.
- Stopwatch eligibility unchanged: continues using `useApprovedEngagements` (excludes internal engagements).
- Manual Entry eligibility unchanged: continues using `useManualEntryEngagements` (includes internal/ADMIN engagements).
- Activity auto-assignment logic preserved in both selectors (auto-assigns ADM activity for engagements where `activity_required` is false).
- Disabled state during running timer preserved in Stopwatch via `disabled={isRunning}`.
- Added i18n keys `tracker.searchEngagement` (EN: "Search engagement...", ES: "Buscar encargo...") and `tracker.noMatchingEngagements` (EN: "No matching engagements.", ES: "No se encontraron encargos.").
- No database or RPC changes.
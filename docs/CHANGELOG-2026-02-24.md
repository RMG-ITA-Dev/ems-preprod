
## BUG 0213-36: Replace DAILY_LIMIT/WEEKLY_LIMIT with Min/Max Model

**Plan**: BUG-0213-36-minmax-model
**Migration**: `<timestamp>_bug_0213_36_replace_limits_with_minmax.sql`

### Root Cause

The previous timesheet validation model used two single-value global settings — `DAILY_LIMIT` and `WEEKLY_LIMIT` — which only enforced an upper ceiling. There was no minimum enforcement: timesheets could be submitted with any number of hours (including zero) below the maximum. The firm needed the ability to enforce both a minimum threshold (e.g., staff must log at least 40 hours/week) and a maximum cap, requiring a transition from a single-limit to a dual-bound (min/max) model.

### Solution — Detailed Edits

#### Edit 1 — Database migration: Insert new global settings (migration lines 1-29)

Inserted four new rows into `global_settings`:
- `DAILY_MIN` defaulting to `8`.
- `DAILY_MAX` backfilled from the existing `DAILY_LIMIT` value (default `8`).
- `WEEKLY_MIN` defaulting to `40`.
- `WEEKLY_MAX` backfilled from the existing `WEEKLY_LIMIT` value (default `40`).

Uses `ON CONFLICT (setting_key) DO NOTHING` for idempotent re-runs. The legacy `DAILY_LIMIT` and `WEEKLY_LIMIT` rows are left in the database as inert historical data — they are no longer read by any runtime code.

#### Edit 2 — Database migration: Create `update_timesheet_minmax_settings()` RPC (migration lines 31-71)

New PostgreSQL function accepting parameters `p_daily_min`, `p_daily_max`, `p_weekly_min`, `p_weekly_max`, and `p_work_days` (default `5`).

Server-side feasibility invariants enforced before write:
| Error Code | Condition |
|---|---|
| `DAILY_MIN_EXCEEDS_MAX` | `p_daily_min > p_daily_max` |
| `WEEKLY_MIN_EXCEEDS_MAX` | `p_weekly_min > p_weekly_max` |
| `WEEKLY_MIN_EXCEEDS_DAILY_MAX` | `p_weekly_min > p_daily_max * p_work_days` |
| `WEEKLY_MAX_BELOW_DAILY_MIN` | `p_weekly_max < p_daily_min * p_work_days` |

Atomic: writes all four settings in a single transaction. Returns `jsonb` with `success` boolean and optional `error_code`.

#### Edit 3 — Database migration: Update `submit_timesheet_safe()` RPC (migration lines 73-238)

Added weekly min/max validation block (lines 127-148 of the function body):
- Reads `WEEKLY_MIN` and `WEEKLY_MAX` from `global_settings`.
- Sums `hours_logged` from `time_entries` scoped to `period_id + staff_id + is_forecast=false`.
- Raises `WEEKLY_MIN_NOT_MET:actual=X,min=Y` if actual hours below minimum.
- Raises `WEEKLY_MAX_EXCEEDED:actual=X,max=Y` if actual hours above maximum.
- Validation happens after period lock acquisition but before `submitted_at` write.

#### Edit 4 — `src/pages/Settings.tsx`: Replace old limit fields with 2×2 min/max grid

- Lines 127-130: Read `DAILY_MIN`, `DAILY_MAX`, `WEEKLY_MIN`, `WEEKLY_MAX` from `globalSettings` via `getSetting()`.
- Lines 290-313: Save handler calls `update_timesheet_minmax_settings` RPC; maps returned `error_code` to i18n keys (`settings.dailyMinMaxError`, `settings.weeklyMinMaxError`, `settings.weeklyMinExceedsDailyMax`, `settings.weeklyMaxBelowDailyMin`).
- Lines 582-621: Four `NumericInput` fields in a 2×2 grid layout (`grid grid-cols-2 gap-4`) for DAILY_MIN, DAILY_MAX, WEEKLY_MIN, WEEKLY_MAX with help text labels beneath each input.

#### Edit 5 — `src/pages/TimeSheet.tsx`: Submit gating with dual-bound check

- Lines 57-75: Four `useMemo` hooks read `DAILY_MIN`, `DAILY_MAX`, `WEEKLY_MIN`, `WEEKLY_MAX` from `globalSettings`.
- Submit handler passes these to the RPC; error handler in `useTimesheetMutations` catches `WEEKLY_MIN_NOT_MET` and `WEEKLY_MAX_EXCEEDED` error codes.

#### Edit 6 — `src/components/timesheet/TimesheetGrid.tsx`: Daily coloring with min/max

- Added props: `dailyMin`, `dailyMax`, `weeklyMin`, `weeklyMax` (defaults: 8, 8, 40, 40).
- `isDailyOverMax(date)`: column total > `dailyMax` → red background.
- `isDailyBelowMin(date)`: column total > 0 and < `dailyMin` → amber/warning background.
- `isDailyNearMax(date)`: total >= `dailyMax * 0.8` and <= `dailyMax` → yellow background.
- Footer cell shows "Over max!" or "Below min" badges accordingly.

#### Edit 7 — `src/pages/TrackerRecord.tsx`: Daily guard uses DAILY_MAX

- Lines 126-130: `dailyMax` useMemo reads `DAILY_MAX` from `globalSettings` (default `8`).
- Used as the upper bound for the daily hours guard when starting/continuing timer entries.

#### Edit 8 — `supabase/functions/dashboard-data/index.ts`: Uses WEEKLY_MAX for weekly_limit

- Lines 800-814: Reads `WEEKLY_MAX` from `global_settings` table; maps to `weekly_limit` in the dashboard payload for the weekly capacity/utilization calculation.

#### Edit 9 — `src/hooks/useTimesheetMutations.ts`: Error handler for min/max violations

- Lines 198-206: Catches `WEEKLY_MIN_NOT_MET` and `WEEKLY_MAX_EXCEEDED` in the submit mutation's `onError` callback, displaying localized toast messages via `sonner`.

#### Edit 10 — `supabase/functions/test-minmax-settings/index.ts`: Backend integration tests

Four test cases:
| Test | Input | Expected |
|---|---|---|
| 1. DAILY_MIN > DAILY_MAX | `p_daily_min=10, p_daily_max=5` | `success=false, error_code=DAILY_MIN_EXCEEDS_MAX` |
| 2. WEEKLY_MIN > WEEKLY_MAX | `p_weekly_min=50, p_weekly_max=40` | `success=false, error_code=WEEKLY_MIN_EXCEEDS_MAX` |
| 3. WEEKLY_MIN > DAILY_MAX × 5 | `p_weekly_min=45, p_daily_max=8` | `success=false, error_code=WEEKLY_MIN_EXCEEDS_DAILY_MAX` |
| 4. Valid update | `8, 8, 40, 40` | `success=true` |

#### Edit 11 — i18n keys added (EN/ES)

Settings keys:
- `settings.dailyMin`, `settings.dailyMinHelp`, `settings.dailyMax`, `settings.dailyMaxHelp`
- `settings.weeklyMin`, `settings.weeklyMinHelp`, `settings.weeklyMax`, `settings.weeklyMaxHelp`
- `settings.dailyMinMaxError`, `settings.weeklyMinMaxError`, `settings.weeklyMinExceedsDailyMax`, `settings.weeklyMaxBelowDailyMin`

Timesheet keys:
- `timesheet.weeklyMinNotMet`, `timesheet.weeklyMaxExceeded`, `timesheet.dailyMaxExceeded`, `timesheet.weeklyBelowMin`

### Files Modified

| File | Lines | Change |
|---|---|---|
| Migration SQL | 1-238 | Insert settings, create `update_timesheet_minmax_settings` RPC, update `submit_timesheet_safe` RPC |
| `src/pages/Settings.tsx` | 127-130, 290-313, 582-621 | Read min/max settings, save handler with RPC call, 2×2 grid UI |
| `src/pages/TimeSheet.tsx` | 57-75 | Four `useMemo` hooks for min/max; submit gating |
| `src/components/timesheet/TimesheetGrid.tsx` | Props, footer | Daily coloring logic with min/max thresholds |
| `src/pages/TrackerRecord.tsx` | 126-130 | `dailyMax` useMemo for daily guard |
| `supabase/functions/dashboard-data/index.ts` | 800-814 | Read `WEEKLY_MAX` for `weekly_limit` payload |
| `src/hooks/useTimesheetMutations.ts` | 198-206 | Error handler for min/max violations |
| `supabase/functions/test-minmax-settings/index.ts` | Full file | Four backend integration tests |
| `src/locales/en.json` | tracker section | 12 new i18n keys |
| `src/locales/es.json` | tracker section | 12 new i18n keys (Spanish) |

### Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Backward compatibility with existing `DAILY_LIMIT`/`WEEKLY_LIMIT` data | Low | Legacy rows left inert in DB; new keys backfilled from existing values |
| RPC atomicity | Low | `update_timesheet_minmax_settings` writes all four settings in one transaction |
| Migration idempotency | Low | `ON CONFLICT DO NOTHING` on setting inserts; `CREATE OR REPLACE FUNCTION` on RPCs |
| Partner/Director auto-approval behavior | None | Unchanged; min/max validation is orthogonal to approval flow |

---

## BUG 0220-52 Regression Fix: Restore Internal Engagements in Manual Entry

**Plan**: BUG-0220-52-regression-hardening-v2
**Related Bug**: 0220-52

### Problem

The BUG 0220-52 stopwatch fix added `.eq("is_internal", false)` filters to `useApprovedEngagements` to prevent internal engagements from appearing in the stopwatch. However, `ManualEntryDialog` also consumed `useApprovedEngagements`, causing internal/ADMIN engagements (e.g., ADM, Feriados) to disappear from the manual entry dropdown. Manual entry is the only way to record time against internal/admin jobs in the tracker, making this a regression.

### Root Cause

`ManualEntryDialog` (line 74) called `useApprovedEngagements()`, which hard-filters `.eq("is_internal", false)` on both Group A (approved WO engagements, line 32) and Group B (no-WO-required engagements, line 55). The Group B non-admin `.or()` clause also no longer included `is_internal.eq.true`.

### Fix Details

#### Created `src/hooks/useManualEntryEngagements.ts`

- Dedicated hook with query key `["engagements-for-manual-entry"]` (no cache coupling with `useApprovedEngagements`).
- Mirrors the structure of `useApprovedEngagements` but omits all `.eq("is_internal", false)` filters.
- Group B non-admin `.or()` clause includes `is_internal.eq.true`, restoring pre-0220-52 behavior for manual entry.

#### Modified `src/components/tracker/ManualEntryDialog.tsx`

- Line 31: Replaced `import { useApprovedEngagements }` with `import { useManualEntryEngagements }`.
- Line 74: Replaced `useApprovedEngagements()` call with `useManualEntryEngagements()`.
- Existing stale-engagement guard on line 148 (`if (!engagements.some(...))`) continues to work against the new list.

#### Build Fix: `src/pages/__tests__/TimeSheet.submit-guards.test.tsx`

- Line 4: Replaced non-existent `TestWrapper` import with project-standard `render` from `@/test/utils`.
- Lines 44-48: Replaced `<TestWrapper><TimeSheet /></TestWrapper>` with `customRender(<TimeSheet />)`.

### Unchanged

- `src/hooks/useApprovedEngagements.ts` — tracker-specific, `is_internal = false` filters intact.
- `src/components/tracker/TrackerBar.tsx` — still uses `useApprovedEngagements`.
- Timesheet grid — separate data path (`useTimesheetWeek`).
- No database migrations or RPC changes.

### Files Modified

| File | Lines | Change |
|---|---|---|
| `src/hooks/useManualEntryEngagements.ts` | Full file (create) | Dedicated hook omitting `is_internal` filter; separate query key |
| `src/components/tracker/ManualEntryDialog.tsx` | 31, 74 | Swap hook import and call |
| `src/pages/__tests__/TimeSheet.submit-guards.test.tsx` | 4, 44-48 | Fix build error: replace `TestWrapper` with project `render` |

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

---

## UI Fix: Widen Manual Entry Dialog + Fix Engagement Name Truncation

**Plan**: UI-0225-engagement-combobox-width-v1 (Plan v5)

### Problem

1. The Manual Entry dialog (`+ Nuevo Registro de Tiempo`) was too narrow at `sm:max-w-[425px]`, insufficient to display full engagement codes and names.
2. The `EngagementCombobox` dropdown in both the Manual Entry dialog and the Stopwatch clipped long engagement names because the popover width was locked to the trigger button width (`w-[--radix-popover-trigger-width]`), and item text had no wrapping.

### Fix Details

#### Modified `src/components/tracker/ManualEntryDialog.tsx`

- **Line 183**: Changed `DialogContent` max-width from `sm:max-w-[425px]` to `sm:max-w-[700px]` (~2.5× wider), providing sufficient space for full engagement code + name display and the time/hours input grid.

#### Modified `src/components/tracker/EngagementCombobox.tsx`

- **Line 66 (PopoverContent)**: Changed width class from `w-[--radix-popover-trigger-width]` to `min-w-[--radix-popover-trigger-width] w-auto max-w-[600px]`. The dropdown now uses the trigger width as a minimum but can expand up to 600px to accommodate long engagement names.
- **Line 90 (CommandItem name span)**: Added `whitespace-normal` class to the engagement name `<span>`, allowing long names to wrap within the dropdown item instead of being clipped.
- **Line 58 (trigger button)**: Unchanged — `truncate` class retained on the trigger button label, which is correct behavior for limited-width button text.

### Unchanged

- `src/components/tracker/TrackerBar.tsx` — no changes needed; inherits the `EngagementCombobox` fixes automatically since both Stopwatch and Manual Entry use the shared component.
- Hooks, eligibility logic, i18n, database — all unchanged.
- No database migrations or RPC changes.

### Files Modified

| File | Lines | Change |
|---|---|---|
| `src/components/tracker/ManualEntryDialog.tsx` | 183 | `sm:max-w-[425px]` → `sm:max-w-[700px]` |
| `src/components/tracker/EngagementCombobox.tsx` | 66 | Popover width: fixed → `min-w` + `w-auto` + `max-w-[600px]` |
| `src/components/tracker/EngagementCombobox.tsx` | 90 | Added `whitespace-normal` to engagement name span |

---

## UI Fix: Engagement Name Unreadable on Hover in Combobox Dropdown

**Plan**: UI-0225-combobox-hover-contrast-v1 (Plan v6)

### Problem

Engagement name text in the `EngagementCombobox` dropdown was unreadable on hover/selection. The `text-muted-foreground` class on the name `<span>` did not adapt to the `bg-accent` + `text-accent-foreground` applied by `CommandItem`'s `data-[selected='true']` state, resulting in low-contrast text against the accent background. The engagement **code** span (no explicit color class) inherited correctly; only the **name** span was broken.

### Root Cause

`CommandItem` applies `text-accent-foreground` on selection via `data-[selected='true']` (defined in `command.tsx` line 108). Child elements inherit this color unless they have an explicit color class. The name `<span>` had `text-muted-foreground`, which overrode the inherited selection color, keeping the text in a low-contrast muted color against the accent background.

### Fix

#### Modified `src/components/tracker/EngagementCombobox.tsx`

- **Line 90**: Replaced `text-muted-foreground` with `opacity-70` on the engagement name `<span>`. The span now inherits the parent `CommandItem`'s text color (which correctly switches to `text-accent-foreground` on hover/selection) and uses opacity to maintain visual hierarchy between code and name.

```tsx
// BEFORE:
<span className="text-muted-foreground ml-2 whitespace-normal">- {eng.engagement_name}</span>

// AFTER:
<span className="opacity-70 ml-2 whitespace-normal">- {eng.engagement_name}</span>
```

### Unchanged

- `src/components/ui/command.tsx` — no changes to the base component
- `src/components/tracker/ManualEntryDialog.tsx` — no changes
- `src/components/tracker/TrackerBar.tsx` — no changes (inherits fix via shared component)
- Dialog width, popover width, trigger truncation — all unchanged
- Hooks, eligibility logic, i18n, database — all unchanged

### Files Modified

| File | Lines | Change |
|---|---|---|
| `src/components/tracker/EngagementCombobox.tsx` | 90 | `text-muted-foreground` → `opacity-70` on engagement name span |

---

## UI Fix: Prevent Manual Entry Dialog from Closing on Outside Click

**Plan**: UI-0225-manual-entry-modal-lock-v1 (Plan v7)

### Problem

Clicking outside the Manual Entry dialog or pressing Escape dismissed it, returning the user to the tracker list and losing any entered data.

### Fix

#### Modified `src/components/tracker/ManualEntryDialog.tsx`

- **Line 183**: Added `onInteractOutside` and `onEscapeKeyDown` handlers to `DialogContent`, both calling `e.preventDefault()`. The dialog now only closes via the **X** button or **Cancel** button.

### Files Modified

| File | Lines | Change |
|---|---|---|
| `src/components/tracker/ManualEntryDialog.tsx` | 183 | Added `onInteractOutside` + `onEscapeKeyDown` to prevent accidental dismissal |

---

## BUG 0220-59: Engagement Dates Shift -1 Day on Save/Display

**Plan**: BUG-0220-59-date-shift-v4

### Root Cause

Date-only strings ("YYYY-MM-DD") from the database were parsed with `new Date(string)`, which interprets as UTC midnight. In UTC-4 (Bolivia), this renders as the previous day.

### Fix

Replaced `new Date()` with `parseDateLocal()` in three read/display paths:

| File | Line(s) | Change |
|---|---|---|
| `src/components/forms/EngagementForm.tsx` | 163-164 | Edit form hydration: `new Date()` → `parseDateLocal()` |
| `src/pages/Engagements.tsx` | 72, 82 | List view rendering: `new Date()` → `parseDateLocal()` |
| `src/components/clients/ClientEngagementsTable.tsx` | 169 | Client sub-table `formatDate`: `new Date()` → `parseDateLocal()` |
| `src/lib/timesheetUtils.ts` | 118-124 | Added mandatory-use JSDoc to `parseDateLocal` |
| `.github/workflows/test.yml` | new step | CI grep guard blocks `new Date(*.start_date\|end_date)` patterns |

### Tests Added

| File | Coverage |
|---|---|
| `src/components/forms/__tests__/EngagementForm.date-hydration.test.ts` | Form prefill + round-trip + drift (5 tests) |
| `src/pages/__tests__/Engagements.date-render.test.ts` | List view date rendering (5 tests) |
| `src/components/clients/__tests__/ClientEngagementsTable.date-render.test.ts` | Client sub-table rendering (4 tests) |

---

## BUG 0220-61: Per-Engagement Approval Policy (`approval_required`)

**Plan**: BUG-0220-61-approval-required-per-engagement-v4

### Root Cause

`submit_timesheet_safe` decided pending vs auto-approved based solely on the submitting staff's category (`p_is_auto_approved`). Internal/holiday engagements always created `pending` approval rows for non-Partner/Director staff, with no designated approver to clear them, blocking full timesheet approval.

### Solution — Detailed Edits

#### Edit 1 — Database migration: Add `approval_required` column + backfill

- Added `approval_required boolean NOT NULL DEFAULT true` to `public.engagements`.
- Backfilled `approval_required = false` for all existing `is_internal = true` engagements.
- Column naming follows `*_required` convention (`work_order_required`, `activity_required`).

#### Edit 2 — Database migration: Update `submit_timesheet_safe` RPC

Signature unchanged. New per-engagement logic inside the engagement loop:

- Fetches `approval_required` per engagement (fail-safe default `true`).
- Computes `v_effective_auto := p_is_auto_approved OR NOT approval_required`.
- **INSERT branch**: Uses `v_effective_auto` instead of `p_is_auto_approved`.
- **PENDING branch (new)**: If `v_effective_auto`, upgrades pending → approved (guarded UPDATE). Repairs previously stuck internal lines on resubmit.
- **REJECTED branch**: If `v_effective_auto`, upgrades rejected → approved directly. Otherwise preserves existing modified-since-rejection logic.
- **APPROVED branch**: Never downgrades (unchanged).
- Return payload adds `upgraded_to_approved` counter (additive, non-breaking).

#### Edit 3 — `src/integrations/supabase/types.ts` (auto-regenerated)

Verified `approval_required` present in `engagements.Row`, `engagements.Insert`, and `engagements.Update`.

#### Edit 4 — `src/hooks/useEmsData.ts`: Engagement interface

- Line 81: Added `approval_required: boolean;` after `is_internal: boolean;`.

#### Edit 5 — `src/hooks/mutations/useEngagementMutations.ts`: Mutation payloads

- `useCreateEngagement`: Added `approval_required?: boolean;` to data type.
- `useUpdateEngagement`: Added `approval_required: boolean;` to data type.

#### Edit 6 — `src/components/forms/EngagementForm.tsx`: Toggle UI

- Line 136: Added `approvalRequired` state initialized from `engagement?.approval_required ?? true`.
- Line 170: Hydrates `approvalRequired` on edit form reset.
- Line 215: Includes `approval_required: approvalRequired` in create/update payload.
- Lines 532-538: Added "Approval Required" toggle in admin Timesheet Policy section with i18n label/help.

#### Edit 7 — i18n keys (EN/ES)

| Key | EN | ES |
|---|---|---|
| `engagement.approvalRequired` | Approval Required | Requiere Aprobación |
| `engagement.approvalRequiredHelp` | When off, timesheet lines are auto-approved on submission | Cuando está desactivado, las líneas de planilla se aprueban automáticamente al enviar |

### Files Modified

| File | Lines | Change |
|---|---|---|
| Migration SQL | Full | Add column, backfill, update `submit_timesheet_safe` RPC |
| `src/hooks/useEmsData.ts` | 81 | Added `approval_required: boolean` to `Engagement` interface |
| `src/hooks/mutations/useEngagementMutations.ts` | 21, 58 | Added `approval_required` to create/update payload types |
| `src/components/forms/EngagementForm.tsx` | 136, 170, 215, 532-538 | State, hydration, payload, toggle UI |
| `src/locales/en.json` | 508-509 | 2 new i18n keys |
| `src/locales/es.json` | 508-509 | 2 new i18n keys (Spanish) |

### Tests Added

| File | Coverage |
|---|---|
| `src/hooks/__tests__/submitApprovalRequired.test.ts` | RPC decision matrix: 8 tests |
| `src/hooks/mutations/__tests__/useEngagementMutations.approvalRequired.test.tsx` | Integration-style mutation tests: 3 tests |
| `src/components/forms/__tests__/EngagementForm.approvalRequired.test.ts` | Form hydration/payload: 5 tests |
| `src/locales/__tests__/i18n.approvalRequired.test.ts` | i18n key resolution EN/ES: 4 tests |

---

## BUG 0220-63: Validate Timesheet Dates Against Engagement Date Range

**Plan**: BUG-0220-63-timesheet-date-window-validation-v3

### Root Cause

The system allowed logging and approving timesheet hours outside an engagement's `start_date`/`end_date` range. No UI filtering, cell locking, DB trigger, or submission gate enforced engagement date boundaries.

### Solution — Four Defense-in-Depth Layers

1. **Layer 1 — Dropdown filtering** (grid-owned): `TimesheetGrid` filters the engagement dropdown to only show engagements whose date range overlaps the current week. Already-used out-of-range engagements remain visible for correction/deletion.

2. **Layer 2 — Per-cell lock**: Cells for dates outside the engagement's range are disabled with `bg-muted/40` visual indicator and tooltip (`cellOutsideEngagementDates`). Guards in `handleHoursChange` (with toast) and batch save (silent skip) prevent out-of-range writes.

3. **Layer 3 — DB trigger** (`trg_check_engagement_dates`): BEFORE INSERT OR UPDATE on `time_entries`. Raises `ENGAGEMENT_DATE_RANGE` with `check_violation` errcode. Null boundaries = unbounded. Inclusive boundaries.

4. **Layer 4 — Submit hard gate**: `submit_timesheet_safe` validates all period entries against engagement date windows BEFORE setting `submitted_at`. Raises `ENGAGEMENT_DATE_RANGE_VIOLATION` for legacy invalid rows.

### Boundary Rules

- `start_date` and `end_date` are **inclusive** (`start_date <= date_worked <= end_date`).
- Null `start_date` = unbounded lower side. Null `end_date` = unbounded upper side.

### Files Modified

| File | Change |
|---|---|
| `src/hooks/useTimesheetWeek.ts` | Added `start_date`/`end_date` to `ApprovedEngagement` interface and SELECT clauses |
| `src/components/timesheet/TimesheetGrid.tsx` | Added `engagementDateMap`, `availableEngagements`, per-cell lock, `handleHoursChange` guard, batch save guard |
| `src/hooks/useTimesheetMutations.ts` | Error mapping for `ENGAGEMENT_DATE_RANGE` and `ENGAGEMENT_DATE_RANGE_VIOLATION` |
| `src/locales/en.json` | 3 new i18n keys |
| `src/locales/es.json` | 3 new i18n keys |
| DB migration | `check_time_entry_engagement_dates()` trigger function + `trg_check_engagement_dates` trigger |
| DB migration | Updated `submit_timesheet_safe` with date range validation block |

### Test Evidence

| File | Tests |
|---|---|
| `src/components/timesheet/__tests__/timesheetEngagementWeekOverlap.test.ts` | 10 tests (overlap filtering + boundary + null) |
| `src/components/timesheet/__tests__/timesheetCellDateLock.test.ts` | 8 tests (per-cell lock + boundary + null) |
| `src/hooks/__tests__/useTimesheetMutations.dateRange.test.ts` | 5 tests (error token mapping) |
| `src/locales/__tests__/i18n.engagementDateRange.test.ts` | 6 tests (EN/ES key resolution) |

---

## BUG: Dashboard Selected Tab Not Readable

**Root cause**: Page-level `TabsTrigger` className in `src/pages/Index.tsx` overrode the base active-state with `data-[state=active]:bg-card`, which blends into the `bg-muted/50` TabsList container.

**Fix**: Replaced with `data-[state=active]:bg-primary data-[state=active]:text-primary-foreground` for high-contrast active state.

**Test**: Render-based regression test (`src/pages/__tests__/Index.dashboard-tabs.test.tsx`) asserts on the actual rendered DOM element's class attribute.

**Files changed**: `src/pages/Index.tsx` (1 line).

---

## Remove Navigation Lock from Timesheet Page

**Plan**: Remove-Navigation-Lock-from-Timesheet-v2

### Rationale

The Timesheet page auto-saves data, so a "Leave Page?" confirmation dialog is unnecessary and creates friction. The `usePageLeaveLock` hook and `LeavePageDialog` component were removed from the Timesheet page while retaining the sidebar-hidden focus mode.

### Changes

| File | Change |
|---|---|
| `src/pages/TimeSheet.tsx` | Removed `usePageLeaveLock` and `LeavePageDialog` imports + hook call + 4 `<LeavePageDialog>` instances. `handleBack` simplified to direct `navigate(-1)` without `allowNextNavigation()`. |
| `src/pages/__tests__/TimeSheet.focus-lock.test.tsx` | Removed `usePageLeaveLock` mocks; test simplified to use `@/test/utils` render. |

### Unchanged

- Focus mode (`focusMode` prop on `AppLayout`) retained.
- `usePageLeaveLock` and `LeavePageDialog` remain available for other pages (e.g., Approval Detail, Client/Staff Edit).

---

## Undocumented Polish Changes (Audit Reconciliation 2026-02-26)

### variant="cancel" → variant="outline" Migration (Completed)

All remaining 8 instances of `variant="cancel"` migrated to `variant="outline"` for visual consistency. The `cancel` variant remains defined in `button.tsx` but is no longer used in any component.

| File | Change |
|---|---|
| `src/pages/TimeSheet.tsx` | BackButton: `variant="cancel"` → `variant="outline"` |
| `src/pages/TimesheetApprovalDetail.tsx` | BackButton: `variant="cancel"` → `variant="outline"` |
| `src/pages/WorksheetEdit.tsx` | Cancel button: `variant="cancel"` → `variant="outline"` |
| `src/pages/WorksheetNew.tsx` | Cancel button: `variant="cancel"` → `variant="outline"` |
| `src/pages/TrackerEdit.tsx` | Cancel button: `variant="cancel"` → `variant="outline"` |
| `src/components/forms/EngagementForm.tsx` | Cancel button: `variant="cancel"` → `variant="outline"` |
| `src/components/forms/ClientForm.tsx` | Cancel buttons (×2): `variant="cancel"` → `variant="outline"` |

### Staff.tsx Admin Guard

Added `useUserRole()` hook and `isAdmin` guard to `src/pages/Staff.tsx`: "New Staff" button, row click navigation, and `onNewClick` handler are only rendered for admin users. Non-admin users can view the staff list but cannot navigate to edit forms.

### tabs.tsx Base Active State

Changed base `TabsTrigger` active state in `src/components/ui/tabs.tsx` from `data-[state=active]:bg-background` to `data-[state=active]:bg-primary data-[state=active]:text-primary-foreground` for higher contrast.

### Other Polish

| File | Change |
|---|---|
| `src/components/forms/StaffForm.tsx` | Cancel button: `variant="cancel"` → `variant="outline"`. Email field: `disabled={isEdit}` + `bg-muted` on edit mode. |
| `src/components/ui/leave-page-dialog.tsx` | Non-dirty action button: uses `border-input bg-background` styling; label changed to `common.cancel`. |
| `src/pages/WorkOrders.tsx` | Search bar widened: `sm:min-w-[200px]` → `sm:min-w-[300px]`, `sm:max-w-md` → `sm:max-w-xl`. |
| `src/pages/WorksheetEdit.tsx` | Warning button: `text-warning-foreground` → `text-warning`, `hover:bg-warning/20` → `hover:bg-warning hover:text-warning-foreground`. |
| `supabase/functions/manage-auth-user/index.ts` | Error handler: `error instanceof Error ? error.message : String(error)` for safety. |

---

## Schema Documentation Update (Audit Reconciliation 2026-02-26)

Updated `docs/database-schema.sql` to reflect all current-session schema changes:

| Item | Source |
|---|---|
| `approval_required BOOLEAN NOT NULL DEFAULT true` on `engagements` table | BUG 0220-61 |
| `update_timesheet_minmax_settings()` RPC function | BUG 0213-36 |
| `check_time_entry_engagement_dates()` trigger function | BUG 0220-63 |
| `trg_check_engagement_dates` trigger on `time_entries` | BUG 0220-63 |
| Updated `submit_timesheet_safe()` with WEEKLY_MIN/MAX validation, `approval_required` per-engagement logic, and engagement date range gate | BUG 0213-36, 0220-61, 0220-63 |
| All trigger declarations added to TRIGGERS section | Comprehensive |
| Generation date updated to 2026-02-26 | — |

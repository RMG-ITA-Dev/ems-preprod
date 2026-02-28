# CHANGELOG — 2026-02-27

## BUG 0227-64: Unify week-number display between Hoja de Tiempo and Aprobaciones

### Root Cause

The Approvals pages (`TimesheetApprovals.tsx`, `TimesheetApprovalDetail.tsx`) rendered `week_number` and `year` directly from the `timesheet_periods` database columns. These values are calendar-based and may be stale or inconsistent with the canonical fiscal-week algorithm used by the Timesheet module (`WeekNavigator` → `getWeekInfo()` → `getFiscalWeekNumber()`). This caused the same timesheet period (e.g., 02/03/2026–06/03/2026) to display different week numbers in the two modules.

### Changes

#### Files Created

| File | Purpose |
|---|---|
| `src/lib/timesheetWeekDisplay.ts` | New canonical shared helper. Exports `getWeekDisplayInfo(weekStartDate: string \| null \| undefined): WeekDisplayInfo`. Internally uses `parseDateLocal()`, `getFiscalWeekNumber()`, `getFiscalYearForDate()`, and `getFiscalWeekOneMonday()` with `startOfWeek()` to compute the fiscal year the *week* belongs to (not just the date, which can differ at Sep/Oct boundaries). Returns `{ weekNumber, fiscalYear, isValid }`. Returns `isValid: false` with safe zero values for null, undefined, empty, or malformed date inputs. JSDoc documents that DB `week_number`/`year` columns are non-authoritative for UI display (ref INV-3). |
| `src/lib/__tests__/timesheetWeekDisplay.test.ts` | 9 test cases: bug reproduction (2026-03-02 → Week 23, FY2026), fiscal boundary (2025-09-29 → Week 1, FY2026), Oct-Dec fiscal year divergence (2025-10-06 → FY2026), cross-year Sep boundary (2026-09-28 → FY2027), null/undefined/empty/malformed inputs → isValid=false, parity checks against `getFiscalWeekNumber(parseDateLocal(date))` for 4 representative dates. |

#### Files Modified

| File | Change |
|---|---|
| `src/pages/TimesheetApprovals.tsx` | Added import of `getWeekDisplayInfo`. In the summary row mapping, replaced `summary.week_number` and `summary.year` with computed values from the helper. Renders em dash (—) fallback when `isValid` is false. |
| `src/pages/TimesheetApprovalDetail.tsx` | Added import of `getWeekDisplayInfo`. After the `timesheetData` null guard, computes `weekDisplay` from `timesheetData.period.week_start_date`. Replaced `timesheetData.period.week_number` and `timesheetData.period.year` in the header with computed values. Renders em dash (—) fallback when `isValid` is false. |

### Before / After

| Screen | Before | After |
|---|---|---|
| Approvals list (week of 02/03/2026) | "Semana 10, 2026" (from DB) | "Semana 23, 2026" (computed, matches Timesheet) |
| Approvals detail (week of 02/03/2026) | "Semana 10, 2026" (from DB) | "Semana 23, 2026" (computed, matches Timesheet) |
| Any screen with null `week_start_date` | Potential crash or "Semana undefined" | "Semana —, —" (safe fallback) |

### Defensive Behavior

Invalid or missing `week_start_date` values (null, undefined, empty string, malformed) produce `isValid: false` and the UI renders em dash (—) for both week number and year, preventing crashes.

### Test Coverage

9 automated test cases in `timesheetWeekDisplay.test.ts` covering:
- Bug reproduction case
- Fiscal year boundaries (Oct start, Sep end)
- Oct-Dec fiscal year divergence
- 4 invalid input variants
- Parity checks ensuring helper output never diverges from `getFiscalWeekNumber`

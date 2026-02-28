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

---

## BUG 0227-67: Activity Not Cleared When Switching Internal to Client Engagement

### Root Cause

In `src/components/timesheet/TimesheetGrid.tsx`, `handleEngagementChange` (lines 420-423), the inline ternary:

```text
const activityId = isActivityNotRequired && adminActivityId
  ? adminActivityId
  : currentRow.activityId;
```

When switching from an internal engagement (activity_required=false, ADM auto-assigned) to a client engagement (activity_required=true), the stale ADM `activityId` carried over from `currentRow.activityId`. This left hour cells enabled and allowed save/submit to persist the wrong activity.

### Changes

#### Files Created

| File | Purpose |
|---|---|
| `src/lib/timesheetActivityRules.ts` | Canonical normalization helper. Exports `normalizeActivityForEngagement(input: NormalizeActivityInput): NormalizeActivityResult`. Rules: (1) `!activityRequired && adminActivityId` → assign admin; (2) `activityRequired && currentActivityId === adminActivityId` → clear to `""`; (3) otherwise preserve. Returns `wasCleared: true` only when rule #2 fires. |
| `src/lib/__tests__/timesheetActivityRules.test.ts` | 6 unit tests: admin assignment, stale-admin clearing, non-admin preservation, empty preservation, null-admin fallback, internal→client→internal sequence. |
| `src/components/timesheet/__tests__/TimesheetGrid.activity-transition.test.tsx` | 4 component transition tests: internal auto-assigns admin, Internal→Client clears stale admin, required+empty disables hours, Client→Internal reassigns admin. |

#### Files Modified

| File | Change |
|---|---|
| `src/components/timesheet/TimesheetGrid.tsx` | Added import of `normalizeActivityForEngagement`. In `handleEngagementChange`, replaced inline ternary (lines 420-423) with helper call that derives `activityRequired` from the selected engagement record. No changes to row merge/id/duplicate logic. |
| `src/pages/TimeSheet.tsx` | Added `import { toast } from "sonner"`. In `handleSubmit`, after `uniqueEngagementIds.length === 0` guard and before submit mutation, added defense-in-depth validation: scans `entries` for any row where `engagement.activity_required=true` and `activity_id` is empty or equals `adminActivityId`; blocks submit with `toast.error(t("timesheet.invalidActivityRow"))`. |
| `src/locales/en.json` | Added `timesheet.invalidActivityRow` key. |
| `src/locales/es.json` | Added `timesheet.invalidActivityRow` key. |
| `src/pages/__tests__/TimeSheet.submit-guards.test.tsx` | Added test case asserting submit guard renders without crash when entries contain activity-required engagement with empty activity_id. |

### Before / After

| Scenario | Before | After |
|---|---|---|
| Internal → Client switch | ADM activity preserved; hour cells enabled; save persists wrong activity | ADM cleared to `""`; hour cells disabled; user must select valid activity |
| Submit with invalid activity row | Submit proceeds with wrong activity saved to DB | Submit blocked with localized toast error |
| Client → Internal switch | Worked correctly (ADM auto-assigned) | No change (still works) |
| Client → Client switch | Current activity preserved | No change (still preserved) |

### Defensive Behavior

The submit guard in `TimeSheet.tsx` is defense-in-depth: the primary fix in `TimesheetGrid.tsx` prevents the invalid state from occurring, but the guard catches any edge case where an activity-required row reaches submit with empty or admin activity.

### Test Coverage

- 6 unit tests in `timesheetActivityRules.test.ts` covering all helper branches
- 4 component transition tests in `TimesheetGrid.activity-transition.test.tsx`
- 1 submit-guard integration test in `TimeSheet.submit-guards.test.tsx`

---

## BUG 0227-66: Rejection Notes Not Visible to Staff

### Root Cause

In `src/components/timesheet/TimesheetGrid.tsx`, the `renderApprovalBadge` function placed `review_notes` exclusively inside a `TooltipContent`. Users had to hover the small "Rejected" badge to see the note, which was undiscoverable. Most staff contacted the approver instead of finding the tooltip.

### Changes

#### Files Modified

| File | Change |
|---|---|
| `src/components/timesheet/TimesheetGrid.tsx` | In `renderApprovalBadge`, wrapped existing `Tooltip` return in a fragment and added a conditional inline `<p>` block after the tooltip that renders when `approval.status === "rejected"` and `approval.review_notes?.trim()` is non-empty. Styled with `text-xs text-destructive/90 italic leading-tight w-full`. Also changed the parent engagement cell container (line 753) from `flex items-center` to `flex flex-wrap items-center` so the note wraps below the badge row. |
| `src/locales/en.json` | Added `approval.rejectionNote`: `"Rejection note:"` |
| `src/locales/es.json` | Added `approval.rejectionNote`: `"Nota de rechazo:"` |

### Before / After

| Scenario | Before | After |
|---|---|---|
| Rejected row with note | Note only visible via hover tooltip on small badge | Note displayed inline below badge in destructive italic text |
| Rejected row without note | Badge only, no tooltip content | Badge only, no inline note (unchanged) |
| Approved/pending rows | Badge displayed normally | Completely unchanged |

### Scope

Frontend display-only fix. No backend, database schema, or approval workflow changes.

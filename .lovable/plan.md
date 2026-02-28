

# Plan v4 -- BUG 0227-64: Unify Week-Number Logic Between Hoja de Tiempo and Aprobaciones

## Objective

Guarantee that Hoja de Tiempo and Aprobaciones always show the same week label for the same timesheet period by using one canonical fiscal-week computation path, with safe handling for malformed data.

## Scope

**In scope:**
- Approvals list and approval detail week-label rendering
- Shared reusable helper for week display metadata
- Defensive behavior for null/invalid `week_start_date`
- Regression test coverage for bug case and boundary dates
- Changelog append with implementation-level detail

**Out of scope:**
- Database schema changes
- Backfill/migration of historical `week_number` data
- Unrelated UI redesign

## Canonical Rules

| Rule | Detail |
|---|---|
| Week number source | Compute from `week_start_date` using `getFiscalWeekNumber()` |
| Year label source | Compute fiscal year using `getFiscalYearForDate()` (not DB `period.year` for display) |
| Date parsing | Use `parseDateLocal()` to avoid UTC/local drift |
| Fallback on invalid date | Render em dash (\u2014) for week and year, without crashing |

## Implementation Steps

### Step 1: Repository-wide verification of week_number display usages

**Actions:**
- Search all `.tsx`/`.ts` files (excluding `node_modules`, `types.ts`, and test files) for UI rendering of `week_number` or `year` from DB period/summary objects.
- **Verified findings:**
  - `src/pages/TimesheetApprovals.tsx` line 105: renders `summary.week_number`, `summary.year` -- STALE, must fix
  - `src/pages/TimesheetApprovalDetail.tsx` line 240: renders `timesheetData.period.week_number`, `timesheetData.period.year` -- STALE, must fix
  - `src/components/timesheet/WeekNavigator.tsx` line 178: renders `weekInfo.weekNumber` -- ALREADY CANONICAL (computed via `getWeekInfo()` which calls `getFiscalWeekNumber()`)
  - `src/hooks/useTimesheetWeek.ts`, `src/hooks/useTimesheetImport.ts`, `src/hooks/useTimesheetApprovals.ts`: use `week_number` for DB writes/reads only, not for display -- NO ACTION NEEDED
- **Deliverable:** Verified list of display points; only the two Approvals pages need refactoring.

### Step 2: Create shared canonical display helper

**New file: `src/lib/timesheetWeekDisplay.ts`**

```text
Interface: WeekDisplayInfo {
  weekNumber: number;
  fiscalYear: number;
  isValid: boolean;
}

Function: getWeekDisplayInfo(weekStartDate: string | null | undefined): WeekDisplayInfo
```

- If input is null, undefined, or empty string: return `{ weekNumber: 0, fiscalYear: 0, isValid: false }`
- Parse date using `parseDateLocal()` (mandatory per BUG 0220-59 standard)
- Validate parsed Date via `isNaN(date.getTime())`; if invalid: return `{ weekNumber: 0, fiscalYear: 0, isValid: false }`
- Call `getFiscalWeekNumber(date)` and `getFiscalYearForDate(date)` from `fiscalCalculations.ts`
- Return `{ weekNumber, fiscalYear, isValid: true }`
- Add JSDoc stating: this helper is canonical for week display; DB `week_number`/`year` columns are non-authoritative for UI labels (ref INV-3)

**Deliverable:** Single source of truth for week display metadata.

### Step 3: Refactor approvals list screen

**File: `src/pages/TimesheetApprovals.tsx`**

- Add import: `getWeekDisplayInfo` from `@/lib/timesheetWeekDisplay`
- Inside the `.map()` callback (around line 93), compute: `const weekDisplay = getWeekDisplayInfo(summary.week_start_date);`
- Line 105: replace `{summary.week_number}, {summary.year}` with:
  `{weekDisplay.isValid ? weekDisplay.weekNumber : "\u2014"}, {weekDisplay.isValid ? weekDisplay.fiscalYear : "\u2014"}`

**Deliverable:** Approvals list no longer depends on stale DB `week_number`/`year` for UI display.

### Step 4: Refactor approvals detail screen

**File: `src/pages/TimesheetApprovalDetail.tsx`**

- Add import: `getWeekDisplayInfo` from `@/lib/timesheetWeekDisplay`
- After the `timesheetData` null guard (after line 227), compute: `const weekDisplay = getWeekDisplayInfo(timesheetData.period.week_start_date);`
- Line 240: replace `{timesheetData.period.week_number}, {timesheetData.period.year}` with:
  `{weekDisplay.isValid ? weekDisplay.weekNumber : "\u2014"}, {weekDisplay.isValid ? weekDisplay.fiscalYear : "\u2014"}`

**Deliverable:** Approvals detail uses same canonical logic as list and timesheet.

### Step 5: Add regression and resilience tests

**New file: `src/lib/__tests__/timesheetWeekDisplay.test.ts`**

Test cases:

1. **Bug reproduction**: `"2026-03-02"` returns `weekNumber: 23`, `fiscalYear: 2026`, `isValid: true`
2. **Fiscal boundary (Oct start)**: `"2025-09-29"` (FY2026 Week 1 Monday) returns `weekNumber: 1`, `fiscalYear: 2026`
3. **Oct-Dec fiscal year divergence**: `"2025-10-06"` returns `fiscalYear: 2026` (not calendar 2025)
4. **Cross-year Sep boundary**: `"2026-09-28"` returns correct FY2027 week
5. **Null input**: returns `{ weekNumber: 0, fiscalYear: 0, isValid: false }`
6. **Undefined input**: returns `{ weekNumber: 0, fiscalYear: 0, isValid: false }`
7. **Empty string**: returns `{ weekNumber: 0, fiscalYear: 0, isValid: false }`
8. **Malformed date** (`"not-a-date"`): returns `{ weekNumber: 0, fiscalYear: 0, isValid: false }`
9. **Parity checks**: for dates `["2026-03-02", "2025-09-29", "2026-01-05", "2025-12-01"]`, assert `getWeekDisplayInfo(d).weekNumber === getFiscalWeekNumber(parseDateLocal(d))` -- guaranteeing the helper never diverges from the canonical algorithm

**Deliverable:** Automated safeguards against recurrence and edge-case breakage.

### Step 6: QA validation checklist

1. Reproduce original case (02/03/2026 -- 06/03/2026) and confirm both modules show Semana 23, 2026
2. Validate at least 3 additional weeks including fiscal boundaries
3. Validate invalid/missing `week_start_date` does not crash and shows em dash (\u2014) fallback
4. Confirm no additional screen displays stale DB `week_number`/`year` (per Step 1 verification)
5. Run all existing tests to confirm no regressions
6. Run new `timesheetWeekDisplay.test.ts` tests

### Step 7: Documentation and release traceability

- Add code comment in `timesheetWeekDisplay.ts` noting canonical status and that DB columns are retained for sorting/indexing only
- Update inline comments in both Approvals pages where `week_number` was previously used

## Changelog Append

**File:** `docs/CHANGELOG-2026-02-27.md`

You need to append to the CHANGELOG a detailed description of the changes made while implementing this Plan. There needs to be sufficient detail to be able to verify if the changes to the codebase correspond to the CHANGELOG.

If the file does not exist, create it and append the new entry in the same run so future updates remain append-only.

Required content in the changelog entry:
- Bug ID: 0227-64
- Root cause: Approvals pages rendered `week_number` and `year` from `timesheet_periods` DB column (stale calendar-week values), while Timesheet dynamically computed via `getFiscalWeekNumber()`
- Files created: `src/lib/timesheetWeekDisplay.ts`, `src/lib/__tests__/timesheetWeekDisplay.test.ts`
- Files modified: `src/pages/TimesheetApprovals.tsx`, `src/pages/TimesheetApprovalDetail.tsx`
- Function signature: `getWeekDisplayInfo(weekStartDate: string | null | undefined): WeekDisplayInfo`
- Before behavior: Approvals showed DB `week_number` (e.g., "Semana 10, 2026")
- After behavior: Both modules compute via `getFiscalWeekNumber` and show identical values (e.g., "Semana 23, 2026")
- Defensive behavior: Invalid/null `week_start_date` renders em dash (\u2014) fallback, no crash
- Test coverage: 9 test cases covering bug reproduction, fiscal boundaries, invalid inputs, and parity checks

## Target Files

| File | Action | Description |
|---|---|---|
| `src/lib/timesheetWeekDisplay.ts` | Create | Shared canonical week display helper |
| `src/pages/TimesheetApprovals.tsx` | Modify | Use helper instead of DB `week_number`/`year` |
| `src/pages/TimesheetApprovalDetail.tsx` | Modify | Use helper instead of DB `week_number`/`year` |
| `src/lib/__tests__/timesheetWeekDisplay.test.ts` | Create | Regression tests |
| `docs/CHANGELOG-2026-02-27.md` | Append (create if missing) | Changelog entry for BUG 0227-64 |

## Acceptance Criteria

1. For 02/03/2026 -- 06/03/2026, both Hoja de Tiempo and Aprobaciones display the same week number and year context (Semana 23, 2026)
2. Approvals UI no longer uses DB `week_number`/`year` as authoritative display values
3. Invalid or missing `week_start_date` never crashes the UI; fallback em dash (\u2014) is shown
4. Regression tests cover bug case, fiscal boundaries, invalid inputs, and parity checks against `getFiscalWeekNumber`
5. All discovered `week_number` display paths from repository-wide verification use canonical helper logic
6. Changelog entry is detailed enough to map changes directly to code

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `parseDateLocal` already used in both files | No new dependency; established pattern |
| Stored `week_number` becomes vestigial for display | Field retained for DB sorting/indexing; JSDoc documents non-authoritative status |
| Fiscal year display differs from stored calendar year in Oct-Dec | Intentional and correct: fiscal week numbering requires fiscal year context. Verified that WeekNavigator (Timesheet) does not display year alongside week number, so no cross-screen mismatch |
| Hidden stale display paths missed | Step 1 verification searched entire codebase; only two Approvals pages render DB `week_number` for display |


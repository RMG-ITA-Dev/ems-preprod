

# Plan v3 -- BUG 0220-63: Validate Timesheet Dates Against Engagement Date Range

## Context

The system allows logging and approving timesheet hours for dates outside an engagement's configured start_date/end_date range. For example, an engagement starting 18/02/2026 appears in the timesheet for week 09/02-13/02 and accepts hours on dates before its start. This violates business expectations.

## Root Cause

1. The `ApprovedEngagement` interface lacks `start_date`/`end_date` fields -- the engagement query does not fetch them.
2. `TimesheetGrid` has no per-cell date-range locking for engagement boundaries (only hire date, termination date, and holiday locks exist).
3. No database trigger prevents inserting/updating `time_entries` with `date_worked` outside the linked engagement's date range.
4. `submit_timesheet_safe` does not validate entries against engagement date windows, allowing legacy out-of-range entries to pass through submission.

## Scope

**In scope**: Engagement query enrichment with dates, grid-level week-overlap dropdown filtering, per-cell date-range locking, DB trigger (INSERT + UPDATE), submit-time hard gate in RPC, error mapping in mutations, EN/ES i18n, behavior-level tests, changelog.

**Out of scope**: Tracker/timer modules, retroactive cleanup of historical invalid entries, approver hierarchy redesign.

## Architecture Decisions

1. **Filtering ownership**: `useTimesheetWeek` only enriches engagement data with `start_date`/`end_date`. `TimesheetGrid` owns the week-overlap dropdown filtering logic.
2. **Date comparison**: ISO YYYY-MM-DD string comparison (lexicographically safe for zero-padded ISO dates).
3. **Boundary rules**: `start_date` and `end_date` are both **inclusive**. Null `start_date` = unbounded lower side. Null `end_date` = unbounded upper side.
4. **Defense-in-depth layers**:
   - Layer 1: Grid dropdown filtering by week overlap
   - Layer 2: Per-cell disable + tooltip + handleHoursChange guard + batch save guard
   - Layer 3: DB trigger on INSERT + UPDATE
   - Layer 4: submit_timesheet_safe hard gate for legacy invalid rows
5. **Translation style**: TimesheetGrid uses `t(...)` from `useTranslation()` (existing pattern). Mutation hooks use `i18n.t(...)` (existing pattern).

## File-by-File Changes

### W1: `src/hooks/useTimesheetWeek.ts` -- Engagement data enrichment

**Type change**: Add `start_date` and `end_date` to `ApprovedEngagement` (after `is_internal`, line 43):

```ts
export interface ApprovedEngagement {
  // ...existing fields...
  is_internal: boolean;
  start_date: string | null;   // BUG 0220-63
  end_date: string | null;     // BUG 0220-63
  client: { ... } | null;
}
```

**Query change**: Add `start_date, end_date` to both Group A (line 152) and Group B (line 170) engagement SELECT clauses:

```
engagement_id, engagement_code, engagement_name,
activity_required, work_order_required, is_internal,
start_date, end_date,
client:clients!client_id(client_id, client_legal_name)
```

No hook-level filtering applied. The hook returns all eligible engagements with their date metadata.

### W2: `src/components/timesheet/TimesheetGrid.tsx` -- Per-cell lock + dropdown filtering

**2a. Engagement date map** (new `useMemo` after `usedActivitiesByEngagement`, ~line 604):

```ts
const engagementDateMap = useMemo(() => {
  const map = new Map<string, { start: string | null; end: string | null }>();
  engagements.forEach(eng => {
    map.set(eng.engagement_id, { start: eng.start_date, end: eng.end_date });
  });
  return map;
}, [engagements]);
```

**2b. Dropdown filtering** (new `useMemo` after engagementDateMap):

```ts
const weekStartStr = toISODateString(weekDates[0]);
const weekEndStr = toISODateString(weekDates[weekDates.length - 1]);

const availableEngagements = useMemo(() => {
  const usedIds = new Set(rows.map(r => r.engagementId).filter(Boolean));
  return engagements.filter(eng => {
    if (usedIds.has(eng.engagement_id)) return true; // preserve used rows
    const startOk = !eng.start_date || eng.start_date <= weekEndStr;
    const endOk = !eng.end_date || eng.end_date >= weekStartStr;
    return startOk && endOk;
  });
}, [engagements, rows, weekStartStr, weekEndStr]);
```

Use `availableEngagements` instead of `engagements` in the Select dropdown (line 713).

**2c. Per-cell lock** (line 776, add to isDisabled computation):

```ts
const engDates = engagementDateMap.get(row.engagementId);
const isBeforeEngStart = !!(engDates?.start && dateStr < engDates.start);
const isAfterEngEnd = !!(engDates?.end && dateStr > engDates.end);
const isOutOfEngagementRange = isBeforeEngStart || isAfterEngEnd;
```

Add `isOutOfEngagementRange` to the `isDisabled` expression (line 776-777).

**2d. Visual indicator**: Add `isOutOfEngagementRange && "bg-muted/40"` to the cell `<td>` className (line 780), matching the existing hire-date lock pattern.

**2e. Tooltip**: Wrap disabled cells that have `isOutOfEngagementRange` with a Tooltip showing `t("timesheet.cellOutsideEngagementDates")`.

**2f. Guard in handleHoursChange** (line 465, after holiday guard, before approved line guard):

```ts
// Engagement date range guard
const currentRowForDateCheck = rowsRef.current.find((r) => r.id === rowId);
if (currentRowForDateCheck && hours > 0) {
  const engDates = engagementDateMap.get(currentRowForDateCheck.engagementId);
  if (engDates) {
    if ((engDates.start && dateStr < engDates.start) || (engDates.end && dateStr > engDates.end)) {
      toast.error(t("timesheet.dateOutsideEngagementRange"));
      return;
    }
  }
}
```

**2g. Guard in saveNowTrigger/batch save** (line 221, inside the `weekDates.forEach` loop, add before the `if (hasHours || needsDeletion)` check):

```ts
// Engagement date range guard for batch save
const batchEngDates = engagementDateMap.get(row.engagementId);
if (batchEngDates && hasHours) {
  if ((batchEngDates.start && dateStr < batchEngDates.start) || (batchEngDates.end && dateStr > batchEngDates.end)) {
    continue; // skip out-of-range cells silently in batch
  }
}
```

Note: `engagementDateMap` must be added to the dependency array of the `useEffect` that triggers batch save.

### W3: DB Migration -- Validation Trigger on `time_entries`

```sql
CREATE OR REPLACE FUNCTION public.check_time_entry_engagement_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  SELECT e.start_date, e.end_date
  INTO v_start, v_end
  FROM engagements e
  WHERE e.engagement_id = NEW.engagement_id;

  IF v_start IS NOT NULL AND NEW.date_worked < v_start THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE: date_worked % is before engagement start_date %',
      NEW.date_worked, v_start
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_end IS NOT NULL AND NEW.date_worked > v_end THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE: date_worked % is after engagement end_date %',
      NEW.date_worked, v_end
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_engagement_dates
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.check_time_entry_engagement_dates();
```

### W4: DB Migration -- Submit-time hard gate in `submit_timesheet_safe`

Add validation block BEFORE the `UPDATE timesheet_periods SET submitted_at = now()` line (currently after the min/max checks). This catches legacy out-of-range entries:

```sql
-- BUG 0220-63: Reject submission if any period entry violates engagement date window
IF EXISTS (
  SELECT 1
  FROM time_entries te
  JOIN engagements e ON te.engagement_id = e.engagement_id
  WHERE te.period_id = p_period_id
    AND te.staff_id = p_staff_id
    AND te.is_forecast = false
    AND (
      (e.start_date IS NOT NULL AND te.date_worked < e.start_date)
      OR (e.end_date IS NOT NULL AND te.date_worked > e.end_date)
    )
) THEN
  RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE_VIOLATION: Period contains entries outside engagement date range';
END IF;
```

Function signature remains unchanged.

### W5: `src/hooks/useTimesheetMutations.ts` -- Error mapping

**In `useUpsertTimeEntry` onError** (after APPROVED_LINE_LOCKED check, line 86):

```ts
if (errorMsg.includes("ENGAGEMENT_DATE_RANGE")) {
  toast.error(i18n.t("timesheet.dateOutsideEngagementRange"));
  return;
}
```

**In `useSubmitTimesheet` onError** (after SUBMIT_NO_ENTRIES check, line 211):

```ts
if (msg.includes('ENGAGEMENT_DATE_RANGE_VIOLATION')) {
  toast.error(i18n.t("timesheet.submitDateRangeViolation"));
  return;
}
```

Note: `ENGAGEMENT_DATE_RANGE_VIOLATION` check must precede `ENGAGEMENT_DATE_RANGE` in the submit handler to avoid false match on the shorter token. In the upsert handler there is no ambiguity since submit errors don't flow through it.

### W6: `src/locales/en.json` -- Add under `timesheet` section

```json
"dateOutsideEngagementRange": "Cannot log hours: date is outside the engagement's valid date range",
"cellOutsideEngagementDates": "This date is outside the engagement's start/end date range",
"submitDateRangeViolation": "Cannot submit: some entries are outside their engagement's valid date range. Please correct or remove them first."
```

### W7: `src/locales/es.json` -- Add under `timesheet` section

```json
"dateOutsideEngagementRange": "No se pueden registrar horas: la fecha está fuera del rango de vigencia del encargo",
"cellOutsideEngagementDates": "Esta fecha está fuera del rango de fecha de inicio/fin del encargo",
"submitDateRangeViolation": "No se puede enviar: algunas entradas están fuera del rango de vigencia del encargo. Corrija o elimínelas primero."
```

### W8: `docs/CHANGELOG-2026-02-24.md` -- Append entry

Document root cause, four enforcement layers, boundary/null rules, test evidence, and rollback notes.

## DB Validation Strategy

Three backend layers:

1. **DB Trigger** (`trg_check_engagement_dates`): Authoritative guard on BEFORE INSERT OR UPDATE. Prevents any code path from persisting invalid data. Null boundaries = unbounded. Inclusive boundaries.
2. **Submit RPC gate**: Catches legacy entries that pre-date the trigger. Blocks submission BEFORE `submitted_at` is set, with deterministic token `ENGAGEMENT_DATE_RANGE_VIOLATION`.
3. **Trigger error token**: `ENGAGEMENT_DATE_RANGE` for deterministic frontend mapping in upsert error handler.

## Frontend Validation Strategy

Four UI layers:

1. **Dropdown filtering** (grid-owned): Engagements fully outside the current week are hidden from the dropdown for new row selection. Already-used engagements remain visible for correction/deletion.
2. **Per-cell lock**: Cells for dates outside the engagement's range are disabled with visual indicator (`bg-muted/40`) and tooltip (`t("timesheet.cellOutsideEngagementDates")`).
3. **handleHoursChange guard**: Rejects out-of-range saves with a toast before debounced save fires. Uses `t(...)` style.
4. **Batch save guard**: In the `saveNowTrigger` batch path, skips out-of-range cells silently (no toast spam in batch).

## Submission Hard Gate Strategy

`submit_timesheet_safe` validates ALL period entries against their engagement date windows BEFORE setting `submitted_at`. This catches:
- Legacy entries created before the trigger existed.
- Entries created via direct API calls bypassing the UI.
- Entries where engagement dates were changed after logging.

Error code `ENGAGEMENT_DATE_RANGE_VIOLATION` is mapped to a localized toast with corrective guidance ("correct or remove them first").

## i18n Plan

| Key | EN | ES |
|---|---|---|
| `timesheet.dateOutsideEngagementRange` | Cannot log hours: date is outside the engagement's valid date range | No se pueden registrar horas: la fecha esta fuera del rango de vigencia del encargo |
| `timesheet.cellOutsideEngagementDates` | This date is outside the engagement's start/end date range | Esta fecha esta fuera del rango de fecha de inicio/fin del encargo |
| `timesheet.submitDateRangeViolation` | Cannot submit: some entries are outside their engagement's valid date range. Please correct or remove them first. | No se puede enviar: algunas entradas estan fuera del rango de vigencia del encargo. Corrija o eliminelas primero. |

## Test Plan

### Automated Tests

#### T1: `src/components/timesheet/__tests__/timesheetEngagementWeekOverlap.test.ts`

Grid-level week-overlap filtering logic (matches ownership model):

```ts
describe("TimesheetGrid engagement week-overlap filtering (BUG 0220-63)", () => {
  function overlapsWeek(
    eng: { start_date: string | null; end_date: string | null },
    weekStart: string, weekEnd: string
  ): boolean {
    const startOk = !eng.start_date || eng.start_date <= weekEnd;
    const endOk = !eng.end_date || eng.end_date >= weekStart;
    return startOk && endOk;
  }

  it("engagement fully containing week -> selectable", ...)
  it("engagement starting mid-week -> selectable", ...)
  it("engagement ending before week -> not selectable", ...)
  it("engagement starting after week -> not selectable", ...)
  it("null start_date -> always selectable", ...)
  it("null end_date -> always selectable", ...)
  it("both null -> always selectable", ...)
  it("engagement ending on week start day -> selectable (boundary inclusive)", ...)
  it("engagement starting on week end day -> selectable (boundary inclusive)", ...)
  it("already-used out-of-range engagement remains visible", ...)
});
```

#### T2: `src/components/timesheet/__tests__/timesheetCellDateLock.test.ts`

Per-cell lock logic:

```ts
describe("TimesheetGrid cell engagement date lock (BUG 0220-63)", () => {
  function isCellOutOfRange(
    dateStr: string, startDate: string | null, endDate: string | null
  ): boolean {
    if (startDate && dateStr < startDate) return true;
    if (endDate && dateStr > endDate) return true;
    return false;
  }

  it("date before start_date -> locked", ...)
  it("date after end_date -> locked", ...)
  it("date within range -> unlocked", ...)
  it("null start_date -> never locked from start side", ...)
  it("null end_date -> never locked from end side", ...)
  it("both null -> never locked", ...)
  it("date equals start_date -> unlocked (boundary inclusive)", ...)
  it("date equals end_date -> unlocked (boundary inclusive)", ...)
});
```

#### T3: `src/hooks/__tests__/useTimesheetMutations.dateRange.test.ts`

Error mapping for save and submit paths:

```ts
describe("Timesheet date range error mapping (BUG 0220-63)", () => {
  it("upsert error containing ENGAGEMENT_DATE_RANGE maps to dateOutsideEngagementRange", ...)
  it("submit error containing ENGAGEMENT_DATE_RANGE_VIOLATION maps to submitDateRangeViolation", ...)
  it("ENGAGEMENT_DATE_RANGE_VIOLATION does not false-match shorter ENGAGEMENT_DATE_RANGE in submit handler", ...)
  it("other errors still routed to existing handlers", ...)
});
```

#### T4: `src/locales/__tests__/i18n.engagementDateRange.test.ts`

i18n key resolution:

```ts
import en from "@/locales/en.json";
import es from "@/locales/es.json";

describe("i18n engagement date range keys (BUG 0220-63)", () => {
  it("EN resolves timesheet.dateOutsideEngagementRange", ...)
  it("ES resolves timesheet.dateOutsideEngagementRange", ...)
  it("EN resolves timesheet.cellOutsideEngagementDates", ...)
  it("ES resolves timesheet.cellOutsideEngagementDates", ...)
  it("EN resolves timesheet.submitDateRangeViolation", ...)
  it("ES resolves timesheet.submitDateRangeViolation", ...)
});
```

### Manual Validation Checklist

1. Create engagement with start=2026-02-18, end=2026-03-26.
2. Open week 2026-02-09..2026-02-13: engagement NOT selectable for new rows.
3. Open week 2026-02-16..2026-02-20: engagement selectable; Mon 16 and Tue 17 cells disabled with tooltip; Wed-Fri editable.
4. Open week 2026-03-23..2026-03-27: Fri 27/03 cell disabled; Mon-Thu enabled.
5. Open week 2026-03-30..2026-04-03: engagement NOT selectable for new rows.
6. Internal engagement with null dates remains selectable across all weeks with all cells enabled.
7. Existing out-of-range entries still display in the grid for visibility/deletion.
8. Direct API insert/update out of range: rejected with ENGAGEMENT_DATE_RANGE error token.
9. Submit with pre-existing out-of-range row: submit blocked with submitDateRangeViolation toast.

## Acceptance Criteria

1. Dropdown for new rows excludes engagements with no overlap to current week.
2. Already-used out-of-range engagements remain visible in existing rows for correction/deletion.
3. Out-of-range cells are disabled with visual cue (`bg-muted/40`) and tooltip.
4. `handleHoursChange` and batch save paths block out-of-range writes.
5. DB trigger rejects INSERT and UPDATE out-of-range writes with deterministic token `ENGAGEMENT_DATE_RANGE`.
6. `submit_timesheet_safe` blocks submit BEFORE `submitted_at` update with deterministic token `ENGAGEMENT_DATE_RANGE_VIOLATION`.
7. EN/ES messages appear correctly for both save-block and submit-block cases.
8. Boundary dates (`== start_date`, `== end_date`) are inclusive (accepted).
9. Null boundaries treated as unbounded.
10. Translation calls in TimesheetGrid use `t(...)` style; mutation hooks use `i18n.t(...)` style.
11. All 4 automated test files pass.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Legacy invalid rows become impossible to address | Used engagement rows remain visible; allow in-range correction/removal |
| False positives in date comparison | ISO strings only; boundary-focused unit tests |
| Trigger blocks non-date updates unexpectedly | Validation only checks `date_worked` vs engagement bounds; hours-only updates on valid dates pass |
| Submit gate surprises users with old bad data | Actionable localized toast with remediation instructions |
| `ENGAGEMENT_DATE_RANGE` false-matches `ENGAGEMENT_DATE_RANGE_VIOLATION` | In submit handler, check `_VIOLATION` suffix first |

## Rollback

1. Drop trigger: `DROP TRIGGER IF EXISTS trg_check_engagement_dates ON time_entries; DROP FUNCTION IF EXISTS check_time_entry_engagement_dates;`
2. Revert `submit_timesheet_safe` to prior version (remove date range validation block).
3. Revert `ApprovedEngagement` type changes in `useTimesheetWeek.ts`.
4. Remove dropdown filtering, cell-locking, and guards in `TimesheetGrid.tsx`.
5. Remove i18n keys and error handler additions from mutations and locale files.
6. Run regression tests.

## Definition of Done

- All four enforcement layers implemented and consistent.
- Filtering ownership and tests are aligned (grid-level, not hook-level).
- Translation calls in TimesheetGrid use `t(...)` (not `i18n` singleton).
- `ApprovedEngagement` includes `start_date`/`end_date`.
- DB trigger active on INSERT + UPDATE with deterministic token.
- Submit hard gate active BEFORE `submitted_at` with deterministic token.
- EN/ES i18n keys added for all three messages.
- Error mappings in upsert and submit handlers with correct precedence.
- 4 automated test files pass.
- Manual checklist completed.
- Changelog appended to `docs/CHANGELOG-2026-02-24.md`.
- No code changes executed in this response -- plan only.


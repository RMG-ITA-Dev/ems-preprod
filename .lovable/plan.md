
# Plan: Timesheet Week Calendar Coloring (CALENDAR_WEEKS_COLORCHANGE v2 -- Revision A)

## Overview

Add week-based status tinting to the WeekNavigator calendar popover, consuming the existing `useWeekStatuses` hook as the single source of truth. Each day cell in the calendar is tinted based on its ISO week's status. No backend changes. No modifications to `calendar.tsx` or any other calendar instance.

---

## GATE 1: Prerequisite Verification (BLOCKER)

Implementation MUST NOT begin until both levels pass.

### A. Repository Evidence

| Check | Result |
|-------|--------|
| `src/hooks/useWeekStatuses.ts` exists and calls `supabase.rpc('get_week_statuses', ...)` | **[PASS]** -- File exists at lines 33-37, calls RPC with `p_staff_id`, `p_start_date`, `p_end_date` |
| Migration defining `public.get_week_statuses` exists | **[PASS]** -- `supabase/migrations/20260222230152_45c4afe3-fdc2-45b0-82f3-5d13ad830d11.sql` contains `CREATE OR REPLACE FUNCTION public.get_week_statuses` |
| Hook exports `WeekStatusCode` type union with all 8 statuses | **[PASS]** -- Lines 4-12: APPROVED, PENDING_APPROVAL, NOT_LOGGED, NOT_SUBMITTED, DRAFT, REJECTED, CURRENT, FUTURE |

### B. Runtime Evidence

| Check | Result |
|-------|--------|
| RPC exists in deployed DB | **[PASS]** -- `information_schema.routines` query confirmed `get_week_statuses` exists |
| RPC returns expected payload shape | **[PASS]** -- Tested with staff `908738f1-...`, range `2026-01-01` to `2026-02-28`. Returned 9 weeks with correct fields: `week_start`, `week_end`, `status`, `total_logged_hours`, `expected_hours`, `missing_hours`, `is_submitted`, `is_current_week`. Statuses observed: `NOT_LOGGED` (8 weeks), `CURRENT` (1 week). |
| Environment | Test (Lovable Cloud preview) |
| Timestamp | 2026-02-23T00:41Z |

### Failure Template

If either check had failed:
> "STOP: Prerequisite missing -- [RPC not deployed / hook not found]. Cannot proceed with CALENDAR_WEEKS_COLORCHANGE until [specific fix]. Notifying Sergio."

**GATE 1 STATUS: PASS -- Prerequisites verified at both repository and runtime levels.**

---

## GATE 2: DOM Target Verification (BLOCKER)

Determines where DayPicker modifier classes land and which CSS selectors are needed.

### Observed DOM Structure (from live browser inspection)

In react-day-picker v8 with custom `classNames` prop (as used in `src/components/ui/calendar.tsx`):

```text
<td class="[cell classes]">           <-- classNames.cell
  <button class="[day classes]"       <-- classNames.day + classNames.day_selected/day_today
          aria-selected="true|false"  <-- set by DayPicker on selected day
  >
    16
  </button>
</td>
```

**Key findings:**

| Element | Classes Applied | Evidence |
|---------|----------------|----------|
| `<td>` (cell) | `classNames.cell` only | calendar.tsx line 31 |
| `<button>` (day) | `classNames.day` + modifier classes (`day_selected`, `day_today`) + `modifiersClassNames` | calendar.tsx lines 32-36; DayPicker v8 docs |
| Selected day | `aria-selected="true"` on `<button>` | Browser extract confirmed |
| Today | No `aria-current` or `data-today` attribute; only gets `day_today` className | DayPicker v8 behavior with custom classNames |

### Decision: Modifiers land on `<button>` (same element as today/selected)

This means modifier tint classes, `day_today` classes, and `day_selected` classes ALL compete on the same `<button>`. Tailwind utility order is non-deterministic, so explicit precedence is needed.

### Chosen Precedence Strategy (Two-Layer)

**Layer 1 -- JS exclusion (primary, for today):**
When building modifier Date arrays, **exclude today's date** from ALL modifier buckets. Result: today's button receives only `day_today` classes (`bg-muted text-secondary font-semibold`) with zero conflict. This is the safest approach because there is no reliable `aria-current` or `data-today` attribute to target with CSS.

**Layer 2 -- CSS override (safety net, for selected):**
Use `button[aria-selected="true"]` scoped under `.week-status-calendar`. This attribute IS reliably set (confirmed in browser). The scoped CSS ensures `bg-primary` wins over any tint class.

```text
Final precedence result:
1) Today       --> JS: excluded from modifiers --> bg-muted (no conflict)
2) Selected    --> CSS: aria-selected scoped override --> bg-primary
3) Disabled    --> existing day_disabled/day_outside --> dimmed
4) Status tint --> modifiersClassNames on button --> low-opacity bg
5) Default     --> ghost button styling
```

### Artifacts

- DOM selector for selected: `button[aria-selected="true"]` -- **confirmed present in live DOM**
- DOM selector for today: **none reliable** (no `aria-current`, no `data-today`); solved by JS exclusion instead
- Scope class: `.week-status-calendar` -- applied only to this CalendarComponent instance

**GATE 2 STATUS: PASS -- DOM structure verified. Two-layer precedence strategy confirmed.**

---

## Status-to-Color Mapping

```text
Status              Modifier Key     CSS Class                                Token
------------------  ---------------  ---------------------------------------  ------------------
APPROVED            approved         bg-success/15                            --success (existing)
PENDING_APPROVAL    pending          bg-warning/20                            --warning (existing)
REJECTED            rejected         bg-[hsl(var(--week-rejected))]/20        --week-rejected (NEW)
DRAFT               notReported      bg-destructive/15                        --destructive (existing)
NOT_SUBMITTED       notReported      bg-destructive/15                        --destructive (existing)
NOT_LOGGED          notReported      bg-destructive/15                        --destructive (existing)
CURRENT             currentWeek      bg-[hsl(var(--brand-purple))]/20         --brand-purple (existing)
FUTURE              (none)           (no tint)                                -
```

REJECTED is VIOLET. NOT red. Explicit requirement.

---

## Changes by File

### 1. `src/index.css`

**Add CSS variable** `--week-rejected` in `:root` and `.dark`:

```text
:root {
  --week-rejected: 270 60% 70%;
}

.dark {
  --week-rejected: 270 55% 65%;
}
```

**Add scoped CSS** for selected-day precedence (Layer 2 safety net):

```text
@layer components {
  .week-status-calendar button[aria-selected="true"] {
    background-color: hsl(var(--primary)) !important;
    color: hsl(var(--primary-foreground)) !important;
  }
}
```

Scoped to `.week-status-calendar` -- no other calendar affected.

No CSS rule needed for today (handled by JS exclusion in Layer 1).

### 2. `src/pages/TimeSheet.tsx`

**Single prop addition** at line ~388-397:

Add `staffId={staffRecord.staff_id}` to the existing `<WeekNavigator>` invocation.

No other changes to this file.

### 3. `src/components/timesheet/WeekNavigator.tsx`

This is the core file. All changes listed:

#### 3a. Props

Add `staffId?: string` to `WeekNavigatorProps` interface (line 27-36).

#### 3b. New imports

```text
- useState, useMemo, useEffect (extend existing useState import)
- startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay from date-fns
- useWeekStatuses, WeekStatusCode from @/hooks/useWeekStatuses
- getWeekMonday already imported (line 24)
```

#### 3c. Controlled month state

Add state + sync effect:

```text
const [displayedMonth, setDisplayedMonth] = useState(currentWeekStart);

useEffect(() => {
  setDisplayedMonth(currentWeekStart);
}, [currentWeekStart]);
```

This ensures month view syncs when user clicks Prev/Next week buttons.

#### 3d. Visible grid range computation

```text
const gridStart = startOfWeek(startOfMonth(displayedMonth), { weekStartsOn: 0 });
const gridEnd = endOfWeek(endOfMonth(displayedMonth), { weekStartsOn: 0 });
const gridStartISO = format(gridStart, 'yyyy-MM-dd');
const gridEndISO = format(gridEnd, 'yyyy-MM-dd');
```

Uses `weekStartsOn: 0` (Sunday) to match DayPicker's default grid layout.

#### 3e. Hook call

```text
const { data: weekStatuses } = useWeekStatuses(staffId, gridStartISO, gridEndISO);
```

Only fires when staffId is provided. Cached 5 minutes via TanStack Query.

#### 3f. Build modifiers (useMemo)

```text
1. Build Map<string, WeekStatusCode> from weekStatuses (keyed by week_start yyyy-MM-dd)
2. Get today = new Date()
3. Iterate every day in [gridStart..gridEnd] via eachDayOfInterval
4. For each day:
   a. If isSameDay(day, today) --> SKIP (Layer 1: today exclusion)
   b. Compute monday = getWeekMonday(day)
   c. Convert to 'yyyy-MM-dd' key
   d. Look up status in Map
   e. Push day into appropriate bucket:
      APPROVED --> approved[]
      PENDING_APPROVAL --> pending[]
      REJECTED --> rejected[]
      DRAFT / NOT_SUBMITTED / NOT_LOGGED --> notReported[]
      CURRENT --> currentWeek[]
      FUTURE --> skip
5. Return { modifiers, modifiersClassNames }

modifiersClassNames = {
  approved: 'bg-success/15',
  pending: 'bg-warning/20',
  rejected: 'bg-[hsl(var(--week-rejected))]/20',
  notReported: 'bg-destructive/15',
  currentWeek: 'bg-[hsl(var(--brand-purple))]/20',
}

Memo dependencies: [weekStatuses, gridStart, gridEnd]
```

#### 3g. Update CalendarComponent props

Replace current CalendarComponent invocation (lines 127-135):

```text
<CalendarComponent
  mode="single"
  selected={currentWeekStart}
  onSelect={handleDateSelect}
  month={displayedMonth}                    // CHANGED: was defaultMonth
  onMonthChange={setDisplayedMonth}          // NEW
  fromDate={earliestWeekStart}
  toDate={latestWeekStart ? new Date(...) : undefined}
  className="pointer-events-auto week-status-calendar"  // CHANGED: added scope class
  modifiers={modifiers}                      // NEW
  modifiersClassNames={modifiersClassNames}  // NEW
/>
```

DayPicker props added: `month`, `onMonthChange`, `modifiers`, `modifiersClassNames`.

#### 3h. Compact legend (below calendar in PopoverContent)

Inside PopoverContent, after CalendarComponent:

```text
<div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-3 pt-1 text-[0.65rem] text-muted-foreground">
  [green dot] {t("timesheet.legend.approved")}
  [yellow dot] {t("timesheet.legend.pending")}
  [violet dot] {t("timesheet.legend.rejected")}
  [red dot] {t("timesheet.legend.notReported")}
  [purple dot] {t("timesheet.legend.currentWeek")}
</div>
```

Each dot: `<span className="inline-block h-2.5 w-2.5 rounded-sm bg-{token}/40" />`

### 4. `src/locales/en.json` and `src/locales/es.json`

Add 5 legend keys:

| Key | EN | ES |
|-----|----|----|
| `timesheet.legend.approved` | Approved | Aprobado |
| `timesheet.legend.pending` | Pending | Pendiente |
| `timesheet.legend.rejected` | Rejected | Rechazado |
| `timesheet.legend.notReported` | Not reported | Sin registrar |
| `timesheet.legend.currentWeek` | Current week | Semana actual |

---

## Files NOT Modified

- `src/components/ui/calendar.tsx` -- unchanged (spreads `...props` including modifiers)
- `src/hooks/useWeekStatuses.ts` -- consumed as-is
- `src/lib/timesheetUtils.ts` -- imported `getWeekMonday()`, no changes
- No database files -- RPC already exists and is deployed
- No other calendar instances (PeriodSelector, HolidayForm, EngagementForm, ExpenseLogForm)

---

## Acceptance Criteria mapped to Manual Tests

| AC | Criterion | Test |
|----|-----------|------|
| AC-1 | Current week tinted purple; today cell remains grey | T-1: Open Hoja de Tiempo, open week calendar. Current week days tinted purple. Today (23) stays grey (excluded from modifiers). |
| AC-2 | APPROVED weeks tinted light green | T-2: Navigate to a past month with known approved weeks. Green tint across those week days. |
| AC-3 | PENDING_APPROVAL weeks tinted yellow | T-3: Navigate to month with pending weeks. Yellow tint. |
| AC-4 | REJECTED weeks tinted violet (NOT red) | T-4: Find/create a rejected approval scenario. Verify violet tint on that week. |
| AC-5 | DRAFT / NOT_SUBMITTED / NOT_LOGGED tinted red | T-5: Find week with hours but never submitted (red). T-6: Find week with no entries (red). |
| AC-6 | FUTURE weeks have no tint | T-7: Navigate forward beyond today. No tint for future weeks. |
| AC-7 | Selected day styling remains fully visible | T-8: Click dates across tinted weeks. Selected day shows solid primary bg (not washed by tint). |
| AC-8 | Month navigation updates coloring (refetch) | T-8: Navigate months in calendar. Tints update per month. |
| AC-9 | Clicking a date still selects ISO week Monday | T-8: Click any date. Verify week range updates to that Monday. |
| AC-10 | No duplicate status logic | Code review: only `useWeekStatuses` called; no inline status derivation. |
| AC-11 | `fromDate` restriction still enforced | T-10: Verify weeks before hire date remain unselectable. |
| AC-12 | Dark mode tints visible | T-9: Toggle dark mode. All tints visible; today/selected correct. |

---

## Risk Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tint overrides today | **Eliminated** | Today excluded from all modifier arrays in JS (Layer 1) |
| Tint overrides selected | Low | `button[aria-selected="true"]` scoped CSS with `!important` (Layer 2) |
| Sun-start grid vs Mon-keyed statuses | **Eliminated** | Every day mapped via `getWeekMonday()` |
| Excess refetching on month nav | Low | TanStack Query caching (staleTime 5min) + queryKey dedup |
| Dark mode tints washed out | Low | Separate `--week-rejected` dark value; semantic tokens have dark variants |
| Other calendars affected | **Eliminated** | All CSS scoped to `.week-status-calendar`; no changes to `calendar.tsx` |

---

## Rollback Plan

Remove `modifiers`, `modifiersClassNames`, `month`, `onMonthChange` props and `week-status-calendar` class from WeekNavigator's CalendarComponent. Remove scoped CSS + `--week-rejected` variable from `index.css`. Remove `staffId` prop plumbing. Remove legend keys from locale files. No backend rollback needed.

---

## Plan Status: READY_FOR_IMPLEMENTATION

Both blocker gates passed. All file changes, prop plumbing, DayPicker props, CSS selectors, and manual tests are explicitly defined and justified by observed DOM evidence.

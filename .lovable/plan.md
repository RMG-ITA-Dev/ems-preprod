# Plan: Unified Week Status Engine (0220-50 v5 — Final)

## Overview

Build a single, reusable "Week Status" RPC that returns workflow-compliant status for every week in any date range. This replaces the current `PendingHoursAlert` (which calls `get_my_pending_hours` and is invisible due to null `hire_date`) with a period-aware indicator driven by the Dashboard's Period Selector. The same hook will later power calendar coloring in the Timesheet WeekNavigator -- no new backend logic needed at that point.

## Key Finding: Existing Duplicate Logic

The edge function `supabase/functions/dashboard-data/index.ts` already contains a `getTimesheetStatus()` function (lines 822-923) that computes week-by-week status using `timesheet_periods` + `timesheet_line_approvals`. This logic will be **replaced** by having the edge function call the new DB RPC, establishing one source of truth (Amendment A1).

## Status Definitions with Color Contract

```text
Status              Description                                              Dashboard Color    Future Calendar Color
------------------  -------------------------------------------------------  -----------------  ---------------------
CURRENT             Week contains today                                      Ruizmier purple    bg-purple-100/50
APPROVED            Period submitted, ALL line_approvals = 'approved'         Light green        bg-green-100/50
PENDING_APPROVAL    Period submitted, any line_approval = 'pending'           Yellow             bg-yellow-100/50
REJECTED            Period submitted, any line_approval = 'rejected'          Violet             bg-violet-100/50
DRAFT               Period exists, submitted_at IS NULL                       Red                bg-red-100/50
NOT_SUBMITTED       No period row BUT time_entries > 0 exist                  Red                bg-red-100/50
NOT_LOGGED          No period row AND no time_entries                         Red                bg-red-100/50
FUTURE              Week is entirely after today                              Neutral/skip       No modifier
```

Note: `timesheet_periods.status` column is vestigial and not used. All status is derived from `submitted_at` + `timesheet_line_approvals` (Amendment A4).

Special case (Amendment A6): If a period is submitted but `timesheet_line_approvals` has zero rows for it, treat as PENDING_APPROVAL (safe default), not APPROVED.

---

## Changes

### 1. Database: New RPC `get_week_statuses`

**Signature:** `get_week_statuses(p_staff_id UUID, p_start_date DATE, p_end_date DATE) RETURNS JSONB`

**Returns:** Array of ALL weeks in range (not just deficient ones):

```json
[
  {
    "week_start": "2026-01-05",
    "week_end": "2026-01-09",
    "status": "APPROVED",
    "total_logged_hours": 40.0,
    "expected_hours": 40.0,
    "missing_hours": 0.0,
    "is_submitted": true,
    "is_current_week": false
  }
]
```

**Implementation logic per week:**

```text
1. Compute week Monday -> Friday
2. Clamp effective range to hire_date / termination_date / period bounds
3. Skip if effective range is invalid (before hire or after termination)
4. If week contains today:
     -> status = 'CURRENT', is_current_week = true
     -> DO NOT EXIT; continue to next week (Amendment A2)
5. If week_start > CURRENT_DATE:
     -> status = 'FUTURE'; continue (include all weeks in range)
6. Calculate expected_hours: (working days minus holidays) x daily capacity
7. Sum actual logged hours from time_entries (is_forecast = false)
8. missing_hours = GREATEST(expected - actual, 0) (Amendment A5)
9. Look up timesheet_period for this staff + week_start
10. If NO period row:
      If actual > 0 -> 'NOT_SUBMITTED' (Amendment A3)
      Else -> 'NOT_LOGGED'
11. If period exists, submitted_at IS NULL -> 'DRAFT'
12. If period exists, submitted_at NOT NULL:
      Query timesheet_line_approvals for this period_id
      If zero approval rows -> 'PENDING_APPROVAL' (Amendment A6)
      If ALL status='approved' -> 'APPROVED'
      If ANY status='rejected' -> 'REJECTED'
      Else -> 'PENDING_APPROVAL'
13. Always include week_end in output (Amendment A5)
```

**Key design decisions:**

- Returns ALL weeks including CURRENT and FUTURE (needed for calendar coloring)
- `hire_date` being NULL does not block execution -- just means no lower clamp
- `missing_hours` clamped to >= 0 (no negative values)
- Holiday-aware via the existing `holidays` table
- Existing `get_my_pending_hours` RPC is left untouched (used by termination gate)

### 2. Edge Function: Refactor `getTimesheetStatus()` (Amendment A1)

**File:** `supabase/functions/dashboard-data/index.ts`

Replace the inline week-status logic in `getTimesheetStatus()` (lines 822-923) with a call to the new RPC. The edge function becomes a thin wrapper that maps RPC output to the existing response format.

### 3. Frontend: New Hook `useWeekStatuses`

**File:** `src/hooks/useWeekStatuses.ts`

```typescript
export type WeekStatusCode =
  | 'APPROVED' | 'PENDING_APPROVAL' | 'NOT_LOGGED'
  | 'NOT_SUBMITTED' | 'DRAFT' | 'REJECTED' | 'CURRENT' | 'FUTURE';

export interface WeekStatus {
  week_start: string;
  week_end: string;
  status: WeekStatusCode;
  total_logged_hours: number;
  expected_hours: number;
  missing_hours: number;
  is_submitted: boolean;
  is_current_week: boolean;
}

export function useWeekStatuses(
  staffId: string | undefined,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: ['week-statuses', staffId, startDate, endDate],
    queryFn: async () => { /* call RPC */ },
    enabled: !!staffId && !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000,
  });
}
```

### 4. Frontend: Rewrite `PendingHoursAlert.tsx`

**Key changes:**

- Import `useDashboard()` to get `startDateStr`, `endDateStr`
- Call `useWeekStatuses(staffId, startDateStr, endDateStr)`
- Derive summary counts with **four** visual groups:


| Group             | Statuses Included                | Chip/Badge Color                       |
| ----------------- | -------------------------------- | -------------------------------------- |
| Red (actionable)  | NOT_LOGGED, NOT_SUBMITTED, DRAFT | Red                                    |
| Violet (rejected) | REJECTED                         | Violet                                 |
| Yellow (waiting)  | PENDING_APPROVAL                 | Yellow                                 |
| Green (done)      | APPROVED                         | Light green                            |
| Purple (info)     | CURRENT                          | Ruizmier purple (excluded from counts) |
| Neutral           | FUTURE                           | Excluded                               |


- Display a **four-segment summary** with colored chips:
  - Red chip: "X weeks not reported (Y.Yh missing)"
  - Violet chip: "X weeks rejected" (only if count > 0)
  - Yellow chip: "X weeks pending approval"
  - Green chip: "X weeks approved"
- Collapsible detail table with columns: Week | Status | Expected | Logged | Missing
  - Status column badges use the per-status color:
    - NOT_LOGGED / NOT_SUBMITTED / DRAFT: `bg-destructive/10 text-destructive border-destructive/30`
    - REJECTED: `bg-violet-100 text-violet-700 border-violet-300`
    - PENDING_APPROVAL: `bg-warning/10 text-warning border-warning/30`
    - APPROVED: `bg-green-100 text-green-700 border-green-300`
    - CURRENT: `bg-primary/10 text-primary border-primary/30`
- Component renders if ANY week has a non-APPROVED/non-CURRENT/non-FUTURE status
- If ALL past weeks are APPROVED, component returns null

### 5. i18n: Update Translation Keys


| Key                               | EN                                          | ES                                             |
| --------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| `pendingHours.title`              | Week Status Report                          | Reporte de Estado Semanal                      |
| `pendingHours.summaryNotLogged`   | {{count}} not reported ({{hours}}h missing) | {{count}} sin registrar ({{hours}}h faltantes) |
| `pendingHours.summaryPending`     | {{count}} pending approval                  | {{count}} pendiente(s) de aprobacion           |
| `pendingHours.summaryRejected`    | {{count}} rejected                          | {{count}} rechazada(s)                         |
| `pendingHours.summaryApproved`    | {{count}} approved                          | {{count}} aprobada(s)                          |
| `pendingHours.statusApproved`     | Approved                                    | Aprobado                                       |
| `pendingHours.statusPending`      | Pending                                     | Pendiente                                      |
| `pendingHours.statusNotLogged`    | Not Logged                                  | Sin Registrar                                  |
| `pendingHours.statusNotSubmitted` | Not Submitted                               | No Enviado                                     |
| `pendingHours.statusDraft`        | Draft                                       | Borrador                                       |
| `pendingHours.statusRejected`     | Rejected                                    | Rechazado                                      |
| `pendingHours.statusCurrent`      | Current Week                                | Semana Actual                                  |
| `pendingHours.status`             | Status                                      | Estado                                         |


### 6. Future Calendar Coloring Contract (NOT implemented now)

The `useWeekStatuses` hook is designed so future Timesheet calendar coloring requires ONLY UI work:

```text
Future plan for WeekNavigator.tsx:
1. Call useWeekStatuses(staffId, calendarMonthStart, calendarMonthEnd)
2. Build a Map<weekStart, WeekStatus>
3. For each day in calendar, find its week_start, get status
4. Pass modifiers + modifiersClassNames to DayPicker:

   Status              Modifier Class
   ------------------  --------------------
   APPROVED            bg-green-100/50
   PENDING_APPROVAL    bg-yellow-100/50
   REJECTED            bg-violet-100/50
   NOT_LOGGED          bg-red-100/50
   NOT_SUBMITTED       bg-red-100/50
   DRAFT               bg-red-100/50
   CURRENT             bg-purple-100/50
   Today               grey (existing day_today styling, unchanged)
   FUTURE              no modifier / neutral

5. No new RPC or business logic needed -- just CSS mapping
```

The integration point is `WeekNavigator.tsx` line 127-135 where `CalendarComponent` (wrapping `DayPicker`) already accepts `modifiers` and `modifiersClassNames` props natively via react-day-picker v8.

---

## Files Modified


| File                                                 | Change                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| **Migration SQL**                                    | New RPC `get_week_statuses(p_staff_id, p_start_date, p_end_date)`        |
| `**supabase/functions/dashboard-data/index.ts**`     | Refactor `getTimesheetStatus()` to call new RPC (single source of truth) |
| `**src/hooks/useWeekStatuses.ts**`                   | New reusable hook (shared by dashboard now + calendar later)             |
| `**src/components/dashboard/PendingHoursAlert.tsx**` | Rewrite: period-aware + status-based display with 4-color grouping       |
| `**src/locales/en.json**`                            | Add/update status translation keys                                       |
| `**src/locales/es.json**`                            | Add/update status translation keys                                       |


&nbsp;

Please document the implementation of this PLAN by appending it to the [CHANGELOG-2026-02-2.md](http://CHANGELOG-2026-02-2.md) file In the Codebase.

**Not modified:**

- `get_my_pending_hours` RPC -- untouched (used by termination gate)
- `WeekNavigator.tsx` -- untouched now; will consume `useWeekStatuses` in a future plan
- `calendar.tsx` -- untouched now; `modifiers` prop added in future plan

---

## Amendment Checklist


| ID     | Amendment                                                  | Addressed |
| ------ | ---------------------------------------------------------- | --------- |
| A1     | Single source of truth: refactor edge function to call RPC | Yes       |
| A2     | Return CURRENT week, don't EXIT                            | Yes       |
| A3     | Distinguish NOT_SUBMITTED (hours exist, no period)         | Yes       |
| A4     | Document timesheet_periods.status is vestigial             | Yes       |
| A5     | Include week_end + clamp missing_hours >= 0                | Yes       |
| A6     | Submitted with zero line_approvals = PENDING_APPROVAL      | Yes       |
| **v5** | **REJECTED color changed from red to violet everywhere**   | **Yes**   |


## Acceptance Criteria


| Criterion                                       | Expected                                                     |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Indicator tied to Period Selector               | Changing FY/quarter/custom updates the alert                 |
| Returns ALL weeks including CURRENT             | CURRENT week shown with purple badge, not flagged as missing |
| NOT_LOGGED vs NOT_SUBMITTED distinguished       | Different status codes for each                              |
| APPROVED weeks shown in green                   | All lines approved for that period                           |
| PENDING_APPROVAL shown in yellow                | Submitted but not fully approved                             |
| REJECTED shown in violet (not red)              | Distinct from red group                                      |
| Red group (NOT_LOGGED/NOT_SUBMITTED/DRAFT)      | Clearly flagged as actionable                                |
| Holiday-aware expected hours                    | Deducts holidays from working days                           |
| Hire/termination dates respected                | Weeks outside employment skipped                             |
| Null hire_date handled gracefully               | No lower clamp, all weeks in period evaluated                |
| Edge function uses RPC (single source of truth) | `getTimesheetStatus()` calls `get_week_statuses`             |
| `useWeekStatuses` hook reusable                 | Can be called from WeekNavigator without changes             |
| Existing unit tests                             | 341/341 still pass                                           |
| Old `get_my_pending_hours` RPC                  | Unchanged                                                    |



# Bug #16: Filter Approval List by Approver Eligibility

## Problem

The `usePendingApprovalSummaries()` hook fetches ALL pending line approvals from the database without filtering by whether the current user can actually approve them. A Manager sees timesheets they have no authority over, then finds no actionable items when drilling into the detail view. This is confusing and makes legitimate approvals hard to find.

## Fix

Filter the approval summaries by calling `can_approve_timesheet_line` for each unique period+engagement combination, keeping only periods where the current user can approve at least one engagement line. Also recalculate `totalPendingHours` to reflect only the approvable engagements (not all pending hours).

## Scope

The DB function `can_approve_timesheet_line` is correct by design -- it enforces that only the assigned manager/partner (or higher-ranked staff) can approve. No DB changes needed. The fix is purely frontend filtering.

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useTimesheetApprovals.ts` | In `usePendingApprovalSummaries` queryFn: after building `summaryMap`, call `can_approve_timesheet_line` RPC per period+engagement pair, filter out non-approvable periods, and recalculate hours to only count approvable engagement hours |

## Technical Detail

After the existing `summaryMap` is built (line ~174), add a filtering step:

1. Get the current auth user ID via `supabase.auth.getUser()`
2. Collect all unique `(period_id, engagement_id)` pairs from the approvals
3. Call `can_approve_timesheet_line` RPC for each pair (batched, not N+1 per summary)
4. Build a Set of approvable `period_id:engagement_id` keys
5. Rebuild summaries keeping only approvable lines, recalculating `totalPendingHours` and `pendingLineCount`
6. Drop any summary with zero approvable lines

This means a Manager will only see timesheets where they are the assigned manager on at least one engagement, and the hours shown will reflect only the engagements they can approve.


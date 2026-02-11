

# Bug #8 Fix: Staff Cannot Select Engagements in Timesheet

## Problem

New staff members (not assigned as partner or manager) see an empty engagement dropdown in the timesheet because the three-condition filter creates a chicken-and-egg problem -- they can never log their first time entry.

The `engagement_team` table referenced in the changelog was never actually created in the database.

## Proposed Fix

**Immediate approach**: Remove the restrictive client-side filter. Return all active engagements with approved work orders. For a small audit firm, this is appropriate -- the work order approval process already gates which engagements are billable.

### Single file change: `src/hooks/useTimesheetWeek.ts`

**Lines 131-185** (the `engagementsQuery`): Remove the second query for prior time entries and the client-side filter. Keep only the approved-WO check and active status filter.

Before:
```typescript
// 3 queries: work_orders -> engagements -> time_entries + client-side filter
```

After:
```typescript
// 2 queries: work_orders -> engagements (no client-side filter)
const { data: workOrders } = await supabase
  .from("work_orders")
  .select("engagement_id")
  .eq("approval_status", "Approved");

const approvedIds = workOrders?.map(wo => wo.engagement_id) || [];
if (approvedIds.length === 0) return [];

const { data: engagements } = await supabase
  .from("engagements")
  .select(`engagement_id, engagement_code, engagement_name,
           client:clients!client_id(client_id, client_legal_name)`)
  .in("engagement_id", approvedIds)
  .eq("status", "active");

return (engagements || []) as ApprovedEngagement[];
```

The `partner_id` and `manager_id` fields are no longer selected since they're not needed for filtering. The `ApprovedEngagement` interface doesn't include them either.

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useTimesheetWeek.ts` | Remove prior-time query and partner/manager/prior-time filter from engagementsQuery |

## What Does NOT Change

- No database migration
- Work order approval gating remains (only "Approved" WOs surface engagements)
- Active status filter remains
- All other timesheet logic untouched


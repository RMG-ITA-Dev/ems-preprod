

# Plan v3 -- BUG 0306-71: Add Client Name to Approvals View Engagement Rows

## Objective

Show client name below each engagement row in the Timesheet Approval Detail grid so approvers can distinguish similarly named engagements.

## Root Cause

The query in `useTimesheetApprovals.ts` (lines 259-263) joins `engagements` but does not join `clients`. `ApprovalTimesheetGrid.tsx` has no client data to render.

## Changes

### File 1: `src/hooks/useTimesheetApprovals.ts`

**Edit 1** — Extend `TimeEntryForApproval.engagement` interface (lines 61-65):

```typescript
// Before:
  engagement?: {
    engagement_id: string;
    engagement_code: string | null;
    engagement_name: string;
  };

// After:
  engagement?: {
    engagement_id: string;
    engagement_code: string | null;
    engagement_name: string;
    client: {
      client_id: string;
      client_legal_name: string;
    } | null;
  };
```

Uses `client: { ... } | null` (not optional `?`). Supabase returns `null` on a failed join, not `undefined`.

**Edit 2** — Expand engagement join in query (lines 259-263):

```typescript
// Before:
          engagement:engagements(
            engagement_id,
            engagement_code,
            engagement_name
          ),

// After:
          engagement:engagements(
            engagement_id,
            engagement_code,
            engagement_name,
            client:clients!client_id(client_id, client_legal_name)
          ),
```

### File 2: `src/components/timesheet/ApprovalTimesheetGrid.tsx`

**Edit 1** — Add `clientName` to `EngagementGroup` interface (line 38):

```typescript
// Before:
  remainingHours: number | null;
}

// After:
  remainingHours: number | null;
  clientName: string | null;
}
```

**Edit 2** — Populate `clientName` in `groupMap.set()` (line 83):

```typescript
// Before:
          engagementCode: entry.engagement?.engagement_code || null,
          engagementName: entry.engagement?.engagement_name || "",

// After:
          engagementCode: entry.engagement?.engagement_code || null,
          engagementName: entry.engagement?.engagement_name || "",
          clientName: entry.engagement?.client?.client_legal_name || null,
```

**Edit 3** — Two-line rendering in engagement header (lines 218-228):

```tsx
// Before:
                      <div className="flex items-center">
                        <div className="font-medium">
                          <span className="text-xs mr-2">
                            {group.engagementCode}
                          </span>
                          <span className={cn(!isApprovable && "text-muted-foreground")}>
                            {group.engagementName}
                          </span>
                        </div>
                        {renderStatusBadge(group)}
                      </div>

// After:
                      <div className="flex items-center gap-2">
                        <div className="font-medium">
                          <div>
                            <span className="text-xs mr-2">
                              {group.engagementCode}
                            </span>
                            <span className={cn(!isApprovable && "text-muted-foreground")}>
                              {group.engagementName}
                            </span>
                          </div>
                          {group.clientName && (
                            <div className="text-xs text-muted-foreground font-normal">
                              {group.clientName}
                            </div>
                          )}
                        </div>
                        {renderStatusBadge(group)}
                      </div>
```

Uses `text-muted-foreground` (not `opacity-70`) to avoid double-dimming on non-approvable rows.

### File 3: `docs/changelogs/CHANGELOG-2026-03-08.md`

Append:

```markdown
## BUG 0306-71 — Add client name to Approvals view engagement rows

**Priority:** Medium | **Route:** OPERACIONES-Aprobaciones | **Status:** Fixed

**Root cause:** The Supabase query in `useTimesheetApprovals.ts` did not join `clients`, so `client_legal_name` was unavailable. `ApprovalTimesheetGrid.tsx` only rendered engagement code and name, omitting the client.

**Fix:** Extended the engagement select to join `clients!client_id(client_id, client_legal_name)`. Added `clientName` field to `EngagementGroup` interface, populated it in `groupMap.set()`, and rendered it below the engagement name as a second line following the same two-line pattern as `TimesheetGrid.tsx` (line 779-784).

**Files modified:**
- `src/hooks/useTimesheetApprovals.ts` — extend interface + add client join to query
- `src/components/timesheet/ApprovalTimesheetGrid.tsx` — interface, populate, render

**No backend, DB, or schema changes.**
```

## Summary

| File | Action |
|---|---|
| `src/hooks/useTimesheetApprovals.ts` | Extend interface + add client join |
| `src/components/timesheet/ApprovalTimesheetGrid.tsx` | Add clientName field, populate, two-line render |
| `docs/changelogs/CHANGELOG-2026-03-08.md` | Append entry |

No backend, DB, or schema changes. The `engagements.client_id → clients` FK already exists.

## Verification

1. Open OPERACIONES > Aprobaciones > click into a pending timesheet
2. Each engagement header row shows client name on a second line below the engagement name in smaller muted text
3. Long engagement names do not overflow — client name sits on its own line
4. Non-approvable (muted) rows also display client name correctly
5. No regression on hours, budget display, or decision controls


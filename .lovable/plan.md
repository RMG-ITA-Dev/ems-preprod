

# Plan v10 -- BUG 0227-67: Activity Not Cleared When Switching Internal to Client Engagement

## Objective

Ensure Timesheet activity always remains valid for the selected engagement and prevent invalid engagement-activity rows from being saved or submitted.

## Root Cause

In `src/components/timesheet/TimesheetGrid.tsx`, `handleEngagementChange` (lines 420-423):

```text
const isActivityNotRequired = activityNotRequiredIds?.has(engagementId);
const activityId = isActivityNotRequired && adminActivityId
  ? adminActivityId
  : currentRow.activityId;
```

When switching from an internal engagement (ADM auto-assigned) to a client engagement (activity_required=true), the stale ADM activityId carries over. Hour cells stay enabled and save/submit persists the wrong activity.

## Scope

**In scope:** Fix handleEngagementChange, canonical helper, pre-submit validation, i18n keys, unit + component + submit-guard tests, changelog.

**Out of scope:** Database schema changes, unrelated UI redesign.

## Canonical Rules

| Condition | Result |
|---|---|
| `activity_required=false` and `adminActivityId` exists | Assign `adminActivityId` |
| `activity_required=true` and `currentActivityId == adminActivityId` | Clear to `""` |
| Otherwise | Preserve `currentActivityId` |
| `activity_required=true` and `activityId` empty at submit | Block submit with toast |

## Implementation Steps

### Step 1: Create canonical normalization helper

**New file: `src/lib/timesheetActivityRules.ts`**

Create with exact content:

```text
export interface NormalizeActivityInput {
  engagementId: string;
  currentActivityId: string;
  adminActivityId: string | null;
  activityRequired: boolean;
}

export interface NormalizeActivityResult {
  nextActivityId: string;
  wasCleared: boolean;
}

export function normalizeActivityForEngagement(input: NormalizeActivityInput): NormalizeActivityResult {
  const { currentActivityId, adminActivityId, activityRequired } = input;

  if (!activityRequired && adminActivityId) {
    return { nextActivityId: adminActivityId, wasCleared: false };
  }

  if (activityRequired && adminActivityId && currentActivityId === adminActivityId) {
    return { nextActivityId: "", wasCleared: true };
  }

  return { nextActivityId: currentActivityId, wasCleared: false };
}
```

### Step 2: Replace inline logic in TimesheetGrid.tsx

**File: `src/components/timesheet/TimesheetGrid.tsx`**

- Add import at top: `import { normalizeActivityForEngagement } from "@/lib/timesheetActivityRules";`
- Replace lines 420-423 with:

```text
const isActivityNotRequired = activityNotRequiredIds?.has(engagementId);
const engagementObj = engagements.find(e => e.engagement_id === engagementId);
const activityRequired = engagementObj?.activity_required ?? true;
const { nextActivityId: activityId } = normalizeActivityForEngagement({
  engagementId,
  currentActivityId: currentRow.activityId,
  adminActivityId: adminActivityId ?? null,
  activityRequired,
});
```

No other changes to merge/id/duplicate logic. Existing downstream behavior remains intact:
- Empty activityId disables hour cells (line 826)
- Empty activityId causes batch save to skip row (line 235)
- Row ID becomes `{engagementId}-new` when activityId is empty (line 444)

### Step 3: Add submit hard-stop validation

**File: `src/pages/TimeSheet.tsx`**

- Add import: `import { toast } from "sonner";` (currently missing from this file)
- `adminActivityId` is already in scope (line 126). `engagements` is available from `useTimesheetWeek` (line 107).
- Inside `handleSubmit`, after line 302 (`if (uniqueEngagementIds.length === 0) return;`) and before line 305, insert:

```text
// BUG 0227-67: Block submit if any activity-required engagement has empty/invalid activity
const invalidActivityRow = entries.some(entry => {
  const eng = engagements.find(e => e.engagement_id === entry.engagement_id);
  const isActRequired = eng?.activity_required ?? true;
  return isActRequired && (!entry.activity_id || entry.activity_id === adminActivityId);
});
if (invalidActivityRow) {
  toast.error(t("timesheet.invalidActivityRow"));
  return;
}
```

### Step 4: Add i18n keys

**File: `src/locales/en.json`** -- under `timesheet` section add:
```text
"invalidActivityRow": "One or more rows have an invalid activity. Please select a valid activity for each client engagement before submitting."
```

**File: `src/locales/es.json`** -- under `timesheet` section add:
```text
"invalidActivityRow": "Una o mas filas tienen una actividad invalida. Seleccione una actividad valida para cada encargo de cliente antes de enviar."
```

### Step 5: Unit tests for normalization helper

**New file: `src/lib/__tests__/timesheetActivityRules.test.ts`**

6 test cases:
1. `activity_required=false` + `adminActivityId` present: returns adminActivityId, wasCleared=false
2. `activity_required=true` + `currentActivityId === adminActivityId`: returns "", wasCleared=true
3. `activity_required=true` + valid non-ADM activity: preserves, wasCleared=false
4. `activity_required=true` + empty currentActivityId: returns "", wasCleared=false
5. `activity_required=false` + adminActivityId null: returns "" (safe fallback, no throw)
6. Toggle internal->client->internal: each transition returns correct state

### Step 6: Component test for rendered TimesheetGrid transitions

**New file: `src/components/timesheet/__tests__/TimesheetGrid.activity-transition.test.tsx`**

Render real TimesheetGrid with mocked hooks/data. Assert:
1. Internal engagement selection auto-assigns admin activity
2. Switching same row Internal->Client clears activity in rendered UI
3. Required engagement + empty activity disables hour cells
4. Client->Internal reassigns admin activity

### Step 7: Submit guard integration test

**Modify file: `src/pages/__tests__/TimeSheet.submit-guards.test.tsx`**

Add test case to existing describe block:
- "blocks submit when activity-required row has empty activity" -- mock entries with activity_required=true engagement and empty activity_id, verify the guard prevents submit (the i18n key `timesheet.invalidActivityRow` appears)

### Step 8: Changelog append

**File: `docs/CHANGELOG-2026-02-27.md`**

Append after existing BUG 0227-64 entry:

- Bug ID: 0227-67
- Root cause: inline ternary in handleEngagementChange kept stale ADM activityId when switching to client engagement
- Files created: `src/lib/timesheetActivityRules.ts`, `src/lib/__tests__/timesheetActivityRules.test.ts`, `src/components/timesheet/__tests__/TimesheetGrid.activity-transition.test.tsx`
- Files modified: `src/components/timesheet/TimesheetGrid.tsx`, `src/pages/TimeSheet.tsx`, `src/locales/en.json`, `src/locales/es.json`, `src/pages/__tests__/TimeSheet.submit-guards.test.tsx`
- Function: `normalizeActivityForEngagement(input: NormalizeActivityInput): NormalizeActivityResult`
- Before: switching internal to client kept "Administrative"; hours saved with wrong activity
- After: switching to client clears ADM; hour cells disabled until valid activity selected; submit blocked if invalid
- Tests: 6 unit, 4 component transition, 1 submit-guard

## Target Files

| File | Action |
|---|---|
| `src/lib/timesheetActivityRules.ts` | Create |
| `src/components/timesheet/TimesheetGrid.tsx` | Modify (lines 420-423) |
| `src/pages/TimeSheet.tsx` | Modify (add toast import + submit guard after line 302) |
| `src/locales/en.json` | Modify (add key) |
| `src/locales/es.json` | Modify (add key) |
| `src/lib/__tests__/timesheetActivityRules.test.ts` | Create |
| `src/components/timesheet/__tests__/TimesheetGrid.activity-transition.test.tsx` | Create |
| `src/pages/__tests__/TimeSheet.submit-guards.test.tsx` | Modify (add test) |
| `docs/CHANGELOG-2026-02-27.md` | Append |

## QA Checklist

1. Internal engagement selected (ADM auto-assigned), switch to client -- activity clears, hour cells disable
2. Direct client selection -- must select activity before hours
3. Client to internal -- ADM auto-assigned
4. Client to client -- current activity preserved
5. Submit with invalid row -- blocked with toast
6. Save draft skips empty-activity rows
7. No regression in row merge/duplicate detection

## Acceptance Criteria

1. Internal->Client clears stale ADM activity immediately
2. Required-engagement rows with empty/admin activity cannot be submitted
3. Hour cells blocked when required activity missing
4. Internal auto-assignment remains intact
5. Unit + component + submit-guard tests pass
6. Changelog is detailed and diff-verifiable

## Changelog Append

**File:** `docs/CHANGELOG-2026-02-27.md`

You need to append to the CHANGELOG a detailed description of the changes made while implementing this Plan. There needs to be sufficient detail to be able to verify if the changes to the codebase correspond to the CHANGELOG.


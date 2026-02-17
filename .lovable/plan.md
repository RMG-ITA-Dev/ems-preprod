

# Plan v3: Fix Export Error Feedback for Unapproved Work Orders (Final)

This is the hardened, final version incorporating all codex feedback. No database changes required.

## Summary

When timer entries are exported to the Hoja de Tiempo, a DB trigger rejects inserts if the engagement's Work Order is not approved. Currently this is silently lumped into "blocked (weeks already submitted)" -- misleading. This fix surfaces the real reason with a specific toast naming the affected engagement(s).

## File Changes

### 1. `src/hooks/useTimesheetImport.ts`

**a) Expand `ImportResult` (lines 8-13):**

```typescript
export interface ImportResult {
  newCount: number;
  mergedCount: number;
  blockedCount: number;
  blockedWeeks: string[];
  woBlockedCount: number;
  woBlockedEngagements: string[];
}
```

**b) Add resilient error detector (new helper above the hook):**

```typescript
function isWoNotApprovedError(message?: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("work order") && lower.includes("not approved");
}
```

Case-insensitive partial match on both key phrases handles any wording variation from the trigger.

**c) Pre-fetch engagement codes (inside `exportEntries`, after grouping, before the main loop around line 123):**

Collect unique `engagement_id` values from grouped entries, batch-fetch `engagement_id, engagement_code` from the `engagements` table, and store in a `Map<string, string>`. This avoids per-group queries.

**d) Initialize new counters (around line 124-129):**

```typescript
let woBlockedCount = 0;
const woBlockedEngagementsSet = new Set<string>();
```

**e) Update error handlers -- using `group.timerIds.length` for correct count semantics:**

In the **insert** error handler (lines 215-218):
```typescript
if (insertError) {
  console.error("Insert error:", insertError);
  if (isWoNotApprovedError(insertError.message)) {
    woBlockedCount += group.timerIds.length;
    const code = engagementCodeMap.get(group.engagement_id)
      || group.engagement_id.slice(0, 8);
    woBlockedEngagementsSet.add(code);
  } else {
    blockedCount += group.timerIds.length;
  }
  continue;
}
```

In the **update/merge** error handler (lines 187-190):
```typescript
if (updateError) {
  console.error("Update merge error:", updateError);
  if (isWoNotApprovedError(updateError.message)) {
    woBlockedCount += group.timerIds.length;
    const code = engagementCodeMap.get(group.engagement_id)
      || group.engagement_id.slice(0, 8);
    woBlockedEngagementsSet.add(code);
  } else {
    blockedCount += group.timerIds.length;
  }
  continue;
}
```

Key guardrails:
- **Count by `group.timerIds.length`** (not by 1) so counts reflect actual timer records, not aggregated groups.
- **Fallback to `engagement_id.slice(0, 8)`** if the Map lookup returns undefined, so the toast never prints empty names.

**f) Bound the engagement list before returning (after the main loop, before the return on line 240):**

```typescript
const woEngArr = Array.from(woBlockedEngagementsSet);
const woBlockedEngagements = woEngArr.length > 3
  ? [...woEngArr.slice(0, 3), `(+${woEngArr.length - 3} más)`]
  : woEngArr;
```

**g) Update both return statements** (early return on line 36 and final return on line 240) to include `woBlockedCount: 0, woBlockedEngagements: []`.

---

### 2. `src/pages/TrackerList.tsx` (lines 240-245)

Replace the single blocked-toast block with ordered, non-overlapping toasts:

```typescript
// WO-blocked toast FIRST (error -- red)
if (result.woBlockedCount > 0) {
  toast.error(t("tracker.exportBlockedWO", {
    count: result.woBlockedCount,
    engagements: result.woBlockedEngagements.join(", ")
  }));
}
// Generic week-submitted toast SECOND (warning -- yellow)
if (result.blockedCount > 0) {
  toast.warning(t("tracker.exportBlocked", {
    blockedCount: result.blockedCount,
    weeks: result.blockedWeeks.join(", ")
  }));
}
```

Both can fire in the same export run if entries span different block reasons.

---

### 3. `src/locales/es.json` (after line 140)

```json
"exportBlockedWO": "{{count}} registro(s) no exportados: la Orden de Trabajo no está aprobada ({{engagements}})"
```

### 4. `src/locales/en.json` (after line 140)

```json
"exportBlockedWO": "{{count}} record(s) not exported: Work Order not approved ({{engagements}})"
```

---

## File Summary

| File | Action |
|------|--------|
| `src/hooks/useTimesheetImport.ts` | MODIFY -- add `isWoNotApprovedError()`, expand `ImportResult`, pre-fetch engagement codes, separate WO-blocked tracking with correct count semantics and ID fallback, bound engagement list |
| `src/pages/TrackerList.tsx` | MODIFY -- ordered toast logic (WO error first, then generic warning) |
| `src/locales/es.json` | MODIFY -- add `exportBlockedWO` key |
| `src/locales/en.json` | MODIFY -- add `exportBlockedWO` key |

## Risk

None. No database changes. Purely additive TypeScript fields and UI feedback. Backward-compatible since new `ImportResult` fields default to zero/empty.

## Acceptance Tests

1. **WO-blocked toast**: Export entries for an engagement with WO in Draft/Pending_Approval -- red toast names the engagement code.
2. **Mixed scenario**: Export a batch spanning a submitted week AND an unapproved WO -- two distinct toasts appear (red WO first, yellow week second).
3. **Large list**: Export records across 5+ blocked engagements -- toast shows first 3 codes plus "(+2 mas)".
4. **Fallback**: If an engagement code lookup fails, toast shows the first 8 chars of the UUID instead of blank.
5. **Happy path**: Export entries for an approved WO into an open week -- success toast only, no error toasts.

## Documentation

Append an entry to `docs/CHANGELOG-2026-02-13.md` documenting: problem (misleading "week submitted" error), root cause (DB trigger message not surfaced), solution (resilient detection + separate toast), files changed, and risk assessment.


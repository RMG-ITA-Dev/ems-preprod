

# Plan_0220-48_v2: Allow Historical Start Dates for Internal Engagements (external remains restricted; start+end null-guards)

## Problem

BUG 0220-48: When creating internal/administrative engagements, the system blocks selection of historical start dates. Internal engagements (e.g., fiscal year Oct 2025 - Sep 2026) frequently need past start dates. External/client engagements must remain restricted.

## Root Cause

In `EngagementForm.tsx`:
- `minStartDate` is always set (today for new, `created_at` for edit) regardless of engagement type.
- The start_date calendar (line 451) passes `minStartDate` directly to `disabled` with no null-guard.
- The end_date calendar (line 491) falls back to `minStartDate` when `start_date` is empty -- this will break if `minStartDate` becomes `undefined` for internal engagements.
- Submit-time validation (line 178) also lacks a null-guard and does not account for `isInternal`.

## Solution

Four targeted edits in `EngagementForm.tsx`:

---

### Edit 1: `minStartDate` memo (lines 93-99)

Add `isInternal` dependency. Return `undefined` for internal engagements.

```typescript
// BUG #0206-19 + #0220-48: Minimum allowed start date (bypassed for internal)
const minStartDate = useMemo(() => {
  if (isInternal) return undefined;
  if (isEdit && engagement?.created_at) {
    return startOfDay(new Date(engagement.created_at));
  }
  return startOfDay(new Date());
}, [isInternal, isEdit, engagement?.created_at]);
```

### Edit 2: Start-date calendar `disabled` prop (line 451)

Null-guard so past dates become selectable when `minStartDate` is `undefined`:

```typescript
disabled={minStartDate ? (date) => isBefore(startOfDay(date), minStartDate) : undefined}
```

### Edit 3: End-date calendar `disabled` prop (lines 488-492)

Add null-guard on `minStartDate` fallback to prevent over-restricting internal engagements when `start_date` is empty:

```typescript
disabled={(date) => {
  const startDate = form.getValues("start_date");
  if (startDate) return isBefore(startOfDay(date), startOfDay(startDate));
  if (minStartDate) return isBefore(startOfDay(date), minStartDate);
  return false;
}}
```

### Edit 4: Submit-time validation (lines 177-183)

Add `isInternal` bypass and null-guard:

```typescript
// BUG #0206-19 + #0220-48: skip for internal engagements
if (!isInternal && minStartDate && data.start_date && isBefore(startOfDay(data.start_date), minStartDate)) {
  form.setError("start_date", {
    message: t("engagement.startDateBeforeCreation"),
  });
  return;
}
```

### Edit 5: Changelog (`docs/CHANGELOG-2026-02-22.md`)

Append entry for BUG 0220-48.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/forms/EngagementForm.tsx` | 4 edits: minStartDate memo, start calendar null-guard, end calendar null-guard, submit validation |
| `docs/CHANGELOG-2026-02-22.md` | Append BUG 0220-48 entry |

## Acceptance Tests

| Case | Expected |
|------|----------|
| New INTERNAL engagement: select start_date in the past (e.g., 01/10/2025) | Calendar allows selection; save succeeds |
| New EXTERNAL engagement: select past start_date | Calendar blocks past dates; submit validation also blocks |
| Edit EXTERNAL engagement: start_date restricted to >= created_at | Existing behavior preserved |
| Internal engagement with empty start_date: open end_date calendar | All dates selectable (no incorrect restriction from undefined minStartDate) |
| Internal engagement with start_date set: end_date calendar | Still enforces end_date >= start_date |
| Toggle is_internal ON then OFF | Past-date restriction re-applies immediately |

## Risk Assessment

- Low risk: only affects date selection logic; no DB changes.
- External engagement restriction is fully preserved (both calendar and submit-time).
- The `isInternal` state already exists in the form; adding it to the `useMemo` dependency is safe.


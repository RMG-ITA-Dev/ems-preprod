

# Bug 0206-19: Start Date Allows Values Before Engagement Creation Date

## Problem

The Engagement form allows users to select a Start Date earlier than the engagement's creation date. There is no UI restriction on the Calendar picker and no save-time validation. The `Engagement` interface also lacks the `created_at` field, preventing the form from referencing it.

## Solution

Add a `minStartDate` constraint (today for new, `created_at` for edits) enforced via Calendar `disabled` prop + onSubmit validation guard. Also restrict end_date Calendar to not allow dates before the selected start_date.

## Changes

### 1. `src/hooks/useEmsData.ts` -- Add `created_at` to Engagement interface

Add `created_at: string | null;` after `end_date` (line 73). No other changes needed since the `useEngagements` query already uses `select(*)` which includes `created_at`.

### 2. `src/components/forms/EngagementForm.tsx`

**Imports (line 1, 5):**
- Add `useMemo` to the React import
- Add `startOfDay, isBefore` to the date-fns import

**`minStartDate` computation (after line 85, after `isEdit`):**

```typescript
const minStartDate = useMemo(() => {
  if (isEdit && engagement?.created_at) {
    return startOfDay(new Date(engagement.created_at));
  }
  return startOfDay(new Date());
}, [isEdit, engagement?.created_at]);
```

**onSubmit validation guard (line 132, top of onSubmit):**

```typescript
// BUG #0206-19: Validate start_date >= creation date
if (data.start_date && isBefore(startOfDay(data.start_date), minStartDate)) {
  form.setError("start_date", {
    message: t("engagement.startDateBeforeCreation"),
  });
  return;
}
```

**Start Date Calendar (line 383-389) -- add `disabled` prop:**

```tsx
<Calendar
  mode="single"
  selected={field.value}
  onSelect={field.onChange}
  disabled={(date) => isBefore(startOfDay(date), minStartDate)}
  initialFocus
  className="pointer-events-auto"
/>
```

**End Date Calendar (line 419-425) -- add `disabled` prop:**

```tsx
<Calendar
  mode="single"
  selected={field.value}
  onSelect={field.onChange}
  disabled={(date) => {
    const startDate = form.getValues("start_date");
    if (startDate) return isBefore(startOfDay(date), startOfDay(startDate));
    return isBefore(startOfDay(date), minStartDate);
  }}
  initialFocus
  className="pointer-events-auto"
/>
```

### 3. `src/locales/en.json` (line 362, inside engagement namespace)

Add: `"startDateBeforeCreation": "Start date cannot be before the engagement creation date"`

### 4. `src/locales/es.json` (same location)

Add: `"startDateBeforeCreation": "La fecha de inicio no puede ser anterior a la fecha de creación del encargo"`

### 5. `docs/CHANGELOG-2026-02-13.md`

Append full bug documentation entry.

## Files Modified

| File | Action |
|------|--------|
| `src/hooks/useEmsData.ts` | Add `created_at` to `Engagement` interface |
| `src/components/forms/EngagementForm.tsx` | Add imports, `minStartDate`, onSubmit guard, Calendar `disabled` props |
| `src/locales/en.json` | Add `startDateBeforeCreation` key |
| `src/locales/es.json` | Add `startDateBeforeCreation` key |
| `docs/CHANGELOG-2026-02-13.md` | Append bug entry |

## Risk Assessment

- **Low risk** -- adds constraint only; no existing data or mutations modified.
- Legacy engagements with `start_date < created_at` will still display but will be blocked on save unless corrected. If retroactive dates are needed, a grandfather clause (`minStartDate = min(created_at, existing start_date)`) can be added.

## Testing

1. New engagement: calendar disables all dates before today
2. Edit existing engagement: calendar disables dates before `created_at`
3. End date calendar disables dates before selected start date
4. Attempting to save with an invalid start date shows localized error
5. Existing engagements load and display correctly


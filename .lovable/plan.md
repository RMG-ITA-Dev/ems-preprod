

# Bug 0206-3: Timesheet Buttons Not Available on Non-Current Weeks

## Problem

The "Copiar Semana Anterior", "Retirar Envio", and "Guardar Borrador" buttons disappear when navigating to past or future weeks. Root cause: button visibility depends on `isEditable`, which depends on `lineApprovals` data — often empty/undefined for non-current weeks.

## Solution

Decouple each button from `isEditable` with its own self-contained visibility flag.

## Changes

### File: `src/pages/TimeSheet.tsx`

**1. Add previous-week period query** (near existing period/data hooks)

Query `timesheet_periods` for the previous week to check if it was submitted or approved. This is a lightweight single-row lookup used only to gate the "Copy Previous Week" button.

```typescript
// BUG #0206-3: Check if previous week was submitted (for Copy button gating)
const previousWeekStart = useMemo(() => getPreviousWeek(currentWeekStart), [currentWeekStart]);

const { data: previousPeriod } = useQuery({
  queryKey: ["timesheet-period-prev", staffRecord?.staff_id, toISODateString(previousWeekStart)],
  queryFn: async () => {
    const { data } = await supabase
      .from("timesheet_periods")
      .select("period_id, submitted_at, is_period_locked")
      .eq("staff_id", staffRecord!.staff_id)
      .eq("week_start_date", toISODateString(previousWeekStart))
      .maybeSingle();
    return data;
  },
  enabled: !!staffRecord?.staff_id,
  staleTime: 5 * 60 * 1000,
});

const prevWeekSubmittedOrApproved = !!previousPeriod?.submitted_at;
```

**2. Add `hasNonZeroEntry` derived boolean** (near existing derived state)

```typescript
const hasNonZeroEntry = entries.some((e) => e.hours_logged > 0);
```

**3. Add three dedicated visibility variables** (replacing inline conditions)

```typescript
const canCopyPreviousWeek = !isBeforeHireDate
  && isWithinEditableWindow
  && !isSubmitted
  && !period?.is_period_locked
  && prevWeekSubmittedOrApproved;

const canUnsubmit = isSubmitted
  && !isFullyApproved
  && isWithinEditableWindow
  && !period?.is_period_locked;

const canSaveDraft = !isBeforeHireDate
  && isWithinEditableWindow
  && !period?.is_period_locked
  && !isFullyApproved
  && hasNonZeroEntry;
```

**4. Update JSX button conditions**

| Button | Old condition | New condition |
|--------|--------------|---------------|
| Copiar Semana Anterior | `isEditable && !isSubmitted` | `canCopyPreviousWeek` |
| Retirar Envio | `canUnsubmit` (old, required `hasPendingLines`) | `canUnsubmit` (new, no line-approval dependency) |
| Guardar Borrador | `isEditable` | `canSaveDraft` |

**5. Add defense-in-depth guards inside handlers**

Add early-return checks (`if (!canCopyPreviousWeek) return;`, etc.) at the top of each handler function.

**6. New imports needed**

- `useQuery` from `@tanstack/react-query` (already imported indirectly but needs explicit import)
- `toISODateString` from `@/lib/timesheetUtils` (already imported via `getPreviousWeek` etc.)

### File: `docs/CHANGELOG-2026-02-13.md`

Append full bug documentation (ID, name, root cause, per-file changes).

## What Stays Unchanged

- `isEditable` remains as-is (still controls grid cell editability and Import from Timer button)
- `canSubmit` remains as-is
- No mutation logic changes
- No backend/database changes

## Files Modified

| File | Action |
|------|--------|
| `src/pages/TimeSheet.tsx` | Add prev-period query, 3 visibility variables, update 3 JSX conditions, add handler guards |
| `docs/CHANGELOG-2026-02-13.md` | Append bug fix entry |

## Testing

1. Navigate to a past unsubmitted week where the previous week IS submitted -- "Copiar Semana Anterior" should be visible
2. Navigate to a past unsubmitted week where the previous week is NOT submitted -- "Copiar Semana Anterior" should be hidden
3. On any unsubmitted week, enter zero hours only -- "Guardar Borrador" stays hidden; enter non-zero hours -- it appears
4. Navigate to a submitted-but-not-approved week (past or current) -- "Retirar Envio" should be visible
5. Navigate to a fully approved or locked week -- none of the three buttons appear
6. Navigate to a week before hire date -- none appear
7. Regression: grid editability and submit button unchanged


# Plan — Simplify totals styling to two states: OK (green) vs Not OK (red)

## Problem

Current totals have 4 visual states (over-max, near-max, at-target, below-min) with different colors. The user wants only **two behaviors**:

1. **Exactly at target** (e.g. 8h daily, 40h weekly) → green background, normal text
2. **Anything else** (above or below target, any non-zero value that isn't exact) → pale red background, red font

## Changes

### File: `src/components/timesheet/TimesheetGrid.tsx`

**Edit 1** — Remove unused helper functions (lines 648-665): delete `isDailyNearMax`, `isDailyBelowMin`, `isWeeklyNearMax`, `isWeeklyBelowMin`. Keep `isDailyOverMax` and `isWeeklyOverMax` only if used elsewhere for submit guards; otherwise remove too.

Actually, `isDailyOverMax` / `isWeeklyOverMax` are likely used by submit validation logic, so keep them. The near/below helpers are only used in styling — remove those 4 functions.

**Edit 2** — Daily totals styling (lines 977-1001): Simplify to two states.

```tsx
{weekDates.map((date) => {
  const total = calculateColumnTotal(date);
  const atTarget = total > 0 && Math.round(total * 100) === Math.round(dailyMin * 100);
  const hasHours = total > 0;
  return (
    <td
      key={toISODateString(date)}
      className={cn(
        "p-4 text-center font-mono",
        hasHours && atTarget && "text-foreground bg-success/15",
        hasHours && !atTarget && "text-destructive bg-destructive/10"
      )}
    >
      <div className="flex items-center justify-center gap-1">
        {hasHours && !atTarget && <AlertTriangle className="h-3 w-3" />}
        {total}h
      </div>
    </td>
  );
})}
```

No more "dailyMaxExceeded" label — the red styling is self-explanatory.

**Edit 3** — Weekly total styling (lines 1004-1018): Same two-state logic.

```tsx
<td className={cn(
  "p-4 text-center font-mono",
  calculateGrandTotal() > 0 && isWeeklyAtTarget() && "text-foreground bg-success/15",
  calculateGrandTotal() > 0 && !isWeeklyAtTarget() && "text-destructive bg-destructive/10",
  calculateGrandTotal() === 0 && "bg-primary/10 text-foreground"
)}>
  <div className="flex items-center justify-center gap-1">
    {calculateGrandTotal() > 0 && !isWeeklyAtTarget() && <AlertTriangle className="h-3 w-3" />}
    {calculateGrandTotal()}h
  </div>
</td>
```

Where `isWeeklyAtTarget` is a new one-liner:

```typescript
const isWeeklyAtTarget = () => {
  const total = calculateGrandTotal();
  return total > 0 && Math.round(total * 100) === Math.round(weeklyMin * 100);
};
```

**Edit 4** — Remove now-unused i18n references to `dailyMaxExceeded` and `weeklyMaxExceeded` warning text from the totals row (the keys can stay in locale files to avoid breaking other potential references).

### Summary


| State                    | Background                     | Text                     | Icon             |
| ------------------------ | ------------------------------ | ------------------------ | ---------------- |
| Exactly at target        | Light green (`bg-success/15`)  | Default foreground       | None             |
| Any other non-zero value | Pale red (`bg-destructive/10`) | Red (`text-destructive`) | Warning triangle |
| Zero hours               | No special styling             | Default                  | None             |


### Files modified


| File                                         | Action                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/components/timesheet/TimesheetGrid.tsx` | Remove 4 unused helpers, simplify daily+weekly totals to 2-state styling, add `isWeeklyAtTarget` |


No backend, DB, locale, or schema changes needed.

**Changelog Append**

**File:** docs/[CHANGELOG-2026-02-27.md](http://CHANGELOG-2026-02-27.md)

You need to append to the CHANGELOG a detailed description of the changes made while implementing this Plan. There needs to be sufficient detail to be able to verify if the changes to the codebase correspond to the CHANGELOG.
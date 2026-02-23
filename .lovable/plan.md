# Plan: Calendar Coloring Refinements (3 tweaks)

## Overview

Three visual adjustments to the week-status calendar tinting implemented in the previous plan. All changes are CSS/JS-only in two files. No backend, no new logic.

## Changes

### 1. Exclude Saturdays and Sundays from tinting

**File:** `src/components/timesheet/WeekNavigator.tsx` (line 117, inside the `allDays.forEach` loop)

Add a weekend check immediately after the today exclusion:

```text
if (isSameDay(day, today)) return;
if (day.getDay() === 0 || day.getDay() === 6) return;  // NEW: skip weekends
```

Weekends will remain untinted (default calendar styling), while Mon-Fri cells get their status tint.

### 2. Increase tint opacity (less pastel, more color)

**File:** `src/components/timesheet/WeekNavigator.tsx` (lines 140-146, modifiersClassNames)


| Modifier    | Current                             | New                                 |
| ----------- | ----------------------------------- | ----------------------------------- |
| approved    | `bg-success/15`                     | `bg-success/30`                     |
| pending     | `bg-warning/20`                     | `bg-warning/35`                     |
| rejected    | `bg-[hsl(var(--week-rejected))]/20` | `bg-[hsl(var(--week-rejected))]/30` |
| notReported | `bg-destructive/15`                 | `bg-destructive/25`                 |
| currentWeek | `bg-[hsl(var(--brand-purple))]/20`  | `bg-[hsl(var(--brand-teal))]/20`    |


Also update the legend dots (lines 229-246) to match: `/40` stays fine for legend dots but the teal swap applies to the currentWeek dot too (change `bg-[hsl(var(--brand-purple))]/40` to `bg-[hsl(var(--brand-teal))]/40`).

### 3. Make REJECTED violet more distinct from CURRENT teal

Now that CURRENT uses teal instead of purple, the violet/purple confusion is already reduced. However, the `--week-rejected` hue (270) is still close to `--brand-purple` (255). Shift it further toward true violet/magenta for better separation:

**File:** `src/index.css`


| Variable                | Current       | New           |
| ----------------------- | ------------- | ------------- |
| `:root --week-rejected` | `270 60% 70%` | `290 50% 65%` |
| `.dark --week-rejected` | `270 55% 65%` | `290 45% 60%` |


Hue 290 (red-violet/magenta) is clearly distinct from both teal (186) and purple (255).

Please document the implementation of this PLAN by appending it to the [CHANGELOG-2026-02-2.md](http://CHANGELOG-2026-02-2.md) file In the Codebase.

&nbsp;

## Summary of all edits


| File                                         | What changes                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/timesheet/WeekNavigator.tsx` | Add weekend skip in modifier loop; bump opacity values; swap currentWeek from brand-purple to brand-teal (both tints and legend dot) |
| `src/index.css`                              | Shift `--week-rejected` from hue 270 to 290 in both light and dark modes                                                             |


## No other files modified

- No backend changes
- No locale changes (legend labels stay the same)
- No changes to `calendar.tsx` or any other calendar instance

## Acceptance Criteria

- AC-1: Saturdays and Sundays have no tint (plain calendar cells)
- AC-2: Monday-Friday cells show stronger, more visible tints
- AC-3: Current week uses a light teal tint (not purple)
- AC-4: REJECTED weeks are clearly violet/magenta, visually distinct from teal current week
- AC-5: All existing precedence rules still hold (today grey, selected primary)
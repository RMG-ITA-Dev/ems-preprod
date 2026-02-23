# Plan: Current Week Purple with Monday Emphasis

## Overview

Change the "Semana Actual" (Current Week) tint back from teal to purple, and split it into two modifier groups: Monday gets a heavier purple for emphasis, Tuesday-Friday get a lighter purple.

## Changes (single file)

### `src/components/timesheet/WeekNavigator.tsx`

#### A. Split `currentWeek` into two modifier groups

In the groups definition (line 104-110), replace `currentWeek: []` with two buckets:

```text
currentWeekStart: [],   // Monday only (heavier)
currentWeek: [],        // Tue-Fri (lighter)
```

#### B. Update the forEach loop (line 130)

When status is `CURRENT`, check if the day is Monday (`day.getDay() === 1`):

- If Monday: push into `currentWeekStart`
- Otherwise: push into `currentWeek`

#### C. Update modifiers and modifiersClassNames (lines 134-148)

Add the new modifier and swap both back to purple:

```text
modifiers: {
  ...existing...,
  currentWeekStart: groups.currentWeekStart,
  currentWeek: groups.currentWeek,
}

modifiersClassNames: {
  ...existing...,
  currentWeekStart: "bg-[hsl(var(--brand-purple))]/35",   // heavier Monday
  currentWeek: "bg-[hsl(var(--brand-purple))]/15",        // lighter Tue-Fri
}
```

#### D. Update legend dot (line 247)

Change `bg-[hsl(var(--brand-teal))]/40` back to `bg-[hsl(var(--brand-purple))]/40`.

Please document the implementation of this PLAN by appending it to the [CHANGELOG-2026-02-2.md](http://CHANGELOG-2026-02-2.md) file In the Codebase.

&nbsp;

## No other files modified

- No changes to `index.css` (--brand-purple already exists at `255 82% 65%`)
- No locale changes
- No backend changes

## Acceptance Criteria

- AC-1: Current week Monday cell has a clearly heavier purple tint
- AC-2: Current week Tue-Fri cells have a lighter purple tint
- AC-3: Legend dot for "Semana Actual" is purple
- AC-4: All other status tints unchanged
- AC-5: Today still excluded (grey), selected still wins (primary)
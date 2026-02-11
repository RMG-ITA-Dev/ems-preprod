

# Bug #14: Fix Poor Contrast on Client Name in Engagement Dropdown

## Problem

In the timesheet engagement dropdown, the engagement code and client name use `text-muted-foreground` which becomes unreadable on hover because the SelectItem's highlighted state changes the background to dark but the child spans keep their fixed gray color.

## Fix

Replace `text-muted-foreground` with `opacity-60` / `opacity-70` on the two child spans inside the SelectItem. This way the text inherits the parent's color (which changes on hover) and just dims it, staying readable in both normal and highlighted states.

## Changes

| File | Change |
|------|--------|
| `src/components/timesheet/TimesheetGrid.tsx` | Replace `text-muted-foreground` with opacity classes on engagement code span and client name span (lines ~436-445) |

## Technical Detail

- Engagement code span: `text-xs text-muted-foreground` becomes `text-xs opacity-60`
- Client name span: `text-xs text-muted-foreground` becomes `text-xs opacity-70`

No other files affected. No database or localization changes needed.


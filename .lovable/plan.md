

# Plan v5: Widen Manual Entry Dialog + Fix Engagement Name Truncation on Hover

**Plan ID**: UI-0225-engagement-combobox-width-v1

---

## Problems

1. **Manual Entry dialog is too narrow**: `DialogContent` uses `sm:max-w-[425px]` (line 183 of `ManualEntryDialog.tsx`), which is too small to display engagement names fully.
2. **Engagement name truncated on hover/selection in both selectors**: The `CommandItem` in `EngagementCombobox.tsx` clips long engagement names because the popover width is constrained to the trigger width (`w-[--radix-popover-trigger-width]` on line 66), and the text has no wrapping.

---

## File-by-File Changes

### 1. `src/components/tracker/ManualEntryDialog.tsx` (MODIFY)

**Line 183**: Change `sm:max-w-[425px]` to `sm:max-w-[700px]` (approximately 2.5x wider than the current effective width, accommodating the full engagement code + name display).

```tsx
// BEFORE:
<DialogContent className="sm:max-w-[425px]">

// AFTER:
<DialogContent className="sm:max-w-[700px]">
```

### 2. `src/components/tracker/EngagementCombobox.tsx` (MODIFY)

**Line 66 (PopoverContent)**: Change the width class so the dropdown is at least as wide as the trigger but can grow wider to fit content. Also set a minimum width to ensure readability.

```tsx
// BEFORE:
<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">

// AFTER:
<PopoverContent className="min-w-[--radix-popover-trigger-width] w-auto max-w-[600px] p-0" align="start">
```

**Lines 88-91 (CommandItem content)**: Allow the engagement name text to wrap instead of being clipped. Remove truncation so long names are fully readable on hover/mouseover.

```tsx
// BEFORE:
<span className="text-muted-foreground ml-2">- {eng.engagement_name}</span>

// AFTER:
<span className="text-muted-foreground ml-2 whitespace-normal">- {eng.engagement_name}</span>
```

**Line 58 (trigger button label)**: The trigger button itself should keep `truncate` since it has limited space, but the dropdown items should show full text.

No change needed on line 58 -- truncation on the trigger is correct behavior.

---

## What Stays Unchanged

- `TrackerBar.tsx` -- no changes (the fix in `EngagementCombobox` applies to both stopwatch and manual entry automatically since both use the shared component)
- Hooks, eligibility logic, i18n -- all unchanged
- No DB or RPC changes

---

## Summary of Effects

| Location | Before | After |
|---|---|---|
| Manual Entry dialog width | 425px max | 700px max |
| Combobox dropdown width | Locked to trigger width | Min = trigger width, expands up to 600px |
| Dropdown item text | Clipped/truncated | Wraps to show full engagement name |
| Trigger button text | Truncated | Truncated (unchanged -- correct) |

---

## Acceptance Criteria

1. Manual Entry dialog is visibly wider (~700px on desktop).
2. Engagement dropdown items in both Manual Entry and Stopwatch show the full engagement name without clipping.
3. Long engagement names wrap within dropdown items instead of being cut off.
4. Trigger button still truncates gracefully when the selected engagement name is very long.


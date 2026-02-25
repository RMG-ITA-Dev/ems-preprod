

# Plan v6: Fix Engagement Name Readability on Hover in Combobox Dropdown

**Plan ID**: UI-0225-combobox-hover-contrast-v1

---

## Problem

When hovering over or keyboard-navigating to a `CommandItem` in the engagement dropdown (both Stopwatch and Manual Entry), the item background changes to `bg-accent` and text to `text-accent-foreground` (defined in `command.tsx` line 108). However, the engagement name `<span>` on line 90 of `EngagementCombobox.tsx` has a hardcoded `text-muted-foreground` class that does **not** change on selection, resulting in low-contrast text that is unreadable against the accent background.

The engagement **code** span (line 89) has no explicit color class, so it correctly inherits `text-accent-foreground` from the parent `CommandItem` on hover. Only the **name** span is broken.

---

## Root Cause

```
CommandItem (hover) -> bg-accent + text-accent-foreground  (applied via data-[selected='true'])
  |-- <span class="font-medium">CODE</span>            -> inherits text-accent-foreground (OK)
  |-- <span class="text-muted-foreground">Name</span>   -> stays muted (BROKEN -- overrides inherited color)
```

---

## Fix

Replace `text-muted-foreground` on the name span with `opacity-70`. This way the span inherits the parent's text color (which correctly switches to `text-accent-foreground` on hover) and simply reduces opacity to maintain the visual hierarchy between code and name.

### File: `src/components/tracker/EngagementCombobox.tsx` (MODIFY)

**Line 90**: Change the name span class.

```tsx
// BEFORE:
<span className="text-muted-foreground ml-2 whitespace-normal">- {eng.engagement_name}</span>

// AFTER:
<span className="opacity-70 ml-2 whitespace-normal">- {eng.engagement_name}</span>
```

This single change fixes both the Stopwatch and Manual Entry dropdowns since they share the same `EngagementCombobox` component.

---

## What Stays Unchanged

- `src/components/ui/command.tsx` -- no changes to the base component
- `src/components/tracker/ManualEntryDialog.tsx` -- no changes
- `src/components/tracker/TrackerBar.tsx` -- no changes
- Dialog width (700px), popover width (min-w + auto + max-w), trigger truncation -- all unchanged
- Hooks, eligibility logic, i18n, database -- all unchanged

---

## Summary of Effects

| State | Code span | Name span (before) | Name span (after) |
|---|---|---|---|
| Normal | Inherits `text-foreground` | `text-muted-foreground` (readable) | `opacity-70` of inherited color (readable) |
| Hovered/Selected | Inherits `text-accent-foreground` | `text-muted-foreground` (UNREADABLE) | `opacity-70` of `text-accent-foreground` (readable) |

---

## Acceptance Criteria

1. Engagement name text is readable when hovering over dropdown items in both Stopwatch and Manual Entry.
2. Visual hierarchy preserved: code is full opacity, name is slightly muted (70% opacity).
3. Normal (non-hovered) items still show the name in a visually secondary style.

---

## Changelog Append

Append to `docs/CHANGELOG-2026-02-24.md`:

- **Problem**: Engagement name text in the `EngagementCombobox` dropdown was unreadable on hover/selection because the `text-muted-foreground` class did not adapt to the `bg-accent` + `text-accent-foreground` applied by `CommandItem` on selection.
- **Fix**: Replaced `text-muted-foreground` with `opacity-70` on the engagement name `<span>` in `EngagementCombobox.tsx` (line 90). The span now inherits the parent's text color (which correctly switches on hover) and uses opacity for visual hierarchy.
- **Scope**: Single line change in `src/components/tracker/EngagementCombobox.tsx`. No other files modified.




# Plan v7: Prevent Manual Entry Dialog from Closing on Outside Click

**Plan ID**: UI-0225-manual-entry-modal-lock-v1

---

## Problem

Clicking outside the "Entrada Manual" (Manual Entry) dialog dismisses it, returning the user to the tracker list and losing any data they may have entered. The dialog should only close via the **Cancel** button or the **X** close button.

---

## Fix

Two changes are needed on `DialogContent` in `ManualEntryDialog.tsx`:

### File: `src/components/tracker/ManualEntryDialog.tsx` (MODIFY)

**Line 183**: Add `onInteractOutside` and `onEscapeKeyDown` handlers to prevent dismissal by clicking outside or pressing Escape.

```tsx
// BEFORE:
<DialogContent className="sm:max-w-[700px]">

// AFTER:
<DialogContent
  className="sm:max-w-[700px]"
  onInteractOutside={(e) => e.preventDefault()}
  onEscapeKeyDown={(e) => e.preventDefault()}
>
```

- `onInteractOutside`: Prevents the dialog from closing when the user clicks the overlay/outside area.
- `onEscapeKeyDown`: Prevents the dialog from closing when the user presses the Escape key.
- The **X** button and **Cancel** button remain functional (they call `onOpenChange(false)` directly).

---

## What Stays Unchanged

- Dialog width (700px), all form fields, submit logic -- unchanged
- `EngagementCombobox` -- unchanged
- `TrackerBar.tsx`, stopwatch dialog -- unchanged
- No DB, RPC, or i18n changes

---

## Acceptance Criteria

1. Clicking outside the Manual Entry dialog does NOT close it.
2. Pressing Escape does NOT close it.
3. The X button still closes the dialog.
4. The Cancel button still closes the dialog.

---

## Changelog

Append to `docs/CHANGELOG-2026-02-24.md`: Single-line fix preventing accidental dismissal of the Manual Entry dialog.


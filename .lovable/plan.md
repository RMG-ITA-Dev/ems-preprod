# Plan: Focus Mode Layout + Navigation Lock + Stopwatch Exception (v3 -- Final)

## Overview

Three mechanisms prevent accidental navigation away from ADD/EDIT views:

1. **Focus Mode Layout**: ADD/EDIT pages render without sidebar and mobile nav, removing the primary exit vector
2. **Hard Navigation Lock**: `useBlocker` from `react-router` intercepts browser back/forward and any programmatic navigation. A dialog forces an explicit "Stay" or "Leave anyway" choice
3. **Stopwatch Exception**: The Stopwatch (`/tracker/new`) keeps the normal layout with a "Run in Background" button, sidebar leave-confirmation dialog, and a global running-timer chip in the header

---

## Two small implementation notes (not blockers)

### 1) Import source for `useBlocker`

In the plan you say: “`useBlocker` from `react-router`” but your sample code imports from `react-router-dom`. That’s fine if your installed version re-exports it there (often it does), but it can vary.

**Recommendation:** Standardize and use the import that actually exists in your codebase today:

- If you already import router hooks from `react-router-dom`, keep that for consistency.
- If `useBlocker` is only in `react-router`, import from `react-router`.

(Approval doesn’t depend on this; just implement with the correct import.)

### 2) `queueMicrotask` availability

Modern browsers support it; if you ever need legacy support, swap to `setTimeout(() => ..., 0)`. For your environment this is almost certainly fine.

&nbsp;

## Part 1: Focus Mode Layout

### A) Modify `src/components/layout/AppLayout.tsx`

Add `focusMode?: boolean` prop. When `true`:

- Hide `<AppSidebar />`
- Hide `<MobileBottomNav />` and `<MobileMoreDrawer />`

### B) Modify `src/components/layout/AppHeader.tsx`

Add `focusMode?: boolean` prop. When `true`:

- Hide the `<SidebarTrigger>` button (left zone)
- Everything else stays (title, brand, user avatar)

---

## Part 2: Navigation Lock

### A) Create `src/hooks/usePageLeaveLock.ts`

```typescript
import { useBlocker } from "react-router-dom";
import { useEffect, useRef } from "react";

interface UsePageLeaveLockOptions {
  locked: boolean;
  isDirty?: boolean;
}

export function usePageLeaveLock({ locked, isDirty }: UsePageLeaveLockOptions) {
  const bypassRef = useRef(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      locked &&
      !bypassRef.current &&
      currentLocation.pathname !== nextLocation.pathname
  );

  // beforeunload for tab close/refresh
  useEffect(() => {
    if (!locked) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [locked]);

  const allowNextNavigation = () => {
    bypassRef.current = true;
    // Reset on next microtask so the synchronous navigate() proceeds,
    // then bypass resets (CODEX correction #1)
    queueMicrotask(() => { bypassRef.current = false; });
  };

  return { blocker, allowNextNavigation, isDirty: isDirty ?? false };
}
```

Key design points:

- `locked: true` means navigation is blocked **always** while the page is mounted (not just when dirty), satisfying the strict requirement
- `isDirty` is optional and only affects dialog messaging
- `allowNextNavigation()` uses `queueMicrotask` to reset bypass after the synchronous `navigate()` call completes (per CODEX correction #1)
- Only blocks on `pathname` changes (per CODEX correction #2), so query param or hash changes within the same route are allowed

### B) Create `src/components/ui/leave-page-dialog.tsx`

An AlertDialog that renders when `blocker.state === "blocked"`:


| State            | Title                       | Body                                                  |
| ---------------- | --------------------------- | ----------------------------------------------------- |
| Dirty            | "Tiene cambios sin guardar" | "Si sale, sus cambios se perderan."                   |
| Locked-but-clean | "Salir de esta pantalla?"   | "Use Guardar o Cancelar para salir de esta pantalla." |


Buttons:

- "Quedarme" (secondary) -- calls `blocker.reset()`
- "Salir de todas formas" (destructive only when dirty; normal style when clean, per CODEX optional enhancement) -- calls `blocker.proceed()`

### C) Form Component Changes (onDirtyChange pattern)

For forms using `react-hook-form` that currently handle their own navigation internally, add callback props so the parent page can control navigation through the lock:

`**src/components/forms/ClientForm.tsx**`:

- Add `onDirtyChange?: (dirty: boolean) => void` -- call via `useEffect` watching `form.formState.isDirty`
- Add `onCancel?: () => void` -- if provided, Cancel button calls this instead of `navigate("/clients")`
- Add `onSaveSuccess?: () => void` -- if provided, call after successful mutation instead of `navigate("/clients")`

`**src/components/forms/StaffForm.tsx**`: Same pattern (onDirtyChange, onCancel, onSaveSuccess)

`**src/components/forms/EngagementForm.tsx**`: Same pattern (onDirtyChange, onCancel, onSaveSuccess)

`**src/components/forms/ExpenseLogForm.tsx**`: 

- Add `onDirtyChange?: (dirty: boolean) => void`
- Track dirty state internally: set `true` on any field change from initial values
- Already receives `onCancel` and `onSubmit` from parent -- no new props needed for those

### D) Apply Lock to All ADD/EDIT Pages

Each page gets three additions:

1. `<AppLayout focusMode>`
2. `usePageLeaveLock({ locked: true, isDirty })`
3. `<LeavePageDialog blocker={blocker} isDirty={isDirty} />`
4. Save/Cancel handlers call `allowNextNavigation()` before `navigate()`


| Page            | File                 | Dirty Source                                                |
| --------------- | -------------------- | ----------------------------------------------------------- |
| Client New      | `ClientNew.tsx`      | `onDirtyChange` from `ClientForm`                           |
| Client Edit     | `ClientEdit.tsx`     | `onDirtyChange` from `ClientForm`                           |
| Staff New       | `StaffNew.tsx`       | `onDirtyChange` from `StaffForm`                            |
| Staff Edit      | `StaffEdit.tsx`      | `onDirtyChange` from `StaffForm`                            |
| Engagement New  | `EngagementNew.tsx`  | `onDirtyChange` from `EngagementForm`                       |
| Engagement Edit | `EngagementEdit.tsx` | `onDirtyChange` from `EngagementForm`                       |
| Expense New     | `ExpenseNew.tsx`     | `onDirtyChange` from `ExpenseLogForm`                       |
| Expense Edit    | `ExpenseEdit.tsx`    | `onDirtyChange` from `ExpenseLogForm`                       |
| Work Order New  | `WorkOrderNew.tsx`   | Custom: `selectedEngagementId                               |
| Work Order Edit | `WorkOrderEdit.tsx`  | Already has `isDirty` (line 118)                            |
| Worksheet Edit  | `WorksheetEdit.tsx`  | Already has `hasUnsavedChanges` (line 59)                   |
| Tracker Edit    | `TrackerEdit.tsx`    | Custom: compare current form values to initial entry values |


**Example page pattern (e.g., `ClientNew.tsx`):**

```typescript
const ClientNew = () => {
  const navigate = useNavigate();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const handleCancel = () => {
    allowNextNavigation();
    navigate("/clients");
  };

  const handleSaveSuccess = () => {
    allowNextNavigation();
    navigate("/clients");
  };

  return (
    <AppLayout title="Clients" focusMode>
      <ClientForm
        onDirtyChange={setIsDirty}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
      />
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};
```

**Special cases:**

- `WorksheetEdit.tsx`: Already has a `window.confirm` on Cancel -- replace with the standard lock pattern. Remove the manual `window.confirm` call.
- `WorkOrderEdit.tsx`: Has in-page navigation to linked worksheet (`navigate(\`/worksheets/...)`). Those buttons must call` allowNextNavigation()` before navigating.
- `WorkOrderNew.tsx`: The confirmation dialog flow (confirm parameters then create) already calls `navigate()` after success -- wrap with `allowNextNavigation()`.
- `WorksheetNew.tsx`: Simple dropdown + Create. Gets `focusMode` and lock but with `isDirty: false` (no meaningful form state to lose).

---

## Part 3: Stopwatch Exception

The Stopwatch (`/tracker/new`) does **NOT** use Focus Mode. It keeps the normal layout.

### A) Create `src/components/tracker/RunningTimerChip.tsx`

A compact clickable chip for the header:

- Only visible when `useRunningTimerEntry()` returns a running entry
- Shows: timer icon + live elapsed HH:MM:SS + engagement code (if available)
- Click navigates to `/tracker/new`
- Elapsed derived from `Date.now() - started_at` on 1-second interval, clamped to 28800s
- Styled as a small pill with green pulse indicator

### B) Modify `src/components/layout/AppHeader.tsx`

Render `<RunningTimerChip />` in the right zone (before the bell icon). Only shows when a timer is active.

### C) Create `src/components/tracker/LeaveStopwatchDialog.tsx`

AlertDialog shown when leaving stopwatch while timer is running:

- Title: "Cronometro en curso" / "Timer running"
- Body: "El cronometro seguira corriendo en segundo plano..." / "The timer will keep running..."
- "Quedarme" button (calls `blocker.reset()`)
- "Salir" button (calls `blocker.proceed()`)
- "No volver a preguntar" checkbox -- stores in `localStorage` key `ems_skipTimerLeaveConfirm`

### D) Modify `src/pages/TrackerRecord.tsx`

Add:

- "Seguir en segundo plano" / "Run in background" button (visible only when `isRunning`)
  - On click: navigate to `location.state?.from || "/tracker"` bypassing the blocker
- `useBlocker` with `when: isRunning && !skipConfirm && !bypassRef.current`
  - If blocked, show `LeaveStopwatchDialog`
  - "Run in Background" button sets bypass before navigating
  - If localStorage "don't ask again" is set, navigation proceeds without dialog

---

## i18n Keys

### `src/locales/en.json` -- `common` section:

```text
"leavePageDirtyTitle": "You have unsaved changes"
"leavePageDirtyBody": "If you leave, your changes will be lost."
"leavePageTitle": "Leave this screen?"
"leavePageLockedBody": "Use Save or Cancel to leave this screen."
"leaveAnyway": "Leave anyway"
"stay": "Stay"
```

### `src/locales/en.json` -- `tracker` section:

```text
"timerRunningTitle": "Timer running"
"timerRunningBody": "The timer will keep running in the background. Leave this screen?"
"leave": "Leave"
"dontAskAgain": "Don't ask again"
"runInBackground": "Run in background"
"timerStillRunning": "Timer is still running."
```

### `src/locales/es.json` -- `common` section:

```text
"leavePageDirtyTitle": "Tiene cambios sin guardar"
"leavePageDirtyBody": "Si sale, sus cambios se perderan."
"leavePageTitle": "Salir de esta pantalla?"
"leavePageLockedBody": "Use Guardar o Cancelar para salir de esta pantalla."
"leaveAnyway": "Salir de todas formas"
"stay": "Quedarme"
```

### `src/locales/es.json` -- `tracker` section:

```text
"timerRunningTitle": "Cronometro en curso"
"timerRunningBody": "El cronometro seguira corriendo en segundo plano. Desea salir de esta pantalla?"
"leave": "Salir"
"dontAskAgain": "No volver a preguntar"
"runInBackground": "Seguir en segundo plano"
"timerStillRunning": "El cronometro sigue en curso."
```

---

## File Summary


| File                                              | Action | Description                                                                        |
| ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `src/hooks/usePageLeaveLock.ts`                   | CREATE | Hook: `useBlocker` + `beforeunload` + `queueMicrotask` bypass reset                |
| `src/components/ui/leave-page-dialog.tsx`         | CREATE | Reusable dialog: dirty vs locked-clean messaging                                   |
| `src/components/tracker/RunningTimerChip.tsx`     | CREATE | Global header chip: live elapsed + engagement code                                 |
| `src/components/tracker/LeaveStopwatchDialog.tsx` | CREATE | Stopwatch-specific leave confirmation with "Don't ask again"                       |
| `src/components/layout/AppLayout.tsx`             | MODIFY | Add `focusMode` prop to hide sidebar/mobile-nav                                    |
| `src/components/layout/AppHeader.tsx`             | MODIFY | Add `focusMode` prop; render `RunningTimerChip`                                    |
| `src/components/forms/ClientForm.tsx`             | MODIFY | Add `onDirtyChange`, `onCancel`, `onSaveSuccess` callbacks                         |
| `src/components/forms/StaffForm.tsx`              | MODIFY | Add `onDirtyChange`, `onCancel`, `onSaveSuccess` callbacks                         |
| `src/components/forms/EngagementForm.tsx`         | MODIFY | Add `onDirtyChange`, `onCancel`, `onSaveSuccess` callbacks                         |
| `src/components/forms/ExpenseLogForm.tsx`         | MODIFY | Add internal dirty tracking + `onDirtyChange` callback                             |
| `src/pages/ClientNew.tsx`                         | MODIFY | Add `focusMode`, lock hook, dialog, wire callbacks                                 |
| `src/pages/ClientEdit.tsx`                        | MODIFY | Same pattern                                                                       |
| `src/pages/StaffNew.tsx`                          | MODIFY | Same pattern                                                                       |
| `src/pages/StaffEdit.tsx`                         | MODIFY | Same pattern                                                                       |
| `src/pages/EngagementNew.tsx`                     | MODIFY | Same pattern                                                                       |
| `src/pages/EngagementEdit.tsx`                    | MODIFY | Same pattern                                                                       |
| `src/pages/ExpenseNew.tsx`                        | MODIFY | Same pattern                                                                       |
| `src/pages/ExpenseEdit.tsx`                       | MODIFY | Same pattern                                                                       |
| `src/pages/WorkOrderNew.tsx`                      | MODIFY | Add `focusMode`, lock hook (custom dirty), dialog, wire bypass                     |
| `src/pages/WorkOrderEdit.tsx`                     | MODIFY | Add `focusMode`, lock hook (existing `isDirty`), wire bypass for in-page links     |
| `src/pages/WorksheetNew.tsx`                      | MODIFY | Add `focusMode`, lock hook (isDirty: false)                                        |
| `src/pages/WorksheetEdit.tsx`                     | MODIFY | Add `focusMode`, lock hook (existing `hasUnsavedChanges`), remove `window.confirm` |
| `src/pages/TrackerEdit.tsx`                       | MODIFY | Add `focusMode`, lock hook (custom dirty), dialog                                  |
| `src/pages/TrackerRecord.tsx`                     | MODIFY | Add stopwatch-specific blocker + "Run in Background" button (NOT focus mode)       |
| `src/locales/en.json`                             | MODIFY | Add ~12 i18n keys                                                                  |
| `src/locales/es.json`                             | MODIFY | Add ~12 i18n keys                                                                  |
| `docs/CHANGELOG-2026-02-17.md`                    | MODIFY | Document changes                                                                   |


---

## Technical Notes

- `**useBlocker**` confirmed available in installed `react-router@6.30.1` (exported from `react-router/dist/index.d.ts`)
- **Bypass reset via `queueMicrotask**` (CODEX #1): ensures the synchronous `navigate()` call proceeds before bypass resets. No more stale-render clearing.
- **Pathname-only blocking** (CODEX #2): `currentLocation.pathname !== nextLocation.pathname` ensures query param / hash changes within the same route are not blocked.
- **Focus Mode is per-page** (CODEX #3): each ADD/EDIT page explicitly passes `focusMode` to `AppLayout`. No central route config needed -- the pattern is consistent and easy to enforce.
- **"Leave anyway" button styling** (CODEX optional): destructive variant when `isDirty`, default/outline variant when locked-but-clean.
- **No `NavigationLockContext**` needed: `useBlocker` catches all navigation at the router level.
- `**ManualEntryDialog**` (tracker manual entry) is a Dialog component, not a page route -- no lock needed.
- `**WorksheetNew.tsx**` has minimal state (just a dropdown); gets `focusMode` + lock but always `isDirty: false`.

---

## Acceptance Tests

1. **Focus mode visible**: Open any Edit/New screen -- sidebar and mobile nav are NOT visible
2. **Lock blocks browser back (dirty)**: On Client Edit, change a field, press browser Back -- dialog shows "unsaved changes" message
3. **Lock blocks browser back (clean)**: On Client Edit, change nothing, press browser Back -- dialog shows "use Save/Cancel" message
4. **Stay works**: Click "Quedarme" in dialog -- remains on page
5. **Leave anyway works**: Click "Salir de todas formas" -- navigates, changes lost
6. **Cancel bypasses**: Click Cancel -- leaves immediately without dialog
7. **Save bypasses**: Fill form, Save -- leaves after success without dialog
8. **Tab close/refresh**: Change a field, close tab -- browser native warning appears
9. **Stopwatch normal layout**: Open Stopwatch -- sidebar and mobile nav ARE visible
10. **Stopwatch Run in Background**: Start timer, click "Seguir en segundo plano" -- navigates away, chip visible in header
11. **Stopwatch sidebar confirm**: Start timer, click sidebar item -- confirm dialog appears
12. **Stopwatch Don't Ask Again**: Check "No volver a preguntar" + Leave; sidebar click again -- no confirm
13. **Chip click**: While timer running on any page, click chip -- goes to `/tracker/new`
14. **Chip absent when no timer**: Stop timer -- chip disappears
15. **All pages covered**: Verify lock works on all 12+ ADD/EDIT pages
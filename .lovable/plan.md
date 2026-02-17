
# Complete Remaining Focus Mode Implementation

## What remains from Plan v3

The core infrastructure is done. These 4 pages + i18n keys still need wiring.

---

## 1. WorksheetNew.tsx

- Add imports: `usePageLeaveLock`, `LeavePageDialog`
- Add hook: `const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: false });`
- Change `<AppLayout>` to `<AppLayout focusMode>`
- Cancel button: `onClick={() => { allowNextNavigation(); navigate("/worksheets"); }}`
- After create success (line 41): add `allowNextNavigation();` before `navigate()`
- Add `<LeavePageDialog blocker={blocker} isDirty={false} />` before `</AppLayout>`

## 2. WorksheetEdit.tsx

- Add imports: `usePageLeaveLock`, `LeavePageDialog`
- Add hook after line 59: `const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: hasUnsavedChanges });`
- Change all 3 `<AppLayout>` instances (lines 217, 228, 240) to `<AppLayout focusMode>`
- Replace Cancel button (lines 256-264) -- remove `window.confirm` logic, replace with:
  ```typescript
  onClick={() => { allowNextNavigation(); navigate("/worksheets"); }}
  ```
- Navigate to linked WO (line 341): add `allowNextNavigation();` before `navigate()`
- Navigate after create WO (line 209): add `allowNextNavigation();` before `navigate()`
- Add `<LeavePageDialog blocker={blocker} isDirty={hasUnsavedChanges} />` before the closing `</div>` and `</AppLayout>` at the end

## 3. TrackerEdit.tsx

- Add imports: `usePageLeaveLock`, `LeavePageDialog`
- Add dirty tracking: compare current form values against initial entry values
  ```typescript
  const isDirty = useMemo(() => {
    if (!entry) return false;
    const origStart = new Date(entry.started_at);
    return (
      engagementId !== entry.engagement_id ||
      activityId !== entry.activity_id ||
      (description || "") !== (entry.description || "") ||
      startTime !== format(origStart, "HH:mm") ||
      (entry.ended_at && endTime !== format(new Date(entry.ended_at), "HH:mm"))
    );
  }, [entry, engagementId, activityId, description, startTime, endTime]);
  ```
- Add hook: `const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: !!isDirty });`
- Change all `<AppLayout ...>` to add `focusMode` (lines 236, 239, 262)
- Cancel button (line 440): `onClick={() => { allowNextNavigation(); navigate("/tracker"); }}`
- After save success (line 214): add `allowNextNavigation();` before `navigate("/tracker")`
- After delete success (line 226): add `allowNextNavigation();` before `navigate("/tracker")`
- Add `<LeavePageDialog blocker={blocker} isDirty={!!isDirty} />` before `</AppLayout>`

## 4. TrackerRecord.tsx (Stopwatch Exception -- NOT Focus Mode)

This page keeps the normal layout. It uses its own blocker for the "timer running" confirmation.

- Add imports: `useBlocker` from `react-router-dom`, `LeaveStopwatchDialog` + `shouldSkipTimerLeaveConfirm`, `Button` (for Run in Background), `PlayCircle` icon
- Add a `bypassRef` for the "Run in Background" button
- Add stopwatch-specific blocker:
  ```typescript
  const skipConfirm = shouldSkipTimerLeaveConfirm();
  const stopwatchBypassRef = useRef(false);
  const stopwatchBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isRunning &&
      !skipConfirm &&
      !stopwatchBypassRef.current &&
      currentLocation.pathname !== nextLocation.pathname
  );
  ```
- Add "Run in Background" button (visible only when `isRunning`), placed after the TrackerBar:
  ```typescript
  {isRunning && (
    <Button
      variant="outline"
      onClick={() => {
        stopwatchBypassRef.current = true;
        queueMicrotask(() => { stopwatchBypassRef.current = false; });
        navigate("/tracker");
      }}
    >
      <PlayCircle className="h-4 w-4 mr-2" />
      {t("tracker.runInBackground")}
    </Button>
  )}
  ```
- Add `<LeaveStopwatchDialog blocker={stopwatchBlocker} />` before `</AppLayout>`
- No `focusMode` -- sidebar stays visible

## 5. i18n Keys

### en.json -- add to `common` section (after line 51, before closing brace):

```json
"leavePageDirtyTitle": "You have unsaved changes",
"leavePageDirtyBody": "If you leave, your changes will be lost.",
"leavePageTitle": "Leave this screen?",
"leavePageLockedBody": "Use Save or Cancel to leave this screen.",
"leaveAnyway": "Leave anyway",
"stay": "Stay"
```

### en.json -- add to `tracker` section (after line 186, before closing brace):

```json
"timerRunningTitle": "Timer running",
"timerRunningBody": "The timer will keep running in the background. Leave this screen?",
"leave": "Leave",
"dontAskAgain": "Don't ask again",
"runInBackground": "Run in background",
"timerStillRunning": "Timer is still running.",
"stay": "Stay"
```

### es.json -- add to `common` section (after line 51, before closing brace):

```json
"leavePageDirtyTitle": "Tiene cambios sin guardar",
"leavePageDirtyBody": "Si sale, sus cambios se perderan.",
"leavePageTitle": "Salir de esta pantalla?",
"leavePageLockedBody": "Use Guardar o Cancelar para salir de esta pantalla.",
"leaveAnyway": "Salir de todas formas",
"stay": "Quedarme"
```

### es.json -- add to `tracker` section (after line 186, before closing brace):

```json
"timerRunningTitle": "Cronometro en curso",
"timerRunningBody": "El cronometro seguira corriendo en segundo plano. Desea salir de esta pantalla?",
"leave": "Salir",
"dontAskAgain": "No volver a preguntar",
"runInBackground": "Seguir en segundo plano",
"timerStillRunning": "El cronometro sigue en curso.",
"stay": "Quedarme"
```

## 6. Update Changelog

Append to `docs/CHANGELOG-2026-02-17.md` documenting the completion of the remaining pages (WorksheetNew, WorksheetEdit, TrackerEdit, TrackerRecord) and i18n keys.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/WorksheetNew.tsx` | MODIFY | Add focusMode, lock hook, wire Cancel/Create bypass |
| `src/pages/WorksheetEdit.tsx` | MODIFY | Add focusMode, lock hook, remove window.confirm, wire all navigate() calls |
| `src/pages/TrackerEdit.tsx` | MODIFY | Add focusMode, lock hook with custom isDirty, wire Save/Cancel/Delete bypass |
| `src/pages/TrackerRecord.tsx` | MODIFY | Add stopwatch blocker + "Run in Background" button (NOT focusMode) |
| `src/locales/en.json` | MODIFY | Add 12 i18n keys (common + tracker sections) |
| `src/locales/es.json` | MODIFY | Add 12 i18n keys (common + tracker sections) |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Document completion of remaining pages |

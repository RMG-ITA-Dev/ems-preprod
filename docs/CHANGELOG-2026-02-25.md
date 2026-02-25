# CHANGELOG 2026-02-25

## Remove Navigation Lock from Timesheet Page

**Plan version**: v2 (with CODEX amendment)  
**Context**: The Timesheet page auto-saves all changes, making the `LeavePageDialog` confirmation ("¿Salir de esta pantalla?") unnecessary and disruptive to workflow.

### Changes

#### 1. `src/pages/TimeSheet.tsx`

**Removed imports** (former lines 21-22):
- `import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";`
- `import { LeavePageDialog } from "@/components/ui/leave-page-dialog";`

**Removed hook call** (former line 41):
- `const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: false });`

**Simplified `handleBack`** (former lines 43-50):
- Before: called `allowNextNavigation()` before `navigate(-1)`
- After: calls `navigate(-1)` directly (fallback to `navigate("/")`)

**Removed 4 `<LeavePageDialog>` instances**:
- Loading branch (former line 373)
- No-staff branch (former line 393)
- Error branch (former line 409)
- Main render branch (former line 604)

**Preserved**:
- `focusMode` prop on `<AppLayout>` (sidebar remains hidden for focused data entry)
- `BackButton` component (ArrowLeft + "common.back") in loading/error/no-staff branches
- Footer Cancel button ("common.cancel") in main data branch

#### 2. `src/pages/__tests__/TimeSheet.focus-lock.test.tsx`

**Updated** (not deleted) per CODEX amendment:

- Removed `mockAllowNextNavigation`, `mockBlocker` variables
- Removed `usePageLeaveLock` mock
- Removed `LeavePageDialog` mock
- Removed test TF3 ("Back button calls allowNextNavigation before navigate")
- Removed test TF4 ("LeavePageDialog renders")
- Added new test TF3 ("Back button navigates on click") — regression coverage for direct navigation
- Renamed describe block from `"TimeSheet focus-lock"` to `"TimeSheet focus-mode"`
- Changed render import from `@testing-library/react` to `@/test/utils` (provides `QueryClientProvider` wrapper needed after removing `usePageLeaveLock` mock)

**Kept**:
- TF1: focusMode assertion (layout still uses `focusMode`)
- TF2: Back button renders in loading branch

### UX Duplication Check

Confirmed no duplication: `BackButton` ("common.back") renders only in loading/error/no-staff branches; footer Cancel ("common.cancel") renders only in the main data branch. They never coexist.

### Out of Scope

- `usePageLeaveLock` hook — unchanged, used by other pages
- `LeavePageDialog` component — unchanged, used by other pages
- No database changes
- No styling changes

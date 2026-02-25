# Plan: Remove Navigation Lock from Timesheet (v2, with CODEX amendment)

**Context**: The Timesheet page auto-saves, so the LeavePageDialog confirmation is unnecessary. Remove the lock but preserve focus mode, Cancel button, and update (not delete) the test file.

---

## UX Duplication Check

The `BackButton` component (ArrowLeft + "common.back") renders ONLY in the loading/error/no-staff branches. The footer Cancel button ("common.cancel") renders ONLY in the main data branch. They never appear together in the same view -- no UX duplication exists. Both are kept.

---

## Changes

### 1. `src/pages/TimeSheet.tsx`

**Remove imports** (lines 21-22):

- Delete `import { usePageLeaveLock }` 
- Delete `import { LeavePageDialog }`

**Remove hook call** (line 41):

- Delete `const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: false });`

**Simplify `handleBack**` (lines 43-49):

```typescript
const handleBack = () => {
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate("/");
  }
};
```

No more `allowNextNavigation()` call needed.

**Remove 4 LeavePageDialog instances**:

- Line 373: `<LeavePageDialog blocker={blocker} isDirty={false} />`
- Line 393: same
- Line 409: same  
- Line 604: same

**Keep**: `focusMode` on AppLayout, `BackButton` component, footer Cancel button -- all unchanged.

---

### 2. `src/pages/__tests__/TimeSheet.focus-lock.test.tsx`

Update the test file (not delete). Changes:

- **Remove** the `usePageLeaveLock` mock (lines 15-17) and its related variables (`mockAllowNextNavigation`, `mockBlocker` at lines 7-8).
- **Remove** the `LeavePageDialog` mock (lines 33-35).
- **Remove test TF3** ("Back button calls allowNextNavigation before navigate") -- this tested lock bypass behavior that no longer exists.
- **Remove test TF4** ("LeavePageDialog renders") -- component no longer rendered.
- **Update test TF2**: Change expected text from `"common.back"` to `"common.back"` -- actually this still renders in the loading branch via `BackButton`, so keep as-is.
- **Keep test TF1**: focusMode assertion (still valid).
- **Keep test TF2**: Back/Cancel button renders (still valid).
- **Add test TF3 (new)**: Back button calls navigate when clicked (regression coverage for navigation without lock).
- **Rename** describe block to `"TimeSheet focus-mode"` (drop "lock" since lock is removed).

Updated test file will look like:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { email: "test@test.com" }, session: {} }) }));
vi.mock("@/hooks/useCurrentStaff", () => ({ useCurrentStaff: () => ({ staffRecord: null, isLoading: true }) }));
vi.mock("@/hooks/useTimesheetPolicies", () => ({ useTimesheetPolicies: () => ({ data: null }) }));
vi.mock("@/hooks/useTimesheetWeek", () => ({ useTimesheetWeek: () => ({ period: null, entries: [], engagements: [], activities: [], isLoading: true, isError: false, error: null }) }));
vi.mock("@/hooks/useHolidays", () => ({ useHolidaysForWeek: () => new Map(), useHolidayEngagementId: () => null }));
vi.mock("@/hooks/useAdminActivity", () => ({ useAdminActivityId: () => null }));
vi.mock("@/hooks/useTimesheetApprovals", () => ({ usePeriodLineApprovals: () => ({ data: [] }) }));
vi.mock("@/hooks/useTimesheetMutations", () => ({ useSubmitTimesheet: () => ({ mutate: vi.fn(), isPending: false }), useUnsubmitTimesheet: () => ({ mutate: vi.fn(), isPending: false }), useCopyPreviousWeek: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/useEmsData", () => ({ useGlobalSettings: () => ({ data: [] }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, focusMode }: any) => <div data-testid="app-layout" data-focus-mode={focusMode}>{children}</div>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

import TimeSheet from "../TimeSheet";

describe("TimeSheet focus-mode", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TF1: renders focusMode in loading branch", () => {
    render(<TimeSheet />);
    expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("true");
  });

  it("TF2: renders Back button in loading branch", () => {
    render(<TimeSheet />);
    expect(screen.getByText("common.back")).toBeInTheDocument();
  });

  it("TF3: Back button navigates on click", async () => {
    render(<TimeSheet />);
    const user = userEvent.setup();
    await user.click(screen.getByText("common.back"));
    expect(mockNavigate).toHaveBeenCalled();
  });
});
```

---

## Execution Order

1. Edit `src/pages/TimeSheet.tsx` (remove lock hook, LeavePageDialog imports/usage, simplify handleBack)
2. Update `src/pages/__tests__/TimeSheet.focus-lock.test.tsx` (remove lock-specific tests, keep focus-mode + navigation tests)
3. **Changelog Append**
  **File:** docs/[CHANGELOG-2026-02-24.md](http://CHANGELOG-2026-02-22.md)
  You need to append to the end of CHANGELOG a detailed description of the changes made while implementing this Plan. There needs to be sufficient detail to be able to verify if the changes to the codebase correspond to the CHANGELOG.

---

## Out of Scope

- No changes to `usePageLeaveLock` hook or `LeavePageDialog` component (used by other pages)
- No changes to `BackButton` styling or footer Cancel button styling
- No database changes
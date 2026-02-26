import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";

const mockNavigate = vi.fn();
const mockAllowNextNavigation = vi.fn();
const mockBlocker = { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() };

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ periodId: "test-period" }) };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: mockBlocker, allowNextNavigation: mockAllowNextNavigation, isDirty: false }),
}));

vi.mock("@/hooks/useTimesheetApprovals", () => ({
  useStaffTimesheetForApproval: () => ({ data: null, isLoading: true }),
  useBulkApproveTimesheetLines: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkRejectTimesheetLines: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useCurrentStaff", () => ({ useCurrentStaff: () => ({ staffRecord: { staff_id: "s1" } }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, focusMode }: any) => <div data-testid="app-layout" data-focus-mode={focusMode}>{children}</div>,
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => <div data-testid="leave-page-dialog" />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

import TimesheetApprovalDetail from "../TimesheetApprovalDetail";

describe("TimesheetApprovalDetail lock-navigation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TA1: renders focusMode in loading branch", () => {
    render(<TimesheetApprovalDetail />);
    expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("true");
  });

  it("TA2: Back button calls allowNextNavigation before navigate", async () => {
    render(<TimesheetApprovalDetail />);
    const user = userEvent.setup();
    await user.click(screen.getByText("common.back"));
    expect(mockAllowNextNavigation).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalled();
    const allowOrder = mockAllowNextNavigation.mock.invocationCallOrder[0];
    const navOrder = mockNavigate.mock.invocationCallOrder[0];
    expect(allowOrder).toBeLessThan(navOrder);
  });

  it("TA3: LeavePageDialog renders in loading branch", () => {
    render(<TimesheetApprovalDetail />);
    expect(screen.getByTestId("leave-page-dialog")).toBeInTheDocument();
  });

  it("TA4: Back button present in loading branch", () => {
    render(<TimesheetApprovalDetail />);
    expect(screen.getByText("common.back")).toBeInTheDocument();
  });
});

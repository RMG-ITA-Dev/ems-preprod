import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";

const mockNavigate = vi.fn();
const mockAllowNextNavigation = vi.fn();
const mockBlocker = { state: "unblocked" as "unblocked" | "blocked" | "proceeding", reset: vi.fn(), proceed: vi.fn() };
let capturedLockArgs: any = {};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ periodId: "test-period" }) };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: (args: any) => {
    capturedLockArgs = args;
    mockBlocker.state = args.locked ? "blocked" : "unblocked";
    return { blocker: mockBlocker, allowNextNavigation: mockAllowNextNavigation, isDirty: false };
  },
}));

const mockTimesheetData = {
  staff: { short_name: "Test Staff", first_name: "Test", last_name: "Staff" },
  period: { week_start_date: "2026-02-23", week_number: 9, fiscal_year: 2026 },
  lineApprovals: [{ approval_id: "appr-1", engagement_id: "eng-1", status: "pending" as const }],
  approvableEngagementIds: ["eng-1"],
  timeEntries: [],
  engagementBudgets: {},
};

let mockTimesheetReturn: { data: any; isLoading: boolean } = { data: null, isLoading: true };

vi.mock("@/hooks/useTimesheetApprovals", () => ({
  useStaffTimesheetForApproval: () => mockTimesheetReturn,
  useBulkApproveTimesheetLines: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkRejectTimesheetLines: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({ useCurrentStaff: () => ({ staffRecord: { staff_id: "s1" } }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
// Fase 6: TimesheetApprovalDetail now also resolves the assignment advisory for the staff being
// viewed. Neither hook is under test here — stub them to no-op/unavailable so this suite keeps
// exercising only the leave-page lock behavior it was written for.
vi.mock("@/hooks/useTimesheetPolicies", () => ({
  useTimesheetPolicies: () => ({ data: { workDays: 5 }, isPending: false }),
}));
vi.mock("@/hooks/scheduler/useStaffAssignmentSegments", () => ({
  useStaffAssignmentSegments: () => ({ data: null, isSuccess: true, isError: false }),
}));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, focusMode }: any) => <div data-testid="app-layout" data-focus-mode={focusMode}>{children}</div>,
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: ({ isDirty }: any) => <div data-testid="leave-page-dialog" data-is-dirty={isDirty} />,
}));
vi.mock("@/components/timesheet/ApprovalTimesheetGrid", () => ({
  ApprovalTimesheetGrid: ({ onDecisionChange }: any) => (
    <button onClick={() => onDecisionChange("appr-1", "approve")}>
      make-decision
    </button>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

import TimesheetApprovalDetail from "../TimesheetApprovalDetail";

describe("TimesheetApprovalDetail lock-navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedLockArgs = {};
    mockBlocker.state = "unblocked";
    mockTimesheetReturn = { data: null, isLoading: true };
  });

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

  it("TA5: lock is inactive when page loads with no local decisions", () => {
    mockTimesheetReturn = { data: mockTimesheetData, isLoading: false };
    render(<TimesheetApprovalDetail />);
    expect(capturedLockArgs.locked).toBe(false);
    expect(capturedLockArgs.isDirty).toBe(false);
  });

  it("TA6: lock activates after a decision is made", async () => {
    mockTimesheetReturn = { data: mockTimesheetData, isLoading: false };
    render(<TimesheetApprovalDetail />);
    const user = userEvent.setup();
    await user.click(screen.getByText("make-decision"));
    expect(capturedLockArgs.locked).toBe(true);
    expect(capturedLockArgs.isDirty).toBe(true);
  });

  it("TA7: LeavePageDialog receives isDirty=true when a decision exists", async () => {
    mockTimesheetReturn = { data: mockTimesheetData, isLoading: false };
    render(<TimesheetApprovalDetail />);
    const user = userEvent.setup();
    await user.click(screen.getByText("make-decision"));
    expect(screen.getByTestId("leave-page-dialog").dataset.isDirty).toBe("true");
  });

  it("TA8: clean state + Cancelar => navigates immediately, no leave-dialog block", async () => {
    mockTimesheetReturn = { data: mockTimesheetData, isLoading: false };
    render(<TimesheetApprovalDetail />);
    const user = userEvent.setup();

    // Acceptance criterion: with no decisions, the blocker must be inactive
    expect(mockBlocker.state).toBe("unblocked");

    // Click the real Cancel button in the loaded branch (distinct from Back button in loading branch)
    await user.click(screen.getByText("common.cancel"));

    // Navigation occurs immediately — no confirmation dialog required
    expect(mockNavigate).toHaveBeenCalled();
    expect(mockBlocker.state).toBe("unblocked");
  });
});

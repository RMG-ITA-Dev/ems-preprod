import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";

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

const APPROVER_STAFF_ID = "approver-1";
const VIEWED_STAFF_ID = "viewed-staff-2";

const mockTimesheetData = {
  staff: { short_name: "Test Staff", first_name: "Test", last_name: "Staff" },
  period: { week_start_date: "2026-02-16", week_number: 8, fiscal_year: 2026, staff_id: VIEWED_STAFF_ID },
  lineApprovals: [{ approval_id: "appr-1", engagement_id: "eng-1", status: "pending" as const }],
  approvableEngagementIds: ["eng-1"],
  timeEntries: [],
  engagementBudgets: {},
};

let mockTimesheetReturn: { data: unknown; isLoading: boolean } = { data: mockTimesheetData, isLoading: false };

vi.mock("@/hooks/useTimesheetApprovals", () => ({
  useStaffTimesheetForApproval: () => mockTimesheetReturn,
  useBulkApproveTimesheetLines: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkRejectTimesheetLines: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: APPROVER_STAFF_ID } }),
}));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => <div data-testid="leave-page-dialog" />,
}));

const mockUseTimesheetPolicies = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useTimesheetPolicies", () => ({
  useTimesheetPolicies: mockUseTimesheetPolicies,
}));

const mockUseStaffAssignmentSegments = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/scheduler/useStaffAssignmentSegments", () => ({
  useStaffAssignmentSegments: mockUseStaffAssignmentSegments,
}));

vi.mock("@/components/timesheet/ApprovalTimesheetGrid", () => ({
  ApprovalTimesheetGrid: (props: Record<string, unknown>) => (
    <div data-testid="approval-grid" data-props={JSON.stringify({
      assignmentWindows: props.assignmentWindows instanceof Map
        ? Array.from((props.assignmentWindows as Map<string, unknown>).entries())
        : props.assignmentWindows,
      workDays: props.workDays,
    })} />
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

import TimesheetApprovalDetail from "../TimesheetApprovalDetail";

function readGridProps() {
  return JSON.parse(screen.getByTestId("approval-grid").dataset.props!);
}

describe("TimesheetApprovalDetail assignment advisory (Fase 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTimesheetReturn = { data: mockTimesheetData, isLoading: false };
    mockUseTimesheetPolicies.mockReturnValue({ data: { workDays: 5 }, isPending: false });
    mockUseStaffAssignmentSegments.mockReturnValue({ data: null, isSuccess: true, isError: false });
  });

  it("queries segments for the staff being VIEWED, not the approver", () => {
    render(<TimesheetApprovalDetail />);
    expect(mockUseStaffAssignmentSegments).toHaveBeenCalledWith(
      VIEWED_STAFF_ID,
      expect.anything(),
      expect.anything(),
    );
  });

  it("passes week_start_date verbatim (unnormalized) as the week start", () => {
    render(<TimesheetApprovalDetail />);
    expect(mockUseStaffAssignmentSegments).toHaveBeenCalledWith(
      VIEWED_STAFF_ID,
      "2026-02-16",
      expect.anything(),
    );
  });

  it("a 5-day policy ends the range on Friday", () => {
    mockUseTimesheetPolicies.mockReturnValue({ data: { workDays: 5 }, isPending: false });
    render(<TimesheetApprovalDetail />);
    expect(mockUseStaffAssignmentSegments).toHaveBeenCalledWith(VIEWED_STAFF_ID, "2026-02-16", "2026-02-20");
  });

  it("a 6-day policy ends the range on Saturday", () => {
    mockUseTimesheetPolicies.mockReturnValue({ data: { workDays: 6 }, isPending: false });
    render(<TimesheetApprovalDetail />);
    expect(mockUseStaffAssignmentSegments).toHaveBeenCalledWith(VIEWED_STAFF_ID, "2026-02-16", "2026-02-21");
  });

  it("retains the query (undefined end) while policies are pending", () => {
    mockUseTimesheetPolicies.mockReturnValue({ data: undefined, isPending: true });
    render(<TimesheetApprovalDetail />);
    expect(mockUseStaffAssignmentSegments).toHaveBeenCalledWith(VIEWED_STAFF_ID, "2026-02-16", undefined);
  });

  it("forwards the resolved segments map and workDays to the grid", () => {
    const map = new Map([["eng-1", [{ start_date: "2026-02-16", end_date: "2026-02-20" }]]]);
    mockUseStaffAssignmentSegments.mockReturnValue({ data: map, isSuccess: true, isError: false });
    mockUseTimesheetPolicies.mockReturnValue({ data: { workDays: 5 }, isPending: false });
    render(<TimesheetApprovalDetail />);
    const props = readGridProps();
    expect(props.workDays).toBe(5);
    expect(props.assignmentWindows).toEqual([["eng-1", [{ start_date: "2026-02-16", end_date: "2026-02-20" }]]]);
  });

  it("forwards undefined to the grid when segments data is unavailable (null)", () => {
    mockUseStaffAssignmentSegments.mockReturnValue({ data: null, isSuccess: true, isError: false });
    render(<TimesheetApprovalDetail />);
    const props = readGridProps();
    expect(props.assignmentWindows).toBeUndefined();
  });

  it("does not disturb the existing leave-page lock wiring", () => {
    render(<TimesheetApprovalDetail />);
    expect(screen.getByTestId("leave-page-dialog")).toBeInTheDocument();
  });
});

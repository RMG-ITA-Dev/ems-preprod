import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApprovalTimesheetGrid } from "../ApprovalTimesheetGrid";
import type { TimeEntryForApproval, LineApproval } from "@/hooks/useTimesheetApprovals";

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock timesheetUtils
vi.mock("@/lib/timesheetUtils", () => ({
  getWorkDays: (start: Date, count: number) => {
    const days = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  },
  getDayName: () => "Mon",
  formatDayMonth: () => "01/01",
  toISODateString: (d: Date) => d.toISOString().split("T")[0],
  parseDateLocal: (s: string) => new Date(s + "T00:00:00"),
}));

const makeEntry = (overrides: Partial<TimeEntryForApproval> = {}): TimeEntryForApproval => ({
  time_id: "t1",
  date_worked: "2026-02-16",
  hours_logged: 5,
  description: null,
  engagement_id: "eng-a",
  activity_id: "act-1",
  engagement: { engagement_id: "eng-a", engagement_code: "E001", engagement_name: "Eng A", client: null },
  activity: { activity_id: "act-1", activity_code: "A01", description: "Activity 1" },
  ...overrides,
});

const makeApproval = (overrides: Partial<LineApproval> = {}): LineApproval => ({
  approval_id: "ap-1",
  period_id: "p1",
  engagement_id: "eng-a",
  activity_id: "act-1",
  status: "pending",
  approved_by: null,
  approved_at: null,
  review_notes: null,
  created_at: "2026-02-16T00:00:00Z",
  updated_at: "2026-02-16T00:00:00Z",
  ...overrides,
});

const defaultProps = {
  weekStartDate: "2026-02-16",
  approvalDecisions: new Map(),
  onDecisionChange: vi.fn(),
  lang: "en",
};

const renderGrid = (props: Partial<Parameters<typeof ApprovalTimesheetGrid>[0]> = {}) =>
  render(
    <TooltipProvider>
      <ApprovalTimesheetGrid {...defaultProps} timeEntries={[]} lineApprovals={[]} approvableEngagementIds={[]} {...props} />
    </TooltipProvider>
  );

describe("ApprovalTimesheetGrid budget summary", () => {
  it("GT-1: renders budget and remaining when data available", () => {
    renderGrid({
      timeEntries: [makeEntry({ hours_logged: 25 })],
      lineApprovals: [makeApproval()],
      approvableEngagementIds: ["eng-a"],
      engagementBudgets: { "eng-a": { budgetedHours: 100 } },
    });
    expect(screen.getByText(/100h/)).toBeInTheDocument();
    expect(screen.getByText(/approval\.remainingLabel/)).toBeInTheDocument();
  });

  it("GT-2: renders N/A when budget unavailable", () => {
    renderGrid({
      timeEntries: [makeEntry()],
      lineApprovals: [makeApproval()],
      approvableEngagementIds: ["eng-a"],
      engagementBudgets: { "eng-a": { budgetedHours: null } },
    });
    expect(screen.getByText(/approval\.budgetNA/)).toBeInTheDocument();
  });

  it("GT-3: renders N/A when engagement missing from budgets map", () => {
    renderGrid({
      timeEntries: [makeEntry()],
      lineApprovals: [makeApproval()],
      approvableEngagementIds: ["eng-a"],
      engagementBudgets: {},
    });
    expect(screen.getByText(/approval\.budgetNA/)).toBeInTheDocument();
  });

  it("GT-4: approved activity shows locked badge and no approval toggle — even when approver has permission", () => {
    // canApprove=true (approver has permission) + approved activity → toggle must NOT render
    renderGrid({
      timeEntries: [makeEntry()],
      lineApprovals: [makeApproval({ status: "approved" })],
      approvableEngagementIds: ["eng-a"],
      engagementBudgets: {},
    });
    // Approved badge appears (engagement aggregate row + activity row both show it)
    expect(screen.getAllByText("approval.status.approved").length).toBeGreaterThan(0);
    // No toggle decision buttons for the approved activity
    expect(screen.queryByText("approval.decision.approve")).toBeNull();
    expect(screen.queryByText("approval.decision.reject")).toBeNull();
  });

  it("GT-5: zero budget renders 0h not N/A", () => {
    renderGrid({
      timeEntries: [makeEntry()],
      lineApprovals: [makeApproval()],
      approvableEngagementIds: ["eng-a"],
      engagementBudgets: { "eng-a": { budgetedHours: 0 } },
    });
    expect(screen.getByText(/\/ 0h/)).toBeInTheDocument();
  });
});

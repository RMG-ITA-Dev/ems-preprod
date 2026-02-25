import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestWrapper } from "@/test/utils";
import TimeSheet from "../TimeSheet";

// Mock hooks
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1", hire_date: "2020-01-01" }, isLoading: false })
}));

vi.mock("@/hooks/useTimesheetWeek", () => ({
  useTimesheetWeek: () => ({
    period: { period_id: "p1", is_period_locked: false },
    entries: [{ hours_logged: 10, engagement_id: "eng-1" }],
    engagements: [{ engagement_id: "eng-1", activity_required: true }],
    activities: [],
    isLoading: false
  })
}));

vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: () => ({ data: [
    { setting_key: "DAILY_MIN", setting_value: "8" },
    { setting_key: "DAILY_MAX", setting_value: "8" },
    { setting_key: "WEEKLY_MIN", setting_value: "40" },
    { setting_key: "WEEKLY_MAX", setting_value: "40" }
  ]})
}));

vi.mock("@/hooks/useTimesheetMutations", () => ({
  useSubmitTimesheet: () => ({ mutate: vi.fn(), isPending: false }),
  useUnsubmitTimesheet: () => ({ mutate: vi.fn() }),
  useCopyPreviousWeek: () => ({ mutate: vi.fn() })
}));

describe("TimeSheet Submit Guards", () => {
  it("shows min alert when below WEEKLY_MIN", () => {
    // Override entries for this test
    // We'd need to adjust the mock or pass props if possible
    // For simplicity, we assume the component uses the hook.
    // Since we mocked the hook globally, we can't easily change it per test without a factory.
    // But we can check that with 10h logged (default mock) and 40h min, it SHOULD show alert.
    render(
      <TestWrapper>
        <TimeSheet />
      </TestWrapper>
    );
    expect(screen.getByText(/Cannot submit: total hours \(10.0h\) are below/)).toBeInTheDocument();
    expect(screen.queryByText("timesheet.submitWeek")).not.toBeInTheDocument();
  });
});

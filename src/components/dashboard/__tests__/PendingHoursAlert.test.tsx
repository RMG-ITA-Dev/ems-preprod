import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PendingHoursAlert } from "../PendingHoursAlert";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && Object.keys(opts).length > 0) {
        const pairs = Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(",");
        return `${key}(${pairs})`;
      }
      return key;
    },
    i18n: { language: "en" },
  }),
}));

// Mock useCurrentStaff
const mockUseCurrentStaff = vi.fn();
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => mockUseCurrentStaff(),
}));

// Mock useDashboard
vi.mock("@/contexts/DashboardContext", () => ({
  useDashboard: () => ({
    startDateStr: "2026-01-01",
    endDateStr: "2026-02-28",
  }),
}));

// Mock supabase.rpc
const mockRpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const sampleWeeks = [
  { week_start: "2026-01-05", week_end: "2026-01-09", status: "NOT_LOGGED", total_logged_hours: 0, expected_hours: 40, missing_hours: 40, is_submitted: false, is_current_week: false },
  { week_start: "2026-01-12", week_end: "2026-01-16", status: "PENDING_APPROVAL", total_logged_hours: 38.5, expected_hours: 40, missing_hours: 1.5, is_submitted: true, is_current_week: false },
  { week_start: "2026-01-19", week_end: "2026-01-23", status: "APPROVED", total_logged_hours: 40, expected_hours: 40, missing_hours: 0, is_submitted: true, is_current_week: false },
];

describe("PendingHoursAlert (Feature 0220-50 v5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentStaff.mockReturnValue({
      staffRecord: { staff_id: "staff-1" },
    });
  });

  it("renders nothing when weekStatuses is empty", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { container } = render(<PendingHoursAlert />, {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("renders nothing when staff has no staff_id", () => {
    mockUseCurrentStaff.mockReturnValue({ staffRecord: null });

    const { container } = render(<PendingHoursAlert />, {
      wrapper: createWrapper(),
    });

    expect(container.innerHTML).toBe("");
  });

  it("renders the alert when there are actionable weeks", async () => {
    mockRpc.mockResolvedValue({ data: sampleWeeks, error: null });

    render(<PendingHoursAlert />, { wrapper: createWrapper() });

    await vi.waitFor(() => {
      expect(
        screen.getByText("dashboard.personal.pendingHours.title")
      ).toBeInTheDocument();
    });
  });

  it("renders nothing when all weeks are APPROVED", async () => {
    const allApproved = [
      { week_start: "2026-01-05", week_end: "2026-01-09", status: "APPROVED", total_logged_hours: 40, expected_hours: 40, missing_hours: 0, is_submitted: true, is_current_week: false },
    ];
    mockRpc.mockResolvedValue({ data: allApproved, error: null });

    const { container } = render(<PendingHoursAlert />, {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("displays 'Go to Timesheet' link pointing to /timesheet", async () => {
    mockRpc.mockResolvedValue({ data: sampleWeeks, error: null });

    render(<PendingHoursAlert />, { wrapper: createWrapper() });

    await vi.waitFor(() => {
      const link = screen.getByText(
        "dashboard.personal.pendingHours.goToTimesheet"
      );
      expect(link).toBeInTheDocument();
      expect(link.closest("a")).toHaveAttribute("href", "/timesheet");
    });
  });

  it("shows summary chips for NOT_LOGGED and PENDING_APPROVAL counts", async () => {
    mockRpc.mockResolvedValue({ data: sampleWeeks, error: null });

    render(<PendingHoursAlert />, { wrapper: createWrapper() });

    await vi.waitFor(() => {
      // Red chip: 1 not reported with 40h missing
      expect(
        screen.getByText(/summaryNotLogged/)
      ).toBeInTheDocument();
      // Yellow chip: 1 pending
      expect(
        screen.getByText(/summaryPending/)
      ).toBeInTheDocument();
    });
  });
});

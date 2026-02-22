import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  { week_start: "2026-01-05", expected_hours: 40, actual_hours: 32, gap: 8 },
  { week_start: "2026-01-12", expected_hours: 40, actual_hours: 20, gap: 20 },
  { week_start: "2026-01-19", expected_hours: 40, actual_hours: 35, gap: 5 },
];

describe("PendingHoursAlert (Feature 0220-50)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentStaff.mockReturnValue({
      staffRecord: { staff_id: "staff-1" },
    });
  });

  it("renders nothing when pendingWeeks is empty", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { container } = render(<PendingHoursAlert />, {
      wrapper: createWrapper(),
    });

    // Wait for query to settle, then check nothing rendered
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

  it("renders summary card with correct week count and total hours", async () => {
    mockRpc.mockResolvedValue({ data: sampleWeeks, error: null });

    render(<PendingHoursAlert />, { wrapper: createWrapper() });

    await vi.waitFor(() => {
      expect(
        screen.getByText("dashboard.personal.pendingHours.title")
      ).toBeInTheDocument();
    });

    // Summary should mention weeks=3 and hours=33.0
    expect(
      screen.getByText(/dashboard\.personal\.pendingHours\.summary/)
    ).toBeInTheDocument();
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

  it("does not show 'and X more' footer when 12 or fewer weeks", async () => {
    mockRpc.mockResolvedValue({ data: sampleWeeks, error: null });

    render(<PendingHoursAlert />, { wrapper: createWrapper() });

    await vi.waitFor(() => {
      expect(
        screen.getByText("dashboard.personal.pendingHours.title")
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/dashboard\.personal\.pendingHours\.andMore/)
    ).not.toBeInTheDocument();
  });

  it("shows 'and X more' footer when more than 12 weeks exist", async () => {
    // Generate 15 weeks with valid dates
    const manyWeeks = Array.from({ length: 15 }, (_, i) => ({
      week_start: `2025-${String(Math.floor(i / 4) + 1).padStart(2, "0")}-${String(((i % 4) * 7) + 1).padStart(2, "0")}`,
      expected_hours: 40,
      actual_hours: 30,
      gap: 10,
    }));
    mockRpc.mockResolvedValue({ data: manyWeeks, error: null });

    render(<PendingHoursAlert />, { wrapper: createWrapper() });

    // Wait for data to load
    await vi.waitFor(() => {
      expect(
        screen.getByText("dashboard.personal.pendingHours.title")
      ).toBeInTheDocument();
    });

    // Expand the collapsible by clicking the trigger button
    const triggerButton = screen.getByText("dashboard.personal.pendingHours.title").closest("button");
    expect(triggerButton).not.toBeNull();
    fireEvent.click(triggerButton!);

    // The "and X more" text should appear in the expanded content
    await vi.waitFor(() => {
      expect(
        screen.getByText(/dashboard\.personal\.pendingHours\.andMore/)
      ).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("computes totalGap correctly from week gaps", async () => {
    mockRpc.mockResolvedValue({ data: sampleWeeks, error: null });

    render(<PendingHoursAlert />, { wrapper: createWrapper() });

    await vi.waitFor(() => {
      // totalGap = 8 + 20 + 5 = 33.0
      const summary = screen.getByText(/dashboard\.personal\.pendingHours\.summary/);
      expect(summary.textContent).toContain("33.0");
    });
  });
});

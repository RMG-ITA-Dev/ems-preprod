import React from "react";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { StaffHoursDetailDialog } from "../StaffHoursDetailDialog";

vi.mock('xlsx', () => ({
  utils: {
    book_new: vi.fn(() => ({})),
    aoa_to_sheet: vi.fn((data: unknown[][]) => ({ __data: data })),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

// Polyfills for Radix UI Select which requires APIs not implemented in jsdom
if (typeof window !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

// Local mock overrides the global setup.ts mock for this file
const mockEqForecast = vi.fn();
const mockEqEngagement = vi.fn(() => ({ eq: mockEqForecast }));
const mockSelect = vi.fn(() => ({ eq: mockEqEngagement }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function makeRaw(overrides: {
  staff_id: string;
  hours_logged?: number;
  period?: { year: number; week_number: number; week_start_date: string } | null;
  first_name?: string;
  last_name?: string;
  category_name?: string;
  display_order?: number;
}) {
  return {
    staff_id: overrides.staff_id,
    hours_logged: overrides.hours_logged ?? 4.0,
    period:
      overrides.period !== undefined
        ? overrides.period
        : { year: 2026, week_number: 10, week_start_date: "2026-03-02" },
    staff: {
      first_name: overrides.first_name ?? "Ana",
      last_name: overrides.last_name ?? "Gomez",
      category: {
        category_name: overrides.category_name ?? "Senior",
        display_order: overrides.display_order ?? 3,
      },
    },
  };
}

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

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  engagementId: "eng-001",
  engagementCode: "SSU-001",
};

// Radix Presence uses async state transitions for dialog animations that fire
// outside React's act() boundary in jsdom. Suppress these known infrastructure
// warnings so genuine test failures remain easy to spot.
const originalConsoleError = console.error.bind(console);
beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation((msg: unknown, ...rest: unknown[]) => {
    const s = typeof msg === "string" ? msg : "";
    if (s.includes("not wrapped in act") || s.includes("aria-describedby")) return;
    originalConsoleError(msg, ...rest);
  });
});
afterAll(() => {
  vi.mocked(console.error).mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: return empty data
  mockEqForecast.mockResolvedValue({ data: [], error: null });
  // Re-apply suppressor after clearAllMocks wipes the spy's call history
  // (mockImplementation is NOT cleared by clearAllMocks, only call history is)
});

// Helper: find a combobox by its aria-label (which equals the i18n key because t() is mocked)
function getCombobox(labelKey: string) {
  return screen.getByRole("combobox", { name: labelKey });
}

// Test 1
describe("StaffHoursDetailDialog", () => {
  it("renders dialog title when open={true}", async () => {
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(
        screen.getByText("dashboard.encargo.hoursDetail.title")
      ).toBeInTheDocument();
    });
  });

  // Test 2
  it("does not render dialog content when open={false}", () => {
    render(
      <StaffHoursDetailDialog {...defaultProps} open={false} />,
      { wrapper: createWrapper() }
    );

    expect(
      screen.queryByText("dashboard.encargo.hoursDetail.title")
    ).not.toBeInTheDocument();
  });

  // Test 3
  it("does not call supabase.from when engagementId is null", async () => {
    render(
      <StaffHoursDetailDialog {...defaultProps} engagementId={null} />,
      { wrapper: createWrapper() }
    );

    // Wait a tick to ensure any async query would have fired
    await new Promise((r) => setTimeout(r, 50));
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // Test 4 — updated: 2 aggregated rows (Senior + Gerente) → 2 data + 2 subtotal rows + 1 grand total = 6 total
  it("renders correct table rows for 3 raw entries (2 same staff/week, 1 different)", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", hours_logged: 2 }),
      makeRaw({ staff_id: "s1", hours_logged: 3 }),
      makeRaw({
        staff_id: "s2",
        first_name: "Luis",
        last_name: "Perez",
        category_name: "Gerente",
        display_order: 2,
      }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      // Each data row has 5 cells; subtotal rows are added per category group; plus 1 grand total row
      const rows = screen.getAllByRole("row");
      // 1 header + 2 data rows + 2 subtotal rows (one per category) + 1 grand total
      expect(rows).toHaveLength(6);
    });
  });

  // Test 5 — uses aria-label to find the category popover trigger among the filter controls
  it("category filter hides rows that do not match selected category", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "G", category_name: "Senior", display_order: 3 }),
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "P", category_name: "Gerente", display_order: 2 }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    const user = userEvent.setup();
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Wait for data to load (auto-init sets year=2026, week=10 — both rows match so 2 data + 2 subtotal rows + 1 grand total)
    await vi.waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(6); // header + 2 data + 2 subtotal + 1 grand total
    });

    // Open the category multi-select popover
    const trigger = screen.getByRole("button", { name: "dashboard.encargo.hoursDetail.filterByCategory" });
    await user.click(trigger);

    // Check the "Senior" checkbox to select only Senior
    const seniorCheckbox = await screen.findByRole("checkbox", { name: "Senior" });
    await user.click(seniorCheckbox);

    // Only the Senior row + its subtotal + grand total should remain visible
    await vi.waitFor(() => {
      const rows = screen.getAllByRole("row");
      expect(rows).toHaveLength(4); // header + 1 data row + 1 subtotal + 1 grand total
      expect(screen.getByText("Ana G")).toBeInTheDocument();
      expect(screen.queryByText("Luis P")).not.toBeInTheDocument();
    });
  });

  // Test 6
  it("staff name search hides non-matching rows", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "Gomez" }),
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "Perez", period: { year: 2026, week_number: 10, week_start_date: "2026-03-09" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    const user = userEvent.setup();
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Both rows are Senior in same year/week → 2 data + 1 subtotal row + 1 grand total (one Senior group)
    await vi.waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(5); // header + 2 data + 1 subtotal + 1 grand total
    });

    const searchInput = screen.getByPlaceholderText(
      "dashboard.encargo.hoursDetail.filterByStaff"
    );
    await user.type(searchInput, "Gomez");

    // After filter: 1 data row (Ana) + 1 subtotal (Senior group) + 1 grand total
    await vi.waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(4); // header + 1 data + 1 subtotal + 1 grand total
      expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
      expect(screen.queryByText("Luis Perez")).not.toBeInTheDocument();
    });
  });

  // Test 7
  it("renders empty-state text when query returns zero rows", async () => {
    mockEqForecast.mockResolvedValue({ data: [], error: null });

    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(
        screen.getByText("dashboard.encargo.hoursDetail.noData")
      ).toBeInTheDocument();
    });
  });

  // Test 8 — updated: exportCsv → exportExcel
  it("renders the Export Excel button", async () => {
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /dashboard\.encargo\.hoursDetail\.exportExcel/i,
        })
      ).toBeInTheDocument();
    });
  });

  // Test 9
  it("displays — for year and week columns when period is null", async () => {
    const raw = [makeRaw({ staff_id: "s1", period: null })];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      const dashCells = screen.getAllByText("—");
      // Should appear in Year and Week columns of data row and subtotal row (≥4 cells)
      expect(dashCells.length).toBeGreaterThanOrEqual(2);
    });
  });

  // Test 10 — auto-init: dialog opens showing only the last year/week rows
  // updated: 1 data row + 1 subtotal row = 3 total (header + 2)
  it("auto-initializes to the last year and last week on first data load", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "G", period: { year: 2025, week_number: 9, week_start_date: "2025-02-24" } }),
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "P", period: { year: 2026, week_number: 11, week_start_date: "2026-03-09" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Only the row for year=2026 week=11 should be visible (+ its subtotal row + grand total)
    await vi.waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(4); // header + 1 data + 1 subtotal + 1 grand total
      expect(screen.getByText("Luis P")).toBeInTheDocument();
      expect(screen.queryByText("Ana G")).not.toBeInTheDocument();
    });
  });

  // Test 11 — year filter hides rows of other years; null-year rows hidden when year is active
  it("year filter hides rows of other years", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "G", period: { year: 2025, week_number: 9, week_start_date: "2025-02-24" } }),
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "P", period: { year: 2026, week_number: 10, week_start_date: "2026-03-02" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    const user = userEvent.setup();
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Wait for auto-init (2026, week 10 → Luis visible)
    await vi.waitFor(() => {
      expect(screen.getByText("Luis P")).toBeInTheDocument();
    });

    // Change year to 2025
    const yearTrigger = getCombobox("dashboard.encargo.hoursDetail.filterByYear");
    await user.click(yearTrigger);
    const year2025 = await screen.findByRole("option", { name: "2025" });
    await user.click(year2025);

    await vi.waitFor(() => {
      expect(screen.getByText("Ana G")).toBeInTheDocument();
      expect(screen.queryByText("Luis P")).not.toBeInTheDocument();
    });
  });

  // Test 12 — week filter hides rows of other weeks
  it("week filter hides rows of other weeks", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "G", period: { year: 2026, week_number: 10, week_start_date: "2026-03-02" } }),
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "P", period: { year: 2026, week_number: 11, week_start_date: "2026-03-09" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    const user = userEvent.setup();
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Auto-init → year=2026, week=11 → only Luis visible
    await vi.waitFor(() => {
      expect(screen.getByText("Luis P")).toBeInTheDocument();
      expect(screen.queryByText("Ana G")).not.toBeInTheDocument();
    });

    // Switch week to 10
    const weekTrigger = getCombobox("dashboard.encargo.hoursDetail.filterByWeek");
    await user.click(weekTrigger);
    const week10 = await screen.findByRole("option", { name: "10" });
    await user.click(week10);

    await vi.waitFor(() => {
      expect(screen.getByText("Ana G")).toBeInTheDocument();
      expect(screen.queryByText("Luis P")).not.toBeInTheDocument();
    });
  });

  // Test 13 — changing year resets week when current week doesn't exist in new year
  it("resets weekFilter when selected week is not available in the new year", async () => {
    const raw = [
      // 2025 has only week 9
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "G", period: { year: 2025, week_number: 9, week_start_date: "2025-02-24" } }),
      // 2026 has week 10 and 11
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "P", period: { year: 2026, week_number: 10, week_start_date: "2026-03-02" } }),
      makeRaw({ staff_id: "s3", first_name: "Maria", last_name: "R", period: { year: 2026, week_number: 11, week_start_date: "2026-03-09" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    const user = userEvent.setup();
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Auto-init → year=2026, week=11 → only Maria visible
    await vi.waitFor(() => {
      expect(screen.getByText("Maria R")).toBeInTheDocument();
    });

    // Change year to 2025 — week 11 doesn't exist there, so weekFilter resets to __all__
    const yearTrigger = getCombobox("dashboard.encargo.hoursDetail.filterByYear");
    await user.click(yearTrigger);
    const year2025 = await screen.findByRole("option", { name: "2025" });
    await user.click(year2025);

    // Now year=2025, week=__all__ → Ana (week 9) should be visible
    await vi.waitFor(() => {
      expect(screen.getByText("Ana G")).toBeInTheDocument();
      expect(screen.queryByText("Luis P")).not.toBeInTheDocument();
      expect(screen.queryByText("Maria R")).not.toBeInTheDocument();
    });
  });

  // Test 14 — changing year keeps week when the same week exists in the new year
  it("keeps weekFilter when the selected week exists in the new year", async () => {
    const raw = [
      // 2025 week 10
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "G", period: { year: 2025, week_number: 10, week_start_date: "2025-03-03" } }),
      // 2026 week 10 and 11
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "P", period: { year: 2026, week_number: 10, week_start_date: "2026-03-02" } }),
      makeRaw({ staff_id: "s3", first_name: "Maria", last_name: "R", period: { year: 2026, week_number: 11, week_start_date: "2026-03-09" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    const user = userEvent.setup();
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Auto-init → year=2026, week=11 → only Maria visible
    await vi.waitFor(() => {
      expect(screen.getByText("Maria R")).toBeInTheDocument();
    });

    // Set week to 10 (still in 2026) → Luis visible
    const weekTrigger = getCombobox("dashboard.encargo.hoursDetail.filterByWeek");
    await user.click(weekTrigger);
    const week10option = await screen.findByRole("option", { name: "10" });
    await user.click(week10option);

    await vi.waitFor(() => {
      expect(screen.getByText("Luis P")).toBeInTheDocument();
    });

    // Now change year to 2025 — week 10 also exists in 2025, so weekFilter stays
    const yearTrigger = getCombobox("dashboard.encargo.hoursDetail.filterByYear");
    await user.click(yearTrigger);
    const year2025 = await screen.findByRole("option", { name: "2025" });
    await user.click(year2025);

    // year=2025, week=10 → Ana visible, Luis and Maria hidden
    await vi.waitFor(() => {
      expect(screen.getByText("Ana G")).toBeInTheDocument();
      expect(screen.queryByText("Luis P")).not.toBeInTheDocument();
      expect(screen.queryByText("Maria R")).not.toBeInTheDocument();
    });
  });

  // Test 15 — week selector lists only weeks of the selected year
  it("week selector shows only weeks available in the selected year", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", period: { year: 2025, week_number: 9, week_start_date: "2025-02-24" } }),
      makeRaw({ staff_id: "s2", period: { year: 2026, week_number: 10, week_start_date: "2026-03-02" } }),
      makeRaw({ staff_id: "s3", period: { year: 2026, week_number: 11, week_start_date: "2026-03-09" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    const user = userEvent.setup();
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Auto-init to 2026/11
    await vi.waitFor(() => {
      expect(mockFrom).toHaveBeenCalled();
    });

    // Switch to year 2025
    const yearTrigger = getCombobox("dashboard.encargo.hoursDetail.filterByYear");
    await user.click(yearTrigger);
    const year2025 = await screen.findByRole("option", { name: "2025" });
    await user.click(year2025);

    // Open week selector — should only show week 9, not 10 or 11
    const weekTrigger = getCombobox("dashboard.encargo.hoursDetail.filterByWeek");
    await user.click(weekTrigger);

    const weekOptions = await screen.findAllByRole("option");
    const weekLabels = weekOptions.map(o => o.textContent);

    expect(weekLabels).toContain("9");
    expect(weekLabels).not.toContain("10");
    expect(weekLabels).not.toContain("11");
  });

  // Test 16 — updated: Excel export via XLSX.writeFile (replaces CSV download)
  it("Excel export button triggers downloadXlsx with correct filename", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "G", hours_logged: 3, period: { year: 2025, week_number: 9, week_start_date: "2025-02-24" } }),
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "P", hours_logged: 5, period: { year: 2026, week_number: 10, week_start_date: "2026-03-02" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Auto-init → year=2026, week=10 → only Luis visible
    await vi.waitFor(() => {
      expect(screen.getByText("Luis P")).toBeInTheDocument();
      expect(screen.queryByText("Ana G")).not.toBeInTheDocument();
    });

    const exportBtn = screen.getByRole("button", {
      name: /dashboard\.encargo\.hoursDetail\.exportExcel/i,
    });
    await userEvent.click(exportBtn);

    await vi.waitFor(async () => {
      const { writeFile } = await import('xlsx');
      expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('SSU-001')
      );
    });
  });

  // Test 17 — new: lastWeekOnly checkbox renders checked on dialog open
  it("lastWeekOnly checkbox renders checked on dialog open", async () => {
    mockEqForecast.mockResolvedValue({ data: [], error: null });

    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      const checkbox = screen.getByRole("checkbox", {
        name: /lastWeekOnly/i,
      });
      expect(checkbox).toHaveAttribute("aria-checked", "true");
    });
  });

  // Test 18 — new: unchecking lastWeekOnly shows all rows across all years
  it("unchecking lastWeekOnly shows all rows across all years", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "G", period: { year: 2025, week_number: 9, week_start_date: "2025-02-24" } }),
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "P", period: { year: 2026, week_number: 11, week_start_date: "2026-03-09" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    const user = userEvent.setup();
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Auto-init → year=2026, week=11 → only Luis visible
    await vi.waitFor(() => {
      expect(screen.getByText("Luis P")).toBeInTheDocument();
      expect(screen.queryByText("Ana G")).not.toBeInTheDocument();
    });

    // Uncheck the checkbox → year and week reset to __all__
    const checkbox = screen.getByRole("checkbox", { name: /lastWeekOnly/i });
    await user.click(checkbox);

    // Both rows should now be visible
    await vi.waitFor(() => {
      expect(screen.getByText("Ana G")).toBeInTheDocument();
      expect(screen.getByText("Luis P")).toBeInTheDocument();
    });
  });

  // Test 19 — new: re-checking lastWeekOnly restores last-week filter
  it("checking lastWeekOnly after unchecking restores last-week filter", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "G", period: { year: 2025, week_number: 9, week_start_date: "2025-02-24" } }),
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "P", period: { year: 2026, week_number: 11, week_start_date: "2026-03-09" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    const user = userEvent.setup();
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Wait for auto-init
    await vi.waitFor(() => {
      expect(screen.getByText("Luis P")).toBeInTheDocument();
    });

    const checkbox = screen.getByRole("checkbox", { name: /lastWeekOnly/i });

    // Uncheck → all rows visible
    await user.click(checkbox);
    await vi.waitFor(() => {
      expect(screen.getByText("Ana G")).toBeInTheDocument();
    });

    // Re-check → only last week visible again
    await user.click(checkbox);
    await vi.waitFor(() => {
      expect(screen.getByText("Luis P")).toBeInTheDocument();
      expect(screen.queryByText("Ana G")).not.toBeInTheDocument();
    });
  });

  // Test 20 — new: manually changing year dropdown unchecks lastWeekOnly
  it("manually changing year dropdown unchecks lastWeekOnly", async () => {
    const raw = [
      makeRaw({ staff_id: "s1", first_name: "Ana", last_name: "G", period: { year: 2025, week_number: 9, week_start_date: "2025-02-24" } }),
      makeRaw({ staff_id: "s2", first_name: "Luis", last_name: "P", period: { year: 2026, week_number: 11, week_start_date: "2026-03-09" } }),
    ];
    mockEqForecast.mockResolvedValue({ data: raw, error: null });

    const user = userEvent.setup();
    render(<StaffHoursDetailDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Wait for auto-init — checkbox should be checked
    await vi.waitFor(() => {
      const checkbox = screen.getByRole("checkbox", { name: /lastWeekOnly/i });
      expect(checkbox).toHaveAttribute("aria-checked", "true");
    });

    // Change year manually via dropdown
    const yearTrigger = getCombobox("dashboard.encargo.hoursDetail.filterByYear");
    await user.click(yearTrigger);
    const year2025 = await screen.findByRole("option", { name: "2025" });
    await user.click(year2025);

    // Checkbox should now be unchecked
    await vi.waitFor(() => {
      const checkbox = screen.getByRole("checkbox", { name: /lastWeekOnly/i });
      expect(checkbox).toHaveAttribute("aria-checked", "false");
    });
  });
});

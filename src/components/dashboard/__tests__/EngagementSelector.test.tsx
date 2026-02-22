import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { EngagementSelector } from "../EngagementSelector";

// Mock dependencies
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: vi.fn(() => ({
    staffRecord: { staff_id: "staff-1" },
  })),
}));

const mockSetSelectedEngagementId = vi.fn();
vi.mock("@/contexts/DashboardContext", () => ({
  useDashboard: vi.fn(() => ({
    selectedEngagementId: null,
    setSelectedEngagementId: mockSetSelectedEngagementId,
    startDateStr: "2026-01-01",
    endDateStr: "2026-01-31",
  })),
}));

vi.mock("@/hooks/useDashboardAccess", () => ({
  useDashboardAccess: vi.fn(() => ({
    isPartner: true,
    isManager: false,
  })),
}));

// Mock supabase query to return empty or populated engagements
const mockSelect = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EngagementSelector (BUG 0220-49)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders select trigger without crashing when engagement list is empty", async () => {
    // Mock supabase chain: from().select().eq().order()
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    render(<EngagementSelector />, { wrapper: createWrapper() });

    // Wait for loading state to resolve, then check combobox renders
    await vi.waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });

  it("does not crash when rendering with zero engagements", () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    // Should not throw
    expect(() => {
      render(<EngagementSelector />, { wrapper: createWrapper() });
    }).not.toThrow();
  });
});

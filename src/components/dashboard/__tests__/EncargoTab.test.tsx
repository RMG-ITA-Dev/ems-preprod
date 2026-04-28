import React from "react";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { EncargoTab } from "../tabs/EncargoTab";

// Polyfills for Radix UI primitives not implemented in jsdom
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

vi.mock("@/contexts/DashboardContext", () => ({
  useDashboard: vi.fn(() => ({
    selectedEngagementId: "eng-001",
    setSelectedEngagementId: vi.fn(),
    startDateStr: "2026-01-01",
    endDateStr: "2026-12-31",
    activeTab: "encargo",
    setActiveTab: vi.fn(),
  })),
}));

// Prevent EngagementSelector from pulling in its own dependency chain
vi.mock("@/components/dashboard/EngagementSelector", () => ({
  EngagementSelector: () => null,
}));

// A thenable chain that satisfies every supabase query pattern used by
// EncargoTab and StaffHoursDetailDialog:
//   .select().eq().single()         → { data: null, error: { code: 'PGRST116' } }
//   .select().eq().order().order()  → { data: [], error: null }
//   .select().eq().eq()             → { data: [], error: null }
//   .select().eq().in()             → { data: [], error: null }
function makeChain() {
  const emptyOk = { data: [], error: null };
  const notFound = { data: null, error: { code: "PGRST116" } };

  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(notFound));
  // Make the chain itself awaitable so `await chain.eq(...)` resolves
  chain.then = (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
    Promise.resolve(emptyOk).then(resolve, reject);
  chain.catch = (reject: (r: unknown) => unknown) =>
    Promise.resolve(emptyOk).catch(reject);
  chain.finally = (cb: () => void) =>
    Promise.resolve(emptyOk).finally(cb);

  return chain;
}

const mockChain = makeChain();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => mockChain),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

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

describe("EncargoTab — viewHoursDetail button (BUG 0306-81)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: button is present in the category breakdown header
  it("renders the 'dashboard.encargo.viewHoursDetail' button when an engagement is selected", async () => {
    render(<EncargoTab />, { wrapper: createWrapper() });

    await vi.waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /dashboard\.encargo\.viewHoursDetail/i,
        })
      ).toBeInTheDocument();
    });
  });

  // Test 2: clicking the button opens StaffHoursDetailDialog
  it("opens StaffHoursDetailDialog showing 'dashboard.encargo.hoursDetail.title' when the button is clicked", async () => {
    const user = userEvent.setup();
    render(<EncargoTab />, { wrapper: createWrapper() });

    const button = await screen.findByRole("button", {
      name: /dashboard\.encargo\.viewHoursDetail/i,
    });
    await user.click(button);

    await vi.waitFor(() => {
      expect(
        screen.getByText("dashboard.encargo.hoursDetail.title")
      ).toBeInTheDocument();
    });
  });
});

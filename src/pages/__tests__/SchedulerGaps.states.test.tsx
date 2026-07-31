// SchedulerGaps eight-state ladder, modeled on SchedulerL2.states.test.tsx.
// The ladder's order is the contract: role-loading renders a skeleton and
// NEVER a Forbidden flash for an eventually-admin viewer; a role-read
// failure is an ERROR with a retry wired to useUserRole().refetch, never
// a permission verdict; Forbidden and Unavailable are terminal; and a
// rendered report never appears alongside an error.
//
// Fase 3 (plan v2 §4): canView usa canSeeGaps({isAdmin,isPartner,
// isDirector,isManager,isSenior}) — el fixture de rol incluye los 5 flags.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  SchedulerDataError,
  SchedulerUnavailableError,
} from "@/hooks/scheduler/schedulerData";
import { mapGapsInvokeFailure } from "@/hooks/scheduler/schedulerGapsData";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Role state — mutable per test (default: resolved admin).
const roleState = {
  isAdmin: true,
  isPartner: false,
  isDirector: false,
  isManager: false,
  isSenior: false,
  isLoading: false,
  hasError: false,
  refetch: vi.fn(),
};
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => roleState,
}));

// Controllable gaps-hook states + captured `enabled` inputs.
const queryState = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
});
const CAT_A = "11111111-1111-4111-8111-111111111111";
const dataState = () => ({
  headcount: queryState({
    rows: [
      {
        categoryId: CAT_A,
        categoryName: "Senior",
        serviceId: "44444444-4444-4444-8444-444444444444",
        serviceName: "Audit",
        displayOrder: 1,
        demandFteDays: 30,
        suppliedFteDays: 10,
        gapFteDays: 20,
        avgOpenSeats: 0.67,
      },
    ],
  }),
  hours: queryState({ rows: [] }),
  shortage: queryState({ rows: [], truncated: false, deficitRowCount: 0 }),
  bench: queryState({ rows: [] }),
});
let mocks = dataState();
const enabledInputs: boolean[] = [];

// EVERY hook mock captures its `enabled` input, so the zero-invocation
// assertions prove the page wires the gate into all four hooks — not
// just one (a regression hardcoding enabled: true on any single hook
// must fail these tests).
vi.mock("@/hooks/scheduler/useSchedulerGaps", () => ({
  useCategoryHeadcountGap: (input: { enabled: boolean }) => {
    enabledInputs.push(input.enabled);
    return mocks.headcount;
  },
  useCategoryHoursGap: (input: { enabled: boolean }) => {
    enabledInputs.push(input.enabled);
    return mocks.hours;
  },
  useCompetencyShortage: (input: { enabled: boolean }) => {
    enabledInputs.push(input.enabled);
    return mocks.shortage;
  },
  useBenchVsPipeline: (input: { enabled: boolean }) => {
    enabledInputs.push(input.enabled);
    return mocks.bench;
  },
}));

// Lightweight stubs — component behavior is covered by the component
// sanity suite; the ladder test only asserts WHICH state renders.
vi.mock("@/components/scheduler/gaps/GapKpiStrip", () => ({
  GapKpiStrip: () => <div data-testid="kpi-strip" />,
}));
vi.mock("@/components/scheduler/gaps/CategoryGapChart", () => ({
  CategoryGapChart: () => <div data-testid="gap-chart" />,
}));
vi.mock("@/components/scheduler/gaps/SkillShortageTable", () => ({
  SkillShortageTable: () => <div data-testid="skill-table" />,
}));
vi.mock("@/components/scheduler/gaps/BenchTable", () => ({
  BenchTable: () => <div data-testid="bench-table" />,
}));

import SchedulerGaps from "../SchedulerGaps";

function renderPage(url = "/scheduler/gaps") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/scheduler/gaps" element={<SchedulerGaps />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const expectNoReport = () => {
  expect(screen.queryByTestId("kpi-strip")).not.toBeInTheDocument();
  expect(screen.queryByTestId("gap-chart")).not.toBeInTheDocument();
  expect(screen.queryByTestId("skill-table")).not.toBeInTheDocument();
  expect(screen.queryByTestId("bench-table")).not.toBeInTheDocument();
};

beforeEach(() => {
  vi.clearAllMocks();
  enabledInputs.length = 0;
  mocks = dataState();
  Object.assign(roleState, {
    isAdmin: true,
    isPartner: false,
    isDirector: false,
    isManager: false,
    isSenior: false,
    isLoading: false,
    hasError: false,
    refetch: vi.fn(),
  });
});

describe("state 1 — role loading (never a Forbidden flash)", () => {
  it("renders skeletons, no forbidden text, and disables every gaps hook", () => {
    Object.assign(roleState, { isLoading: true, isAdmin: false });
    renderPage();
    expect(screen.queryByText("scheduler.gaps.forbidden")).not.toBeInTheDocument();
    expectNoReport();
    // Zero privileged calls — ALL FOUR hooks received false.
    expect(enabledInputs).not.toContain(true);
    expect(enabledInputs.length % 4).toBe(0);
    expect(enabledInputs.length).toBeGreaterThanOrEqual(4);
  });
});

describe("state 2 — role error is an ERROR, not a permission verdict", () => {
  it("renders the destructive alert with a Retry wired to useUserRole().refetch", () => {
    Object.assign(roleState, { hasError: true, isAdmin: false });
    renderPage();
    expect(screen.getByText("scheduler.errors.loadFailed")).toBeInTheDocument();
    expect(screen.queryByText("scheduler.gaps.forbidden")).not.toBeInTheDocument();
    expectNoReport();
    expect(enabledInputs).not.toContain(true);
    expect(enabledInputs.length % 4).toBe(0);
    fireEvent.click(screen.getByText("scheduler.errors.retry"));
    expect(roleState.refetch).toHaveBeenCalledTimes(1);
  });
});

describe("state 3 — forbidden is terminal after role resolution", () => {
  it("client-gate variant: a resolved manager-shaped role sees forbidden with all hooks disabled", () => {
    Object.assign(roleState, { isAdmin: false });
    renderPage();
    expect(screen.getByText("scheduler.gaps.forbidden")).toBeInTheDocument();
    expect(screen.queryByText("scheduler.errors.retry")).not.toBeInTheDocument();
    expectNoReport();
    expect(enabledInputs).not.toContain(true);
    expect(enabledInputs.length % 4).toBe(0);
  });

  it("server-403 variant: a SchedulerDataError('forbidden') renders forbidden, not the generic error", () => {
    mocks.headcount = {
      ...queryState(undefined),
      isError: true,
      error: new SchedulerDataError("forbidden", "no", 403),
    };
    renderPage();
    expect(screen.getByText("scheduler.gaps.forbidden")).toBeInTheDocument();
    expectNoReport();
  });
});

describe("state 3bis — invalid window is informational, not an error", () => {
  it("from > to renders the invalidRange notice with every gaps hook disabled and no report", () => {
    renderPage("/scheduler/gaps?from=2026-07-10&to=2026-07-01");
    expect(screen.getByText("scheduler.gaps.invalidRange")).toBeInTheDocument();
    expect(screen.queryByText("scheduler.errors.loadFailed")).not.toBeInTheDocument();
    expectNoReport();
    expect(enabledInputs).not.toContain(true);
    expect(enabledInputs.length % 4).toBe(0);
  });

  it("a window exceeding the server's 730-day maximum renders rangeTooLong with zero enabled queries — never the load-error ladder", () => {
    renderPage("/scheduler/gaps?from=2024-01-01&to=2026-01-02");
    expect(screen.getByText("scheduler.gaps.rangeTooLong")).toBeInTheDocument();
    expect(screen.queryByText("scheduler.gaps.invalidRange")).not.toBeInTheDocument();
    expect(screen.queryByText("scheduler.errors.loadFailed")).not.toBeInTheDocument();
    expectNoReport();
    expect(enabledInputs).not.toContain(true);
    expect(enabledInputs.length % 4).toBe(0);
  });

  it("the exact 730-day boundary is VALID: queries enabled, report renders", () => {
    // 2025-01-01 → 2027-01-01 is exactly 730 days' difference (no leap
    // day in between) — the largest window the server accepts.
    renderPage("/scheduler/gaps?from=2025-01-01&to=2027-01-01");
    expect(screen.queryByText("scheduler.gaps.rangeTooLong")).not.toBeInTheDocument();
    expect(screen.getByTestId("kpi-strip")).toBeInTheDocument();
    expect(enabledInputs).toContain(true);
  });
});

describe("state 4 — unavailable is terminal", () => {
  it("deployment variant: SchedulerUnavailableError renders the unavailable alert", () => {
    mocks.bench = {
      ...queryState(undefined),
      isError: true,
      error: new SchedulerUnavailableError(),
    };
    renderPage();
    expect(screen.getByText("scheduler.errors.unavailable")).toBeInTheDocument();
    expectNoReport();
  });

  it("schema_not_ready variant: the transport-mapped 503 envelope renders the SAME unavailable state", () => {
    const mapped = mapGapsInvokeFailure("FunctionsHttpError", 503, {
      error: { code: "schema_not_ready", message: "..." },
    });
    expect(mapped).toBeInstanceOf(SchedulerUnavailableError);
    mocks.shortage = { ...queryState(undefined), isError: true, error: mapped };
    renderPage();
    expect(screen.getByText("scheduler.errors.unavailable")).toBeInTheDocument();
    expectNoReport();
  });
});

describe("state 5 — loading while any enabled query pends", () => {
  it("renders skeletons, never a partial report", () => {
    mocks.hours = { ...queryState(undefined), isLoading: true };
    renderPage();
    expectNoReport();
    expect(screen.queryByText("scheduler.errors.loadFailed")).not.toBeInTheDocument();
    expect(screen.queryByText("scheduler.gaps.empty")).not.toBeInTheDocument();
  });
});

describe("state 6 — non-403 query error (incl. malformed_response)", () => {
  it("renders the destructive alert with Retry; never a report alongside the error", () => {
    mocks.headcount = {
      ...queryState(undefined),
      isError: true,
      error: new SchedulerDataError("malformed_response", "bad payload"),
    };
    renderPage();
    expect(screen.getByText("scheduler.errors.loadFailed")).toBeInTheDocument();
    expectNoReport();
    fireEvent.click(screen.getByText("scheduler.errors.retry"));
    expect(mocks.headcount.refetch).toHaveBeenCalled();
    expect(mocks.bench.refetch).toHaveBeenCalled();
  });
});

describe("state 7 — empty", () => {
  it("all-zero rows render the centered empty message, not an empty report", () => {
    mocks.headcount = queryState({ rows: [] });
    renderPage();
    expect(screen.getByText("scheduler.gaps.empty")).toBeInTheDocument();
    expectNoReport();
  });
});

describe("state 8 — data", () => {
  it("renders the KPI strip and tabs when every query resolved with data", () => {
    renderPage();
    expect(screen.getByTestId("kpi-strip")).toBeInTheDocument();
    expect(screen.getByText("scheduler.gaps.tabs.byCategory")).toBeInTheDocument();
    expect(screen.getByText("scheduler.gaps.tabs.bySkill")).toBeInTheDocument();
    expect(screen.getByText("scheduler.gaps.tabs.bench")).toBeInTheDocument();
    expect(enabledInputs).toContain(true); // hooks enabled for a resolved admin
  });

  it("the window date-picker buttons carry the 44px mobile touch-target minimum with dense desktop sizing (design-system rule)", () => {
    renderPage();
    for (const label of ["engagement.startDate", "engagement.endDate"]) {
      const button = screen.getByLabelText(label);
      expect(button.className).toContain("min-h-[44px]");
      expect(button.className).toContain("sm:min-h-0");
      expect(button.className).toContain("h-8");
    }
  });
});

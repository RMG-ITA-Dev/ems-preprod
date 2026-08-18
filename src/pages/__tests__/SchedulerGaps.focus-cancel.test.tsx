// SchedulerGaps focus-mode + Cancel button (BUG 0817-174). Mocks mirror
// SchedulerGaps.states.test.tsx's data-hook stubs; this file only adds
// the focusMode/Cancel assertions that ladder test doesn't cover.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SchedulerUnavailableError } from "@/hooks/scheduler/schedulerData";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<object>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, focusMode }: { children: React.ReactNode; focusMode?: boolean }) => (
    <div data-testid="app-layout" data-focus-mode={focusMode}>
      {children}
    </div>
  ),
}));

const roleState: { roleKey: string | null; isLoading: boolean; isError: boolean; refetch: () => void } = {
  roleKey: "admin",
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => roleState,
}));

const queryState = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
});
const dataState = () => ({
  headcount: queryState({ rows: [] }),
  hours: queryState({ rows: [] }),
  shortage: queryState({ rows: [], truncated: false, deficitRowCount: 0 }),
  bench: queryState({ rows: [] }),
});
let mocks = dataState();

vi.mock("@/hooks/scheduler/useSchedulerGaps", () => ({
  useCategoryHeadcountGap: () => mocks.headcount,
  useCategoryHoursGap: () => mocks.hours,
  useCompetencyShortage: () => mocks.shortage,
  useBenchVsPipeline: () => mocks.bench,
}));

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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/scheduler/gaps"]}>
        <Routes>
          <Route path="/scheduler/gaps" element={<SchedulerGaps />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks = dataState();
  Object.assign(roleState, { roleKey: "admin", isLoading: false, isError: false });
});

describe("SchedulerGaps focus-cancel (BUG 0817-174)", () => {
  it("TG1-1: AppLayout receives focusMode=true", () => {
    renderPage();
    expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("true");
  });

  it("TG1-2: Cancel button is present in the empty/loaded state", () => {
    renderPage();
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
  });

  it("TG1-3: Cancel button is present in the unavailable state", () => {
    mocks.bench = { ...queryState(undefined), isError: true, error: new SchedulerUnavailableError() };
    renderPage();
    expect(screen.getByText("scheduler.errors.unavailable")).toBeInTheDocument();
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
  });

  it("TG1-4: clicking Cancel navigates to /", () => {
    renderPage();
    fireEvent.click(screen.getByText("common.cancel"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});

// FULL nested navigation loop: L2₀ → Employee → L2₁ → Cancel → Employee →
// Cancel must land on the ORIGINAL L2₀. The single-page tests only prove
// each page keeps its immediate caller; a naive implementation lets the
// inner Cancel remount the Employee page with null state, so its next
// Cancel falls back to L1 instead of L2₀. This suite runs the REAL
// SchedulerL2 + SchedulerStaff pages and the REAL L2StaffGantt +
// StaffEngagementGantt composition layers (only the vendor canvas and
// data hooks are stubbed), so the actual navigation wiring —
// onwardReturnState on both hops, chain restore on both Cancels — is
// exercised end to end.
//
// Fase 3 (plan v2 §2 — Decisión #1, L2 solo lectura): sin
// AssignmentSheet/usePageLeaveLock/mutations (Fase 5); useServices()
// agregado a la lista de hooks mockeados de useEmsData.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EngagementState } from "@/lib/engagementStatus";
import type { EngagementAssignmentRow } from "@/hooks/useEmsData";
import type { StaffTimelineResult } from "@/hooks/scheduler/schedulerData";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// usePageLeaveLock relies on useBlocker, which is only available inside a
// data router. This integration test exercises the navigation chain with the
// declarative MemoryRouter, not the leave-lock behavior itself.
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() },
    allowNextNavigation: vi.fn(),
  }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({
    isAdmin: true,
    isPartner: false,
    isDirector: false,
    isManager: false,
    isSenior: false,
    isLoading: false,
    hasError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCurrentStaff", () => ({ useCurrentStaff: () => ({ staffRecord: null }) }));
// Wide host — the loop is a desktop flow; compact composition is covered
// by the component suite and the browser fixture.
vi.mock("@/hooks/useContainerWidth", () => ({
  useContainerWidth: () => [{ current: null }, 1200] as const,
}));

const queryState = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

const engagement = (id: string, code: string, name: string) => ({
  engagement_id: id,
  engagement_code: code,
  engagement_name: name,
  client_id: "c-1",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  practica: null,
  partner_id: "p-1",
  manager_id: "m-1",
  client: { client_legal_name: "Cliente Uno" },
});
const E0 = engagement("e-0", "Z-000", "Audit Zero");
const E1 = engagement("e-1", "A-001", "Audit One");

const l2Row = (engagementId: string): EngagementAssignmentRow =>
  ({
    assignment_id: `${engagementId}-a1`,
    engagement_id: engagementId,
    staff_id: "s-1",
    category_id: "cat-1",
    start_date: "2026-02-01",
    end_date: "2026-06-30",
    hours_per_week: 40,
    allocation_percent: 100,
    notes: null,
    status: "PROPOSED",
    staff: {
      staff_id: "s-1",
      first_name: "Dana",
      last_name: "Linarez",
      short_name: "DL",
      category_id: "cat-1",
    },
    category: { category_id: "cat-1", category_name: "Senior" },
  }) as unknown as EngagementAssignmentRow;

vi.mock("@/hooks/useEmsData", async () => {
  const actual = await vi.importActual<object>("@/hooks/useEmsData");
  return {
    ...actual,
    useEngagements: () => queryState([E0, E1]),
    useEngagementAssignments: (id: string | undefined) =>
      queryState(id ? [l2Row(id)] : []),
    useEngagementAggregatedRequirements: () => queryState([]),
    useActiveStaffWithSkills: () => queryState([]),
    useServices: () => queryState([]),
    useCategories: () => queryState([]),
  };
});
vi.mock("@/hooks/scheduler/useStaffFirmwideAssignmentCounts", () => ({
  useStaffFirmwideAssignmentCounts: () => ({
    ...{ data: { rows: [] }, isLoading: false, isError: false, refetch: vi.fn() },
    isSuccess: true,
    error: null,
  }),
}));

const TIMELINE: StaffTimelineResult = {
  staff: {
    staff_id: "s-1",
    first_name: "Dana",
    last_name: "Linarez",
    short_name: "DL",
    weekly_capacity_hours: 40,
  },
  rows: [
    {
      assignment_id: "t-1",
      engagement_id: "e-1",
      start_date: "2026-02-01",
      end_date: "2026-06-30",
      hours_per_week: 40,
      allocation_percent: 100,
      status: "PROPOSED",
      engagement_code: "A-001",
      engagement_name: "Audit One",
      engagement_status: EngagementState.Aprobado,
      client_name: "Cliente Uno",
      out_of_scope: false,
      manager_name: null,
    },
  ],
  hiddenEngagementCount: 0,
  truncated: false,
  utilization: [],
};
vi.mock("@/hooks/scheduler/useSchedulerStaffTimeline", () => ({
  useSchedulerStaffTimeline: () => ({
    data: TIMELINE,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// The ONLY scheduler-composition stub: the vendor canvas. It renders each
// column cell so the REAL L2StaffGantt name buttons and the REAL
// StaffEngagementGantt engagement labels stay clickable.
type CellFC = React.FC<{ row: { id: string } }>;
vi.mock("@/components/scheduler/GanttCanvas", () => ({
  GanttCanvas: (props: {
    rows: Array<{ id: string }>;
    columns: false | Array<{ cell: CellFC }>;
  }) => {
    const Cell = props.columns ? props.columns[0].cell : null;
    return (
      <div data-testid="canvas">
        {Cell &&
          props.rows.map((r) => (
            <div key={r.id} data-testid={`cell-${r.id}`}>
              <Cell row={{ id: r.id }} />
            </div>
          ))}
      </div>
    );
  },
}));

import SchedulerL2 from "../SchedulerL2";
import SchedulerStaff from "../SchedulerStaff";

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // TooltipProvider mirrors App.tsx — the REAL MatchDot inside the real
  // L2StaffGantt cell renders a Radix Tooltip.
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/scheduler/engagement/e-0"]}>
          <Routes>
            <Route path="/scheduler/engagement/:id" element={<SchedulerL2 />} />
            <Route path="/scheduler/staff/:id" element={<SchedulerStaff />} />
            <Route path="/scheduler" element={<div data-testid="l1-probe" />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("full L2 ⇄ Employee-Gantt Cancel loop", () => {
  it("L2₀ → Employee → L2₁ → Cancel → Employee → Cancel lands on the ORIGINAL L2₀", () => {
    renderApp();
    // At L2₀.
    expect(screen.getByRole("heading", { name: /Audit Zero/ })).toBeInTheDocument();

    // Hop 1: staff-name click → Employee Gantt.
    fireEvent.click(screen.getByText("Dana Linarez"));
    expect(screen.getByRole("heading", { name: /Dana Linarez/ })).toBeInTheDocument();

    // Hop 2: engagement label → L2₁ (a DIFFERENT engagement).
    fireEvent.click(screen.getByText("Audit One"));
    expect(screen.getByRole("heading", { name: /Audit One/ })).toBeInTheDocument();

    // Unwind 1: L2₁ Cancel → back on the Employee Gantt.
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByRole("heading", { name: /Dana Linarez/ })).toBeInTheDocument();

    // Unwind 2 — THE regression: Employee Cancel must reach L2₀,
    // not the /scheduler fallback.
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByRole("heading", { name: /Audit Zero/ })).toBeInTheDocument();
    expect(screen.queryByTestId("l1-probe")).not.toBeInTheDocument();
  });

  it("a control change on the INNER L2 does not break the unwind", () => {
    renderApp();
    fireEvent.click(screen.getByText("Dana Linarez"));
    fireEvent.click(screen.getByText("Audit One"));
    // Change L2₁'s zoom — the replace-navigation nulls location.state.
    fireEvent.click(screen.getByText("scheduler.gantt.zoom.weeks"));
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByRole("heading", { name: /Dana Linarez/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByRole("heading", { name: /Audit Zero/ })).toBeInTheDocument();
  });

  it("without an inbound chain, the Employee Cancel still falls back to L1", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/scheduler/staff/s-1"]}>
          <Routes>
            <Route path="/scheduler/staff/:id" element={<SchedulerStaff />} />
            <Route path="/scheduler" element={<div data-testid="l1-probe" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByTestId("l1-probe")).toBeInTheDocument();
  });
});

// SchedulerL2 integration-state regressions: the page must not render a
// usable schedule while ANY of its data queries is pending or failed — a
// pending requirements query would otherwise paint fake-neutral match
// dots, and a failed assignments query would read as "no assignments".
//
// Fase 3 (plan v2 §2 — Decisión #1, L2 solo lectura): no hay
// AssignmentSheet, ni usePageLeaveLock/LeavePageDialog, ni atajo `n`, ni
// onEdit/canWrite/allAssignments en L2StaffGantt — todo eso es Fase 5.
// Se agregó useServices() (issue §11, resolver categorías por servicio),
// así que el gate de carga ahora cubre SEIS queries, no cinco.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EngagementAssignmentRow } from "@/hooks/useEmsData";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({
    isAdmin: true,
    isPartner: false,
    isDirector: false,
    isManager: false,
    isSenior: false,
  }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

// Controllable query states — each test overrides what it needs.
const queryState = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

const ENGAGEMENT = {
  engagement_id: "e-1",
  engagement_code: "A-001",
  engagement_name: "Audit One",
  client_id: "c-1",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  practica: null,
  partner_id: "p-1",
  manager_id: "m-1",
  client: { client_legal_name: "Cliente Uno" },
};

const row = (id: string, categoryId: string): EngagementAssignmentRow =>
  ({
    assignment_id: id,
    engagement_id: "e-1",
    staff_id: `s-${id}`,
    category_id: categoryId,
    start_date: "2026-02-01",
    end_date: "2026-06-30",
    hours_per_week: 40,
    allocation_percent: 100,
    notes: null,
    status: "PROPOSED",
    staff: {
      staff_id: `s-${id}`,
      first_name: "Staff",
      last_name: id,
      short_name: null,
      category_id: categoryId,
    },
    category: { category_id: categoryId, category_name: `Cat ${categoryId}` },
  }) as unknown as EngagementAssignmentRow;

const ROWS = [row("a1", "cat-1"), row("a2", "cat-2")];

const mocks = {
  engagements: queryState([ENGAGEMENT]),
  assignments: queryState(ROWS),
  requirements: queryState([]),
  staff: queryState([]),
  services: queryState([]),
  categories: queryState([]),
  load: { ...queryState({ rows: [] }), isSuccess: true, error: null },
};

vi.mock("@/hooks/useEmsData", async () => {
  const actual = await vi.importActual<object>("@/hooks/useEmsData");
  return {
    ...actual,
    useEngagements: () => mocks.engagements,
    useEngagementAssignments: () => mocks.assignments,
    useEngagementAggregatedRequirements: () => mocks.requirements,
    useActiveStaffWithSkills: () => mocks.staff,
    useServices: () => mocks.services,
    useCategories: () => mocks.categories,
  };
});

vi.mock("@/hooks/scheduler/useStaffFirmwideAssignmentCounts", () => ({
  useStaffFirmwideAssignmentCounts: () => mocks.load,
}));

// Lightweight stub capturing the props the page wires in (read-only L2:
// no onEdit / canWrite / allAssignments).
const ganttProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/scheduler/L2StaffGantt", () => ({
  L2StaffGantt: (props: Record<string, unknown>) => {
    ganttProps.push(props);
    return <div data-testid="l2gantt" />;
  },
}));

import SchedulerL2 from "../SchedulerL2";

function renderPage(
  entry: string | { pathname: string; state?: unknown } = "/scheduler/engagement/e-1"
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/scheduler/engagement/:id" element={<SchedulerL2 />} />
          {/* Cancel destinations. */}
          <Route path="/scheduler/staff/:id" element={<div data-testid="staff-probe" />} />
          <Route path="/scheduler" element={<div data-testid="l1-probe" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const lastGantt = () => ganttProps[ganttProps.length - 1];

beforeEach(() => {
  ganttProps.length = 0;
  mocks.engagements = queryState([ENGAGEMENT]);
  mocks.assignments = queryState(ROWS);
  mocks.requirements = queryState([]);
  mocks.staff = queryState([]);
  mocks.services = queryState([]);
  mocks.categories = queryState([]);
  mocks.load = { ...queryState({ rows: [] }), isSuccess: true, error: null };
});

describe("SchedulerL2 loading gate covers ALL SIX queries", () => {
  it("renders the schedule only when every query has resolved", () => {
    renderPage();
    expect(screen.getByTestId("l2gantt")).toBeInTheDocument();
  });

  it.each([
    ["requirements", () => (mocks.requirements = { ...queryState(undefined), isLoading: true })],
    ["staff/skills", () => (mocks.staff = { ...queryState(undefined), isLoading: true })],
    ["services", () => (mocks.services = { ...queryState(undefined), isLoading: true })],
    ["categories", () => (mocks.categories = { ...queryState(undefined), isLoading: true })],
  ])(
    "stays in the loading state while %s is still pending (no neutral dots, no schedule)",
    (_name, arrange) => {
      arrange();
      renderPage();
      expect(screen.queryByTestId("l2gantt")).not.toBeInTheDocument();
      expect(screen.queryByText("engagement.assignments.empty")).not.toBeInTheDocument();
    }
  );

  it.each([
    ["assignments", () => (mocks.assignments = { ...queryState(undefined), isError: true })],
    ["requirements", () => (mocks.requirements = { ...queryState(undefined), isError: true })],
    ["staff/skills", () => (mocks.staff = { ...queryState(undefined), isError: true })],
    ["services", () => (mocks.services = { ...queryState(undefined), isError: true })],
    ["categories", () => (mocks.categories = { ...queryState(undefined), isError: true })],
    ["engagements", () => (mocks.engagements = { ...queryState(undefined), isError: true })],
  ])("a failed %s query is a terminal ERROR — never an empty schedule", (_name, arrange) => {
    arrange();
    renderPage();
    expect(screen.getByText("scheduler.errors.loadFailed")).toBeInTheDocument();
    expect(screen.getByText("scheduler.errors.retry")).toBeInTheDocument();
    expect(screen.queryByTestId("l2gantt")).not.toBeInTheDocument();
    expect(screen.queryByText("engagement.assignments.empty")).not.toBeInTheDocument();
  });
});

describe("Cancel keeps the Employee-Gantt caller after control changes", () => {
  it("a zoom change must NOT erase returnTo — Cancel still reaches the caller", () => {
    renderPage({
      pathname: "/scheduler/engagement/e-1",
      state: { returnTo: "/scheduler/staff/s-7?zoom=months" },
    });
    // setSearchParams(..., { replace: true }) creates a location with
    // state:null — the page must have captured returnTo before that.
    fireEvent.click(screen.getByText("scheduler.gantt.zoom.weeks"));
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByTestId("staff-probe")).toBeInTheDocument();
  });

  it("without a caller, Cancel falls back to the L1 Gantt", () => {
    renderPage();
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByTestId("l1-probe")).toBeInTheDocument();
  });
});

describe("read-only display filtering", () => {
  it("the category filter narrows the displayed rows passed to L2StaffGantt", () => {
    renderPage("/scheduler/engagement/e-1?category=cat-1");
    const props = lastGantt();
    expect(
      (props.assignments as EngagementAssignmentRow[]).map((r) => r.assignment_id)
    ).toEqual(["a1"]);
  });

  it("always shows the read-only note in the header (write is disabled for every role in this phase)", () => {
    renderPage();
    expect(screen.getByText(/scheduler\.readOnly/)).toBeInTheDocument();
  });
});

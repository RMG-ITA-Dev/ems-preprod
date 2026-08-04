// SchedulerL2 integration-state regressions: the page must not render a
// usable schedule while ANY of its data queries is pending or failed — a
// pending requirements query would otherwise paint fake-neutral match
// dots, and a failed assignments query would read as "no assignments".
//
// Fase 5 (bugs/scheduler/fase_5/plan_v2.md §5): la superficie de escritura
// ahora se monta de verdad (AssignmentSheet, botón "+ Agregar staff",
// usePageLeaveLock/LeavePageDialog) — `canWrite` gatea controles reales, no
// solo la nota "solo lectura". Se agregó useServices() (issue §11, resolver
// categorías por servicio) desde Fase 3, así que el gate de carga sigue
// cubriendo SEIS queries.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
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

let mockRole: { isAdmin: boolean; isPartner?: boolean; isDirector?: boolean; isManager?: boolean; isSenior?: boolean } = {
  isAdmin: true,
  isPartner: false,
  isDirector: false,
  isManager: false,
  isSenior: false,
};
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => mockRole,
}));

let mockStaffRecord: { staff_id: string } | null = null;
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: mockStaffRecord }),
}));

// usePageLeaveLock's useBlocker requires a data router — this file's declarative
// MemoryRouter/Routes doesn't provide one. Same convention as WorkOrderEdit.*.test.tsx: mock it
// out for state-gating tests that don't exercise the leave-lock itself.
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() },
    allowNextNavigation: vi.fn(),
  }),
}));

// AssignmentSheet now mounts unconditionally (closed by default) — its mutation hook must not
// hit a real RPC in these state-gating tests.
vi.mock("@/hooks/mutations", () => ({
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
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
      <TooltipProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/scheduler/engagement/:id" element={<SchedulerL2 />} />
            {/* Cancel destinations. */}
            <Route path="/scheduler/staff/:id" element={<div data-testid="staff-probe" />} />
            <Route path="/scheduler" element={<div data-testid="l1-probe" />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
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
  mockRole = { isAdmin: true, isPartner: false, isDirector: false, isManager: false, isSenior: false };
  mockStaffRecord = null;
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
});

// Fase 5: `canWrite` now gates real controls (the "+ Agregar staff" button, L2StaffGantt's
// canWrite prop) — it mirrors is_engagement_responsible exactly (admin OR manager/partner/sqr/
// encargado/specialist_it/specialist_tax of THIS engagement).
describe("write authorization (Fase 5 — is_engagement_responsible mirror)", () => {
  it("admin: sees '+ Agregar staff' and no read-only note; L2StaffGantt receives canWrite=true", () => {
    mockRole = { isAdmin: true };
    renderPage();
    expect(screen.getByText("scheduler.l2.addStaff")).toBeInTheDocument();
    expect(screen.queryByText(/scheduler\.readOnly/)).not.toBeInTheDocument();
    expect(lastGantt().canWrite).toBe(true);
  });

  it("the engagement's manager (structural responsible) can write", () => {
    // canView (L2 entry, O8) still gates on the ORG role name "manager" — being the
    // is_engagement_responsible manager_id of this engagement implies holding that role.
    mockRole = { isAdmin: false, isManager: true };
    mockStaffRecord = { staff_id: "m-1" }; // ENGAGEMENT.manager_id
    renderPage();
    expect(screen.getByText("scheduler.l2.addStaff")).toBeInTheDocument();
    expect(lastGantt().canWrite).toBe(true);
  });

  it("a bystander role (not responsible, not admin) sees the read-only note and no add button", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: true, isSenior: false };
    mockStaffRecord = { staff_id: "unrelated-staff" };
    renderPage();
    expect(screen.getByText(/scheduler\.readOnly/)).toBeInTheDocument();
    expect(screen.queryByText("scheduler.l2.addStaff")).not.toBeInTheDocument();
    expect(lastGantt().canWrite).toBe(false);
  });

  it("clicking '+ Agregar staff' opens the AssignmentSheet in add mode", () => {
    mockRole = { isAdmin: true };
    renderPage();
    fireEvent.click(screen.getByText("scheduler.l2.addStaff"));
    expect(screen.getByText("scheduler.assignmentSheet.title")).toBeInTheDocument();
    expect(screen.getByText("engagement.assignments.selectStaff")).toBeInTheDocument();
  });

  it("L2StaffGantt receives the full (unfiltered) assignments snapshot separately via allAssignments — canWrite propagates even when the category filter narrows the display", () => {
    mockRole = { isAdmin: true };
    renderPage("/scheduler/engagement/e-1?category=cat-1");
    const props = lastGantt();
    expect((props.assignments as EngagementAssignmentRow[]).map((r) => r.assignment_id)).toEqual(["a1"]);
    // Fase 7 (gantt_drag_resize_plan.md): allAssignments es el snapshot COMPLETO — el commit de
    // drag/resize valida overlap contra esto, nunca contra la vista filtrada.
    expect((props.allAssignments as EngagementAssignmentRow[]).map((r) => r.assignment_id)).toEqual([
      "a1",
      "a2",
    ]);
    expect(props.canWrite).toBe(true);
    expect(typeof props.onOpenSheet).toBe("function");
  });
});

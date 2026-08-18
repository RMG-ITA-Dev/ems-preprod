// SchedulerStaff state-ladder regressions: the page must resolve the
// role before deciding Forbidden, keep Unavailable ≠ Empty ≠ Error
// distinct, always render the Cancel escape hatch, and show the
// hidden-count notice even when zero rows are visible — an "empty" view
// with hidden engagements must not read as idle.
//
// Fase 3 (plan v2 §1): engagement_status es el ESTADO EFECTIVO numérico.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EngagementState } from "@/lib/engagementStatus";
import {
  SchedulerDataError,
  SchedulerUnavailableError,
  type StaffTimelineResult,
} from "@/hooks/scheduler/schedulerData";

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

const role: { roleKey: string | null; isLoading: boolean; isError: boolean; refetch: () => void } = {
  roleKey: "admin",
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => role,
}));

const timeline: {
  data: StaffTimelineResult | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
} = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};
vi.mock("@/hooks/scheduler/useSchedulerStaffTimeline", () => ({
  useSchedulerStaffTimeline: () => timeline,
}));

const ganttProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/scheduler/StaffEngagementGantt", () => ({
  StaffEngagementGantt: (props: Record<string, unknown>) => {
    ganttProps.push(props);
    return <div data-testid="staff-gantt" />;
  },
}));

import SchedulerStaff from "../SchedulerStaff";

const STAFF = {
  staff_id: "s-1",
  first_name: "Daniela",
  last_name: "Linarez",
  short_name: "DL",
  weekly_capacity_hours: 40,
};

const SEGMENT = {
  assignment_id: "a-1",
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
};

const result = (over: Partial<StaffTimelineResult> = {}): StaffTimelineResult => ({
  staff: STAFF,
  rows: [SEGMENT],
  hiddenEngagementCount: 0,
  truncated: false,
  utilization: [
    {
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      total_allocation_percent: 100,
      total_hours_per_week: 40,
    },
  ],
  ...over,
});

function renderPage(
  entry: string | { pathname: string; state?: unknown } = "/scheduler/staff/s-1"
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/scheduler/staff/:id" element={<SchedulerStaff />} />
          {/* Cancel destinations. */}
          <Route path="/scheduler/engagement/:id" element={<div data-testid="l2-probe" />} />
          <Route path="/scheduler" element={<div data-testid="l1-probe" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  ganttProps.length = 0;
  Object.assign(role, {
    roleKey: "admin",
    isLoading: false,
    isError: false,
  });
  Object.assign(timeline, {
    data: result(),
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe("SchedulerStaff role ladder", () => {
  it("renders the gantt with the employee header when everything resolves", () => {
    renderPage();
    expect(screen.getByTestId("staff-gantt")).toBeInTheDocument();
    expect(screen.getByText("Daniela Linarez")).toBeInTheDocument();
  });

  it("BUG 0817-174: AppLayout receives focusMode=true", () => {
    renderPage();
    expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("true");
  });

  it("a resolved non-scheduler role is Forbidden — never the schedule", () => {
    role.roleKey = null; // no role_key → canView false
    renderPage();
    expect(screen.getByText("scheduler.staff.forbidden")).toBeInTheDocument();
    expect(screen.queryByTestId("staff-gantt")).not.toBeInTheDocument();
  });

  it("waits for role resolution — no Forbidden flash while loading", () => {
    role.roleKey = null;
    role.isLoading = true;
    renderPage();
    expect(screen.queryByText("scheduler.staff.forbidden")).not.toBeInTheDocument();
    expect(screen.queryByTestId("staff-gantt")).not.toBeInTheDocument();
  });

  it("a role-query error is an ERROR with Retry, not a silent Forbidden", () => {
    role.roleKey = null;
    role.isError = true;
    renderPage();
    expect(screen.getByText("scheduler.errors.loadFailed")).toBeInTheDocument();
    expect(screen.getByText("scheduler.errors.retry")).toBeInTheDocument();
    expect(screen.queryByText("scheduler.staff.forbidden")).not.toBeInTheDocument();
  });
});

describe("SchedulerStaff query ladder (Unavailable ≠ Empty ≠ Error)", () => {
  it.each([
    ["server forbidden", new SchedulerDataError("forbidden", "no"), "scheduler.staff.forbidden"],
    ["staff not found", new SchedulerDataError("not_found", "no"), "scheduler.staff.notFound"],
    ["function unavailable", new SchedulerUnavailableError(), "scheduler.errors.unavailable"],
  ])("%s renders its DISTINCT state", (_name, error, key) => {
    Object.assign(timeline, { data: undefined, isError: true, error });
    renderPage();
    expect(screen.getByText(key)).toBeInTheDocument();
    expect(screen.queryByTestId("staff-gantt")).not.toBeInTheDocument();
    expect(screen.queryByText("scheduler.staff.empty")).not.toBeInTheDocument();
  });

  it("other failures are an ERROR with Retry — never an empty timeline", () => {
    Object.assign(timeline, {
      data: undefined,
      isError: true,
      error: new SchedulerDataError("query_failed", "boom"),
    });
    renderPage();
    expect(screen.getByText("scheduler.errors.loadFailed")).toBeInTheDocument();
    expect(screen.getByText("scheduler.errors.retry")).toBeInTheDocument();
    expect(screen.queryByText("scheduler.staff.empty")).not.toBeInTheDocument();
  });

  it("zero visible rows renders Empty — WITH the hidden-count notice", () => {
    timeline.data = result({ rows: [], hiddenEngagementCount: 2 });
    renderPage();
    expect(screen.getByText("scheduler.staff.empty")).toBeInTheDocument();
    expect(screen.getByText("scheduler.staff.hidden")).toBeInTheDocument();
    expect(screen.queryByTestId("staff-gantt")).not.toBeInTheDocument();
  });

  it("data + hidden engagements renders BOTH the gantt and the notice", () => {
    timeline.data = result({ hiddenEngagementCount: 1 });
    renderPage();
    expect(screen.getByTestId("staff-gantt")).toBeInTheDocument();
    expect(screen.getByText("scheduler.staff.hidden")).toBeInTheDocument();
  });

  it("no hidden engagements → no notice", () => {
    renderPage();
    expect(screen.queryByText("scheduler.staff.hidden")).not.toBeInTheDocument();
  });

  it("a reversed window is a user-input notice, not an error ladder", () => {
    renderPage("/scheduler/staff/s-1?from=2026-12-31&to=2026-01-01");
    expect(screen.getByText("scheduler.gaps.invalidRange")).toBeInTheDocument();
    expect(screen.queryByTestId("staff-gantt")).not.toBeInTheDocument();
    expect(screen.queryByText("scheduler.errors.retry")).not.toBeInTheDocument();
  });
});

describe("Cancel keeps the caller after URL-canonical control changes", () => {
  it("a zoom change must NOT erase returnTo — Cancel still reaches the caller L2", () => {
    renderPage({
      pathname: "/scheduler/staff/s-1",
      state: { returnTo: "/scheduler/engagement/e-9?zoom=weeks" },
    });
    // setSearchParams(..., { replace: true }) creates a location with
    // state:null — the page must have captured returnTo before that.
    fireEvent.click(screen.getByText("scheduler.gantt.zoom.weeks"));
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByTestId("l2-probe")).toBeInTheDocument();
  });

  it("without a caller, Cancel falls back to the L1 Gantt", () => {
    renderPage();
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByTestId("l1-probe")).toBeInTheDocument();
  });
});

describe("SchedulerStaff escape hatch", () => {
  it.each([
    ["forbidden", () => { role.roleKey = null; }],
    ["role loading", () => { role.isLoading = true; }],
    [
      "unavailable",
      () =>
        Object.assign(timeline, {
          data: undefined,
          isError: true,
          error: new SchedulerUnavailableError(),
        }),
    ],
    ["data", () => {}],
  ])("Cancel is present in the %s state", (_name, arrange) => {
    arrange();
    renderPage();
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
  });
});

// StaffEngagementGantt composition regressions: at or below SVAR's
// hardcoded 650px compact threshold the vendor coerces displayMode "all"
// → "grid", leaving a 0px-wide timeline — so the compact composition is
// one pane at a time with an EMS toggle, TIMELINE (chart, columns
// dropped) by default. The decision is made from the CONTAINER width
// (ResizeObserver), never the viewport: an expanded sidebar leaves a
// sub-650px host at 768–1000px viewports. The actual pane GEOMETRY is
// asserted in a real browser by tools/scheduler-fixture/assert-offline.mjs
// across real layout widths; this suite locks the config the component
// emits per host width plus the row/bar → L2 navigation.
//
// Fase 3 (plan v2 §1): engagement_status es el ESTADO EFECTIVO numérico
// (EngagementState), no el enum legacy de 4 valores.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { EngagementState } from "@/lib/engagementStatus";
import type { StaffTimelineSegmentRow } from "@/hooks/scheduler/schedulerData";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

let containerWidth: number | null = 1200;
vi.mock("@/hooks/useContainerWidth", () => ({
  useContainerWidth: () => [{ current: null }, containerWidth] as const,
}));

type CellFC = React.FC<{ row: { id: string } }>;
interface CapturedProps {
  rows: Array<{ id: string; label: string; start: string; end: string; type: string }>;
  columns: false | Array<{ width?: number; flexgrow?: number; cell: CellFC }>;
  readonly?: boolean;
  displayMode?: string;
  onBarCommit?: unknown;
  onBarOpen?: (id: string) => void;
}
const captured: CapturedProps[] = [];
vi.mock("../GanttCanvas", () => ({
  GanttCanvas: (props: CapturedProps) => {
    captured.push(props);
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

import { StaffEngagementGantt } from "../StaffEngagementGantt";

const seg = (over: Partial<StaffTimelineSegmentRow>): StaffTimelineSegmentRow => ({
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
  ...over,
});

const BANDS = [
  { start_date: "2026-01-01", end_date: "2026-01-31", total_allocation_percent: 50, total_hours_per_week: 20 },
  { start_date: "2026-02-01", end_date: "2026-06-30", total_allocation_percent: 100, total_hours_per_week: 40 },
  { start_date: "2026-07-01", end_date: "2026-12-31", total_allocation_percent: 150, total_hours_per_week: 60 },
];

// Two segments on e-1 (group + continuation), one on e-2, and an
// OUT-OF-SCOPE engagement e-3 (purple context row).
const ROWS: StaffTimelineSegmentRow[] = [
  seg({}),
  seg({ assignment_id: "a-2", start_date: "2026-08-01", end_date: "2026-10-31" }),
  seg({
    assignment_id: "a-3",
    engagement_id: "e-2",
    engagement_code: null,
    engagement_name: "Tax Review",
    engagement_status: EngagementState.Finalizado,
    client_name: null,
  }),
  seg({
    assignment_id: "a-4",
    engagement_id: "e-3",
    engagement_code: "X-777",
    engagement_name: "Fiscalía Especial",
    engagement_status: EngagementState.Aprobado,
    client_name: null,
    out_of_scope: true,
    manager_name: "Abraham Mamani",
  }),
];

function L2Probe() {
  const { id } = useParams<{ id: string }>();
  return <div data-testid="l2-probe">{id}</div>;
}

function renderGantt(bands = BANDS) {
  return render(
    <MemoryRouter initialEntries={["/scheduler/staff/s-1?zoom=months"]}>
      <Routes>
        <Route
          path="/scheduler/staff/:id"
          element={
            <StaffEngagementGantt
              rows={ROWS}
              from="2026-01-01"
              to="2026-12-31"
              zoom="months"
              utilization={bands}
              capacityHours={40}
              returnNav={null}
            />
          }
        />
        <Route path="/scheduler/engagement/:id" element={<L2Probe />} />
      </Routes>
    </MemoryRouter>
  );
}

const lastProps = () => captured[captured.length - 1];

beforeEach(() => {
  captured.length = 0;
  containerWidth = 1200;
});

describe("container-width pane composition", () => {
  it("wide host: both panes (displayMode 'all') with the flexible label column; no pane toggle", () => {
    renderGantt();
    expect(lastProps().displayMode).toBe("all");
    const cols = lastProps().columns;
    expect(cols).not.toBe(false);
    expect((cols as Exclude<typeof cols, false>)[0].flexgrow).toBe(1);
    expect(screen.queryByText("scheduler.staff.timeline")).not.toBeInTheDocument();
  });

  it("sub-threshold host (416px — the expanded-sidebar 768px viewport): TIMELINE pane, grid dropped", () => {
    containerWidth = 416;
    renderGantt();
    expect(lastProps().displayMode).toBe("chart");
    // columns:false — the vendor's compact coercion cannot resurrect a
    // grid that has no columns, so the timeline gets the full host.
    expect(lastProps().columns).toBe(false);
    expect(screen.getByText("scheduler.staff.timeline")).toBeInTheDocument();
  });

  it("the boundary matches SVAR's compact switch: 650 is compact, 651 is not", () => {
    containerWidth = 650;
    renderGantt();
    expect(lastProps().displayMode).toBe("chart");
    captured.length = 0;
    containerWidth = 651;
    renderGantt();
    expect(lastProps().displayMode).toBe("all");
  });

  it("no canvas mounts before the first width measurement (no wrong-composition flash)", () => {
    containerWidth = null;
    renderGantt();
    expect(captured).toHaveLength(0);
    expect(screen.queryByTestId("canvas")).not.toBeInTheDocument();
  });

  it("compact toggle switches to the engagement list (grid pane) and back", () => {
    containerWidth = 416;
    renderGantt();
    fireEvent.click(screen.getByText("scheduler.staff.engagements"));
    expect(lastProps().displayMode).toBe("grid");
    expect(lastProps().columns).not.toBe(false);
    // Row-action buttons (L2 navigation) are available in the list pane.
    expect(screen.getByTestId("cell-a-1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("scheduler.staff.timeline"));
    expect(lastProps().displayMode).toBe("chart");
  });
});

describe("row model and read-only contract", () => {
  it("one bar per segment: assignment dates, engagement label, engagement-status color", () => {
    renderGantt();
    const rows = lastProps().rows;
    expect(rows.map((r) => r.id)).toEqual(["a-1", "a-2", "a-3", "a-4"]);
    expect(rows[0]).toMatchObject({
      label: "Audit One",
      start: "2026-02-01",
      end: "2026-06-30",
      type: "ems-status-active",
    });
    expect(rows[2].type).toBe("ems-status-completed");
  });

  it("out-of-scope bars wear PURPLE, not status colors", () => {
    renderGantt();
    expect(lastProps().rows[3].type).toBe("ems-out-of-scope");
  });

  it("read-only: no bar commits are wired", () => {
    renderGantt();
    expect(lastProps().readonly).toBe(true);
    expect(lastProps().onBarCommit).toBeUndefined();
  });

  it("group's first row carries the engagement identity; continuation rows show segment dates", () => {
    renderGantt();
    const first = screen.getByTestId("cell-a-1");
    expect(first.textContent).toContain("A-001");
    expect(first.textContent).toContain("Audit One");
    expect(first.textContent).toContain("Cliente Uno");
    // dd/MM/yyyy per the repository-wide date rule.
    expect(screen.getByTestId("cell-a-2").textContent).toContain("01/08/2026 → 31/10/2026");
    // A different engagement starts its own group.
    expect(screen.getByTestId("cell-a-3").textContent).toContain("Tax Review");
  });
});

describe("navigation to the engagement L2", () => {
  it("clicking the engagement label navigates to that engagement's L2", () => {
    renderGantt();
    fireEvent.click(screen.getByTestId("cell-a-1").querySelector("button")!);
    expect(screen.getByTestId("l2-probe").textContent).toBe("e-1");
  });

  it("clicking a continuation-row date button navigates to the same L2", () => {
    renderGantt();
    fireEvent.click(screen.getByTestId("cell-a-2").querySelector("button")!);
    expect(screen.getByTestId("l2-probe").textContent).toBe("e-1");
  });

  it("a bar open resolves the segment's engagement and navigates", () => {
    renderGantt();
    act(() => lastProps().onBarOpen!("a-3"));
    expect(screen.getByTestId("l2-probe").textContent).toBe("e-2");
  });
});

describe("out-of-scope context rows", () => {
  it("show the engagement's proper name and ITS manager — no client, no button", () => {
    renderGantt();
    const cell = screen.getByTestId("cell-a-4");
    expect(cell.textContent).toContain("X-777");
    expect(cell.textContent).toContain("Fiscalía Especial");
    expect(cell.textContent).toContain("scheduler.staff.managedBy");
    expect(cell.querySelector("button")).toBeNull();
  });

  it("an out-of-scope bar open does NOT navigate (the L2 preflight would 403)", () => {
    renderGantt();
    act(() => lastProps().onBarOpen!("a-4"));
    expect(screen.queryByTestId("l2-probe")).not.toBeInTheDocument();
  });
});

describe("utilization total line", () => {
  it("renders one colored band per stretch with the tolerance-band levels", () => {
    renderGantt();
    const strip = screen.getByTestId("utilization-strip");
    const bands = strip.querySelectorAll("[role='img']");
    expect(bands).toHaveLength(3);
    expect(bands[0].className).toContain("bg-warning"); // 50% under
    expect(bands[1].className).toContain("bg-success"); // 100% ok
    expect(bands[2].className).toContain("bg-destructive"); // 150% over
    expect(strip.textContent).toContain("50%");
    expect(strip.textContent).toContain("100%");
    expect(strip.textContent).toContain("150%");
    expect(strip.textContent).toContain("scheduler.staff.total");
  });

  it("accompanies the compact TIMELINE pane but not the list pane", () => {
    containerWidth = 416;
    renderGantt();
    expect(screen.getByTestId("utilization-strip")).toBeInTheDocument();
    fireEvent.click(screen.getByText("scheduler.staff.engagements"));
    expect(screen.queryByTestId("utilization-strip")).not.toBeInTheDocument();
  });

  it("narrow bands degrade to a COMPACT numeral, never straight to color-only", () => {
    // months zoom ≈ 8.57px/day: 3 days ≈ 26px — too narrow for "150%"
    // (30px) but wide enough for "150" (24px). The full form stays in
    // the aria-label.
    renderGantt([
      { start_date: "2026-01-01", end_date: "2026-06-30", total_allocation_percent: 100, total_hours_per_week: 40 },
      { start_date: "2026-07-01", end_date: "2026-07-03", total_allocation_percent: 150, total_hours_per_week: 60 },
      { start_date: "2026-07-04", end_date: "2026-12-31", total_allocation_percent: 100, total_hours_per_week: 40 },
    ]);
    const strip = screen.getByTestId("utilization-strip");
    const bands = [...strip.querySelectorAll("[role='img']")];
    // The 150% band is the only OVER-level one — find it by level.
    const narrow = bands.find((b) =>
      b.getAttribute("aria-label")?.includes("scheduler.staff.utilization.over")
    )!;
    expect(narrow).toBeDefined();
    expect(narrow.textContent).toBe("150");
  });
});

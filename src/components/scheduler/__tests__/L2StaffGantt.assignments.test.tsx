// Fase 5 (bugs/scheduler/fase_5/plan_v2.md §5, Decisión #1): AssignmentSheet/menu write surface
// — click en la barra (onBarOpen) o el menú de fila's Edit/Delete (gated por canWrite) abren el
// Sheet. Fase 7 (bugs/scheduler/fase_7/gantt_drag_resize_plan.md) supera la guardia del canvas
// SIEMPRE readonly: ahora refleja `!canWrite || isSaving` — el rollback transaccional del drag se
// prueba por separado en L2StaffGantt.dragResize.test.tsx (el gate que habilitó este cambio). Same
// GanttCanvas-mocking convention as StaffEngagementGantt.test.tsx.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { EngagementAssignmentRow, StaffWithSkills } from "@/hooks/useEmsData";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "viewer-1" } }) }));

if (typeof window !== "undefined") {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => undefined;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => undefined;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

type CellFC = React.FC<{ row: { id: string } }>;
interface CapturedProps {
  rows: Array<{ id: string }>;
  columns: false | Array<{ cell: CellFC }>;
  readonly?: boolean;
  onBarOpen?: (id: string) => void;
}
const captured: CapturedProps[] = [];
vi.mock("../GanttCanvas", () => ({
  GanttCanvas: (props: CapturedProps) => {
    captured.push(props);
    const Cell = props.columns ? props.columns[0].cell : null;
    return (
      <div data-testid="canvas" data-readonly={String(props.readonly)}>
        {Cell &&
          props.rows.map((r) => (
            <button
              key={r.id}
              type="button"
              data-testid={`bar-${r.id}`}
              onClick={() => props.onBarOpen?.(r.id)}
            >
              <Cell row={{ id: r.id }} />
            </button>
          ))}
      </div>
    );
  },
}));

import { L2StaffGantt } from "../L2StaffGantt";

const ENGAGEMENT = { engagement_id: "eng-1" } as unknown as Parameters<typeof L2StaffGantt>[0]["engagement"];

const ROW: EngagementAssignmentRow = {
  assignment_id: "a-1",
  engagement_id: "eng-1",
  staff_id: "staff-1",
  category_id: "cat-1",
  start_date: "2026-02-01",
  end_date: "2026-06-30",
  hours_per_week: 40,
  allocation_percent: 100,
  notes: null,
  status: "PROPOSED",
  staff: { staff_id: "staff-1", first_name: "Ana", last_name: "Alvarez", short_name: null, category_id: "cat-1" },
  category: { category_id: "cat-1", category_name: "Cat One" } as EngagementAssignmentRow["category"],
};

function renderGantt(canWrite: boolean, onOpenSheet = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    onOpenSheet,
    ...render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter>
            <L2StaffGantt
              engagement={ENGAGEMENT}
              assignments={[ROW]}
              allAssignments={[ROW]}
              staffOptions={[] as StaffWithSkills[]}
              categories={[]}
              requirements={[]}
              loadByStaff={new Map()}
              from="2026-01-01"
              to="2026-12-31"
              zoom="months"
              returnNav={null}
              canWrite={canWrite}
              onOpenSheet={onOpenSheet}
            />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    ),
  };
}

describe("L2StaffGantt — Fase 5 write surface (Sheet/menu only, drag stays disabled)", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it("readonly reflects canWrite — drag/resize is enabled now that the rollback gate is proven (L2StaffGantt.dragResize.test.tsx)", async () => {
    renderGantt(true);
    expect(await screen.findByTestId("canvas")).toHaveAttribute("data-readonly", "false");
  });

  it("canWrite=false keeps the canvas readonly", async () => {
    renderGantt(false);
    expect(await screen.findByTestId("canvas")).toHaveAttribute("data-readonly", "true");
  });

  it("clicking a bar opens the Sheet for that row (onBarOpen -> onOpenSheet)", () => {
    const onOpenSheet = vi.fn();
    renderGantt(true, onOpenSheet);
    fireEvent.click(screen.getByTestId("bar-a-1"));
    expect(onOpenSheet).toHaveBeenCalledWith(ROW);
  });

  it("canWrite=true shows Edit/Delete in the row menu", async () => {
    const user = userEvent.setup();
    renderGantt(true);
    await user.click(screen.getByLabelText("scheduler.actions.rowMenu"));
    expect(await screen.findByText("scheduler.actions.edit")).toBeInTheDocument();
    expect(screen.getByText("scheduler.actions.delete")).toBeInTheDocument();
  });

  it("canWrite=false hides Edit/Delete but keeps navigation items", async () => {
    const user = userEvent.setup();
    renderGantt(false);
    await user.click(screen.getByLabelText("scheduler.actions.rowMenu"));
    expect(await screen.findByText("scheduler.actions.openEngagement")).toBeInTheDocument();
    expect(screen.queryByText("scheduler.actions.edit")).not.toBeInTheDocument();
    expect(screen.queryByText("scheduler.actions.delete")).not.toBeInTheDocument();
  });

  it("the row menu's Edit item opens the Sheet for that row (no duplicated soft-delete logic — Delete does too)", async () => {
    const user = userEvent.setup();
    const onOpenSheet = vi.fn();
    renderGantt(true, onOpenSheet);
    await user.click(screen.getByLabelText("scheduler.actions.rowMenu"));
    await user.click(await screen.findByText("scheduler.actions.edit"));
    expect(onOpenSheet).toHaveBeenCalledWith(ROW);
  });
});

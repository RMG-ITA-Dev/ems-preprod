import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimesheetGrid } from "../TimesheetGrid";
import type { ApprovedEngagement, ActivityCode, TimeEntry } from "@/hooks/useTimesheetWeek";

/**
 * BUG 1028-217: un encargo que empieza y termina el mismo día (aunque ya esté Finalizado) debe
 * aparecer en la semana que contiene esa fecha y habilitar solo esa celda. El RPC ya lo trae
 * (p_ref_date = inicio de semana); aquí se prueba el recorte semanal y el bloqueo por celda
 * del componente real.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/timesheetUtils", () => ({
  toISODateString: (d: Date) => d.toISOString().split("T")[0],
  getDayName: () => "Mon",
  formatDayMonth: () => "20/04",
}));

vi.mock("@/hooks/useTimesheetMutations", () => ({
  useUpsertTimeEntry: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteRowEntries: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEntryActivity: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Expone la lista que la grilla ofrece en el selector (availableEngagements).
vi.mock("../TimesheetEngagementCombobox", () => ({
  TimesheetEngagementCombobox: ({ engagements }: { engagements: ApprovedEngagement[] }) => (
    <div data-testid="engagement-combobox">{engagements.map((e) => e.engagement_code).join(",")}</div>
  ),
}));

vi.mock("@/lib/timesheetActivityRules", () => ({
  normalizeActivityForEngagement: ({ currentActivityId }: { currentActivityId: string }) => ({
    nextActivityId: currentActivityId,
    wasCleared: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

// Semana lun 20/04 – vie 24/04/2026.
const WEEK_DATES = [
  new Date("2026-04-20"),
  new Date("2026-04-21"),
  new Date("2026-04-22"),
  new Date("2026-04-23"),
  new Date("2026-04-24"),
];

const sameDay = (id: string, code: string, date: string): ApprovedEngagement => ({
  engagement_id: id,
  engagement_code: code,
  engagement_name: `Capacitación ${date}`,
  activity_required: true,
  work_order_required: false,
  is_internal: false,
  practica: null,
  funcion: 1,
  start_date: date,
  end_date: date,
  engagement_state_override: 7,
  client: null,
});

const ACTIVITY: ActivityCode = {
  activity_id: "act-1",
  activity_code: "A01",
  description: "Activity 1",
  is_active: true,
  is_system: false,
};

const baseProps = {
  weekDates: WEEK_DATES,
  entries: [] as TimeEntry[],
  activities: [ACTIVITY],
  staffId: "staff-1",
  periodId: "period-1",
  isLocked: false,
  autoSaveSeconds: 0,
  lang: "en",
  lineApprovals: [],
};

describe("TimesheetGrid — encargo de un solo día (BUG 1028-217)", () => {
  it("offers a same-day engagement of the week, including Monday and Friday, but not one from last week", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        engagements={[
          sameDay("eng-tue", "TUE", "2026-04-21"),
          sameDay("eng-mon", "MON", "2026-04-20"),
          sameDay("eng-fri", "FRI", "2026-04-24"),
          sameDay("eng-prev", "PREV", "2026-04-17"),
        ]}
      />
    );
    const offered = screen.getAllByTestId("engagement-combobox")[0].textContent!.split(",");
    expect(offered).toEqual(expect.arrayContaining(["TUE", "MON", "FRI"]));
    expect(offered).not.toContain("PREV");
  });

  it("enables only the engagement's day; the other 4 cells show the out-of-range lock", () => {
    const entry: TimeEntry = {
      time_id: "t1",
      staff_id: "staff-1",
      engagement_id: "eng-tue",
      activity_id: "act-1",
      date_worked: "2026-04-21",
      hours_logged: 2,
      description: null,
      period_id: "period-1",
      is_forecast: false,
    };
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[entry]}
        engagements={[sameDay("eng-tue", "TUE", "2026-04-21")]}
      />
    );
    expect(screen.getAllByText("timesheet.cellOutsideEngagementDates")).toHaveLength(4);
  });
});

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimesheetGrid } from "../TimesheetGrid";
import type { ApprovedEngagement, ActivityCode, TimeEntry } from "@/hooks/useTimesheetWeek";

/**
 * Totales de la grilla: verdes si caen dentro de [mín, máx], rojos fuera. Antes exigían igualdad
 * con el mínimo y, con DAILY_MIN 7 / DAILY_MAX 9, un día de 8 h salía en rojo.
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

vi.mock("../TimesheetEngagementCombobox", () => ({
  TimesheetEngagementCombobox: () => <div data-testid="engagement-combobox" />,
}));

vi.mock("@/lib/timesheetActivityRules", () => ({
  normalizeActivityForEngagement: ({ currentActivityId }: { currentActivityId: string }) => ({
    nextActivityId: currentActivityId,
    wasCleared: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const WEEK_DATES = [
  new Date("2026-04-20"),
  new Date("2026-04-21"),
  new Date("2026-04-22"),
  new Date("2026-04-23"),
  new Date("2026-04-24"),
];

const ENGAGEMENT: ApprovedEngagement = {
  engagement_id: "eng-1",
  engagement_code: "E001",
  engagement_name: "Test Engagement",
  activity_required: true,
  work_order_required: false,
  is_internal: false,
  practica: null,
  funcion: 1,
  start_date: null,
  end_date: null,
  client: null,
};

const ACTIVITY: ActivityCode = {
  activity_id: "act-1",
  activity_code: "A01",
  description: "Activity 1",
  is_active: true,
  is_system: false,
};

// Una hora por día de la semana con las horas indicadas (lun..vie).
const weekEntries = (hours: number[]): TimeEntry[] =>
  hours.map((h, i) => ({
    time_id: `t${i}`,
    staff_id: "staff-1",
    engagement_id: "eng-1",
    activity_id: "act-1",
    date_worked: WEEK_DATES[i].toISOString().split("T")[0],
    hours_logged: h,
    description: null,
    period_id: "period-1",
    is_forecast: false,
  }));

const baseProps = {
  weekDates: WEEK_DATES,
  engagements: [ENGAGEMENT],
  activities: [ACTIVITY],
  staffId: "staff-1",
  periodId: "period-1",
  isLocked: false,
  autoSaveSeconds: 0,
  lang: "en",
  lineApprovals: [],
  dailyMin: 7,
  dailyMax: 9,
  weeklyMin: 40,
  weeklyMax: 50,
};

// Celdas de la fila de totales: [etiqueta, lun..vie, total semanal, vacía].
const totalsCells = () =>
  Array.from(screen.getByText("timesheet.dailyTotals").closest("tr")!.querySelectorAll("td"));

const isGreen = (el: Element) => el.className.includes("bg-success/15");
const isRed = (el: Element) => el.className.includes("bg-destructive/10");

describe("TimesheetGrid — totales dentro del rango mín–máx", () => {
  it("8 h por día con mínimo 7 y máximo 9 salen en verde, igual que los límites exactos", () => {
    render(<TimesheetGrid {...baseProps} entries={weekEntries([8, 7, 9, 8, 8])} />);
    const days = totalsCells().slice(1, 6);
    days.forEach((cell) => expect(isGreen(cell)).toBe(true));
    // 40 h dentro de [40, 50].
    expect(isGreen(totalsCells()[6])).toBe(true);
  });

  it("fuera del rango diario (6 h y 10 h) salen en rojo", () => {
    render(<TimesheetGrid {...baseProps} entries={weekEntries([6, 10, 8, 8, 8])} />);
    const [mon, tue, wed] = totalsCells().slice(1, 4);
    expect(isRed(mon)).toBe(true);
    expect(isRed(tue)).toBe(true);
    expect(isGreen(wed)).toBe(true);
  });

  it("total semanal por debajo del mínimo sale en rojo; dentro del rango, en verde", () => {
    const { unmount } = render(<TimesheetGrid {...baseProps} entries={weekEntries([7, 7, 7, 7, 7])} />);
    expect(isRed(totalsCells()[6])).toBe(true); // 35 < 40
    unmount();
    render(<TimesheetGrid {...baseProps} entries={weekEntries([9, 9, 9, 9, 9])} />);
    expect(isGreen(totalsCells()[6])).toBe(true); // 45 dentro de [40, 50]
  });
});

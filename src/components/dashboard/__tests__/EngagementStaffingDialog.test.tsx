import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EngagementStaffingDialog } from "../EngagementStaffingDialog";
import type { StaffingPerson, StaffingWeek } from "@/components/dashboard/tabs/encargoOverviewTypes";

// dash_encargo (bugs/dashboard/encargo/plan_v2.md §9.2): las 9 semanas ya vienen precargadas
// en props -- navegar con las flechas NUNCA debe llamar a Supabase (no se mockea el cliente
// a propósito: si el componente lo importara, este archivo fallaría al resolver el módulo).

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === "dashboard.encargo.staffing.weekLabel" && opts) {
        return `Semana ${opts.week} · ${opts.range}`;
      }
      return key;
    },
    i18n: { language: "es" },
  }),
}));

const PEOPLE: StaffingPerson[] = [
  { staff_id: "s1", display_name: "Juan Perez", category_name: "Senior", assigned_hours: 120, zero_week_alert: true },
  { staff_id: "s2", display_name: "Pedro Salas", category_name: "Asistente", assigned_hours: 0, zero_week_alert: false },
];

function buildWeeks(): StaffingWeek[] {
  return Array.from({ length: 9 }, (_, i) => {
    const offset = i - 4;
    return {
      offset,
      week_start: `2026-0${offset < 0 ? 8 : 9}-${String(15 + offset * 7).padStart(2, "0")}`,
      week_end: `2026-0${offset < 0 ? 8 : 9}-${String(21 + offset * 7).padStart(2, "0")}`,
      week_number: 38 + offset,
      rows: [
        { staff_id: "s1", logged_hours: offset === 0 ? 38 : 10 + offset, used_hours: 90 + offset * 10 },
        { staff_id: "s2", logged_hours: offset === 0 ? 6 : 0, used_hours: offset === 0 ? 6 : 0 },
      ],
    };
  });
}

describe("EngagementStaffingDialog", () => {
  it("(a) abre en offset = 0", () => {
    render(<EngagementStaffingDialog open people={PEOPLE} weeks={buildWeeks()} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Juan Perez")).toBeInTheDocument();
    const row = screen.getByText("Juan Perez").closest("tr")!;
    expect(within(row).getByText("38")).toBeInTheDocument(); // Cargado semana 0
  });

  it("(b)/(c) las flechas navegan sin llamar a Supabase y se deshabilitan en los bordes", async () => {
    const user = userEvent.setup();
    render(<EngagementStaffingDialog open people={PEOPLE} weeks={buildWeeks()} onOpenChange={vi.fn()} />);
    const prev = screen.getByLabelText("dashboard.encargo.staffing.previousWeek");
    const next = screen.getByLabelText("dashboard.encargo.staffing.nextWeek");

    for (let i = 0; i < 4; i++) await user.click(prev);
    expect(prev).toBeDisabled();

    for (let i = 0; i < 8; i++) await user.click(next);
    expect(next).toBeDisabled();
  });

  it("(d) Cargado/Utilizado cambian al navegar; Asignado y la alerta no cambian", async () => {
    const user = userEvent.setup();
    render(<EngagementStaffingDialog open people={PEOPLE} weeks={buildWeeks()} onOpenChange={vi.fn()} />);
    const rowBefore = screen.getByText("Juan Perez").closest("tr")!;
    expect(within(rowBefore).getByText("120")).toBeInTheDocument(); // Asignado, semana 0

    await user.click(screen.getByLabelText("dashboard.encargo.staffing.previousWeek"));
    const rowAfter = screen.getByText("Juan Perez").closest("tr")!;
    expect(within(rowAfter).getByText("9")).toBeInTheDocument(); // Cargado semana -1 (10 + -1)
    expect(within(rowAfter).getByText("120")).toBeInTheDocument(); // Asignado sigue igual
    expect(within(rowAfter).getByLabelText("dashboard.encargo.staffing.zeroWeekAlert")).toBeInTheDocument();
  });

  it("(e) fila con assigned_hours = 0 muestra la leyenda de sin asignación", () => {
    render(<EngagementStaffingDialog open people={PEOPLE} weeks={buildWeeks()} onOpenChange={vi.fn()} />);
    const row = screen.getByText("Pedro Salas").closest("tr")!;
    expect(within(row).getByTitle("dashboard.encargo.staffing.unassignedHours")).toBeInTheDocument();
  });

  it("(f) semana sin filas -> staffing.noRows", () => {
    render(<EngagementStaffingDialog open people={[]} weeks={buildWeeks()} onOpenChange={vi.fn()} />);
    expect(screen.getByText("dashboard.encargo.staffing.noRows")).toBeInTheDocument();
  });

  it("(g) el rango de fechas se muestra en DD/MM/YYYY", () => {
    render(<EngagementStaffingDialog open people={PEOPLE} weeks={buildWeeks()} onOpenChange={vi.fn()} />);
    expect(screen.getByText(/15\/09\/2026 - 21\/09\/2026/)).toBeInTheDocument();
  });
});

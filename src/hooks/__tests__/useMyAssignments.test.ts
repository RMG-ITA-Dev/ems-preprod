import { describe, it, expect } from "vitest";
import {
  weeksTouched,
  totalAssignedHours,
  progressPercent,
  clampProgressForBar,
  loadedHoursForRow,
} from "../useMyAssignments";

describe("weeksTouched", () => {
  it("una fila dentro de una sola semana calendario cuenta 1", () => {
    // Lunes 2026-09-21 a viernes 2026-09-25: misma semana ISO.
    expect(weeksTouched("2026-09-21", "2026-09-25")).toBe(1);
  });

  it("cuenta semanas calendario completas sin fraccionar, aunque empiece a mitad de semana", () => {
    // Miércoles 2026-09-02 (semana del 2026-08-31) a martes 2026-09-08 (semana del
    // 2026-09-07): son 7 días corridos pero tocan 2 semanas calendario distintas.
    expect(weeksTouched("2026-09-02", "2026-09-08")).toBe(2);
  });

  it("un mes calendario completo (01/09/26-30/09/26) toca 5 semanas", () => {
    expect(weeksTouched("2026-09-01", "2026-09-30")).toBe(5);
  });

  it("una fila de un solo día cuenta 1 semana", () => {
    expect(weeksTouched("2026-09-24", "2026-09-24")).toBe(1);
  });
});

describe("totalAssignedHours", () => {
  it("multiplica hours_per_week por semanas tocadas, sin fraccionar", () => {
    expect(
      totalAssignedHours({ hours_per_week: 40, start_date: "2026-09-01", end_date: "2026-09-30" }),
    ).toBe(200);
  });

  it("una fila de una sola semana da exactamente hours_per_week", () => {
    expect(
      totalAssignedHours({ hours_per_week: 40, start_date: "2026-09-21", end_date: "2026-09-25" }),
    ).toBe(40);
  });

  it("allocation_percent no participa de la fórmula — no es ni un parámetro de la función", () => {
    // Decisión cerrada (plan_v2.md): se muestra aparte, informativo, nunca como divisor.
    const row = { hours_per_week: 40, start_date: "2026-09-21", end_date: "2026-09-25" };
    expect(totalAssignedHours(row)).toBe(totalAssignedHours({ ...row, hours_per_week: 40 }));
  });
});

describe("progressPercent", () => {
  it("calcula el porcentaje redondeado", () => {
    expect(progressPercent(52, 160)).toBe(33);
  });

  it("es 0 sin horas asignadas, para evitar división por cero", () => {
    expect(progressPercent(10, 0)).toBe(0);
  });

  it("puede superar 100 — el clamp es responsabilidad de la barra, no del texto", () => {
    expect(progressPercent(180, 160)).toBe(113);
  });
});

describe("clampProgressForBar", () => {
  it("deja pasar valores dentro de rango", () => {
    expect(clampProgressForBar(0)).toBe(0);
    expect(clampProgressForBar(45)).toBe(45);
    expect(clampProgressForBar(100)).toBe(100);
  });

  it("topea en 100 para que la barra nunca desborde, aunque el pct real sea mayor", () => {
    expect(clampProgressForBar(113)).toBe(100);
  });
});

describe("loadedHoursForRow", () => {
  const row = { engagement_id: "e1", start_date: "2026-09-01", end_date: "2026-09-30" };

  it("suma las horas cargadas del mismo engagement dentro del rango de la fila", () => {
    const entries = [
      { engagement_id: "e1", date_worked: "2026-09-05", hours_logged: 5 },
      { engagement_id: "e1", date_worked: "2026-09-06", hours_logged: 3 },
    ];
    expect(loadedHoursForRow(row, entries)).toBe(8);
  });

  it("ignora entradas de otro engagement_id o fuera del rango de la fila", () => {
    const entries = [
      { engagement_id: "e2", date_worked: "2026-09-10", hours_logged: 8 },
      { engagement_id: "e1", date_worked: "2026-08-31", hours_logged: 4 },
      { engagement_id: "e1", date_worked: "2026-10-01", hours_logged: 4 },
    ];
    expect(loadedHoursForRow(row, entries)).toBe(0);
  });

  it("sin entradas, da 0", () => {
    expect(loadedHoursForRow(row, [])).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import {
  groupBreakdownByCategory,
  buildStaffingRows,
  buildTeamRows,
  formatDaysSince,
  staffingRatioLabel,
  approvalQueueSeverity,
} from "../encargoOverviewAggregation";
import type {
  EngagementBreakdownRow,
  EngagementTeam,
  StaffingPerson,
  StaffingWeek,
} from "../encargoOverviewTypes";

function breakdownRow(overrides: Partial<EngagementBreakdownRow>): EngagementBreakdownRow {
  return {
    category_id: "cat-1",
    category_name: "Senior",
    category_display_order: 1,
    activity_id: "act-1",
    activity_code: "ACT1",
    activity_description: "Actividad Uno",
    budget_hours: 10,
    actual_hours: 5,
    variance_hours: 5,
    ...overrides,
  };
}

describe("groupBreakdownByCategory", () => {
  it("(a) vacío -> []", () => {
    expect(groupBreakdownByCategory([])).toEqual([]);
  });

  it("(b) 2 categorías x 2 actividades -> 2 grupos con subtotales correctos", () => {
    const rows = [
      breakdownRow({ category_id: "cat-1", category_name: "Senior", category_display_order: 1, activity_id: "a1", activity_code: "ACT1", budget_hours: 8, actual_hours: 4, variance_hours: 4 }),
      breakdownRow({ category_id: "cat-1", category_name: "Senior", category_display_order: 1, activity_id: "a2", activity_code: "ACT2", budget_hours: 2, actual_hours: 1, variance_hours: 1 }),
      breakdownRow({ category_id: "cat-2", category_name: "Manager", category_display_order: 2, activity_id: "a3", activity_code: "ACT1", budget_hours: 6, actual_hours: 6, variance_hours: 0 }),
      breakdownRow({ category_id: "cat-2", category_name: "Manager", category_display_order: 2, activity_id: "a4", activity_code: "ACT2", budget_hours: 4, actual_hours: 3, variance_hours: 1 }),
    ];
    const groups = groupBreakdownByCategory(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ category_id: "cat-1", budget_hours: 10, actual_hours: 5, variance_hours: 5 });
    expect(groups[0].activities).toHaveLength(2);
    expect(groups[1]).toMatchObject({ category_id: "cat-2", budget_hours: 10, actual_hours: 9, variance_hours: 1 });
  });

  it("(c) categoría sin presupuesto con horas reales sobrevive con varianza negativa", () => {
    const rows = [
      breakdownRow({ category_id: "cat-b", category_name: "Asistente", category_display_order: 3, budget_hours: 0, actual_hours: 6, variance_hours: -6 }),
    ];
    const groups = groupBreakdownByCategory(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ budget_hours: 0, actual_hours: 6, variance_hours: -6 });
  });

  it("(d) orden por category_display_order y luego activity_code", () => {
    const rows = [
      breakdownRow({ category_id: "cat-2", category_name: "Manager", category_display_order: 2, activity_id: "a1", activity_code: "ACT2" }),
      breakdownRow({ category_id: "cat-1", category_name: "Senior", category_display_order: 1, activity_id: "a2", activity_code: "ACT2" }),
      breakdownRow({ category_id: "cat-1", category_name: "Senior", category_display_order: 1, activity_id: "a3", activity_code: "ACT1" }),
    ];
    const groups = groupBreakdownByCategory(rows);
    expect(groups.map((g) => g.category_id)).toEqual(["cat-1", "cat-2"]);
    expect(groups[0].activities.map((a) => a.activity_code)).toEqual(["ACT1", "ACT2"]);
  });

  it("(e) categoría null no rompe el agrupado y queda al final", () => {
    const rows = [
      breakdownRow({ category_id: null, category_name: null, category_display_order: null }),
      breakdownRow({ category_id: "cat-1", category_name: "Senior", category_display_order: 1 }),
    ];
    const groups = groupBreakdownByCategory(rows);
    expect(groups).toHaveLength(2);
    expect(groups[groups.length - 1].category_id).toBeNull();
  });

  it("no incluye filas 0/0 si nunca se agregaron (el filtro vive en el RPC, no acá)", () => {
    // La función confía en que el RPC ya excluyó budget=0 AND actual=0; acá solo se
    // verifica que agrupar no reintroduce filas -- no hay lógica de filtrado adicional.
    const rows: EngagementBreakdownRow[] = [];
    expect(groupBreakdownByCategory(rows)).toEqual([]);
  });
});

describe("buildStaffingRows", () => {
  const people: StaffingPerson[] = [
    { staff_id: "s1", display_name: "Juan Perez", category_name: "Senior", assigned_hours: 120, zero_week_alert: false },
    { staff_id: "s2", display_name: "Luis Ruiz", category_name: "Semisenior", assigned_hours: 120, zero_week_alert: true },
  ];
  const week: StaffingWeek = {
    offset: 0,
    week_start: "2026-09-15",
    week_end: "2026-09-21",
    week_number: 38,
    rows: [{ staff_id: "s1", logged_hours: 38, used_hours: 90 }],
  };

  it("(f) cruza people x weeks[n].rows por staff_id", () => {
    const rows = buildStaffingRows(people, week);
    expect(rows[0]).toMatchObject({ staff_id: "s1", logged_hours: 38, used_hours: 90, assigned_hours: 120 });
  });

  it("(g) persona sin fila esa semana -> logged 0 sin perder assigned_hours/zero_week_alert", () => {
    const rows = buildStaffingRows(people, week);
    expect(rows[1]).toMatchObject({ staff_id: "s2", logged_hours: 0, used_hours: 0, assigned_hours: 120, zero_week_alert: true });
  });

  it("semana ausente (undefined) no rompe -- todas las filas quedan en 0", () => {
    const rows = buildStaffingRows(people, undefined);
    expect(rows.every((r) => r.logged_hours === 0 && r.used_hours === 0)).toBe(true);
  });
});

describe("buildTeamRows", () => {
  it("devuelve los 6 roles en orden fijo, con null donde no hay especialista", () => {
    const team: EngagementTeam = {
      partner: { staff_id: "p1", display_name: "Socio" },
      manager: { staff_id: "m1", display_name: "Gerente" },
      encargado: { staff_id: "e1", display_name: "Encargado" },
      specialist_it: { staff_id: "i1", display_name: "Esp IT" },
      specialist_tax: null,
      sqr: { staff_id: "q1", display_name: "SQR" },
    };
    const rows = buildTeamRows(team);
    expect(rows.map((r) => r.role)).toEqual(["partner", "manager", "encargado", "specialist_it", "specialist_tax", "sqr"]);
    expect(rows.find((r) => r.role === "specialist_tax")?.member).toBeNull();
  });
});

describe("formatDaysSince", () => {
  it("null -> never", () => {
    expect(formatDaysSince(null)).toEqual({ kind: "never" });
  });
  it("0 -> today", () => {
    expect(formatDaysSince(0)).toEqual({ kind: "today" });
  });
  it("1 -> daysAgo count=1 (singular en la capa i18n)", () => {
    expect(formatDaysSince(1)).toEqual({ kind: "daysAgo", count: 1 });
  });
  it("N -> daysAgo count=N (plural en la capa i18n)", () => {
    expect(formatDaysSince(9)).toEqual({ kind: "daysAgo", count: 9 });
  });
});

describe("staffingRatioLabel", () => {
  it("3/5", () => {
    expect(staffingRatioLabel(3, 5)).toEqual({ logged: 3, assigned: 5, noAssignments: false });
  });
  it("0/0 -> noAssignments", () => {
    expect(staffingRatioLabel(0, 0)).toEqual({ logged: 0, assigned: 0, noAssignments: true });
  });
});

describe("approvalQueueSeverity", () => {
  it("por debajo de alert_weeks y sin alert del backend -> ok", () => {
    expect(approvalQueueSeverity(2, 3, false)).toBe("ok");
  });
  it("alert=true del backend (>= alert_weeks) pero por debajo de 2x -> warning", () => {
    expect(approvalQueueSeverity(3, 3, true)).toBe("warning");
    expect(approvalQueueSeverity(5, 3, true)).toBe("warning");
  });
  it(">= 2x alert_weeks -> critical, sin importar el flag alert del backend", () => {
    expect(approvalQueueSeverity(6, 3, true)).toBe("critical");
  });
  it("alert_weeks distinto de 3 -- el umbral crítico escala con él", () => {
    expect(approvalQueueSeverity(9, 5, true)).toBe("warning"); // 9 < 10 (2x5)
    expect(approvalQueueSeverity(10, 5, true)).toBe("critical");
  });
});

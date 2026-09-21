import { describe, it, expect } from "vitest";
import {
  carteraFiscalYearParams,
  pctChange,
  buildActivityWaterfall,
  categoryBarRows,
  staffingRows,
  consumptionStatus,
  approvalAgeWeeks,
  isApprovalStale,
  consolidateApprovalQueue,
  groupMilestones,
  toCarteraViewModel,
} from "../carteraOverviewAggregation";
import { emptyCarteraOverviewPayload } from "../carteraOverviewTypes";

// dash_cartera (bugs/dashboard/cartera/plan_v2.md §9.1, casos CA1-CA12).

describe("carteraFiscalYearParams", () => {
  it("CA1: fiscalYear=2026 -> fyStart=2025-10-01, fyEnd=2026-09-30", () => {
    expect(carteraFiscalYearParams(2026)).toEqual({
      fiscalYear: 2026,
      fyStart: "2025-10-01",
      fyEnd: "2026-09-30",
    });
  });

  it("CA2: no recibe periodType -- el mismo FY sale siempre igual, con independencia del periodo seleccionado", () => {
    const a = carteraFiscalYearParams(2026);
    const b = carteraFiscalYearParams(2026);
    expect(a).toEqual(b);
    expect(carteraFiscalYearParams(2026).fiscalYear).toBe(2026);
  });
});

describe("pctChange", () => {
  it("CA3: pctChange(12,10)=20; pctChange(5,0)=null; pctChange(0,0)=null (nunca Infinity)", () => {
    expect(pctChange(12, 10)).toBe(20);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });
});

describe("buildActivityWaterfall", () => {
  const items = [
    { activity_id: "a1", activity_code: "A1", description: "Act 1", budget_hours: 50, approved_hours: 15, pending_hours: 5 },
    { activity_id: "a2", activity_code: "A2", description: "Act 2", budget_hours: 30, approved_hours: 30, pending_hours: 10 },
    { activity_id: "a3", activity_code: "A3", description: "Act 3", budget_hours: 20, approved_hours: 5, pending_hours: 5 },
  ];

  it("CA4: presupuestos 50/30/20 sobre 100 -> offsets 0/50/80; ejecutado 20/40/10 -> offsets 0/20/60; TOTAL offset 0, budget_pct=100, approved+pending=total ejecutado", () => {
    const rows = buildActivityWaterfall(items, 100);
    expect(rows[0].budget_offset_pct).toBe(0);
    expect(rows[1].budget_offset_pct).toBe(50);
    expect(rows[2].budget_offset_pct).toBe(80);
    expect(rows[0].exec_offset_pct).toBe(0);
    expect(rows[1].exec_offset_pct).toBe(20);
    expect(rows[2].exec_offset_pct).toBe(60);

    const total = rows[rows.length - 1];
    expect(total.is_total).toBe(true);
    expect(total.budget_offset_pct).toBe(0);
    expect(total.budget_pct).toBe(100);
    expect(total.approved_pct + total.pending_pct).toBe(70);
  });

  it("CA4b: cumulative_hours acumula horas reales (no %) hasta E INCLUYENDO cada actividad", () => {
    const rows = buildActivityWaterfall(items, 100);
    // a1: 15+5=20; a2: 20+30+10=60; a3: 60+5+5=70 -- coincide con el total ejecutado real
    expect(rows[0].cumulative_hours).toBe(20);
    expect(rows[1].cumulative_hours).toBe(60);
    expect(rows[2].cumulative_hours).toBe(70);
    expect(rows[rows.length - 1].cumulative_hours).toBe(70);
  });

  it("CA5: totalBudget=0 -> todos los % en 0, sin NaN ni Infinity", () => {
    const rows = buildActivityWaterfall(items, 0);
    for (const row of rows) {
      expect(Number.isFinite(row.budget_pct)).toBe(true);
      expect(Number.isFinite(row.approved_pct)).toBe(true);
      expect(Number.isFinite(row.pending_pct)).toBe(true);
      expect(row.budget_pct).toBe(0);
      expect(row.approved_pct).toBe(0);
      expect(row.pending_pct).toBe(0);
    }
  });

  it("CA6: la columna TOTAL no se acumula dos veces", () => {
    const rows = buildActivityWaterfall(items, 100);
    const total = rows[rows.length - 1];
    // El acumulado de las 3 actividades ya llega a 100/70; TOTAL no debe sumarse encima de
    // eso -- sus propios approved_pct+pending_pct son el total real, no el acumulador + algo más.
    expect(total.approved_pct + total.pending_pct).toBe(70);
    expect(rows.filter((r) => r.is_total).length).toBe(1);
  });
});

describe("categoryBarRows", () => {
  it("CA7: orden por display_order asc (jerarquía de rol, decisión del operador 2026-09-18), scale_max = mayor presupuesto, show_budget_row=false cuando budget=0 y ejecutado>0", () => {
    const items = [
      { category_id: "c1", category_name: "Senior", display_order: 1, budget_hours: 20, approved_hours: 5, pending_hours: 0 },
      { category_id: "c2", category_name: "Gerente", display_order: 2, budget_hours: 40, approved_hours: 10, pending_hours: 0 },
      { category_id: "c3", category_name: "Sin Presupuesto", display_order: 3, budget_hours: 0, approved_hours: 3, pending_hours: 0 },
    ];
    const rows = categoryBarRows(items);
    expect(rows.map((r) => r.category_id)).toEqual(["c1", "c2", "c3"]);
    expect(rows.find((r) => r.category_id === "c2")?.scale_max).toBe(40);
    expect(rows.find((r) => r.category_id === "c3")?.show_budget_row).toBe(false);
    expect(rows.find((r) => r.category_id === "c1")?.show_budget_row).toBe(true);
  });

  it("CA7b: display_order nulo va al final, sin importar budget_hours", () => {
    const items = [
      { category_id: "c1", category_name: "Sin categoría", display_order: null, budget_hours: 999, approved_hours: 0, pending_hours: 0 },
      { category_id: "c2", category_name: "Socio", display_order: 1, budget_hours: 5, approved_hours: 0, pending_hours: 0 },
    ];
    const rows = categoryBarRows(items);
    expect(rows.map((r) => r.category_id)).toEqual(["c2", "c1"]);
  });

  // BUG 2026-09-20: el catálogo repite la misma escalera de roles en cada práctica (7 filas
  // "Socio"), así que en la vista "Todas" conviven homónimas legítimas de prácticas distintas.
  // El RPC ya no las duplica dentro de una misma práctica, pero estas hay que distinguirlas.
  it("CA7c: etiqueta con la práctica SOLO los nombres repetidos; los únicos quedan sin sufijo", () => {
    const items = [
      { category_id: "c1", category_name: "Socio", display_order: 1, practica_abbr: "AUD", budget_hours: 10, approved_hours: 0, pending_hours: 4 },
      { category_id: "c2", category_name: "Socio", display_order: 1, practica_abbr: "COM", budget_hours: 8, approved_hours: 2, pending_hours: 0 },
      { category_id: "c3", category_name: "Senior", display_order: 2, practica_abbr: "AUD", budget_hours: 20, approved_hours: 5, pending_hours: 0 },
    ];
    const rows = categoryBarRows(items);
    expect(rows.find((r) => r.category_id === "c1")?.practica_suffix).toBe("AUD");
    expect(rows.find((r) => r.category_id === "c2")?.practica_suffix).toBe("COM");
    expect(rows.find((r) => r.category_id === "c3")?.practica_suffix).toBeNull();
  });

  it("CA7d: sin practica_abbr (payload de una versión anterior del RPC) no rompe ni inventa sufijo", () => {
    const items = [
      { category_id: "c1", category_name: "Socio", display_order: 1, budget_hours: 10, approved_hours: 0, pending_hours: 0 },
      { category_id: "c2", category_name: "Socio", display_order: 1, budget_hours: 8, approved_hours: 0, pending_hours: 0 },
    ];
    const rows = categoryBarRows(items);
    expect(rows.map((r) => r.practica_suffix)).toEqual([null, null]);
  });
});

describe("staffingRows", () => {
  it("CA8: budgeted:null no se convierte en 0; orden por presupuesto desc con nulls al final", () => {
    const items = [
      { category_id: "c1", category_name: "Senior", budgeted: 2, executed: 1 },
      { category_id: "c2", category_name: "Sin Requisito", budgeted: null, executed: 4 },
      { category_id: "c3", category_name: "Gerente", budgeted: 5, executed: 3 },
    ];
    const rows = staffingRows(items);
    expect(rows.map((r) => r.category_id)).toEqual(["c3", "c1", "c2"]);
    expect(rows.find((r) => r.category_id === "c2")?.budgeted).toBeNull();
    expect(rows.every((r) => r.practica_suffix === null)).toBe(true);
  });

  it("CA8b: misma desambiguación por práctica que Horas por categoría (BUG 2026-09-20)", () => {
    const items = [
      { category_id: "c1", category_name: "Socio", practica_abbr: "AUD", budgeted: 1, executed: 1 },
      { category_id: "c2", category_name: "Socio", practica_abbr: "COM", budgeted: null, executed: 2 },
      { category_id: "c3", category_name: "Senior", practica_abbr: "AUD", budgeted: 2, executed: 1 },
    ];
    const rows = staffingRows(items);
    expect(rows.find((r) => r.category_id === "c1")?.practica_suffix).toBe("AUD");
    expect(rows.find((r) => r.category_id === "c2")?.practica_suffix).toBe("COM");
    expect(rows.find((r) => r.category_id === "c3")?.practica_suffix).toBeNull();
  });
});

describe("consumptionStatus", () => {
  it("CA9: 80 -> on_track; 80.1 -> at_risk; 100.1 -> over_budget", () => {
    expect(consumptionStatus(80)).toBe("on_track");
    expect(consumptionStatus(80.1)).toBe("at_risk");
    expect(consumptionStatus(100.1)).toBe("over_budget");
  });
});

describe("approvalAgeWeeks / isApprovalStale", () => {
  it("CA10: approvalAgeWeeks('2026-08-14','2026-09-17')=4; isApprovalStale(...,30)=true; con 20 días -> false", () => {
    expect(approvalAgeWeeks("2026-08-14", "2026-09-17")).toBe(4);
    expect(isApprovalStale("2026-08-14", "2026-09-17", 30)).toBe(true);
    expect(isApprovalStale("2026-08-28", "2026-09-17", 30)).toBe(false);
  });
});

describe("consolidateApprovalQueue", () => {
  it("una sola fila por persona, quedándose con la línea de mayor weeks_old (la más antigua)", () => {
    const items = [
      { approval_id: "a1", staff_name: "gerentermg", engagement_id: "e1", engagement_code: "2027.111.036", week_start_date: "2026-09-07", hours: 20, weeks_old: 1, alert: false },
      { approval_id: "a2", staff_name: "gerentermg", engagement_id: "e1", engagement_code: "2027.111.036", week_start_date: "2026-09-14", hours: 20, weeks_old: 0, alert: false },
      { approval_id: "a3", staff_name: "otropersona", engagement_id: "e2", engagement_code: "2027.111.035", week_start_date: "2026-08-01", hours: 8, weeks_old: 6, alert: true },
    ];
    const rows = consolidateApprovalQueue(items);
    expect(rows).toHaveLength(2);
    // Reflejo del pedido del operador 2026-09-18: si la semana pasada y esta semana están
    // ambas pendientes de la misma persona, se muestra la más vieja (1 sem), no 0 sem.
    const gerentermg = rows.find((r) => r.staff_name === "gerentermg");
    expect(gerentermg?.weeks_old).toBe(1);
    expect(gerentermg?.approval_id).toBe("a1");
  });

  it("ordena por weeks_old desc (la más atrasada primero)", () => {
    const items = [
      { approval_id: "a1", staff_name: "p1", engagement_id: "e1", engagement_code: "E1", week_start_date: "2026-09-07", hours: 1, weeks_old: 1, alert: false },
      { approval_id: "a2", staff_name: "p2", engagement_id: "e2", engagement_code: "E2", week_start_date: "2026-08-01", hours: 1, weeks_old: 6, alert: true },
    ];
    const rows = consolidateApprovalQueue(items);
    expect(rows.map((r) => r.staff_name)).toEqual(["p2", "p1"]);
  });

  it("lista vacía o null no crashea", () => {
    expect(consolidateApprovalQueue([])).toEqual([]);
  });
});

describe("groupMilestones", () => {
  it("CA11: date < today -> past, >= today -> upcoming, orden ascendente dentro de cada grupo", () => {
    const items = [
      { kind: "closing" as const, date: "2026-09-25", engagement_id: "e1", engagement_code: "E1", engagement_name: "E1", weeks: null },
      { kind: "closing" as const, date: "2026-08-20", engagement_id: "e2", engagement_code: "E2", engagement_name: "E2", weeks: null },
      { kind: "wo_approved" as const, date: "2026-08-25", engagement_id: "e3", engagement_code: "E3", engagement_name: "E3", weeks: null },
      { kind: "lock_deadline" as const, date: "2026-10-05", engagement_id: null, engagement_code: null, engagement_name: null, weeks: 5 },
    ];
    const { past, upcoming } = groupMilestones(items, "2026-09-17");
    expect(past.map((i) => i.date)).toEqual(["2026-08-20", "2026-08-25"]);
    expect(upcoming.map((i) => i.date)).toEqual(["2026-09-25", "2026-10-05"]);
  });
});

describe("toCarteraViewModel", () => {
  it("CA12: null -> payload vacío; strings numéricos coaccionados con safeNumber; orden estable de actividades y categorías", () => {
    expect(toCarteraViewModel(null)).toEqual(emptyCarteraOverviewPayload());

    const payload = {
      ...emptyCarteraOverviewPayload(),
      kpis: {
        ...emptyCarteraOverviewPayload().kpis,
        engagements: { total: "3" as unknown as number, approved: "2" as unknown as number, emergency: 0 },
      },
      activities: {
        total_budget_hours: 10,
        items: [
          { activity_id: "z", activity_code: "Z", description: "Z", budget_hours: "5" as unknown as number, approved_hours: 1, pending_hours: 0 },
          { activity_id: "a", activity_code: "A", description: "A", budget_hours: 5, approved_hours: 1, pending_hours: 0 },
        ],
      },
    };
    const vm = toCarteraViewModel(payload);
    expect(vm.kpis.engagements.total).toBe(3);
    expect(vm.kpis.engagements.approved).toBe(2);
    expect(vm.activities.items.map((i) => i.activity_id)).toEqual(["z", "a"]); // orden estable, sin reordenar
    expect(vm.activities.items[0].budget_hours).toBe(5);
  });
});

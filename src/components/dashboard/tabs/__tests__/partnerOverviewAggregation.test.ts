import { describe, it, expect } from "vitest";
import {
  formatBsCompact,
  consumptionTone,
  alertCardTone,
  splitNext7Days,
  next7DayLabelFormat,
  sectorLegend,
  emptyKind,
  fiscalYearParam,
  toViewModel,
  engagementSegmentPct,
  complianceTone,
  formatShortDate,
  hoursConsumptionPct,
  topManagersByEndDate,
  engagementElapsedPct,
  engagementCompliancePp,
} from "../partnerOverviewAggregation";
import {
  emptyPartnerOverviewPayload,
  type PartnerOverviewNext7DaysItem,
  type PartnerOverviewSector,
  type PartnerOverviewManager,
} from "@/hooks/usePartnerOverview";

// dash_socio (plan_v2.md §9.1): pruebas exactas de las funciones puras de
// agregación del tablero de Socio. Sin React / Supabase -- solo lógica.

describe("partnerOverviewAggregation", () => {
  describe("formatBsCompact", () => {
    it("formats millions with 2 decimals (es-BO)", () => {
      expect(formatBsCompact(4190000)).toBe("Bs 4,19 M");
    });
    it("formats thousands rounded (es-BO)", () => {
      expect(formatBsCompact(620000)).toBe("Bs 620 k");
    });
  });

  describe("consumptionTone", () => {
    it("89% -> default", () => {
      expect(consumptionTone(89)).toBe("default");
    });
    it("91% -> warning", () => {
      expect(consumptionTone(91)).toBe("warning");
    });
    it("101% -> destructive", () => {
      expect(consumptionTone(101)).toBe("destructive");
    });
  });

  describe("alertCardTone", () => {
    it("(0,0) -> success", () => {
      expect(alertCardTone(0, 0)).toBe("success");
    });
    it("(0,2) -> warning", () => {
      expect(alertCardTone(0, 2)).toBe("warning");
    });
    it("(3,0) -> destructive", () => {
      expect(alertCardTone(3, 0)).toBe("destructive");
    });
  });

  describe("splitNext7Days", () => {
    const today = "2026-09-15";
    const items: PartnerOverviewNext7DaysItem[] = [
      { installment_id: "i1", wo_id: "w1", engagement_id: "e1", client_legal_name: "A", kind: "collect", date: "2026-09-18", amount_bob: 100 },
      { installment_id: "i2", wo_id: "w2", engagement_id: "e2", client_legal_name: "B", kind: "invoice", date: "2026-09-13", amount_bob: 200 }, // overdue -> excluded
      { installment_id: "i3", wo_id: "w3", engagement_id: "e3", client_legal_name: "C", kind: "collect", date: "2026-09-25", amount_bob: 300 }, // > today+7 -> excluded
      { installment_id: "i4", wo_id: "w4", engagement_id: "e4", client_legal_name: "D", kind: "invoice", date: today, amount_bob: 400 }, // today -> included
    ];

    it("excludes overdue items and items beyond today+7", () => {
      const result = splitNext7Days(items, today);
      expect(result.map((r) => r.installment_id)).toEqual(["i1", "i4"]);
    });
  });

  describe("next7DayLabelFormat", () => {
    // review.md iteración 7, G-03: "lun 15" (weekday) es ambiguo si la ventana de
    // 7 días cruza de mes -- en ese caso se usa día + mes corto en vez de weekday.
    it("stays 'weekday' when the 7-day window doesn't cross a month", () => {
      expect(next7DayLabelFormat("2026-09-15")).toBe("weekday");
    });
    it("switches to 'day-month' when the window crosses into the next month", () => {
      expect(next7DayLabelFormat("2026-11-29")).toBe("day-month");
    });
    it("switches to 'day-month' when the window crosses into the next year", () => {
      expect(next7DayLabelFormat("2026-12-29")).toBe("day-month");
    });
  });

  describe("sectorLegend", () => {
    it("groups the 7th sector onward into 'Otros'", () => {
      const sectors: PartnerOverviewSector[] = Array.from({ length: 8 }, (_, i) => ({
        industry_id: `ind-${i}`,
        industry_name: `Industry ${i}`,
        engagement_count: 1,
        fee_bob: 1000 - i * 10, // descending
      }));

      const result = sectorLegend(sectors, 6);
      expect(result).toHaveLength(6);
      expect(result[5].industry_id).toBe("others");
      // Otros = sum of the 6th..8th (0-indexed 5..7) by fee_bob desc
      expect(result[5].engagement_count).toBe(3);
    });

    it("returns as-is when there are max or fewer sectors", () => {
      const sectors: PartnerOverviewSector[] = [
        { industry_id: "a", industry_name: "A", engagement_count: 1, fee_bob: 100 },
      ];
      expect(sectorLegend(sectors, 6)).toHaveLength(1);
    });
  });

  describe("emptyKind", () => {
    it("unfiltered_scope_count = 0 -> 'scope'", () => {
      expect(emptyKind({ unfiltered_scope_count: 0, scope_count: 0 })).toBe("scope");
    });
    it("unfiltered > 0 but scope_count = 0 -> 'filters'", () => {
      expect(emptyKind({ unfiltered_scope_count: 5, scope_count: 0 })).toBe("filters");
    });
    it("both > 0 -> 'none'", () => {
      expect(emptyKind({ unfiltered_scope_count: 5, scope_count: 3 })).toBe("none");
    });
  });

  describe("fiscalYearParam", () => {
    it("tax_bolivia + full -> selectedYear", () => {
      expect(fiscalYearParam("tax_bolivia", "full", 2026)).toBe(2026);
    });
    it("tax_bolivia + ytd -> null", () => {
      expect(fiscalYearParam("tax_bolivia", "ytd", 2026)).toBeNull();
    });
    it("custom + full -> null", () => {
      expect(fiscalYearParam("custom", "full", 2026)).toBeNull();
    });
  });

  describe("engagementSegmentPct", () => {
    // review.md iteración 1, MF-04: antes la mini-barra de KPI 1 usaba anchos fijos
    // 70/15/15 sin relación con los datos reales.
    it("computes real proportions over the sum of the 3 segments", () => {
      const result = engagementSegmentPct(35, 3, 2);
      expect(result.approved).toBeCloseTo((35 / 40) * 100);
      expect(result.emergency).toBeCloseTo((3 / 40) * 100);
      expect(result.finalized).toBeCloseTo((2 / 40) * 100);
    });

    it("returns all zeros when there are no engagements in any of the 3 segments (avoids division by 0)", () => {
      expect(engagementSegmentPct(0, 0, 0)).toEqual({ approved: 0, emergency: 0, finalized: 0 });
    });

    // review.md iteración 4, MF-01: "finalized" (estado 7) es un conjunto disjunto de
    // "total" (kpis.engagements.total, solo estado 4/5) -- dividir finalized por total
    // podía dejar la barra sumando muy por encima de 100% (aquí: 1+1=2 en cartera pero
    // 3 finalizados, un total de 5 "eventos" que antes se repartían mal).
    it("the three widths always add up to exactly 100%, even when finalized outnumbers the active total", () => {
      const result = engagementSegmentPct(1, 1, 3);
      const sum = result.approved + result.emergency + result.finalized;
      expect(sum).toBeCloseTo(100);
      expect(result.approved).toBeLessThanOrEqual(100);
      expect(result.emergency).toBeLessThanOrEqual(100);
      expect(result.finalized).toBeLessThanOrEqual(100);
    });
  });

  // review.md iteración 2, MF-09: las 4 funciones puras que quedaban sin test dedicado.
  describe("hoursConsumptionPct", () => {
    it("(aprobadas + pendientes) / presupuesto * 100", () => {
      expect(hoursConsumptionPct(6, 3, 10)).toBeCloseTo(90);
    });
    it("sin presupuesto (0) -> 0, no división por 0", () => {
      expect(hoursConsumptionPct(6, 3, 0)).toBe(0);
    });
  });

  describe("topManagersByEndDate", () => {
    it("ordena por end_date ascendente (el compromiso más próximo primero) y recorta a `max`", () => {
      const managers: PartnerOverviewManager[] = [
        { staff_id: "m1", short_name: "A. Pérez", engagement_count: 1, budget_hours: 10, approved_hours: 5, pending_hours: 2, pending_wo_count: 0, start_date: "2026-01-01", end_date: "2026-12-31" },
        { staff_id: "m2", short_name: "M. Rojas", engagement_count: 1, budget_hours: 10, approved_hours: 5, pending_hours: 2, pending_wo_count: 0, start_date: "2026-01-01", end_date: "2026-06-30" },
        { staff_id: "m3", short_name: "L. Quispe", engagement_count: 1, budget_hours: 10, approved_hours: 5, pending_hours: 2, pending_wo_count: 0, start_date: "2026-01-01", end_date: "2026-09-30" },
      ];
      expect(topManagersByEndDate(managers, 2).map((m) => m.staff_id)).toEqual(["m2", "m3"]);
    });
  });

  describe("engagementElapsedPct", () => {
    it("50% a mitad de camino entre start y end", () => {
      expect(engagementElapsedPct("2026-01-01", "2026-12-31", "2026-07-02")).toBeCloseTo(50, 0);
    });
    it("clampea a 100 si `today` ya pasó el end_date", () => {
      expect(engagementElapsedPct("2026-01-01", "2026-06-30", "2027-01-01")).toBe(100);
    });
    it("duración inválida (fin <= inicio) se trata como ya terminado (100)", () => {
      expect(engagementElapsedPct("2026-06-30", "2026-01-01", "2026-03-01")).toBe(100);
    });
  });

  describe("engagementCompliancePp", () => {
    it("horas consumidas por encima del tiempo transcurrido -> pp positivo", () => {
      // 100% de las horas presupuestadas consumidas a mitad del encargo (50% transcurrido).
      const pp = engagementCompliancePp(8, 2, 10, "2026-01-01", "2026-12-31", "2026-07-02");
      expect(pp).toBeCloseTo(50, 0);
    });
    it("horas consumidas por debajo del tiempo transcurrido -> pp negativo", () => {
      const pp = engagementCompliancePp(1, 0, 10, "2026-01-01", "2026-12-31", "2026-07-02");
      expect(pp).toBeLessThan(0);
    });
  });

  describe("complianceTone", () => {
    // review.md iteración 2, MF-07: decisión revisada del operador -- rojo si se adelanta
    // más de 10 pp (riesgo de sobregiro), ámbar si se atrasa más de 30 pp (señal de que el
    // proyecto no avanza), tono normal entre ambos umbrales (incluye eficiencia moderada).
    it("pp > 10 -> destructive (ritmo de horas por encima del tiempo transcurrido)", () => {
      expect(complianceTone(20)).toBe("destructive");
    });
    it("pp < -30 -> warning (muy por detrás del ritmo)", () => {
      expect(complianceTone(-35)).toBe("warning");
    });
    it("pp entre -30 y 10 -> default (incluye eficiencia moderada, no se marca)", () => {
      expect(complianceTone(-20)).toBe("default");
      expect(complianceTone(5)).toBe("default");
      expect(complianceTone(0)).toBe("default");
    });
  });

  describe("formatShortDate", () => {
    // review.md iteración 1, MF-08: formato DD/MM/YYYY (AGENTS.md regla #3), antes usaba
    // un formato largo ("12 ene 2026") inconsistente con el resto de la app.
    it("formats as DD/MM/YYYY in es", () => {
      expect(formatShortDate("2026-01-12", "es-BO")).toBe("12/01/2026");
    });
    it("formats as DD/MM/YYYY in en too (misma convención en toda la app)", () => {
      expect(formatShortDate("2026-01-12", "en-US")).toBe("12/01/2026");
    });
    it("returns an em dash for null/invalid input", () => {
      expect(formatShortDate(null, "es-BO")).toBe("—");
      expect(formatShortDate(undefined, "es-BO")).toBe("—");
    });
  });

  describe("toViewModel", () => {
    it("coerces numeric strings and nulls to finite numbers", () => {
      const raw = {
        ...emptyPartnerOverviewPayload(),
        meta: {
          ...emptyPartnerOverviewPayload().meta,
          scope_count: "12" as unknown as number,
          unfiltered_scope_count: null as unknown as number,
        },
        kpis: {
          ...emptyPartnerOverviewPayload().kpis,
          engagements: { total: "41" as unknown as number, approved: 35, emergency: 3, finalized_in_period: 2 },
        },
      };

      const vm = toViewModel(raw);
      expect(vm.meta.scope_count).toBe(12);
      expect(vm.meta.unfiltered_scope_count).toBe(0);
      expect(vm.kpis.engagements.total).toBe(41);
      expect(Number.isFinite(vm.kpis.engagements.total)).toBe(true);
    });

    it("returns the empty payload for null/undefined input", () => {
      expect(toViewModel(null)).toEqual(emptyPartnerOverviewPayload());
      expect(toViewModel(undefined)).toEqual(emptyPartnerOverviewPayload());
    });
  });
});

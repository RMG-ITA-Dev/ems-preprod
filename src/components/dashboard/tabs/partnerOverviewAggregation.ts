import { safeNumber } from "@/lib/queryHelpers";
import { formatFullDate } from "@/lib/timesheetUtils";
import type { PeriodType, QuarterType } from "@/lib/fiscalCalculations";
import {
  emptyPartnerOverviewPayload,
  type PartnerOverviewPayload,
  type PartnerOverviewMeta,
  type PartnerOverviewNext7DaysItem,
  type PartnerOverviewSector,
  type PartnerOverviewManager,
} from "./partnerOverviewTypes";

// dash_socio (bugs/dashboard/socio/plan_v2.md §5.3): funciones puras sin React /
// Supabase / network imports (AGENTS.md "Dashboard PR Perf Checklist" regla #3).
// Todos los porcentajes, tonos y agrupaciones de UI se calculan acá; el RPC solo
// entrega sumas y conteos. Los tipos vienen de partnerOverviewTypes.ts (review.md
// iteración 2, MF-09) -- antes venían de src/hooks/usePartnerOverview.ts, que
// importa React Query/Supabase; ese import transitivo violaba la regla de arriba
// aunque este archivo nunca los usara directamente.

/** "Bs 4,19 M" / "Bs 620 k" -- notación compacta es-BO con 2 decimales por debajo del millón. */
export function formatBsCompact(n: number): string {
  const value = safeNumber(n);
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `Bs ${sign}${(abs / 1_000_000).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`;
  }
  if (abs >= 1_000) {
    return `Bs ${sign}${Math.round(abs / 1_000).toLocaleString("es-BO")} k`;
  }
  return `Bs ${sign}${Math.round(abs).toLocaleString("es-BO")}`;
}

export interface EngagementSegmentPct {
  approved: number;
  emergency: number;
  finalized: number;
}

/** KPI 1 (review.md iteracion 1, MF-04; corregido en iteracion 4, MF-01): ancho real de
 * cada segmento de la mini-barra segmentada. El denominador es la SUMA de los tres
 * segmentos, no `total` (= `kpis.engagements.total`, que solo cuenta estado 4/5). Antes se
 * dividia `finalizedInPeriod` (estado 7, un conjunto disjunto de "total") por ese mismo
 * `total` de 4/5 -- como ninguno de los dos conjuntos incluye al otro, la barra podia sumar
 * bastante mas de 100% (ej. approved=1, emergency=1, finalized=3, total=2 -> 250%). Usar la
 * suma de los tres como base garantiza que los anchos siempre sumen exactamente 100%. */
export function engagementSegmentPct(
  approved: number,
  emergency: number,
  finalizedInPeriod: number,
): EngagementSegmentPct {
  const a = safeNumber(approved);
  const e = safeNumber(emergency);
  const f = safeNumber(finalizedInPeriod);
  const sum = a + e + f;
  if (sum <= 0) return { approved: 0, emergency: 0, finalized: 0 };
  return {
    approved: (a / sum) * 100,
    emergency: (e / sum) * 100,
    finalized: (f / sum) * 100,
  };
}

export type ConsumptionTone = "default" | "warning" | "destructive";

/** > 100% consumido -> rojo; > 90% -> ámbar; el resto, tono por defecto. */
export function consumptionTone(pct: number): ConsumptionTone {
  const value = safeNumber(pct);
  if (value > 100) return "destructive";
  if (value > 90) return "warning";
  return "default";
}

export type AlertCardTone = "success" | "warning" | "destructive";

/** KPI 5: objetivo declarado en pantalla es 0 sobregirados · 0 OT por aprobar. */
export function alertCardTone(overBudgetCount: number, pendingWoCount: number): AlertCardTone {
  const overBudget = safeNumber(overBudgetCount);
  const pendingWo = safeNumber(pendingWoCount);
  if (overBudget > 0) return "destructive";
  if (pendingWo > 0) return "warning";
  return "success";
}

/**
 * Bloque C: línea de tiempo estricta de 7 días. Excluye vencidas (fecha < hoy,
 * que van al chip aparte) y cualquier fecha más allá de hoy+7.
 */
export function splitNext7Days(
  items: PartnerOverviewNext7DaysItem[],
  today: string,
): PartnerOverviewNext7DaysItem[] {
  const todayDate = new Date(`${today}T00:00:00`);
  const limitDate = new Date(todayDate);
  limitDate.setDate(limitDate.getDate() + 7);

  return (items ?? []).filter((item) => {
    const d = new Date(`${item.date}T00:00:00`);
    return d.getTime() >= todayDate.getTime() && d.getTime() <= limitDate.getTime();
  });
}

export interface SectorLegendItem {
  industry_id: string;
  industry_name: string;
  engagement_count: number;
  fee_bob: number;
}

/** Bloque D: los primeros `max` sectores por fee_bob, el resto agrupado en "Otros". */
export function sectorLegend(sectors: PartnerOverviewSector[], max = 6): SectorLegendItem[] {
  const sorted = [...(sectors ?? [])].sort((a, b) => safeNumber(b.fee_bob) - safeNumber(a.fee_bob));
  if (sorted.length <= max) return sorted;

  const head = sorted.slice(0, max - 1);
  const tail = sorted.slice(max - 1);
  const others: SectorLegendItem = tail.reduce(
    (acc, s) => ({
      industry_id: "others",
      industry_name: "others",
      engagement_count: acc.engagement_count + safeNumber(s.engagement_count),
      fee_bob: acc.fee_bob + safeNumber(s.fee_bob),
    }),
    { industry_id: "others", industry_name: "others", engagement_count: 0, fee_bob: 0 },
  );
  return [...head, others];
}

/** % de horas consumidas sobre el presupuesto (0 si no hay presupuesto) --
 * compartido por Bloque E (gerentes) y Bloque F (horas por encargo). */
export function hoursConsumptionPct(approved: number, pending: number, budget: number): number {
  const b = safeNumber(budget);
  if (b <= 0) return 0;
  return ((safeNumber(approved) + safeNumber(pending)) / b) * 100;
}

/** Bloque E (2026-09-16, rediseño a tabla): gerentes ordenados por fecha fin
 * ascendente (el compromiso más próximo por vencer primero), sin distinguir
 * aprobados/finalizados -- este bloque solo incluye encargos 4/5, igual que
 * siempre (decisión del operador: no ampliar a finalizados). Top `max`. */
export function topManagersByEndDate(managers: PartnerOverviewManager[], max = 10): PartnerOverviewManager[] {
  return [...(managers ?? [])]
    .sort((a, b) => (a.end_date ?? "").localeCompare(b.end_date ?? ""))
    .slice(0, max);
}

/** "15/06/2026" -- DD/MM/YYYY (AGENTS.md: "Date format: DD/MM/YYYY throughout"), para las
 * tablas de Gerentes y Bloque F (Inicio/Fin). Reutiliza formatFullDate de
 * src/lib/timesheetUtils.ts -- antes usaba un formato largo ("12 ene 2026") inconsistente
 * con el resto de la app (review.md iteración 1, MF-08). */
export function formatShortDate(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return formatFullDate(d, locale.startsWith("es") ? "es" : "en");
}

/** Bloque F: % de días transcurridos del encargo a la fecha `today` (0-100,
 * clamped). Duración inválida (fin <= inicio) se trata como "ya terminado". */
export function engagementElapsedPct(startDate: string, endDate: string, today: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  const now = new Date(`${today}T00:00:00`).getTime();
  const totalDays = end - start;
  if (!(totalDays > 0)) return 100;
  return Math.min(100, Math.max(0, ((now - start) / totalDays) * 100));
}

/**
 * pp de cumplimiento (decisión del operador, 2026-09-16; umbrales revisados en
 * review.md iteración 2, MF-07): diferencia entre el % de horas consumidas
 * (aprobadas + pendientes, sobre el presupuesto) y el % de tiempo transcurrido
 * del encargo. 0 = el ritmo de horas coincide con el tiempo transcurrido.
 * Positivo y grande (> 10 pp) = riesgo de sobregiro antes de fin -- rojo.
 * Negativo y muy grande (< -30 pp) = se está usando muchas menos horas de las
 * que corresponderían, señal de que el encargo no avanza o quedó olvidado --
 * ámbar (ver `complianceTone`). Un desvío negativo moderado sigue siendo
 * eficiencia normal, sin marcar.
 */
export function engagementCompliancePp(
  approvedHours: number,
  pendingHours: number,
  budgetHours: number,
  startDate: string,
  endDate: string,
  today: string,
): number {
  const hoursPct = hoursConsumptionPct(approvedHours, pendingHours, budgetHours);
  const elapsedPct = engagementElapsedPct(startDate, endDate, today);
  return hoursPct - elapsedPct;
}

export type ComplianceTone = "destructive" | "warning" | "default";

/**
 * Rojo si se está consumiendo horas más rápido de lo que corresponde al tiempo
 * transcurrido en más de `overThreshold` pp (riesgo de sobregiro antes de terminar).
 * Ámbar si se está muy por detrás del ritmo, más de `underThreshold` pp negativos --
 * decisión del operador (review.md iteración 2, MF-07): eso no se lee como "eficiencia"
 * sino como señal de que el proyecto no avanza o quedó olvidado. Entre ambos umbrales,
 * tono por defecto. Reemplaza la versión simétrica anterior (rojo en cualquier dirección
 * a partir de 10 pp), que contradecía este mismo criterio.
 */
export function complianceTone(pp: number, overThreshold = 10, underThreshold = -30): ComplianceTone {
  const value = safeNumber(pp);
  if (value > overThreshold) return "destructive";
  if (value < underThreshold) return "warning";
  return "default";
}

export type EmptyKind = "none" | "scope" | "filters";

/** meta.unfiltered_scope_count = 0 -> vacío por alcance; scope_count = 0 con
 * unfiltered > 0 -> vacío por filtros; ninguno de los dos -> hay datos. */
export function emptyKind(meta: Pick<PartnerOverviewMeta, "scope_count" | "unfiltered_scope_count">): EmptyKind {
  const unfiltered = safeNumber(meta.unfiltered_scope_count);
  const scope = safeNumber(meta.scope_count);
  if (unfiltered === 0) return "scope";
  if (scope === 0) return "filters";
  return "none";
}

/**
 * `p_fiscal_year` del RPC: solo se envía cuando el periodo seleccionado es un FY
 * fiscal boliviano COMPLETO (decisiones.md §2) -- de lo contrario los encargos se
 * filtran por solapamiento de fechas, no por `anio_fiscal`.
 */
export function fiscalYearParam(
  periodType: PeriodType,
  selectedQuarter: QuarterType,
  selectedYear: number,
): number | null {
  if (periodType === "tax_bolivia" && selectedQuarter === "full") return selectedYear;
  return null;
}

/** Coerción defensiva de todo el payload: cualquier número que llegue como string,
 * null o NaN se normaliza con safeNumber(); nunca se propaga NaN a la UI. */
export function toViewModel(payload: PartnerOverviewPayload | null | undefined): PartnerOverviewPayload {
  if (!payload) return emptyPartnerOverviewPayload();

  const n = safeNumber;
  return {
    ...payload,
    meta: {
      ...payload.meta,
      scope_count: n(payload.meta?.scope_count),
      unfiltered_scope_count: n(payload.meta?.unfiltered_scope_count),
      variable_rate_count: n(payload.meta?.variable_rate_count),
      nonconvertible_count: n(payload.meta?.nonconvertible_count),
    },
    kpis: {
      engagements: {
        total: n(payload.kpis?.engagements?.total),
        approved: n(payload.kpis?.engagements?.approved),
        emergency: n(payload.kpis?.engagements?.emergency),
        finalized_in_period: n(payload.kpis?.engagements?.finalized_in_period),
      },
      fees: {
        total_bob: n(payload.kpis?.fees?.total_bob),
        previous_total_bob: n(payload.kpis?.fees?.previous_total_bob),
        sparkline: (payload.kpis?.fees?.sparkline ?? []).map((p) => ({
          month: p.month,
          value_bob: n(p.value_bob),
        })),
      },
      my_partner_hours: {
        budget: n(payload.kpis?.my_partner_hours?.budget),
        approved: n(payload.kpis?.my_partner_hours?.approved),
        pending: n(payload.kpis?.my_partner_hours?.pending),
        rejected: n(payload.kpis?.my_partner_hours?.rejected),
      },
      my_sqr_hours: {
        budget: n(payload.kpis?.my_sqr_hours?.budget),
        approved: n(payload.kpis?.my_sqr_hours?.approved),
        pending: n(payload.kpis?.my_sqr_hours?.pending),
        rejected: n(payload.kpis?.my_sqr_hours?.rejected),
        engagement_count: n(payload.kpis?.my_sqr_hours?.engagement_count),
        engagements: payload.kpis?.my_sqr_hours?.engagements ?? [],
      },
      alerts: {
        over_budget_count: n(payload.kpis?.alerts?.over_budget_count),
        portfolio_count: n(payload.kpis?.alerts?.portfolio_count),
        pending_wo_count: n(payload.kpis?.alerts?.pending_wo_count),
        pending_risk_count: n(payload.kpis?.alerts?.pending_risk_count),
      },
    },
    profitability: {
      hours: {
        budget: n(payload.profitability?.hours?.budget),
        approved: n(payload.profitability?.hours?.approved),
        pending: n(payload.profitability?.hours?.pending),
        rejected: n(payload.profitability?.hours?.rejected),
        previous_logged: n(payload.profitability?.hours?.previous_logged),
      },
      money_bob: {
        fee_net: n(payload.profitability?.money_bob?.fee_net),
        expense_budget: n(payload.profitability?.money_bob?.expense_budget),
        hours_valued_approved: n(payload.profitability?.money_bob?.hours_valued_approved),
        hours_valued_pending: n(payload.profitability?.money_bob?.hours_valued_pending),
        expenses_reviewed: n(payload.profitability?.money_bob?.expenses_reviewed),
        expenses_manager_approved: n(payload.profitability?.money_bob?.expenses_manager_approved),
        previous_executed: n(payload.profitability?.money_bob?.previous_executed),
      },
      nonconvertible: payload.profitability?.nonconvertible ?? [],
    },
    economic_cycle: {
      to_invoice_bob: n(payload.economic_cycle?.to_invoice_bob),
      invoiced_bob: n(payload.economic_cycle?.invoiced_bob),
      collected_bob: n(payload.economic_cycle?.collected_bob),
      overdue_90_bob: n(payload.economic_cycle?.overdue_90_bob),
      avg_collection_days:
        payload.economic_cycle?.avg_collection_days == null ? null : n(payload.economic_cycle.avg_collection_days),
    },
    collections: payload.collections ?? emptyPartnerOverviewPayload().collections,
    sectors: payload.sectors ?? [],
    managers: payload.managers ?? [],
    top_clients: payload.top_clients ?? [],
    alerts: {
      pending_wo: n(payload.alerts?.pending_wo),
      over_budget: n(payload.alerts?.over_budget),
      in_arrears: n(payload.alerts?.in_arrears),
      overdue_90: n(payload.alerts?.overdue_90),
      closing_soon: n(payload.alerts?.closing_soon),
      risk_pending: n(payload.alerts?.risk_pending),
      draft_worksheets: n(payload.alerts?.draft_worksheets),
    },
    filters: payload.filters ?? { clients: [], managers: [], industries: [], societies: [] },
    finalized_summary: {
      count: n(payload.finalized_summary?.count),
      budget_hours: n(payload.finalized_summary?.budget_hours),
      executed_hours: n(payload.finalized_summary?.executed_hours),
      collected_bob: n(payload.finalized_summary?.collected_bob),
    },
  };
}

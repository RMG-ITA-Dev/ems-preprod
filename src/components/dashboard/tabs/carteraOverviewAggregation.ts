import { safeNumber } from "@/lib/queryHelpers";
import { getFiscalYearPeriod, formatDateForApi } from "@/lib/fiscalCalculations";
import {
  emptyCarteraOverviewPayload,
  type CarteraOverviewPayload,
  type CarteraActivityItem,
  type CarteraCategoryItem,
  type CarteraStaffingRow,
  type CarteraMilestoneItem,
  type CarteraApprovalQueueItem,
  type CarteraCollectionsBucket,
} from "./carteraOverviewTypes";

// dash_cartera (bugs/dashboard/cartera/plan_v2.md §5.3): funciones puras sin React /
// Supabase / network imports (AGENTS.md "Dashboard PR Perf Checklist" regla #3). Los
// porcentajes, escalas y agrupaciones de UI se calculan acá; el RPC solo entrega sumas y
// conteos. Reutiliza (sin duplicar) las funciones puras compartidas de
// partnerOverviewAggregation.ts -- emptyKind(), formatBsCompact(), formatShortDate(),
// engagementSegmentPct(), alertCardTone(), splitNext7Days() -- que CarteraTab.tsx importa
// directo de ese módulo.

/**
 * p_fiscal_year del RPC: siempre el año seleccionado (plan_v2.md §16 Q2), también con
 * periodo `custom` -- a diferencia de dash_socio, Cartera no deriva el FY de las fechas del
 * periodo. p_fy_start/p_fy_end se calculan con getFiscalYearPeriod(selectedYear, 'full').
 */
export function carteraFiscalYearParams(selectedYear: number): { fiscalYear: number; fyStart: string; fyEnd: string } {
  const period = getFiscalYearPeriod(selectedYear, "full");
  return {
    fiscalYear: selectedYear,
    fyStart: formatDateForApi(period.startDate),
    fyEnd: formatDateForApi(period.endDate),
  };
}

/** Variación %: null (nunca Infinity/NaN) cuando no hay base de comparación. */
export function pctChange(current: number, previous: number): number | null {
  const c = safeNumber(current);
  const p = safeNumber(previous);
  if (p === 0) return null;
  return ((c - p) / p) * 100;
}

export interface CarteraWaterfallRow {
  activity_id: string;
  activity_code: string;
  description: string;
  budget_hours: number;
  approved_hours: number;
  pending_hours: number;
  /** % del presupuesto total de la cartera-práctica (denominador común, decisiones.md §5.3). */
  budget_pct: number;
  /** Acumulado de budget_pct de las actividades anteriores en la misma serie. */
  budget_offset_pct: number;
  approved_pct: number;
  pending_pct: number;
  /** Acumulado de (approved_pct + pending_pct) de las actividades anteriores. */
  exec_offset_pct: number;
  /** Horas ejecutadas acumuladas HASTA E INCLUYENDO esta actividad (decisiones.md §5.1.1,
   * tooltip "528 h / 1.200 h") -- en horas reales, no %, a diferencia de exec_offset_pct. */
  cumulative_hours: number;
  /** La columna TOTAL no flota: offset siempre 0, budget_pct siempre 100 (decisiones.md §5.1.1). */
  is_total: boolean;
}

/**
 * Cascada de Actividades (decisiones.md §5.1.1): cada bloque "flota" -- arranca donde
 * terminó el bloque anterior de su propia serie (presupuesto y ejecutado acumulan por
 * separado). La columna TOTAL es la excepción: barra apilada normal de 0 a 100%, no
 * flotante -- se calcula aparte, sin reutilizar el acumulador de la iteración (evita
 * cualquier doble conteo, aserción CA6).
 */
export function buildActivityWaterfall(items: CarteraActivityItem[], totalBudget: number): CarteraWaterfallRow[] {
  const total = safeNumber(totalBudget);
  const denom = total > 0 ? total : 0;
  let budgetCum = 0;
  let execCum = 0;
  let hoursCum = 0;

  const rows: CarteraWaterfallRow[] = (items ?? []).map((item) => {
    const budgetHours = safeNumber(item.budget_hours);
    const approvedHours = safeNumber(item.approved_hours);
    const pendingHours = safeNumber(item.pending_hours);
    const budgetPct = denom > 0 ? (budgetHours / denom) * 100 : 0;
    const approvedPct = denom > 0 ? (approvedHours / denom) * 100 : 0;
    const pendingPct = denom > 0 ? (pendingHours / denom) * 100 : 0;
    const cumulativeHours = hoursCum + approvedHours + pendingHours;

    const row: CarteraWaterfallRow = {
      activity_id: item.activity_id,
      activity_code: item.activity_code,
      description: item.description,
      budget_hours: budgetHours,
      approved_hours: approvedHours,
      pending_hours: pendingHours,
      budget_pct: budgetPct,
      budget_offset_pct: budgetCum,
      approved_pct: approvedPct,
      pending_pct: pendingPct,
      exec_offset_pct: execCum,
      cumulative_hours: cumulativeHours,
      is_total: false,
    };
    budgetCum += budgetPct;
    execCum += approvedPct + pendingPct;
    hoursCum = cumulativeHours;
    return row;
  });

  const totalApprovedHours = (items ?? []).reduce((acc, i) => acc + safeNumber(i.approved_hours), 0);
  const totalPendingHours = (items ?? []).reduce((acc, i) => acc + safeNumber(i.pending_hours), 0);
  rows.push({
    activity_id: "__total__",
    activity_code: "",
    description: "",
    budget_hours: total,
    approved_hours: totalApprovedHours,
    pending_hours: totalPendingHours,
    budget_pct: denom > 0 ? 100 : 0,
    budget_offset_pct: 0,
    approved_pct: denom > 0 ? (totalApprovedHours / denom) * 100 : 0,
    pending_pct: denom > 0 ? (totalPendingHours / denom) * 100 : 0,
    exec_offset_pct: 0,
    cumulative_hours: totalApprovedHours + totalPendingHours,
    is_total: true,
  });

  return rows;
}

/** Nombres de categoría que aparecen más de una vez en la lista. El catálogo repite la misma
 * escalera de roles en cada práctica (cero_11: 7 filas "Socio"), así que con el selector de
 * Práctica en "Todas" pueden convivir varias homónimas legítimas -- distintas category_id,
 * distinto presupuesto. Solo esas se etiquetan con la abreviatura de su práctica; con una
 * práctica elegida la lista queda limpia, sin sufijos. */
function duplicatedNames(rows: { category_name: string | null }[]): Set<string> {
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (r.category_name == null) continue;
    seen.set(r.category_name, (seen.get(r.category_name) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name));
}

export interface CarteraCategoryBarRow {
  category_id: string | null;
  category_name: string | null;
  /** Abreviatura de práctica a mostrar junto al nombre; null cuando el nombre no se repite. */
  practica_suffix: string | null;
  budget_hours: number;
  approved_hours: number;
  pending_hours: number;
  /** false cuando budget_hours=0 y hay ejecución -- solo se dibuja el track "Ejecut." (§6.2). */
  show_budget_row: boolean;
  /** Ancho completo = la categoría con mayor presupuesto (§6.2/§8, "no contra 100%"). */
  scale_max: number;
}

/** Horas por categoría: sin acumulado ("comparación desde cero"), escalado contra la
 * categoría de mayor presupuesto. Orden por jerarquía de rol (categories.display_order
 * ascendente, decisión del operador 2026-09-18: Socio, SQR, Director, ... -- reemplaza el
 * orden por presupuesto desc de la ronda de diseño original, §6.2 de decisiones.md).
 * Categorías sin display_order (p.ej. "Sin categoría") van al final. */
export function categoryBarRows(items: CarteraCategoryItem[]): CarteraCategoryBarRow[] {
  const rows = (items ?? []).map((i) => ({
    category_id: i.category_id,
    category_name: i.category_name,
    display_order: i.display_order,
    practica_abbr: i.practica_abbr ?? null,
    budget_hours: safeNumber(i.budget_hours),
    approved_hours: safeNumber(i.approved_hours),
    pending_hours: safeNumber(i.pending_hours),
  }));
  const ambiguous = duplicatedNames(rows);
  const sorted = [...rows].sort((a, b) => {
    if (a.display_order == null && b.display_order == null) return 0;
    if (a.display_order == null) return 1;
    if (b.display_order == null) return -1;
    return a.display_order - b.display_order;
  });
  const scaleMax = sorted.reduce((max, r) => Math.max(max, r.budget_hours), 0);
  return sorted.map(({ display_order: _display_order, practica_abbr, ...r }) => ({
    ...r,
    practica_suffix: r.category_name != null && ambiguous.has(r.category_name) ? practica_abbr : null,
    show_budget_row: !(r.budget_hours === 0 && r.approved_hours + r.pending_hours > 0),
    scale_max: scaleMax,
  }));
}

export interface CarteraStaffingRowOut {
  category_id: string | null;
  category_name: string | null;
  /** Ver CarteraCategoryBarRow.practica_suffix. */
  practica_suffix: string | null;
  budgeted: number | null;
  executed: number;
}

/** Presupuesto de personal (§6.3): budgeted=null se conserva (nunca se convierte en 0);
 * orden por presupuesto desc, filas sin requisito (null) al final. */
export function staffingRows(items: CarteraStaffingRow[]): CarteraStaffingRowOut[] {
  const ambiguous = duplicatedNames(items ?? []);
  const rows: CarteraStaffingRowOut[] = (items ?? []).map((i) => ({
    category_id: i.category_id,
    category_name: i.category_name,
    practica_suffix: i.category_name != null && ambiguous.has(i.category_name) ? i.practica_abbr ?? null : null,
    budgeted: i.budgeted == null ? null : safeNumber(i.budgeted),
    executed: safeNumber(i.executed),
  }));
  return [...rows].sort((a, b) => {
    if (a.budgeted == null && b.budgeted == null) return 0;
    if (a.budgeted == null) return 1;
    if (b.budgeted == null) return -1;
    return b.budgeted - a.budgeted;
  });
}

export type ConsumptionStatus = "on_track" | "at_risk" | "over_budget";

/** Estado de "Horas por encargo": <=80% on_track, <=100% at_risk, >100% over_budget. */
export function consumptionStatus(pct: number): ConsumptionStatus {
  const v = safeNumber(pct);
  if (v > 100) return "over_budget";
  if (v > 80) return "at_risk";
  return "on_track";
}

/** Antigüedad en semanas completas de una línea pendiente, desde week_start_date (§7.1). */
export function approvalAgeWeeks(weekStart: string, today: string): number {
  const start = new Date(`${weekStart}T00:00:00`).getTime();
  const now = new Date(`${today}T00:00:00`).getTime();
  const days = Math.floor((now - start) / 86_400_000);
  return Math.floor(days / 7);
}

/** Alerta ⚠ cuando today - week_start_date >= retroDays (mismo umbral que bloquea la
 * edición retroactiva, §4.3/§7.1). */
export function isApprovalStale(weekStart: string, today: string, retroDays: number): boolean {
  const start = new Date(`${weekStart}T00:00:00`).getTime();
  const now = new Date(`${today}T00:00:00`).getTime();
  const days = Math.floor((now - start) / 86_400_000);
  return days >= safeNumber(retroDays);
}

/** Consolida la Cola de aprobación por persona (decisión del operador 2026-09-18): antes
 * se repetía una fila por cada línea pendiente, así que la misma persona con varias
 * semanas atrasadas ocupaba varias filas (y "0 sem"/"1 sem" mezclados). Ahora una sola
 * fila por persona, quedándose con la línea de MAYOR weeks_old (la más antigua sin
 * aprobar) -- si la semana pasada y esta semana están ambas pendientes, se muestra "1 sem"
 * (la más vieja), no "0 sem".
 *
 * MF-03 (review.md iteración 1): la clave es `staff_id`, no el nombre visible. El RPC ahora
 * lo emite (es un uuid interno, no PII -- la aserción #22 de la suite prohíbe email/
 * id_number/auth_user_id, no el id) y además consolida por persona ANTES de su LIMIT, así
 * que esta función ya no es la única defensa. Se conserva el nombre como respaldo para un
 * payload viejo o cacheado, sin el campo: `short_name` es único por designación de la firma,
 * pero el respaldo `nombre + apellido` que arma el RPC cuando está NULL no lo es. */
export function consolidateApprovalQueue(items: CarteraApprovalQueueItem[]): CarteraApprovalQueueItem[] {
  const byPerson = new Map<string, CarteraApprovalQueueItem>();
  for (const item of items ?? []) {
    const key = item.staff_id ?? `name:${item.staff_name}`;
    const current = byPerson.get(key);
    if (!current || item.weeks_old > current.weeks_old) {
      byPerson.set(key, item);
    }
  }
  return Array.from(byPerson.values()).sort((a, b) => b.weeks_old - a.weeks_old);
}

export interface CarteraMilestoneGroups {
  past: CarteraMilestoneItem[];
  upcoming: CarteraMilestoneItem[];
}

/** Hitos (§7.2): date < today -> "Mes pasado", date >= today -> "Mes que viene"; orden
 * ascendente dentro de cada grupo. Comparación lexicográfica de strings ISO (YYYY-MM-DD),
 * válida porque coincide con el orden cronológico. */
export function groupMilestones(items: CarteraMilestoneItem[], today: string): CarteraMilestoneGroups {
  const past: CarteraMilestoneItem[] = [];
  const upcoming: CarteraMilestoneItem[] = [];
  for (const item of items ?? []) {
    if (item.date < today) past.push(item);
    else upcoming.push(item);
  }
  past.sort((a, b) => a.date.localeCompare(b.date));
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  return { past, upcoming };
}

/** Un bucket de Facturación coaccionado (SF-01): `count`/`amount_bob` siempre numéricos. */
function coerceBucket(bucket: CarteraCollectionsBucket | null | undefined): CarteraCollectionsBucket {
  return { count: safeNumber(bucket?.count), amount_bob: safeNumber(bucket?.amount_bob) };
}

/** Coerción defensiva de todo el payload: cualquier número que llegue como string, null o
 * NaN se normaliza con safeNumber(); nunca se propaga NaN a la UI. Orden de actividades y
 * categorías se conserva tal cual llega del servidor (estable, sin reordenar acá). */
export function toCarteraViewModel(payload: CarteraOverviewPayload | null | undefined): CarteraOverviewPayload {
  if (!payload) return emptyCarteraOverviewPayload();
  const n = safeNumber;
  const empty = emptyCarteraOverviewPayload();

  return {
    meta: {
      role_key: payload.meta?.role_key ?? "",
      scope_kind: payload.meta?.scope_kind === "firm" ? "firm" : "own",
      practica_name: payload.meta?.practica_name ?? null,
      scope_count: n(payload.meta?.scope_count),
      unfiltered_scope_count: n(payload.meta?.unfiltered_scope_count),
      fiscal_year: n(payload.meta?.fiscal_year),
      retro_days: n(payload.meta?.retro_days) || 30,
      today: payload.meta?.today ?? empty.meta.today,
    },
    filters: {
      clients: payload.filters?.clients ?? [],
      practicas: payload.filters?.practicas ?? [],
    },
    kpis: {
      engagements: {
        total: n(payload.kpis?.engagements?.total),
        approved: n(payload.kpis?.engagements?.approved),
        emergency: n(payload.kpis?.engagements?.emergency),
      },
      clients_services: {
        clients: n(payload.kpis?.clients_services?.clients),
        services: n(payload.kpis?.clients_services?.services),
        previous_clients: n(payload.kpis?.clients_services?.previous_clients),
        previous_services: n(payload.kpis?.clients_services?.previous_services),
      },
      my_role_hours: {
        role_key: payload.kpis?.my_role_hours?.role_key ?? null,
        role_label: payload.kpis?.my_role_hours?.role_label ?? null,
        budget: n(payload.kpis?.my_role_hours?.budget),
        approved: n(payload.kpis?.my_role_hours?.approved),
        pending: n(payload.kpis?.my_role_hours?.pending),
      },
      portfolio_progress: {
        budget: n(payload.kpis?.portfolio_progress?.budget),
        approved: n(payload.kpis?.portfolio_progress?.approved),
        pending: n(payload.kpis?.portfolio_progress?.pending),
      },
      review: {
        over_budget_count: n(payload.kpis?.review?.over_budget_count),
        pending_wo_count: n(payload.kpis?.review?.pending_wo_count),
        pending_risk_count: n(payload.kpis?.review?.pending_risk_count),
      },
    },
    activities: {
      total_budget_hours: n(payload.activities?.total_budget_hours),
      items: (payload.activities?.items ?? []).map((i) => ({
        activity_id: i.activity_id,
        activity_code: i.activity_code,
        description: i.description,
        budget_hours: n(i.budget_hours),
        approved_hours: n(i.approved_hours),
        pending_hours: n(i.pending_hours),
      })),
    },
    categories: {
      total_budget_hours: n(payload.categories?.total_budget_hours),
      items: (payload.categories?.items ?? []).map((i) => ({
        category_id: i.category_id ?? null,
        category_name: i.category_name ?? null,
        display_order: i.display_order == null ? null : n(i.display_order),
        practica_abbr: i.practica_abbr ?? null,
        budget_hours: n(i.budget_hours),
        approved_hours: n(i.approved_hours),
        pending_hours: n(i.pending_hours),
      })),
    },
    staffing: (payload.staffing ?? []).map((s) => ({
      category_id: s.category_id ?? null,
      category_name: s.category_name ?? null,
      practica_abbr: s.practica_abbr ?? null,
      budgeted: s.budgeted == null ? null : n(s.budgeted),
      executed: n(s.executed),
    })),
    // SF-01 (review.md iteración 1): estos cinco bloques se pasaban TAL CUAL desde el JSON
    // mientras el resto del payload se coaccionaba -- un numeric serializado como string
    // llegaba a Math.round()/toFixed() y, peor, a sumas como `approved_hours +
    // pending_hours`, que se convertían en concatenación silenciosa. Ahora se normalizan
    // igual que los demás, preservando los null que el contrato sí admite
    // (avg_collection_days, weeks, engagement_code).
    collections: {
      by_status: {
        collected: coerceBucket(payload.collections?.by_status?.collected),
        invoiced: coerceBucket(payload.collections?.by_status?.invoiced),
        in_arrears: coerceBucket(payload.collections?.by_status?.in_arrears),
        upcoming: coerceBucket(payload.collections?.by_status?.upcoming),
      },
      next_7_days: (payload.collections?.next_7_days ?? []).map((i) => ({
        installment_id: i.installment_id,
        wo_id: i.wo_id,
        engagement_id: i.engagement_id,
        client_legal_name: i.client_legal_name,
        kind: i.kind === "invoice" ? "invoice" : "collect",
        date: i.date,
        amount_bob: n(i.amount_bob),
      })),
      avg_collection_days:
        payload.collections?.avg_collection_days == null ? null : n(payload.collections.avg_collection_days),
    },
    expenses: {
      budget_bob: n(payload.expenses?.budget_bob),
      executed_bob: n(payload.expenses?.executed_bob),
      pending_count: n(payload.expenses?.pending_count),
      approved_count: n(payload.expenses?.approved_count),
      top3: (payload.expenses?.top3 ?? []).map((i) => ({
        engagement_id: i.engagement_id,
        engagement_code: i.engagement_code ?? null,
        client_legal_name: i.client_legal_name,
        budget_bob: n(i.budget_bob),
        executed_bob: n(i.executed_bob),
        pct: n(i.pct),
      })),
    },
    approval_queue: {
      total_hours: n(payload.approval_queue?.total_hours),
      distinct_people: n(payload.approval_queue?.distinct_people),
      total_count: n(payload.approval_queue?.total_count),
      items: (payload.approval_queue?.items ?? []).map((i) => ({
        approval_id: i.approval_id,
        staff_id: i.staff_id ?? null,
        staff_name: i.staff_name,
        engagement_id: i.engagement_id,
        engagement_code: i.engagement_code ?? null,
        week_start_date: i.week_start_date,
        hours: n(i.hours),
        weeks_old: n(i.weeks_old),
        alert: Boolean(i.alert),
      })),
    },
    milestones: (payload.milestones ?? []).map((m) => ({
      kind: m.kind,
      date: m.date,
      engagement_id: m.engagement_id ?? null,
      engagement_code: m.engagement_code ?? null,
      engagement_name: m.engagement_name ?? null,
      weeks: m.weeks == null ? null : n(m.weeks),
    })),
    engagement_rows: (payload.engagement_rows ?? []).map((r) => ({
      engagement_id: r.engagement_id,
      engagement_code: r.engagement_code ?? null,
      engagement_name: r.engagement_name,
      client_legal_name: r.client_legal_name,
      budget_hours: n(r.budget_hours),
      approved_hours: n(r.approved_hours),
      pending_hours: n(r.pending_hours),
      over_budget: Boolean(r.over_budget),
    })),
    finalized_summary: {
      count: n(payload.finalized_summary?.count),
      budget_hours: n(payload.finalized_summary?.budget_hours),
      executed_hours: n(payload.finalized_summary?.executed_hours),
      executed_expenses_bob: n(payload.finalized_summary?.executed_expenses_bob),
    },
  };
}

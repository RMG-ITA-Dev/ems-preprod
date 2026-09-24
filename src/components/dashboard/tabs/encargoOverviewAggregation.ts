import { safeNumber } from "@/lib/queryHelpers";
import type {
  EngagementBreakdownRow,
  EngagementTeam,
  StaffingPerson,
  StaffingWeek,
  TeamMember,
} from "./encargoOverviewTypes";

// dash_encargo: funciones puras (sin React ni Supabase) que transforman el payload plano de
// engagement_overview() en la forma que consume EncargoTab. Espeja carteraOverviewAggregation.ts
// (bugs/dashboard/encargo/plan_v2.md §5.3).

export interface GroupedBreakdownCategory {
  category_id: string | null;
  category_name: string | null;
  budget_hours: number;
  actual_hours: number;
  variance_hours: number;
  activities: EngagementBreakdownRow[];
}

/** Agrupa el desglose plano de categoría->actividad en categorías con sus actividades
 * anidadas y subtotales (plan_v2.md §4.3/§7.3). Orden: category_display_order (NULLS LAST),
 * luego category_name; las actividades dentro de cada grupo van por activity_code luego
 * activity_id. Una categoría null (no debería ocurrir con datos reales, pero no debe romper
 * el agrupado) cae en un único grupo "sin categoría". */
export function groupBreakdownByCategory(rows: EngagementBreakdownRow[]): GroupedBreakdownCategory[] {
  const groups = new Map<string, GroupedBreakdownCategory & { display_order: number | null }>();

  for (const row of rows) {
    const key = row.category_id ?? "__none__";
    let group = groups.get(key);
    if (!group) {
      group = {
        category_id: row.category_id,
        category_name: row.category_name,
        display_order: row.category_display_order,
        budget_hours: 0,
        actual_hours: 0,
        variance_hours: 0,
        activities: [],
      };
      groups.set(key, group);
    }
    group.budget_hours += safeNumber(row.budget_hours);
    group.actual_hours += safeNumber(row.actual_hours);
    group.variance_hours += safeNumber(row.variance_hours);
    group.activities.push(row);
  }

  const sortActivities = (a: EngagementBreakdownRow, b: EngagementBreakdownRow) =>
    (a.activity_code ?? "").localeCompare(b.activity_code ?? "") || a.activity_id.localeCompare(b.activity_id);

  return Array.from(groups.values())
    .sort((a, b) => {
      if (a.display_order == null && b.display_order == null) {
        return (a.category_name ?? "").localeCompare(b.category_name ?? "");
      }
      if (a.display_order == null) return 1;
      if (b.display_order == null) return -1;
      return a.display_order - b.display_order || (a.category_name ?? "").localeCompare(b.category_name ?? "");
    })
    .map(({ display_order: _display_order, ...group }) => ({
      ...group,
      activities: [...group.activities].sort(sortActivities),
    }));
}

export interface StaffingDisplayRow extends StaffingPerson {
  logged_hours: number;
  used_hours: number;
}

/** Cruza people[] (assigned_hours/zero_week_alert, invariantes por persona) con
 * weeks[n].rows[] (logged_hours/used_hours, propios de la semana mostrada) -- plan_v2.md
 * §4.5/§7.4. Por construcción del backend cada persona de people[] tiene una fila en cada
 * semana; el fallback a 0 es solo defensivo (payload de una versión anterior del RPC). */
export function buildStaffingRows(people: StaffingPerson[], week: StaffingWeek | undefined): StaffingDisplayRow[] {
  const byStaff = new Map((week?.rows ?? []).map((r) => [r.staff_id, r]));
  return people.map((person) => {
    const row = byStaff.get(person.staff_id);
    return {
      ...person,
      logged_hours: safeNumber(row?.logged_hours),
      used_hours: safeNumber(row?.used_hours),
    };
  });
}

export type TeamRoleKey = "partner" | "manager" | "encargado" | "specialist_it" | "specialist_tax" | "sqr";

export interface TeamRow {
  role: TeamRoleKey;
  member: TeamMember | null;
}

const TEAM_ROLE_ORDER: TeamRoleKey[] = ["partner", "manager", "encargado", "specialist_it", "specialist_tax", "sqr"];

/** Los 6 roles formales del encargo, en orden fijo de exhibición (plan_v2.md §4.4/§8.1). */
export function buildTeamRows(team: EngagementTeam): TeamRow[] {
  return TEAM_ROLE_ORDER.map((role) => ({ role, member: team[role] }));
}

export type DaysSinceLabel = { kind: "never" } | { kind: "today" } | { kind: "daysAgo"; count: number };

/** Traduce kpis.last_time_entry/last_approval.days a un token consumible por i18n
 * (kpi.never/kpi.today/kpi.daysAgo con plural _one/_other) -- este módulo no importa
 * react-i18next a propósito. */
export function formatDaysSince(days: number | null): DaysSinceLabel {
  if (days === null) return { kind: "never" };
  if (days <= 0) return { kind: "today" };
  return { kind: "daysAgo", count: days };
}

export interface StaffingRatioLabel {
  logged: number;
  assigned: number;
  noAssignments: boolean;
}

/** KPI Staffing (§4.1): fracción "Cargado > 0 / asignados" de una semana. */
export function staffingRatioLabel(logged: number, assigned: number): StaffingRatioLabel {
  return { logged, assigned, noAssignments: assigned === 0 };
}

export type ApprovalQueueSeverity = "ok" | "critical";

/** Cola de Aprobación: severidad visual del badge de antigüedad de cada persona (review.md
 * iteración 1, MF-05 -- decisión del operador). "critical" es exactamente `item.alert` tal
 * como lo calcula el backend (weeks_old >= alert_weeks, mismo umbral que kpis.pending_
 * approval.aged_hours) -- no hay un escalón intermedio ni un múltiplo adicional: para el
 * negocio, llegar a alert_weeks (3 por defecto) YA es crítico. */
export function approvalQueueSeverity(alert: boolean): ApprovalQueueSeverity {
  return alert ? "critical" : "ok";
}

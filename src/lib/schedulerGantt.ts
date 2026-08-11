// Fase 3 — Scheduler Gantt: pure date-mapping, zoom, and color logic.
//
// No React / no Supabase imports; fully unit-testable (src/lib/staffingMatch.ts
// and engagementAssignments.ts are the models). GanttCanvas and the L1/L2
// composition layers consume this. Ported from sruizmier-scheduler-v3.
//
// DATES (plan §9): every string↔Date conversion goes through date-fns
// parse/format with explicit yyyy-MM-dd patterns — never
// `new Date("yyyy-MM-dd")`, whose UTC-midnight parse shifts a day in
// western timezones. EMS dates are inclusive; SVAR bar `end` is an
// EXCLUSIVE boundary, so the mapping adds/removes one day and the tests
// prove the round trip has zero drift.

import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
  getDate,
  getDaysInMonth,
  getQuarter,
  isSaturday,
  isSunday,
  parse,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import { enUS, es } from "date-fns/locale";
import { EngagementState } from "@/lib/engagementStatus";

// ── String ↔ Date ───────────────────────────────────────────────────────

export const DATE_FORMAT = "yyyy-MM-dd";

export function toLocalDate(s: string): Date {
  return parse(s, DATE_FORMAT, new Date());
}

export function toDateString(d: Date): string {
  return format(d, DATE_FORMAT);
}

/**
 * Strict canonical yyyy-MM-dd validation: exact shape AND real Gregorian
 * components. JavaScript's Date rolls impossible dates over (2026-02-31 →
 * Mar 3), so shape+parse alone is not enough — components must round-trip.
 * The edge function applies the same rule server-side (byte-synced copy).
 */
export function isStrictIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Inclusive EMS end_date → exclusive SVAR bar end. */
export function svarEndFromDateString(endDate: string): Date {
  return addDays(toLocalDate(endDate), 1);
}

/** Exclusive SVAR bar end → inclusive EMS end_date. */
export function dateStringFromSvarEnd(end: Date): string {
  return toDateString(subDays(end, 1));
}

// ── Zoom levels ──────────────────────────────────────────────────────────

export type SchedulerZoom = "weeks" | "months" | "quarters";

export const SCHEDULER_ZOOMS: SchedulerZoom[] = ["weeks", "months", "quarters"];

export function isSchedulerZoom(v: unknown): v is SchedulerZoom {
  return v === "weeks" || v === "months" || v === "quarters";
}

interface ZoomScale {
  unit: "day" | "week" | "month" | "quarter" | "year";
  step: number;
  format: (d: Date) => string;
}

export interface ZoomConfig {
  /** Width of one bottom-scale cell in px. */
  cellWidth: number;
  scales: ZoomScale[];
  bottomUnit: "day" | "week" | "month";
}

export type SchedulerLocaleCode = "en" | "es";

const DATE_FNS_LOCALE = { en: enUS, es: es } as const;
// Week / quarter label prefixes per language (semana → S, trimestre → T).
const SCALE_PREFIX = {
  en: { week: "W", quarter: "Q" },
  es: { week: "S", quarter: "T" },
} as const;

/** Locale-aware scale rows for one zoom level. */
export function zoomScalesFor(
  zoom: SchedulerZoom,
  localeCode: SchedulerLocaleCode
): ZoomScale[] {
  const locale = DATE_FNS_LOCALE[localeCode];
  const prefix = SCALE_PREFIX[localeCode];
  switch (zoom) {
    case "weeks":
      return [
        {
          unit: "week",
          step: 1,
          format: (d) => `${prefix.week}${format(d, "II")} · ${format(d, "d MMM", { locale })}`,
        },
        { unit: "day", step: 1, format: (d) => format(d, "d", { locale }) },
      ];
    case "months":
      return [
        { unit: "month", step: 1, format: (d) => format(d, "MMM yyyy", { locale }) },
        { unit: "week", step: 1, format: (d) => `${prefix.week}${format(d, "II")}` },
      ];
    case "quarters":
      return [
        {
          unit: "quarter",
          step: 1,
          format: (d) => `${prefix.quarter}${getQuarter(d)} ${format(d, "yyyy")}`,
        },
        { unit: "month", step: 1, format: (d) => format(d, "MMM", { locale }) },
      ];
  }
}

// SVAR aligns the visible chart to the start of the BOTTOM scale unit and
// its holiday/highlight layer maps the bottom row's cells through
// highlightTime — so weekend day-shading exists only where the bottom
// unit is "day". Zoom levels therefore follow classic Gantt granularity:
// weeks = week/day, months = month/week, quarters = quarter/month. SVAR's
// week starts Monday (weekStart ?? 1). `scales` here is the English
// default; GanttCanvas renders via zoomScalesFor with the active language.
export const ZOOM_CONFIG: Record<SchedulerZoom, ZoomConfig> = {
  weeks: {
    cellWidth: 28,
    bottomUnit: "day",
    scales: zoomScalesFor("weeks", "en"),
  },
  months: {
    cellWidth: 60,
    bottomUnit: "week",
    scales: zoomScalesFor("months", "en"),
  },
  quarters: {
    cellWidth: 90,
    bottomUnit: "month",
    scales: zoomScalesFor("quarters", "en"),
  },
};

// ── Today line geometry (EMS-owned — SVAR markers are PRO-gated) ────────

/** Chart origin: SVAR aligns to the start of the BOTTOM scale unit. */
export function scaleStartFor(zoom: SchedulerZoom, windowFrom: string): Date {
  const from = toLocalDate(windowFrom);
  switch (zoom) {
    case "weeks":
      return from; // bottom unit day — the window's own first day
    case "months":
      return startOfWeek(from, { weekStartsOn: 1 }); // bottom unit week
    case "quarters":
      return startOfMonth(from); // bottom unit month
  }
}

/**
 * X offset (px) of the middle of `today`'s day column inside the chart
 * area, or null when today precedes the visible scale start. Mirrors
 * SVAR's layout: whole bottom-unit cells are equal-width; position within
 * a cell is proportional to the day fraction of that unit.
 */
export function todayOffsetPx(
  zoom: SchedulerZoom,
  windowFrom: string,
  today: Date,
  cellWidth: number = ZOOM_CONFIG[zoom].cellWidth
): number | null {
  const start = scaleStartFor(zoom, windowFrom);
  if (differenceInCalendarDays(today, start) < 0) return null;

  let cells: number;
  let fraction: number;
  switch (zoom) {
    case "weeks": {
      // Bottom unit day: one cell per day.
      cells = differenceInCalendarDays(today, start);
      fraction = 0.5;
      break;
    }
    case "months": {
      // Bottom unit week (Monday-start).
      const days = differenceInCalendarDays(today, start);
      cells = Math.floor(days / 7);
      fraction = ((days % 7) + 0.5) / 7;
      break;
    }
    case "quarters": {
      // Bottom unit month.
      cells = differenceInCalendarMonths(startOfMonth(today), start);
      fraction = (getDate(today) - 1 + 0.5) / getDaysInMonth(today);
      break;
    }
  }
  return (cells + fraction) * cellWidth;
}

/**
 * X offset (px) of the START of `isoDate`'s day column inside the chart
 * area. The sibling of todayOffsetPx (same SVAR layout model: equal-width
 * bottom-unit cells, proportional position inside a cell) with a
 * day-START fraction instead of the day-middle one — band edges must meet
 * exactly, never overlap by half a day. May return a negative value for
 * dates before the visible scale start; callers clamp.
 */
export function dayStartOffsetPx(
  zoom: SchedulerZoom,
  windowFrom: string,
  isoDate: string,
  cellWidth: number = ZOOM_CONFIG[zoom].cellWidth
): number {
  const start = scaleStartFor(zoom, windowFrom);
  const d = toLocalDate(isoDate);
  let cells: number;
  let fraction: number;
  switch (zoom) {
    case "weeks": {
      cells = differenceInCalendarDays(d, start);
      fraction = 0;
      break;
    }
    case "months": {
      const days = differenceInCalendarDays(d, start);
      cells = Math.floor(days / 7);
      fraction = (days - cells * 7) / 7;
      break;
    }
    case "quarters": {
      cells = differenceInCalendarMonths(startOfMonth(d), start);
      fraction = (getDate(d) - 1) / getDaysInMonth(d);
      break;
    }
  }
  return (cells + fraction) * cellWidth;
}

// ── Utilization thresholds ───────────────────────────────────────────────
// Metric: summed allocation_percent judged against 100. Banding: tolerance
// band — single constants, tune here.

export const UTILIZATION_UNDER_BELOW = 90;
export const UTILIZATION_OVER_ABOVE = 110;

export type UtilizationLevel = "under" | "ok" | "over";

export function utilizationLevel(totalAllocationPercent: number): UtilizationLevel {
  if (totalAllocationPercent > UTILIZATION_OVER_ABOVE) return "over";
  if (totalAllocationPercent < UTILIZATION_UNDER_BELOW) return "under";
  return "ok";
}

// ── Weekend highlighting ─────────────────────────────────────────────────

export function weekendCellCss(date: Date, unit: string): string {
  if (unit === "day" && (isSaturday(date) || isSunday(date))) {
    return "sch-weekend";
  }
  return "";
}

// ── SVAR compact threshold ───────────────────────────────────────────────

/**
 * SVAR's hardcoded compact switch (artifact constant `ss2 = 650`): at or
 * below this GANTT CONTAINER width the vendor coerces displayMode "all"
 * to "grid", making dual panes impossible. Pane selection must compare
 * against the actual host width — the viewport is the wrong signal (the
 * expanded 256px sidebar plus two 24px padding layers leaves a 416px host
 * at a 768px viewport).
 */
export const SVAR_COMPACT_THRESHOLD_PX = 650;

// ── Color logic — estado efectivo (Fase 3, plan v2 §1) ──────────────────
//
// El Scheduler original coloreaba la barra con un enum legacy de 4 valores
// (active/pending/completed/cancelled). Fase 3 reemplaza esa entrada por el
// ESTADO EFECTIVO numérico (1-9) de `development` (src/lib/engagementStatus.ts,
// fuente de verdad) y bucketiza a un color de barra — 9 colores de barra no
// son útiles visualmente; el chip de texto (engagementStateI18nKey/
// engagementStateBadgeClass) sí distingue los 9 exactamente. "Activo" para
// utilización/horas es únicamente {4,5} (canLogHours).
export function engagementTaskType(
  state: EngagementState | null | undefined
): string {
  switch (state) {
    case EngagementState.Aprobado:
    case EngagementState.AprobadoEmergencia:
      return "ems-status-active";
    case EngagementState.Pendiente:
    case EngagementState.AprobadoSocio:
    case EngagementState.AprobadoRiesgos:
      return "ems-status-pending";
    case EngagementState.Finalizado:
      return "ems-status-completed";
    case EngagementState.Cancelado:
    case EngagementState.Rechazado:
      return "ems-status-cancelled";
    case EngagementState.Congelado:
      return "ems-status-frozen";
    default:
      return "ems-neutral";
  }
}

// Leadership convention (docs/database-schema.sql): Partner and Director
// are display_order <= 2. Manager occupies the next tier — deliberately
// v1-narrow (purple = Manager ONLY; In-Charge Senior purple waits for a
// staff.is_in_charge flag).
export const LEADER_FIRM_MAX_DISPLAY_ORDER = 2;
export const LEADER_MANAGER_DISPLAY_ORDER = 3;

/**
 * L2 bar type: leadership identity overrides load for Partners/Directors
 * (teal) and Managers (purple); everyone else — including ALL Seniors in
 * v1 — carries load colors (1 green, 2–3 yellow, 4+ red; muted tones).
 */
export function staffTaskType(
  categoryDisplayOrder: number | null | undefined,
  activeEngagementCount: number | null | undefined
): string {
  if (
    categoryDisplayOrder != null &&
    categoryDisplayOrder <= LEADER_FIRM_MAX_DISPLAY_ORDER
  ) {
    return "ems-leader-firm";
  }
  if (categoryDisplayOrder === LEADER_MANAGER_DISPLAY_ORDER) {
    return "ems-leader-manager";
  }
  const count = activeEngagementCount ?? 0;
  if (count >= 4) return "ems-load-4";
  if (count >= 2) return "ems-load-2";
  if (count === 1) return "ems-load-1";
  return "ems-neutral";
}

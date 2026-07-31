// Pure Gantt logic tests: date round-trips (no one-day drift), Today-line
// geometry at every zoom, weekend css, and the color thresholds.
//
// Fase 3 (plan v2 §1): engagementTaskType ahora toma el ESTADO EFECTIVO
// numérico (EngagementState de src/lib/engagementStatus.ts), no el enum
// legacy de 4 valores — ver el describe adaptado más abajo.

import { describe, expect, it } from "vitest";
import { EngagementState } from "@/lib/engagementStatus";
import {
  dateStringFromSvarEnd,
  dayStartOffsetPx,
  engagementTaskType,
  isSchedulerZoom,
  isStrictIsoDate,
  scaleStartFor,
  staffTaskType,
  svarEndFromDateString,
  toDateString,
  todayOffsetPx,
  toLocalDate,
  UTILIZATION_OVER_ABOVE,
  UTILIZATION_UNDER_BELOW,
  utilizationLevel,
  weekendCellCss,
  ZOOM_CONFIG,
  zoomScalesFor,
} from "../schedulerGantt";

describe("date mapping (yyyy-MM-dd ↔ Date)", () => {
  it("round-trips without drift across month/year/DST boundaries", () => {
    for (const s of [
      "2026-01-01",
      "2026-02-28",
      "2026-03-08", // US DST spring-forward window
      "2026-07-17",
      "2026-11-01", // US DST fall-back window
      "2026-12-31",
    ]) {
      expect(toDateString(toLocalDate(s))).toBe(s);
    }
  });

  it("inclusive EMS end_date ↔ exclusive SVAR end round-trips exactly", () => {
    for (const s of ["2026-01-31", "2026-02-28", "2026-12-31"]) {
      expect(dateStringFromSvarEnd(svarEndFromDateString(s))).toBe(s);
    }
    // and the exclusive boundary is really +1 day
    expect(toDateString(svarEndFromDateString("2026-01-31"))).toBe("2026-02-01");
  });

  it("parses as LOCAL dates (no UTC-midnight shift)", () => {
    const d = toLocalDate("2026-07-17");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(17);
    expect(d.getHours()).toBe(0);
  });
});

describe("todayOffsetPx (EMS Today line)", () => {
  // Chart origin follows the BOTTOM scale unit (day / week / month).
  it("weeks zoom (day cells): origin is the window's own first day", () => {
    expect(toDateString(scaleStartFor("weeks", "2026-07-01"))).toBe("2026-07-01");
    // Today = 2026-07-03: 2 whole day cells, line mid-column.
    const px = todayOffsetPx("weeks", "2026-07-01", toLocalDate("2026-07-03"), 28);
    expect(px).toBeCloseTo((2 + 0.5) * 28, 5);
  });

  it("months zoom (week cells): origin is the Monday of the window's week", () => {
    // 2026-07-01 is a Wednesday → scale starts Monday 2026-06-29.
    expect(toDateString(scaleStartFor("months", "2026-07-01"))).toBe("2026-06-29");
    // Today = Friday 2026-07-03: 4 whole days after scale start.
    const px = todayOffsetPx("months", "2026-07-01", toLocalDate("2026-07-03"), 60);
    expect(px).toBeCloseTo(((4 + 0.5) / 7) * 60, 5);
  });

  it("quarters zoom (month cells): whole months plus day fraction", () => {
    // Window from mid-March → scale start 2026-03-01. Today 2026-07-17:
    // 4 whole months (Mar..Jun), fraction (17-1+0.5)/31 of July's cell.
    expect(toDateString(scaleStartFor("quarters", "2026-03-15"))).toBe("2026-03-01");
    const px = todayOffsetPx("quarters", "2026-03-15", toLocalDate("2026-07-17"), 90);
    expect(px).toBeCloseTo((4 + 16.5 / 31) * 90, 5);
  });

  it("returns null when today precedes the visible scale start", () => {
    expect(todayOffsetPx("weeks", "2026-07-01", toLocalDate("2026-06-30"))).toBeNull();
  });

  it("uses each zoom's default cellWidth when none is passed", () => {
    const px = todayOffsetPx("quarters", "2026-07-01", toLocalDate("2026-07-01"));
    expect(px).toBeCloseTo((0.5 / 31) * ZOOM_CONFIG.quarters.cellWidth, 5);
  });
});

describe("weekendCellCss", () => {
  it("marks Saturdays and Sundays only at day granularity", () => {
    const sat = toLocalDate("2026-07-18");
    const sun = toLocalDate("2026-07-19");
    const fri = toLocalDate("2026-07-17");
    expect(weekendCellCss(sat, "day")).toBe("sch-weekend");
    expect(weekendCellCss(sun, "day")).toBe("sch-weekend");
    expect(weekendCellCss(fri, "day")).toBe("");
    expect(weekendCellCss(sat, "hour")).toBe("");
  });
});

describe("engagementTaskType (Fase 3: estado efectivo numérico 1-9, plan v2 §1)", () => {
  it("Aprobado(4) y AprobadoEmergencia(5) → ems-status-active", () => {
    expect(engagementTaskType(EngagementState.Aprobado)).toBe("ems-status-active");
    expect(engagementTaskType(EngagementState.AprobadoEmergencia)).toBe("ems-status-active");
  });
  it("Pendiente(1)/AprobadoSocio(2)/AprobadoRiesgos(3) → ems-status-pending", () => {
    expect(engagementTaskType(EngagementState.Pendiente)).toBe("ems-status-pending");
    expect(engagementTaskType(EngagementState.AprobadoSocio)).toBe("ems-status-pending");
    expect(engagementTaskType(EngagementState.AprobadoRiesgos)).toBe("ems-status-pending");
  });
  it("Finalizado(7) → ems-status-completed", () => {
    expect(engagementTaskType(EngagementState.Finalizado)).toBe("ems-status-completed");
  });
  it("Cancelado(6) y Rechazado(8) → ems-status-cancelled", () => {
    expect(engagementTaskType(EngagementState.Cancelado)).toBe("ems-status-cancelled");
    expect(engagementTaskType(EngagementState.Rechazado)).toBe("ems-status-cancelled");
  });
  it("Congelado(9) → ems-status-frozen (bucket nuevo, sin equivalente legacy)", () => {
    expect(engagementTaskType(EngagementState.Congelado)).toBe("ems-status-frozen");
  });
  it("estado desconocido/null/undefined → ems-neutral (representación segura)", () => {
    expect(engagementTaskType(null)).toBe("ems-neutral");
    expect(engagementTaskType(undefined)).toBe("ems-neutral");
  });
});

describe("staffTaskType (identity for leaders, load for everyone else)", () => {
  it("Partner/Director (display_order ≤ 2) → teal regardless of load", () => {
    expect(staffTaskType(1, 5)).toBe("ems-leader-firm");
    expect(staffTaskType(2, 1)).toBe("ems-leader-firm");
  });
  it("Manager (display_order 3) → purple regardless of load", () => {
    expect(staffTaskType(3, 1)).toBe("ems-leader-manager");
    expect(staffTaskType(3, 6)).toBe("ems-leader-manager");
  });
  it("Seniors and below keep load colors in v1 (deliberate narrowing)", () => {
    expect(staffTaskType(4, 1)).toBe("ems-load-1");
    expect(staffTaskType(4, 2)).toBe("ems-load-2");
    expect(staffTaskType(5, 3)).toBe("ems-load-2");
    expect(staffTaskType(6, 4)).toBe("ems-load-4");
    expect(staffTaskType(9, 12)).toBe("ems-load-4");
  });
  it("unknown category or zero load → neutral", () => {
    expect(staffTaskType(null, 0)).toBe("ems-neutral");
    expect(staffTaskType(undefined, undefined)).toBe("ems-neutral");
    expect(staffTaskType(4, 0)).toBe("ems-neutral");
  });
});

describe("isStrictIsoDate", () => {
  it("accepts canonical real dates including leap days", () => {
    expect(isStrictIsoDate("2026-07-17")).toBe(true);
    expect(isStrictIsoDate("2028-02-29")).toBe(true); // leap year
    expect(isStrictIsoDate("2026-12-31")).toBe(true);
  });
  it("rejects impossible dates that JavaScript would roll over", () => {
    expect(isStrictIsoDate("2026-02-29")).toBe(false); // not a leap year
    expect(isStrictIsoDate("2026-02-30")).toBe(false);
    expect(isStrictIsoDate("2026-02-31")).toBe(false);
    expect(isStrictIsoDate("2026-13-01")).toBe(false);
    expect(isStrictIsoDate("2026-00-10")).toBe(false);
    expect(isStrictIsoDate("2026-04-31")).toBe(false);
  });
  it("rejects non-canonical shapes and non-strings", () => {
    expect(isStrictIsoDate("2026-7-1")).toBe(false);
    expect(isStrictIsoDate("17/07/2026")).toBe(false);
    expect(isStrictIsoDate("invalid")).toBe(false);
    expect(isStrictIsoDate("")).toBe(false);
    expect(isStrictIsoDate(null)).toBe(false);
    expect(isStrictIsoDate(20260717)).toBe(false);
  });
});

describe("zoomScalesFor localization", () => {
  const march = toLocalDate("2026-03-05");
  it("English: English month names, W/Q prefixes", () => {
    const months = zoomScalesFor("months", "en");
    expect(months[0].format(march)).toBe("Mar 2026");
    expect(months[1].format(march)).toMatch(/^W\d{2}$/);
    const quarters = zoomScalesFor("quarters", "en");
    expect(quarters[0].format(march)).toBe("Q1 2026");
  });
  it("Spanish: Spanish month names, S/T prefixes", () => {
    const months = zoomScalesFor("months", "es");
    expect(months[0].format(march)).toBe("mar 2026");
    expect(months[1].format(march)).toMatch(/^S\d{2}$/);
    const quarters = zoomScalesFor("quarters", "es");
    expect(quarters[0].format(march)).toBe("T1 2026");
    // month row on the quarters zoom uses the Spanish abbreviation
    expect(zoomScalesFor("quarters", "es")[1].format(toLocalDate("2026-01-15"))).toBe("ene");
  });
});

describe("isSchedulerZoom", () => {
  it("accepts the three zooms, rejects everything else", () => {
    expect(isSchedulerZoom("weeks")).toBe(true);
    expect(isSchedulerZoom("months")).toBe(true);
    expect(isSchedulerZoom("quarters")).toBe(true);
    expect(isSchedulerZoom("days")).toBe(false);
    expect(isSchedulerZoom(undefined)).toBe(false);
  });
});

// ── Utilization band geometry ────────────────────────────────────────

describe("dayStartOffsetPx (utilization band geometry)", () => {
  it("weeks zoom: one cell per day from the window's first day", () => {
    expect(dayStartOffsetPx("weeks", "2026-01-05", "2026-01-05")).toBe(0);
    expect(dayStartOffsetPx("weeks", "2026-01-05", "2026-01-08")).toBe(
      3 * ZOOM_CONFIG.weeks.cellWidth
    );
  });

  it("months zoom: week cells from the Monday scale start, day-proportional inside", () => {
    // 2026-01-05 IS a Monday — scale start equals the window start.
    const cw = ZOOM_CONFIG.months.cellWidth;
    expect(dayStartOffsetPx("months", "2026-01-05", "2026-01-05")).toBe(0);
    expect(dayStartOffsetPx("months", "2026-01-05", "2026-01-12")).toBe(cw);
    expect(dayStartOffsetPx("months", "2026-01-05", "2026-01-08")).toBeCloseTo((3 / 7) * cw, 6);
  });

  it("quarters zoom: month cells with variable day counts", () => {
    const cw = ZOOM_CONFIG.quarters.cellWidth;
    expect(dayStartOffsetPx("quarters", "2026-01-01", "2026-02-01")).toBe(cw);
    // Feb 15 2026: 14 days into a 28-day month → half a cell further.
    expect(dayStartOffsetPx("quarters", "2026-01-01", "2026-02-15")).toBeCloseTo(
      cw + (14 / 28) * cw,
      6
    );
  });

  it("adjacent spans tile the axis: widths of [a,b) and [b,c) sum to [a,c) at every zoom", () => {
    const [a, b, c] = ["2026-02-10", "2026-03-07", "2026-05-19"];
    for (const zoom of ["weeks", "months", "quarters"] as const) {
      const oa = dayStartOffsetPx(zoom, "2026-01-01", a);
      const ob = dayStartOffsetPx(zoom, "2026-01-01", b);
      const oc = dayStartOffsetPx(zoom, "2026-01-01", c);
      expect(ob - oa + (oc - ob)).toBeCloseTo(oc - oa, 6);
      expect(ob).toBeGreaterThan(oa);
      expect(oc).toBeGreaterThan(ob);
    }
  });
});

describe("utilizationLevel (metric 1a, banding 2a)", () => {
  it("tolerance band: under < 90, ok 90–110, over > 110", () => {
    expect(utilizationLevel(0)).toBe("under");
    expect(utilizationLevel(UTILIZATION_UNDER_BELOW - 1)).toBe("under");
    expect(utilizationLevel(UTILIZATION_UNDER_BELOW)).toBe("ok");
    expect(utilizationLevel(100)).toBe("ok");
    expect(utilizationLevel(UTILIZATION_OVER_ABOVE)).toBe("ok");
    expect(utilizationLevel(UTILIZATION_OVER_ABOVE + 1)).toBe("over");
    expect(utilizationLevel(200)).toBe("over");
  });
});

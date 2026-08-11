// scheduler-gaps transport: typed rows, runtime validators, and the
// invoke helper. A sibling of schedulerData.ts that REUSES its exported
// error classes and mapping — same contract: failures THROW; Unavailable
// ≠ Empty ≠ Error.
//
// Two gaps-specific rules on top of the scheduler-data contract:
//   - a 503 envelope with code "schema_not_ready" ALSO maps to
//     SchedulerUnavailableError: the pre-apply schema window is an
//     unavailability, not an error the user can retry away.
//   - every 2xx body runs through a per-action runtime validator before
//     it reaches React Query (a cast is not validation). Only a literal
//     rows: [] is authoritative-empty; anything malformed throws
//     SchedulerDataError("malformed_response"), rendered as the Error
//     state — never as Empty or NaN-contaminated KPIs.
//
// Fase 3 (plan v2 §3, issue §11): las categorías se agrupan por
// `service_id + category_id` (nunca por nombre) — cada fila trae también
// `serviceId`/`serviceName`/`displayOrder` para que categorías homónimas de
// servicios distintos nunca se mezclen en la UI.

import { supabase } from "@/integrations/supabase/client";
import {
  mapInvokeFailure,
  SchedulerDataError,
  SchedulerUnavailableError,
} from "./schedulerData";

export interface CategoryHeadcountGapRow {
  serviceId: string;
  serviceName: string;
  categoryId: string;
  categoryName: string;
  displayOrder: number;
  demandFteDays: number;
  suppliedFteDays: number;
  gapFteDays: number;
  avgOpenSeats: number;
}
export interface CategoryHeadcountGapResult {
  rows: CategoryHeadcountGapRow[];
}

export interface CategoryHoursGapRow {
  serviceId: string;
  serviceName: string;
  categoryId: string;
  categoryName: string;
  displayOrder: number;
  demandHours: number;
  projectedSupplyHours: number;
  gapHours: number;
}
export interface CategoryHoursGapResult {
  rows: CategoryHoursGapRow[];
}

export type GapMinLevel = "Beginner" | "Intermediate" | "Advanced";

export interface CompetencyShortageRow {
  serviceId: string;
  serviceName: string;
  categoryId: string;
  categoryName: string;
  displayOrder: number;
  skillId: string;
  skillName: string;
  minLevel: GapMinLevel;
  demandCount: number;
  supplyCount: number;
  deficit: number;
}
/** The result-level fields are part of the typed contract:
 *  deficitRowCount is the UNCAPPED count of deficit>0 combos — the KPI
 *  reads it, never the capped row list. */
export interface CompetencyShortageResult {
  rows: CompetencyShortageRow[];
  truncated: boolean;
  deficitRowCount: number;
}

export interface BenchRow {
  staffId: string;
  staffName: string;
  serviceId: string | null;
  serviceName: string | null;
  categoryName: string | null;
  currentAllocationPct: number;
  topSkills: string[];
}
export interface BenchResult {
  rows: BenchRow[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_LEVELS = new Set(["Beginner", "Intermediate", "Advanced"]);
const COMPETENCY_ROW_CAP = 500;

/** Proficiency ordinal — kept in sync with src/lib/staffingMatch.ts
 *  LEVEL_ORDER (not exported there). Used by the SkillShortageTable
 *  client re-sort, which must mirror the server's total order exactly. */
export const GAP_LEVEL_ORDER: Record<GapMinLevel, number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
};

/** The server's total order — deficit DESC, serviceName ASC, categoryName
 *  ASC, skillName ASC, minLevel strictness DESC, categoryId ASC, skillId
 *  ASC. Any client re-sort must mirror these tie-breakers so the UI never
 *  undoes the server ordering. Service is the primary tie-breaker so
 *  homonymous categories in different services never interleave. */
export function compareCompetencyShortageRows(
  a: CompetencyShortageRow,
  b: CompetencyShortageRow
): number {
  return (
    b.deficit - a.deficit ||
    (a.serviceName < b.serviceName ? -1 : a.serviceName > b.serviceName ? 1 : 0) ||
    (a.categoryName < b.categoryName ? -1 : a.categoryName > b.categoryName ? 1 : 0) ||
    (a.skillName < b.skillName ? -1 : a.skillName > b.skillName ? 1 : 0) ||
    GAP_LEVEL_ORDER[b.minLevel] - GAP_LEVEL_ORDER[a.minLevel] ||
    (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0) ||
    (a.skillId < b.skillId ? -1 : a.skillId > b.skillId ? 1 : 0)
  );
}

const malformed = (detail: string): SchedulerDataError =>
  new SchedulerDataError(
    "malformed_response",
    `scheduler-gaps returned a malformed payload: ${detail}`
  );

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isNonNegativeInteger = (v: unknown): v is number =>
  isFiniteNumber(v) && Number.isInteger(v) && v >= 0;

/** Floating-point-safe equality for validating server-derived values: the
 *  server computes with raw FP, so the client must accept legitimate
 *  residues while rejecting contradictory metrics (e.g. a 999-day gap
 *  beside zero demand and supply). */
const approxEqual = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

/** Inclusive day count between two strict-ISO dates — kept in sync with
 *  the handler's dayOrdinal arithmetic (pure string→ordinal). */
export function windowDaysBetween(from: string, to: string): number {
  const ord = (iso: string): number => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return ord(to) - ord(from) + 1;
}

function requireRows(data: unknown): Record<string, unknown>[] {
  if (!isRecord(data)) throw malformed("body is not an object");
  // A 2xx body NEVER carries an `error` member — its PRESENCE is the
  // defect, regardless of the member's value or shape (`error: null` /
  // `{}` / "failed" / empty-code shapes must never let rows: [] render
  // as authoritative Empty).
  if ("error" in data) {
    throw malformed("a success body must not carry an error member");
  }
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) throw malformed("rows is not an array");
  return rows.map((r) => {
    if (!isRecord(r)) throw malformed("row is not an object");
    return r;
  });
}

function requireServiceAndCategory(r: Record<string, unknown>): void {
  if (!isUuid(r.serviceId)) throw malformed("serviceId is not a UUID");
  if (typeof r.serviceName !== "string") throw malformed("serviceName is not a string");
  if (!isUuid(r.categoryId)) throw malformed("categoryId is not a UUID");
  if (typeof r.categoryName !== "string") throw malformed("categoryName is not a string");
  if (!isNonNegativeInteger(r.displayOrder)) throw malformed("displayOrder is not a non-negative integer");
}

export function parseCategoryHeadcountGapResult(
  data: unknown,
  /** Inclusive day count of the requested window — the validator
   *  cross-checks avgOpenSeats against it (derived values must be
   *  consistent, not merely finite). */
  windowDays: number
): CategoryHeadcountGapResult {
  if (!Number.isFinite(windowDays) || windowDays < 1) {
    throw malformed("window day count is invalid");
  }
  const rows = requireRows(data).map((r): CategoryHeadcountGapRow => {
    requireServiceAndCategory(r);
    for (const field of ["demandFteDays", "suppliedFteDays", "gapFteDays", "avgOpenSeats"] as const) {
      if (!isFiniteNumber(r[field])) throw malformed(`${field} is not a finite number`);
    }
    // The response equations are part of the contract: a contradictory
    // successful body must never render persuasive false KPIs.
    const demand = r.demandFteDays as number;
    const supply = r.suppliedFteDays as number;
    const gap = r.gapFteDays as number;
    if (!approxEqual(gap, demand - supply)) {
      throw malformed("gapFteDays contradicts demandFteDays - suppliedFteDays");
    }
    if (!approxEqual(r.avgOpenSeats as number, gap / windowDays)) {
      throw malformed("avgOpenSeats contradicts gapFteDays over the window");
    }
    return {
      serviceId: r.serviceId as string,
      serviceName: r.serviceName as string,
      categoryId: r.categoryId as string,
      categoryName: r.categoryName as string,
      displayOrder: r.displayOrder as number,
      demandFteDays: demand,
      suppliedFteDays: supply,
      gapFteDays: gap,
      avgOpenSeats: r.avgOpenSeats as number,
    };
  });
  return { rows };
}

export function parseCategoryHoursGapResult(data: unknown): CategoryHoursGapResult {
  const rows = requireRows(data).map((r): CategoryHoursGapRow => {
    requireServiceAndCategory(r);
    for (const field of ["demandHours", "projectedSupplyHours", "gapHours"] as const) {
      if (!isFiniteNumber(r[field])) throw malformed(`${field} is not a finite number`);
    }
    // Response equation.
    if (
      !approxEqual(
        r.gapHours as number,
        (r.demandHours as number) - (r.projectedSupplyHours as number)
      )
    ) {
      throw malformed("gapHours contradicts demandHours - projectedSupplyHours");
    }
    return {
      serviceId: r.serviceId as string,
      serviceName: r.serviceName as string,
      categoryId: r.categoryId as string,
      categoryName: r.categoryName as string,
      displayOrder: r.displayOrder as number,
      demandHours: r.demandHours as number,
      projectedSupplyHours: r.projectedSupplyHours as number,
      gapHours: r.gapHours as number,
    };
  });
  return { rows };
}

export function parseCompetencyShortageResult(
  data: unknown
): CompetencyShortageResult {
  const rows = requireRows(data).map((r): CompetencyShortageRow => {
    requireServiceAndCategory(r);
    if (!isUuid(r.skillId)) throw malformed("skillId is not a UUID");
    if (typeof r.skillName !== "string") throw malformed("skillName is not a string");
    if (typeof r.minLevel !== "string" || !MIN_LEVELS.has(r.minLevel)) {
      throw malformed("minLevel is not a proficiency level");
    }
    for (const field of ["demandCount", "supplyCount", "deficit"] as const) {
      if (!isNonNegativeInteger(r[field])) {
        throw malformed(`${field} is not a non-negative integer`);
      }
    }
    // Response equation — integer arithmetic, so the check is exact.
    if (
      (r.deficit as number) !==
      Math.max(0, (r.demandCount as number) - (r.supplyCount as number))
    ) {
      throw malformed("deficit contradicts max(0, demandCount - supplyCount)");
    }
    return {
      serviceId: r.serviceId as string,
      serviceName: r.serviceName as string,
      categoryId: r.categoryId as string,
      categoryName: r.categoryName as string,
      displayOrder: r.displayOrder as number,
      skillId: r.skillId as string,
      skillName: r.skillName as string,
      minLevel: r.minLevel as GapMinLevel,
      demandCount: r.demandCount as number,
      supplyCount: r.supplyCount as number,
      deficit: r.deficit as number,
    };
  });

  // The server caps competency rows at 500 UNCONDITIONALLY — a body
  // exceeding the cap is impossible regardless of the truncated flag
  // (501 rows with truncated: false must never pass).
  if (rows.length > COMPETENCY_ROW_CAP) {
    throw malformed("row count exceeds the server cap");
  }

  if (!isRecord(data) || typeof (data as { truncated?: unknown }).truncated !== "boolean") {
    throw malformed("truncated is not a boolean");
  }
  const truncated = (data as { truncated: boolean }).truncated;
  const deficitRowCount = (data as { deficitRowCount?: unknown }).deficitRowCount;
  if (!isNonNegativeInteger(deficitRowCount)) {
    throw malformed("deficitRowCount is not a non-negative integer");
  }

  // FULL truncation-consistency invariant (the naive rule accepted
  // impossible payloads like {rows: [], truncated: true,
  // deficitRowCount: 999}). The server sorts by descending deficit BEFORE
  // the 500-row cap, so the client can enforce all of this without
  // knowing the uncapped result.
  const visiblePositiveCount = rows.filter((r) => r.deficit > 0).length;
  if (!truncated) {
    if (deficitRowCount !== visiblePositiveCount) {
      throw malformed("deficitRowCount disagrees with the visible deficit rows");
    }
  } else {
    if (rows.length !== COMPETENCY_ROW_CAP) {
      throw malformed("a truncated response must carry exactly the row cap");
    }
    if (visiblePositiveCount < COMPETENCY_ROW_CAP) {
      // A zero-deficit row is visible, so every positive row already fits.
      if (deficitRowCount !== visiblePositiveCount) {
        throw malformed("deficitRowCount exceeds the visible positive rows");
      }
    } else if (deficitRowCount < COMPETENCY_ROW_CAP) {
      // All 500 visible rows are positive — the only legal excess case is
      // deficitRowCount >= 500.
      throw malformed("deficitRowCount is below the visible positive rows");
    }
  }
  return { rows, truncated, deficitRowCount };
}

export function parseBenchResult(data: unknown): BenchResult {
  const rows = requireRows(data).map((r): BenchRow => {
    if (!isUuid(r.staffId)) throw malformed("staffId is not a UUID");
    if (typeof r.staffName !== "string") throw malformed("staffName is not a string");
    if (r.serviceId !== null && !isUuid(r.serviceId)) {
      throw malformed("serviceId is not a UUID or null");
    }
    if (r.serviceName !== null && typeof r.serviceName !== "string") {
      throw malformed("serviceName is not a string or null");
    }
    if (r.categoryName !== null && typeof r.categoryName !== "string") {
      throw malformed("categoryName is not a string or null");
    }
    if (!isFiniteNumber(r.currentAllocationPct) || r.currentAllocationPct < 0) {
      throw malformed("currentAllocationPct is not a non-negative number");
    }
    if (
      !Array.isArray(r.topSkills) ||
      r.topSkills.length > 3 ||
      r.topSkills.some((s) => typeof s !== "string")
    ) {
      throw malformed("topSkills is not an array of up to 3 strings");
    }
    return {
      staffId: r.staffId,
      staffName: r.staffName,
      serviceId: (r.serviceId as string | null) ?? null,
      serviceName: (r.serviceName as string | null) ?? null,
      categoryName: (r.categoryName as string | null) ?? null,
      currentAllocationPct: r.currentAllocationPct as number,
      topSkills: r.topSkills as string[],
    };
  });
  return { rows };
}

interface EnvelopeError {
  error?: { code?: string; message?: string };
}

/** Gaps-specific failure mapping (exported for unit tests): defers to
 *  scheduler-data's mapInvokeFailure, then reroutes the schema_not_ready
 *  envelope to Unavailable. */
export function mapGapsInvokeFailure(
  errorName: string | undefined,
  status: number | undefined,
  body: unknown
): SchedulerDataError | SchedulerUnavailableError {
  const mapped = mapInvokeFailure(errorName, status, body);
  if (mapped instanceof SchedulerDataError && mapped.code === "schema_not_ready") {
    return new SchedulerUnavailableError();
  }
  return mapped;
}

export async function invokeSchedulerGaps(
  body: Record<string, unknown>
): Promise<unknown> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase.functions.invoke("scheduler-gaps", {
      body,
    }));
  } catch {
    throw new SchedulerUnavailableError();
  }

  if (error) {
    const e = error as {
      name?: string;
      context?: { status?: number; json?: () => Promise<unknown> };
    };
    let parsedBody: unknown = null;
    try {
      parsedBody = await e.context?.json?.();
    } catch {
      parsedBody = null;
    }
    throw mapGapsInvokeFailure(e.name, e.context?.status, parsedBody);
  }

  // Defensive: a 2xx body carrying ANY top-level `error` member is a
  // defect (the member's presence alone is invalid). A well-formed
  // envelope keeps its typed code so the ladder can classify it (e.g.
  // forbidden); every other shape — null, {}, a string, an empty code —
  // throws malformed_response and renders Error, never Empty.
  if (isRecord(data) && "error" in data) {
    const envelope = data as EnvelopeError;
    if (
      typeof envelope.error?.code === "string" &&
      envelope.error.code.length > 0
    ) {
      // A protocol-invalid 2xx envelope gets the SAME classification as
      // its non-2xx counterpart: a schema_not_ready code renders
      // Unavailable, never a generic retried Error.
      if (envelope.error.code === "schema_not_ready") {
        throw new SchedulerUnavailableError();
      }
      throw new SchedulerDataError(
        envelope.error.code,
        envelope.error.message ?? "Scheduler gaps request failed"
      );
    }
    throw new SchedulerDataError(
      "malformed_response",
      "scheduler-gaps returned a success body carrying an error member"
    );
  }
  return data;
}

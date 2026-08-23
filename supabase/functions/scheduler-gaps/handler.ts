// scheduler-gaps — pure handler module.
//
// NO Deno imports and NO direct Supabase client construction here: the
// Deno entry (index.ts) injects a service-role client and the verified
// caller identity, keeping the complete handler — including the role
// gate — testable under vitest with the in-memory PostgREST fake
// (src/test/edge-functions/postgrestMock.ts).
//
// SECURITY: the injected client is service-role — RLS is bypassed.
// gapsVisibility() below is therefore a data-confidentiality control, not
// a UI convenience: it is the firmwide-only slice of the D5 visibility
// matrix (has_firmwide_assignment_visibility(), migration 20260717233000)
// and MUST run before any query.
//
// There is deliberately no _shared/ directory in this repo; small helpers
// are byte-synced copies with comments naming their source. chunkedIn is
// deliberately NOT byte-synced — see its header.
//
// Fase 3 (plan v2 §1, §3): el estado del engagement ya NO se filtra por
// la columna legacy `status='active'` — se deriva el ESTADO EFECTIVO
// (1-9, engagementState.ts, copia byte-sincronizada de development)
// leyendo `engagement_state_override` + el Work Order gobernante (vista
// RLS-safe `engagement_wo_state`, 1:1 por engagement_id). "Activo" para
// gaps/utilización es únicamente el bucket {Aprobado, AprobadoEmergencia}.
// Además, las categorías se agrupan por `practica_id + category_id` (nunca
// por nombre) para que homónimas de servicios distintos no se mezclen.

import {
  effectiveEngagementState,
  engagementStateBucket,
} from "./engagementState.ts";

// ── Minimal PostgREST-shaped client contract ────────────────────────────
// Only the chain methods this handler actually uses. Both the real
// supabase-js client and the test fake satisfy this shape. gt() is the
// keyset-pagination cursor filter.
export interface DbQuery {
  select(columns: string): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  in(column: string, values: unknown[]): DbQuery;
  is(column: string, value: null): DbQuery;
  lte(column: string, value: string): DbQuery;
  gte(column: string, value: string): DbQuery;
  gt(column: string, value: unknown): DbQuery;
  order(
    column: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean }
  ): DbQuery;
  limit(count: number): DbQuery;
  then<T>(
    onfulfilled: (value: { data: unknown[] | null; error: DbError | null }) => T
  ): Promise<T>;
}
export interface DbError {
  code?: string;
  message?: string;
}
export interface DbClient {
  from(table: string): DbQuery;
}

export interface GapsContext {
  db: DbClient;
  /** Verified via JWT → staff.auth_user_id; null when no staff row. */
  staffId: string | null;
  /** Verified via user_roles.role_key (23-role catalog); "" when no row. */
  role: string;
  /** Server UTC today, yyyy-MM-dd (bench is computed "as of today"). */
  todayUtc: string;
}

export interface HandlerResult {
  status: number;
  payload: unknown;
}

// ── Error envelope: non-2xx carries { error: { code, message } } ──
const err = (status: number, code: string, message: string): HandlerResult => ({
  status,
  payload: { error: { code, message } },
});

// Control-flow carrier so deep read/validation failures abort the whole
// action with a typed envelope: an aggregate must never be computed from
// partial inputs.
class ActionError extends Error {
  constructor(public readonly result: HandlerResult) {
    super("scheduler-gaps action aborted");
  }
}

// PostgREST codes treated as "schema not ready". Byte-synced set from
// scheduler-data/handler.ts — but enforced at ACTION level here: any
// required read failing with one of these codes fails the whole action
// with 503 schema_not_ready. scheduler-data's per-read empty-rows swallow
// suits an operational list; for a multi-read aggregate an absent input is
// indistinguishable from a zero and would report false maximum deficits.
export const SCHEMA_NOT_READY_CODES = new Set(["42P01", "42703", "PGRST200"]);

// ── Role gate ─────────────────────────────────────────────────────────
// Firmwide-only slice of the D5 visibility matrix: the role set of
// has_firmwide_assignment_visibility() (migration 20260717233000).
// Stricter than scheduler-data's visibilityRuleFor: manager/senior get
// lead/assigned there, but this is a firmwide readout — they are DENIED
// here.
//
// Merge with feat/roles-permisos (2026-08): role is user_roles.role_key
// (23-role catalog), not the legacy enum — see the matching comment in
// scheduler-data/handler.ts and src/lib/schedulerAccess.ts.
export function gapsVisibility(role: string): "all" | "denied" {
  return role === "admin" || role === "senior_partner" || role === "partner" || role === "director"
    ? "all"
    : "denied";
}

// ── Identity resolution ────────────────────────────────────────────────
// Byte-synced copy from scheduler-data/handler.ts — copy, don't re-derive:
// a DB failure here must surface as a 500 — NEVER silently default the
// role to "" (denied), which gapsVisibility maps to denied: during a
// connectivity hiccup admins would otherwise receive 403s
// indistinguishable from genuine permission failures. Plain list queries
// (no .single()) keep "zero rows" — a legitimate state for both tables —
// distinct from transport errors without PGRST116 special-casing;
// user_roles has UNIQUE (user_id), so at most one row exists. These two
// .limit(1) single-row lookups are the sole exemption from the
// pagedSelect rule.

export interface VerifiedIdentity {
  staffId: string | null;
  role: string;
}

export async function resolveIdentity(
  db: DbClient,
  userId: string
): Promise<{ identity: VerifiedIdentity | null; error: DbError | null }> {
  const staffRes = await db
    .from("staff")
    .select("staff_id")
    .eq("auth_user_id", userId)
    .limit(1)
    .then((r) => r);
  if (staffRes.error) return { identity: null, error: staffRes.error };

  const roleRes = await db
    .from("user_roles")
    .select("role_key")
    .eq("user_id", userId)
    .limit(1)
    .then((r) => r);
  if (roleRes.error) return { identity: null, error: roleRes.error };

  const staffRow = (staffRes.data ?? [])[0] as { staff_id: string } | undefined;
  const roleRow = (roleRes.data ?? [])[0] as { role_key: string | null } | undefined;
  return {
    identity: {
      staffId: staffRow?.staff_id ?? null,
      role: roleRow?.role_key ?? "",
    },
    error: null,
  };
}

// ── Constants ──────────────────────────────────────────────────────────
export const MAX_RANGE_DAYS = 730;
/** Bench = allocation strictly below this percent. */
export const BENCH_ALLOCATION_THRESHOLD = 50;
/** Keyset page size. The server may cap lower; a short-but-nonempty page
 *  just advances the cursor. */
export const PAGE_SIZE = 1000;
/** PostgREST .in() filters travel in the URL — chunk at 100 ids.
 *  Byte-synced constant from scheduler-data/handler.ts. */
export const IN_CHUNK_SIZE = 100;

/** Proficiency ordinal — byte-synced copy of LEVEL_ORDER from
 *  src/lib/staffingMatch.ts (Deno functions cannot import app modules). A
 *  required level is a minimum (≥). */
export const LEVEL_ORDER: Record<string, number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
};

/** Schema-correct keyset cursor column per table. engagement_assignments
 *  is `assignment_id` — NOT `id`; a projection selecting `id` would 42703
 *  into permanent Unavailable. Every projection MUST include its table's
 *  PK: the cursor is computed from returned rows. */
export const TABLE_PK: Record<string, string> = {
  engagements: "engagement_id",
  // Fase 3: vista RLS-safe 1:1 (work_orders.engagement_id es UNIQUE) para
  // resolver el estado efectivo del engagement.
  engagement_wo_state: "engagement_id",
  work_orders: "wo_id",
  wo_staffing_requirements: "id",
  wo_staffing_requirement_skills: "id",
  wo_budget_lines: "wo_line_id",
  engagement_assignments: "assignment_id",
  staff: "staff_id",
  staff_skills: "staff_skill_id",
  skills: "skill_id",
  categories: "category_id",
  // Fase 3: para poblar serviceId/serviceName en las filas de gaps.
  practicas: "practica_id",
};

// ── Input validation ────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Strict canonical yyyy-MM-dd validation: JavaScript's Date rolls
 * impossible dates over (2026-02-31 parses as Mar 3), so the original
 * invalid string would reach PostgREST and surface as a query error
 * instead of a typed 400. Components must round-trip exactly.
 * Byte-synced copy from supabase/functions/scheduler-data/handler.ts.
 */
export function isStrictIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

// ── Date-safe day arithmetic ────────────────────────────────────────────
// Pure string→ordinal conversion: date-only values are never parsed via
// the Date string constructor. Inputs are validated strict-ISO before
// they reach these helpers.
export function dayOrdinal(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Inclusive day count of the intersection of two ordinal intervals; 0
 *  when they don't overlap. */
export function overlapDaysOrd(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart) + 1);
}

// ── Keyset pagination — the ONLY read primitive ──────────────
// `build` is a query FACTORY: a PostgREST builder cannot be reused across
// pages, so each page constructs a fresh builder and applies
// .order(pk).gt(pk, lastSeenPk).limit(PAGE_SIZE), terminating ONLY on an
// EMPTY page. Keyset is immune to a server cap below PAGE_SIZE (a
// short-but-nonempty page just advances the cursor) and to offset-frame
// skip/duplication of pre-existing rows. It is NOT a database snapshot:
// concurrent writes can produce cross-page or cross-table skew — an
// accepted limitation for this advisory readout.
export async function pagedSelect(
  build: () => DbQuery,
  pk: string
): Promise<{ rows: Record<string, unknown>[]; error: DbError | null }> {
  const rows: Record<string, unknown>[] = [];
  let cursor: unknown = null;
  for (;;) {
    let q = build().order(pk);
    if (cursor !== null) q = q.gt(pk, cursor);
    const { data, error } = await q.limit(PAGE_SIZE).then((r) => r);
    if (error) return { rows: [], error };
    const page = (data ?? []) as Record<string, unknown>[];
    if (page.length === 0) return { rows, error: null };
    const last = page[page.length - 1][pk];
    if (last === undefined || last === null) {
      // The projection omitted its cursor column — a programming error
      // that must fail loudly, never spin or silently truncate.
      return {
        rows: [],
        error: {
          code: "PGRST_CURSOR",
          message: `pagedSelect: projection is missing cursor column ${pk}`,
        },
      };
    }
    rows.push(...page);
    cursor = last;
  }
}

/** Byte-synced helper from scheduler-data/handler.ts. */
export function chunkIds<T>(ids: T[], size: number = IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

// chunkedIn — deliberately NOT byte-synced from scheduler-data: the
// original issues one unpaginated select per chunk and swallows
// schema-not-ready errors per chunk with `continue` — both re-open
// classes of bug this handler closes. This rewrite routes each chunk
// through pagedSelect (fresh keyset cursor per chunk) and propagates
// EVERY error to the caller so the action-level schema_not_ready mapping
// fires. chunkedIn bounds request-URL size, NOT response size. Empty id
// lists short-circuit before any request.
export async function chunkedIn(
  ids: string[],
  pk: string,
  build: (chunk: string[]) => () => DbQuery
): Promise<{ rows: Record<string, unknown>[]; error: DbError | null }> {
  if (ids.length === 0) return { rows: [], error: null };
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunkIds(ids)) {
    const res = await pagedSelect(build(chunk), pk);
    if (res.error) return { rows: [], error: res.error };
    rows.push(...res.rows);
  }
  return { rows, error: null };
}

// ── Read helpers: map read failures to the action-level envelope ───────
function mapReadError(error: DbError, what: string): ActionError {
  if (SCHEMA_NOT_READY_CODES.has(error.code ?? "")) {
    return new ActionError(
      err(503, "schema_not_ready", "Required tables or columns are not available yet")
    );
  }
  return new ActionError(err(500, "query_failed", `Could not load ${what}`));
}

async function readAll(
  build: () => DbQuery,
  table: string,
  what: string
): Promise<Record<string, unknown>[]> {
  const { rows, error } = await pagedSelect(build, TABLE_PK[table]);
  if (error) throw mapReadError(error, what);
  return rows;
}

async function readChunked(
  ids: string[],
  table: string,
  what: string,
  build: (chunk: string[]) => () => DbQuery
): Promise<Record<string, unknown>[]> {
  const { rows, error } = await chunkedIn(ids, TABLE_PK[table], build);
  if (error) throw mapReadError(error, what);
  return rows;
}

// ── Source integrity: dates AND numerics, fail-closed ────────
// The `engagements` table has NO DB CHECK on date order and
// `wo_budget_lines` has NO committed CHECK at all — service-role reads
// see legacy/out-of-band rows the forms never validated. A violation
// fails the action naming the offending row: never a skipped row, a
// partial aggregate, a zero denominator, or a negative demand/supply.
function integrityError(table: string, id: unknown, detail: string): ActionError {
  return new ActionError(
    err(500, "data_integrity", `${detail} on ${table} row ${String(id)}`)
  );
}

/** Validates a consumed date pair and returns it as day ordinals. */
function assertDatePair(
  table: string,
  id: unknown,
  start: unknown,
  end: unknown
): { startOrd: number; endOrd: number } {
  if (!isStrictIsoDate(start) || !isStrictIsoDate(end)) {
    throw integrityError(table, id, "Invalid date value");
  }
  if (end < start) {
    throw integrityError(table, id, "end_date precedes start_date");
  }
  return { startOrd: dayOrdinal(start), endOrd: dayOrdinal(end) };
}

function assertNumber(
  table: string,
  id: unknown,
  field: string,
  value: unknown,
  check: (n: number) => boolean
): number {
  const n = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || !check(n)) {
    throw integrityError(table, id, `Out-of-domain ${field}`);
  }
  return n;
}

/** Proficiency values must be in the LEVEL_ORDER vocabulary. Not part of
 *  the date/numeric list, but an unknown level would otherwise be
 *  silently excluded from every ≥-threshold comparison — a skipped row
 *  in disguise. Fail-closed, same as numerics. */
function assertLevel(table: string, id: unknown, value: unknown): string {
  if (typeof value !== "string" || LEVEL_ORDER[value] === undefined) {
    throw integrityError(table, id, "Unknown proficiency level");
  }
  return value;
}

// ── Shared window validation ────────────────────────────────────────────
// All four actions validate uniformly. bench-vs-pipeline computes as of
// today and IGNORES the window — but supplied window fields are
// validated first (validate-then-ignore): a client sending startDate
// "2026-13-99" must get an error, not a silent 200 masking its bug.
function validateWindow(
  body: Record<string, unknown>,
  required: boolean
): { startDate: string; endDate: string } | HandlerResult {
  const { startDate, endDate } = body;
  if (!required && startDate === undefined && endDate === undefined) {
    return { startDate: "", endDate: "" };
  }
  if (!isStrictIsoDate(startDate) || !isStrictIsoDate(endDate)) {
    return err(400, "bad_request", "startDate and endDate must be valid YYYY-MM-DD dates");
  }
  if (startDate > endDate) {
    return err(400, "bad_request", "startDate must be before or equal to endDate");
  }
  if (dayOrdinal(endDate) - dayOrdinal(startDate) > MAX_RANGE_DAYS) {
    return err(400, "bad_request", `Date range exceeds maximum of ${MAX_RANGE_DAYS} days`);
  }
  return { startDate, endDate };
}

// ── Validated row shapes consumed by the pure aggregations ─────────────
export interface EngagementSpan {
  engagementId: string;
  startOrd: number;
  endOrd: number;
}
export interface RequirementSeat {
  categoryId: string;
  staffCount: number;
  engagementId: string;
}
export interface AssignmentSpan {
  staffId: string;
  engagementId: string;
  categoryId: string | null;
  startOrd: number;
  endOrd: number;
}
// Fase 3 (plan v2 §3): cada categoría trae su servicio, para que
// homónimas de servicios distintos nunca se agrupen ni se muestren como
// una sola fila.
export interface CategoryName {
  categoryId: string;
  categoryName: string;
  serviceId: string;
  serviceName: string;
  displayOrder: number;
}
export interface SeatInterval {
  startOrd: number;
  endOrd: number;
  seats: number;
}

// ── Pure aggregation: peak concurrent seats ──────────────────
// Interval sweep — behavior is defined by the daily max of the summed
// seat counts; the sweep is just the O(n log n) implementation.
export function peakConcurrentSeats(intervals: SeatInterval[]): number {
  const deltas = new Map<number, number>();
  for (const it of intervals) {
    if (it.endOrd < it.startOrd) continue;
    deltas.set(it.startOrd, (deltas.get(it.startOrd) ?? 0) + it.seats);
    deltas.set(it.endOrd + 1, (deltas.get(it.endOrd + 1) ?? 0) - it.seats);
  }
  let current = 0;
  let peak = 0;
  for (const at of [...deltas.keys()].sort((a, b) => a - b)) {
    current += deltas.get(at)!;
    if (current > peak) peak = current;
  }
  return peak;
}

/** Merge overlapping/adjacent ordinal intervals. Inputs need not be
 *  sorted. Used per-(staff, engagement, category) group — the merge key
 *  INCLUDES category_id: it is a per-segment editable column, so a
 *  Senior segment adjacent to a Manager segment must NOT merge into one
 *  category-less interval. */
export function mergeIntervals(
  intervals: Array<{ startOrd: number; endOrd: number }>
): Array<{ startOrd: number; endOrd: number }> {
  const sorted = [...intervals].sort((a, b) => a.startOrd - b.startOrd);
  const out: Array<{ startOrd: number; endOrd: number }> = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && it.startOrd <= last.endOrd + 1) {
      if (it.endOrd > last.endOrd) last.endOrd = it.endOrd;
    } else {
      out.push({ ...it });
    }
  }
  return out;
}

// ── Action payload row shapes ───────────────────────────────────────────
export interface CategoryHeadcountGapRow {
  categoryId: string;
  categoryName: string;
  serviceId: string;
  serviceName: string;
  displayOrder: number;
  demandFteDays: number;
  suppliedFteDays: number;
  gapFteDays: number;
  avgOpenSeats: number;
}
export interface CategoryHoursGapRow {
  categoryId: string;
  categoryName: string;
  serviceId: string;
  serviceName: string;
  displayOrder: number;
  demandHours: number;
  projectedSupplyHours: number;
  gapHours: number;
}
export interface CompetencyShortageRow {
  categoryId: string;
  categoryName: string;
  serviceId: string;
  serviceName: string;
  displayOrder: number;
  skillId: string;
  skillName: string;
  minLevel: string;
  demandCount: number;
  supplyCount: number;
  deficit: number;
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

const COMPETENCY_ROW_CAP = 500;

// ── Pure aggregation: category-headcount-gap ───────────────
// ONE temporal unit — person-days (FTE-days) within the window — on BOTH
// sides. Seat-counts-vs-distinct-persons is FORBIDDEN: it read one
// Senior fully covering two sequential engagements as a gap of 1, and a
// 1-day assignment on a 60-day engagement as fully staffed. Headcount is
// allocation-unweighted — a seat is occupied regardless of allocation %;
// intensity is the hours lens.
export function computeHeadcountGap(input: {
  engagements: EngagementSpan[];
  requirements: RequirementSeat[];
  assignments: AssignmentSpan[];
  activeStaffIds: Set<string>;
  categories: CategoryName[];
  windowStartOrd: number;
  windowEndOrd: number;
}): CategoryHeadcountGapRow[] {
  const windowDays = input.windowEndOrd - input.windowStartOrd + 1;
  const engagementById = new Map(input.engagements.map((e) => [e.engagementId, e]));

  const demand = new Map<string, number>();
  for (const req of input.requirements) {
    const eng = engagementById.get(req.engagementId);
    if (!eng) continue;
    const days = overlapDaysOrd(
      eng.startOrd,
      eng.endOrd,
      input.windowStartOrd,
      input.windowEndOrd
    );
    demand.set(req.categoryId, (demand.get(req.categoryId) ?? 0) + req.staffCount * days);
  }

  // Supply: active staff only; overlapping/adjacent segments merged per
  // (staff, engagement, category) before day-counting so legacy
  // overlapping segments never double-count a day; each merged interval
  // is clipped assignment∩engagement∩window.
  const groups = new Map<string, { categoryId: string; engagementId: string; spans: Array<{ startOrd: number; endOrd: number }> }>();
  for (const a of input.assignments) {
    if (!input.activeStaffIds.has(a.staffId)) continue;
    if (a.categoryId === null) continue;
    const key = `${a.staffId}|${a.engagementId}|${a.categoryId}`;
    let g = groups.get(key);
    if (!g) {
      g = { categoryId: a.categoryId, engagementId: a.engagementId, spans: [] };
      groups.set(key, g);
    }
    g.spans.push({ startOrd: a.startOrd, endOrd: a.endOrd });
  }
  const supply = new Map<string, number>();
  for (const g of groups.values()) {
    const eng = engagementById.get(g.engagementId);
    if (!eng) continue;
    for (const merged of mergeIntervals(g.spans)) {
      const clippedStart = Math.max(merged.startOrd, eng.startOrd, input.windowStartOrd);
      const clippedEnd = Math.min(merged.endOrd, eng.endOrd, input.windowEndOrd);
      const days = Math.max(0, clippedEnd - clippedStart + 1);
      if (days > 0) supply.set(g.categoryId, (supply.get(g.categoryId) ?? 0) + days);
    }
  }

  const rows: CategoryHeadcountGapRow[] = [];
  for (const cat of input.categories) {
    const demandFteDays = demand.get(cat.categoryId) ?? 0;
    const suppliedFteDays = supply.get(cat.categoryId) ?? 0;
    if (demandFteDays <= 0 && suppliedFteDays <= 0) continue;
    const gapFteDays = demandFteDays - suppliedFteDays;
    rows.push({
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      serviceId: cat.serviceId,
      serviceName: cat.serviceName,
      displayOrder: cat.displayOrder,
      demandFteDays,
      suppliedFteDays,
      gapFteDays,
      // Average unfilled seats — may be negative for over-supply. Raw
      // precision is kept; the client rounds at presentation.
      avgOpenSeats: gapFteDays / windowDays,
    });
  }
  rows.sort(
    (a, b) =>
      b.gapFteDays - a.gapFteDays ||
      (a.serviceName < b.serviceName ? -1 : a.serviceName > b.serviceName ? 1 : 0) ||
      (a.categoryName < b.categoryName ? -1 : a.categoryName > b.categoryName ? 1 : 0)
  );
  return rows;
}

// ── Pure aggregation: category-hours-gap ───────────────
// ONE time basis — the selected window, pro-rata on BOTH sides — and
// supply is engagement-clipped. The budget is assumed uniformly spread
// over the engagement's lifetime (a stated approximation). Full-lifetime
// demand against window-clipped supply is FORBIDDEN.
export function computeHoursGap(input: {
  engagements: EngagementSpan[];
  budgetLines: Array<{ categoryId: string; budgetedHours: number; engagementId: string }>;
  assignments: Array<AssignmentSpan & { hoursPerWeek: number }>;
  activeStaffIds: Set<string>;
  categories: CategoryName[];
  windowStartOrd: number;
  windowEndOrd: number;
}): CategoryHoursGapRow[] {
  const engagementById = new Map(input.engagements.map((e) => [e.engagementId, e]));

  const demand = new Map<string, number>();
  for (const line of input.budgetLines) {
    const eng = engagementById.get(line.engagementId);
    if (!eng) continue;
    const overlap = overlapDaysOrd(
      eng.startOrd,
      eng.endOrd,
      input.windowStartOrd,
      input.windowEndOrd
    );
    // Lifetime ≥ 1 by construction: source-integrity has already failed
    // the action on any reversed/malformed stored pair.
    const lifetime = eng.endOrd - eng.startOrd + 1;
    demand.set(
      line.categoryId,
      (demand.get(line.categoryId) ?? 0) + (line.budgetedHours * overlap) / lifetime
    );
  }

  // Supply: window-pro-rated AND engagement-clipped. Without the
  // ∩engagement clip, an assignment spilling past its engagement earns
  // supply-hours on days where that engagement's demand is
  // definitionally zero, and the surplus nets away a DIFFERENT
  // engagement's genuine shortfall inside the same category row.
  // Same-staff segments: write-time non-overlap keeps this honest;
  // legacy overlap is accepted v1 noise — no merge in the hours lens.
  const supply = new Map<string, number>();
  for (const a of input.assignments) {
    if (!input.activeStaffIds.has(a.staffId)) continue;
    if (a.categoryId === null) continue;
    const eng = engagementById.get(a.engagementId);
    if (!eng) continue;
    const clippedStart = Math.max(a.startOrd, eng.startOrd, input.windowStartOrd);
    const clippedEnd = Math.min(a.endOrd, eng.endOrd, input.windowEndOrd);
    const days = Math.max(0, clippedEnd - clippedStart + 1);
    if (days === 0) continue;
    supply.set(
      a.categoryId,
      (supply.get(a.categoryId) ?? 0) + (a.hoursPerWeek * days) / 7
    );
  }

  const rows: CategoryHoursGapRow[] = [];
  for (const cat of input.categories) {
    const demandHours = demand.get(cat.categoryId) ?? 0;
    const projectedSupplyHours = supply.get(cat.categoryId) ?? 0;
    if (demandHours <= 0 && projectedSupplyHours <= 0) continue;
    rows.push({
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      serviceId: cat.serviceId,
      serviceName: cat.serviceName,
      displayOrder: cat.displayOrder,
      demandHours,
      projectedSupplyHours,
      gapHours: demandHours - projectedSupplyHours,
    });
  }
  rows.sort(
    (a, b) =>
      b.gapHours - a.gapHours ||
      (a.serviceName < b.serviceName ? -1 : a.serviceName > b.serviceName ? 1 : 0) ||
      (a.categoryName < b.categoryName ? -1 : a.categoryName > b.categoryName ? 1 : 0)
  );
  return rows;
}

// ── Pure aggregation: competency-shortage ───────────────
// Rows are CUMULATIVE ≥-THRESHOLDS — never independent per-tier counts.
// The ≥-eligibility pools are NESTED (Advanced ⊆ Intermediate ⊆
// Beginner): independent per-tier rows let one Advanced person satisfy a
// Beginner-min seat AND a concurrent Advanced-min seat simultaneously.
// Demand per (category, skill, L) = PEAK concurrent seats requiring
// level ≥ L (a joint daily sweep — two sequential ×5 engagements are a
// concurrent demand of 5, not 10). Supply is deliberately timeless: this
// lens answers "do enough qualified people EXIST".
export interface CompetencyShortageResult {
  rows: CompetencyShortageRow[];
  truncated: boolean;
  /** UNCAPPED count of combos with deficit > 0 — the KPI reads this,
   *  never the capped row list (which saturates at 500). */
  deficitRowCount: number;
}

export function computeCompetencyShortage(input: {
  engagements: EngagementSpan[];
  /** Requirement-skill rows joined to their requirement's category,
   *  staff_count, and engagement. */
  demandRows: Array<{
    categoryId: string;
    skillId: string;
    minLevel: string;
    staffCount: number;
    engagementId: string;
  }>;
  /** Active staff with their category. */
  staff: Array<{ staffId: string; categoryId: string | null }>;
  staffSkills: Array<{ staffId: string; skillId: string; level: string }>;
  skillNames: Map<string, string>;
  categories: CategoryName[];
  windowStartOrd: number;
  windowEndOrd: number;
}): CompetencyShortageResult {
  const engagementById = new Map(input.engagements.map((e) => [e.engagementId, e]));
  const categoryById = new Map(input.categories.map((c) => [c.categoryId, c]));

  // Group demand rows per (category, skill).
  const demandByPair = new Map<string, Array<(typeof input.demandRows)[number]>>();
  for (const row of input.demandRows) {
    const key = `${row.categoryId}|${row.skillId}`;
    const list = demandByPair.get(key);
    if (list) list.push(row);
    else demandByPair.set(key, [row]);
  }

  // Supply pools: per (category, skill), the level each staff member
  // holds — evaluated per threshold with ≥ semantics.
  const staffCategory = new Map(input.staff.map((s) => [s.staffId, s.categoryId]));
  const skillLevels = new Map<string, Array<{ categoryId: string; level: string }>>();
  for (const ss of input.staffSkills) {
    const categoryId = staffCategory.get(ss.staffId);
    if (categoryId === undefined || categoryId === null) continue;
    const list = skillLevels.get(ss.skillId);
    const entry = { categoryId, level: ss.level };
    if (list) list.push(entry);
    else skillLevels.set(ss.skillId, [entry]);
  }

  const allRows: CompetencyShortageRow[] = [];
  for (const [key, rows] of demandByPair) {
    const [categoryId, skillId] = key.split("|");
    const cat = categoryById.get(categoryId);
    if (!cat) continue;
    const thresholds = [...new Set(rows.map((r) => r.minLevel))];
    for (const minLevel of thresholds) {
      const intervals: SeatInterval[] = [];
      for (const r of rows) {
        if (LEVEL_ORDER[r.minLevel] < LEVEL_ORDER[minLevel]) continue;
        const eng = engagementById.get(r.engagementId);
        if (!eng) continue;
        const startOrd = Math.max(eng.startOrd, input.windowStartOrd);
        const endOrd = Math.min(eng.endOrd, input.windowEndOrd);
        if (endOrd < startOrd) continue;
        intervals.push({ startOrd, endOrd, seats: r.staffCount });
      }
      const demandCount = peakConcurrentSeats(intervals);
      const supplyCount = (skillLevels.get(skillId) ?? []).filter(
        (s) =>
          s.categoryId === categoryId &&
          LEVEL_ORDER[s.level] >= LEVEL_ORDER[minLevel]
      ).length;
      allRows.push({
        categoryId,
        categoryName: cat.categoryName,
        serviceId: cat.serviceId,
        serviceName: cat.serviceName,
        displayOrder: cat.displayOrder,
        skillId,
        skillName: input.skillNames.get(skillId) ?? "",
        minLevel,
        demandCount,
        supplyCount,
        deficit: Math.max(0, demandCount - supplyCount),
      });
    }
  }

  // TOTAL server order — the sort runs BEFORE the 500-row cap, so
  // comparator ties would otherwise decide which shortages leadership
  // sees. Service is the primary tie-breaker so homonymous categories in
  // different services never interleave; the strictest proficiency
  // threshold wins after that; the trailing id keys make the order total
  // by construction.
  allRows.sort(
    (a, b) =>
      b.deficit - a.deficit ||
      (a.serviceName < b.serviceName ? -1 : a.serviceName > b.serviceName ? 1 : 0) ||
      (a.categoryName < b.categoryName ? -1 : a.categoryName > b.categoryName ? 1 : 0) ||
      (a.skillName < b.skillName ? -1 : a.skillName > b.skillName ? 1 : 0) ||
      LEVEL_ORDER[b.minLevel] - LEVEL_ORDER[a.minLevel] ||
      (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0) ||
      (a.skillId < b.skillId ? -1 : a.skillId > b.skillId ? 1 : 0)
  );

  const deficitRowCount = allRows.filter((r) => r.deficit > 0).length;
  const truncated = allRows.length > COMPETENCY_ROW_CAP;
  return {
    rows: allRows.slice(0, COMPETENCY_ROW_CAP),
    truncated,
    deficitRowCount,
  };
}

// ── Pure aggregation: bench-vs-pipeline ─────────────────────────
export function computeBench(input: {
  /** Active, non-deleted staff already filtered is_schedulable !== false. */
  staff: Array<{
    staffId: string;
    firstName: string;
    lastName: string;
    categoryId: string | null;
  }>;
  /** Today-active assignment segments. */
  assignments: Array<{
    staffId: string;
    engagementId: string;
    allocationPct: number;
  }>;
  activeEngagementIds: Set<string>;
  staffSkills: Array<{ staffId: string; skillId: string; level: string }>;
  skillNames: Map<string, string>;
  categories: CategoryName[];
}): BenchRow[] {
  const categoryById = new Map(input.categories.map((c) => [c.categoryId, c]));

  // A stale future-dated assignment on a completed/cancelled engagement
  // must not push a redeployable person over the threshold.
  const allocation = new Map<string, number>();
  for (const a of input.assignments) {
    if (!input.activeEngagementIds.has(a.engagementId)) continue;
    allocation.set(a.staffId, (allocation.get(a.staffId) ?? 0) + a.allocationPct);
  }
  // Snap the FP accumulation to micro-percent before the strict
  // comparison: 14.2 + 17.9 + 17.9 sums to 49.99999999999999 in
  // IEEE-754, which would put an exactly-50%-allocated person ON a bench
  // defined as "strictly below 50" (and render as "50%"). Micro-percent
  // precision preserves every genuine sub-threshold distinction.
  for (const [staffId, pct] of allocation) {
    allocation.set(staffId, Math.round(pct * 1e6) / 1e6);
  }

  const skillsByStaff = new Map<string, Array<{ name: string; order: number }>>();
  for (const ss of input.staffSkills) {
    const list = skillsByStaff.get(ss.staffId);
    const entry = {
      name: input.skillNames.get(ss.skillId) ?? "",
      order: LEVEL_ORDER[ss.level],
    };
    if (list) list.push(entry);
    else skillsByStaff.set(ss.staffId, [entry]);
  }

  const bench: Array<BenchRow & { lastName: string }> = [];
  for (const s of input.staff) {
    const pct = allocation.get(s.staffId) ?? 0;
    if (pct >= BENCH_ALLOCATION_THRESHOLD) continue;
    const topSkills = (skillsByStaff.get(s.staffId) ?? [])
      .sort((a, b) => b.order - a.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .slice(0, 3)
      .map((sk) => sk.name);
    const cat = s.categoryId === null ? null : categoryById.get(s.categoryId) ?? null;
    bench.push({
      staffId: s.staffId,
      staffName: `${s.firstName} ${s.lastName}`.trim(),
      serviceId: cat?.serviceId ?? null,
      serviceName: cat?.serviceName ?? null,
      categoryName: cat?.categoryName ?? null,
      currentAllocationPct: pct,
      topSkills,
      lastName: s.lastName,
    });
  }
  bench.sort(
    (a, b) =>
      a.currentAllocationPct - b.currentAllocationPct ||
      (a.lastName < b.lastName ? -1 : a.lastName > b.lastName ? 1 : 0) ||
      (a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0)
  );
  return bench.map(({ lastName: _lastName, ...row }) => row);
}

// ── Shared reads ───────────────────────────────────────────────────────

interface WorkOrderStateRow {
  engagement_id: string;
  approval_status: string | null;
  approved_at: string | null;
  risk_status: string | null;
}

/**
 * Fase 3 — resuelve el estado efectivo (1-9) de un conjunto de
 * engagements, leyendo su Work Order gobernante desde la vista RLS-safe
 * `engagement_wo_state` (1:1 por engagement_id — work_orders.engagement_id
 * es UNIQUE, sin ambigüedad de "más reciente"). Un error de "schema not
 * ready" en esta consulta propaga como cualquier otro read (readChunked
 * ya lo convierte en 503 vía ActionError) — nunca una degradación
 * silenciosa en un agregado.
 */
async function resolveEffectiveStates(
  ctx: GapsContext,
  engagements: Array<{
    engagementId: string;
    workOrderRequired: boolean;
    engagementStateOverride: number | null;
  }>
): Promise<Map<string, number>> {
  const rows = await readChunked(
    engagements.map((e) => e.engagementId),
    "engagement_wo_state",
    "work order states",
    (chunk) => () =>
      ctx.db
        .from("engagement_wo_state")
        .select("engagement_id, approval_status, approved_at, risk_status")
        .in("engagement_id", chunk)
  );
  const woByEngagement = new Map<string, WorkOrderStateRow>(
    (rows as unknown as WorkOrderStateRow[]).map((r) => [r.engagement_id, r])
  );
  const result = new Map<string, number>();
  for (const e of engagements) {
    const wo = woByEngagement.get(e.engagementId) ?? null;
    result.set(
      e.engagementId,
      effectiveEngagementState(
        {
          work_order_required: e.workOrderRequired,
          engagement_state_override: e.engagementStateOverride,
        },
        wo
      )
    );
  }
  return result;
}

/** Engagements overlapping the window whose ESTADO EFECTIVO cae en el
 *  bucket "active" ({Aprobado, AprobadoEmergencia}) — nunca la columna
 *  legacy status='active'. Dates validated and converted to ordinals.
 *  NULL-dated engagements fall out of the window comparison — aligned
 *  with scheduler-l1's recorded v1 decision. */
async function readWindowEngagements(
  ctx: GapsContext,
  startDate: string,
  endDate: string
): Promise<EngagementSpan[]> {
  const rows = await readAll(
    () =>
      ctx.db
        .from("engagements")
        .select(
          "engagement_id, start_date, end_date, work_order_required, engagement_state_override"
        )
        .lte("start_date", endDate)
        .gte("end_date", startDate),
    "engagements",
    "engagements"
  );
  const candidates = rows.map((r) => {
    const { startOrd, endOrd } = assertDatePair(
      "engagements",
      r.engagement_id,
      r.start_date,
      r.end_date
    );
    return {
      engagementId: r.engagement_id as string,
      startOrd,
      endOrd,
      workOrderRequired: (r.work_order_required as boolean) ?? true,
      engagementStateOverride: (r.engagement_state_override as number | null) ?? null,
    };
  });
  const effectiveStates = await resolveEffectiveStates(ctx, candidates);
  return candidates
    .filter((c) => engagementStateBucket(effectiveStates.get(c.engagementId)) === "active")
    .map(({ engagementId, startOrd, endOrd }) => ({ engagementId, startOrd, endOrd }));
}

async function readWorkOrders(
  ctx: GapsContext,
  engagementIds: string[]
): Promise<Map<string, string>> {
  const rows = await readChunked(
    engagementIds,
    "work_orders",
    "work orders",
    (chunk) => () =>
      ctx.db.from("work_orders").select("wo_id, engagement_id").in("engagement_id", chunk)
  );
  return new Map(rows.map((r) => [r.wo_id as string, r.engagement_id as string]));
}

/** The active-staff set: every action's supply/bench side intersects
 *  with it, uniformly — an assignment row whose staff has departed
 *  contributes nothing, even when the assignment itself was never
 *  soft-deleted. */
async function readActiveStaffIds(ctx: GapsContext): Promise<Set<string>> {
  const rows = await readAll(
    () =>
      ctx.db
        .from("staff")
        .select("staff_id")
        .eq("is_active", true)
        .is("deleted_at", null),
    "staff",
    "staff"
  );
  return new Set(rows.map((r) => r.staff_id as string));
}

/** Fase 3 — nombre de servicio por practica_id, para poblar
 *  serviceId/serviceName en cada fila de categoría. */
async function readServices(ctx: GapsContext): Promise<Map<string, string>> {
  const rows = await readAll(
    () => ctx.db.from("practicas").select("practica_id, name"),
    "practicas",
    "practicas"
  );
  return new Map(rows.map((r) => [r.practica_id as string, (r.name as string) ?? ""]));
}

async function readCategories(ctx: GapsContext): Promise<CategoryName[]> {
  const [rows, serviceNames] = await Promise.all([
    readAll(
      () =>
        ctx.db
          .from("categories")
          .select("category_id, category_name, practica_id, display_order"),
      "categories",
      "categories"
    ),
    readServices(ctx),
  ]);
  return rows.map((r) => ({
    categoryId: r.category_id as string,
    categoryName: (r.category_name as string) ?? "",
    serviceId: r.practica_id as string,
    serviceName: serviceNames.get(r.practica_id as string) ?? "",
    displayOrder: (r.display_order as number) ?? 0,
  }));
}

async function readRequirements(
  ctx: GapsContext,
  woToEngagement: Map<string, string>
): Promise<Array<{ id: string; categoryId: string; staffCount: number; engagementId: string }>> {
  const rows = await readChunked(
    [...woToEngagement.keys()],
    "wo_staffing_requirements",
    "staffing requirements",
    (chunk) => () =>
      ctx.db
        .from("wo_staffing_requirements")
        .select("id, wo_id, category_id, staff_count")
        .in("wo_id", chunk)
  );
  return rows.map((r) => ({
    id: r.id as string,
    categoryId: r.category_id as string,
    staffCount: assertNumber(
      "wo_staffing_requirements",
      r.id,
      "staff_count",
      r.staff_count,
      (n) => Number.isInteger(n) && n >= 1
    ),
    engagementId: woToEngagement.get(r.wo_id as string) as string,
  }));
}

// ── Action: category-headcount-gap ──────────────────────────────
async function categoryHeadcountGap(
  ctx: GapsContext,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  if (gapsVisibility(ctx.role) === "denied") {
    return err(403, "forbidden", "This view is for firm leadership only");
  }
  const window = validateWindow(body, true);
  if ("status" in window) return window;
  const { startDate, endDate } = window;

  const engagements = await readWindowEngagements(ctx, startDate, endDate);
  const engagementIds = engagements.map((e) => e.engagementId);
  const woToEngagement = await readWorkOrders(ctx, engagementIds);
  const requirements = await readRequirements(ctx, woToEngagement);

  const assignmentRows = await readChunked(
    engagementIds,
    "engagement_assignments",
    "assignments",
    (chunk) => () =>
      ctx.db
        .from("engagement_assignments")
        .select("assignment_id, staff_id, engagement_id, category_id, start_date, end_date")
        .is("deleted_at", null)
        .in("engagement_id", chunk)
        .lte("start_date", endDate)
        .gte("end_date", startDate)
  );
  const assignments: AssignmentSpan[] = assignmentRows.map((r) => {
    const { startOrd, endOrd } = assertDatePair(
      "engagement_assignments",
      r.assignment_id,
      r.start_date,
      r.end_date
    );
    return {
      staffId: r.staff_id as string,
      engagementId: r.engagement_id as string,
      categoryId: (r.category_id as string | null) ?? null,
      startOrd,
      endOrd,
    };
  });

  const activeStaffIds = await readActiveStaffIds(ctx);
  const categories = await readCategories(ctx);

  const rows = computeHeadcountGap({
    engagements,
    requirements,
    assignments,
    activeStaffIds,
    categories,
    windowStartOrd: dayOrdinal(startDate),
    windowEndOrd: dayOrdinal(endDate),
  });
  return { status: 200, payload: { rows } };
}

// ── Action: category-hours-gap ──────────────────────────────────────
async function categoryHoursGap(
  ctx: GapsContext,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  if (gapsVisibility(ctx.role) === "denied") {
    return err(403, "forbidden", "This view is for firm leadership only");
  }
  const window = validateWindow(body, true);
  if ("status" in window) return window;
  const { startDate, endDate } = window;

  const engagements = await readWindowEngagements(ctx, startDate, endDate);
  const engagementIds = engagements.map((e) => e.engagementId);
  const woToEngagement = await readWorkOrders(ctx, engagementIds);

  const budgetRows = await readChunked(
    [...woToEngagement.keys()],
    "wo_budget_lines",
    "budget lines",
    (chunk) => () =>
      ctx.db
        .from("wo_budget_lines")
        .select("wo_line_id, wo_id, category_id, budgeted_hours")
        .in("wo_id", chunk)
  );
  const budgetLines = budgetRows.map((r) => ({
    categoryId: r.category_id as string,
    budgetedHours: assertNumber(
      "wo_budget_lines",
      r.wo_line_id,
      "budgeted_hours",
      r.budgeted_hours,
      (n) => n >= 0
    ),
    engagementId: woToEngagement.get(r.wo_id as string) as string,
  }));

  const assignmentRows = await readChunked(
    engagementIds,
    "engagement_assignments",
    "assignments",
    (chunk) => () =>
      ctx.db
        .from("engagement_assignments")
        .select(
          "assignment_id, staff_id, engagement_id, category_id, hours_per_week, start_date, end_date"
        )
        .is("deleted_at", null)
        .in("engagement_id", chunk)
        .lte("start_date", endDate)
        .gte("end_date", startDate)
  );
  const assignments = assignmentRows.map((r) => {
    const { startOrd, endOrd } = assertDatePair(
      "engagement_assignments",
      r.assignment_id,
      r.start_date,
      r.end_date
    );
    return {
      staffId: r.staff_id as string,
      engagementId: r.engagement_id as string,
      categoryId: (r.category_id as string | null) ?? null,
      startOrd,
      endOrd,
      hoursPerWeek: assertNumber(
        "engagement_assignments",
        r.assignment_id,
        "hours_per_week",
        r.hours_per_week,
        (n) => n > 0 && n <= 80
      ),
    };
  });

  const activeStaffIds = await readActiveStaffIds(ctx);
  const categories = await readCategories(ctx);

  const rows = computeHoursGap({
    engagements,
    budgetLines,
    assignments,
    activeStaffIds,
    categories,
    windowStartOrd: dayOrdinal(startDate),
    windowEndOrd: dayOrdinal(endDate),
  });
  return { status: 200, payload: { rows } };
}

// ── Action: competency-shortage ─────────────────────────────────
async function competencyShortage(
  ctx: GapsContext,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  if (gapsVisibility(ctx.role) === "denied") {
    return err(403, "forbidden", "This view is for firm leadership only");
  }
  const window = validateWindow(body, true);
  if ("status" in window) return window;
  const { startDate, endDate } = window;

  const engagements = await readWindowEngagements(ctx, startDate, endDate);
  const engagementIds = engagements.map((e) => e.engagementId);
  const woToEngagement = await readWorkOrders(ctx, engagementIds);
  const requirements = await readRequirements(ctx, woToEngagement);
  const requirementById = new Map(requirements.map((r) => [r.id, r]));

  const reqSkillRows = await readChunked(
    requirements.map((r) => r.id),
    "wo_staffing_requirement_skills",
    "requirement skills",
    (chunk) => () =>
      ctx.db
        .from("wo_staffing_requirement_skills")
        .select("id, requirement_id, skill_id, min_proficiency_level")
        .in("requirement_id", chunk)
  );
  const demandRows = reqSkillRows.map((r) => {
    const requirement = requirementById.get(r.requirement_id as string)!;
    return {
      categoryId: requirement.categoryId,
      skillId: r.skill_id as string,
      minLevel: assertLevel(
        "wo_staffing_requirement_skills",
        r.id,
        r.min_proficiency_level
      ),
      staffCount: requirement.staffCount,
      engagementId: requirement.engagementId,
    };
  });

  const staffRows = await readAll(
    () =>
      ctx.db
        .from("staff")
        .select("staff_id, category_id")
        .eq("is_active", true)
        .is("deleted_at", null),
    "staff",
    "staff"
  );
  const staff = staffRows.map((r) => ({
    staffId: r.staff_id as string,
    categoryId: (r.category_id as string | null) ?? null,
  }));

  const staffSkillRows = await readAll(
    () =>
      ctx.db
        .from("staff_skills")
        .select("staff_skill_id, staff_id, skill_id, proficiency_level"),
    "staff_skills",
    "staff skills"
  );
  // Level vocabulary is asserted only on CONSUMED rows: skills of staff
  // outside the active set are discarded anyway, so a legacy proficiency
  // value on a departed staff member must not 500 current reporting.
  const activeStaffIds = new Set(staff.map((s) => s.staffId));
  const staffSkills = staffSkillRows
    .filter((r) => activeStaffIds.has(r.staff_id as string))
    .map((r) => ({
      staffId: r.staff_id as string,
      skillId: r.skill_id as string,
      level: assertLevel("staff_skills", r.staff_skill_id, r.proficiency_level),
    }));

  const skillRows = await readAll(
    () => ctx.db.from("skills").select("skill_id, name"),
    "skills",
    "skills"
  );
  const skillNames = new Map(
    skillRows.map((r) => [r.skill_id as string, (r.name as string) ?? ""])
  );
  const categories = await readCategories(ctx);

  const result = computeCompetencyShortage({
    engagements,
    demandRows,
    staff,
    staffSkills,
    skillNames,
    categories,
    windowStartOrd: dayOrdinal(startDate),
    windowEndOrd: dayOrdinal(endDate),
  });
  return { status: 200, payload: result };
}

// ── Action: bench-vs-pipeline ───────────────────────────────────
async function benchVsPipeline(
  ctx: GapsContext,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  if (gapsVisibility(ctx.role) === "denied") {
    return err(403, "forbidden", "This view is for firm leadership only");
  }
  // Validate-then-ignore: bench computes as of today, but a supplied
  // window must still be well-formed.
  const window = validateWindow(body, false);
  if ("status" in window) return window;

  const staffRows = await readAll(
    () =>
      ctx.db
        .from("staff")
        .select("staff_id, first_name, last_name, category_id, is_active, is_schedulable")
        .eq("is_active", true)
        .is("deleted_at", null),
    "staff",
    "staff"
  );
  // Null-tolerant schedulability: NULL means "not opted out".
  const staff = staffRows
    .filter((r) => r.is_schedulable !== false)
    .map((r) => ({
      staffId: r.staff_id as string,
      firstName: (r.first_name as string) ?? "",
      lastName: (r.last_name as string) ?? "",
      categoryId: (r.category_id as string | null) ?? null,
    }));

  // Fase 3: "activo" = estado efectivo ∈ {Aprobado, AprobadoEmergencia},
  // no la columna legacy status='active'. Sin ventana de fechas (D-P6-6:
  // bench se computa "hoy") — se traen todos los engagements y se filtra
  // por estado efectivo.
  const engagementRows = await readAll(
    () =>
      ctx.db
        .from("engagements")
        .select("engagement_id, work_order_required, engagement_state_override"),
    "engagements",
    "engagements"
  );
  const engagementCandidates = engagementRows.map((r) => ({
    engagementId: r.engagement_id as string,
    workOrderRequired: (r.work_order_required as boolean) ?? true,
    engagementStateOverride: (r.engagement_state_override as number | null) ?? null,
  }));
  const effectiveStates = await resolveEffectiveStates(ctx, engagementCandidates);
  const activeEngagementIds = new Set(
    engagementCandidates
      .filter((e) => engagementStateBucket(effectiveStates.get(e.engagementId)) === "active")
      .map((e) => e.engagementId)
  );

  // Deliberately NO chunkedIn id filters here: the today-window predicate
  // already bounds the result to currently-running assignments; the
  // active-staff/stale-engagement intersections happen in TS.
  const assignmentRows = await readAll(
    () =>
      ctx.db
        .from("engagement_assignments")
        .select(
          "assignment_id, staff_id, engagement_id, allocation_percent, start_date, end_date"
        )
        .is("deleted_at", null)
        .lte("start_date", ctx.todayUtc)
        .gte("end_date", ctx.todayUtc),
    "engagement_assignments",
    "assignments"
  );
  const assignments = assignmentRows.map((r) => {
    assertDatePair(
      "engagement_assignments",
      r.assignment_id,
      r.start_date,
      r.end_date
    );
    return {
      staffId: r.staff_id as string,
      engagementId: r.engagement_id as string,
      allocationPct: assertNumber(
        "engagement_assignments",
        r.assignment_id,
        "allocation_percent",
        r.allocation_percent,
        (n) => n > 0 && n <= 100
      ),
    };
  });

  const staffSkillRows = await readAll(
    () =>
      ctx.db
        .from("staff_skills")
        .select("staff_skill_id, staff_id, skill_id, proficiency_level"),
    "staff_skills",
    "staff skills"
  );
  // Same consumed-rows scoping as competencyShortage: only bench-eligible
  // staff's top skills are rendered, so only their rows are
  // level-asserted.
  const eligibleStaffIds = new Set(staff.map((s) => s.staffId));
  const staffSkills = staffSkillRows
    .filter((r) => eligibleStaffIds.has(r.staff_id as string))
    .map((r) => ({
      staffId: r.staff_id as string,
      skillId: r.skill_id as string,
      level: assertLevel("staff_skills", r.staff_skill_id, r.proficiency_level),
    }));

  const skillRows = await readAll(
    () => ctx.db.from("skills").select("skill_id, name"),
    "skills",
    "skills"
  );
  const skillNames = new Map(
    skillRows.map((r) => [r.skill_id as string, (r.name as string) ?? ""])
  );
  const categories = await readCategories(ctx);

  const rows = computeBench({
    staff,
    assignments,
    activeEngagementIds,
    staffSkills,
    skillNames,
    categories,
  });
  return { status: 200, payload: { rows } };
}

// ── Dispatch ────────────────────────────────────────────────────────────
export const VALID_ACTIONS = [
  "category-headcount-gap",
  "category-hours-gap",
  "competency-shortage",
  "bench-vs-pipeline",
] as const;

export async function handleAction(
  ctx: GapsContext,
  body: unknown
): Promise<HandlerResult> {
  if (typeof body !== "object" || body === null) {
    return err(400, "bad_request", "Invalid JSON in request body");
  }
  const record = body as Record<string, unknown>;
  try {
    switch (record.action) {
      case "category-headcount-gap":
        return await categoryHeadcountGap(ctx, record);
      case "category-hours-gap":
        return await categoryHoursGap(ctx, record);
      case "competency-shortage":
        return await competencyShortage(ctx, record);
      case "bench-vs-pipeline":
        return await benchVsPipeline(ctx, record);
      default:
        return err(400, "bad_request", "Invalid or missing action parameter");
    }
  } catch (e) {
    if (e instanceof ActionError) return e.result;
    throw e;
  }
}

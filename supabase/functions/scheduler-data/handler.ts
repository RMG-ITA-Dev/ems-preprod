// scheduler-data — pure handler module.
//
// NO Deno imports and NO direct Supabase client construction here: the
// Deno entry (index.ts) injects a service-role client and the verified
// caller identity. That keeps the complete handler — including the
// visibility boundary — testable under vitest with an in-memory
// PostgREST-compatible fake (src/test/edge-functions/).
//
// SECURITY: the injected client is service-role — RLS is bypassed. The
// visibility filter below is therefore a security boundary, not a UI
// convenience (D5). Every follow-up query consumes only the already-
// authorized engagement-ID set.
//
// Fase 3 (plan v2 §1): el estado del engagement ya NO se filtra por la
// columna legacy `status='active'` — se deriva el ESTADO EFECTIVO (1-9,
// engagementState.ts, copia byte-sincronizada de development) leyendo
// `engagement_state_override` + el Work Order gobernante (vista RLS-safe
// `engagement_wo_state`, 1:1 por engagement_id — work_orders.engagement_id
// es UNIQUE). El filtro por bucket se aplica ANTES del límite/truncado
// (filtrar-antes-de-limitar), nunca después.

import {
  effectiveEngagementState,
  engagementStateBucket,
  EngagementState,
  type EngagementStateBucket,
} from "./engagementState.ts";

// ── Minimal PostgREST-shaped client contract ────────────────────────────
// Only the chain methods the handler actually uses. Both the real
// supabase-js client and the test fake satisfy this shape.
export interface DbQuery {
  select(columns: string): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  or(filters: string): DbQuery;
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

export interface SchedulerContext {
  db: DbClient;
  /** Verified via JWT → staff.auth_user_id; null when no staff row. */
  staffId: string | null;
  /** Verified via user_roles.role_key (23-role catalog); "" when no row. */
  role: string;
  /** Server UTC today, yyyy-MM-dd (health is computed "as of today"). */
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

// PostgREST codes treated as "schema not ready": the affected query
// contributes empty rows instead of leaking a raw 500 during a post-merge
// / pre-Lovable-apply window.
const SCHEMA_NOT_READY_CODES = new Set(["42P01", "42703", "PGRST200"]);

// ── Identity resolution (exported for unit tests) ─────────────────────
// A DB failure here must surface as a 500 — NEVER silently default the
// role to "" (denied), which visibilityRuleFor maps to denied: during a
// connectivity hiccup admins would otherwise receive 403s
// indistinguishable from genuine permission failures. Plain list queries
// (no .single()) keep "zero rows" — a legitimate state for both tables —
// distinct from transport errors without PGRST116 special-casing;
// user_roles has UNIQUE (user_id), so at most one row exists.
//
// Merge with feat/roles-permisos (2026-08): reads user_roles.role_key
// (23-role catalog), not the legacy user_roles.role enum. The enum is
// espejado 1:1 from role_key by admin_set_user_role_key(), collapsing 12
// roles that must NOT see the Scheduler (risk_partner, it_security_manager,
// risk_supervisor, accounting_manager, hr_manager, ita_manager, tax_manager,
// accounting_analyst, collections_analyst, hr_analyst, ita_senior,
// tax_senior) into "manager"/"senior" — see src/lib/schedulerAccess.ts for
// the equivalent frontend-nav predicate, which must stay in sync with the
// switch below.

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

// ── Pure visibility helper (exported for unit tests) ────────────────────
export type VisibilityRule =
  | { kind: "all" }
  | { kind: "lead"; staffId: string }
  | { kind: "assigned"; staffId: string }
  | { kind: "denied" };

export function visibilityRuleFor(
  role: string,
  staffId: string | null
): VisibilityRule {
  switch (role) {
    case "admin":
    case "senior_partner":
    case "partner":
    case "director":
      return { kind: "all" };
    case "manager":
      // Lead-only (D5, strict objective reading): engagements where the
      // caller is manager_id or partner_id — NOT everything they're
      // merely staffed on.
      return staffId ? { kind: "lead", staffId } : { kind: "denied" };
    case "senior":
      return staffId ? { kind: "assigned", staffId } : { kind: "denied" };
    default:
      return { kind: "denied" };
  }
}

// ── ID-list chunking: PostgREST filters travel in the URL ───────────────
export const IN_CHUNK_SIZE = 100;

export function chunkIds<T>(ids: T[], size: number = IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

// ── Keyset pagination ────────────────────────────────────────────────
// PostgREST silently caps every response at its server max-rows (default
// 1000) with NO error signal — a plain select on a potentially large
// table can drop rows, corrupting sorts, caps, and visibility sets. Pages
// by a unique orderable cursor column until a short page.

export const PAGE_SIZE = 1000;

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

/** Runs `build` once per ≤100-id chunk and merges rows deterministically
 *  (input order). Empty lists short-circuit before any request. */
async function chunkedIn(
  ids: string[],
  build: (chunk: string[]) => DbQuery
): Promise<{ rows: unknown[]; error: DbError | null }> {
  if (ids.length === 0) return { rows: [], error: null };
  const rows: unknown[] = [];
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await build(chunk).then((r) => r);
    if (error) {
      if (SCHEMA_NOT_READY_CODES.has(error.code ?? "")) continue;
      return { rows: [], error };
    }
    rows.push(...(data ?? []));
  }
  return { rows, error: null };
}

// ── Input validation ────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Fase 3: bucket del estado efectivo (no la columna legacy `status`).
const STATUS_FILTERS = new Set([
  "active",
  "pending",
  "completed",
  "cancelled",
  "all",
]);
const MAX_RANGE_DAYS = 730;

/**
 * Strict canonical yyyy-MM-dd validation: JavaScript's Date rolls
 * impossible dates over (2026-02-31 parses as Mar 3), so the original
 * invalid string would reach PostgREST and surface as a query error
 * instead of a typed 400. Components must round-trip exactly. Kept in
 * sync with src/lib/schedulerGantt.ts isStrictIsoDate (Deno functions
 * don't share app modules).
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

// ── Row shapes ──────────────────────────────────────────────────────────
interface EngagementRow {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  partner_id: string | null;
  manager_id: string | null;
  client_id: string | null;
  // Fase 3: campos mínimos para derivar el estado efectivo.
  work_order_required: boolean;
  engagement_state_override: number | null;
}

interface WorkOrderStateRow {
  engagement_id: string;
  approval_status: string | null;
  approved_at: string | null;
  risk_status: string | null;
}

/**
 * Fase 3 — resuelve el estado efectivo (1-9) de un conjunto de engagements,
 * leyendo su Work Order gobernante desde la vista RLS-safe
 * `engagement_wo_state` (1:1 por engagement_id — work_orders.engagement_id
 * es UNIQUE, así que no hay ambigüedad de "más reciente"). Un error de
 * "schema not ready" en esta consulta no debe bloquear la respuesta: los
 * engagements sin estado de OT resuelto derivan como si no tuvieran OT
 * (Pendiente si work_order_required, Aprobado si no) — degradación
 * conservadora, nunca un 500.
 */
async function resolveEffectiveStates(
  ctx: SchedulerContext,
  engagements: Pick<
    EngagementRow,
    "engagement_id" | "work_order_required" | "engagement_state_override"
  >[]
): Promise<{ states: Map<string, EngagementState>; error: DbError | null }> {
  const ids = engagements.map((e) => e.engagement_id);
  const { rows, error } = await chunkedIn(ids, (chunk) =>
    ctx.db
      .from("engagement_wo_state")
      .select("engagement_id, approval_status, approved_at, risk_status")
      .in("engagement_id", chunk)
  );
  if (error) return { states: new Map(), error };
  const woByEngagement = new Map<string, WorkOrderStateRow>(
    (rows as WorkOrderStateRow[]).map((r) => [r.engagement_id, r])
  );
  const result = new Map<string, EngagementState>();
  for (const e of engagements) {
    const wo = woByEngagement.get(e.engagement_id) ?? null;
    result.set(
      e.engagement_id,
      effectiveEngagementState(
        {
          work_order_required: e.work_order_required,
          engagement_state_override: e.engagement_state_override,
        },
        wo
      )
    );
  }
  return { states: result, error: null };
}

export type StaffingHealth = "unknown" | "under" | "on_target" | "over";

export function staffingHealth(supply: number, demand: number): StaffingHealth {
  if (demand <= 0) return "unknown";
  if (supply < demand) return "under";
  if (supply === demand) return "on_target";
  return "over";
}

/** Total ordering for L1 rows — the engagement_id tiebreaker makes the
 *  fetch-truncation stable across refreshes even with equal start_date and
 *  null/duplicate engagement_code. */
export function compareL1Rows(
  a: Pick<EngagementRow, "start_date" | "engagement_code" | "engagement_id">,
  b: Pick<EngagementRow, "start_date" | "engagement_code" | "engagement_id">
): number {
  const sa = a.start_date ?? "";
  const sb = b.start_date ?? "";
  if (sa !== sb) return sa < sb ? -1 : 1;
  // nulls first, matching the PostgREST order clause
  if (a.engagement_code !== b.engagement_code) {
    if (a.engagement_code === null) return -1;
    if (b.engagement_code === null) return 1;
    return a.engagement_code < b.engagement_code ? -1 : 1;
  }
  return a.engagement_id < b.engagement_id ? -1 : a.engagement_id > b.engagement_id ? 1 : 0;
}

const L1_LIMIT = 500;

// ── Action: scheduler-l1 ────────────────────────────────────────────────
async function schedulerL1(
  ctx: SchedulerContext,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  const { startDate, endDate } = body;
  if (!isStrictIsoDate(startDate) || !isStrictIsoDate(endDate)) {
    return err(400, "bad_request", "startDate and endDate must be valid YYYY-MM-DD dates");
  }
  if (startDate > endDate) {
    return err(400, "bad_request", "startDate must be before or equal to endDate");
  }
  const diffDays =
    (new Date(endDate + "T00:00:00Z").getTime() -
      new Date(startDate + "T00:00:00Z").getTime()) /
    86400000;
  if (diffDays > MAX_RANGE_DAYS) {
    return err(400, "bad_request", `Date range exceeds maximum of ${MAX_RANGE_DAYS} days`);
  }
  const statusFilter = (body.statusFilter as string | undefined) ?? "all";
  if (!STATUS_FILTERS.has(statusFilter)) {
    return err(400, "bad_request", "Invalid statusFilter");
  }
  for (const key of ["partnerId", "managerId", "clientId"] as const) {
    const v = body[key];
    if (v !== undefined && v !== null && !(typeof v === "string" && UUID_RE.test(v))) {
      return err(400, "bad_request", `Invalid ${key}`);
    }
  }

  const rule = visibilityRuleFor(ctx.role, ctx.staffId);
  if (rule.kind === "denied") {
    return err(403, "forbidden", "This role has no Scheduler visibility");
  }

  // Senior: pre-resolve the caller's active assignment engagement ids;
  // the main query is then constrained to exactly that set.
  let assignedIds: string[] | null = null;
  if (rule.kind === "assigned") {
    const { rows, error } = await pagedSelect(
      () =>
        ctx.db
          .from("engagement_assignments")
          .select("assignment_id, engagement_id")
          .eq("staff_id", rule.staffId)
          .is("deleted_at", null),
      "assignment_id"
    );
    if (error && !SCHEMA_NOT_READY_CODES.has(error.code ?? "")) {
      return err(500, "query_failed", "Could not resolve assignment visibility");
    }
    assignedIds = [
      ...new Set((rows as { engagement_id: string }[]).map((r) => r.engagement_id)),
    ];
    if (assignedIds.length === 0) {
      return { status: 200, payload: { rows: [], truncated: false } };
    }
  }

  // Fase 3: SIN .order()/.limit() aquí — el filtro de estado efectivo no
  // se puede empujar a SQL (se deriva en TS), así que "filtrar antes de
  // limitar" exige traer el conjunto completo (paginado) ANTES de aplicar
  // el bucket y recién entonces ordenar+truncar en memoria.
  const buildBase = (chunk: string[] | null) => {
    let q = ctx.db
      .from("engagements")
      .select(
        "engagement_id, engagement_code, engagement_name, start_date, end_date, status, partner_id, manager_id, client_id, work_order_required, engagement_state_override"
      );
    if (rule.kind === "lead") {
      q = q.or(`manager_id.eq.${rule.staffId},partner_id.eq.${rule.staffId}`);
    }
    if (chunk) q = q.in("engagement_id", chunk);
    // Window overlap; NULL-dated engagements are excluded in v1 — a NULL
    // date never satisfies the comparison.
    q = q.gte("end_date", startDate).lte("start_date", endDate);
    if (body.partnerId) q = q.eq("partner_id", body.partnerId);
    if (body.managerId) q = q.eq("manager_id", body.managerId);
    if (body.clientId) q = q.eq("client_id", body.clientId);
    return q;
  };

  let engagements: EngagementRow[] = [];
  if (assignedIds) {
    // ≤100 ids per chunk ⇒ ≤100 rows per chunk, safe without a cap.
    const { rows, error } = await chunkedIn(assignedIds, (chunk) => buildBase(chunk));
    if (error) return err(500, "query_failed", "Could not load engagements");
    engagements = rows as EngagementRow[];
  } else {
    // "all" / "lead": unbounded candidate set ⇒ keyset-paginate to avoid
    // PostgREST's silent server row cap corrupting the bucket filter.
    const { rows, error } = await pagedSelect(() => buildBase(null), "engagement_id");
    if (error) {
      if (SCHEMA_NOT_READY_CODES.has(error.code ?? "")) {
        return { status: 200, payload: { rows: [], truncated: false } };
      }
      return err(500, "query_failed", "Could not load engagements");
    }
    engagements = rows as unknown as EngagementRow[];
  }

  // Derivar el estado efectivo y filtrar por bucket ANTES de ordenar/truncar.
  const { states: effectiveStates, error: effectiveStatesError } =
    await resolveEffectiveStates(ctx, engagements);
  if (effectiveStatesError) {
    return err(500, "query_failed", "Could not resolve effective engagement states");
  }
  if (statusFilter !== "all") {
    engagements = engagements.filter(
      (e) =>
        engagementStateBucket(effectiveStates.get(e.engagement_id)) ===
        (statusFilter as EngagementStateBucket)
    );
  }

  // Deterministic total ordering + truncation (after a chunked merge the
  // per-chunk ordering must be re-established globally).
  engagements.sort(compareL1Rows);
  const truncated = engagements.length > L1_LIMIT;
  engagements = engagements.slice(0, L1_LIMIT);

  const scopeIds = engagements.map((e) => e.engagement_id);

  // Supply: DISTINCT active-today staff per engagement. Counting rows
  // would double-count a person with overlapping segments and distort
  // staffing_health — overlaps can exist via migrated data, concurrent
  // edits, or direct API writes even though the UI now rejects them.
  const { rows: assignmentRows, error: aErr } = await chunkedIn(scopeIds, (chunk) =>
    ctx.db
      .from("engagement_assignments")
      .select("engagement_id, staff_id")
      .in("engagement_id", chunk)
      .is("deleted_at", null)
      .lte("start_date", ctx.todayUtc)
      .gte("end_date", ctx.todayUtc)
  );
  if (aErr) return err(500, "query_failed", "Could not load assignment counts");
  const staffByEngagement = new Map<string, Set<string>>();
  for (const r of assignmentRows as { engagement_id: string; staff_id: string }[]) {
    if (!staffByEngagement.has(r.engagement_id)) {
      staffByEngagement.set(r.engagement_id, new Set());
    }
    staffByEngagement.get(r.engagement_id)!.add(r.staff_id);
  }
  const supplyByEngagement = new Map<string, number>(
    [...staffByEngagement].map(([id, staff]) => [id, staff.size])
  );

  // Demand: wo_staffing_requirements through work_orders, flattened into
  // two chunk-safe queries and joined in TS.
  const { rows: woRows, error: woErr } = await chunkedIn(scopeIds, (chunk) =>
    ctx.db.from("work_orders").select("wo_id, engagement_id").in("engagement_id", chunk)
  );
  if (woErr) return err(500, "query_failed", "Could not load work orders");
  const woToEngagement = new Map<string, string>();
  for (const r of woRows as { wo_id: string; engagement_id: string }[]) {
    woToEngagement.set(r.wo_id, r.engagement_id);
  }
  const { rows: reqRows, error: reqErr } = await chunkedIn(
    [...woToEngagement.keys()],
    (chunk) =>
      ctx.db.from("wo_staffing_requirements").select("wo_id, staff_count").in("wo_id", chunk)
  );
  if (reqErr) return err(500, "query_failed", "Could not load staffing requirements");
  const demandByEngagement = new Map<string, number>();
  for (const r of reqRows as { wo_id: string; staff_count: number }[]) {
    const engagementId = woToEngagement.get(r.wo_id);
    if (!engagementId) continue;
    demandByEngagement.set(
      engagementId,
      (demandByEngagement.get(engagementId) ?? 0) + (Number(r.staff_count) || 0)
    );
  }

  // Display names (client / partner / manager short names).
  const clientIds = [...new Set(engagements.map((e) => e.client_id).filter(Boolean))] as string[];
  const staffIds = [
    ...new Set(
      engagements.flatMap((e) => [e.partner_id, e.manager_id]).filter(Boolean)
    ),
  ] as string[];
  const { rows: clientRows, error: cErr } = await chunkedIn(clientIds, (chunk) =>
    ctx.db.from("clients").select("client_id, client_legal_name").in("client_id", chunk)
  );
  if (cErr) return err(500, "query_failed", "Could not load client names");
  const clientName = new Map(
    (clientRows as { client_id: string; client_legal_name: string }[]).map((r) => [
      r.client_id,
      r.client_legal_name,
    ])
  );
  const { rows: staffRows, error: sErr } = await chunkedIn(staffIds, (chunk) =>
    ctx.db.from("staff").select("staff_id, short_name").in("staff_id", chunk)
  );
  if (sErr) return err(500, "query_failed", "Could not load staff names");
  const staffShortName = new Map(
    (staffRows as { staff_id: string; short_name: string | null }[]).map((r) => [
      r.staff_id,
      r.short_name,
    ])
  );

  const rows = engagements.map((e) => {
    const supply = supplyByEngagement.get(e.engagement_id) ?? 0;
    const demand = demandByEngagement.get(e.engagement_id) ?? 0;
    return {
      engagement_id: e.engagement_id,
      engagement_code: e.engagement_code,
      engagement_name: e.engagement_name,
      start_date: e.start_date,
      end_date: e.end_date,
      // Legacy: solo diagnóstico/compatibilidad — no es la fuente de verdad.
      status: e.status,
      // Fase 3: estado efectivo numérico 1-9 — fuente de verdad.
      engagement_status: effectiveStates.get(e.engagement_id) ?? null,
      partner_id: e.partner_id,
      manager_id: e.manager_id,
      client_id: e.client_id,
      client_name: e.client_id ? clientName.get(e.client_id) ?? null : null,
      partner_short_name: e.partner_id ? staffShortName.get(e.partner_id) ?? null : null,
      manager_short_name: e.manager_id ? staffShortName.get(e.manager_id) ?? null : null,
      assignment_count: supply,
      demand_count: demand,
      // Computed against the server's UTC "today" — labeled as such in the
      // UI, because a user viewing a past/future window would otherwise
      // misread today's staffing as that period's.
      staffing_health: staffingHealth(supply, demand),
    };
  });

  return { status: 200, payload: { rows, truncated } };
}

// ── Action: scheduler-staff-load (narrowed contract) ─────────────
async function schedulerStaffLoad(
  ctx: SchedulerContext,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  const { engagementId } = body;
  if (!(typeof engagementId === "string" && UUID_RE.test(engagementId))) {
    return err(400, "bad_request", "Invalid engagementId");
  }

  const rule = visibilityRuleFor(ctx.role, ctx.staffId);
  if (rule.kind === "denied") {
    return err(403, "forbidden", "This role has no Scheduler visibility");
  }

  // (1) The caller must be allowed to view THIS engagement under the same
  // rules — no arbitrary staff-UUID lists, no firmwide probing.
  const { data: engRows, error: engErr } = await ctx.db
    .from("engagements")
    .select("engagement_id, partner_id, manager_id")
    .eq("engagement_id", engagementId)
    .then((r) => r);
  if (engErr && !SCHEMA_NOT_READY_CODES.has(engErr.code ?? "")) {
    return err(500, "query_failed", "Could not load the engagement");
  }
  const engagement = ((engRows ?? []) as {
    engagement_id: string;
    partner_id: string | null;
    manager_id: string | null;
  }[])[0];
  if (!engagement) return err(404, "not_found", "Engagement not found");

  if (rule.kind === "lead") {
    if (
      engagement.manager_id !== rule.staffId &&
      engagement.partner_id !== rule.staffId
    ) {
      return err(403, "forbidden", "Managers see only engagements they lead");
    }
  } else if (rule.kind === "assigned") {
    const { data, error } = await ctx.db
      .from("engagement_assignments")
      .select("assignment_id")
      .eq("engagement_id", engagementId)
      .eq("staff_id", rule.staffId)
      .is("deleted_at", null)
      .then((r) => r);
    if (error && !SCHEMA_NOT_READY_CODES.has(error.code ?? "")) {
      return err(500, "query_failed", "Could not resolve assignment visibility");
    }
    if (!data || data.length === 0) {
      return err(403, "forbidden", "Seniors see only engagements they are assigned to");
    }
  }

  // (2) Staff list derived from the engagement's own active assignments.
  const { data: assignRows, error: assignErr } = await ctx.db
    .from("engagement_assignments")
    .select("staff_id")
    .eq("engagement_id", engagementId)
    .is("deleted_at", null)
    .then((r) => r);
  if (assignErr) {
    if (SCHEMA_NOT_READY_CODES.has(assignErr.code ?? "")) {
      return { status: 200, payload: { rows: [] } };
    }
    return err(500, "query_failed", "Could not load assignments");
  }
  const staffIds = [
    ...new Set(((assignRows ?? []) as { staff_id: string }[]).map((r) => r.staff_id)),
  ];

  // (3) Firmwide distinct active-engagement counts — counts only, never
  // engagement identities.
  const { rows: loadRows, error: loadErr } = await chunkedIn(staffIds, (chunk) =>
    ctx.db
      .from("engagement_assignments")
      .select("staff_id, engagement_id")
      .in("staff_id", chunk)
      .is("deleted_at", null)
      .lte("start_date", ctx.todayUtc)
      .gte("end_date", ctx.todayUtc)
  );
  if (loadErr) return err(500, "query_failed", "Could not load staff workload");
  const distinct = new Map<string, Set<string>>();
  for (const r of loadRows as { staff_id: string; engagement_id: string }[]) {
    if (!distinct.has(r.staff_id)) distinct.set(r.staff_id, new Set());
    distinct.get(r.staff_id)!.add(r.engagement_id);
  }
  const rows = staffIds.map((staff_id) => ({
    staff_id,
    active_engagement_count: distinct.get(staff_id)?.size ?? 0,
  }));

  return { status: 200, payload: { rows } };
}

// ── Action: scheduler-staff-timeline ─────────────────
// Cross-engagement timeline for ONE staff member, VIEWER-SCOPED, with:
//   - manager scheduling-scope exception: the target's other engagements
//     are returned too, marked out_of_scope, carrying the engagement name
//     and ITS manager's name (client withheld; the UI renders them purple
//     and non-navigable). A partial timeline misleads booking decisions,
//     and the negotiation needs to know WHICH engagement and WHO to call.
//     Seniors keep the original count-only contract (hiddenEngagementCount).
//   - a `utilization` change-point series computed over ALL of the
//     target's segments (visible + hidden) — aggregate numbers only, the
//     same disclosure class as the load counts — so the booking-level
//     total is TRUE for every viewer.
// Self-view (caller's own staff_id) skips the scope filter.

interface StaffTimelineSegment {
  assignment_id: string;
  engagement_id: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  allocation_percent: number;
  status: string | null;
}

const STAFF_TIMELINE_LIMIT = 500;

// ── Utilization bands ──────────────────────────────────────────

export interface UtilizationBand {
  start_date: string;
  /** Inclusive, EMS convention. */
  end_date: string;
  total_allocation_percent: number;
  total_hours_per_week: number;
}

/** yyyy-MM-dd ± n days via UTC arithmetic (no Date-rollover surprises —
 *  inputs are already isStrictIsoDate-validated). */
export function isoAddDays(s: string, n: number): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Change-point compression of the target's total booking level over the
 * window: one band per stretch where the summed allocation%/hours are
 * constant (totals change only where a segment starts or ends). ALWAYS
 * covers the full window contiguously — stretches with no assignments
 * are explicit zero bands, so the client renders bands verbatim without
 * gap logic. Pure and exported for unit tests.
 */
export function computeUtilizationBands(
  segments: Array<
    Pick<
      StaffTimelineSegment,
      "start_date" | "end_date" | "allocation_percent" | "hours_per_week"
    >
  >,
  startDate: string,
  endDate: string
): UtilizationBand[] {
  const windowEndExclusive = isoAddDays(endDate, 1);
  const points = new Set<string>([startDate, windowEndExclusive]);
  for (const s of segments) {
    if (s.end_date < startDate || s.start_date > endDate) continue;
    points.add(s.start_date > startDate ? s.start_date : startDate);
    points.add(isoAddDays(s.end_date < endDate ? s.end_date : endDate, 1));
  }
  const sorted = [...points]
    .filter((p) => p >= startDate && p <= windowEndExclusive)
    .sort();
  const bands: UtilizationBand[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    let alloc = 0;
    let hours = 0;
    for (const s of segments) {
      if (s.start_date <= from && s.end_date >= from) {
        alloc += Number(s.allocation_percent) || 0;
        hours += Number(s.hours_per_week) || 0;
      }
    }
    const prev = bands[bands.length - 1];
    if (
      prev &&
      prev.total_allocation_percent === alloc &&
      prev.total_hours_per_week === hours
    ) {
      prev.end_date = isoAddDays(sorted[i + 1], -1);
    } else {
      bands.push({
        start_date: from,
        end_date: isoAddDays(sorted[i + 1], -1),
        total_allocation_percent: alloc,
        total_hours_per_week: hours,
      });
    }
  }
  return bands;
}

async function schedulerStaffTimeline(
  ctx: SchedulerContext,
  body: Record<string, unknown>
): Promise<HandlerResult> {
  const { staffId, startDate, endDate } = body;
  if (!(typeof staffId === "string" && UUID_RE.test(staffId))) {
    return err(400, "bad_request", "Invalid staffId");
  }
  if (!isStrictIsoDate(startDate) || !isStrictIsoDate(endDate)) {
    return err(400, "bad_request", "startDate and endDate must be valid YYYY-MM-DD dates");
  }
  if (startDate > endDate) {
    return err(400, "bad_request", "startDate must be before or equal to endDate");
  }
  const diffDays =
    (new Date(endDate + "T00:00:00Z").getTime() -
      new Date(startDate + "T00:00:00Z").getTime()) /
    86400000;
  if (diffDays > MAX_RANGE_DAYS) {
    return err(400, "bad_request", `Date range exceeds maximum of ${MAX_RANGE_DAYS} days`);
  }

  const rule = visibilityRuleFor(ctx.role, ctx.staffId);
  if (rule.kind === "denied") {
    return err(403, "forbidden", "This role has no Scheduler visibility");
  }

  // (1) Target identity — a 404 for a missing person, never a fake-empty
  // timeline. (Names are already broadly visible in-app via the staff
  // hooks; returning them saves the page a PostgREST round trip.)
  const { data: staffRows, error: staffErr } = await ctx.db
    .from("staff")
    .select("staff_id, first_name, last_name, short_name, weekly_capacity_hours")
    .eq("staff_id", staffId)
    .then((r) => r);
  // Schema-not-ready arms return utilization: [] — UNKNOWN, which the
  // client renders as no strip. Only the legitimate zero-segment path
  // returns an explicit full-window zero band (truthfully 0% booked).
  const emptyPayload = (staff: unknown) => ({
    staff,
    rows: [],
    hiddenEngagementCount: 0,
    truncated: false,
    utilization: [] as UtilizationBand[],
  });
  if (staffErr) {
    if (SCHEMA_NOT_READY_CODES.has(staffErr.code ?? "")) {
      return { status: 200, payload: emptyPayload(null) };
    }
    return err(500, "query_failed", "Could not load the staff member");
  }
  const staff = ((staffRows ?? []) as {
    staff_id: string;
    first_name: string;
    last_name: string;
    short_name: string | null;
    weekly_capacity_hours: number | null;
  }[])[0];
  if (!staff) return err(404, "not_found", "Staff member not found");

  // (2) The target's non-deleted segments overlapping the window —
  // KEYSET-PAGED: an unpaginated read silently truncates at PostgREST's
  // server row cap, which would corrupt the sort-before-cap contract AND
  // the hidden count computed from the segment set.
  const { rows: segRows, error: segErr } = await pagedSelect(
    () =>
      ctx.db
        .from("engagement_assignments")
        .select(
          "assignment_id, engagement_id, start_date, end_date, hours_per_week, allocation_percent, status"
        )
        .eq("staff_id", staffId)
        .is("deleted_at", null)
        .lte("start_date", endDate)
        .gte("end_date", startDate),
    "assignment_id"
  );
  if (segErr) {
    if (SCHEMA_NOT_READY_CODES.has(segErr.code ?? "")) {
      return { status: 200, payload: emptyPayload(staff) };
    }
    return err(500, "query_failed", "Could not load assignments");
  }
  const segments = segRows as unknown as StaffTimelineSegment[];
  if (segments.length === 0) {
    return {
      status: 200,
      payload: {
        ...emptyPayload(staff),
        utilization: computeUtilizationBands([], startDate, endDate),
      },
    };
  }
  const engagementIds = [...new Set(segments.map((s) => s.engagement_id))];

  // The booking-level series is computed over ALL segments — BEFORE
  // visibility filtering and BEFORE the row cap — so the total is true
  // for every viewer (aggregates only, no identities).
  const utilization = computeUtilizationBands(segments, startDate, endDate);

  // (3) Engagement identities for the segment set. NOT chunkedIn: its
  // schema-not-ready suppression would drop the rows and step (4) would
  // then misreport every engagement as "hidden" — a schema window must
  // surface as the documented empty success, never as a fake hidden count.
  const engagements: EngagementRow[] = [];
  for (const chunk of chunkIds(engagementIds)) {
    const { data, error } = await ctx.db
      .from("engagements")
      .select(
        "engagement_id, engagement_code, engagement_name, start_date, end_date, status, partner_id, manager_id, client_id, work_order_required, engagement_state_override"
      )
      .in("engagement_id", chunk)
      .then((r) => r);
    if (error) {
      if (SCHEMA_NOT_READY_CODES.has(error.code ?? "")) {
        return { status: 200, payload: emptyPayload(staff) };
      }
      return err(500, "query_failed", "Could not load engagements");
    }
    engagements.push(...((data ?? []) as EngagementRow[]));
  }

  // Fase 3: estado efectivo numérico por engagement del segmento.
  const { states: effectiveStates, error: effectiveStatesError } =
    await resolveEffectiveStates(ctx, engagements);
  if (effectiveStatesError) {
    return err(500, "query_failed", "Could not resolve effective engagement states");
  }

  // (4) Viewer scope. For SENIORS the segments of hidden engagements are
  // dropped here — only their distinct count survives. For MANAGERS the
  // scheduling-scope exception applies: the rows stay, flagged
  // out_of_scope, and the UI renders them purple.
  const selfView = ctx.staffId !== null && ctx.staffId === staffId;
  let visibleEngagements: EngagementRow[];
  let outOfScope = new Set<string>();
  if (selfView || rule.kind === "all") {
    visibleEngagements = engagements;
  } else if (rule.kind === "lead") {
    // Managers see ALL of the target's engagements; the ones they do not
    // lead are marked out_of_scope and disclose only the engagement
    // identity plus its manager's name — client withheld, no navigation.
    visibleEngagements = engagements;
    outOfScope = new Set(
      engagements
        .filter(
          (e) => e.manager_id !== rule.staffId && e.partner_id !== rule.staffId
        )
        .map((e) => e.engagement_id)
    );
  } else {
    // Senior visibility — NARROWED to the target's engagement ids
    // (chunked ≤100) and KEYSET-PAGED per chunk: the previous unbounded
    // firmwide read could exceed PostgREST's server row cap, silently
    // dropping the very row that proves a shared engagement and
    // fabricating a "hidden" outcome on the page's primary authorization
    // boundary. Narrowing bounds the result to the decision actually
    // being made; pagination makes even a many-segment chunk cap-immune.
    const mine = new Set<string>();
    let scopeFailed: HandlerResult | null = null;
    for (const chunk of chunkIds(engagementIds)) {
      const { rows, error } = await pagedSelect(
        () =>
          ctx.db
            .from("engagement_assignments")
            .select("assignment_id, engagement_id")
            .eq("staff_id", rule.staffId)
            .is("deleted_at", null)
            .in("engagement_id", chunk),
        "assignment_id"
      );
      if (error) {
        // Schema availability must never masquerade as visibility data:
        // an empty `mine` would misreport EVERY engagement as hidden.
        // Same empty-success contract as the other schema arms.
        scopeFailed = SCHEMA_NOT_READY_CODES.has(error.code ?? "")
          ? { status: 200, payload: emptyPayload(staff) }
          : err(500, "query_failed", "Could not resolve assignment visibility");
        break;
      }
      for (const r of rows as unknown as { engagement_id: string }[]) {
        mine.add(r.engagement_id);
      }
    }
    if (scopeFailed) return scopeFailed;
    visibleEngagements = engagements.filter((e) => mine.has(e.engagement_id));
  }
  const hiddenEngagementCount = engagementIds.length - visibleEngagements.length;

  // (5) Client names for IN-SCOPE engagements only — out-of-scope rows
  // deliberately never disclose the client (minimal disclosure).
  const clientIds = [
    ...new Set(
      visibleEngagements
        .filter((e) => !outOfScope.has(e.engagement_id))
        .map((e) => e.client_id)
        .filter(Boolean)
    ),
  ] as string[];
  const { rows: clientRows, error: cErr } = await chunkedIn(clientIds, (chunk) =>
    ctx.db.from("clients").select("client_id, client_legal_name").in("client_id", chunk)
  );
  if (cErr) return err(500, "query_failed", "Could not load client names");
  const clientName = new Map(
    (clientRows as { client_id: string; client_legal_name: string }[]).map((r) => [
      r.client_id,
      r.client_legal_name,
    ])
  );

  // (5b) Manager names for the OUT-OF-SCOPE engagements: who to call to
  // negotiate the booking. Graceful null when unresolvable.
  const managerIds = [
    ...new Set(
      visibleEngagements
        .filter((e) => outOfScope.has(e.engagement_id))
        .map((e) => e.manager_id)
        .filter(Boolean)
    ),
  ] as string[];
  const { rows: mgrRows, error: mErr } = await chunkedIn(managerIds, (chunk) =>
    ctx.db.from("staff").select("staff_id, first_name, last_name").in("staff_id", chunk)
  );
  if (mErr) return err(500, "query_failed", "Could not load manager names");
  const managerName = new Map(
    (mgrRows as { staff_id: string; first_name: string; last_name: string }[]).map(
      (r) => [r.staff_id, `${r.first_name} ${r.last_name}`]
    )
  );

  // (6) Deterministic ordering: engagement groups in compareL1Rows order
  // (start, code nulls-first, id — groups stay contiguous for the UI's
  // first-of-group detection), segments by (start_date, assignment_id).
  visibleEngagements.sort(compareL1Rows);
  const engagementById = new Map(visibleEngagements.map((e) => [e.engagement_id, e]));
  const groupPosition = new Map(
    visibleEngagements.map((e, i) => [e.engagement_id, i])
  );
  const rows = segments
    .filter((s) => engagementById.has(s.engagement_id))
    .sort((a, b) => {
      const ga = groupPosition.get(a.engagement_id)!;
      const gb = groupPosition.get(b.engagement_id)!;
      if (ga !== gb) return ga - gb;
      if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1;
      return a.assignment_id < b.assignment_id ? -1 : a.assignment_id > b.assignment_id ? 1 : 0;
    })
    .map((s) => {
      const e = engagementById.get(s.engagement_id)!;
      const isOut = outOfScope.has(s.engagement_id);
      return {
        assignment_id: s.assignment_id,
        engagement_id: s.engagement_id,
        start_date: s.start_date,
        end_date: s.end_date,
        hours_per_week: s.hours_per_week,
        allocation_percent: s.allocation_percent,
        // Estado del ASSIGNMENT (no del engagement).
        status: s.status,
        engagement_code: e.engagement_code,
        engagement_name: e.engagement_name,
        // Fase 3: estado efectivo numérico del ENGAGEMENT.
        engagement_status: effectiveStates.get(e.engagement_id) ?? null,
        client_name:
          !isOut && e.client_id ? clientName.get(e.client_id) ?? null : null,
        out_of_scope: isOut,
        manager_name:
          isOut && e.manager_id ? managerName.get(e.manager_id) ?? null : null,
      };
    });

  const truncated = rows.length > STAFF_TIMELINE_LIMIT;
  return {
    status: 200,
    payload: {
      staff,
      rows: rows.slice(0, STAFF_TIMELINE_LIMIT),
      hiddenEngagementCount,
      truncated,
      utilization,
    },
  };
}

// ── Dispatch ────────────────────────────────────────────────────────────
export const VALID_ACTIONS = [
  "scheduler-l1",
  "scheduler-staff-load",
  "scheduler-staff-timeline",
] as const;

export async function handleAction(
  ctx: SchedulerContext,
  body: unknown
): Promise<HandlerResult> {
  if (typeof body !== "object" || body === null) {
    return err(400, "bad_request", "Invalid JSON in request body");
  }
  const record = body as Record<string, unknown>;
  const action = record.action;
  if (action === "scheduler-l1") return schedulerL1(ctx, record);
  if (action === "scheduler-staff-load") return schedulerStaffLoad(ctx, record);
  if (action === "scheduler-staff-timeline") return schedulerStaffTimeline(ctx, record);
  return err(400, "bad_request", "Invalid or missing action parameter");
}

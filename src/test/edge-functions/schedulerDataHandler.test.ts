// Full-handler authorization tests for the scheduler-data edge function:
// the COMPLETE actions run against fixtures with mixed
// authorized/unauthorized engagements, asserting the final response per
// role. The visibility filter is a security boundary (the deployed
// function queries with the service role, RLS bypassed), so these tests
// are the primary defense against firmwide data leaks.
//
// Fase 3 (plan v2 §1): el estado efectivo se fija por fixture vía
// `engagement_state_override` (bypassa la derivación por Work Order,
// probada por separado en engagementState.parity.test.ts) — mapeado 1:1
// desde los valores legacy originales de `status` para preservar la
// intención de cada escenario: active→4 Aprobado, pending→1 Pendiente,
// completed→7 Finalizado.

import { describe, expect, it } from "vitest";
import { EngagementState } from "@/lib/engagementStatus";
import {
  chunkIds,
  compareL1Rows,
  computeUtilizationBands,
  handleAction,
  isoAddDays,
  isStrictIsoDate,
  resolveIdentity,
  staffingHealth,
  visibilityRuleFor,
  type SchedulerContext,
} from "../../../supabase/functions/scheduler-data/handler.ts";
import { createFakeDb, type FakeDbOptions, type Fixtures } from "./postgrestMock";

const TODAY = "2026-07-17";

const uuid = (n: number, prefix = "e") => {
  const hex = n.toString(16).padStart(12, "0");
  const p = prefix === "e" ? "00000001" : prefix === "s" ? "00000002" : "00000003";
  return `${p}-0000-4000-8000-${hex}`;
};

// Staff ids
const PART = uuid(1, "s");
const DIR = uuid(2, "s");
const MGR = uuid(3, "s");
const SEN = uuid(4, "s");
const X1 = uuid(5, "s");
const X2 = uuid(6, "s");
const X3 = uuid(7, "s");

// Engagement ids
const E1 = uuid(1); // led by MGR (manager_id) — override 4 Aprobado (was "active")
const E2 = uuid(2); // MGR is partner_id — override 1 Pendiente (was "pending")
const E3 = uuid(3); // unrelated to MGR; SEN actively assigned — override 4 Aprobado
const E4 = uuid(4); // SEN's assignment is soft-deleted → no visibility — override 4 Aprobado
const E5 = uuid(5); // outside the window — override 7 Finalizado (was "completed")
const E6 = uuid(6); // NULL dates → excluded in v1 — override 1 Pendiente

const C1 = uuid(1, "c");

function baseFixtures(): Fixtures {
  return {
    engagements: [
      { engagement_id: E1, engagement_code: "A-001", engagement_name: "Audit One", start_date: "2026-02-01", end_date: "2026-11-30", status: "active", partner_id: PART, manager_id: MGR, client_id: C1, work_order_required: true, engagement_state_override: EngagementState.Aprobado },
      { engagement_id: E2, engagement_code: "A-002", engagement_name: "Audit Two", start_date: "2026-03-01", end_date: "2026-10-31", status: "pending", partner_id: MGR, manager_id: X1, client_id: C1, work_order_required: true, engagement_state_override: EngagementState.Pendiente },
      { engagement_id: E3, engagement_code: "B-001", engagement_name: "Consulting", start_date: "2026-01-15", end_date: "2026-12-15", status: "active", partner_id: PART, manager_id: X2, client_id: null, work_order_required: true, engagement_state_override: EngagementState.Aprobado },
      { engagement_id: E4, engagement_code: "B-002", engagement_name: "Tax Review", start_date: "2026-04-01", end_date: "2026-09-30", status: "active", partner_id: PART, manager_id: X2, client_id: null, work_order_required: true, engagement_state_override: EngagementState.Aprobado },
      { engagement_id: E5, engagement_code: "C-001", engagement_name: "Old One", start_date: "2024-01-01", end_date: "2024-12-31", status: "completed", partner_id: PART, manager_id: MGR, client_id: C1, work_order_required: true, engagement_state_override: EngagementState.Finalizado },
      { engagement_id: E6, engagement_code: "C-002", engagement_name: "Undated", start_date: null, end_date: null, status: "pending", partner_id: PART, manager_id: MGR, client_id: C1, work_order_required: true, engagement_state_override: EngagementState.Pendiente },
    ],
    engagement_assignments: [
      { assignment_id: "a1", engagement_id: E1, staff_id: X1, start_date: "2026-02-01", end_date: "2026-11-30", hours_per_week: 40, allocation_percent: 100, deleted_at: null },
      { assignment_id: "a2", engagement_id: E1, staff_id: X2, start_date: "2026-06-01", end_date: "2026-08-31", hours_per_week: 40, allocation_percent: 100, deleted_at: null },
      { assignment_id: "a3", engagement_id: E3, staff_id: SEN, start_date: "2026-01-15", end_date: "2026-12-15", hours_per_week: 40, allocation_percent: 100, deleted_at: null },
      { assignment_id: "a4", engagement_id: E4, staff_id: SEN, start_date: "2026-04-01", end_date: "2026-09-30", hours_per_week: 40, allocation_percent: 100, deleted_at: "2026-05-01T00:00:00Z" },
      { assignment_id: "a5", engagement_id: E3, staff_id: MGR, start_date: "2026-01-15", end_date: "2026-12-15", hours_per_week: 40, allocation_percent: 100, deleted_at: null },
      { assignment_id: "a6", engagement_id: E2, staff_id: X1, start_date: "2026-03-01", end_date: "2026-04-30", hours_per_week: 40, allocation_percent: 100, deleted_at: null },
      { assignment_id: "a7", engagement_id: E1, staff_id: X3, start_date: "2026-02-01", end_date: "2026-11-30", hours_per_week: 40, allocation_percent: 100, deleted_at: null },
      { assignment_id: "a8", engagement_id: E3, staff_id: X3, start_date: "2026-01-15", end_date: "2026-12-15", hours_per_week: 40, allocation_percent: 100, deleted_at: null },
    ],
    work_orders: [
      { wo_id: "w1", engagement_id: E1 },
      { wo_id: "w2", engagement_id: E1 },
      { wo_id: "w3", engagement_id: E3 },
    ],
    wo_staffing_requirements: [
      { wo_id: "w1", staff_count: 2 },
      { wo_id: "w2", staff_count: 1 },
      { wo_id: "w3", staff_count: 5 },
    ],
    clients: [{ client_id: C1, client_legal_name: "Cliente Uno S.A." }],
    staff: [
      { staff_id: PART, short_name: "PP", first_name: "Pat", last_name: "Partner" },
      { staff_id: MGR, short_name: "MM", first_name: "Max", last_name: "Manager" },
      { staff_id: SEN, short_name: "SS", first_name: "Sam", last_name: "Senior" },
      { staff_id: X1, short_name: "X1", first_name: "Xena", last_name: "One" },
      { staff_id: X2, short_name: "X2", first_name: "Xavi", last_name: "Two" },
      { staff_id: X3, short_name: "X3", first_name: "Xiao", last_name: "Three" },
    ],
    // Fase 3: vacía a propósito — sin overrides de WO real en estos fixtures,
    // resolveEffectiveStates cae siempre al engagement_state_override fijado
    // arriba (nunca a la derivación por Work Order, probada aparte).
    engagement_wo_state: [],
  };
}

function ctx(
  role: string,
  staffId: string | null,
  fixtures: Fixtures = baseFixtures(),
  options: FakeDbOptions = {}
): SchedulerContext & {
  queryLog: { table: string; filters: string[] }[];
  failTable: (t: string, e: { code?: string; message?: string }) => void;
  failTableAfter: (t: string, e: { code?: string; message?: string }, skip: number) => void;
} {
  const db = createFakeDb(fixtures, options);
  return {
    db,
    staffId,
    role,
    todayUtc: TODAY,
    queryLog: db.queryLog,
    failTable: db.failTable,
    failTableAfter: db.failTableAfter,
  };
}

const L1_BODY = { action: "scheduler-l1", startDate: "2026-01-01", endDate: "2026-12-31" };

const rowIds = (payload: unknown) =>
  (payload as { rows: { engagement_id: string }[] }).rows.map((r) => r.engagement_id);

// ── Identity resolution (DB errors must surface) ──────────

describe("resolveIdentity", () => {
  const AUTH_USER = uuid(50, "s");
  const fixtures = (): Fixtures => ({
    staff: [{ staff_id: MGR, auth_user_id: AUTH_USER }],
    user_roles: [{ user_id: AUTH_USER, role_key: "manager" }],
  });

  it("resolves staff id and role for a linked user", async () => {
    const db = createFakeDb(fixtures());
    const { identity, error } = await resolveIdentity(db, AUTH_USER);
    expect(error).toBeNull();
    expect(identity).toEqual({ staffId: MGR, role: "manager" });
  });

  it("no staff row → null staffId; no role row → denied default", async () => {
    const db = createFakeDb({ staff: [], user_roles: [] });
    const { identity, error } = await resolveIdentity(db, AUTH_USER);
    expect(error).toBeNull();
    expect(identity).toEqual({ staffId: null, role: "" });
  });

  it("a staff-table DB error propagates instead of defaulting", async () => {
    const db = createFakeDb(fixtures());
    db.failTable("staff", { code: "XX000", message: "connection reset" });
    const { identity, error } = await resolveIdentity(db, AUTH_USER);
    expect(identity).toBeNull();
    expect(error).toMatchObject({ code: "XX000" });
  });

  it("a user_roles DB error propagates instead of defaulting to denied", async () => {
    // A transient error must become a 500 upstream — never a silent
    // role="" → 403 for an admin.
    const db = createFakeDb(fixtures());
    db.failTable("user_roles", { code: "08006", message: "connection failure" });
    const { identity, error } = await resolveIdentity(db, AUTH_USER);
    expect(identity).toBeNull();
    expect(error).toMatchObject({ code: "08006" });
  });
});

// ── Pure helpers ────────────────────────────────────────────────────────

describe("visibilityRuleFor (pure, per role_key)", () => {
  it("admin / senior_partner / partner / director → all", () => {
    for (const role of ["admin", "senior_partner", "partner", "director"]) {
      expect(visibilityRuleFor(role, SEN)).toEqual({ kind: "all" });
      // firmwide roles do not require a staff row
      expect(visibilityRuleFor(role, null)).toEqual({ kind: "all" });
    }
  });
  it("manager → lead-only; senior → assignment-based", () => {
    expect(visibilityRuleFor("manager", MGR)).toEqual({ kind: "lead", staffId: MGR });
    expect(visibilityRuleFor("senior", SEN)).toEqual({ kind: "assigned", staffId: SEN });
  });
  it("manager/senior without a staff row → denied", () => {
    expect(visibilityRuleFor("manager", null)).toEqual({ kind: "denied" });
    expect(visibilityRuleFor("senior", null)).toEqual({ kind: "denied" });
  });
  it("other roles → denied", () => {
    for (const role of ["staff", "semisenior", "assistant", ""]) {
      expect(visibilityRuleFor(role, SEN)).toEqual({ kind: "denied" });
    }
  });
  // Merge con feat/roles-permisos (H3): estos 12 role_key heredarían acceso
  // bajo el enum legacy espejado (mapean a "partner"/"manager"/"senior")
  // pero deben quedar denegados bajo el catálogo de 23 roles.
  it("los 12 role_key filtrados por el enum legacy → denied (H3)", () => {
    const filtered = [
      "risk_partner",
      "it_security_manager",
      "risk_supervisor",
      "accounting_manager",
      "hr_manager",
      "ita_manager",
      "tax_manager",
      "accounting_analyst",
      "collections_analyst",
      "hr_analyst",
      "ita_senior",
      "tax_senior",
    ];
    for (const role of filtered) {
      expect(visibilityRuleFor(role, SEN)).toEqual({ kind: "denied" });
      expect(visibilityRuleFor(role, null)).toEqual({ kind: "denied" });
    }
  });
});

describe("staffingHealth", () => {
  it("no demand → unknown regardless of supply", () => {
    expect(staffingHealth(0, 0)).toBe("unknown");
    expect(staffingHealth(4, 0)).toBe("unknown");
  });
  it("under / on_target / over", () => {
    expect(staffingHealth(1, 3)).toBe("under");
    expect(staffingHealth(3, 3)).toBe("on_target");
    expect(staffingHealth(4, 3)).toBe("over");
  });
});

describe("chunkIds", () => {
  it("empty → no chunks", () => expect(chunkIds([])).toEqual([]));
  it("1, exactly 100, and 101 ids", () => {
    expect(chunkIds(["a"])).toEqual([["a"]]);
    const hundred = Array.from({ length: 100 }, (_, i) => `id${i}`);
    expect(chunkIds(hundred)).toHaveLength(1);
    expect(chunkIds([...hundred, "x"])).toHaveLength(2);
    expect(chunkIds([...hundred, "x"])[1]).toEqual(["x"]);
  });
});

describe("compareL1Rows total ordering", () => {
  it("start_date, then engagement_code nulls-first, then engagement_id", () => {
    const rows = [
      { start_date: "2026-01-01", engagement_code: "B", engagement_id: "2" },
      { start_date: "2026-01-01", engagement_code: null, engagement_id: "9" },
      { start_date: "2026-01-01", engagement_code: "B", engagement_id: "1" },
      { start_date: "2025-12-31", engagement_code: "Z", engagement_id: "5" },
    ];
    const sorted = [...rows].sort(compareL1Rows);
    expect(sorted.map((r) => r.engagement_id)).toEqual(["5", "9", "1", "2"]);
  });
});

// ── scheduler-l1: authorization boundary ───────────────────────────────

describe("scheduler-l1 visibility (security boundary, D5)", () => {
  it.each(["admin", "partner", "director"])("%s sees all in-window engagements", async (role) => {
    const c = ctx(role, role === "admin" ? null : PART);
    const res = await handleAction(c, L1_BODY);
    expect(res.status).toBe(200);
    expect(rowIds(res.payload)).toEqual([E3, E1, E2, E4]); // start_date order
  });

  it("manager sees ONLY engagements they lead — not ones they are merely staffed on", async () => {
    const res = await handleAction(ctx("manager", MGR), L1_BODY);
    expect(res.status).toBe(200);
    // E1 (manager_id) + E2 (partner_id). E3 excluded despite MGR's active
    // assignment on it (a5) — lead-only is the strict D5 reading.
    expect(rowIds(res.payload)).toEqual([E1, E2]);
  });

  it("senior sees exactly the engagements with an active, non-deleted assignment", async () => {
    const res = await handleAction(ctx("senior", SEN), L1_BODY);
    expect(res.status).toBe(200);
    // E3 via a3. E4 must NOT appear — that assignment is soft-deleted.
    expect(rowIds(res.payload)).toEqual([E3]);
  });

  it("senior with no assignments → empty success without querying engagements", async () => {
    const fixtures = baseFixtures();
    fixtures.engagement_assignments = [];
    const c = ctx("senior", SEN, fixtures);
    const res = await handleAction(c, L1_BODY);
    expect(res.status).toBe(200);
    expect(res.payload).toEqual({ rows: [], truncated: false });
    expect(c.queryLog.some((q) => q.table === "engagements")).toBe(false);
  });

  it("non-scheduler roles get the 403 envelope", async () => {
    for (const role of ["staff", "semisenior"]) {
      const res = await handleAction(ctx(role, X1), L1_BODY);
      expect(res.status).toBe(403);
      expect(res.payload).toMatchObject({ error: { code: "forbidden" } });
    }
  });

  it("manager without a staff row is denied", async () => {
    const res = await handleAction(ctx("manager", null), L1_BODY);
    expect(res.status).toBe(403);
  });

  it("NULL-dated and out-of-window engagements are excluded for every role", async () => {
    const res = await handleAction(ctx("admin", null), L1_BODY);
    const ids = rowIds(res.payload);
    expect(ids).not.toContain(E5);
    expect(ids).not.toContain(E6);
  });
});

describe("scheduler-l1 rollups and output shape", () => {
  it("supply counts active-today assignments; demand sums wo requirements; health derives", async () => {
    const res = await handleAction(ctx("admin", null), L1_BODY);
    const rows = (res.payload as { rows: Record<string, unknown>[] }).rows;
    const byId = new Map(rows.map((r) => [r.engagement_id, r]));
    // E1: a1 + a2 + a7 active today = 3 supply; demand w1+w2 = 3 → on_target
    expect(byId.get(E1)).toMatchObject({
      assignment_count: 3,
      demand_count: 3,
      staffing_health: "on_target",
      client_name: "Cliente Uno S.A.",
      partner_short_name: "PP",
      manager_short_name: "MM",
    });
    // E2: a6 ended in April (not active today) → 0 supply, 0 demand → unknown
    expect(byId.get(E2)).toMatchObject({
      assignment_count: 0,
      demand_count: 0,
      staffing_health: "unknown",
    });
    // E3: a3 + a5 + a8 = 3 supply; demand 5 → under
    expect(byId.get(E3)).toMatchObject({
      assignment_count: 3,
      demand_count: 5,
      staffing_health: "under",
      client_name: null,
    });
  });

  it("optional filters narrow the result (statusFilter + managerId)", async () => {
    const res = await handleAction(ctx("admin", null), {
      ...L1_BODY,
      statusFilter: "active",
      managerId: MGR,
    });
    expect(rowIds(res.payload)).toEqual([E1]);
  });

  it("supply counts DISTINCT staff — overlapping segments never double-count", async () => {
    const fixtures = baseFixtures();
    // X1 gains two additional segments on E1 overlapping a1's window.
    fixtures.engagement_assignments.push(
      { assignment_id: "dup1", engagement_id: E1, staff_id: X1, start_date: "2026-06-01", end_date: "2026-09-30", deleted_at: null },
      { assignment_id: "dup2", engagement_id: E1, staff_id: X1, start_date: "2026-07-01", end_date: "2026-07-31", deleted_at: null }
    );
    const res = await handleAction(ctx("admin", null, fixtures), L1_BODY);
    const rows = (res.payload as { rows: Record<string, unknown>[] }).rows;
    const e1 = rows.find((r) => r.engagement_id === E1)!;
    // Still 3 distinct people (X1, X2, X3) despite 5 active rows —
    // demand is 3, so health stays on_target instead of flipping to over.
    expect(e1.assignment_count).toBe(3);
    expect(e1.staffing_health).toBe("on_target");
  });
});

describe("scheduler-l1 input validation", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["missing dates", { action: "scheduler-l1" }],
    ["malformed date", { action: "scheduler-l1", startDate: "2026-1-1", endDate: "2026-12-31" }],
    ["impossible date", { action: "scheduler-l1", startDate: "2026-13-45", endDate: "2026-12-31" }],
    ["start after end", { action: "scheduler-l1", startDate: "2026-12-31", endDate: "2026-01-01" }],
    ["range over 730 days", { action: "scheduler-l1", startDate: "2024-01-01", endDate: "2026-12-31" }],
    ["bad statusFilter", { ...L1_BODY, statusFilter: "paused" }],
    ["bad partnerId", { ...L1_BODY, partnerId: "not-a-uuid" }],
  ];
  it.each(cases)("%s → 400 envelope", async (_name, body) => {
    const res = await handleAction(ctx("admin", null), body);
    expect(res.status).toBe(400);
    expect(res.payload).toMatchObject({ error: { code: "bad_request" } });
  });

  it("unknown action → 400", async () => {
    const res = await handleAction(ctx("admin", null), { action: "exec-sql" });
    expect(res.status).toBe(400);
  });

  it("impossible rollover dates get a typed 400, valid leap days pass", async () => {
    // 2026-02-31 would JS-parse as Mar 3 and reach PostgREST as garbage.
    for (const bad of ["2026-02-29", "2026-02-30", "2026-02-31", "2026-04-31"]) {
      const res = await handleAction(ctx("admin", null), {
        action: "scheduler-l1",
        startDate: bad,
        endDate: "2026-12-31",
      });
      expect(res.status).toBe(400);
      expect(res.payload).toMatchObject({ error: { code: "bad_request" } });
    }
    const leap = await handleAction(ctx("admin", null), {
      action: "scheduler-l1",
      startDate: "2028-02-29",
      endDate: "2028-12-31",
    });
    expect(leap.status).toBe(200);
  });

  it("isStrictIsoDate mirrors the shared client-side rule", () => {
    expect(isStrictIsoDate("2028-02-29")).toBe(true);
    expect(isStrictIsoDate("2026-02-31")).toBe(false);
    expect(isStrictIsoDate("2026-7-1")).toBe(false);
    expect(isStrictIsoDate(null)).toBe(false);
  });
});

describe("scheduler-l1 error semantics (errors are errors)", () => {
  it("schema-not-ready (42P01) yields empty success, not an error", async () => {
    const c = ctx("admin", null);
    c.failTable("engagements", { code: "42P01", message: "relation does not exist" });
    const res = await handleAction(c, L1_BODY);
    expect(res.status).toBe(200);
    expect(res.payload).toEqual({ rows: [], truncated: false });
  });

  it("other query failures yield the 500 envelope", async () => {
    const c = ctx("admin", null);
    c.failTable("engagements", { code: "XX000", message: "boom" });
    const res = await handleAction(c, L1_BODY);
    expect(res.status).toBe(500);
    expect(res.payload).toMatchObject({ error: { code: "query_failed" } });
  });

  it("effective-state query failures yield the 500 envelope instead of derived fallback states", async () => {
    const c = ctx("admin", null);
    c.failTable("engagement_wo_state", { code: "XX000", message: "boom" });
    const res = await handleAction(c, L1_BODY);
    expect(res.status).toBe(500);
    expect(res.payload).toMatchObject({ error: { code: "query_failed" } });
  });
});

describe("scheduler-l1 senior assignment pagination", () => {
  it("keeps an engagement visible when its assignment is on the second PostgREST page", async () => {
    const fixtures = baseFixtures();
    fixtures.engagement_assignments = fixtures.engagement_assignments.filter(
      (a) => a.assignment_id !== "a3"
    );
    for (let i = 0; i < 1000; i++) {
      fixtures.engagement_assignments.push({
        assignment_id: `noise-${String(i).padStart(4, "0")}`,
        engagement_id: E5,
        staff_id: SEN,
        start_date: "2024-01-01",
        end_date: "2024-12-31",
        deleted_at: null,
      });
    }
    fixtures.engagement_assignments.push({
      assignment_id: "zz-visible",
      engagement_id: E3,
      staff_id: SEN,
      start_date: "2026-01-15",
      end_date: "2026-12-15",
      deleted_at: null,
    });

    const res = await handleAction(
      ctx("senior", SEN, fixtures, { serverRowCap: 1000 }),
      L1_BODY
    );
    expect(res.status).toBe(200);
    expect((res.payload as { rows: { engagement_id: string }[] }).rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ engagement_id: E3 })])
    );
  });
});

describe("scheduler-l1 truncation at the 500 cap (tests at 499/500/501)", () => {
  function bulkFixtures(count: number): Fixtures {
    const fixtures = baseFixtures();
    fixtures.engagements = Array.from({ length: count }, (_, i) => ({
      engagement_id: uuid(i + 100),
      // Equal start dates + duplicate/null codes: the engagement_id
      // tiebreaker is what keeps "first 500" meaningful.
      engagement_code: i % 7 === 0 ? null : `DUP-${i % 3}`,
      engagement_name: `E${i}`,
      start_date: "2026-05-01",
      end_date: "2026-08-31",
      status: "active",
      partner_id: null,
      manager_id: null,
      client_id: null,
      work_order_required: true,
      engagement_state_override: EngagementState.Aprobado,
    }));
    fixtures.engagement_assignments = [];
    fixtures.work_orders = [];
    fixtures.wo_staffing_requirements = [];
    return fixtures;
  }

  it.each([
    [499, false, 499],
    [500, false, 500],
    [501, true, 500],
  ])("%i engagements → truncated=%s with %i rows", async (count, truncated, expectRows) => {
    const res = await handleAction(ctx("admin", null, bulkFixtures(count)), L1_BODY);
    const payload = res.payload as { rows: unknown[]; truncated: boolean };
    expect(payload.truncated).toBe(truncated);
    expect(payload.rows).toHaveLength(expectRows);
  });

  it("ordering is stable across repeated calls (engagement_id tiebreaker)", async () => {
    const fixtures = bulkFixtures(501);
    const first = rowIds((await handleAction(ctx("admin", null, fixtures), L1_BODY)).payload);
    const second = rowIds((await handleAction(ctx("admin", null, fixtures), L1_BODY)).payload);
    expect(first).toEqual(second);
    const sortedCopy = [...first];
    expect(first).toEqual(sortedCopy); // deterministic slice of a total order
  });
});

describe("scheduler-l1 .in() chunking (≤100 ids per request)", () => {
  it("senior with 250 assignment engagements issues 3 chunked queries and merges", async () => {
    const fixtures = baseFixtures();
    const many = Array.from({ length: 250 }, (_, i) => uuid(i + 500));
    fixtures.engagements = many.map((id, i) => ({
      engagement_id: id,
      engagement_code: `M-${String(i).padStart(3, "0")}`,
      engagement_name: `Bulk ${i}`,
      start_date: "2026-05-01",
      end_date: "2026-08-31",
      status: "active",
      partner_id: null,
      manager_id: null,
      client_id: null,
      work_order_required: true,
      engagement_state_override: EngagementState.Aprobado,
    }));
    fixtures.engagement_assignments = many.map((id, i) => ({
      assignment_id: `bulk-${i}`,
      engagement_id: id,
      staff_id: SEN,
      start_date: "2026-05-01",
      end_date: "2026-08-31",
      deleted_at: null,
    }));
    fixtures.work_orders = [];
    fixtures.wo_staffing_requirements = [];
    const c = ctx("senior", SEN, fixtures);
    const res = await handleAction(c, L1_BODY);
    expect(res.status).toBe(200);
    expect((res.payload as { rows: unknown[] }).rows).toHaveLength(250);
    const engagementQueries = c.queryLog.filter((q) => q.table === "engagements");
    expect(engagementQueries).toHaveLength(3); // 100 + 100 + 50
    expect(engagementQueries.map((q) => q.filters.find((f) => f.startsWith("in:")))).toEqual([
      "in:engagement_id(100)",
      "in:engagement_id(100)",
      "in:engagement_id(50)",
    ]);
  });
});

// ── scheduler-staff-load ────────────────────────────────────────────────

describe("scheduler-staff-load authorization (narrowed contract)", () => {
  const body = (engagementId: string) => ({ action: "scheduler-staff-load", engagementId });

  it("admin/partner/director may load any engagement", async () => {
    for (const role of ["admin", "partner", "director"]) {
      const res = await handleAction(ctx(role, null), body(E1));
      expect(res.status).toBe(200);
    }
  });

  it("manager: lead engagement 200, merely-staffed engagement 403", async () => {
    expect((await handleAction(ctx("manager", MGR), body(E1))).status).toBe(200);
    expect((await handleAction(ctx("manager", MGR), body(E2))).status).toBe(200);
    const denied = await handleAction(ctx("manager", MGR), body(E3));
    expect(denied.status).toBe(403);
  });

  it("senior: assigned engagement 200, others 403 (deleted assignment does not count)", async () => {
    expect((await handleAction(ctx("senior", SEN), body(E3))).status).toBe(200);
    expect((await handleAction(ctx("senior", SEN), body(E1))).status).toBe(403);
    expect((await handleAction(ctx("senior", SEN), body(E4))).status).toBe(403);
  });

  it("non-scheduler role 403; unknown engagement 404; malformed id 400", async () => {
    expect((await handleAction(ctx("staff", X1), body(E1))).status).toBe(403);
    expect((await handleAction(ctx("admin", null), body(uuid(999)))).status).toBe(404);
    expect(
      (await handleAction(ctx("admin", null), { action: "scheduler-staff-load", engagementId: "nope" })).status
    ).toBe(400);
  });
});

describe("scheduler-staff-load output (counts only, never identities)", () => {
  it("counts distinct active engagements firmwide per staff on the engagement", async () => {
    const res = await handleAction(ctx("admin", null), {
      action: "scheduler-staff-load",
      engagementId: E1,
    });
    expect(res.status).toBe(200);
    const rows = (res.payload as { rows: Record<string, unknown>[] }).rows;
    const byStaff = new Map(rows.map((r) => [r.staff_id, r.active_engagement_count]));
    expect(byStaff.get(X1)).toBe(1); // a1 active; a6 is in the past
    expect(byStaff.get(X2)).toBe(1);
    expect(byStaff.get(X3)).toBe(2); // active on E1 AND E3 today
    // Counts only — no engagement identities in the payload.
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(["active_engagement_count", "staff_id"]);
    }
  });
});

// ── scheduler-staff-timeline ──────────────────────────────

interface TimelinePayload {
  staff: { staff_id: string } | null;
  rows: Record<string, unknown>[];
  hiddenEngagementCount: number;
  truncated: boolean;
}

const TL_BODY = (staffId: string) => ({
  action: "scheduler-staff-timeline",
  staffId,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
});

const timelineEngagements = (payload: unknown) => [
  ...new Set((payload as TimelinePayload).rows.map((r) => r.engagement_id)),
];

describe("scheduler-staff-timeline input validation", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["missing staffId", { action: "scheduler-staff-timeline", startDate: "2026-01-01", endDate: "2026-12-31" }],
    ["malformed staffId", TL_BODY("not-a-uuid")],
    ["missing dates", { action: "scheduler-staff-timeline", staffId: X3 }],
    ["impossible date", { ...TL_BODY(X3), startDate: "2026-02-31" }],
    ["start after end", { ...TL_BODY(X3), startDate: "2026-12-31", endDate: "2026-01-01" }],
    ["range over 730 days", { ...TL_BODY(X3), startDate: "2024-01-01" }],
  ];
  it.each(cases)("%s → 400 envelope", async (_name, body) => {
    const res = await handleAction(ctx("admin", null), body);
    expect(res.status).toBe(400);
    expect(res.payload).toMatchObject({ error: { code: "bad_request" } });
  });

  it("unknown staff member → 404; non-scheduler role → 403", async () => {
    expect((await handleAction(ctx("admin", null), TL_BODY(uuid(999, "s")))).status).toBe(404);
    for (const role of ["staff", "semisenior"]) {
      const res = await handleAction(ctx(role, X1), TL_BODY(X3));
      expect(res.status).toBe(403);
      expect(res.payload).toMatchObject({ error: { code: "forbidden" } });
    }
  });
});

describe("scheduler-staff-timeline viewer scoping (security boundary)", () => {
  // Target X3 has a7 on E1 (2026-02-01→11-30) and a8 on E3 (2026-01-15→12-15).

  it("admin/partner/director see the full timeline with zero hidden", async () => {
    for (const role of ["admin", "partner", "director"]) {
      const res = await handleAction(ctx(role, role === "admin" ? null : PART), TL_BODY(X3));
      expect(res.status).toBe(200);
      const payload = res.payload as TimelinePayload;
      // Group order = compareL1Rows on engagements: E3 (starts 01-15) before E1.
      expect(payload.rows.map((r) => r.assignment_id)).toEqual(["a8", "a7"]);
      expect(payload.hiddenEngagementCount).toBe(0);
      expect(payload.truncated).toBe(false);
      expect(payload.staff).toMatchObject({
        staff_id: X3,
        first_name: "Xiao",
        last_name: "Three",
        short_name: "X3",
      });
    }
  });

  it("row shape joins engagement identity + client name + effective state", async () => {
    const res = await handleAction(ctx("admin", null), TL_BODY(X3));
    const rows = (res.payload as TimelinePayload).rows;
    expect(rows[1]).toMatchObject({
      assignment_id: "a7",
      engagement_id: E1,
      start_date: "2026-02-01",
      end_date: "2026-11-30",
      engagement_code: "A-001",
      engagement_name: "Audit One",
      engagement_status: EngagementState.Aprobado,
      client_name: "Cliente Uno S.A.",
    });
    expect(rows[0]).toMatchObject({ engagement_id: E3, client_name: null });
  });

  it("manager scheduling-scope exception: non-led engagements arrive as OUT-OF-SCOPE rows with the engagement's manager name", async () => {
    // MGR leads E1/E2. X3's segment on E3 is now returned too, flagged
    // out_of_scope, with E3's manager (X2 — "Xavi Two") disclosed so the
    // viewer knows who to call. Nothing is hidden for managers anymore.
    const res = await handleAction(ctx("manager", MGR), TL_BODY(X3));
    expect(res.status).toBe(200);
    const payload = res.payload as TimelinePayload;
    expect(payload.rows.map((r) => r.assignment_id)).toEqual(["a8", "a7"]);
    expect(payload.hiddenEngagementCount).toBe(0);
    const outRow = payload.rows.find((r) => r.assignment_id === "a8")!;
    expect(outRow).toMatchObject({
      engagement_id: E3,
      out_of_scope: true,
      engagement_name: "Consulting",
      manager_name: "Xavi Two",
    });
    const inRow = payload.rows.find((r) => r.assignment_id === "a7")!;
    expect(inRow).toMatchObject({ out_of_scope: false, manager_name: null });
  });

  it("out-of-scope rows withhold the CLIENT (minimal disclosure)", async () => {
    // Give E3 a client — the manager still must not receive it on the
    // out-of-scope row, while the in-scope E1 row keeps its client name.
    const fixtures = baseFixtures();
    fixtures.engagements = fixtures.engagements.map((e) =>
      e.engagement_id === E3 ? { ...e, client_id: C1 } : e
    );
    const res = await handleAction(ctx("manager", MGR, fixtures), TL_BODY(X3));
    const payload = res.payload as TimelinePayload;
    const outRow = payload.rows.find((r) => r.assignment_id === "a8")!;
    expect(outRow.out_of_scope).toBe(true);
    expect(outRow.client_name).toBeNull();
    const inRow = payload.rows.find((r) => r.assignment_id === "a7")!;
    expect(inRow.client_name).toBe("Cliente Uno S.A.");
  });

  it("senior sees only shared engagements (own non-deleted assignment)", async () => {
    // SEN is assigned to E3 (a3); the a4 arm on E4 is soft-deleted.
    const res = await handleAction(ctx("senior", SEN), TL_BODY(X3));
    expect(res.status).toBe(200);
    const payload = res.payload as TimelinePayload;
    expect(payload.rows.map((r) => r.assignment_id)).toEqual(["a8"]);
    expect(payload.hiddenEngagementCount).toBe(1); // E1 hidden
    expect(JSON.stringify(payload)).not.toContain(E1);
  });

  it("SELF-view skips the scope filter: a manager sees their own non-led engagement IN scope", async () => {
    // MGR's own segment a5 sits on E3, which MGR does NOT lead — on the
    // OWN timeline it is a normal row, never a purple out-of-scope one.
    const res = await handleAction(ctx("manager", MGR), TL_BODY(MGR));
    expect(res.status).toBe(200);
    const payload = res.payload as TimelinePayload;
    expect(payload.rows.map((r) => r.assignment_id)).toEqual(["a5"]);
    expect(payload.rows[0].out_of_scope).toBe(false);
    expect(payload.hiddenEngagementCount).toBe(0);
  });

  it("soft-deleted segments never appear (target's own a4)", async () => {
    const res = await handleAction(ctx("admin", null), TL_BODY(SEN));
    const payload = res.payload as TimelinePayload;
    expect(payload.rows.map((r) => r.assignment_id)).toEqual(["a3"]);
  });

  it("window overlap filters segments (a6 ended before the window)", async () => {
    const res = await handleAction(ctx("admin", null), {
      ...TL_BODY(X1),
      startDate: "2026-05-01",
    });
    const payload = res.payload as TimelinePayload;
    expect(payload.rows.map((r) => r.assignment_id)).toEqual(["a1"]);
  });

  it("no segments in the window → empty success with the staff header", async () => {
    const res = await handleAction(ctx("admin", null), TL_BODY(PART));
    expect(res.status).toBe(200);
    expect(res.payload).toMatchObject({
      staff: { staff_id: PART },
      rows: [],
      hiddenEngagementCount: 0,
      truncated: false,
    });
  });
});

// ── Utilization bands ──────────────────────────────────────────

describe("computeUtilizationBands (pure)", () => {
  const W = { from: "2026-01-01", to: "2026-12-31" };
  const seg = (
    start: string,
    end: string,
    alloc: number,
    hours: number
  ) => ({ start_date: start, end_date: end, allocation_percent: alloc, hours_per_week: hours });

  it("isoAddDays crosses month/year boundaries without rollover surprises", () => {
    expect(isoAddDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(isoAddDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isoAddDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoAddDays("2028-03-01", -1)).toBe("2028-02-29"); // leap
  });

  it("no segments → one explicit full-window zero band (full coverage contract)", () => {
    expect(computeUtilizationBands([], W.from, W.to)).toEqual([
      { start_date: W.from, end_date: W.to, total_allocation_percent: 0, total_hours_per_week: 0 },
    ]);
  });

  it("one mid-window segment → zero, value, zero — contiguous and inclusive", () => {
    const bands = computeUtilizationBands([seg("2026-03-01", "2026-06-30", 50, 20)], W.from, W.to);
    expect(bands).toEqual([
      { start_date: "2026-01-01", end_date: "2026-02-28", total_allocation_percent: 0, total_hours_per_week: 0 },
      { start_date: "2026-03-01", end_date: "2026-06-30", total_allocation_percent: 50, total_hours_per_week: 20 },
      { start_date: "2026-07-01", end_date: "2026-12-31", total_allocation_percent: 0, total_hours_per_week: 0 },
    ]);
  });

  it("overlapping segments SUM; totals change exactly at segment boundaries", () => {
    const bands = computeUtilizationBands(
      [seg("2026-02-01", "2026-08-31", 100, 40), seg("2026-05-01", "2026-06-30", 50, 20)],
      W.from,
      W.to
    );
    expect(bands).toEqual([
      { start_date: "2026-01-01", end_date: "2026-01-31", total_allocation_percent: 0, total_hours_per_week: 0 },
      { start_date: "2026-02-01", end_date: "2026-04-30", total_allocation_percent: 100, total_hours_per_week: 40 },
      { start_date: "2026-05-01", end_date: "2026-06-30", total_allocation_percent: 150, total_hours_per_week: 60 },
      { start_date: "2026-07-01", end_date: "2026-08-31", total_allocation_percent: 100, total_hours_per_week: 40 },
      { start_date: "2026-09-01", end_date: "2026-12-31", total_allocation_percent: 0, total_hours_per_week: 0 },
    ]);
  });

  it("back-to-back equal-total segments MERGE into one band", () => {
    const bands = computeUtilizationBands(
      [seg("2026-02-01", "2026-03-31", 100, 40), seg("2026-04-01", "2026-05-31", 100, 40)],
      W.from,
      W.to
    );
    expect(bands.filter((b) => b.total_allocation_percent === 100)).toEqual([
      { start_date: "2026-02-01", end_date: "2026-05-31", total_allocation_percent: 100, total_hours_per_week: 40 },
    ]);
  });

  it("segments overhanging the window are CLIPPED to it", () => {
    const bands = computeUtilizationBands([seg("2025-06-01", "2027-06-30", 100, 40)], W.from, W.to);
    expect(bands).toEqual([
      { start_date: "2026-01-01", end_date: "2026-12-31", total_allocation_percent: 100, total_hours_per_week: 40 },
    ]);
  });
});

describe("scheduler-staff-timeline utilization payload", () => {
  it("the series is computed over ALL segments — TRUE for a senior even while an engagement stays hidden", async () => {
    // SEN sees only E3 (a8), E1 stays hidden — but the booking series
    // includes BOTH a7 (E1: 02-01→11-30) and a8 (E3: 01-15→12-15).
    const res = await handleAction(ctx("senior", SEN), TL_BODY(X3));
    const payload = res.payload as TimelinePayload & {
      utilization: Array<Record<string, unknown>>;
    };
    expect(payload.rows.map((r) => r.assignment_id)).toEqual(["a8"]);
    expect(payload.hiddenEngagementCount).toBe(1);
    expect(payload.utilization).toEqual([
      { start_date: "2026-01-01", end_date: "2026-01-14", total_allocation_percent: 0, total_hours_per_week: 0 },
      { start_date: "2026-01-15", end_date: "2026-01-31", total_allocation_percent: 100, total_hours_per_week: 40 },
      { start_date: "2026-02-01", end_date: "2026-11-30", total_allocation_percent: 200, total_hours_per_week: 80 },
      { start_date: "2026-12-01", end_date: "2026-12-15", total_allocation_percent: 100, total_hours_per_week: 40 },
      { start_date: "2026-12-16", end_date: "2026-12-31", total_allocation_percent: 0, total_hours_per_week: 0 },
    ]);
    // Aggregates only — the hidden E1 identity still never appears.
    expect(JSON.stringify(payload)).not.toContain(E1);
  });

  it("no segments in the window → one explicit zero band; schema-not-ready → EMPTY series (unknown, not zero)", async () => {
    const zero = await handleAction(ctx("admin", null), TL_BODY(PART));
    expect((zero.payload as { utilization: unknown }).utilization).toEqual([
      { start_date: "2026-01-01", end_date: "2026-12-31", total_allocation_percent: 0, total_hours_per_week: 0 },
    ]);
    const c = ctx("admin", null);
    c.failTable("engagement_assignments", { code: "42P01", message: "missing" });
    const notReady = await handleAction(c, TL_BODY(X3));
    expect((notReady.payload as { utilization: unknown }).utilization).toEqual([]);
  });

  it("the staff header now carries weekly_capacity_hours (null-safe)", async () => {
    const res = await handleAction(ctx("admin", null), TL_BODY(X3));
    const staff = (res.payload as { staff: Record<string, unknown> }).staff;
    expect("weekly_capacity_hours" in staff).toBe(true);
  });
});

// Explicit per-stage schema semantics: the tables the action reads each
// have a defined schema-not-ready outcome, and none may fabricate
// authorization data.
describe("scheduler-staff-timeline error semantics", () => {
  it("stage 1 — staff table schema-not-ready → empty success with staff:null", async () => {
    const c = ctx("admin", null);
    c.failTable("staff", { code: "42P01", message: "missing" });
    const res = await handleAction(c, TL_BODY(X3));
    expect(res.status).toBe(200);
    expect(res.payload).toEqual({
      staff: null,
      rows: [],
      hiddenEngagementCount: 0,
      truncated: false,
      utilization: [],
    });
  });

  it("stage 2 — target assignments schema-not-ready → empty success with the staff header", async () => {
    const c = ctx("admin", null);
    c.failTable("engagement_assignments", { code: "42P01", message: "missing" });
    const res = await handleAction(c, TL_BODY(X3));
    expect(res.status).toBe(200);
    expect(res.payload).toMatchObject({
      staff: { staff_id: X3 },
      rows: [],
      hiddenEngagementCount: 0,
      truncated: false,
    });
  });

  it.each(["42P01", "42703", "PGRST200"])(
    "stage 3 — engagement lookup %s → empty success, NEVER a fake hidden count",
    async (code) => {
      const c = ctx("admin", null);
      c.failTable("engagements", { code, message: "schema not ready" });
      const res = await handleAction(c, TL_BODY(X3));
      expect(res.status).toBe(200);
      expect(res.payload).toMatchObject({
        staff: { staff_id: X3 },
        rows: [],
        hiddenEngagementCount: 0,
        truncated: false,
      });
    }
  );

  it("stage 5 — clients schema-not-ready degrades to client_name:null; rows and hidden count are UNAFFECTED", async () => {
    // Name enrichment only (scheduler-l1's exact semantics): a missing
    // clients relation must not fake emptiness, hide engagements, or
    // error the whole timeline.
    const c = ctx("admin", null);
    c.failTable("clients", { code: "42P01", message: "missing" });
    const res = await handleAction(c, TL_BODY(X3));
    expect(res.status).toBe(200);
    const payload = res.payload as TimelinePayload;
    expect(payload.rows.map((r) => r.assignment_id)).toEqual(["a8", "a7"]);
    expect(payload.rows.every((r) => r.client_name === null)).toBe(true);
    expect(payload.hiddenEngagementCount).toBe(0);
  });

  it("other engagement-lookup failures yield the 500 envelope", async () => {
    const c = ctx("admin", null);
    c.failTable("engagements", { code: "XX000", message: "boom" });
    const res = await handleAction(c, TL_BODY(X3));
    expect(res.status).toBe(500);
    expect(res.payload).toMatchObject({ error: { code: "query_failed" } });
  });

  it("stage 4 — SENIOR visibility lookup schema-not-ready → empty success, never a fake hidden count", async () => {
    // The target-segments query (1st engagement_assignments hit) must
    // succeed so the viewer-visibility query (2nd hit) reaches its arm.
    const c = ctx("senior", SEN);
    c.failTableAfter("engagement_assignments", { code: "42P01", message: "missing" }, 1);
    const res = await handleAction(c, TL_BODY(X3));
    expect(res.status).toBe(200);
    expect(res.payload).toMatchObject({
      staff: { staff_id: X3 },
      rows: [],
      hiddenEngagementCount: 0,
      truncated: false,
    });
  });

  it("other failures on the SENIOR visibility lookup yield the 500 envelope", async () => {
    const c = ctx("senior", SEN);
    c.failTableAfter("engagement_assignments", { code: "XX000", message: "boom" }, 1);
    const res = await handleAction(c, TL_BODY(X3));
    expect(res.status).toBe(500);
    expect(res.payload).toMatchObject({ error: { code: "query_failed" } });
  });

  it("other DB failures yield the 500 envelope", async () => {
    const c = ctx("admin", null);
    c.failTable("engagement_assignments", { code: "XX000", message: "boom" });
    const res = await handleAction(c, TL_BODY(X3));
    expect(res.status).toBe(500);
    expect(res.payload).toMatchObject({ error: { code: "query_failed" } });
  });
});

describe("scheduler-staff-timeline truncation at the 500 cap (499/500/501)", () => {
  // The L1 truncation tests do not prove this action's cap — its input
  // (segments) and grouping path are different.
  function segmentFixtures(count: number): Fixtures {
    const fixtures = baseFixtures();
    fixtures.engagements = Array.from({ length: count }, (_, i) => ({
      engagement_id: uuid(i + 2000),
      engagement_code: `T-${String(i).padStart(3, "0")}`,
      engagement_name: `Timeline ${i}`,
      start_date: "2026-03-01",
      end_date: "2026-09-30",
      status: "active",
      partner_id: null,
      manager_id: null,
      client_id: null,
      work_order_required: true,
      engagement_state_override: EngagementState.Aprobado,
    }));
    fixtures.engagement_assignments = fixtures.engagements.map((e, i) => ({
      assignment_id: `seg-${String(i).padStart(4, "0")}`,
      engagement_id: e.engagement_id,
      staff_id: X1,
      start_date: "2026-03-01",
      end_date: "2026-09-30",
      hours_per_week: 40,
      allocation_percent: 100,
      status: "PROPOSED",
      deleted_at: null,
    }));
    return fixtures;
  }

  it.each([
    [499, false, 499],
    [500, false, 500],
    [501, true, 500],
  ])("%i segments → truncated=%s with %i rows", async (count, truncated, expectRows) => {
    const res = await handleAction(ctx("admin", null, segmentFixtures(count)), TL_BODY(X1));
    expect(res.status).toBe(200);
    const payload = res.payload as TimelinePayload;
    expect(payload.rows).toHaveLength(expectRows);
    expect(payload.truncated).toBe(truncated);
    // The hidden count reflects VISIBILITY, never the cap.
    expect(payload.hiddenEngagementCount).toBe(0);
  });
});

// PostgREST silently caps responses at its server max-rows (default 1000)
// with NO error signal. Both potentially large reads must be cap-immune
// via keyset pagination, and the senior visibility read must be narrowed
// to the decision actually being made.
describe("scheduler-staff-timeline PostgREST row-cap immunity", () => {
  const CAP = { serverRowCap: 1000 };

  // 1,001 target segments, one per engagement. The GLOBALLY FIRST
  // engagement under the action's comparator (earliest start_date) owns
  // the segment with the LARGEST assignment_id — under keyset order it
  // arrives on the LAST page, so a cap-truncated single read would both
  // drop it and mis-sort the capped slice.
  function bulkSegmentFixtures(count: number): Fixtures {
    const fixtures = baseFixtures();
    fixtures.engagements = Array.from({ length: count }, (_, i) => ({
      engagement_id: uuid(i + 5000),
      engagement_code: `C-${String(i).padStart(4, "0")}`,
      engagement_name: `Capped ${i}`,
      // The LAST-cursored segment's engagement starts earliest.
      start_date: i === count - 1 ? "2026-01-02" : "2026-03-01",
      end_date: "2026-09-30",
      status: "active",
      partner_id: null,
      manager_id: null,
      client_id: null,
      work_order_required: true,
      engagement_state_override: EngagementState.Aprobado,
    }));
    fixtures.engagement_assignments = fixtures.engagements.map((e, i) => ({
      assignment_id: `cap-${String(i).padStart(4, "0")}`,
      engagement_id: e.engagement_id,
      staff_id: X1,
      start_date: "2026-03-05",
      end_date: "2026-08-31",
      hours_per_week: 40,
      allocation_percent: 100,
      status: "PROPOSED",
      deleted_at: null,
    }));
    return fixtures;
  }

  it("probe A — 1,001 target segments under a 1,000-row cap: complete fetch, deterministic cap membership", async () => {
    const res = await handleAction(
      ctx("admin", null, bulkSegmentFixtures(1001), CAP),
      TL_BODY(X1)
    );
    expect(res.status).toBe(200);
    const payload = res.payload as TimelinePayload;
    expect(payload.rows).toHaveLength(500);
    expect(payload.truncated).toBe(true);
    expect(payload.hiddenEngagementCount).toBe(0);
    // The globally-first segment (largest cursor, earliest engagement)
    // MUST be present and first — a capped read would have dropped it.
    expect(payload.rows[0].assignment_id).toBe("cap-1000");
  });

  it("exact page multiple (2,000 rows) terminates and stays complete", async () => {
    const res = await handleAction(
      ctx("admin", null, bulkSegmentFixtures(2000), CAP),
      TL_BODY(X1)
    );
    expect(res.status).toBe(200);
    const payload = res.payload as TimelinePayload;
    expect(payload.rows).toHaveLength(500);
    expect(payload.truncated).toBe(true);
    expect(payload.rows[0].assignment_id).toBe("cap-1999");
  });

  it("probe B — senior visibility survives 1,000 unrelated viewer rows before the shared one", async () => {
    // Target X3: a7 on E1, a8 on E3. Viewer SEN shares E3 — but only via
    // a row whose cursor sorts AFTER 1,000 unrelated rows. The old
    // unbounded firmwide read returned only the first 1,000 under the
    // cap, omitted the proof, and fabricated hiddenEngagementCount=2.
    const fixtures = baseFixtures();
    // Remove SEN's original E3 assignment (a3); re-add it as the LAST id.
    fixtures.engagement_assignments = fixtures.engagement_assignments.filter(
      (a) => a.assignment_id !== "a3"
    );
    for (let i = 0; i < 1000; i++) {
      fixtures.engagement_assignments.push({
        assignment_id: `noise-${String(i).padStart(4, "0")}`,
        engagement_id: E5, // unrelated engagement
        staff_id: SEN,
        start_date: "2024-01-01",
        end_date: "2024-12-31",
        deleted_at: null,
      });
    }
    fixtures.engagement_assignments.push({
      assignment_id: "zz-shared",
      engagement_id: E3,
      staff_id: SEN,
      start_date: "2026-01-15",
      end_date: "2026-12-15",
      deleted_at: null,
    });
    const res = await handleAction(ctx("senior", SEN, fixtures, CAP), TL_BODY(X3));
    expect(res.status).toBe(200);
    const payload = res.payload as TimelinePayload;
    // The shared engagement is VISIBLE — never a fabricated hidden result.
    expect(payload.rows.map((r) => r.assignment_id)).toEqual(["a8"]);
    expect(payload.hiddenEngagementCount).toBe(1); // E1 only
    expect(JSON.stringify(payload)).not.toContain(E1);
  });

  it("senior visibility pages through >1,000 rows on the SAME engagement", async () => {
    const fixtures = baseFixtures();
    fixtures.engagement_assignments = fixtures.engagement_assignments.filter(
      (a) => a.assignment_id !== "a3"
    );
    for (let i = 0; i < 1500; i++) {
      fixtures.engagement_assignments.push({
        assignment_id: `many-${String(i).padStart(4, "0")}`,
        engagement_id: E3,
        staff_id: SEN,
        start_date: "2020-01-01",
        end_date: "2020-01-02",
        deleted_at: null,
      });
    }
    const res = await handleAction(ctx("senior", SEN, fixtures, CAP), TL_BODY(X3));
    expect(res.status).toBe(200);
    const payload = res.payload as TimelinePayload;
    expect(payload.rows.map((r) => r.assignment_id)).toEqual(["a8"]);
    expect(payload.hiddenEngagementCount).toBe(1);
  });
});

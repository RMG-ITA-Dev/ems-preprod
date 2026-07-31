// Full-handler tests for the scheduler-gaps edge function (Phase 6 plan
// §10): the COMPLETE actions run against the PostgREST fake, so the role
// gate (a data-confidentiality boundary — the deployed function queries
// with the service role, RLS bypassed, I-P6-2), keyset pagination
// (D-P6-13), source-integrity validation (D-P6-18), and all four
// aggregations are exercised end-to-end. Every mandatory fixture named in
// the plan's §10 handler cell is here, tagged with its decision ID.
//
// Fase 3 (plan v2 §1, §3): `readWindowEngagements`/`benchVsPipeline` ya no
// filtran por la columna legacy `status='active'` — derivan el ESTADO
// EFECTIVO vía `engagement_state_override` (el shared `engagement()`
// fixture helper lo fija directamente, sin depender de una fila real de
// `engagement_wo_state` — ese emparejamiento por Work Order ya está
// probado aparte en engagementState.parity.test.ts). Las categorías ahora
// cargan `serviceId`/`serviceName`/`displayOrder` (join con `services`).

import { describe, expect, it } from "vitest";
import { EngagementState } from "@/lib/engagementStatus";
import {
  BENCH_ALLOCATION_THRESHOLD,
  computeCompetencyShortage,
  dayOrdinal,
  gapsVisibility,
  handleAction,
  isStrictIsoDate,
  LEVEL_ORDER,
  mergeIntervals,
  PAGE_SIZE,
  pagedSelect,
  peakConcurrentSeats,
  resolveIdentity,
  TABLE_PK,
  VALID_ACTIONS,
  type DbQuery,
  type GapsContext,
} from "../../../supabase/functions/scheduler-gaps/handler.ts";
import handlerSource from "../../../supabase/functions/scheduler-gaps/handler.ts?raw";
import { createFakeDb, type FakeDbOptions, type Fixtures } from "./postgrestMock";

const TODAY = "2026-06-15";
const W = { startDate: "2026-06-01", endDate: "2026-06-30" }; // 30 days

// Deterministic ids: zero-padded so keyset string-ordering matches the
// numeric intuition in fixtures.
const id = (prefix: string, n: number) => `${prefix}-${String(n).padStart(6, "0")}`;
const E1 = id("eng", 1);
const E2 = id("eng", 2);
const CAT_SR = id("cat", 1); // "Senior"
const CAT_MG = id("cat", 2); // "Manager"
const SERVICE_A = id("svc", 1); // "Audit" — the only service in these fixtures
const S1 = id("stf", 1);
const S2 = id("stf", 2);
const SK1 = id("skl", 1);

function ctx(
  role: string,
  fixtures: Fixtures,
  options?: FakeDbOptions
): GapsContext & {
  queryLog: { table: string; filters: string[] }[];
  failTable: (t: string, e: { code?: string; message?: string }) => void;
} {
  const db = createFakeDb(fixtures, options);
  return {
    db: db as unknown as GapsContext["db"],
    staffId: null,
    role,
    todayUtc: TODAY,
    queryLog: db.queryLog,
    failTable: db.failTable,
  };
}

// Fase 3: cada estado legacy se fija a un estado efectivo determinista vía
// override, para que las pruebas existentes conserven su intención
// original ("active" ⇒ bucket "active", D-P6-15 exige "completed"/
// "cancelled" ⇒ excluido) sin depender de fixtures de Work Order.
const STATUS_OVERRIDE: Record<string, number> = {
  active: EngagementState.Aprobado,
  completed: EngagementState.Finalizado,
  cancelled: EngagementState.Cancelado,
};

const engagement = (engagementId: string, start: string, end: string, status = "active") => ({
  engagement_id: engagementId,
  start_date: start,
  end_date: end,
  status,
  work_order_required: true,
  engagement_state_override: STATUS_OVERRIDE[status] ?? null,
});

const assignment = (
  n: number,
  staffId: string,
  engagementId: string,
  categoryId: string | null,
  start: string,
  end: string,
  extra: Record<string, unknown> = {}
) => ({
  assignment_id: id("asg", n),
  staff_id: staffId,
  engagement_id: engagementId,
  category_id: categoryId,
  start_date: start,
  end_date: end,
  deleted_at: null,
  hours_per_week: 40,
  allocation_percent: 100,
  ...extra,
});

const staffRow = (staffId: string, extra: Record<string, unknown> = {}) => ({
  staff_id: staffId,
  first_name: "Staff",
  last_name: staffId,
  category_id: CAT_SR,
  is_active: true,
  is_schedulable: null,
  deleted_at: null,
  ...extra,
});

function baseFixtures(): Fixtures {
  return {
    engagements: [engagement(E1, "2026-06-01", "2026-06-30")],
    // Fase 3: vacía a propósito — el estado efectivo se fija por
    // `engagement_state_override` en el helper `engagement()` de arriba;
    // resolveEffectiveStates nunca necesita caer a la derivación por WO.
    engagement_wo_state: [],
    work_orders: [{ wo_id: id("wo", 1), engagement_id: E1 }],
    wo_staffing_requirements: [
      { id: id("req", 1), wo_id: id("wo", 1), category_id: CAT_SR, staff_count: 1 },
    ],
    wo_staffing_requirement_skills: [],
    wo_budget_lines: [],
    engagement_assignments: [
      assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-30"),
    ],
    staff: [staffRow(S1)],
    staff_skills: [],
    skills: [],
    services: [{ service_id: SERVICE_A, name: "Audit" }],
    categories: [
      { category_id: CAT_SR, category_name: "Senior", service_id: SERVICE_A, display_order: 1 },
      { category_id: CAT_MG, category_name: "Manager", service_id: SERVICE_A, display_order: 2 },
    ],
  };
}

type RowsPayload<T> = { rows: T[] };
const rows = <T = Record<string, unknown>>(payload: unknown): T[] =>
  (payload as RowsPayload<T>).rows;

const headcountBody = { action: "category-headcount-gap", ...W };
const hoursBody = { action: "category-hours-gap", ...W };
const shortageBody = { action: "competency-shortage", ...W };
const benchBody = { action: "bench-vs-pipeline" };

// ── Role matrix (I-P6-2): all 11 app_role values, per action ───────────

describe("role gate (I-P6-2): the firmwide-only slice of the D5 matrix", () => {
  const ALL_ROLES = [
    "admin",
    "partner",
    "director",
    "manager",
    "senior",
    "semisenior",
    "staff",
    "viewer",
    "sqr",
    "specialist_it",
    "specialist_tax",
  ];
  const ALLOWED = new Set(["admin", "partner", "director"]);

  it("gapsVisibility grants exactly admin/partner/director", () => {
    for (const role of ALL_ROLES) {
      expect(gapsVisibility(role)).toBe(ALLOWED.has(role) ? "all" : "denied");
    }
    expect(gapsVisibility("")).toBe("denied");
  });

  for (const body of [headcountBody, hoursBody, shortageBody, benchBody]) {
    it(`${body.action}: exactly admin/partner/director pass; every other role gets the 403 envelope before any query`, async () => {
      for (const role of ALL_ROLES) {
        const c = ctx(role, baseFixtures());
        const res = await handleAction(c, body);
        if (ALLOWED.has(role)) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(403);
          expect(res.payload).toMatchObject({ error: { code: "forbidden" } });
          // The gate runs first — no query may have executed (I-P6-2).
          expect(c.queryLog).toHaveLength(0);
        }
      }
    });
  }
});

// ── Validation (§2.3) ──────────────────────────────────────────────────

describe("input validation → typed 400s", () => {
  it("malformed body / unknown action", async () => {
    for (const body of [null, "x", 42, { action: "unknown-action" }, {}]) {
      const res = await handleAction(ctx("admin", baseFixtures()), body);
      expect(res.status).toBe(400);
      expect(res.payload).toMatchObject({ error: { code: "bad_request" } });
    }
  });

  it.each([
    ["non-ISO date", { startDate: "2026-1-1", endDate: "2026-06-30" }],
    ["impossible calendar date", { startDate: "2026-02-31", endDate: "2026-06-30" }],
    ["reversed range", { startDate: "2026-06-30", endDate: "2026-06-01" }],
    ["range > 730 days", { startDate: "2024-01-01", endDate: "2026-06-30" }],
  ])("%s → 400 bad_request on every windowed action", async (_name, window) => {
    for (const action of VALID_ACTIONS.filter((a) => a !== "bench-vs-pipeline")) {
      const res = await handleAction(ctx("admin", baseFixtures()), { action, ...window });
      expect(res.status).toBe(400);
      expect(res.payload).toMatchObject({ error: { code: "bad_request" } });
    }
  });

  it("bench validate-then-ignore (Greptile P2): malformed supplied window → 400; a valid window → byte-identical to the windowless call", async () => {
    const bad = await handleAction(ctx("admin", baseFixtures()), {
      action: "bench-vs-pipeline",
      startDate: "2026-13-99",
      endDate: "2026-12-31",
    });
    expect(bad.status).toBe(400);
    expect(bad.payload).toMatchObject({ error: { code: "bad_request" } });

    const windowless = await handleAction(ctx("admin", baseFixtures()), benchBody);
    const windowed = await handleAction(ctx("admin", baseFixtures()), {
      ...benchBody,
      ...W,
    });
    expect(windowed.status).toBe(200);
    expect(JSON.stringify(windowed.payload)).toBe(JSON.stringify(windowless.payload));
  });

  it("isStrictIsoDate rejects rollover and non-canonical forms", () => {
    expect(isStrictIsoDate("2026-02-31")).toBe(false);
    expect(isStrictIsoDate("2026-6-01")).toBe(false);
    expect(isStrictIsoDate("2026-06-15T00:00:00")).toBe(false);
    expect(isStrictIsoDate("2026-06-15")).toBe(true);
  });
});

// ── Read-only (I-P6-1) ─────────────────────────────────────────────────

describe("read-only (I-P6-1)", () => {
  it("the handler source contains no write or RPC call", () => {
    expect(handlerSource).not.toMatch(/\.(insert|update|upsert|delete|rpc)\s*\(/);
  });

  it("all four actions complete against a fake exposing only SELECT chains", async () => {
    // The fake has no write methods at all — any write attempt would
    // throw a TypeError and fail the action. Green 200s across all four
    // actions therefore prove zero write calls.
    for (const body of [headcountBody, hoursBody, shortageBody, benchBody]) {
      const res = await handleAction(ctx("admin", baseFixtures()), body);
      expect(res.status).toBe(200);
    }
  });
});

// ── Pure helpers ───────────────────────────────────────────────────────

describe("pure helpers", () => {
  it("peakConcurrentSeats: sequential seats do not stack; concurrent do", () => {
    const day = (s: string) => dayOrdinal(s);
    expect(
      peakConcurrentSeats([
        { startOrd: day("2026-06-01"), endOrd: day("2026-06-10"), seats: 5 },
        { startOrd: day("2026-06-11"), endOrd: day("2026-06-20"), seats: 5 },
      ])
    ).toBe(5);
    expect(
      peakConcurrentSeats([
        { startOrd: day("2026-06-01"), endOrd: day("2026-06-20"), seats: 5 },
        { startOrd: day("2026-06-10"), endOrd: day("2026-06-30"), seats: 5 },
      ])
    ).toBe(10);
    expect(peakConcurrentSeats([])).toBe(0);
  });

  it("mergeIntervals merges overlap and adjacency, keeps gaps separate", () => {
    const merged = mergeIntervals([
      { startOrd: 10, endOrd: 12 },
      { startOrd: 13, endOrd: 15 }, // adjacent
      { startOrd: 11, endOrd: 14 }, // overlapping
      { startOrd: 20, endOrd: 21 }, // gapped
    ]);
    expect(merged).toEqual([
      { startOrd: 10, endOrd: 15 },
      { startOrd: 20, endOrd: 21 },
    ]);
  });

  it("LEVEL_ORDER is the staffingMatch ordinal (D-P6-9)", () => {
    expect(LEVEL_ORDER).toEqual({ Beginner: 1, Intermediate: 2, Advanced: 3 });
  });

  it("resolveIdentity propagates DB errors instead of defaulting (PR #214)", async () => {
    const db = createFakeDb({ staff: [], user_roles: [] });
    db.failTable("user_roles", { code: "08006", message: "connection failure" });
    const { identity, error } = await resolveIdentity(
      db as unknown as GapsContext["db"],
      "user-1"
    );
    expect(identity).toBeNull();
    expect(error).toMatchObject({ code: "08006" });
  });
});

// ── category-headcount-gap (§2.4, D-P6-16) ─────────────────────────────

describe("category-headcount-gap: person-days on BOTH sides (D-P6-16)", () => {
  it("sequential reuse (mandatory fixture a): one Senior fully covering two non-overlapping engagements → gapFteDays 0", async () => {
    const f = baseFixtures();
    f.engagements = [
      engagement(E1, "2026-06-01", "2026-06-10"),
      engagement(E2, "2026-06-11", "2026-06-20"),
    ];
    f.work_orders = [
      { wo_id: id("wo", 1), engagement_id: E1 },
      { wo_id: id("wo", 2), engagement_id: E2 },
    ];
    f.wo_staffing_requirements = [
      { id: id("req", 1), wo_id: id("wo", 1), category_id: CAT_SR, staff_count: 1 },
      { id: id("req", 2), wo_id: id("wo", 2), category_id: CAT_SR, staff_count: 1 },
    ];
    f.engagement_assignments = [
      assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-10"),
      assignment(2, S1, E2, CAT_SR, "2026-06-11", "2026-06-20"),
    ];
    const res = await handleAction(ctx("admin", f), headcountBody);
    expect(res.status).toBe(200);
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(senior.demandFteDays).toBe(20);
    expect(senior.suppliedFteDays).toBe(20);
    expect(senior.gapFteDays).toBe(0);
  });

  it("thin coverage (mandatory fixture b): 60-day single-seat engagement with a 1-day assignment → gapFteDays 59 (≈ 0.98 open seats)", async () => {
    const window = { startDate: "2026-06-01", endDate: "2026-07-30" }; // 60 days
    const f = baseFixtures();
    f.engagements = [engagement(E1, "2026-06-01", "2026-07-30")];
    f.engagement_assignments = [
      assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-01"),
    ];
    const res = await handleAction(ctx("admin", f), {
      action: "category-headcount-gap",
      ...window,
    });
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(senior.demandFteDays).toBe(60);
    expect(senior.suppliedFteDays).toBe(1);
    expect(senior.gapFteDays).toBe(59);
    expect(senior.avgOpenSeats as number).toBeCloseTo(59 / 60, 5);
  });

  it("legacy OVERLAPPING same-(staff, engagement, category) segments merge before day-counting; non-overlapping segments sum", async () => {
    const f = baseFixtures();
    f.engagement_assignments = [
      // Overlapping pair: 06-01..06-10 and 06-05..06-15 → merged 15 days.
      assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-10"),
      assignment(2, S1, E1, CAT_SR, "2026-06-05", "2026-06-15"),
      // Non-overlapping later segment: 06-20..06-24 → +5 days.
      assignment(3, S1, E1, CAT_SR, "2026-06-20", "2026-06-24"),
    ];
    const res = await handleAction(ctx("admin", f), headcountBody);
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(senior.suppliedFteDays).toBe(20); // 15 merged + 5, never 26
  });

  it("category-aware merge (rev. 6 P2-01): a Senior segment adjacent to a Manager segment contributes days to BOTH categories, never merged category-less", async () => {
    const f = baseFixtures();
    f.wo_staffing_requirements = [
      { id: id("req", 1), wo_id: id("wo", 1), category_id: CAT_SR, staff_count: 1 },
      { id: id("req", 2), wo_id: id("wo", 1), category_id: CAT_MG, staff_count: 1 },
    ];
    f.engagement_assignments = [
      assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-10"),
      assignment(2, S1, E1, CAT_MG, "2026-06-11", "2026-06-20"),
    ];
    const res = await handleAction(ctx("admin", f), headcountBody);
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    const manager = rows(res.payload).find((r) => r.categoryId === CAT_MG)!;
    expect(senior.suppliedFteDays).toBe(10);
    expect(manager.suppliedFteDays).toBe(10);
  });

  it("assignment fully outside its engagement's dates contributes 0 (∩engagement clip)", async () => {
    const f = baseFixtures();
    f.engagements = [engagement(E1, "2026-06-01", "2026-06-10")];
    f.engagement_assignments = [
      assignment(1, S1, E1, CAT_SR, "2026-06-11", "2026-06-30"),
    ];
    const res = await handleAction(ctx("admin", f), headcountBody);
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(senior.suppliedFteDays).toBe(0);
  });
});

// ── D-P6-10 uniformity: departed staff, asserted against BOTH actions ──

describe("active-staff uniformity (D-P6-10)", () => {
  it.each([
    ["is_active = false", { is_active: false }],
    ["deleted_at set", { deleted_at: "2026-05-01T00:00:00Z" }],
  ])(
    "a staff with %s but a live in-window assignment contributes to NEITHER headcount nor hours supply",
    async (_name, staffOverride) => {
      const make = () => {
        const f = baseFixtures();
        f.staff = [staffRow(S1, staffOverride)];
        f.wo_budget_lines = [
          { wo_line_id: id("wbl", 1), wo_id: id("wo", 1), category_id: CAT_SR, budgeted_hours: 100 },
        ];
        return f;
      };
      const head = await handleAction(ctx("admin", make()), headcountBody);
      const senior = rows(head.payload).find((r) => r.categoryId === CAT_SR)!;
      expect(senior.suppliedFteDays).toBe(0);
      expect(senior.demandFteDays).toBe(30); // demand is untouched

      const hours = await handleAction(ctx("admin", make()), hoursBody);
      const hoursSenior = rows(hours.payload).find((r) => r.categoryId === CAT_SR)!;
      expect(hoursSenior.projectedSupplyHours).toBe(0);
      expect(hoursSenior.demandHours as number).toBeGreaterThan(0);
    }
  );
});

// ── category-hours-gap (§2.5, D-P6-11) ─────────────────────────────────

describe("category-hours-gap: window pro-rata on BOTH sides (D-P6-11)", () => {
  it("supply pro-rata boundary: 7 overlap days at 40 h/w → exactly 40 hours; fully-outside assignments contribute 0", async () => {
    const f = baseFixtures();
    f.engagements = [engagement(E1, "2026-05-01", "2026-07-31")];
    f.wo_budget_lines = [];
    f.engagement_assignments = [
      // 7 days inside the June window (06-01..06-07).
      assignment(1, S1, E1, CAT_SR, "2026-05-15", "2026-06-07"),
      // Entirely outside the window — the read's window predicate drops it.
      assignment(2, S1, E1, CAT_SR, "2026-07-05", "2026-07-20"),
    ];
    const res = await handleAction(ctx("admin", f), hoursBody);
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(senior.projectedSupplyHours).toBe(40); // 40 × 7 ÷ 7
  });

  it("time-basis boundary (GPT-5.6 P1-01): a fully staffed engagement reports ≈ 0 gapHours through ANY partial window", async () => {
    const f = baseFixtures();
    // 365-day engagement budgeted at exactly its assignment run-rate.
    f.engagements = [engagement(E1, "2026-01-01", "2026-12-31")];
    f.wo_budget_lines = [
      {
        wo_line_id: id("wbl", 1),
        wo_id: id("wo", 1),
        category_id: CAT_SR,
        budgeted_hours: (40 * 365) / 7,
      },
    ];
    f.engagement_assignments = [
      assignment(1, S1, E1, CAT_SR, "2026-01-01", "2026-12-31"),
    ];
    const res = await handleAction(ctx("admin", f), hoursBody); // June window
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(Math.abs(senior.gapHours as number)).toBeLessThan(1e-6);
  });

  it("spill masking (rev. 5, D-P6-11 clip): an assignment spilling past its one-month engagement earns zero supply beyond it, so a second unstaffed same-category engagement's gap stays positive", async () => {
    const window = { startDate: "2026-06-01", endDate: "2026-08-31" };
    const f = baseFixtures();
    f.engagements = [
      engagement(E1, "2026-06-01", "2026-06-30"), // staffed, one month
      engagement(E2, "2026-07-01", "2026-07-31"), // unstaffed, budgeted
    ];
    f.work_orders = [
      { wo_id: id("wo", 1), engagement_id: E1 },
      { wo_id: id("wo", 2), engagement_id: E2 },
    ];
    f.wo_staffing_requirements = [];
    f.wo_budget_lines = [
      { wo_line_id: id("wbl", 1), wo_id: id("wo", 1), category_id: CAT_SR, budgeted_hours: (40 * 30) / 7 },
      { wo_line_id: id("wbl", 2), wo_id: id("wo", 2), category_id: CAT_SR, budgeted_hours: 200 },
    ];
    f.engagement_assignments = [
      // Spills two months past E1's end.
      assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-08-31"),
    ];
    const res = await handleAction(ctx("admin", f), {
      action: "category-hours-gap",
      ...window,
    });
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    // Supply is clipped to E1 (30 days): 40×30÷7 — the spill days earn 0.
    expect(senior.projectedSupplyHours as number).toBeCloseTo((40 * 30) / 7, 6);
    // E2's genuine 200-hour shortfall stays visible, not netted away.
    expect(senior.gapHours as number).toBeCloseTo(200, 6);
  });
});

// ── competency-shortage (§2.6, D-P6-17) ────────────────────────────────

const reqSkill = (n: number, reqId: string, skillId: string, minLevel: string) => ({
  id: id("rsk", n),
  requirement_id: reqId,
  skill_id: skillId,
  min_proficiency_level: minLevel,
});
const staffSkill = (n: number, staffId: string, skillId: string, level: string) => ({
  staff_skill_id: id("ssk", n),
  staff_id: staffId,
  skill_id: skillId,
  proficiency_level: level,
});

describe("competency-shortage: cumulative ≥-thresholds, peak concurrent demand (D-P6-17)", () => {
  it("demand uses staff_count (D-P6-7): a single ×5 Advanced requirement with no qualifying staff → deficit 5", async () => {
    const f = baseFixtures();
    f.wo_staffing_requirements = [
      { id: id("req", 1), wo_id: id("wo", 1), category_id: CAT_SR, staff_count: 5 },
    ];
    f.wo_staffing_requirement_skills = [reqSkill(1, id("req", 1), SK1, "Advanced")];
    f.skills = [{ skill_id: SK1, name: "IFRS" }];
    const res = await handleAction(ctx("admin", f), shortageBody);
    const row = rows(res.payload)[0];
    expect(row).toMatchObject({
      categoryId: CAT_SR,
      skillId: SK1,
      minLevel: "Advanced",
      demandCount: 5,
      supplyCount: 0,
      deficit: 5,
    });
  });

  it("≥-minimum semantics (D-P6-9): Advanced satisfies an Intermediate minimum; Beginner does not", async () => {
    const f = baseFixtures();
    f.wo_staffing_requirement_skills = [reqSkill(1, id("req", 1), SK1, "Intermediate")];
    f.skills = [{ skill_id: SK1, name: "IFRS" }];
    f.staff = [staffRow(S1), staffRow(S2)];
    f.staff_skills = [
      staffSkill(1, S1, SK1, "Advanced"),
      staffSkill(2, S2, SK1, "Beginner"),
    ];
    const res = await handleAction(ctx("admin", f), shortageBody);
    const row = rows(res.payload)[0];
    expect(row.supplyCount).toBe(1); // Advanced only
  });

  it("sequential ×5 engagements → peak demand 5 (no double-count); concurrent → 10", async () => {
    const make = (sequential: boolean) => {
      const f = baseFixtures();
      f.engagements = sequential
        ? [engagement(E1, "2026-06-01", "2026-06-10"), engagement(E2, "2026-06-11", "2026-06-20")]
        : [engagement(E1, "2026-06-01", "2026-06-20"), engagement(E2, "2026-06-10", "2026-06-30")];
      f.work_orders = [
        { wo_id: id("wo", 1), engagement_id: E1 },
        { wo_id: id("wo", 2), engagement_id: E2 },
      ];
      f.wo_staffing_requirements = [
        { id: id("req", 1), wo_id: id("wo", 1), category_id: CAT_SR, staff_count: 5 },
        { id: id("req", 2), wo_id: id("wo", 2), category_id: CAT_SR, staff_count: 5 },
      ];
      f.wo_staffing_requirement_skills = [
        reqSkill(1, id("req", 1), SK1, "Advanced"),
        reqSkill(2, id("req", 2), SK1, "Advanced"),
      ];
      f.skills = [{ skill_id: SK1, name: "IFRS" }];
      f.engagement_assignments = [];
      return f;
    };
    const seq = await handleAction(ctx("admin", make(true)), shortageBody);
    expect(rows(seq.payload)[0].demandCount).toBe(5);
    const conc = await handleAction(ctx("admin", make(false)), shortageBody);
    expect(rows(conc.payload)[0].demandCount).toBe(10);
  });

  it("cumulative thresholds (rev. 6 P1-02): one Advanced person vs a concurrent Beginner-min seat + Advanced-min seat → threshold-Beginner deficit 1, threshold-Advanced deficit 0", async () => {
    const f = baseFixtures();
    f.engagements = [
      engagement(E1, "2026-06-01", "2026-06-30"),
      engagement(E2, "2026-06-01", "2026-06-30"), // concurrent
    ];
    f.work_orders = [
      { wo_id: id("wo", 1), engagement_id: E1 },
      { wo_id: id("wo", 2), engagement_id: E2 },
    ];
    f.wo_staffing_requirements = [
      { id: id("req", 1), wo_id: id("wo", 1), category_id: CAT_SR, staff_count: 1 },
      { id: id("req", 2), wo_id: id("wo", 2), category_id: CAT_SR, staff_count: 1 },
    ];
    f.wo_staffing_requirement_skills = [
      reqSkill(1, id("req", 1), SK1, "Beginner"),
      reqSkill(2, id("req", 2), SK1, "Advanced"),
    ];
    f.skills = [{ skill_id: SK1, name: "IFRS" }];
    f.staff = [staffRow(S1)];
    f.staff_skills = [staffSkill(1, S1, SK1, "Advanced")];
    f.engagement_assignments = [];
    const res = await handleAction(ctx("admin", f), shortageBody);
    const byLevel = Object.fromEntries(
      rows(res.payload).map((r) => [r.minLevel as string, r])
    );
    // Threshold Beginner: two concurrent seats need ≥ Beginner; one human.
    expect(byLevel.Beginner).toMatchObject({ demandCount: 2, supplyCount: 1, deficit: 1 });
    // Threshold Advanced: one seat needs ≥ Advanced; one qualifies.
    expect(byLevel.Advanced).toMatchObject({ demandCount: 1, supplyCount: 1, deficit: 0 });
  });

  it("truncation + deficitRowCount (§2.6): 501 positive-deficit combos → 500 rows, truncated: true, deficitRowCount: 501", async () => {
    const f = baseFixtures();
    f.wo_staffing_requirement_skills = Array.from({ length: 501 }, (_, i) =>
      reqSkill(i + 1, id("req", 1), id("skl", i + 1), "Beginner")
    );
    f.skills = Array.from({ length: 501 }, (_, i) => ({
      skill_id: id("skl", i + 1),
      name: `Skill ${String(i + 1).padStart(3, "0")}`,
    }));
    f.staff = [];
    f.engagement_assignments = [];
    const res = await handleAction(ctx("admin", f), shortageBody);
    const payload = res.payload as {
      rows: unknown[];
      truncated: boolean;
      deficitRowCount: number;
    };
    expect(payload.rows).toHaveLength(500);
    expect(payload.truncated).toBe(true);
    expect(payload.deficitRowCount).toBe(501);
  });

  it("total-order stability (rev. 7): >500 equal-deficit rows across thresholds — shuffled and reversed inputs produce byte-identical order, identical cap membership, strictest threshold surviving the boundary tie", () => {
    // 200 skills × 3 SEQUENTIAL single-seat requirements (one per level)
    // → 600 rows, every deficit 1 (peak of sequential seats = 1, no staff).
    const engagements = [
      { engagementId: E1, startOrd: dayOrdinal("2026-06-01"), endOrd: dayOrdinal("2026-06-10") },
      { engagementId: E2, startOrd: dayOrdinal("2026-06-11"), endOrd: dayOrdinal("2026-06-20") },
      { engagementId: id("eng", 3), startOrd: dayOrdinal("2026-06-21"), endOrd: dayOrdinal("2026-06-30") },
    ];
    const engagementIds = engagements.map((e) => e.engagementId);
    const demandRows: Array<{
      categoryId: string;
      skillId: string;
      minLevel: string;
      staffCount: number;
      engagementId: string;
    }> = [];
    const skillNames = new Map<string, string>();
    for (let i = 1; i <= 200; i++) {
      const skillId = id("skl", i);
      skillNames.set(skillId, `Skill ${String(i).padStart(3, "0")}`);
      (["Beginner", "Intermediate", "Advanced"] as const).forEach((minLevel, li) => {
        demandRows.push({
          categoryId: CAT_SR,
          skillId,
          minLevel,
          staffCount: 1,
          engagementId: engagementIds[li],
        });
      });
    }
    const input = {
      engagements,
      staff: [],
      staffSkills: [],
      skillNames,
      categories: [
        {
          categoryId: CAT_SR,
          categoryName: "Senior",
          serviceId: SERVICE_A,
          serviceName: "Audit",
          displayOrder: 1,
        },
      ],
      windowStartOrd: dayOrdinal("2026-06-01"),
      windowEndOrd: dayOrdinal("2026-06-30"),
    };
    const base = computeCompetencyShortage({ ...input, demandRows });
    const reversed = computeCompetencyShortage({
      ...input,
      demandRows: [...demandRows].reverse(),
    });
    // Deterministic shuffle: interleave from both ends.
    const shuffled: typeof demandRows = [];
    for (let i = 0, j = demandRows.length - 1; i <= j; i++, j--) {
      shuffled.push(demandRows[j]);
      if (i !== j) shuffled.push(demandRows[i]);
    }
    const mixed = computeCompetencyShortage({ ...input, demandRows: shuffled });

    expect(JSON.stringify(reversed)).toBe(JSON.stringify(base));
    expect(JSON.stringify(mixed)).toBe(JSON.stringify(base));
    expect(base.rows).toHaveLength(500);
    expect(base.truncated).toBe(true);
    expect(base.deficitRowCount).toBe(600);
    // Boundary tie: within a (category, skill) the strictest threshold
    // sorts first (LEVEL_ORDER DESC), so the cut at 500 keeps skill 167's
    // Advanced + Intermediate rows and drops its Beginner row.
    const skill167 = base.rows.filter((r) => r.skillName === "Skill 167");
    expect(skill167.map((r) => r.minLevel)).toEqual(["Advanced", "Intermediate"]);
  });
});

// ── Schema readiness (D-P6-12) ─────────────────────────────────────────

describe("action-level schema readiness (D-P6-12)", () => {
  it("demand reads succeed but the assignments read fails 42703 → 503 schema_not_ready with zero rows/KPIs", async () => {
    const c = ctx("admin", baseFixtures());
    c.failTable("engagement_assignments", {
      code: "42703",
      message: "column engagement_assignments.category_id does not exist",
    });
    const res = await handleAction(c, headcountBody);
    expect(res.status).toBe(503);
    expect(res.payload).toMatchObject({ error: { code: "schema_not_ready" } });
    expect((res.payload as { rows?: unknown[] }).rows).toBeUndefined();
  });

  it("a missing table (42P01) on any required read → 503 on every action that reads it", async () => {
    for (const [table, body] of [
      ["wo_staffing_requirements", headcountBody],
      ["wo_budget_lines", hoursBody],
      ["staff_skills", shortageBody],
      ["engagement_assignments", benchBody],
    ] as const) {
      const c = ctx("admin", baseFixtures());
      c.failTable(table, { code: "42P01", message: "relation does not exist" });
      const res = await handleAction(c, body);
      expect(res.status).toBe(503);
      expect(res.payload).toMatchObject({ error: { code: "schema_not_ready" } });
    }
  });

  it("a non-schema query error → 500 query_failed (never empty rows)", async () => {
    const c = ctx("admin", baseFixtures());
    c.failTable("engagements", { code: "XX000", message: "backend crash" });
    const res = await handleAction(c, headcountBody);
    expect(res.status).toBe(500);
    expect(res.payload).toMatchObject({ error: { code: "query_failed" } });
  });
});

// ── Source integrity (D-P6-18) ─────────────────────────────────────────

describe("source integrity fail-closed (D-P6-18)", () => {
  it.each([
    ["reversed engagement dates", engagement(E1, "2026-06-20", "2026-06-05")],
    // A timestamp-shaped string passes the fake's window string-compare
    // but must fail strict-ISO validation.
    ["malformed engagement date string", engagement(E1, "2026-06-05T00:00:00", "2026-06-20")],
  ])("%s → 500 data_integrity naming the row", async (_name, badEngagement) => {
    const f = baseFixtures();
    f.engagements = [badEngagement];
    const res = await handleAction(ctx("admin", f), headcountBody);
    expect(res.status).toBe(500);
    expect(res.payload).toMatchObject({ error: { code: "data_integrity" } });
    expect(
      (res.payload as { error: { message: string } }).error.message
    ).toContain(E1);
  });

  it("same-day engagement dates are VALID (lifetime 1)", async () => {
    const f = baseFixtures();
    f.engagements = [engagement(E1, "2026-06-15", "2026-06-15")];
    f.wo_budget_lines = [
      { wo_line_id: id("wbl", 1), wo_id: id("wo", 1), category_id: CAT_SR, budgeted_hours: 8 },
    ];
    f.engagement_assignments = [];
    const res = await handleAction(ctx("admin", f), hoursBody);
    expect(res.status).toBe(200);
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(senior.demandHours).toBe(8); // full budget: 1-day overlap ÷ 1-day lifetime
  });

  it.each([
    ["reversed assignment dates", { start_date: "2026-06-20", end_date: "2026-06-05" }],
    ["malformed assignment date string", { start_date: "2026-06-05T00:00:00", end_date: "2026-06-20" }],
  ])("%s → 500 data_integrity naming the assignment", async (_name, dates) => {
    const f = baseFixtures();
    f.engagement_assignments = [
      { ...assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-30"), ...dates },
    ];
    const res = await handleAction(ctx("admin", f), headcountBody);
    expect(res.status).toBe(500);
    expect(res.payload).toMatchObject({ error: { code: "data_integrity" } });
    expect(
      (res.payload as { error: { message: string } }).error.message
    ).toContain(id("asg", 1));
  });

  it("same-day assignment dates are VALID", async () => {
    const f = baseFixtures();
    f.engagement_assignments = [
      assignment(1, S1, E1, CAT_SR, "2026-06-15", "2026-06-15"),
    ];
    const res = await handleAction(ctx("admin", f), headcountBody);
    expect(res.status).toBe(200);
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(senior.suppliedFteDays).toBe(1);
  });

  it.each([
    [
      "negative budgeted_hours",
      hoursBody,
      (f: Fixtures) => {
        f.wo_budget_lines = [
          { wo_line_id: id("wbl", 1), wo_id: id("wo", 1), category_id: CAT_SR, budgeted_hours: -5 },
        ];
      },
      id("wbl", 1),
    ],
    [
      "hours_per_week of 90",
      hoursBody,
      (f: Fixtures) => {
        f.engagement_assignments = [
          assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-30", { hours_per_week: 90 }),
        ];
      },
      id("asg", 1),
    ],
    [
      "allocation_percent of 0",
      benchBody,
      (f: Fixtures) => {
        f.engagement_assignments = [
          assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 0 }),
        ];
      },
      id("asg", 1),
    ],
    [
      "allocation_percent of 120",
      benchBody,
      (f: Fixtures) => {
        f.engagement_assignments = [
          assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 120 }),
        ];
      },
      id("asg", 1),
    ],
    [
      "non-integer staff_count",
      headcountBody,
      (f: Fixtures) => {
        f.wo_staffing_requirements = [
          { id: id("req", 1), wo_id: id("wo", 1), category_id: CAT_SR, staff_count: 1.5 },
        ];
      },
      id("req", 1),
    ],
  ])("%s → 500 data_integrity naming the row", async (_name, body, arrange, rowId) => {
    const f = baseFixtures();
    arrange(f);
    const res = await handleAction(ctx("admin", f), body);
    expect(res.status).toBe(500);
    expect(res.payload).toMatchObject({ error: { code: "data_integrity" } });
    expect(
      (res.payload as { error: { message: string } }).error.message
    ).toContain(rowId);
  });

  it("an unknown proficiency level fails closed instead of silently dropping the row", async () => {
    const f = baseFixtures();
    f.wo_staffing_requirement_skills = [reqSkill(1, id("req", 1), SK1, "Expert")];
    f.skills = [{ skill_id: SK1, name: "IFRS" }];
    const res = await handleAction(ctx("admin", f), shortageBody);
    expect(res.status).toBe(500);
    expect(res.payload).toMatchObject({ error: { code: "data_integrity" } });
  });

  it("an unknown proficiency level on an ACTIVE staff member's skill row fails closed on both consuming actions", async () => {
    const make = () => {
      const f = baseFixtures();
      f.wo_staffing_requirement_skills = [reqSkill(1, id("req", 1), SK1, "Beginner")];
      f.skills = [{ skill_id: SK1, name: "IFRS" }];
      f.staff_skills = [staffSkill(1, S1, SK1, "Expert")];
      f.engagement_assignments = [];
      return f;
    };
    for (const body of [shortageBody, benchBody]) {
      const res = await handleAction(ctx("admin", make()), body);
      expect(res.status).toBe(500);
      expect(res.payload).toMatchObject({ error: { code: "data_integrity" } });
    }
  });

  it("a legacy proficiency value on a DEPARTED staff member's skill row does NOT break current reporting (Greptile P1, PR #227)", async () => {
    const make = () => {
      const f = baseFixtures();
      f.wo_staffing_requirement_skills = [reqSkill(1, id("req", 1), SK1, "Beginner")];
      f.skills = [{ skill_id: SK1, name: "IFRS" }];
      f.staff = [
        staffRow(S1),
        staffRow(S2, { is_active: false }), // departed — D-P6-10 discards their supply
      ];
      f.staff_skills = [
        staffSkill(1, S1, SK1, "Beginner"),
        staffSkill(2, S2, SK1, "Expert"), // legacy junk, never consumed
      ];
      f.engagement_assignments = [];
      return f;
    };
    const shortage = await handleAction(ctx("admin", make()), shortageBody);
    expect(shortage.status).toBe(200);
    expect(rows(shortage.payload)[0].supplyCount).toBe(1); // S1 only
    const bench = await handleAction(ctx("admin", make()), benchBody);
    expect(bench.status).toBe(200);
    expect(rows(bench.payload).map((r) => r.staffId)).toEqual([S1]);
  });
});

// ── Keyset pagination (D-P6-13) ────────────────────────────────────────

describe("keyset pagination (D-P6-13)", () => {
  it("cap-500 / PAGE_SIZE-1,000 completeness: a sub-PAGE_SIZE server cap still yields complete totals", async () => {
    expect(PAGE_SIZE).toBe(1000);
    const f = baseFixtures();
    f.staff = Array.from({ length: 750 }, (_, i) => staffRow(id("stf", i + 1)));
    f.engagement_assignments = [];
    const res = await handleAction(ctx("admin", f, { serverRowCap: 500 }), benchBody);
    expect(res.status).toBe(200);
    expect(rows(res.payload)).toHaveLength(750);
  });

  it(">1,000-row assignment fixture against the row-capped fake → complete headcount totals", async () => {
    const f = baseFixtures();
    // 1,001 one-day, single-day assignments for the same staff/category,
    // all inside the window and non-overlapping is impossible in 30 days —
    // use 1,001 distinct staff instead, one day each.
    f.staff = Array.from({ length: 1001 }, (_, i) => staffRow(id("stf", i + 1)));
    f.engagement_assignments = Array.from({ length: 1001 }, (_, i) =>
      assignment(i + 1, id("stf", i + 1), E1, CAT_SR, "2026-06-01", "2026-06-01")
    );
    const res = await handleAction(ctx("admin", f, { serverRowCap: 1000 }), headcountBody);
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(senior.suppliedFteDays).toBe(1001);
  });

  it(">1,000-row staff_skills fixture → complete competency supply", async () => {
    const f = baseFixtures();
    f.wo_staffing_requirements = [
      { id: id("req", 1), wo_id: id("wo", 1), category_id: CAT_SR, staff_count: 1 },
    ];
    f.wo_staffing_requirement_skills = [reqSkill(1, id("req", 1), SK1, "Beginner")];
    f.skills = [{ skill_id: SK1, name: "IFRS" }];
    f.staff = Array.from({ length: 1001 }, (_, i) => staffRow(id("stf", i + 1)));
    f.staff_skills = Array.from({ length: 1001 }, (_, i) =>
      staffSkill(i + 1, id("stf", i + 1), SK1, "Beginner")
    );
    f.engagement_assignments = [];
    const res = await handleAction(ctx("admin", f, { serverRowCap: 1000 }), shortageBody);
    expect(rows(res.payload)[0].supplyCount).toBe(1001);
  });

  it(">1,000 wo_staffing_requirements rows → complete demand", async () => {
    const f = baseFixtures();
    f.categories = Array.from({ length: 1050 }, (_, i) => ({
      category_id: id("cat", i + 1),
      category_name: `Cat ${String(i + 1).padStart(4, "0")}`,
      service_id: SERVICE_A,
      display_order: i + 1,
    }));
    f.wo_staffing_requirements = Array.from({ length: 1050 }, (_, i) => ({
      id: id("req", i + 1),
      wo_id: id("wo", 1),
      category_id: id("cat", i + 1),
      staff_count: 1,
    }));
    f.engagement_assignments = [];
    const res = await handleAction(ctx("admin", f, { serverRowCap: 1000 }), headcountBody);
    expect(rows(res.payload)).toHaveLength(1050); // every category demanded
  });

  it("exact-multiple boundary: rows = n × cap terminates via the empty-page rule with complete totals", async () => {
    const f = baseFixtures();
    f.staff = Array.from({ length: 10 }, (_, i) => staffRow(id("stf", i + 1)));
    f.engagement_assignments = [];
    const c = ctx("admin", f, { serverRowCap: 5 });
    const res = await handleAction(c, benchBody);
    expect(rows(res.payload)).toHaveLength(10);
    // 10 rows at cap 5 = pages of 5, 5, then the terminating empty page.
    const staffReads = c.queryLog.filter((q) => q.table === "staff");
    expect(staffReads).toHaveLength(3);
  });

  it("≥2 chunkedIn chunks where one chunk's rows exceed the fake's cap → complete totals", async () => {
    const f = baseFixtures();
    // 150 engagements → 2 chunks (100 + 50). Chunk 1 has 90 assignment
    // rows (> cap 40) — pagedSelect inside the chunk must page through.
    f.engagements = Array.from({ length: 150 }, (_, i) =>
      engagement(id("eng", i + 1), "2026-06-01", "2026-06-30")
    );
    f.work_orders = [];
    f.wo_staffing_requirements = [];
    f.staff = Array.from({ length: 90 }, (_, i) => staffRow(id("stf", i + 1)));
    f.engagement_assignments = Array.from({ length: 90 }, (_, i) =>
      assignment(i + 1, id("stf", i + 1), id("eng", (i % 100) + 1), CAT_SR, "2026-06-01", "2026-06-01")
    );
    const res = await handleAction(ctx("admin", f, { serverRowCap: 40 }), headcountBody);
    const senior = rows(res.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(senior.suppliedFteDays).toBe(90);
  });

  it("TABLE_PK maps every read table to its committed PK", () => {
    expect(TABLE_PK).toEqual({
      engagements: "engagement_id",
      // Fase 3: vista RLS-safe 1:1 para resolver el estado efectivo.
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
      services: "service_id",
    });
  });
});

// ── Schema-aware fake: per-table two-page crossings (rev. 6 P1-01) ─────

// The committed column sets the actions may select from (plus the keyset
// cursor columns). The schema-aware fake rejects anything else with a
// 42703-shaped error — the way the real server fails a broken projection.
// Fase 3: `engagements` ya no proyecta `status` (reemplazado por
// `work_order_required`/`engagement_state_override`); se agregan las
// tablas nuevas `engagement_wo_state` y `services`, y `categories` gana
// `service_id`.
const SCHEMA: Record<string, string[]> = {
  engagements: [
    "engagement_id",
    "start_date",
    "end_date",
    "status",
    "work_order_required",
    "engagement_state_override",
  ],
  engagement_wo_state: ["engagement_id", "approval_status", "approved_at", "risk_status"],
  work_orders: ["wo_id", "engagement_id"],
  wo_staffing_requirements: ["id", "wo_id", "category_id", "staff_count"],
  wo_staffing_requirement_skills: ["id", "requirement_id", "skill_id", "min_proficiency_level"],
  wo_budget_lines: ["wo_line_id", "wo_id", "category_id", "budgeted_hours"],
  engagement_assignments: [
    "assignment_id",
    "staff_id",
    "engagement_id",
    "category_id",
    "start_date",
    "end_date",
    "hours_per_week",
    "allocation_percent",
    "deleted_at",
  ],
  staff: [
    "staff_id",
    "first_name",
    "last_name",
    "category_id",
    "is_active",
    "is_schedulable",
    "deleted_at",
  ],
  staff_skills: ["staff_skill_id", "staff_id", "skill_id", "proficiency_level"],
  skills: ["skill_id", "name"],
  categories: ["category_id", "category_name", "display_order", "service_id"],
  services: ["service_id", "name"],
};

describe("schema-aware fake + two-page crossing per table (rev. 6 P1-01)", () => {
  it("every action pages every table across ≥2 pages under the schema-aware fake with complete results", async () => {
    // serverRowCap 2 with ≥3 rows per table forces a two-page crossing on
    // EVERY paged read; schema-aware mode simultaneously proves every
    // projection uses only committed columns and carries its cursor PK.
    const E3 = id("eng", 3);
    const f: Fixtures = {
      engagements: [
        engagement(E1, "2026-06-01", "2026-06-30"),
        engagement(E2, "2026-06-01", "2026-06-30"),
        engagement(E3, "2026-06-01", "2026-06-30"),
      ],
      work_orders: [
        { wo_id: id("wo", 1), engagement_id: E1 },
        { wo_id: id("wo", 2), engagement_id: E2 },
        { wo_id: id("wo", 3), engagement_id: E3 },
      ],
      wo_staffing_requirements: [
        { id: id("req", 1), wo_id: id("wo", 1), category_id: CAT_SR, staff_count: 1 },
        { id: id("req", 2), wo_id: id("wo", 2), category_id: CAT_SR, staff_count: 1 },
        { id: id("req", 3), wo_id: id("wo", 3), category_id: CAT_SR, staff_count: 1 },
      ],
      wo_staffing_requirement_skills: [
        reqSkill(1, id("req", 1), SK1, "Beginner"),
        reqSkill(2, id("req", 2), id("skl", 2), "Intermediate"),
        reqSkill(3, id("req", 3), id("skl", 3), "Advanced"),
      ],
      wo_budget_lines: [
        { wo_line_id: id("wbl", 1), wo_id: id("wo", 1), category_id: CAT_SR, budgeted_hours: 30 },
        { wo_line_id: id("wbl", 2), wo_id: id("wo", 2), category_id: CAT_SR, budgeted_hours: 30 },
        { wo_line_id: id("wbl", 3), wo_id: id("wo", 3), category_id: CAT_SR, budgeted_hours: 30 },
      ],
      engagement_assignments: [
        assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-30"),
        assignment(2, S2, E2, CAT_SR, "2026-06-01", "2026-06-30"),
        assignment(3, id("stf", 3), E3, CAT_SR, "2026-06-01", "2026-06-30"),
      ],
      staff: [staffRow(S1), staffRow(S2), staffRow(id("stf", 3))],
      staff_skills: [
        staffSkill(1, S1, SK1, "Advanced"),
        staffSkill(2, S2, id("skl", 2), "Advanced"),
        staffSkill(3, id("stf", 3), id("skl", 3), "Advanced"),
      ],
      skills: [
        { skill_id: SK1, name: "IFRS" },
        { skill_id: id("skl", 2), name: "Tax" },
        { skill_id: id("skl", 3), name: "Audit" },
      ],
      services: [{ service_id: SERVICE_A, name: "Audit" }],
      categories: [
        { category_id: CAT_SR, category_name: "Senior", service_id: SERVICE_A, display_order: 1 },
        { category_id: CAT_MG, category_name: "Manager", service_id: SERVICE_A, display_order: 2 },
        { category_id: id("cat", 3), category_name: "Partner", service_id: SERVICE_A, display_order: 3 },
      ],
    };
    const options: FakeDbOptions = { serverRowCap: 2, schemaColumns: SCHEMA };

    const head = await handleAction(ctx("admin", f, options), headcountBody);
    expect(head.status).toBe(200);
    const senior = rows(head.payload).find((r) => r.categoryId === CAT_SR)!;
    expect(senior.demandFteDays).toBe(90);
    expect(senior.suppliedFteDays).toBe(90);

    const hours = await handleAction(ctx("admin", f, options), hoursBody);
    expect(hours.status).toBe(200);
    expect(
      (rows(hours.payload).find((r) => r.categoryId === CAT_SR)!.demandHours as number)
    ).toBeCloseTo(90, 6);

    const shortage = await handleAction(ctx("admin", f, options), shortageBody);
    expect(shortage.status).toBe(200);
    expect(rows(shortage.payload)).toHaveLength(3);
    for (const r of rows(shortage.payload)) {
      expect(r.supplyCount).toBe(1);
      expect(r.deficit).toBe(0);
    }

    const bench = await handleAction(ctx("admin", f, options), benchBody);
    expect(bench.status).toBe(200);
    expect(rows(bench.payload)).toHaveLength(0); // everyone at 100%
  });

  it("a projection selecting `id` from engagement_assignments FAILS under the schema-aware fake (the rev. 5 bug the fake must catch)", async () => {
    const db = createFakeDb(
      { engagement_assignments: [{ assignment_id: "a-1" }] },
      { schemaColumns: SCHEMA }
    );
    const { error } = await pagedSelect(
      () =>
        (db.from("engagement_assignments") as unknown as DbQuery).select("id, staff_id"),
      "id"
    );
    expect(error).toMatchObject({ code: "42703" });
  });

  it("a projection that omits its cursor column fails loudly instead of spinning", async () => {
    const db = createFakeDb({
      engagement_assignments: [{ assignment_id: "a-1", staff_id: "s-1" }],
    });
    const { error } = await pagedSelect(
      () =>
        (db.from("engagement_assignments") as unknown as DbQuery).select("staff_id"),
      "assignment_id"
    );
    expect(error).toMatchObject({ code: "PGRST_CURSOR" });
  });
});

// ── bench-vs-pipeline (§2.7) ───────────────────────────────────────────

describe("bench-vs-pipeline (§2.7)", () => {
  it("threshold boundary (D-P6-5): 49.9 is ON the bench, 50 is OFF", async () => {
    expect(BENCH_ALLOCATION_THRESHOLD).toBe(50);
    const f = baseFixtures();
    f.staff = [staffRow(S1), staffRow(S2)];
    f.engagement_assignments = [
      assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 49.9 }),
      assignment(2, S2, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 50 }),
    ];
    const res = await handleAction(ctx("admin", f), benchBody);
    const staffIds = rows(res.payload).map((r) => r.staffId);
    expect(staffIds).toContain(S1);
    expect(staffIds).not.toContain(S2);
  });

  it("FP accumulation cannot defeat the strict threshold: 14.2 + 17.9 + 17.9 (IEEE sum 49.99999999999999) is exactly 50 and stays OFF the bench", async () => {
    const f = baseFixtures();
    f.staff = [staffRow(S1), staffRow(S2)];
    f.engagement_assignments = [
      assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 14.2 }),
      assignment(2, S1, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 17.9 }),
      assignment(3, S1, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 17.9 }),
      // A genuinely sub-threshold decimal sum must survive the snap.
      assignment(4, S2, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 49.9 }),
    ];
    const res = await handleAction(ctx("admin", f), benchBody);
    const staffIds = rows(res.payload).map((r) => r.staffId);
    expect(staffIds).not.toContain(S1); // 50.0, not 49.999999999999986
    expect(staffIds).toContain(S2);
    expect(rows(res.payload).find((r) => r.staffId === S2)!.currentAllocationPct).toBe(49.9);
  });

  it("is_schedulable === false is excluded; null is included (D-P6-8)", async () => {
    const f = baseFixtures();
    f.staff = [
      staffRow(S1, { is_schedulable: false }),
      staffRow(S2, { is_schedulable: null }),
    ];
    f.engagement_assignments = [];
    const res = await handleAction(ctx("admin", f), benchBody);
    const staffIds = rows(res.payload).map((r) => r.staffId);
    expect(staffIds).toEqual([S2]);
  });

  it("allocation is as of TODAY (D-P6-6): segments not covering today are ignored by the read", async () => {
    const f = baseFixtures();
    f.engagement_assignments = [
      // Ended before today (2026-06-15).
      assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-10", { allocation_percent: 100 }),
    ];
    const res = await handleAction(ctx("admin", f), benchBody);
    const row = rows(res.payload).find((r) => r.staffId === S1)!;
    expect(row.currentAllocationPct).toBe(0);
  });

  it.each(["completed", "cancelled"])(
    "threshold-boundary on a %s engagement (D-P6-15): its allocation is excluded, keeping the person on the bench",
    async (status) => {
      const f = baseFixtures();
      f.engagements = [
        engagement(E1, "2026-06-01", "2026-06-30", "active"),
        engagement(E2, "2026-06-01", "2026-06-30", status),
      ];
      f.engagement_assignments = [
        assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 30 }),
        // Would push S1 to 60% — but the engagement is not active.
        assignment(2, S1, E2, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 30 }),
      ];
      const res = await handleAction(ctx("admin", f), benchBody);
      const row = rows(res.payload).find((r) => r.staffId === S1)!;
      expect(row.currentAllocationPct).toBe(30);
    }
  );

  it("top skills: up to 3, proficiency DESC then name ASC; rows sort allocation ASC, lastName ASC", async () => {
    const f = baseFixtures();
    f.staff = [
      staffRow(S1, { first_name: "Ana", last_name: "Zeta" }),
      staffRow(S2, { first_name: "Luis", last_name: "Alfa" }),
    ];
    f.skills = [
      { skill_id: id("skl", 1), name: "Audit" },
      { skill_id: id("skl", 2), name: "IFRS" },
      { skill_id: id("skl", 3), name: "Tax" },
      { skill_id: id("skl", 4), name: "Valuation" },
    ];
    f.staff_skills = [
      staffSkill(1, S1, id("skl", 3), "Beginner"),
      staffSkill(2, S1, id("skl", 2), "Advanced"),
      staffSkill(3, S1, id("skl", 1), "Advanced"),
      staffSkill(4, S1, id("skl", 4), "Intermediate"),
    ];
    f.engagement_assignments = [
      assignment(1, S1, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 20 }),
      assignment(2, S2, E1, CAT_SR, "2026-06-01", "2026-06-30", { allocation_percent: 20 }),
    ];
    const res = await handleAction(ctx("admin", f), benchBody);
    const benchRows = rows(res.payload);
    // Equal allocation → lastName ASC: Alfa before Zeta.
    expect(benchRows.map((r) => r.staffId)).toEqual([S2, S1]);
    // Advanced (Audit, IFRS — name ASC), then Intermediate (Valuation);
    // the Beginner skill is cut by the 3-skill cap.
    expect(benchRows[1].topSkills).toEqual(["Audit", "IFRS", "Valuation"]);
  });
});

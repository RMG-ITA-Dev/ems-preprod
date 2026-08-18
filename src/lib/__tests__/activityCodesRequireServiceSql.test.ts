import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 0817-177: Static assertions on the "require activity practice" migration.
 * Guards the fail-fast precondition and the NOT NULL constraint against
 * accidental drift, and pins the backfill to the 8 known legacy codes only
 * (a from-scratch replay — e.g. CI's route-parity job — otherwise fails:
 * those 8 predate the service_id column and were only fixed by hand in
 * already-deployed environments).
 */

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260818120000_0817-177_require_activity_practice.sql"
);
const sql = readFileSync(migrationPath, "utf-8");

describe("require activity practice migration (0817-177)", () => {
  it("fails fast when any activity_codes row has service_id IS NULL", () => {
    expect(sql).toMatch(/SELECT COUNT\(\*\) INTO v_orphans\s+FROM public\.activity_codes\s+WHERE service_id IS NULL/);
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toMatch(/IF v_orphans > 0 THEN/);
  });

  it("sets service_id NOT NULL on activity_codes", () => {
    expect(sql).toContain("ALTER TABLE public.activity_codes");
    expect(sql).toContain("ALTER COLUMN service_id SET NOT NULL");
  });

  it("backfills only the 8 known legacy codes to Auditoría (code=1), before the fail-fast check", () => {
    const backfillIndex = sql.search(/UPDATE\s+public\.activity_codes/i);
    const failFastIndex = sql.indexOf("RAISE EXCEPTION");
    expect(backfillIndex).toBeGreaterThan(-1);
    expect(backfillIndex).toBeLessThan(failFastIndex);

    expect(sql).toMatch(/SET service_id = \(SELECT service_id FROM public\.services WHERE code = 1\)/);
    expect(sql).toMatch(/WHERE service_id IS NULL\s+AND activity_code IN \('PLN', 'FLD', 'REV', 'DOC', 'ADM', 'MTG', 'TRV', 'TRN'\)/);
  });

  it("does not backfill any row outside the 8 known legacy codes", () => {
    const updateStatements = sql.match(/UPDATE\s+public\.activity_codes[\s\S]*?;/gi) ?? [];
    expect(updateStatements).toHaveLength(1);
    expect(updateStatements[0]).toContain("activity_code IN ('PLN', 'FLD', 'REV', 'DOC', 'ADM', 'MTG', 'TRV', 'TRN')");
  });
});

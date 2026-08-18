import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 0817-177: Static assertions on the "require activity practice" migration.
 * Guards the fail-fast precondition and the NOT NULL constraint against
 * accidental drift (e.g. someone adding a silent backfill later).
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

  it("does not backfill any row (no UPDATE statement)", () => {
    expect(sql).not.toMatch(/UPDATE\s+public\.activity_codes/i);
  });
});

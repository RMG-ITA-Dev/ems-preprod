import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Static regression brake against accidental revert of the conditional
// reactivation guard introduced for BUG 0511-109 / 0511-110.
describe("prevent_staff_reactivation guard migration (BUG 0511-109/110)", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260520000000_fix_0511_109_110_conditional_reactivation_guard.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("redefines public.prevent_staff_reactivation()", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.prevent_staff_reactivation\(\)/
    );
  });

  it("requires OLD.is_active = false in the guard", () => {
    expect(sql).toMatch(/OLD\.is_active\s*=\s*false/);
  });

  it("requires NEW.is_active = true in the guard", () => {
    expect(sql).toMatch(/NEW\.is_active\s*=\s*true/);
  });

  it("only raises when termination_date OR deleted_at is set (same IF block)", () => {
    // Capture the first IF ... THEN block (the guard).
    const ifMatch = sql.match(/IF[\s\S]*?THEN/);
    expect(ifMatch).not.toBeNull();
    const ifBlock = ifMatch![0];
    expect(ifBlock).toMatch(/OLD\.termination_date\s+IS\s+NOT\s+NULL/);
    expect(ifBlock).toMatch(/OLD\.deleted_at\s+IS\s+NOT\s+NULL/);
  });

  it("preserves the REACTIVATION_BLOCKED exception prefix", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'REACTIVATION_BLOCKED:/);
  });
});

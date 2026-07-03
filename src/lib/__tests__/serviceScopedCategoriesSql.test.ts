import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 0702-152: Static assertions on the service-scoped categories migration.
 * Guards the invariants of the migration against accidental drift.
 */

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260702000000_service_scoped_categories.sql"
);
const sql = readFileSync(migrationPath, "utf-8");

describe("service-scoped categories migration (0702-152)", () => {
  it("adds service_id FK on categories referencing services", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS service_id uuid/);
    expect(sql).toContain("REFERENCES public.services (service_id)");
  });

  it("makes service_id NOT NULL after backfill", () => {
    expect(sql).toContain("ALTER COLUMN service_id SET NOT NULL");
  });

  it("backfills existing categories to Auditoría via services.code = 1", () => {
    expect(sql).toContain("SELECT service_id FROM public.services WHERE code = 1");
  });

  it("normalizes display_order with row_number() partitioned per service", () => {
    expect(sql).toContain("row_number() OVER (");
    expect(sql).toContain("PARTITION BY service_id");
  });

  it("replaces the global name unique with a per-service unique", () => {
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS categories_category_name_key");
    expect(sql).toContain("UNIQUE (service_id, category_name)");
  });

  it("adds a deferrable unique on (service_id, display_order) and a positive check", () => {
    expect(sql).toContain("UNIQUE (service_id, display_order)");
    expect(sql).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(sql).toContain("CHECK (display_order >= 1)");
  });

  it("guards every RPC with is_admin()", () => {
    expect(sql).toContain("public.is_admin()");
  });

  it("defines the four category RPCs", () => {
    expect(sql).toContain("FUNCTION public.create_category_for_service");
    expect(sql).toContain("FUNCTION public.update_category_for_service");
    expect(sql).toContain("FUNCTION public.move_category");
    expect(sql).toContain("FUNCTION public.copy_categories_between_services");
  });

  it("copy RPC blocks non-empty target unless replace, and blocks referenced target", () => {
    expect(sql).toContain("target_not_empty");
    expect(sql).toContain("target_referenced");
    expect(sql).toContain("staff s WHERE s.category_id");
    expect(sql).toContain("wo_budget_lines b WHERE b.category_id");
  });

  it("copy RPC normalizes the target order 1..N via row_number()", () => {
    expect(sql).toMatch(/row_number\(\) OVER \(ORDER BY src\.display_order/);
  });

  it("grants execute on the RPCs to authenticated only", () => {
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.create_category_for_service");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.update_category_for_service");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.move_category");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.copy_categories_between_services");
    expect(sql).toContain("TO authenticated");
  });
});

// ── Review fixes migration (iterations 1-2) ─────────────────────────────────
const fixesPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260703000000_service_scoped_categories_fixes.sql"
);
const fixesSql = readFileSync(fixesPath, "utf-8");

describe("service-scoped categories review fixes (0702-152)", () => {
  it("#4 defines delete_category_for_service guarded by is_admin() and granted to authenticated", () => {
    expect(fixesSql).toContain("FUNCTION public.delete_category_for_service");
    expect(fixesSql).toContain("public.is_admin()");
    expect(fixesSql).toContain("GRANT EXECUTE ON FUNCTION public.delete_category_for_service");
    expect(fixesSql).toContain("TO authenticated");
  });

  it("#4 delete compacts the order by pulling later siblings up by one", () => {
    expect(fixesSql).toMatch(/SET display_order = display_order - 1\s+WHERE service_id = v_service_id\s+AND display_order > v_pos/);
  });

  it("#2 create RPC enforces allows_rates_activities", () => {
    expect(fixesSql).toContain("SELECT is_active, allows_rates_activities");
    expect(fixesSql).toMatch(/IF NOT v_allows THEN/);
  });

  it("#3 copy RPC validates source and target existence + validity", () => {
    expect(fixesSql).toContain("source_not_found");
    expect(fixesSql).toContain("source_invalid");
    expect(fixesSql).toContain("target_not_found");
    expect(fixesSql).toContain("target_invalid");
  });
});

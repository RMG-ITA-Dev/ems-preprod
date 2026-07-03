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

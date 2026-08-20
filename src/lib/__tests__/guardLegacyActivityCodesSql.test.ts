import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 0817-177 (review follow-up): Static assertions on the migration that guards
 * reorder_service_activity/deactivate_service_activity against the 8 legacy
 * activity codes (PLN/FLD/REV/DOC/ADM/MTG/TRV/TRN) backfilled to Auditoría by
 * 20260818120000_0817-177_require_activity_practice.sql. Those codes predate
 * the {abbrev}-{entity_type}{n} ordinal scheme; without this guard,
 * deactivating one raises an opaque integer-cast error, and reordering any
 * other Auditoría activity silently renames them (breaking useAdminActivityId's
 * literal 'ADM' lookup).
 */

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260820120000_0817-177_guard_legacy_activity_codes.sql"
);
const sql = readFileSync(migrationPath, "utf-8");

describe("guard legacy activity codes migration (0817-177)", () => {
  it("redefines both ordinal RPCs", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.deactivate_service_activity(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reorder_service_activity(");
  });

  it("deactivate_service_activity rejects a legacy code before the ordinal cast", () => {
    const fn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.deactivate_service_activity("),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.reorder_service_activity(")
    );
    const guardIndex = fn.indexOf("v_old_code !~");
    const castIndex = fn.indexOf("v_old_ordinal := (regexp_replace");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(castIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(castIndex);
    expect(fn).toContain("RAISE EXCEPTION 'Activity code % predates the ordinal scheme and cannot be deactivated");
  });

  it("reorder_service_activity rejects reordering a legacy code and excludes legacy siblings from renumbering", () => {
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.reorder_service_activity("));
    const guardIndex = fn.indexOf("v_code !~");
    const arrayAggIndex = fn.indexOf("array_agg(activity_id");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(arrayAggIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(arrayAggIndex);
    expect(fn).toContain("RAISE EXCEPTION 'Activity code % predates the ordinal scheme and cannot be reordered'");

    // Both the sibling lock and the array_agg driving the renumber must filter
    // to the ordinal-scheme pattern, so legacy codes are never locked/renamed.
    const patternFilterCount = (fn.match(/activity_code ~ \(/g) ?? []).length;
    expect(patternFilterCount).toBe(2);
  });

  it("grants stay scoped to authenticated, matching the functions being replaced", () => {
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.deactivate_service_activity(uuid) TO authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reorder_service_activity(uuid, integer) TO authenticated;");
  });
});

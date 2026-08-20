import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 0817-177 (review follow-up): Static assertions on the migration that guards
 * all four activity_codes ordinal RPCs against the 8 legacy activity codes
 * (PLN/FLD/REV/DOC/ADM/MTG/TRV/TRN) backfilled to Auditoría by
 * 20260818120000_0817-177_require_activity_practice.sql. Those codes predate
 * the {abbrev}-{entity_type}{n} ordinal scheme:
 * - deactivating one raises an opaque integer-cast error (fixed by rejecting
 *   the legacy code with a clear exception),
 * - reordering any other Auditoría activity silently renames them (fixed by
 *   excluding legacy siblings from the renumbered set), and
 * - creating/reactivating an activity in Auditoría on a from-scratch install
 *   inflates the next ordinal past the legacy rows (fixed by counting only
 *   ordinal-scheme siblings), which would otherwise make reorder's temp-code
 *   phase collide with an already-active real code once a 9th activity exists.
 */

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260820120000_0817-177_guard_legacy_activity_codes.sql"
);
const sql = readFileSync(migrationPath, "utf-8");

describe("guard legacy activity codes migration (0817-177)", () => {
  it("redefines all four ordinal RPCs", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.deactivate_service_activity(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reorder_service_activity(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_service_activity(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reactivate_service_activity(");
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
    const fn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.reorder_service_activity("),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.create_service_activity(")
    );
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

  it("create_service_activity and reactivate_service_activity count only ordinal-scheme siblings", () => {
    const createFn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.create_service_activity("),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.reactivate_service_activity(")
    );
    const reactivateFn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.reactivate_service_activity("));

    for (const fn of [createFn, reactivateFn]) {
      const countIndex = fn.indexOf("SELECT COUNT(*) INTO v_count");
      const patternIndex = fn.indexOf("activity_code ~ (", countIndex);
      expect(countIndex).toBeGreaterThan(-1);
      expect(patternIndex).toBeGreaterThan(-1);
      // The pattern filter must be part of the same COUNT query, i.e. before
      // the next statement terminator.
      expect(patternIndex).toBeLessThan(fn.indexOf(";", countIndex));
    }
  });

  it("grants stay scoped to authenticated, matching the functions being replaced", () => {
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.deactivate_service_activity(uuid) TO authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reorder_service_activity(uuid, integer) TO authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.create_service_activity(uuid, text, text) TO authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reactivate_service_activity(uuid) TO authenticated;");
  });
});

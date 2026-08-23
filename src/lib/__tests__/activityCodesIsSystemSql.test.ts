import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Migración cero: reemplaza activityCodesRequireServiceSql.test.ts y
 * guardLegacyActivityCodesSql.test.ts (0817-177). Ambos pineaban el backfill de los 8
 * códigos legacy (PLN/FLD/REV/DOC/ADM/MTG/TRV/TRN) y los guards por regex que los
 * excluían de las 4 RPCs de ABM — todo eso NO pasó al set consolidado (informe de
 * consolidación §5, plan de migración cero §2.2.1/§2.2.2): el diseño `is_system`
 * reemplaza ambos mecanismos por una columna + CHECK estructural. Rescata las
 * aserciones que siguen describiendo el comportamiento real (derivación MAX-based del
 * siguiente ordinal, nunca COUNT) y las retarget contra el archivo consolidado.
 */

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000002_cero_02_functions_tables_views.sql"),
  "utf-8",
);

describe("activity_codes is_system design (migración cero, informe §5)", () => {
  it("service_id is nullable, guarded by a CHECK requiring is_system OR service_id NOT NULL", () => {
    const tableBlock = sql.slice(
      sql.indexOf("CREATE TABLE public.activity_codes"),
      sql.indexOf(");", sql.indexOf("CREATE TABLE public.activity_codes")),
    );
    expect(tableBlock).toMatch(/service_id uuid,/);
    expect(tableBlock).not.toMatch(/service_id uuid NOT NULL/);
    expect(tableBlock).toMatch(/is_system boolean DEFAULT false NOT NULL/);
    expect(tableBlock).toMatch(
      /CONSTRAINT activity_codes_service_id_or_system CHECK \(\(is_system OR \(service_id IS NOT NULL\)\)\)/,
    );
  });

  it("deactivate/reactivate/reorder_service_activity all exclude is_system rows explicitly", () => {
    for (const [fn, next] of [
      ["deactivate_service_activity", "delete_category_for_service"],
      ["reactivate_service_activity", "recompute_engagement_finalization"],
      ["reorder_service_activity", "reset_login_attempts"],
    ] as const) {
      const start = sql.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const end = sql.indexOf(`CREATE FUNCTION public.${next}(`, start);
      const body = end > -1 ? sql.slice(start, end) : sql.slice(start);
      expect(body).toMatch(/ac\.is_system\s*=\s*false/);
    }
  });

  it("create/reactivate_service_activity derive the next ordinal from MAX, never COUNT", () => {
    for (const [fn, next] of [
      ["create_service_activity", "current_role_key"],
      ["reactivate_service_activity", "recompute_engagement_finalization"],
    ] as const) {
      const start = sql.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const end = sql.indexOf(`CREATE FUNCTION public.${next}(`, start);
      const body = end > -1 ? sql.slice(start, end) : sql.slice(start);
      expect(body).not.toMatch(/SELECT COUNT\(\*\) INTO v_count/);
      expect(body).toMatch(/SELECT COALESCE\(MAX\(/);
      expect(body).toMatch(/v_max_ordinal \+ 1\)::text/);
    }
  });

  it("no RAISE EXCEPTION references the retired 'predates the ordinal scheme' regex guard", () => {
    // 0817-177's per-code regex guard is gone entirely in the is_system design — is_system
    // exclusion (asserted above) does its job structurally instead.
    expect(sql).not.toMatch(/predates the ordinal scheme/);
  });
});

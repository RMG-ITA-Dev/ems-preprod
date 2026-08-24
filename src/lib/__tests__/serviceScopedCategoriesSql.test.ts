import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 0702-152 (retargeted por la migración cero, plan §2.5.d): assertions estructurales sobre
 * `categories.practica_id` y las RPCs de categorías, ahora contra el estado FINAL
 * consolidado — ya fusiona 0702-152 y su archivo de fixes (0703, iteraciones 1/2/4/8), y
 * refleja además una reescritura posterior de move_category() que dejó de usar
 * row_number()/PARTITION BY a favor de un shift de rango explícito (mismo invariante:
 * renumeración acotada al practica_id, nunca cruzando prácticas). Las aserciones sobre el
 * backfill/ALTER de la migración original (ya no existen — sin datos preexistentes que
 * backfillear en un reset desde cero) se retiraron.
 */

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000002_cero_02_functions_tables_views.sql"),
  "utf-8",
);
const constraintsSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000003_cero_03_constraints_indexes.sql"),
  "utf-8",
);
const fksSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000004_cero_04_triggers_fks.sql"),
  "utf-8",
);
const grantsSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000006_cero_06_grants.sql"),
  "utf-8",
);

function fnBody(name: string, nextName: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf(`CREATE FUNCTION public.${nextName}(`, start);
  return end > -1 ? sql.slice(start, end) : sql.slice(start);
}

describe("practice-scoped categories (migración cero, consolidado)", () => {
  it("categories.practica_id is NOT NULL, FK to practicas", () => {
    const tableBlock = sql.slice(
      sql.indexOf("CREATE TABLE public.categories"),
      sql.indexOf(");", sql.indexOf("CREATE TABLE public.categories")),
    );
    expect(tableBlock).toContain("practica_id uuid NOT NULL");
    expect(fksSql).toMatch(/ADD CONSTRAINT categories_practica_id_fkey FOREIGN KEY \(practica_id\) REFERENCES public\.practicas/);
  });

  it("has a per-practice unique on category_name (not a global one)", () => {
    expect(constraintsSql).toContain(
      "ADD CONSTRAINT categories_practica_name_unique UNIQUE (practica_id, category_name);",
    );
    expect(sql).not.toContain("categories_category_name_key");
  });

  it("has a deferrable unique on (practica_id, display_order) and a positive-order check", () => {
    expect(constraintsSql).toContain(
      "ADD CONSTRAINT categories_practica_order_unique UNIQUE (practica_id, display_order) DEFERRABLE INITIALLY DEFERRED;",
    );
    expect(sql).toContain("CONSTRAINT categories_display_order_positive CHECK ((display_order >= 1))");
  });

  it("move_category() renumbers scoped strictly to the category's own practica_id", () => {
    const body = fnBody("move_category", "permission_scope");
    expect(body).toContain("SELECT practica_id, display_order");
    expect(body).toMatch(/WHERE practica_id = v_practica_id/);
    // Both the increment and decrement shift branches must stay scoped.
    const scopedShifts = (body.match(/WHERE practica_id = v_practica_id/g) ?? []).length;
    expect(scopedShifts).toBeGreaterThanOrEqual(2);
  });

  it("guards every category RPC with is_admin()", () => {
    for (const name of [
      "create_category_for_practice",
      "update_category_for_practice",
      "delete_category_for_practice",
      "move_category",
      "copy_categories_between_practices",
    ]) {
      const start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
      expect(start).toBeGreaterThan(-1);
      // is_admin() must appear early in the body (the guard clause) — window generous
      // enough to clear even the longest signature (create_category_for_practice, 10 args).
      expect(sql.slice(start, start + 1200)).toContain("public.is_admin()");
    }
  });

  it("defines the five category RPCs", () => {
    for (const name of [
      "create_category_for_practice",
      "update_category_for_practice",
      "delete_category_for_practice",
      "move_category",
      "copy_categories_between_practices",
    ]) {
      expect(sql).toContain(`FUNCTION public.${name}(`);
    }
  });

  it("create_category_for_practice enforces practicas.allows_rates_activities", () => {
    const body = fnBody("create_category_for_practice", "current_role_key");
    expect(body).toContain("SELECT is_active, allows_rates_activities");
    expect(body).toMatch(/IF NOT v_allows THEN/);
  });

  it("delete_category_for_practice compacts the order by pulling later siblings up by one", () => {
    const body = fnBody("delete_category_for_practice", "enforce_activity_default");
    expect(body).toMatch(
      /SET display_order = display_order - 1\s+WHERE practica_id = v_practica_id\s+AND display_order > v_pos/,
    );
  });

  it("copy_categories_between_practices validates source/target existence, validity, emptiness and every referencing table", () => {
    const body = fnBody("copy_categories_between_practices", "create_category_for_practice");
    expect(body).toContain("source_not_found");
    expect(body).toContain("source_invalid");
    expect(body).toContain("target_not_found");
    expect(body).toContain("target_invalid");
    expect(body).toContain("target_not_empty");
    expect(body).toContain("target_referenced");
    expect(body).toContain("staff s WHERE s.category_id");
    expect(body).toContain("wo_budget_lines b WHERE b.category_id");
    expect(body).toContain("activity_worksheet_cells w WHERE w.category_id");
    expect(body).toContain("activity_codes a WHERE a.default_category_id");
  });

  it("copy_categories_between_practices normalizes the target order 1..N via row_number()", () => {
    const body = fnBody("copy_categories_between_practices", "create_category_for_practice");
    expect(body).toMatch(/row_number\(\) OVER \(ORDER BY src\.display_order/);
  });

  it("grants execute on all five category RPCs to authenticated (is_admin() gates the actual write)", () => {
    // Nota: el grant real incluye anon/service_role además de authenticated (verificado
    // contra el dump) — la exclusividad a "authenticated only" nunca fue una aserción real
    // del test original tampoco (solo comprobaba que "TO authenticated" apareciera en algún
    // lado); la autorización de fondo la hace is_admin() dentro del cuerpo de cada RPC.
    for (const name of [
      "create_category_for_practice",
      "update_category_for_practice",
      "delete_category_for_practice",
      "move_category",
      "copy_categories_between_practices",
    ]) {
      expect(grantsSql).toMatch(new RegExp(`GRANT ALL ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated;`));
    }
  });
});

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

/**
 * 0820-182 — `categories.default_role_key` (rol sugerido por categoría).
 *
 * OJO con el alcance: las aserciones de arriba leen el set consolidado
 * (`cero_02`..`cero_06`) y siguen siendo válidas — es la baseline histórica. Pero la
 * migración de este bug redefine dos de esas RPC en un archivo APARTE, así que nada de
 * lo de arriba vería la firma nueva. De ahí este bloque con su propio readFileSync: sin
 * él, las aserciones estructurales envejecerían en silencio.
 */
const defaultRoleKeySql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260825000000_category_default_role_key.sql"),
  "utf-8",
);

describe("categories.default_role_key (0820-182)", () => {
  it("adds the column idempotently and FKs it to the authorization_roles catalog", () => {
    expect(defaultRoleKeySql).toMatch(
      /ALTER TABLE public\.categories\s+ADD COLUMN IF NOT EXISTS default_role_key text;/,
    );
    // El FK al catálogo es lo que impide guardar un role_key inexistente: sin él, la
    // "sugerencia" podría apuntar a un rol que ya no existe.
    expect(defaultRoleKeySql).toMatch(
      /ADD CONSTRAINT categories_default_role_key_fkey\s+FOREIGN KEY \(default_role_key\)\s+REFERENCES public\.authorization_roles\(role_key\)/,
    );
    // Idempotencia: se puede re-pegar la migración completa sin chocar con 42710.
    expect(defaultRoleKeySql).toContain(
      "DROP CONSTRAINT IF EXISTS categories_default_role_key_fkey",
    );
  });

  it.each(["create_category_for_practice", "update_category_for_practice"])(
    "%s is DROPped before being recreated, never CREATE OR REPLACE (guard anti-PGRST203)",
    (name) => {
      // Agregar un parámetro con CREATE OR REPLACE no reemplaza la función: crea una
      // SOBRECARGA, y con dos firmas visibles PostgREST no puede resolver la llamada
      // (PGRST203) — rompiendo crear/editar CUALQUIER categoría, no solo el campo nuevo.
      const dropIdx = defaultRoleKeySql.indexOf(`DROP FUNCTION IF EXISTS public.${name}(`);
      const createIdx = defaultRoleKeySql.indexOf(`CREATE FUNCTION public.${name}(`);
      expect(dropIdx).toBeGreaterThan(-1);
      expect(createIdx).toBeGreaterThan(-1);
      expect(dropIdx).toBeLessThan(createIdx);
      expect(defaultRoleKeySql).not.toContain(`CREATE OR REPLACE FUNCTION public.${name}(`);
    },
  );

  it.each(["create_category_for_practice", "update_category_for_practice"])(
    "%s takes p_default_role_key and keeps its is_admin() guard",
    (name) => {
      const start = defaultRoleKeySql.indexOf(`CREATE FUNCTION public.${name}(`);
      const end = defaultRoleKeySql.indexOf("\n$$;", start);
      const body = defaultRoleKeySql.slice(start, end);
      expect(body).toContain("p_default_role_key text");
      expect(body).toContain("default_role_key");
      // El cuerpo se copió a mano desde cero_02: el riesgo real es perder el gate.
      expect(body).toContain("IF NOT public.is_admin() THEN");
    },
  );

  it("only the create RPC defaults p_default_role_key; update requires it", () => {
    // Asimetría deliberada. En update el contrato es de REEMPLAZO TOTAL (ningún otro
    // parámetro tiene default, tampoco `p_default_app_role`). Con `DEFAULT NULL`, un
    // bundle viejo que siguiera mandando las 10 claves previas resolvería igual esta
    // función y borraría la sugerencia de rol en silencio al editar cualquier tarifa;
    // sin default, esa llamada falla ruidosamente con PGRST202.
    const signature = (name: string) => {
      const start = defaultRoleKeySql.indexOf(`CREATE FUNCTION public.${name}(`);
      return defaultRoleKeySql.slice(start, defaultRoleKeySql.indexOf(") RETURNS", start));
    };

    expect(signature("create_category_for_practice")).toContain(
      "p_default_role_key text DEFAULT NULL::text",
    );
    expect(signature("update_category_for_practice")).not.toContain(
      "p_default_role_key text DEFAULT",
    );
  });

  it("create_category_for_practice still enforces practicas.allows_rates_activities", () => {
    const start = defaultRoleKeySql.indexOf("CREATE FUNCTION public.create_category_for_practice(");
    const body = defaultRoleKeySql.slice(start, defaultRoleKeySql.indexOf("\n$$;", start));
    expect(body).toContain("allows_rates_activities");
    expect(body).toContain("Practice does not allow rates/categories");
  });

  it.each(["create_category_for_practice", "update_category_for_practice"])(
    "%s re-issues its grants with the new signature (DROP FUNCTION drops the ACL)",
    (name) => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        expect(defaultRoleKeySql).toMatch(
          new RegExp(`GRANT ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?\\) TO ${role};`),
        );
      }
      expect(defaultRoleKeySql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?\\) FROM PUBLIC;`),
      );
    },
  );

  it("copy_categories_between_practices clones default_role_key", () => {
    // El INSERT..SELECT es explícito por columnas: omitir la nueva haría que copiar una
    // práctica perdiera el rol sugerido en silencio.
    const start = defaultRoleKeySql.indexOf(
      "CREATE OR REPLACE FUNCTION public.copy_categories_between_practices(",
    );
    expect(start).toBeGreaterThan(-1);
    const body = defaultRoleKeySql.slice(start);
    expect(body).toMatch(/can_approve_wo, can_approve_timesheets, default_app_role, default_role_key/);
    expect(body).toMatch(/src\.can_approve_timesheets, src\.default_app_role, src\.default_role_key/);
  });

  it("backfills only where the legacy→catalog mapping is unambiguous", () => {
    // `manager` lo comparten 7 role_key, `senior` 6, `partner` 3 y `staff` 3. Sin el
    // guard de unicidad el backfill inventaría un rol y sugeriría permisos incorrectos.
    const start = defaultRoleKeySql.indexOf("UPDATE public.categories c");
    const body = defaultRoleKeySql.slice(start, defaultRoleKeySql.indexOf(";", start));
    expect(body).toContain("ar.legacy_app_role = c.default_app_role");
    expect(body).toContain("c.default_role_key IS NULL");
    expect(body).toMatch(/count\(\*\) FROM public\.authorization_roles a2[\s\S]*?\) = 1/);
  });
});

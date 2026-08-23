import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 0602-136 (retargeted por la migración cero, plan §2.5.d): assertions estructurales sobre
 * la tabla `public.taxonomies`, sus policies, FKs y el RPC de creación de encargos, ahora
 * contra los archivos consolidados. La aserción sobre el CONTENIDO del seed original (46
 * filas) se retiró — el catálogo real vigente son las 29 filas de
 * bugs/migracion_cero/practicas.md ("servicios" tras el rename de Fase 3), que llegan en
 * Fase 4 como datos, no como parte de esta migración de esquema.
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
const policiesSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000005_cero_05_rls_policies.sql"),
  "utf-8",
);

describe("taxonomies table (migración cero, consolidado)", () => {
  it("creates the public.taxonomies table", () => {
    expect(sql).toContain("CREATE TABLE public.taxonomies");
  });

  it("code has a length CHECK between 1 and 10", () => {
    const tableBlock = sql.slice(
      sql.indexOf("CREATE TABLE public.taxonomies"),
      sql.indexOf(");", sql.indexOf("CREATE TABLE public.taxonomies")),
    );
    expect(tableBlock).toContain("code character varying(10) NOT NULL");
    expect(tableBlock).toMatch(
      /CONSTRAINT taxonomies_code_check CHECK \(\(\(char_length\(TRIM\(BOTH FROM code\)\) >= 1\) AND \(char_length\(TRIM\(BOTH FROM code\)\) <= 10\)\)\)/,
    );
  });

  it("has a case-insensitive unique index on code", () => {
    expect(constraintsSql).toContain(
      "CREATE UNIQUE INDEX idx_taxonomies_code_unique ON public.taxonomies USING btree (lower(TRIM(BOTH FROM code)));",
    );
  });

  it("service_id is a nullable FK to services (independent table)", () => {
    const tableBlock = sql.slice(
      sql.indexOf("CREATE TABLE public.taxonomies"),
      sql.indexOf(");", sql.indexOf("CREATE TABLE public.taxonomies")),
    );
    expect(tableBlock).toContain("service_id uuid,");
    expect(fksSql).toContain(
      "ADD CONSTRAINT taxonomies_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(service_id) ON DELETE SET NULL;",
    );
  });

  it("INSERT/UPDATE policies reference is_admin()", () => {
    const block = policiesSql.slice(
      policiesSql.indexOf('"Admins can insert taxonomies"'),
      policiesSql.indexOf('"Admins can update taxonomies"') + 200,
    );
    expect(block).toContain("public.is_admin()");
  });

  it("has no DELETE policy on taxonomies (deactivate-only design)", () => {
    expect(policiesSql).not.toMatch(/ON public\.taxonomies FOR DELETE/);
  });

  it("SELECT policy is open to authenticated", () => {
    expect(policiesSql).toContain(
      'CREATE POLICY "Authenticated users can read taxonomies" ON public.taxonomies FOR SELECT TO authenticated USING (true);',
    );
  });

  it("engagements.taxonomy_id is a nullable FK to taxonomies", () => {
    expect(fksSql).toContain(
      "ADD CONSTRAINT engagements_taxonomy_id_fkey FOREIGN KEY (taxonomy_id) REFERENCES public.taxonomies(taxonomy_id);",
    );
  });

  it("create_engagement_with_code takes p_taxonomy_id with a default of NULL", () => {
    expect(sql).toContain("p_taxonomy_id uuid DEFAULT NULL::uuid) RETURNS public.engagements");
  });

  it("RPC validates the taxonomy is active when provided", () => {
    expect(sql).toContain("SELECT 1 FROM public.taxonomies WHERE taxonomy_id = p_taxonomy_id AND is_active");
  });
});

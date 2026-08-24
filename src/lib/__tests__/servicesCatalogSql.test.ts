import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 0625-149 (retargeted por la migración cero, plan §2.5.d): assertions estructurales sobre
 * la tabla `public.practicas`, sus policies y el RPC de lookup por código de práctica,
 * ahora contra el archivo consolidado. Las aserciones sobre el CONTENIDO del seed original
 * (5 filas: Firmwide/Auditoría/Consultoría/Tax/Growth & Strategy) se retiraron — el
 * catálogo real vigente son las 8 prácticas de bugs/migracion_cero/practicas.md, que
 * llegan en Fase 4 como datos, no como parte de esta migración de esquema.
 */

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000002_cero_02_functions_tables_views.sql"),
  "utf-8",
);
const policiesSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000005_cero_05_rls_policies.sql"),
  "utf-8",
);

describe("practicas table (migración cero, consolidado)", () => {
  it("creates the public.practicas table", () => {
    expect(sql).toContain("CREATE TABLE public.practicas");
  });

  it("RPC references public.practicas (catalog lookup)", () => {
    expect(sql).toContain("FROM public.practicas WHERE code = p_practica AND is_active");
  });

  it("RPC does NOT use the old static IN (0,1,2,3,4) guard", () => {
    expect(sql).not.toContain("NOT IN (0, 1, 2, 3, 4)");
    expect(sql).not.toContain("NOT IN (0,1,2,3,4)");
  });

  it("INSERT/UPDATE policies reference is_admin()", () => {
    const block = policiesSql.slice(
      policiesSql.indexOf('"Admins can insert practicas"'),
      policiesSql.indexOf('"Admins can update practicas"') + 200,
    );
    expect(block).toContain("public.is_admin()");
  });

  it("has no DELETE policy on practicas (deactivate-only design)", () => {
    expect(policiesSql).not.toMatch(/ON public\.practicas FOR DELETE/);
  });

  it("SELECT policy is open to authenticated", () => {
    expect(policiesSql).toContain(
      'CREATE POLICY "Authenticated users can read practicas" ON public.practicas FOR SELECT TO authenticated USING (true);',
    );
  });

  it("CHECK constraint allows code 0-9", () => {
    expect(sql).toContain("CONSTRAINT practicas_code_check CHECK (((code >= 0) AND (code <= 9)))");
  });

  it("engagements.practica CHECK is 0-9 (superset of the old 0-4)", () => {
    expect(sql).toContain("CONSTRAINT chk_engagements_practica CHECK (((practica >= 0) AND (practica <= 9)))");
  });
});

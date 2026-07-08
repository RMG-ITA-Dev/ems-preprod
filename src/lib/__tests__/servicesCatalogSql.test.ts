import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 0625-149: Static assertions on the services catalog migration file.
 * Guards against accidental drift in the migration content.
 */

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260626000000_create_services_catalog.sql"
);
const sql = readFileSync(migrationPath, "utf-8");

describe("services catalog migration (0625-149)", () => {
  it("creates the public.services table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.services");
  });

  it("seeds Tax (not TAX)", () => {
    expect(sql).toContain("'Tax'");
    expect(sql).not.toContain("'TAX'");
  });

  it("seeds all five rows (Firmwide, Auditoría, Consultoría, Tax, Growth & Strategy)", () => {
    expect(sql).toContain("'Firmwide'");
    expect(sql).toContain("'Auditoría'");
    expect(sql).toContain("'Consultoría'");
    expect(sql).toContain("'Tax'");
    expect(sql).toContain("'Growth & Strategy'");
  });

  it("RPC references public.services (catalog lookup)", () => {
    expect(sql).toContain("FROM public.services WHERE code = p_practica AND is_active");
  });

  it("RPC does NOT use the old static IN (0,1,2,3,4) guard", () => {
    expect(sql).not.toContain("NOT IN (0, 1, 2, 3, 4)");
    expect(sql).not.toContain("NOT IN (0,1,2,3,4)");
  });

  it("INSERT/UPDATE policies reference is_admin()", () => {
    expect(sql).toContain("public.is_admin()");
  });

  it("has no DELETE policy (deactivate-only design)", () => {
    expect(sql).not.toContain("FOR DELETE");
  });

  it("SELECT policy is open to authenticated", () => {
    expect(sql).toContain("FOR SELECT");
    expect(sql).toContain("USING (true)");
  });

  it("CHECK constraint allows 0–9", () => {
    expect(sql).toContain("CHECK (code BETWEEN 0 AND 9)");
  });

  it("new engagements practica CHECK is BETWEEN 0 AND 9 (superset of old 0-4)", () => {
    expect(sql).toContain("CHECK (practica BETWEEN 0 AND 9)");
  });
});

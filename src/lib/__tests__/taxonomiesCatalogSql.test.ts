import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 0602-136: Static assertions on the taxonomies catalog migration file.
 * Guards against accidental drift in the migration content.
 */

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/20260707000000_create_taxonomies_catalog.sql"
);
const sql = readFileSync(migrationPath, "utf-8").replace(/\r\n/g, "\n");

describe("taxonomies catalog migration (0602-136)", () => {
  it("creates the public.taxonomies table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.taxonomies");
  });

  it("code is varchar(10) with a length CHECK", () => {
    expect(sql).toContain("code        varchar(10) NOT NULL CHECK (char_length(trim(code)) BETWEEN 1 AND 10)");
  });

  it("has a case-insensitive unique index on code", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_taxonomies_code_unique");
    expect(sql).toContain("ON public.taxonomies (lower(trim(code)))");
  });

  it("service_id is a nullable FK to services (independent table)", () => {
    expect(sql).toContain("service_id  uuid        NULL REFERENCES public.services(service_id)");
  });

  it("does NOT alter or reuse the services table", () => {
    expect(sql).not.toContain("CREATE TABLE public.services");
    expect(sql).not.toContain("ALTER TABLE public.services");
  });

  it("INSERT/UPDATE policies reference is_admin()", () => {
    expect(sql).toContain("public.is_admin()");
  });

  it("has no DELETE policy (deactivate-only design)", () => {
    expect(sql).not.toContain("FOR DELETE");
  });

  it("SELECT policy is open to authenticated", () => {
    expect(sql).toContain('CREATE POLICY "Authenticated users can read taxonomies"');
    expect(sql).toContain("USING (true)");
  });

  it("seeds 46 global, active taxonomies", () => {
    const matches = sql.match(/', NULL, true\)/g) ?? [];
    expect(matches.length).toBe(46);
    expect(sql).toContain("'AA1006'");
    expect(sql).toContain("'DM1010'");
  });

  it("adds engagements.taxonomy_id as a nullable FK (no backfill)", () => {
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS taxonomy_id uuid REFERENCES public.taxonomies(taxonomy_id)"
    );
  });

  it("RPC signature includes p_taxonomy_id with a default of NULL", () => {
    expect(sql).toContain("p_taxonomy_id          uuid DEFAULT NULL");
  });

  it("RPC validates the taxonomy is active when provided", () => {
    expect(sql).toContain("SELECT 1 FROM public.taxonomies WHERE taxonomy_id = p_taxonomy_id AND is_active");
  });

  it("RPC inserts taxonomy_id into engagements", () => {
    expect(sql).toContain("taxonomy_id\n  ) VALUES (");
    expect(sql).toContain("p_taxonomy_id\n  ) RETURNING * INTO v_engagement;");
  });

  it("GRANT/REVOKE reference the updated 22-arg signature (ending in p_taxonomy_id)", () => {
    expect(sql).toContain(
      "date, boolean, uuid, uuid, uuid, uuid, text, uuid"
    );
  });
});

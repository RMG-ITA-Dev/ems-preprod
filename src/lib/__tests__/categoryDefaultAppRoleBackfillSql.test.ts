import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260917120000_0820-182_backfill_category_default_app_roles.sql",
  ),
  "utf-8",
);

const practiceSeedSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204001002_cero_11_seed_practicas.sql"),
  "utf-8",
);

const practiceNames: Record<string, string> = {
  AUD: "Auditoría",
  COM: "Compliance",
  TAX: "Tax & Advisory",
  PTR: "Precios de Transferencias",
  MYA: "M&A",
  LEG: "Legal",
  GYS: "Growth & Strategy",
};

const backfillMappings = (): string[] => {
  const start = migrationSql.indexOf("INSERT INTO _0820_182_category_role_defaults");
  const end = migrationSql.indexOf("DO $$", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return Array.from(
    migrationSql.slice(start, end).matchAll(/\('([^']+)',\s*'([^']+)',\s*'([a-z_]+)'\)/g),
  ).map((match) => `${match[1]} / ${match[2]} / ${match[3]}`);
};

const seededMappings = (): string[] => {
  const start = practiceSeedSql.indexOf("-- 2. Categories");
  const end = practiceSeedSql.indexOf("-- 3. Activity codes", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return Array.from(
    practiceSeedSql
      .slice(start, end)
      .matchAll(
        /\('([A-Z]{3})',\s*'([^']+)',\s*\d+,\s*(?:true|false),\s*(?:true|false),\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*'([a-z_]+)'\)/g,
      ),
  ).map((match) => `${practiceNames[match[1]]} / ${match[2]} / ${match[3]}`);
};

describe("0820-182 — backfill de default_app_role por práctica/categoría", () => {
  it("cubre exactamente las 61 categorías del catálogo semilla", () => {
    expect(backfillMappings()).toHaveLength(61);
    expect([...backfillMappings()].sort()).toEqual([...seededMappings()].sort());
  });

  it("vincula por código de práctica y categoría, y falla si falta una fila", () => {
    expect(migrationSql).toContain("p.code = d.practice_code");
    expect(migrationSql).toContain("c.category_name = d.category_name");
    expect(migrationSql).toContain("missing expected practice/category mappings");
  });

  it("traduce cada práctica canónica a su código estable", () => {
    expect(migrationSql).toContain("WHEN 'Auditoría' THEN 1");
    expect(migrationSql).toContain("WHEN 'Growth & Strategy' THEN 7");
  });

  it("es idempotente y no reescribe una fila que ya coincide", () => {
    expect(migrationSql).toContain(
      "c.default_app_role IS DISTINCT FROM d.default_app_role",
    );
  });
});

describe("0820-182 — backfill de default_role_key para la UI", () => {
  it("deriva el role_key de las mismas 61 filas que reciben el rol legacy", () => {
    expect(backfillMappings()).toHaveLength(61);
    expect(migrationSql).toContain("default_role_key = COALESCE(c.default_role_key, CASE");
  });

  it("conserva una selección manual de role_key y solo completa valores NULL", () => {
    expect(migrationSql).toContain("OR c.default_role_key IS NULL");
    expect(migrationSql).not.toContain("c.default_role_key IS DISTINCT FROM CASE");
  });

  it("traduce los valores legacy a los role_key del catálogo", () => {
    expect(migrationSql).toContain("WHEN d.default_app_role = 'staff' THEN 'assistant'");
    expect(migrationSql).toContain("'Senior - Especialista IT' THEN 'ita_senior'");
    expect(migrationSql).toContain("'Asistente - Especialista IT' THEN 'ita_assistant'");
    expect(migrationSql).toContain("'Senior - Especialista Tax' THEN 'tax_senior'");
    expect(migrationSql).toContain("'Asistente - Especialista Tax' THEN 'tax_assistant'");
  });

  it("verifica que los role_key existan y estén activos antes de actualizar", () => {
    expect(migrationSql).toContain("LEFT JOIN public.authorization_roles ar");
    expect(migrationSql).toContain("AND ar.is_active");
    expect(migrationSql).toContain("active authorization role keys missing");
  });
});

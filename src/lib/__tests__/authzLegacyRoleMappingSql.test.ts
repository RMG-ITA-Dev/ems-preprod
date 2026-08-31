import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Regresión de la consolidación (migración cero): el seed dejó de poblar
 * `authorization_roles.legacy_app_role`.
 *
 * Por qué importa: `admin_set_user_role_key` lee ese espejo y devuelve ROLE_NOT_MAPPED
 * cuando es NULL, así que sin el mapeo NINGÚN rol es asignable desde Gestión de Roles en
 * una base replayada desde cero. En el mirror no se nota, porque la migración original
 * (e6d1f46c) corrió ahí antes de que se consolidaran las 184 migraciones.
 *
 * Estas aserciones son estructurales sobre el SQL —no ejecutan Postgres—, así que su
 * valor es evitar que el mapeo se vuelva a perder o se recorte en un refactor del set de
 * migraciones. Los 23 role_key se comparan contra el seed de cero_13, que es la fuente de
 * verdad de qué roles existen.
 */

const restoreSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260825000100_authz_restore_legacy_app_role_mapping.sql",
  ),
  "utf-8",
);

const seedSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204001004_cero_13_seed_authorization_rbac.sql"),
  "utf-8",
);

/** role_key de cada fila `('x', 'y'),` del bloque `from (values ...)`. */
const mappedRoleKeys = (): string[] => {
  const start = restoreSql.indexOf("from (values");
  const end = restoreSql.indexOf(") as m(role_key, legacy)", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return Array.from(restoreSql.slice(start, end).matchAll(/\('([a-z_]+)',\s*'([a-z_]+)'\)/g)).map(
    (m) => m[1],
  );
};

/** role_key sembrados en cero_13 (el catálogo real). */
const seededRoleKeys = (): string[] => {
  const start = seedSql.indexOf("insert into public.authorization_roles");
  const end = seedSql.indexOf("on conflict (role_key) do nothing;", start);
  expect(start).toBeGreaterThan(-1);
  return Array.from(seedSql.slice(start, end).matchAll(/\('([a-z_]+)',\s*'authz\.role\./g)).map(
    (m) => m[1],
  );
};

describe("authorization_roles.legacy_app_role — mapeo restaurado", () => {
  it("mapea exactamente los mismos role_key que siembra cero_13", () => {
    // Si el catálogo crece y el mapeo no, el rol nuevo queda inasignable en silencio.
    expect([...mappedRoleKeys()].sort()).toEqual([...seededRoleKeys()].sort());
  });

  it("cubre los 23 roles del catálogo", () => {
    expect(mappedRoleKeys()).toHaveLength(23);
  });

  it("solo usa valores válidos del enum app_role", () => {
    const start = restoreSql.indexOf("from (values");
    const end = restoreSql.indexOf(") as m(role_key, legacy)", start);
    const legacyValues = Array.from(
      restoreSql.slice(start, end).matchAll(/\('[a-z_]+',\s*'([a-z_]+)'\)/g),
    ).map((m) => m[1]);

    // Los 11 valores del enum, tal como los declara cero_01.
    const APP_ROLE = [
      "admin", "partner", "director", "manager", "senior", "semisenior",
      "staff", "viewer", "sqr", "specialist_it", "specialist_tax",
    ];
    for (const value of legacyValues) {
      expect(APP_ROLE).toContain(value);
    }
  });

  it("preserva las equivalencias que no son obvias", () => {
    const pairs = new Map(
      Array.from(
        restoreSql.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)'\)/g),
      ).map((m) => [m[1], m[2]]),
    );
    // `assistant` -> `staff` es la equivalencia de Fase 1: no hay `assistant` en el enum.
    expect(pairs.get("assistant")).toBe("staff");
    // Los especializados se mapean a su NIVEL, no a un rol propio — es justamente por esto
    // que el enum no sirve como rol de negocio (bug 0722-162) y `default_role_key` guarda
    // el role_key del catálogo.
    expect(pairs.get("ita_manager")).toBe("manager");
    expect(pairs.get("tax_senior")).toBe("senior");
    expect(pairs.get("risk_partner")).toBe("partner");
  });

  it("falla ruidosamente si algún rol activo queda sin espejo", () => {
    expect(restoreSql).toContain("legacy_app_role IS NULL");
    expect(restoreSql).toMatch(/RAISE EXCEPTION 'authorization_roles activos sin legacy_app_role/);
  });

  it("es idempotente: el UPDATE se acota por role_key y puede re-aplicarse", () => {
    expect(restoreSql).toContain("where ar.role_key = m.role_key;");
  });
});

/**
 * El backfill de `categories.default_role_key` vive en ESTA migración, no en la que crea
 * la columna (20260825000000), porque depende del mapeo restaurado arriba. Puesto allá
 * corría antes de que `legacy_app_role` existiera, así que en una base replayada desde las
 * consolidadas era un no-op permanente: las categorías sembradas se quedaban sin las
 * sugerencias inequívocas que sí obtenía una base actualizada. Es decir, el mismo set de
 * migraciones dejaba datos distintos según el historial de la base.
 */
describe("backfill de categories.default_role_key (0820-182)", () => {
  const backfill = (): string => {
    const start = restoreSql.indexOf("UPDATE public.categories c");
    expect(start).toBeGreaterThan(-1);
    return restoreSql.slice(start, restoreSql.indexOf(";", start));
  };

  it("corre DESPUÉS del UPDATE que puebla legacy_app_role", () => {
    // Es la razón de ser de su ubicación: al revés no encontraría nada.
    const mapping = restoreSql.indexOf("set legacy_app_role = m.legacy::app_role");
    const categories = restoreSql.indexOf("UPDATE public.categories c");
    expect(mapping).toBeGreaterThan(-1);
    expect(categories).toBeGreaterThan(mapping);
  });

  it("no pisa una sugerencia ya elegida a mano", () => {
    expect(backfill()).toContain("c.default_role_key IS NULL");
  });

  it("excluye `admin`, que reintroduciría la escalada por categoría", () => {
    // El formulario anterior a FASE 3c permitía elegirlo, así que una base actualizada
    // puede tener default_app_role = 'admin' — y ningún otro role_key mapea a ese enum,
    // de modo que el guard de unicidad lo daría por inequívoco.
    expect(backfill()).toContain("ar.role_key <> 'admin'");
  });

  it("no inventa un rol donde varios role_key comparten el espejo legacy", () => {
    // `manager` lo comparten 7 role_key, `senior` 6, `partner` 3 y `staff` 3: para esas
    // categorías la intención no se puede deducir y quedan en NULL a propósito.
    expect(backfill()).toMatch(
      /count\(\*\) FROM public\.authorization_roles a2[\s\S]*?\) = 1/,
    );
  });
});

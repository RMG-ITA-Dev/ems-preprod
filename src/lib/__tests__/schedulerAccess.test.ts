// Fase 3 — permisos de navegación del Scheduler. Los mismos predicados
// gatean App.tsx (en página), AppSidebar y MobileMoreDrawer; esta prueba
// fija la matriz de roles para que no diverjan entre sí.
//
// Merge con feat/roles-permisos (2026-08): el rol pasó de flags legacy a
// role_key. Los 23 role_key del catálogo están cubiertos explícitamente
// abajo — los positivos y los 12 negativos que el enum legacy filtraba de
// más (ver el comentario de cabecera en schedulerAccess.ts).

import { describe, it, expect } from "vitest";
import { canSeeGaps, canSeePlanning } from "@/lib/schedulerAccess";

const ALL_23_ROLE_KEYS = [
  "admin",
  "senior_partner",
  "partner",
  "sqr",
  "director",
  "manager",
  "senior",
  "semisenior",
  "assistant",
  "ita_manager",
  "ita_senior",
  "ita_assistant",
  "tax_manager",
  "tax_senior",
  "tax_assistant",
  "accounting_manager",
  "accounting_analyst",
  "collections_analyst",
  "risk_partner",
  "risk_supervisor",
  "hr_manager",
  "hr_analyst",
  "it_security_manager",
] as const;

describe("canSeePlanning — L1/L2/Staff timeline: firmwide + manager + senior", () => {
  it.each(["admin", "senior_partner", "partner", "director", "manager", "senior"])(
    "%s → true",
    (roleKey) => {
      expect(canSeePlanning(roleKey)).toBe(true);
    }
  );

  const excluded = ALL_23_ROLE_KEYS.filter(
    (r) => !["admin", "senior_partner", "partner", "director", "manager", "senior"].includes(r)
  );
  it.each(excluded)("%s → false (filtrado por el enum legacy antes del merge)", (roleKey) => {
    expect(canSeePlanning(roleKey)).toBe(false);
  });

  it("sin rol (null) → false", () => {
    expect(canSeePlanning(null)).toBe(false);
  });

  it("sin rol (undefined, mientras carga) → false", () => {
    expect(canSeePlanning(undefined)).toBe(false);
  });

  it("role_key desconocido → false (fail-closed)", () => {
    expect(canSeePlanning("not-a-real-role")).toBe(false);
  });
});

describe("canSeeGaps — Gap Reporting: firmwide únicamente (admin/senior_partner/partner/director)", () => {
  it.each(["admin", "senior_partner", "partner", "director"])("%s → true", (roleKey) => {
    expect(canSeeGaps(roleKey)).toBe(true);
  });

  it("manager → false (no es firmwide)", () => {
    expect(canSeeGaps("manager")).toBe(false);
  });

  it("senior → false (no es firmwide)", () => {
    expect(canSeeGaps("senior")).toBe(false);
  });

  const excluded = ALL_23_ROLE_KEYS.filter(
    (r) => !["admin", "senior_partner", "partner", "director"].includes(r)
  );
  it.each(excluded)("%s → false", (roleKey) => {
    expect(canSeeGaps(roleKey)).toBe(false);
  });

  it("sin rol (null) → false", () => {
    expect(canSeeGaps(null)).toBe(false);
  });
});

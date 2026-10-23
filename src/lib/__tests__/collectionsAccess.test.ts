// Cobranzas — quién hace cobranza, en el cliente.
//
// Este predicado decide el ítem del menú, el gate de la pantalla de Cobranzas y las acciones de
// cobranza de la OT. Es el espejo de `public.is_collections_role()`, así que si alguna vez
// divergen, el síntoma es una pantalla que se ve pero no trae datos (o al revés). Estas
// aserciones fijan la lista exacta.

import { describe, it, expect } from "vitest";
import { canDoCollections, isCollectionsRole, COLLECTIONS_ROLES } from "@/lib/collectionsAccess";

describe("collectionsAccess", () => {
  it("los dos roles de cobranza son el Gerente de Contabilidad y el Analista de Cobranzas", () => {
    // Decisión del operador Q58: paridad exacta entre los dos.
    expect([...COLLECTIONS_ROLES].sort()).toEqual(["accounting_manager", "collections_analyst"]);
    expect(isCollectionsRole("accounting_manager")).toBe(true);
    expect(isCollectionsRole("collections_analyst")).toBe(true);
  });

  it("el Analista de Contabilidad NO hace cobranza", () => {
    // Sólo trabaja solicitudes de fondos (Q14). Es el error fácil: los tres son "contabilidad".
    expect(isCollectionsRole("accounting_analyst")).toBe(false);
    expect(canDoCollections("accounting_analyst")).toBe(false);
  });

  it("admin entra, pero no es un rol de cobranza", () => {
    // Igual que en la base: is_admin() va por separado de is_collections_role().
    expect(canDoCollections("admin")).toBe(true);
    expect(isCollectionsRole("admin")).toBe(false);
  });

  it("el gerente y el socio del encargo no entran a la pantalla de Cobranzas", () => {
    expect(canDoCollections("manager")).toBe(false);
    expect(canDoCollections("partner")).toBe(false);
  });

  it("falla cerrado mientras el rol todavía no se conoce", () => {
    // `useAuthorization` devuelve null mientras carga: sin esto, la pantalla parpadearía
    // mostrando el contenido antes de saber si corresponde.
    expect(canDoCollections(null)).toBe(false);
    expect(canDoCollections(undefined)).toBe(false);
    expect(canDoCollections("")).toBe(false);
  });
});

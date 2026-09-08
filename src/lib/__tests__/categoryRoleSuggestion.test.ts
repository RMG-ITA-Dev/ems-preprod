import { describe, it, expect } from "vitest";
import { isSuggestableRoleKey, NON_SUGGESTABLE_ROLE_KEYS } from "../categoryRoleSuggestion";

/**
 * 0820-182: qué roles puede sugerir una categoría.
 *
 * La regla es corta pero su incumplimiento es escalada de privilegios: `default_role_key`
 * termina ofreciéndose como cambio de rol en StaffForm, así que una categoría que sugiera
 * `admin` convierte "mover a alguien de categoría" en "hacerlo administrador".
 */
describe("isSuggestableRoleKey", () => {
  it("rechaza `admin`", () => {
    expect(isSuggestableRoleKey("admin")).toBe(false);
  });

  it("acepta los roles de negocio, incluidos los especializados", () => {
    for (const roleKey of [
      "senior_partner",
      "partner",
      "manager",
      "ita_manager",
      "tax_senior",
      "accounting_analyst",
      "assistant",
      "sqr",
    ]) {
      expect(isSuggestableRoleKey(roleKey)).toBe(true);
    }
  });

  it("trata null/undefined/vacío como no sugerible", () => {
    // Es el caso "la categoría no sugiere nada": los consumidores lo usan para decidir si
    // hay algo que ofrecer, así que debe ser falso y no lanzar.
    expect(isSuggestableRoleKey(null)).toBe(false);
    expect(isSuggestableRoleKey(undefined)).toBe(false);
    expect(isSuggestableRoleKey("")).toBe(false);
  });

  it("mantiene `admin` en la lista de exclusión", () => {
    // Guard contra un "simplificado" que vacíe la lista sin darse cuenta del efecto.
    expect(NON_SUGGESTABLE_ROLE_KEYS).toContain("admin");
  });
});

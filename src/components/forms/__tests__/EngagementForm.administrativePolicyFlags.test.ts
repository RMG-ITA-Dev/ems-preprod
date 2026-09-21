import { describe, it, expect } from "vitest";
import { shouldSeedAdministrativePolicyDefaults } from "../EngagementForm";

/**
 * FEAT 0722-160 — review fix (Codex): en un encargo administrativo, work_order_required y
 * approval_required siguen siendo editables (sus switches sólo se deshabilitan para no-admin) y
 * su texto de ayuda dice explícitamente que se pueden desactivar. El efecto que los ponía en
 * `true` corría también al editar: la hidratación sembraba el valor guardado, eso resolvía
 * `funcion`, isAdministrativeFunction pasaba a true y el efecto los devolvía a true — la política
 * persistida se mostraba mal y cualquier guardado la sobrescribía en silencio.
 *
 * `is_internal` y el override de año fiscal NO entran acá: son clasificación del sistema, se
 * fuerzan siempre (el trigger de la base hace lo mismo) y sus controles están deshabilitados.
 */
describe("shouldSeedAdministrativePolicyDefaults (FEAT 0722-160)", () => {
  it("siembra los defaults al crear un encargo administrativo", () => {
    expect(shouldSeedAdministrativePolicyDefaults(true, false)).toBe(true);
  });

  it("NO pisa la política persistida al editar un encargo administrativo", () => {
    expect(shouldSeedAdministrativePolicyDefaults(true, true)).toBe(false);
  });

  it("no toca nada en un encargo de Cliente", () => {
    expect(shouldSeedAdministrativePolicyDefaults(false, false)).toBe(false);
    expect(shouldSeedAdministrativePolicyDefaults(false, true)).toBe(false);
  });
});

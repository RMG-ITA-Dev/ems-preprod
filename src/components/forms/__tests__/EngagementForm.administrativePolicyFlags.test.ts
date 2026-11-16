import { describe, it, expect } from "vitest";
import { EngagementState, canLogHours, deriveEngagementState } from "@/lib/engagementStatus";
import { ADMINISTRATIVE_POLICY_DEFAULTS, shouldSeedAdministrativePolicyDefaults } from "../EngagementForm";

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

/**
 * 1110-220 plan_v3 (decisión del operador, 2026-11-11): lo que crea Talento Humano siempre exige OT
 * aprobada por el Socio. Antes (0722-160) el default era `false` porque hr_analyst no tenía
 * work_order.create y el encargo quedaba trabado esperando a un Admin; ahora el Analista crea las
 * OTs del encargo que crea. El trigger enforce_engagement_profile_scope lo fuerza igual para TH.
 */
describe("ADMINISTRATIVE_POLICY_DEFAULTS (FEAT 0722-160, 1110-220 plan_v3)", () => {
  it("exige OT: el encargo administrativo nace Pendiente hasta que el Socio aprueba la OT", () => {
    expect(ADMINISTRATIVE_POLICY_DEFAULTS.workOrderRequired).toBe(true);
    expect(deriveEngagementState({ work_order_required: ADMINISTRATIVE_POLICY_DEFAULTS.workOrderRequired })).toBe(
      EngagementState.Pendiente,
    );
  });

  it("mantiene la aprobación activada", () => {
    expect(ADMINISTRATIVE_POLICY_DEFAULTS.approvalRequired).toBe(true);
  });

  it("sin OT obligatoria (solo admin la apaga) el encargo quedaría Aprobado", () => {
    expect(deriveEngagementState({ work_order_required: false })).toBe(EngagementState.Aprobado);
  });

  it("con OT obligatoria el mismo encargo quedaria Pendiente y sin horas", () => {
    const state = deriveEngagementState({ work_order_required: true });
    expect(state).toBe(EngagementState.Pendiente);
    expect(canLogHours(state)).toBe(false);
  });
});

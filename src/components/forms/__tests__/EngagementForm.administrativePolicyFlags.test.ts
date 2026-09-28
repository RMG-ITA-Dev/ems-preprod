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
 * Review fix (Codex, P1): el alta administrativa sembraba work_order_required=true. Eso deja el
 * encargo en estado 1 Pendiente (deriveEngagementState) y fuera de list_loggable_engagements()
 * hasta que exista una OT con approval_status='Approved'. El switch está deshabilitado para
 * no-admin y hr_analyst no tiene work_order.create, así que el encargo quedaba sin horas
 * cargables esperando a un Admin. plan_v2 §3 ya fijaba `false`.
 */
describe("ADMINISTRATIVE_POLICY_DEFAULTS (FEAT 0722-160)", () => {
  it("no exige OT: el encargo administrativo nace con horas cargables", () => {
    expect(ADMINISTRATIVE_POLICY_DEFAULTS.workOrderRequired).toBe(false);
  });

  it("mantiene la aprobación activada", () => {
    expect(ADMINISTRATIVE_POLICY_DEFAULTS.approvalRequired).toBe(true);
  });

  it("deja el encargo administrativo en estado Aprobado sin OT", () => {
    expect(
      deriveEngagementState({ work_order_required: ADMINISTRATIVE_POLICY_DEFAULTS.workOrderRequired }),
    ).toBe(EngagementState.Aprobado);
  });

  it("con OT obligatoria el mismo encargo quedaria Pendiente y sin horas", () => {
    const state = deriveEngagementState({ work_order_required: true });
    expect(state).toBe(EngagementState.Pendiente);
    expect(canLogHours(state)).toBe(false);
  });
});

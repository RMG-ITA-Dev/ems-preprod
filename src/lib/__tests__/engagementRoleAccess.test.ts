// 1110-220 — espejo en la UI de las reglas de BD para alta y edición de encargos.
import { describe, it, expect } from "vitest";
import type { ScopeKey } from "@/hooks/useAuthorization";
import {
  ADMINISTRATIVE_ONLY_CREATOR_ROLE_KEYS,
  canEditEngagement,
  isAdministrativeOnlyCreator,
  type EngagementEditTarget,
} from "@/lib/engagementRoleAccess";

const ME = "staff-me";
const OTHER = "staff-other";

const engagement = (over: Partial<EngagementEditTarget> = {}): EngagementEditTarget => ({
  manager_id: OTHER,
  partner_id: OTHER,
  funcion: 1,
  created_by_staff_id: OTHER,
  ...over,
});

const access = ({
  hasUpdate = true,
  updateScope = "assigned_engagements" as ScopeKey | null,
  roleKey = "accounting_manager" as string | null,
  myStaffId = ME as string | null,
  target = engagement(),
} = {}) =>
  canEditEngagement({
    can: (perm) => (perm === "engagement.update" ? hasUpdate : true),
    scope: (perm) => (perm === "engagement.update" ? updateScope : null),
    roleKey,
    myStaffId,
    engagement: target,
  });

describe("isAdministrativeOnlyCreator — espejo de enforce_engagement_profile_scope", () => {
  it.each(["hr_analyst", "accounting_manager", "risk_supervisor", "secretariat_head"])(
    "%s solo crea encargos no-Cliente",
    (roleKey) => {
      expect(isAdministrativeOnlyCreator(roleKey)).toBe(true);
    },
  );

  it.each(["admin", "manager", "hr_manager", "partner", "director", "ita_manager", "tax_manager"])(
    "%s no queda forzado al modo administrativo",
    (roleKey) => {
      expect(isAdministrativeOnlyCreator(roleKey)).toBe(false);
    },
  );

  it("sin rol (cargando o null) no fuerza nada", () => {
    expect(isAdministrativeOnlyCreator(null)).toBe(false);
    expect(isAdministrativeOnlyCreator(undefined)).toBe(false);
  });

  it("la lista tiene exactamente los cuatro roles del trigger", () => {
    expect([...ADMINISTRATIVE_ONLY_CREATOR_ROLE_KEYS].sort()).toEqual(
      ["accounting_manager", "hr_analyst", "risk_supervisor", "secretariat_head"],
    );
  });
});

describe("canEditEngagement — espejo de las políticas UPDATE de engagements", () => {
  it("sin engagement.update nunca edita, aunque sea el creador", () => {
    expect(access({ hasUpdate: false, target: engagement({ created_by_staff_id: ME }) })).toBe(false);
  });

  it("alcance firm edita cualquier encargo", () => {
    expect(access({ updateScope: "firm", roleKey: "admin" })).toBe(true);
  });

  it("el creador edita su encargo", () => {
    expect(access({ target: engagement({ created_by_staff_id: ME }) })).toBe(true);
  });

  it("el Gerente asignado edita aunque no lo haya creado", () => {
    expect(access({ target: engagement({ manager_id: ME }) })).toBe(true);
  });

  it("el Socio asignado edita", () => {
    expect(access({ target: engagement({ partner_id: ME }) })).toBe(true);
  });

  it("quien solo lo ve por otro camino (p. ej. Riesgos o Contabilidad leyendo toda la firma) no edita", () => {
    expect(access({ roleKey: "risk_supervisor" })).toBe(false);
    expect(access({ roleKey: "accounting_manager" })).toBe(false);
  });

  it.each(["secretariat_head", "hr_manager", "hr_analyst"])(
    "%s edita encargos no-Cliente ajenos, pero no los de Cliente",
    (roleKey) => {
      expect(access({ roleKey, target: engagement({ funcion: 0 }) })).toBe(true);
      expect(access({ roleKey, target: engagement({ funcion: 2 }) })).toBe(true);
      expect(access({ roleKey, target: engagement({ funcion: 1 }) })).toBe(false);
      // funcion NULL se lee como Cliente (la política compara funcion <> 1).
      expect(access({ roleKey, target: engagement({ funcion: null }) })).toBe(false);
    },
  );

  it("accounting_manager no hereda la edición de administrativos ajenos de Talento Humano", () => {
    expect(access({ roleKey: "accounting_manager", target: engagement({ funcion: 0 }) })).toBe(false);
  });

  it("sin staff resuelto queda en solo lectura (fail-closed)", () => {
    expect(access({ myStaffId: null, target: engagement({ created_by_staff_id: ME, manager_id: ME }) })).toBe(false);
  });

  it("un created_by_staff_id ausente no coincide con nadie", () => {
    expect(access({ target: { manager_id: OTHER, partner_id: OTHER, funcion: 1 } })).toBe(false);
  });
});

// 1110-220 — espejo en la UI de las reglas de BD para alta y edición de encargos (plan_v3: solo Talento Humano y
// Sistemas crean y escriben lo administrativo).
import { describe, it, expect } from "vitest";
import type { ScopeKey } from "@/hooks/useAuthorization";
import {
  ADMINISTRATIVE_CREATOR_ROLE_KEYS,
  ADMINISTRATIVE_ONLY_CREATOR_ROLE_KEYS,
  canCreateWorkOrderFor,
  canEditEngagement,
  canWriteAdministrativeWork,
  isAdministrativeCreator,
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
  it.each(["hr_analyst", "hr_manager"])("%s solo crea encargos no-Cliente", (roleKey) => {
    expect(isAdministrativeOnlyCreator(roleKey)).toBe(true);
  });

  it.each(["admin", "manager", "partner", "director", "ita_manager", "tax_manager",
    "accounting_manager", "risk_supervisor", "secretariat_head"])(
    "%s no queda forzado al modo administrativo",
    (roleKey) => {
      expect(isAdministrativeOnlyCreator(roleKey)).toBe(false);
    },
  );

  it("sin rol (cargando o null) no fuerza nada", () => {
    expect(isAdministrativeOnlyCreator(null)).toBe(false);
    expect(isAdministrativeOnlyCreator(undefined)).toBe(false);
  });

  it("la lista es Talento Humano (Analista y Gerente)", () => {
    expect([...ADMINISTRATIVE_ONLY_CREATOR_ROLE_KEYS].sort()).toEqual(["hr_analyst", "hr_manager"]);
  });
});

describe("isAdministrativeCreator — quién crea encargos no-Cliente (plan_v3, N1)", () => {
  it("la lista es Sistemas y Talento Humano, espejo del trigger", () => {
    expect([...ADMINISTRATIVE_CREATOR_ROLE_KEYS].sort()).toEqual(["admin", "hr_analyst", "hr_manager"]);
  });

  it.each(["manager", "ita_manager", "tax_manager", "accounting_manager", "risk_supervisor", "secretariat_head", "partner"])(
    "%s no crea encargos no-Cliente",
    (roleKey) => {
      expect(isAdministrativeCreator(roleKey)).toBe(false);
    },
  );

  it("sin rol no crea", () => {
    expect(isAdministrativeCreator(null)).toBe(false);
  });
});

describe("canWriteAdministrativeWork — espejo de can_write_administrative_work (plan_v3, N5)", () => {
  const target = (funcion: number | null, partner_id: string | null = OTHER, created_by_staff_id: string | null = OTHER) => ({
    funcion,
    partner_id,
    created_by_staff_id,
  });

  it("en Cliente no restringe a nadie (funcion 1 o NULL)", () => {
    expect(canWriteAdministrativeWork({ roleKey: "manager", myStaffId: ME, engagement: target(1) })).toBe(true);
    expect(canWriteAdministrativeWork({ roleKey: "manager", myStaffId: ME, engagement: target(null) })).toBe(true);
  });

  it("admin escribe en cualquier no-Cliente", () => {
    expect(canWriteAdministrativeWork({ roleKey: "admin", myStaffId: ME, engagement: target(0) })).toBe(true);
  });

  it.each(["hr_manager", "hr_analyst"])("%s escribe solo el no-Cliente que creó (plan_v5, N10)", (roleKey) => {
    expect(canWriteAdministrativeWork({ roleKey, myStaffId: ME, engagement: target(0, OTHER, ME) })).toBe(true);
    expect(canWriteAdministrativeWork({ roleKey, myStaffId: ME, engagement: target(0) })).toBe(false);
  });

  it.each(["manager", "ita_manager", "accounting_manager", "risk_supervisor", "secretariat_head"])(
    "%s no escribe en no-Cliente aunque sea el Gerente",
    (roleKey) => {
      expect(canWriteAdministrativeWork({ roleKey, myStaffId: ME, engagement: target(2) })).toBe(false);
    },
  );

  it("Control de Calidad (3): solo admin y el Socio escriben; Talento Humano no (N19)", () => {
    expect(canWriteAdministrativeWork({ roleKey: "admin", myStaffId: ME, engagement: target(3) })).toBe(true);
    expect(canWriteAdministrativeWork({ roleKey: "hr_manager", myStaffId: ME, engagement: target(3) })).toBe(false);
    expect(canWriteAdministrativeWork({ roleKey: "partner", myStaffId: ME, engagement: target(3, ME) })).toBe(true);
  });

  it("el Socio del encargo no-Cliente escribe (firma la OT)", () => {
    expect(canWriteAdministrativeWork({ roleKey: "partner", myStaffId: ME, engagement: target(0, ME) })).toBe(true);
    expect(canWriteAdministrativeWork({ roleKey: "partner", myStaffId: null, engagement: target(0, ME) })).toBe(false);
  });
});

describe("canCreateWorkOrderFor — espejo de las políticas INSERT de work_orders", () => {
  const eng = (over: { funcion?: number | null; manager_id?: string | null; created_by_staff_id?: string | null } = {}) => ({
    funcion: 1 as number | null,
    manager_id: OTHER as string | null,
    created_by_staff_id: OTHER as string | null,
    ...over,
  });

  it("admin crea en cualquier encargo", () => {
    expect(canCreateWorkOrderFor({ roleKey: "admin", myStaffId: null, engagement: eng({ funcion: 0 }) })).toBe(true);
  });

  it("en Cliente crea el Gerente del encargo", () => {
    expect(canCreateWorkOrderFor({ roleKey: "manager", myStaffId: ME, engagement: eng({ manager_id: ME }) })).toBe(true);
    expect(canCreateWorkOrderFor({ roleKey: "manager", myStaffId: ME, engagement: eng() })).toBe(false);
  });

  it.each(["manager", "accounting_manager", "risk_supervisor", "secretariat_head"])(
    "en no-Cliente %s no crea aunque sea el Gerente",
    (roleKey) => {
      expect(canCreateWorkOrderFor({ roleKey, myStaffId: ME, engagement: eng({ funcion: 0, manager_id: ME }) })).toBe(false);
    },
  );

  it("la OT de Control de Calidad la crea solo admin (N19)", () => {
    expect(canCreateWorkOrderFor({ roleKey: "admin", myStaffId: ME, engagement: eng({ funcion: 3 }) })).toBe(true);
    expect(canCreateWorkOrderFor({ roleKey: "hr_manager", myStaffId: ME, engagement: eng({ funcion: 3, manager_id: ME }) })).toBe(false);
  });

  it("en no-Cliente crea el Talento Humano que lo creó; ser su Aprobador de horas no alcanza (plan_v5)", () => {
    expect(canCreateWorkOrderFor({ roleKey: "hr_manager", myStaffId: ME, engagement: eng({ funcion: 0, created_by_staff_id: ME }) })).toBe(true);
    expect(canCreateWorkOrderFor({ roleKey: "hr_manager", myStaffId: ME, engagement: eng({ funcion: 0, manager_id: ME }) })).toBe(false);
    expect(canCreateWorkOrderFor({ roleKey: "hr_manager", myStaffId: ME, engagement: eng({ funcion: 0 }) })).toBe(false);
    expect(canCreateWorkOrderFor({ roleKey: "hr_analyst", myStaffId: ME, engagement: eng({ funcion: 2, created_by_staff_id: ME }) })).toBe(true);
    expect(canCreateWorkOrderFor({ roleKey: "hr_analyst", myStaffId: ME, engagement: eng({ funcion: 2 }) })).toBe(false);
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

  it.each(["hr_manager", "hr_analyst"])(
    "%s edita solo los no-Cliente que creó; los demás (aunque sea su Aprobador) los ve en solo lectura (plan_v5, N10)",
    (roleKey) => {
      expect(access({ roleKey, target: engagement({ funcion: 0 }) })).toBe(false);
      expect(access({ roleKey, target: engagement({ funcion: 2 }) })).toBe(false);
      expect(access({ roleKey, target: engagement({ funcion: 0, created_by_staff_id: ME }) })).toBe(true);
      expect(access({ roleKey, target: engagement({ funcion: 2, manager_id: ME }) })).toBe(false);
    },
  );

  it.each(["accounting_manager", "secretariat_head", "risk_supervisor", "manager"])(
    "%s no edita un no-Cliente ni siendo su Gerente (plan_v3, N5)",
    (roleKey) => {
      expect(access({ roleKey, target: engagement({ funcion: 0 }) })).toBe(false);
      expect(access({ roleKey, target: engagement({ funcion: 0, manager_id: ME }) })).toBe(false);
      expect(access({ roleKey, target: engagement({ funcion: 0, created_by_staff_id: ME }) })).toBe(false);
    },
  );

  it("el Gerente normal sigue editando su encargo de Cliente", () => {
    expect(access({ roleKey: "manager", target: engagement({ manager_id: ME }) })).toBe(true);
  });

  it("Control de Calidad: solo admin edita el encargo, ni su Gerente ni su Socio (N19)", () => {
    expect(access({ roleKey: "admin", updateScope: "firm", target: engagement({ funcion: 3 }) })).toBe(true);
    expect(access({ roleKey: "hr_manager", target: engagement({ funcion: 3, manager_id: ME }) })).toBe(false);
    expect(access({ roleKey: "partner", target: engagement({ funcion: 3, partner_id: ME }) })).toBe(false);
  });

  it("el Socio edita su no-Cliente", () => {
    expect(access({ roleKey: "partner", target: engagement({ funcion: 0, partner_id: ME }) })).toBe(true);
  });

  it("sin staff resuelto queda en solo lectura (fail-closed)", () => {
    expect(access({ myStaffId: null, target: engagement({ created_by_staff_id: ME, manager_id: ME }) })).toBe(false);
  });

  it("un created_by_staff_id ausente no coincide con nadie", () => {
    expect(access({ target: { manager_id: OTHER, partner_id: OTHER, funcion: 1 } })).toBe(false);
  });
});

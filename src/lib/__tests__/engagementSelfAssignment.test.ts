import { describe, it, expect } from "vitest";
import {
  resolveSelfAssignedTeamField,
  selfCandidateOption,
  SELF_ASSIGN_PARTNER_ROLE_KEYS,
  SELF_ASSIGN_MANAGER_ROLE_KEYS,
  type SelfAssignmentInput,
} from "@/lib/engagementSelfAssignment";
import { ROLE_KEY_TO_GROUP, TEAM_FIELD_GROUPS } from "@/lib/engagementTeamCandidates";

/**
 * BUG 0810-172 — autoasignación y bloqueo del Socio/Director o Gerente al crear un encargo.
 *
 * El discriminador es `role_key` (decisión del operador 2026-08-17; la evidencia que descartó las
 * tres variantes de "categoría" está en la cabecera de engagementSelfAssignment.ts).
 *
 * La aserción más importante de este archivo es la de COHERENCIA ESTRUCTURAL contra 0722-162: es la
 * que impide que este fix autoasigne a alguien a un campo para el que no es candidato elegible, lo
 * que dejaría un campo bloqueado mostrando el placeholder.
 */

/** Caso base: creación, no admin, clasificación resuelta, con staff vinculado. */
const base: SelfAssignmentInput = {
  isEdit: false,
  isAdmin: false,
  classificationPending: false,
  roleKey: "manager",
  hasStaffRecord: true,
};

describe("resolveSelfAssignedTeamField — roles que SÍ se autoasignan", () => {
  it("manager → manager_id", () => {
    expect(resolveSelfAssignedTeamField({ ...base, roleKey: "manager" })).toBe("manager_id");
  });

  it("partner → partner_id", () => {
    expect(resolveSelfAssignedTeamField({ ...base, roleKey: "partner" })).toBe("partner_id");
  });

  it("director → partner_id (el campo es 'Socio/Director'; decisión del operador 2026-08-17)", () => {
    expect(resolveSelfAssignedTeamField({ ...base, roleKey: "director" })).toBe("partner_id");
  });
});

describe("resolveSelfAssignedTeamField — exenciones", () => {
  it("el admin conserva control total: ni autoasignación ni bloqueo", () => {
    // roleKey sigue siendo uno autoasignable, pero isAdmin manda.
    expect(resolveSelfAssignedTeamField({ ...base, isAdmin: true })).toBeNull();
    expect(resolveSelfAssignedTeamField({ ...base, isAdmin: true, roleKey: "partner" })).toBeNull();
  });

  it("en edición no aplica: el packet pide la regla solo en creación", () => {
    expect(resolveSelfAssignedTeamField({ ...base, isEdit: true })).toBeNull();
  });

  it("fail-closed mientras se clasifica al usuario", () => {
    expect(resolveSelfAssignedTeamField({ ...base, classificationPending: true })).toBeNull();
  });

  it("sin staff vinculado no hay staff_id que asignar", () => {
    expect(resolveSelfAssignedTeamField({ ...base, hasStaffRecord: false })).toBeNull();
  });

  it("sin rol asignado, fail-closed", () => {
    expect(resolveSelfAssignedTeamField({ ...base, roleKey: null })).toBeNull();
  });

  // La precedencia importa: isEdit gana incluso con todo lo demás alineado.
  it("isEdit tiene precedencia sobre cualquier otra combinación", () => {
    expect(
      resolveSelfAssignedTeamField({ ...base, isEdit: true, roleKey: "partner", isAdmin: false })
    ).toBeNull();
  });
});

describe("resolveSelfAssignedTeamField — roles NO autoasignables", () => {
  // Los 19 role_key restantes del catálogo de 23 (admin/partner/director/manager se cubren arriba).
  // Esta lista es la que impide que un rol se cuele por descuido al tocar el mapa.
  it.each([
    ["senior"],
    ["semisenior"],
    ["assistant"],
    ["sqr"],
    ["senior_partner"],
    ["risk_partner"],
    ["risk_supervisor"],
    ["it_security_manager"],
    ["ita_manager"],
    ["ita_senior"],
    ["ita_assistant"],
    ["tax_manager"],
    ["tax_senior"],
    ["tax_assistant"],
    ["accounting_manager"],
    ["accounting_analyst"],
    ["collections_analyst"],
    ["hr_manager"],
    ["hr_analyst"],
  ])("%s no se autoasigna a ningún campo", (roleKey) => {
    expect(resolveSelfAssignedTeamField({ ...base, roleKey })).toBeNull();
  });

  it("ita_manager y tax_manager pueden crear encargos pero NO se autoasignan (decisión 2026-08-17)", () => {
    // Tienen engagement.create (20260724010000_authz_fase2_seed.sql) pero pertenecen a los grupos
    // specialist_it / specialist_tax, así que no son candidatos del campo Gerente.
    expect(resolveSelfAssignedTeamField({ ...base, roleKey: "ita_manager" })).toBeNull();
    expect(resolveSelfAssignedTeamField({ ...base, roleKey: "tax_manager" })).toBeNull();
    expect(ROLE_KEY_TO_GROUP.ita_manager).toBe("specialist_it");
    expect(ROLE_KEY_TO_GROUP.tax_manager).toBe("specialist_tax");
  });
});

describe("coherencia estructural con la elegibilidad de 0722-162", () => {
  // Este bloque es el seguro contra la deriva entre los dos fixes: si alguien agrega un role_key a
  // SELF_ASSIGN_* que no sea candidato del campo correspondiente, el campo quedaría bloqueado
  // mostrando el placeholder (el id no estaría en `options`) y el usuario no podría hacer nada.
  it("todo rol autoasignado al campo Socio/Director es candidato de ese campo", () => {
    for (const roleKey of SELF_ASSIGN_PARTNER_ROLE_KEYS) {
      expect(ROLE_KEY_TO_GROUP[roleKey], `${roleKey} debe ser candidato de partner_id`).toBe(
        TEAM_FIELD_GROUPS.partner_id
      );
    }
  });

  it("todo rol autoasignado al campo Gerente es candidato de ese campo", () => {
    for (const roleKey of SELF_ASSIGN_MANAGER_ROLE_KEYS) {
      expect(ROLE_KEY_TO_GROUP[roleKey], `${roleKey} debe ser candidato de manager_id`).toBe(
        TEAM_FIELD_GROUPS.manager_id
      );
    }
  });

  it("todo rol autoasignable existe en el catálogo de roles elegibles", () => {
    for (const roleKey of [...SELF_ASSIGN_PARTNER_ROLE_KEYS, ...SELF_ASSIGN_MANAGER_ROLE_KEYS]) {
      expect(ROLE_KEY_TO_GROUP, `${roleKey} no está en ROLE_KEY_TO_GROUP`).toHaveProperty(roleKey);
    }
  });

  it("los dos conjuntos son disjuntos: un rol no puede autoasignarse a dos campos", () => {
    const partner = new Set<string>(SELF_ASSIGN_PARTNER_ROLE_KEYS);
    for (const roleKey of SELF_ASSIGN_MANAGER_ROLE_KEYS) {
      expect(partner.has(roleKey)).toBe(false);
    }
  });

  it("`sqr` y `admin` no se autoasignan, igual que en 0722-162", () => {
    expect(resolveSelfAssignedTeamField({ ...base, roleKey: "sqr" })).toBeNull();
    expect(ROLE_KEY_TO_GROUP).not.toHaveProperty("sqr");
    expect(ROLE_KEY_TO_GROUP).not.toHaveProperty("admin");
  });
});

describe("selfCandidateOption", () => {
  it("arma la opción con el nombre completo y sin servicio", () => {
    // serviceId: null es deliberado — la opción se inyecta DESPUÉS de filterByService.
    expect(
      selfCandidateOption({ staff_id: "s1", first_name: "Gala", last_name: "Gerente" })
    ).toEqual({ value: "s1", label: "Gala Gerente", serviceId: null });
  });

  it("devuelve null sin staff", () => {
    expect(selfCandidateOption(null)).toBeNull();
    expect(selfCandidateOption(undefined)).toBeNull();
  });

  it("devuelve null si el staff no tiene staff_id", () => {
    expect(
      selfCandidateOption({ staff_id: "", first_name: "Sin", last_name: "Id" })
    ).toBeNull();
  });
});

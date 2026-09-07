import { describe, it, expect } from "vitest";
import {
  TEAM_FIELD_GROUPS,
  ROLE_KEY_TO_GROUPS,
  ELIGIBLE_ROLE_KEYS,
  withSavedStaff,
  withSelfCandidate,
  TeamCandidateOption,
} from "@/lib/engagementTeamCandidates";

/**
 * BUG 0722-162 — elegibilidad por rol en el bloque Equipo del encargo.
 *
 * Estos tests fijan el mapeo decidido (packet + decisiones del operador 2026-08-17) y las dos
 * transformaciones puras que usa EngagementForm. La aserción más importante es la de los roles
 * NO mapeados: es la que impide que un rol se cuele por descuido al tocar el mapa.
 *
 * ACTUALIZADO 2026-08-27 (decisión del operador): el filtro adicional por práctica/servicio
 * (`filterByService`/`ServiceFilter`/`NO_SERVICE_FILTER`) se retiró del módulo — la elegibilidad
 * depende únicamente del rol. Sus tests se eliminaron junto con el código.
 */

const opt = (value: string, label: string, serviceId: string | null): TeamCandidateOption => ({
  value,
  label,
  serviceId,
});

describe("TEAM_FIELD_GROUPS — mapa campo → grupo de candidatura", () => {
  it("coincide exactamente con la SUGERENCIA del packet", () => {
    expect(TEAM_FIELD_GROUPS).toEqual({
      partner_id: "partner_director",
      sqr_id: "partner_director",
      manager_id: "manager",
      encargado_id: "encargado",
      specialist_it_id: "specialist_it",
      specialist_tax_id: "specialist_tax",
    });
  });

  it("Socio/Director y SQR comparten grupo: el packet pide Socio o Director para AMBOS", () => {
    expect(TEAM_FIELD_GROUPS.sqr_id).toBe(TEAM_FIELD_GROUPS.partner_id);
  });

  it("cubre los seis campos del bloque Equipo y ninguno más", () => {
    expect(Object.keys(TEAM_FIELD_GROUPS).sort()).toEqual([
      "encargado_id",
      "manager_id",
      "partner_id",
      "specialist_it_id",
      "specialist_tax_id",
      "sqr_id",
    ]);
  });
});

describe("ROLE_KEY_TO_GROUPS — mapa role_key → grupo(s) (espejo del mapeo del RPC)", () => {
  it("mapea los 14 role_key elegibles a su(s) grupo(s)", () => {
    expect(ROLE_KEY_TO_GROUPS).toEqual({
      partner: ["partner_director"],
      director: ["partner_director"],
      senior_partner: ["partner_director"],
      risk_partner: ["partner_director"],
      manager: ["manager"],
      hr_manager: ["manager"],
      senior: ["encargado"],
      semisenior: ["encargado"],
      ita_manager: ["specialist_it", "manager"],
      ita_senior: ["specialist_it"],
      ita_assistant: ["specialist_it"],
      tax_manager: ["specialist_tax", "manager"],
      tax_senior: ["specialist_tax"],
      tax_assistant: ["specialist_tax"],
    });
    expect(ELIGIBLE_ROLE_KEYS).toHaveLength(14);
  });

  // BUG 0817-180 (2026-08-27): hr_manager se agregó al grupo "manager" — decisión del operador
  // de no tratar a Talento Humano como caso especial. hr_analyst se queda FUERA a propósito,
  // igual que el resto de los `*_analyst` de la lista de abajo.
  it("hr_manager cae en el mismo grupo que manager", () => {
    expect(ROLE_KEY_TO_GROUPS.hr_manager).toEqual(ROLE_KEY_TO_GROUPS.manager);
  });

  // BUG 0828-185: senior_partner/risk_partner se suman a partner_director (visibilidad
  // firm-wide, antes excluidos del bloque Equipo); ita_manager/tax_manager caen ADEMÁS en
  // 'manager' (doble grupo) — un Especialista puede además actuar como Gerente de cualquier
  // encargo, no solo del suyo.
  it("senior_partner/risk_partner caen en partner_director, igual que partner/director", () => {
    expect(ROLE_KEY_TO_GROUPS.senior_partner).toEqual(ROLE_KEY_TO_GROUPS.partner);
    expect(ROLE_KEY_TO_GROUPS.risk_partner).toEqual(ROLE_KEY_TO_GROUPS.partner);
  });

  it("ita_manager/tax_manager caen en su especialidad Y ADEMÁS en manager", () => {
    expect(ROLE_KEY_TO_GROUPS.ita_manager).toContain("specialist_it");
    expect(ROLE_KEY_TO_GROUPS.ita_manager).toContain("manager");
    expect(ROLE_KEY_TO_GROUPS.tax_manager).toContain("specialist_tax");
    expect(ROLE_KEY_TO_GROUPS.tax_manager).toContain("manager");
    // El resto de las familias ita_*/tax_* se queda en un solo grupo.
    expect(ROLE_KEY_TO_GROUPS.ita_senior).toEqual(["specialist_it"]);
    expect(ROLE_KEY_TO_GROUPS.ita_assistant).toEqual(["specialist_it"]);
    expect(ROLE_KEY_TO_GROUPS.tax_senior).toEqual(["specialist_tax"]);
    expect(ROLE_KEY_TO_GROUPS.tax_assistant).toEqual(["specialist_tax"]);
  });

  // Esta es la red de seguridad del fix: cada rol de acá abajo estuvo considerado y quedó
  // FUERA por decisión explícita. Si alguien agrega uno al mapa sin decisión, este test cae.
  it.each([
    ["sqr", "el packet pide Socio o Director para el campo SQR, no la categoría SQR"],
    ["admin", "rol técnico, no de negocio"],
    ["assistant", "no es Encargado"],
    ["viewer", "sin rol operativo"],
    ["risk_supervisor", "Gerente/Supervisor pide solo `manager`/`hr_manager`/`ita_manager`/`tax_manager`"],
    ["it_security_manager", "seguridad TI interna, no Especialista TI del encargo"],
    ["accounting_manager", "Gerente/Supervisor pide solo `manager`/`hr_manager`/`ita_manager`/`tax_manager`"],
    ["accounting_analyst", "Encargado pide solo senior/semisenior"],
    ["collections_analyst", "Encargado pide solo senior/semisenior"],
    ["hr_analyst", "Encargado pide solo senior/semisenior — hr_manager es el único hr_* elegible"],
  ])("no mapea %s (%s)", (roleKey) => {
    expect(ROLE_KEY_TO_GROUPS[roleKey]).toBeUndefined();
  });

  it("los role_key legacy specialist_it/specialist_tax no existen en el catálogo de 23", () => {
    // El backfill de 20260724010000 los mandó a NULL; las familias reales son ita_*/tax_*.
    expect(ROLE_KEY_TO_GROUPS["specialist_it"]).toBeUndefined();
    expect(ROLE_KEY_TO_GROUPS["specialist_tax"]).toBeUndefined();
  });

  it("todo grupo del mapa de roles es un grupo alcanzable desde algún campo", () => {
    const fieldGroups = new Set(Object.values(TEAM_FIELD_GROUPS));
    const roleGroups = new Set(Object.values(ROLE_KEY_TO_GROUPS).flat());
    expect([...roleGroups].sort()).toEqual([...fieldGroups].sort());
  });
});

describe("withSavedStaff", () => {
  const options = [opt("a", "Ana Socia", "svc-audit")];
  const saved = { staff_id: "hist", first_name: "Hugo", last_name: "Historico" };

  it("agrega al asignado guardado cuando sigue siendo el valor del campo", () => {
    const result = withSavedStaff(options, saved, "hist");
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ value: "hist", label: "Hugo Historico", serviceId: null });
  });

  it("no lo duplica si ya está en la lista", () => {
    const already = [...options, opt("hist", "Hugo Historico", "svc-audit")];
    expect(withSavedStaff(already, saved, "hist")).toHaveLength(2);
  });

  it("es no-op cuando no hay valor guardado", () => {
    expect(withSavedStaff(options, null, null)).toEqual(options);
    expect(withSavedStaff(options, undefined, "hist")).toEqual(options);
  });

  it("preserva el histórico sobre una lista vacía (campo obligatorio no queda huérfano)", () => {
    // Caso real: partner_id apunta a alguien sin role_key. Sin esto, StaffCombobox mostraría
    // el placeholder en un campo obligatorio que sí está lleno.
    expect(withSavedStaff([], saved, "hist")).toEqual([
      { value: "hist", label: "Hugo Historico", serviceId: null },
    ]);
  });

  // Review de Codex: el merge sirve para no perder de vista lo guardado, NO para volver elegible
  // a alguien que no califica. Reemplazado ⇒ fuera de la lista.
  it("deja de ofrecer al histórico una vez que el campo tiene otro valor", () => {
    expect(withSavedStaff(options, saved, "a")).toEqual(options);
  });

  it("deja de ofrecerlo cuando el campo se limpió a null", () => {
    expect(withSavedStaff(options, saved, null)).toEqual(options);
    expect(withSavedStaff(options, saved, "")).toEqual(options);
  });
});

describe("withSelfCandidate — BUG 0810-172", () => {
  const self = opt("me", "Gala Gerente", null);

  it("agrega al creador cuando no está en las opciones", () => {
    const result = withSelfCandidate([opt("a", "Ana", "svc-audit")], self);
    expect(result.map((o) => o.value)).toEqual(["a", "me"]);
  });

  it("no lo duplica cuando ya figura como candidato", () => {
    // Caso normal: el creador SÍ es candidato de su propio campo y del servicio del encargo.
    const alreadyThere = opt("me", "Gala Gerente", "svc-audit");
    const result = withSelfCandidate([alreadyThere, opt("a", "Ana", "svc-audit")], self);
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.value)).toEqual(["me", "a"]);
    // Se conserva la opción original (con su serviceId real), no la inyectada.
    expect(result[0].serviceId).toBe("svc-audit");
  });

  it("sin creador devuelve la lista intacta (misma referencia)", () => {
    const options = [opt("a", "Ana", "svc-audit")];
    expect(withSelfCandidate(options, null)).toBe(options);
  });

  it("funciona sobre una lista vacía: el campo bloqueado nunca queda sin su opción", () => {
    // Es el escenario que evita el formulario sin salida: sin candidatos elegibles por rol, el
    // campo autoasignado igual puede mostrar al creador.
    expect(withSelfCandidate([], self)).toEqual([self]);
  });

  it("preserva el orden de los candidatos existentes", () => {
    const options = [opt("a", "Ana", "s1"), opt("b", "Beto", "s1"), opt("c", "Caro", "s1")];
    expect(withSelfCandidate(options, self).map((o) => o.label)).toEqual([
      "Ana",
      "Beto",
      "Caro",
      "Gala Gerente",
    ]);
  });
});

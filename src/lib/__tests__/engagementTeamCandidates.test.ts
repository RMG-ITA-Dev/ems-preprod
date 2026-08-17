import { describe, it, expect } from "vitest";
import {
  TEAM_FIELD_GROUPS,
  ROLE_KEY_TO_GROUP,
  ELIGIBLE_ROLE_KEYS,
  filterByService,
  withSavedStaff,
  NO_SERVICE_FILTER,
  TeamCandidateOption,
  ServiceFilter,
} from "@/lib/engagementTeamCandidates";

/**
 * BUG 0722-162 — elegibilidad por rol en el bloque Equipo del encargo.
 *
 * Estos tests fijan el mapeo decidido (packet + decisiones del operador 2026-08-17) y las dos
 * transformaciones puras que usa EngagementForm. La aserción más importante es la de los roles
 * NO mapeados: es la que impide que un rol se cuele por descuido al tocar el mapa.
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

describe("ROLE_KEY_TO_GROUP — mapa role_key → grupo (espejo del CASE del RPC)", () => {
  it("mapea los 11 role_key elegibles a su grupo", () => {
    expect(ROLE_KEY_TO_GROUP).toEqual({
      partner: "partner_director",
      director: "partner_director",
      manager: "manager",
      senior: "encargado",
      semisenior: "encargado",
      ita_manager: "specialist_it",
      ita_senior: "specialist_it",
      ita_assistant: "specialist_it",
      tax_manager: "specialist_tax",
      tax_senior: "specialist_tax",
      tax_assistant: "specialist_tax",
    });
    expect(ELIGIBLE_ROLE_KEYS).toHaveLength(11);
  });

  // Esta es la red de seguridad del fix: cada rol de acá abajo estuvo considerado y quedó
  // FUERA por decisión explícita. Si alguien agrega uno al mapa sin decisión, este test cae.
  it.each([
    ["sqr", "el packet pide Socio o Director para el campo SQR, no la categoría SQR"],
    ["admin", "rol técnico, no de negocio"],
    ["assistant", "no es Encargado"],
    ["viewer", "sin rol operativo"],
    ["senior_partner", "solo el rol base partner es elegible"],
    ["risk_partner", "solo el rol base partner es elegible"],
    ["risk_supervisor", "Gerente/Supervisor pide solo `manager`"],
    ["it_security_manager", "seguridad TI interna, no Especialista TI del encargo"],
    ["accounting_manager", "Gerente/Supervisor pide solo `manager`"],
    ["accounting_analyst", "Encargado pide solo senior/semisenior"],
    ["collections_analyst", "Encargado pide solo senior/semisenior"],
    ["hr_manager", "Gerente/Supervisor pide solo `manager`"],
    ["hr_analyst", "Encargado pide solo senior/semisenior"],
  ])("no mapea %s (%s)", (roleKey) => {
    expect(ROLE_KEY_TO_GROUP[roleKey]).toBeUndefined();
  });

  it("los role_key legacy specialist_it/specialist_tax no existen en el catálogo de 23", () => {
    // El backfill de 20260724010000 los mandó a NULL; las familias reales son ita_*/tax_*.
    expect(ROLE_KEY_TO_GROUP["specialist_it"]).toBeUndefined();
    expect(ROLE_KEY_TO_GROUP["specialist_tax"]).toBeUndefined();
  });

  it("todo grupo del mapa de roles es un grupo alcanzable desde algún campo", () => {
    const fieldGroups = new Set(Object.values(TEAM_FIELD_GROUPS));
    const roleGroups = new Set(Object.values(ROLE_KEY_TO_GROUP));
    expect([...roleGroups].sort()).toEqual([...fieldGroups].sort());
  });
});

describe("filterByService", () => {
  const options = [
    opt("a", "Ana Auditoria", "svc-audit"),
    opt("b", "Beto Consultoria", "svc-consult"),
    opt("c", "Carla Auditoria", "svc-audit"),
  ];
  const resolved = (serviceId: string): ServiceFilter => ({ apply: true, serviceId });

  it("devuelve solo los candidatos del servicio pedido", () => {
    expect(filterByService(options, resolved("svc-audit")).map((o) => o.value)).toEqual(["a", "c"]);
  });

  it("sin práctica elegida devuelve la lista intacta (solo filtra por rol)", () => {
    expect(filterByService(options, NO_SERVICE_FILTER)).toEqual(options);
    expect(filterByService(options, { apply: false, serviceId: null })).toEqual(options);
  });

  // Review de Greptile: el caso que antes ensanchaba el conjunto. Con `practica` elegida pero el
  // catálogo de servicios sin resolver (cargando, fallado, o code inexistente) NO debe ofrecerse
  // personal de otros servicios — una selección hecha en esa ventana se guardaría mal.
  it("con práctica elegida y servicio SIN resolver va a fail-closed, no a la lista completa", () => {
    expect(filterByService(options, { apply: true, serviceId: null })).toEqual([]);
  });

  it("con un servicio sin coincidencias devuelve [] y NO la lista completa", () => {
    expect(filterByService(options, resolved("svc-inexistente"))).toEqual([]);
  });

  it("preserva el orden de entrada (el RPC ya ordenó por apellido)", () => {
    const same = [opt("z", "Zulema", "s1"), opt("a", "Ana", "s1")];
    expect(filterByService(same, resolved("s1")).map((o) => o.value)).toEqual(["z", "a"]);
  });

  it("un candidato con serviceId null solo pasa cuando no se filtra por servicio", () => {
    const withNull = [opt("n", "Sin servicio", null)];
    expect(filterByService(withNull, NO_SERVICE_FILTER)).toEqual(withNull);
    expect(filterByService(withNull, resolved("svc-audit"))).toEqual([]);
  });

  it("NO_SERVICE_FILTER no aplica filtro", () => {
    expect(NO_SERVICE_FILTER.apply).toBe(false);
  });
});

describe("withSavedStaff", () => {
  const options = [opt("a", "Ana Socia", "svc-audit")];
  const saved = { staff_id: "hist", first_name: "Hugo", last_name: "Historico" };

  it("agrega al asignado guardado cuando no está entre los candidatos", () => {
    const result = withSavedStaff(options, saved);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ value: "hist", label: "Hugo Historico", serviceId: null });
  });

  it("no lo duplica si ya está en la lista", () => {
    const already = [...options, opt("hist", "Hugo Historico", "svc-audit")];
    expect(withSavedStaff(already, saved)).toHaveLength(2);
  });

  it("es no-op cuando no hay valor guardado", () => {
    expect(withSavedStaff(options, null)).toEqual(options);
    expect(withSavedStaff(options, undefined)).toEqual(options);
  });

  it("preserva el histórico incluso sobre una lista vacía (campo obligatorio no queda huérfano)", () => {
    // Caso real: partner_id apunta a alguien sin role_key. Sin esto, StaffCombobox mostraría
    // el placeholder en un campo obligatorio que sí está lleno.
    expect(withSavedStaff([], saved)).toEqual([
      { value: "hist", label: "Hugo Historico", serviceId: null },
    ]);
  });
});

describe("composición usada por EngagementForm: withSavedStaff(filterByService(...))", () => {
  it("el histórico sobrevive al filtro por servicio aunque sea de otro servicio", () => {
    // El staff embebido en el engagement no trae service_id, así que el merge va DESPUÉS
    // del filtro — si fuera antes, el propio filtro lo descartaría.
    const options = [opt("a", "Ana", "svc-audit")];
    const saved = { staff_id: "otro", first_name: "Otro", last_name: "Servicio" };
    const result = withSavedStaff(
      filterByService(options, { apply: true, serviceId: "svc-audit" }),
      saved
    );
    expect(result.map((o) => o.value)).toEqual(["a", "otro"]);
  });

  it("en edición el histórico se ve incluso con el catálogo de servicios sin resolver", () => {
    // fail-closed vacía la lista, pero el asignado guardado no debe desaparecer de su campo.
    const saved = { staff_id: "hist", first_name: "Hugo", last_name: "Historico" };
    const result = withSavedStaff(
      filterByService([opt("a", "Ana", "svc-audit")], { apply: true, serviceId: null }),
      saved
    );
    expect(result.map((o) => o.value)).toEqual(["hist"]);
  });
});

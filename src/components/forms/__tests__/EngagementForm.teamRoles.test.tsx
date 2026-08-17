import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * BUG 0722-162 — cada campo del bloque Equipo ofrece SOLO los roles que le corresponden.
 *
 * El test #1 reproduce la captura del packet: el popover de SQR mostraba `No Aplica` + la nómina
 * completa. Antes del fix falla listando a los siete candidatos.
 *
 * Mapa verificado (decisiones del operador 2026-08-17):
 *   Socio/Director y SQR → partner, director   |  Gerente/Supervisor → manager
 *   Encargado → senior, semisenior             |  Especialistas → ita_* / tax_*
 */

// Radix Popover/Command necesitan estas APIs en JSDOM
if (typeof (globalThis as any).PointerEvent === "undefined") {
  (globalThis as any).PointerEvent = MouseEvent;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
Element.prototype.scrollIntoView = () => {};
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

// code=1 es AUDITORIA_SERVICE_CODE: los no-admin lo reciben auto-asignado en creación, así que
// `engagementServiceId` resuelve a "svc-audit" y el filtro por servicio queda activo.
const SVC_AUDIT = "svc-audit";
const SVC_CONSULT = "svc-consult";
const mockServices = [
  { service_id: SVC_AUDIT,   name: "Auditoría",   code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
  { service_id: SVC_CONSULT, name: "Consultoría", code: 3, allows_rates_activities: true, is_active: true, created_at: "" },
];

const stableClients = [{ client_id: "c1", client_legal_name: "Acme Corp", is_active: true }];
const stableEmpty: never[] = [];

// Mutable para poder simular un catálogo que no resuelve la práctica (fail-closed).
let mockServicesData: typeof mockServices | undefined = mockServices;

vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
  useServices: () => ({ data: mockServicesData }),
  useTaxonomies: () => ({ data: stableEmpty }),
  useSocieties: () => ({ data: stableEmpty }),
  useEngagementAssignments: () => ({ data: stableEmpty, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableEmpty }),
  useActiveStaffWithSkills: () => ({ data: stableEmpty }),
  useCategories: () => ({ data: stableEmpty }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: vi.fn(() => ({ upload: vi.fn() })) },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

// En edición el formulario monta StaffAssignmentsCard; se stubea para no arrastrar el Scheduler.
vi.mock("@/components/engagements/StaffAssignmentsCard", () => ({
  StaffAssignmentsCard: () => null,
}));

let mockIsAdmin = false;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: () => true,
    roleKey: mockIsAdmin ? "admin" : "manager",
    isLoading: false,
  }),
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: any) => (
    <input
      data-testid="calendar-mock"
      type="date"
      onChange={(e) => e.target.value && onSelect(new Date(e.target.value + "T12:00:00"))}
    />
  ),
}));

// ── Candidatos: uno por grupo, todos del servicio de Auditoría salvo donde se indique ──────
const opt = (value: string, label: string, serviceId: string | null = SVC_AUDIT) => ({
  value,
  label,
  serviceId,
});

const SOCIO = opt("p1", "Sonia Socia");
const DIRECTOR = opt("d1", "Dario Director");
const GERENTE = opt("m1", "Gala Gerente");
const SENIOR = opt("s1", "Sara Senior");
const SEMISENIOR = opt("ss1", "Simon Semisenior");
const ESP_TI = opt("it1", "Ivan EspTI");
const ESP_TAX = opt("tx1", "Tania EspTax");

let mockCandidates: any;
function resetCandidates() {
  mockCandidates = {
    partnerDirectorOptions: [SOCIO, DIRECTOR],
    managerRoleOptions: [GERENTE],
    encargadoOptions: [SENIOR, SEMISENIOR],
    specialistItOptions: [ESP_TI],
    specialistTaxOptions: [ESP_TAX],
    hasPartnerDirectorCandidates: true,
    hasManagerCandidates: true,
    isLoading: false,
    isError: false,
  };
}
resetCandidates();

vi.mock("@/hooks/useEngagementTeamCandidates", () => ({
  useEngagementTeamCandidates: () => mockCandidates,
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

/**
 * Devuelve el trigger del combobox que muestra `text`.
 *
 * Se busca por el TEXTO del botón (placeholder si está vacío, nombre del seleccionado si no) y
 * no por accessible name: `FormLabel` asocia un `htmlFor` al control, así que el nombre accesible
 * es el label del campo y no distingue estado vacío de estado con valor.
 */
function getTriggerByText(text: string | RegExp): HTMLElement {
  const node = screen.getByText(text);
  return (node.closest("button") ?? node) as HTMLElement;
}

/** Abre el combobox cuyo trigger muestra `placeholderKey` y devuelve el listbox. */
async function openCombobox(placeholderKey: string) {
  const user = userEvent.setup();
  await user.click(getTriggerByText(placeholderKey));
  return await screen.findByRole("listbox");
}

const ALL_NAMES = [
  SOCIO.label,
  DIRECTOR.label,
  GERENTE.label,
  SENIOR.label,
  SEMISENIOR.label,
  ESP_TI.label,
  ESP_TAX.label,
];

/** Verifica que el popover abierto ofrezca exactamente `expected` de entre todos los candidatos. */
function expectOnly(listbox: HTMLElement, expected: string[]) {
  for (const name of ALL_NAMES) {
    if (expected.includes(name)) {
      expect(listbox, `${name} debería estar`).toHaveTextContent(name);
    } else {
      expect(listbox, `${name} NO debería estar`).not.toHaveTextContent(name);
    }
  }
}

const baseEngagement: Engagement = {
  engagement_id: "eng-1",
  client_id: "c1",
  engagement_name: "Auditoría Acme 2026",
  engagement_code: "2026.111.001",
  partner_id: SOCIO.value,
  manager_id: GERENTE.value,
  status: "active",
  start_date: "2025-10-01",
  end_date: "2026-09-30",
  created_at: "2025-10-01T00:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 1,
  practica: 1,
  funcion: 1,
  anio_fiscal: 2026,
  fecha_cierre: "2026-03-31",
  anio_fiscal_override: false,
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  contract_file_path: null,
  taxonomy_id: null,
  society_id: null,
};

describe("EngagementForm — elegibilidad por rol en el bloque Equipo (0722-162)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin = false;
    mockServicesData = mockServices;
    resetCandidates();
  });

  // ── #1: reproduce la captura del packet ─────────────────────────────────────────────────
  it("SQR ofrece solo Socio y Director — no la nómina completa (captura del packet)", async () => {
    render(<EngagementForm />);
    const listbox = await openCombobox("engagement.selectSqr");
    expectOnly(listbox, [SOCIO.label, DIRECTOR.label]);
    // La captura mostraba `No Aplica` + toda la nómina; el `No Aplica` se conserva.
    expect(listbox).toHaveTextContent("engagement.noAplica");
  });

  // ── #2: un caso por cada uno de los otros cinco campos ──────────────────────────────────
  it("Socio/Director ofrece solo Socio y Director (hoy además listaba SQR y omitía Director)", async () => {
    render(<EngagementForm />);
    expectOnly(await openCombobox("engagement.selectPartner"), [SOCIO.label, DIRECTOR.label]);
  });

  it("Gerente/Supervisor ofrece solo Gerente — sin Seniors", async () => {
    render(<EngagementForm />);
    expectOnly(await openCombobox("engagement.selectManager"), [GERENTE.label]);
  });

  it("Encargado ofrece solo Senior y Semi-Senior", async () => {
    render(<EngagementForm />);
    expectOnly(await openCombobox("engagement.selectEncargado"), [SENIOR.label, SEMISENIOR.label]);
  });

  it("Especialista TI ofrece solo su especialidad", async () => {
    render(<EngagementForm />);
    expectOnly(await openCombobox("engagement.selectSpecialistIt1"), [ESP_TI.label]);
  });

  it("Especialista Impuestos ofrece solo su especialidad", async () => {
    render(<EngagementForm />);
    expectOnly(await openCombobox("engagement.selectSpecialistTax1"), [ESP_TAX.label]);
  });

  // ── #3: No Aplica solo en los cuatro opcionales ─────────────────────────────────────────
  it.each([
    ["engagement.selectSqr"],
    ["engagement.selectEncargado"],
    ["engagement.selectSpecialistIt1"],
    ["engagement.selectSpecialistTax1"],
  ])("%s (opcional) conserva No Aplica", async (placeholder) => {
    render(<EngagementForm />);
    expect(await openCombobox(placeholder)).toHaveTextContent("engagement.noAplica");
  });

  it.each([["engagement.selectPartner"], ["engagement.selectManager"]])(
    "%s (obligatorio) no ofrece No Aplica",
    async (placeholder) => {
      render(<EngagementForm />);
      expect(await openCombobox(placeholder)).not.toHaveTextContent("engagement.noAplica");
    }
  );

  // ── #4 y #5: búsqueda dentro del conjunto restringido ───────────────────────────────────
  it("buscar un usuario elegible lo encuentra dentro del campo Encargado", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);
    const listbox = await openCombobox("engagement.selectEncargado");
    await user.type(screen.getByPlaceholderText("engagement.searchStaff"), "Sara");
    await waitFor(() => expect(listbox).toHaveTextContent(SENIOR.label));
    expect(listbox).not.toHaveTextContent(SEMISENIOR.label);
  });

  it("buscar un usuario de otro grupo da el estado de sin resultados", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);
    const listbox = await openCombobox("engagement.selectEncargado");
    // Gala Gerente existe en el sistema, pero no es elegible para Encargado.
    await user.type(screen.getByPlaceholderText("engagement.searchStaff"), "Gala");
    await waitFor(() => expect(listbox).toHaveTextContent("engagement.noStaffFound"));
    expect(listbox).not.toHaveTextContent(GERENTE.label);
  });

  // ── #6: seleccionar sigue funcionando ───────────────────────────────────────────────────
  it("seleccionar un candidato lo fija en el campo", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);
    await openCombobox("engagement.selectEncargado");
    await user.click(await screen.findByText(SEMISENIOR.label));
    // El trigger pasa a mostrar el seleccionado en lugar del placeholder.
    await waitFor(() => {
      expect(getTriggerByText(SEMISENIOR.label)).toBeInTheDocument();
    });
    expect(screen.queryByText("engagement.selectEncargado")).toBeNull();
  });

  // ── #7 y #8: filtro por servicio ────────────────────────────────────────────────────────
  it("restringe al servicio del encargo: un Socio de otro servicio no aparece", async () => {
    const otroServicio = opt("p2", "Pedro OtroServicio", SVC_CONSULT);
    mockCandidates.partnerDirectorOptions = [SOCIO, otroServicio];
    // Modo edición: `practica: 1` viene del encargo, así que el servicio queda determinado
    // (SVC_AUDIT) sin depender del efecto de auto-asignación de los no-admin.
    render(<EngagementForm engagement={baseEngagement} />);
    // El form.reset del encargo corre en un efecto; esperar a que se haya aplicado.
    await waitFor(() =>
      expect(screen.getByDisplayValue("Auditoría Acme 2026")).toBeInTheDocument()
    );
    const listbox = await openCombobox("engagement.selectSqr");
    expect(listbox).toHaveTextContent(SOCIO.label);
    expect(listbox).not.toHaveTextContent(otroServicio.label);
  });

  it("sin práctica elegida (admin en creación) no filtra por servicio, pero sí por rol", async () => {
    mockIsAdmin = true;
    const otroServicio = opt("p2", "Pedro OtroServicio", SVC_CONSULT);
    mockCandidates.partnerDirectorOptions = [SOCIO, otroServicio];
    render(<EngagementForm />);
    const listbox = await openCombobox("engagement.selectPartner");
    expect(listbox).toHaveTextContent(SOCIO.label);
    expect(listbox).toHaveTextContent(otroServicio.label);
    // El filtro por rol sigue vigente.
    expect(listbox).not.toHaveTextContent(GERENTE.label);
  });

  // ── #9: merge del valor histórico ───────────────────────────────────────────────────────
  it("en edición conserva visible al asignado histórico que ya no califica", async () => {
    // Caso real: partner_id apunta a alguien sin role_key, así que el RPC no lo devuelve.
    const historico = { staff_id: "hist", first_name: "Hugo", last_name: "Historico" };
    mockCandidates.partnerDirectorOptions = [DIRECTOR];
    render(
      <EngagementForm
        engagement={{ ...baseEngagement, partner_id: historico.staff_id, partner: historico as any }}
      />
    );
    // El trigger muestra su nombre, no el placeholder de campo vacío.
    await waitFor(() => {
      expect(getTriggerByText("Hugo Historico")).toBeInTheDocument();
    });
    expect(screen.queryByText("engagement.selectPartner")).toBeNull();
  });

  it("el histórico de un campo no se filtra al conjunto de otro campo", async () => {
    const historico = { staff_id: "hist", first_name: "Hugo", last_name: "Historico" };
    mockCandidates.partnerDirectorOptions = [DIRECTOR];
    render(
      <EngagementForm
        engagement={{ ...baseEngagement, partner_id: historico.staff_id, partner: historico as any }}
      />
    );
    // Hugo se fusionó en Socio/Director, pero Encargado no debe ofrecerlo.
    expect(await openCombobox("engagement.selectEncargado")).not.toHaveTextContent("Hugo Historico");
  });

  // ── #10: consistencia creación / edición ────────────────────────────────────────────────
  it("aplica el mismo criterio en edición que en creación", async () => {
    render(<EngagementForm engagement={baseEngagement} />);
    expectOnly(await openCombobox("engagement.selectSqr"), [SOCIO.label, DIRECTOR.label]);
  });

  // ── Review de Greptile: servicio sin resolver ⇒ fail-closed, no lista completa ───────────
  it("si el catálogo no resuelve la práctica, el selector queda vacío en vez de mostrar de más", async () => {
    // El encargo tiene practica = 1 (Auditoría) pero el catálogo solo trae el code 3. Antes,
    // `engagementServiceId` caía a null y eso DESACTIVABA el filtro, ofreciendo personal de
    // cualquier servicio; una selección hecha en esa ventana se guardaba contra el servicio
    // equivocado. Ahora es fail-closed.
    mockServicesData = [mockServices[1]]; // solo Consultoría (code 3)
    render(<EngagementForm engagement={baseEngagement} />);
    const listbox = await openCombobox("engagement.selectSqr");
    expectOnly(listbox, []);
  });

  // ── Review de Codex: valores rancios al cambiar de servicio ──────────────────────────────
  //
  // OJO con la forma de aserción: mirar el trigger NO sirve. Sin limpiar el formulario, el
  // trigger igual muestra el placeholder — porque `StaffCombobox` resuelve la etiqueta con
  // `options.find(...)` y el UUID rancio ya no está en `options`. Ese es justamente el bug:
  // el campo se ve vacío mientras el valor sigue en React Hook Form. Hay que inspeccionar el
  // VALOR: en un campo opcional se ve por el check de `No Aplica`, que solo está marcado
  // cuando el valor es null.
  const noAplicaCheck = (listbox: HTMLElement) =>
    within(listbox).getByText("engagement.noAplica").closest("[role='option']")?.querySelector("svg");

  it("cambiar el servicio limpia el VALOR del personal que dejó de ser elegible", async () => {
    // Admin en creación: sin práctica no se filtra por servicio, así que puede elegir a alguien
    // de Consultoría y después fijar la práctica en Auditoría. Sin la limpieza, su UUID quedaría
    // en RHF y `create_engagement_with_code` no valida alineación staff/servicio: se persistiría
    // una asignación cruzada.
    mockIsAdmin = true;
    const seniorConsult = opt("sc", "Sonia Consultoria", SVC_CONSULT);
    mockCandidates.encargadoOptions = [SENIOR, seniorConsult];
    const user = userEvent.setup();
    render(<EngagementForm />);

    // 1) Sin práctica, el Senior de Consultoría se ofrece y se elige.
    await openCombobox("engagement.selectEncargado");
    await user.click(await screen.findByText(seniorConsult.label));
    await waitFor(() => expect(getTriggerByText(seniorConsult.label)).toBeInTheDocument());
    // Con un valor elegido, `No Aplica` NO está marcado.
    expect(noAplicaCheck(await openCombobox(seniorConsult.label))).toHaveClass("opacity-0");
    await user.keyboard("{Escape}");

    // 2) El Admin fija la práctica en Auditoría.
    await user.click(screen.getByLabelText(/engagement\.practica/));
    await user.click(await screen.findByRole("option", { name: "Auditoría" }));

    // 3) Esperar a que el filtro se haya aplicado — señal: el trigger volvió al placeholder.
    //    (Ojo: esto pasa CON y SIN el fix, así que no alcanza como aserción; ver abajo.)
    //    No abrir el popover dentro del waitFor: cada reintento lo abriría de nuevo.
    await waitFor(() =>
      expect(screen.getByText("engagement.selectEncargado")).toBeInTheDocument()
    );

    // Y acá la aserción que sí distingue: el VALOR quedó en null, así que `No Aplica` está
    // marcado. Sin la limpieza el UUID rancio seguiría en RHF y el check estaría en opacity-0.
    expect(noAplicaCheck(await openCombobox("engagement.selectEncargado"))).toHaveClass(
      "opacity-100"
    );
  });

  it("cambiar el servicio NO limpia a quien sigue siendo elegible", async () => {
    // Guard contra over-clearing: el efecto solo debe tocar los valores que dejaron de calificar.
    mockIsAdmin = true;
    const user = userEvent.setup();
    render(<EngagementForm />);

    // SENIOR es de Auditoría, así que sobrevive a fijar la práctica en Auditoría.
    await openCombobox("engagement.selectEncargado");
    await user.click(await screen.findByText(SENIOR.label));
    await waitFor(() => expect(getTriggerByText(SENIOR.label)).toBeInTheDocument());

    await user.click(screen.getByLabelText(/engagement\.practica/));
    await user.click(await screen.findByRole("option", { name: "Auditoría" }));

    await waitFor(() => expect(getTriggerByText(SENIOR.label)).toBeInTheDocument());
    expect(noAplicaCheck(await openCombobox(SENIOR.label))).toHaveClass("opacity-0");
  });

  // ── Review de Codex: el aviso debe dirigir a roles, no a categorías ─────────────────────
  it("sin candidatos obligatorios avisa por ROLES, no por categorías", async () => {
    // Seguir el mensaje viejo ("agregue categorías en Configuración") no habilitaba nada: la
    // elegibilidad depende de user_roles.role_key.
    mockCandidates.partnerDirectorOptions = [];
    mockCandidates.managerRoleOptions = [];
    mockCandidates.hasPartnerDirectorCandidates = false;
    mockCandidates.hasManagerCandidates = false;
    render(<EngagementForm />);
    expect(screen.getByText(/messages\.missingTeamRoles/)).toBeInTheDocument();
    expect(screen.queryByText(/messages\.missingCategories/)).toBeNull();
  });

  it("con candidatos en los dos campos obligatorios no muestra el aviso", () => {
    render(<EngagementForm />);
    expect(screen.queryByText(/messages\.missingTeamRoles/)).toBeNull();
  });

  // ── Review de Codex: fallo de carga ≠ roles faltantes ────────────────────────────────────
  it("si el RPC falla avisa error de carga, NO que falten roles", () => {
    // Escenario real: frontend desplegado antes de aplicar la migración. El hook devuelve
    // buckets vacíos con isError, y mandar al usuario a asignar roles que quizá ya existen es
    // una instrucción equivocada.
    mockCandidates.partnerDirectorOptions = [];
    mockCandidates.managerRoleOptions = [];
    mockCandidates.hasPartnerDirectorCandidates = false;
    mockCandidates.hasManagerCandidates = false;
    mockCandidates.isError = true;
    render(<EngagementForm />);
    expect(screen.getByText(/messages\.teamCandidatesLoadError/)).toBeInTheDocument();
    expect(screen.queryByText(/messages\.missingTeamRoles/)).toBeNull();
  });

  it("el error de carga también se muestra en modo edición", () => {
    // Review de Codex: en edición los selectores quedan vacíos (solo `withSavedStaff` rescata al
    // asignado actual), así que el editor no puede elegir reemplazo. Sin este aviso no tendría
    // ninguna explicación. El aviso de roles faltantes sí queda solo en creación.
    mockCandidates.partnerDirectorOptions = [];
    mockCandidates.managerRoleOptions = [];
    mockCandidates.hasPartnerDirectorCandidates = false;
    mockCandidates.hasManagerCandidates = false;
    mockCandidates.isError = true;
    render(<EngagementForm engagement={baseEngagement} />);
    expect(screen.getByText(/messages\.teamCandidatesLoadError/)).toBeInTheDocument();
    expect(screen.queryByText(/messages\.missingTeamRoles/)).toBeNull();
  });

  it("mientras carga no afirma que falten roles", () => {
    mockCandidates.partnerDirectorOptions = [];
    mockCandidates.managerRoleOptions = [];
    mockCandidates.hasPartnerDirectorCandidates = false;
    mockCandidates.hasManagerCandidates = false;
    mockCandidates.isLoading = true;
    render(<EngagementForm />);
    expect(screen.queryByText(/messages\.missingTeamRoles/)).toBeNull();
    expect(screen.queryByText(/messages\.teamCandidatesLoadError/)).toBeNull();
  });

  // ── Sin datos: nunca se degrada a mostrar de más ─────────────────────────────────────────
  it("sin candidatos el selector queda vacío — no cae a la nómina completa", async () => {
    mockCandidates.specialistTaxOptions = [];
    render(<EngagementForm />);
    const listbox = await openCombobox("engagement.selectSpecialistTax1");
    expectOnly(listbox, []);
    // Solo queda No Aplica.
    expect(listbox).toHaveTextContent("engagement.noAplica");
  });
});

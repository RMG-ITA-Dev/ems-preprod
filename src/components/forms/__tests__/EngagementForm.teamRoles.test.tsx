import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
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
 *
 * ACTUALIZADO 2026-08-27 (decisión del operador): el filtro ADICIONAL por práctica/servicio del
 * encargo (que este mismo archivo probaba en su versión original) se retiró — la firma tiene 4
 * Socios que manejan de todo, ninguno "asignado" a una práctica en particular, así que ese filtro
 * dejaba Socio/Director/SQR/Gerente/Encargado/Especialistas vacíos para cualquier creador cuya
 * práctica de ficha no tuviera un candidato con esa misma práctica — no solo para Talento Humano.
 * La elegibilidad depende ÚNICAMENTE del rol (lo que este archivo sigue cubriendo). Los tests que
 * ejercitaban específicamente el filtro por servicio (restricción por practica_id, fail-closed por
 * servicio sin resolver, limpieza de valores al cambiar de práctica) se eliminaron junto con el
 * código que probaban — ver EngagementForm.tsx (`serviceFilter`/`filterByService`, removidos) y
 * src/lib/engagementTeamCandidates.ts (`filterByService`/`ServiceFilter`, removidos).
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
  { practica_id: SVC_AUDIT,   name: "Auditoría",   code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
  { practica_id: SVC_CONSULT, name: "Consultoría", code: 3, allows_rates_activities: true, is_active: true, created_at: "" },
];

const stableClients = [{ client_id: "c1", client_legal_name: "Acme Corp", is_active: true }];
const stableEmpty: never[] = [];

// Mutable para poder simular un catálogo que no resuelve la práctica (fail-closed).
let mockServicesData: typeof mockServices | undefined = mockServices;

// BUG 0817-180: debe incluir "soc-1", el society_id usado por `mockStaffRecordForProfile` más
// abajo — un Select de Sociedad sin <SelectItem> para el valor sembrado deja el formulario
// `isDirty` pese al `shouldDirty: false` de la siembra (ver el mismo fix en
// EngagementForm.selfAssignment.test.tsx).
const mockSocieties = [{ society_id: "soc-1", name: "Sociedad Uno", is_active: true, created_at: "" }];

vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
  useServices: () => ({ data: mockServicesData }),
  useTaxonomies: () => ({ data: stableEmpty }),
  useSocieties: () => ({ data: mockSocieties }),
  useEngagementAssignments: () => ({ data: stableEmpty, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableEmpty }),
  useActiveStaffWithSkills: () => ({ data: stableEmpty }),
  useCategories: () => ({ data: stableEmpty }),
}));

// BUG 0817-180: `staffRecord` mutable, null por default. OJO — no basta con "cualquier perfil
// completo": role_key "manager" (el que usa `mockIsAdmin=false` en este archivo) también
// autoasigna manager_id (BUG 0810-172, ver src/lib/engagementSelfAssignment.ts) en cuanto
// `staffRecord.staff_id` existe, lo que activaría de rebote una función AJENA al alcance de esta
// suite (0722-162, filtrado del bloque Equipo) y rompería los tests que asumen el campo Gerente
// libre con su placeholder. Por eso el default es null y `mockRoleKeyOverride` existe para que un
// test puntual pida una ficha completa sin heredar ese efecto de rebote.
//
// ACTUALIZADO 0828-185: `ita_manager`/`tax_manager` YA NO sirven como rol "neutral" para eso —
// desde este fix también están en SELF_ASSIGN_MANAGER_ROLE_KEYS (se autoasignan a manager_id
// igual que Gerente). Ningún test de este archivo usa `mockRoleKeyOverride` hoy; si se necesitara
// un rol con `engagement.create` que siga sin autoasignarse, usar `admin` (vía `mockIsAdmin`) en
// vez de `mockRoleKeyOverride`.
let mockStaffRecordForProfile: { staff_id: string; society_id: string; practica_id: string; city: string } | null = null;
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: mockStaffRecordForProfile }),
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
// BUG 0817-180: solo para los dos tests que ejercitan el guard de perfil, sin afectar al resto
// (que sigue leyendo mockIsAdmin, sin cambios).
let mockRoleKeyOverride: string | null = null;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: () => true,
    roleKey: mockRoleKeyOverride ?? (mockIsAdmin ? "admin" : "manager"),
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
    isFetching: false,
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
    mockRoleKeyOverride = null;
    mockStaffRecordForProfile = null;
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

  it("tras elegir un reemplazo válido, el histórico inelegible deja de ofrecerse", async () => {
    // Review de Codex: el merge existe para no perder de vista lo guardado, no para volver
    // elegible a alguien que no califica. Si siguiera en la lista se lo podría re-seleccionar y
    // persistir, y el update path no valida elegibilidad.
    const historico = { staff_id: "hist", first_name: "Hugo", last_name: "Historico" };
    mockCandidates.encargadoOptions = [SENIOR];
    const user = userEvent.setup();
    render(
      <EngagementForm
        engagement={{
          ...baseEngagement,
          encargado_id: historico.staff_id,
          encargado: historico as any,
        }}
      />
    );

    // 1) Al abrir, el histórico está visible porque sigue siendo el valor del campo.
    let listbox = await openCombobox("Hugo Historico");
    expect(listbox).toHaveTextContent("Hugo Historico");
    expect(listbox).toHaveTextContent(SENIOR.label);

    // 2) El editor elige un reemplazo elegible.
    await user.click(await screen.findByText(SENIOR.label));
    await waitFor(() => expect(getTriggerByText(SENIOR.label)).toBeInTheDocument());

    // 3) Reabrir: el histórico ya no se ofrece.
    listbox = await openCombobox(SENIOR.label);
    expect(listbox).not.toHaveTextContent("Hugo Historico");
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

  it("mientras refetchea en background no afirma que falten roles ni deja crear", () => {
    // El caso que trajo la review: hay datos en cache (isLoading false) pero se están
    // revalidando. Ofrecer y permitir enviar ese conjunto viejo es lo que se evita.
    mockCandidates.isFetching = true;
    render(<EngagementForm />);
    expect(screen.queryByText(/messages\.missingTeamRoles/)).toBeNull();
    expect(screen.getByText("engagement.createEngagement").closest("button")).toBeDisabled();
  });

  // ── Review de Codex: en edición tampoco debe poder elegirse con datos sin resolver ───────
  it("en edición bloquea los selectores durante el refetch, pero deja guardar el resto", async () => {
    // Tras una mutación de personal o de roles la query queda stale; al montar hay un refetch en
    // background sirviendo el conjunto viejo. Se bloquean los SELECTORES, no el guardado: en
    // edición, impedir Guardar dejaría sin poder editar nombre, fechas o políticas, que no tienen
    // relación con el bloque Equipo.
    mockCandidates.isFetching = true;
    render(<EngagementForm engagement={baseEngagement} />);
    await waitFor(() =>
      expect(getTriggerByText("engagement.selectSqr")).toBeDisabled()
    );
    expect(getTriggerByText("engagement.selectEncargado")).toBeDisabled();
    // Guardar sigue habilitado: el resto del encargo se puede editar.
    expect(screen.getByText("common.saveChanges").closest("button")).not.toBeDisabled();
  });

  it("con los candidatos resueltos los selectores están habilitados", async () => {
    // Guard contra over-blocking.
    render(<EngagementForm />);
    await waitFor(() =>
      expect(getTriggerByText("engagement.selectSqr")).not.toBeDisabled()
    );
  });

  it("mientras carga no afirma que falten roles", () => {
    mockCandidates.partnerDirectorOptions = [];
    mockCandidates.managerRoleOptions = [];
    mockCandidates.hasPartnerDirectorCandidates = false;
    mockCandidates.hasManagerCandidates = false;
    mockCandidates.isFetching = true;
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

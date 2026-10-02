import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays, addYears, format } from "date-fns";

// Computed at run time (not hardcoded) so the non-admin "no backdating" guard in
// EngagementForm (start_date >= today) never trips as the test suite ages.
const ENGAGEMENT_START_DATE = format(addDays(new Date(), 1), "yyyy-MM-dd");
const ENGAGEMENT_END_DATE = format(addYears(addDays(new Date(), 1), 1), "yyyy-MM-dd");

/**
 * BUG 0817-180 — sociedad/práctica/oficina de un encargo se restringen a la ficha del creador.
 * Un creador restringido (role_key distinto de admin/senior_partner) no elige estos tres campos:
 * se derivan de staff.society_id / staff.practica_id -> practicas.code / staff.city -> oficina
 * (La Paz=1, Santa Cruz=2), se muestran deshabilitados, y sin ficha completa se bloquea la
 * creación (fail-closed). admin y senior_partner conservan la elección libre.
 *
 * Espejo de BUG 0810-172 en su mocking: `useCurrentStaff` y `useAuthorization` son mutables
 * (perfil + rol), porque son las entradas del comportamiento bajo prueba.
 */

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

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: any) => (
    <input
      data-testid="calendar-mock"
      type="date"
      onChange={(e) => e.target.value && onSelect(new Date(e.target.value + "T12:00:00"))}
    />
  ),
}));
vi.mock("@/components/ui/popover", () => ({
  Popover:        ({ children }: any) => <>{children}</>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <>{children}</>,
}));

const SVC_AUDIT = "svc-audit";
const SVC_TAX = "svc-tax";
const mockServices = [
  { practica_id: SVC_AUDIT, name: "Auditoría",     code: 1, allows_rates_activities: true,  is_active: true,  created_at: "" },
  { practica_id: SVC_TAX,   name: "Tax",           code: 3, allows_rates_activities: true,  is_active: true,  created_at: "" },
];

const SOCIETY_A = { society_id: "soc-a", name: "Sociedad A", is_active: true, created_at: "" };
const SOCIETY_B = { society_id: "soc-b", name: "Sociedad B", is_active: true, created_at: "" };
const mockSocieties = [SOCIETY_A, SOCIETY_B];

const stableClients = [
  { client_id: "client-1", client_legal_name: "Test Client", is_active: true },
  // BUG 0922-195: segundo cliente, usado por la suite de initialClientId más abajo para
  // ejercitar "la hidratación tardía no pisa una selección manual" contra un valor distinto.
  { client_id: "client-2", client_legal_name: "Other Client", is_active: true },
  // BUG 0922-195 (review H1): cliente INACTIVO — el botón "Nuevo Encargo" de
  // ClientEngagementsTable.tsx solo se gatea por engagement.create, no por is_active, así que
  // este cliente igual llega por deep-link con initialClientId.
  { client_id: "client-3", client_legal_name: "Inactive Client", is_active: false },
];
// Función queda fija en Cliente para un creador restringido (cambio suelto, 2026-08-26) —
// Cliente exige una taxonomía real (0602-136, "No aplica" queda oculto), así que el fixture
// de submit completo la necesita.
const mockTaxonomies = [{ taxonomy_id: "tax-1", code: "T1", name: "Test Taxonomy", practica_id: null, is_active: true, created_at: "" }];
const stableAssignments: never[] = [];
const stableAggregatedReqs: never[] = [];
const stableActiveStaff: never[] = [];
const stableCategories: never[] = [];
// BUG 0922-195: mutable on purpose — the initialClientId suite below drives useClients() from
// undefined (pending) to resolved on the same mounted instance, same convention as `clientsData`
// in EngagementForm.hydration-race.test.tsx. Reset to `stableClients` in every beforeEach so the
// pre-existing tests in this file (synchronous by assumption) are unaffected.
let clientsData: typeof stableClients | undefined = stableClients;
// BUG 0922-195 (review H3): mutable on purpose — lets one test simulate useSocieties() failing
// (exhausted retries), distinct from "still loading".
let societiesIsError = false;
// BUG 0922-195 (review H8): decoupled from societiesIsError on purpose — TanStack Query keeps
// `data` from the last successful fetch even when a later background refetch fails (verified in
// query-core/src/query.ts: the 'error' reducer case never touches `data`), so a test needs to be
// able to set isError:true WITH data still populated (stale-but-valid cache survives a failed
// background refresh). Defaults to mockSocieties so existing tests are unaffected.
let societiesDataForMock: typeof mockSocieties | undefined = mockSocieties;
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: clientsData }),
  useServices: () => ({ data: mockServices }),
  useTaxonomies: () => ({ data: mockTaxonomies }),
  useSocieties: () => ({
    data: societiesDataForMock,
    isError: societiesIsError,
  }),
  useEngagementAssignments: () => ({ data: stableAssignments, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableAggregatedReqs }),
  useActiveStaffWithSkills: () => ({ data: stableActiveStaff }),
  useCategories: () => ({ data: stableCategories }),
}));

// ── Rol del usuario actual (mutable) ───────────────────────────────────────────────────────────
let mockRoleKey = "manager";
let mockRoleLoading = false;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: () => true,
    roleKey: mockRoleKey,
    isLoading: mockRoleLoading,
  }),
}));

// ── Ficha del usuario actual (mutable) ─────────────────────────────────────────────────────────
type MockStaffRecord = { staff_id: string; society_id: string | null; practica_id: string | null; city: string | null };
let mockStaffRecord: MockStaffRecord | null = null;
let mockStaffLoading = false;
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: mockStaffRecord, isLoading: mockStaffLoading }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [], partnerOptions: [], managerOptions: [], allActiveStaff: [],
    hasPartnerCategory: true, hasManagerCategory: true,
  }),
}));

const stableTeamCandidates = {
  partnerDirectorOptions: [{ value: "p1", label: "Juan Partner", serviceId: SVC_TAX }],
  managerRoleOptions: [{ value: "m1", label: "Ana Manager", serviceId: SVC_TAX }],
  encargadoOptions: [],
  specialistItOptions: [],
  specialistTaxOptions: [],
  hasPartnerDirectorCandidates: true,
  hasManagerCandidates: true,
  isLoading: false,
  isError: false,
};
vi.mock("@/hooks/useEngagementTeamCandidates", () => ({
  useEngagementTeamCandidates: () => stableTeamCandidates,
}));

const mockCreateMutateAsync = vi.fn();
vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

const mockContractUpload = vi.fn().mockResolvedValue({ data: { path: "contracts/1-abc.pdf" }, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: vi.fn(() => ({ upload: mockContractUpload })) },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

function makePdfFile(name = "contrato.pdf", sizeBytes = 1024) {
  return new File([new Uint8Array(sizeBytes)], name, { type: "application/pdf" });
}

vi.mock("@/components/forms/EngagementCreatedDialog", () => ({
  EngagementCreatedDialog: ({ open, onCreateAnother }: any) =>
    open ? (
      <button type="button" onClick={onCreateAnother}>
        engagement.createAnother
      </button>
    ) : null,
}));

import { EngagementForm } from "@/components/forms/EngagementForm";

const restrictedStaff: MockStaffRecord = {
  staff_id: "staff-restricted",
  society_id: SOCIETY_A.society_id,
  practica_id: SVC_TAX,
  city: "Santa Cruz",
};

describe("EngagementForm — profile-scoped sociedad/práctica/oficina (BUG 0817-180)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoleKey = "manager";
    mockRoleLoading = false;
    mockStaffRecord = restrictedStaff;
    mockStaffLoading = false;
    clientsData = stableClients;
    societiesIsError = false;
    societiesDataForMock = mockSocieties;
  });

  it("creador restringido: sociedad/práctica/oficina se derivan de la ficha (Sociedad A / Tax code 3 / oficina 2)", async () => {
    render(<EngagementForm />);

    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Sociedad A");
    });
    expect(screen.getByLabelText(/engagement\.practica/)).toHaveTextContent("Tax");
    expect(screen.getByLabelText(/engagement\.oficina/)).toHaveTextContent("engagement.oficina_santaCruz");
  });

  it("los tres controles quedan deshabilitados para el creador restringido", async () => {
    render(<EngagementForm />);
    await waitFor(() => expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Sociedad A"));

    expect(screen.getByLabelText(/engagement\.society/)).toBeDisabled();
    expect(screen.getByLabelText(/engagement\.practica/)).toBeDisabled();
    expect(screen.getByLabelText(/engagement\.oficina/)).toBeDisabled();
  });

  // BUG 0922-195 (review H3, chatgpt-codex-connector): profileError no incluía societiesError —
  // un fallo real de useSocieties() (no "sigue cargando") dejaba Sociedad vacía/deshabilitada
  // pero profileBlocksCreation en false, así que Crear Encargo quedaba habilitado sin ningún
  // aviso del error de catálogo.
  it("fallo de useSocieties() sin catálogo utilizable muestra el aviso de error y bloquea Crear Encargo (BUG 0922-195)", async () => {
    societiesIsError = true;
    societiesDataForMock = undefined;
    render(<EngagementForm />);

    await waitFor(() => {
      expect(screen.getByText("messages.profileLoadError")).toBeInTheDocument();
    });
    expect(screen.getByText("engagement.createEngagement").closest("button")).toBeDisabled();
  });

  // BUG 0922-195 (review H8, greptile): un refresco en segundo plano fallido de useSocieties() deja
  // isError:true SIN borrar el catálogo ya cargado (TanStack Query conserva `data` de la última
  // carga exitosa — verificado en query-core/src/query.ts, el reducer del caso 'error' nunca toca
  // `data`). Antes del fix, esto bloqueaba igual la creación aunque Sociedad A siguiera disponible.
  it("fallo de useSocieties() con catálogo aún en caché NO bloquea Crear Encargo (BUG 0922-195)", async () => {
    societiesIsError = true;
    societiesDataForMock = mockSocieties;
    render(<EngagementForm />);

    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Sociedad A");
    });
    expect(screen.queryByText("messages.profileLoadError")).not.toBeInTheDocument();
    expect(screen.getByText("engagement.createEngagement").closest("button")).not.toBeDisabled();
  });

  it("la siembra no marca el formulario como sucio", async () => {
    const onDirtyChange = vi.fn();
    render(<EngagementForm onDirtyChange={onDirtyChange} />);
    await waitFor(() => expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Sociedad A"));
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  it("admin puede elegir los tres valores libremente y no ve el Alert de perfil incompleto", async () => {
    mockRoleKey = "admin";
    mockStaffRecord = null;
    const user = userEvent.setup();
    render(<EngagementForm />);

    const societySelect = screen.getByLabelText(/engagement\.society/);
    expect(societySelect).not.toBeDisabled();
    await user.click(societySelect);
    await waitFor(() => screen.getByRole("option", { name: "Sociedad A" }));
    expect(screen.getByRole("option", { name: "Sociedad B" })).toBeInTheDocument();

    expect(screen.getByLabelText(/engagement\.practica/)).not.toBeDisabled();
    expect(screen.getByLabelText(/engagement\.oficina/)).not.toBeDisabled();
    expect(screen.queryByText(/messages\.profileIncompleteForEngagement/)).toBeNull();
  });

  it("senior_partner también elige libremente (exención escrita aunque hoy sea inalcanzable sin engagement.create — ver plan_v2 OQ2/OQ6)", async () => {
    mockRoleKey = "senior_partner";
    mockStaffRecord = null;
    render(<EngagementForm />);

    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.society/)).not.toBeDisabled();
    });
    expect(screen.getByLabelText(/engagement\.practica/)).not.toBeDisabled();
    expect(screen.getByLabelText(/engagement\.oficina/)).not.toBeDisabled();
  });

  it("sin ficha de personal: Alert de perfil incompleto y Crear deshabilitado; createMutation nunca se invoca", async () => {
    mockStaffRecord = null;
    const user = userEvent.setup();
    render(<EngagementForm />);

    await waitFor(() => {
      expect(screen.getByText(/messages\.profileIncompleteForEngagement/)).toBeInTheDocument();
    });
    const createButton = screen.getByText("engagement.createEngagement").closest("button");
    expect(createButton).toBeDisabled();
    await user.click(createButton!);
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it("sin ciudad en la ficha: bloquea igual que sin ficha", async () => {
    mockStaffRecord = { staff_id: "staff-no-city", society_id: SOCIETY_A.society_id, practica_id: SVC_TAX, city: null };
    render(<EngagementForm />);

    await waitFor(() => {
      expect(screen.getByText(/messages\.profileIncompleteForEngagement/)).toBeInTheDocument();
    });
    expect(screen.getByText("engagement.createEngagement").closest("button")).toBeDisabled();
  });

  it("práctica de la ficha no resuelve en el catálogo (inexistente/inactiva): bloquea la creación", async () => {
    mockStaffRecord = { staff_id: "staff-bad-practica", society_id: SOCIETY_A.society_id, practica_id: "svc-does-not-exist", city: "La Paz" };
    render(<EngagementForm />);

    await waitFor(() => {
      expect(screen.getByText(/messages\.profileIncompleteForEngagement/)).toBeInTheDocument();
    });
    expect(screen.getByText("engagement.createEngagement").closest("button")).toBeDisabled();
  });

  it("durante la carga (staff o rol) no expone controles editables ni permite enviar", async () => {
    mockStaffLoading = true;
    render(<EngagementForm />);

    expect(screen.getByLabelText(/engagement\.society/)).toBeDisabled();
    expect(screen.getByText("engagement.createEngagement").closest("button")).toBeDisabled();
    // Fail-closed silencioso: mientras carga no se afirma todavía qué falta.
    expect(screen.queryByText(/messages\.profileIncompleteForEngagement/)).toBeNull();
  });

  it("'Crear otro' restaura los mismos valores de perfil derivados de la ficha", async () => {
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue({ engagement_code: "2027.231.001", engagement_id: "eng-1" });
    render(<EngagementForm />);

    await waitFor(() => expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Sociedad A"));

    await user.type(screen.getByLabelText(/engagement\.name/), "Test Engagement Alpha");

    const clientSelect = screen.getByLabelText(/engagement\.client/);
    await user.click(clientSelect);
    await waitFor(() => screen.getByRole("option", { name: "Test Client" }));
    await user.click(screen.getByRole("option", { name: "Test Client" }));

    const partnerSelect = screen.getByLabelText(/engagement\.partner/);
    await user.click(partnerSelect);
    await waitFor(() => screen.getAllByRole("option", { name: "Juan Partner" }));
    await user.click(screen.getAllByRole("option", { name: "Juan Partner" })[0]);

    const managerSelect = screen.getByLabelText(/engagement\.manager/);
    await user.click(managerSelect);
    await waitFor(() => screen.getByRole("option", { name: "Ana Manager" }));
    await user.click(screen.getByRole("option", { name: "Ana Manager" }));

    const calendars = screen.getAllByTestId("calendar-mock");
    fireEvent.change(calendars[0], { target: { value: ENGAGEMENT_START_DATE } });
    fireEvent.change(calendars[1], { target: { value: ENGAGEMENT_END_DATE } });

    // Cambio suelto 2026-08-26: función también queda fija (Cliente) para un creador
    // restringido — no hace falta seleccionarla; Cliente exige una taxonomía real (0602-136).
    expect(screen.getByLabelText(/engagement\.funcion/)).toHaveTextContent("engagement.funcion_cli");
    await user.click(screen.getByTestId("taxonomy-combobox-trigger"));
    await waitFor(() => screen.getByText("Test Taxonomy"));
    await user.click(screen.getByText("Test Taxonomy"));

    const closingDate = screen.getByRole("combobox", { name: "engagement.closingDate *" });
    await user.click(closingDate);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("option")[0]);

    const contractInput = document.getElementById("engagement-contract-upload") as HTMLInputElement;
    fireEvent.change(contractInput, { target: { files: [makePdfFile()] } });
    await waitFor(() => expect(mockContractUpload).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("engagement.createEngagement"));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalled();
    });
    // El payload enviado contiene los valores resueltos del perfil.
    const [[payload]] = mockCreateMutateAsync.mock.calls;
    expect(payload).toMatchObject({ society_id: "soc-a", practica: 3, oficina: 2 });

    await waitFor(() => screen.getByText("engagement.createAnother"));
    await user.click(screen.getByText("engagement.createAnother"));

    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Sociedad A");
    });
    expect(screen.getByLabelText(/engagement\.practica/)).toHaveTextContent("Tax");
    expect(screen.getByLabelText(/engagement\.oficina/)).toHaveTextContent("engagement.oficina_santaCruz");
  }, 15000);
});

/**
 * BUG 0922-195 (Defecto 2) — hidratación de `initialClientId` (deep-link cliente -> "Nuevo
 * Encargo", ClientEngagementsTable.tsx:245 -> EngagementNew.tsx). Se agrega a este archivo por
 * plan_v2 (§e): comparte el mismo patrón de "efecto que espera a un catálogo tardío" que el resto
 * de esta suite, y reutiliza `stableClients`/`client-2` de arriba.
 */
describe("EngagementForm — initialClientId deep-link hydration (BUG 0922-195, Defecto 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoleKey = "manager";
    mockRoleLoading = false;
    mockStaffRecord = restrictedStaff;
    mockStaffLoading = false;
    clientsData = stableClients;
  });

  it("Cliente queda preseleccionado una vez que useClients() resuelve ese client_id, si resuelve tarde", async () => {
    clientsData = undefined;
    const { rerender } = render(<EngagementForm initialClientId="client-1" />);

    expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("engagement.selectClient");

    clientsData = stableClients;
    rerender(<EngagementForm initialClientId="client-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("Test Client");
    });
  });

  it("una selección manual de Cliente no es sobrescrita por la hidratación tardía de initialClientId", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<EngagementForm initialClientId="client-1" />);

    // La hidratación corre apenas `clients` está disponible (ya resuelto desde el montaje en
    // este caso) y siembra "client-1" primero.
    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("Test Client");
    });

    // El usuario cambia manualmente a otro cliente.
    await user.click(screen.getByLabelText(/engagement\.client/));
    await waitFor(() => screen.getByRole("option", { name: "Other Client" }));
    await user.click(screen.getByRole("option", { name: "Other Client" }));
    expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("Other Client");

    // Un refetch en segundo plano de `clients` (nueva referencia, mismos datos) no debe
    // reintentar la hidratación y revertir la elección manual del usuario — el ref de
    // inicialización ya quedó marcado la primera vez.
    clientsData = [...stableClients];
    rerender(<EngagementForm initialClientId="client-1" />);

    expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("Other Client");
  });

  it("sin initialClientId, Cliente permanece vacío y libremente seleccionable", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("engagement.selectClient");

    await user.click(screen.getByLabelText(/engagement\.client/));
    await waitFor(() => screen.getByRole("option", { name: "Test Client" }));
    await user.click(screen.getByRole("option", { name: "Test Client" }));
    expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("Test Client");
  });

  it("onDirtyChange no reporta true por la hidratación del sistema", async () => {
    const onDirtyChange = vi.fn();
    render(<EngagementForm initialClientId="client-1" onDirtyChange={onDirtyChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("Test Client");
    });
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  // BUG 0922-195 (review H1, greptile): un cliente inactivo deep-linkeado se preseleccionaba en
  // RHF pero el <Select> no tenía su <SelectItem> (clientOptions solo incluía activos), así que
  // Radix disparaba onValueChange("") y lo perdía en silencio. Confirmado con el operador: debe
  // autocompletarse igual (editable a mano), no bloquearse ni perderse.
  it("un cliente inactivo deep-linkeado se preselecciona igual, y sigue siendo editable a mano (BUG 0922-195)", async () => {
    const user = userEvent.setup();
    render(<EngagementForm initialClientId="client-3" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("Inactive Client");
    });

    // Sigue siendo editable: el usuario puede cambiarlo a otro cliente sin que nada lo bloquee.
    await user.click(screen.getByLabelText(/engagement\.client/));
    await waitFor(() => screen.getByRole("option", { name: "Test Client" }));
    await user.click(screen.getByRole("option", { name: "Test Client" }));
    expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("Test Client");
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

const stableClients = [{ client_id: "client-1", client_legal_name: "Test Client", is_active: true }];
const stableTaxonomies: never[] = [];
const stableAssignments: never[] = [];
const stableAggregatedReqs: never[] = [];
const stableActiveStaff: never[] = [];
const stableCategories: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
  useServices: () => ({ data: mockServices }),
  useTaxonomies: () => ({ data: stableTaxonomies }),
  useSocieties: () => ({ data: mockSocieties }),
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
    fireEvent.change(calendars[0], { target: { value: "2026-10-01" } });
    fireEvent.change(calendars[1], { target: { value: "2027-09-30" } });

    const funcion = screen.getByLabelText(/engagement\.funcion/);
    await user.click(funcion);
    await waitFor(() => screen.getByRole("option", { name: "engagement.funcion_adm" }));
    await user.click(screen.getByRole("option", { name: "engagement.funcion_adm" }));

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

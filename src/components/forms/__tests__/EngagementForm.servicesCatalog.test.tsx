import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * 0625-149: EngagementForm — catalog-driven practica select.
 * Verifies active-only options in create mode and name resolution in edit mode.
 *
 * 0625-148: role-based service restriction.
 * Non-admins get Auditoría (code=1) auto-assigned; select is disabled.
 */

// Radix Select requires pointer-capture and scroll APIs in JSDOM
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
// JSDOM defines scrollIntoView as non-callable; override unconditionally
Element.prototype.scrollIntoView = () => {};
// Radix Switch (admin section) uses ResizeObserver — polyfill for JSDOM
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

const mockServices = [
  { practica_id: "s1", name: "Auditoría",         code: 1, allows_rates_activities: true,  is_active: true,  created_at: "" },
  { practica_id: "s2", name: "Tax",               code: 3, allows_rates_activities: true,  is_active: true,  created_at: "" },
  { practica_id: "s3", name: "Firmwide (inactivo)", code: 0, allows_rates_activities: false, is_active: false, created_at: "" },
];

// Module-level controllable create mock (Review 2 — test #5)
const mockCreateMutateAsync = vi.fn();

// Stable references: a fresh [] literal returned on every call gives StaffAssignmentsCard's
// reseed-while-clean effect a new `assignments` identity on every render (its dep array
// includes it), triggering setDrafts/setBaseline in a loop — same "infinite loop" lesson already
// documented above for allServices/allTaxonomies, now applying to the Fase 5 read hooks too.
const stableClientList = [{ client_id: "c1", client_legal_name: "Acme Corp", is_active: true }];
const stableAssignments: never[] = [];
const stableAggregatedReqs: never[] = [];
const stableActiveStaff: never[] = [];
const stableCategories: never[] = [];
const mockSocieties = [
  { society_id: "soc-1", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "" },
  { society_id: "soc-2", name: "Ruizmier Jauregui S.R.L.", is_active: true, created_at: "" },
];
// 0722-157: "Ir a Matriz de Trabajo forwards..." exercises funcion=Cliente, which requires a
// real taxonomy pick (0602-136) — "No aplica" is hidden for Cliente.
const mockTaxonomies = [
  { taxonomy_id: "tax-1", code: "T1", name: "Test Taxonomy", practica_id: null, is_active: true, created_at: "" },
];
vi.mock("@/hooks/useEmsData", () => ({
  useClients:  () => ({ data: stableClientList }),
  useServices: () => ({ data: mockServices }),
  useTaxonomies: () => ({ data: mockTaxonomies }),
  useSocieties: () => ({ data: mockSocieties }),
  // Fase 5: EngagementForm now mounts StaffAssignmentsCard in edit mode, which pulls these.
  useEngagementAssignments: () => ({ data: stableAssignments, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableAggregatedReqs }),
  useActiveStaffWithSkills: () => ({ data: stableActiveStaff }),
  useCategories: () => ({ data: stableCategories }),
}));

// BUG #0625-151 added useCurrentStaff (→ useAuth) to EngagementForm; mock it so the
// component doesn't require a real AuthProvider.
// BUG 0817-180: controllable (vi.fn(), like useUserRole below) — defaults to a complete
// profile (society_id="soc-1" Ruizmier Pelaez, practica_id="s1" Auditoría code=1, city="La
// Paz" -> oficina 1) so the non-admin "0625-148" suite exercises a creator whose ficha
// resolves cleanly, matching what those tests already assumed as the auto-filled practica.
vi.mock("@/hooks/useCurrentStaff", () => ({ useCurrentStaff: vi.fn() }));

// BUG #0625-151: creating a client (non-internal) engagement uploads a scanned contract via
// Supabase Storage before submit. Stub Storage so the upload resolves in tests.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: { path: "contracts/test.pdf" }, error: null }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://example/x" }, error: null }),
      }),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// 0722-160: los dos clientes internos controlados que devuelve
// list_administrative_internal_clients(). Sin este mock el hook resuelve undefined (el vi.mock
// de Storage de mas abajo pisa al del cliente de Supabase y deja `rpc` sin definir), y el
// formulario no tiene ningun cliente valido que ofrecer en una funcion administrativa.
// `vi.hoisted` porque vi.mock se iza por encima de los const del modulo.
const { mockInternalClients } = vi.hoisted(() => ({
  mockInternalClients: [
    { client_id: "int-pelaez", client_legal_name: "Ruizmier Pelaez S.R.L.", unique_tax_id: "1006979026", is_active: true },
    { client_id: "int-jauregui", client_legal_name: "Ruizmier Jauregui S.R.L.", unique_tax_id: "184046021", is_active: true },
  ],
}));
vi.mock("@/hooks/useAdministrativeEngagements", () => ({
  useAdministrativeEngagements: () => ({ data: [], isLoading: false }),
  useAdministrativeInternalClients: () => ({ data: mockInternalClients, isLoading: false }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [{ staff_id: "p1", first_name: "Juan", last_name: "Partner" }],
    partnerOptions: [{ value: "p1", label: "Juan Partner" }],
    managerOptions: [{ value: "m1", label: "Ana Manager" }],
    allActiveStaff: [{ value: "x1", label: "Staff One" }, { value: "x2", label: "Staff Two" }],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

// BUG 0722-162: el bloque Equipo pasó a alimentarse de useEngagementTeamCandidates (RPC), así
// que sin este mock el hook real golpearía Supabase.
// Estos tests hacen submit completo, así que Socio y Gerente deben ser seleccionables.
// `serviceId: "s1"` es el servicio de Auditoría (code 1) de mockServices: los no-admin lo reciben
// auto-asignado en creación, y el filtro por servicio descartaría candidatos de otro practica_id.
const stableTeamCandidates = {
  partnerDirectorOptions: [{ value: "p1", label: "Juan Partner", serviceId: "s1" }],
  managerRoleOptions: [{ value: "m1", label: "Ana Manager", serviceId: "s1" }],
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

vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: vi.fn() }));
// EngagementForm deriva `isAdmin` de role_key (no del enum legacy), asi que el
// roleKey de este mock es el que decide admin vs no-admin. Se ata al mismo
// isAdmin que ya usaban estos tests para no cambiar lo que ejercitan.
vi.mock("@/hooks/useAuthorization", async () => {
  const { useUserRole } = await import("@/hooks/useUserRole");
  return {
    useAuthorization: () => ({
      can: () => true,
      roleKey: (useUserRole() as unknown as { isAdmin?: boolean })?.isAdmin
        ? "admin"
        : "manager",
    }),
  };
});

// 0625-151: creating a non-internal engagement now requires an uploaded contract file.
const mockContractUpload = vi.fn().mockResolvedValue({ data: { path: "contracts/1-abc.pdf" }, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ upload: mockContractUpload })),
    },
  },
}));

function makePdfFile(name = "contrato.pdf", sizeBytes = 1024) {
  return new File([new Uint8Array(sizeBytes)], name, { type: "application/pdf" });
}

// Mock Calendar with a simple date input so date fields can be set via fireEvent (Review 2)
vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: any) => (
    <input
      data-testid="calendar-mock"
      type="date"
      onChange={(e) => e.target.value && onSelect(new Date(e.target.value + "T12:00:00"))}
    />
  ),
}));

// Mock Popover to always render its children so Calendar inputs are reachable (Review 2)
vi.mock("@/components/ui/popover", () => ({
  Popover:        ({ children }: any) => <>{children}</>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <>{children}</>,
}));

// Minimal EngagementCreatedDialog mock — renders the "crear otro" button when open (Review 2).
// 0722-157: honors showGoToWorkMatrix so tests can verify the real hide/show wiring, not just
// that the callback works once clicked.
vi.mock("@/components/forms/EngagementCreatedDialog", () => ({
  EngagementCreatedDialog: ({ open, clientName, showGoToWorkMatrix, onCreateAnother, onGoToWorkMatrix }: any) =>
    open ? (
      <>
        {/* 0722-160 (review fix, Codex): el nombre del cliente se expone para poder afirmar que
            un encargo administrativo no abre el modal con el cliente en blanco. */}
        <span data-testid="created-client-name">{clientName}</span>
        <button type="button" onClick={onCreateAnother}>
          engagement.createAnother
        </button>
        {showGoToWorkMatrix && (
          <button type="button" onClick={onGoToWorkMatrix}>
            engagement.goToWorkMatrix
          </button>
        )}
      </>
    ) : null,
}));

import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

const completeStaffRecord = {
  staff_id: "staff-self",
  society_id: "soc-1",
  practica_id: "s1",
  city: "La Paz",
};

// Edit-mode engagement whose service (code=0) is now inactive
const mockEngagementInactiveService: Engagement = {
  engagement_id:       "eng-test-2",
  client_id:           "client-1",
  engagement_name:     "Old Firmwide Audit",
  engagement_code:     "2026.011.002",
  partner_id:          null,
  manager_id:          null,
  status:              "active",
  start_date:          "2025-10-01",
  end_date:            "2026-09-30",
  created_at:          "2025-10-01T00:00:00Z",
  work_order_required: true,
  activity_required:   true,
  is_internal:         false,
  approval_required:   true,
  oficina:             0,
  practica:            0,
  funcion:             1,
  anio_fiscal:         2026,
  taxonomy_id:         null,
  society_id:          null,
};

// 0722-160 (review fix, Codex): encargo ADMINISTRATIVO en edicion, de la sociedad soc-2
// (Jauregui). `completeStaffRecord` pone al editor en soc-1 (Pelaez) a proposito: la sociedad de
// referencia para filtrar los clientes internos es la del ENCARGO, no la de la ficha de quien
// edita, porque en edicion `society_id` no viaja en el payload salvo para Admin (0722-157).
const mockEngagementAdministrative: Engagement = {
  engagement_id:       "eng-adm-1",
  client_id:           "int-jauregui",
  engagement_name:     "Administrativa Jauregui",
  engagement_code:     "2026.010.003",
  partner_id:          null,
  manager_id:          null,
  status:              "active",
  start_date:          "2025-10-01",
  end_date:            "2026-09-30",
  created_at:          "2025-10-01T00:00:00Z",
  work_order_required: true,
  activity_required:   false,
  is_internal:         true,
  approval_required:   true,
  oficina:             1,
  practica:            1,
  funcion:             0,
  anio_fiscal:         2026,
  taxonomy_id:         null,
  society_id:          "soc-2",
};

describe("EngagementForm — catalog-driven practica (0625-149)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: false, isLoading: false } as any);
    vi.mocked(useCurrentStaff).mockReturnValue({ staffRecord: completeStaffRecord } as any);
  });

  it("renders the practica select label in create mode", () => {
    render(<EngagementForm />);
    expect(screen.getByText((_, el) => el?.textContent === "engagement.practica *")).toBeInTheDocument();
  });

  it("code-preview block still present in create mode", () => {
    render(<EngagementForm />);
    expect(screen.getByTestId("engagement-code-preview")).toBeInTheDocument();
  });

  it("in edit mode code is read-only (disabled input)", () => {
    render(<EngagementForm engagement={mockEngagementInactiveService} />);
    const codeInput = screen.getByTestId("engagement-code-readonly");
    expect(codeInput).toBeDisabled();
    expect(codeInput).toHaveValue("2026.011.002");
  });

  it("in edit mode inactive service name is resolved and shown in the disabled select", () => {
    render(<EngagementForm engagement={mockEngagementInactiveService} />);
    // practica=0 maps to "Firmwide (inactivo)" — resolved from full service list.
    // Radix renders the selected label in both the visible trigger span and a hidden
    // native <select>, so getAllByText returns multiple nodes — at least one must be present.
    expect(screen.getAllByText("Firmwide (inactivo)").length).toBeGreaterThan(0);
  });

  it("create mode: opening the practica select shows only active services", async () => {
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: true, isLoading: false } as any);
    const user = userEvent.setup();
    render(<EngagementForm />);

    // Find the practica select trigger via its label
    const practica = screen.getByLabelText(/engagement\.practica/);
    await user.click(practica);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Auditoría" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Tax" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Firmwide (inactivo)" })).not.toBeInTheDocument();
    });
  });

  it("selecting an active service in create mode stores its numeric code", async () => {
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: true, isLoading: false } as any);
    const user = userEvent.setup();
    render(<EngagementForm />);

    const practica = screen.getByLabelText(/engagement\.practica/);
    await user.click(practica);

    // Select "Auditoría" (code=1)
    await waitFor(() => screen.getByRole("option", { name: "Auditoría" }));
    await user.click(screen.getByRole("option", { name: "Auditoría" }));

    // After selection the trigger should reflect the chosen service name
    await waitFor(() => {
      expect(practica).toHaveTextContent("Auditoría");
    });
  });
});

describe("0625-148 — role-based service restriction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: false, isLoading: false } as any);
    // BUG 0817-180: sociedad/practica/oficina de un creador no-admin ahora se derivan de su
    // ficha (ya no hay elección libre ni el default fijo de Auditoría de 0625-148).
    vi.mocked(useCurrentStaff).mockReturnValue({ staffRecord: completeStaffRecord } as any);
  });

  it("non-admin: practica select is visible but disabled", async () => {
    render(<EngagementForm />);
    const practica = screen.getByLabelText(/engagement\.practica/);
    await waitFor(() => {
      expect(practica).toBeDisabled();
    });
  });

  it("non-admin: practica is auto-set to Auditoría without user interaction", async () => {
    render(<EngagementForm />);
    const practica = screen.getByLabelText(/engagement\.practica/);
    await waitFor(() => {
      expect(practica).toHaveTextContent("Auditoría");
    });
  });

  // Review 1 (actualizado por BUG 0817-180): oficina ya no es de elección libre para un
  // creador no-admin — se deriva de staff.city ("La Paz" -> 1), igual que practica. Función
  // tampoco lo es ya (cambio suelto, 2026-08-26): queda fija en Cliente (1) para cualquiera
  // que no sea admin/hr_manager/hr_analyst.
  it("non-admin: code preview uses digit 1 for practica, oficina and función (todas derivadas/fijas)", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    // Wait for practica/oficina auto-assignment from the staff record (code=1 "Auditoría" /
    // city "La Paz" -> oficina 1); función queda fija en Cliente (1) para este rol.
    const practica = screen.getByLabelText(/engagement\.practica/);
    await waitFor(() => expect(practica).toHaveTextContent("Auditoría"));
    const oficina = screen.getByLabelText(/engagement\.oficina/);
    await waitFor(() => expect(oficina).toBeDisabled());
    expect(oficina).toHaveTextContent("engagement.oficina_laPaz");
    const funcion = screen.getByLabelText(/engagement\.funcion/);
    await waitFor(() => expect(funcion).toBeDisabled());
    expect(funcion).toHaveTextContent("engagement.funcion_cli");

    // 0604-143: the preview also requires a closing date; pick whichever option comes first.
    // anio_fiscal is auto-defaulted; oficina=1, practica=1, funcion=1 → "YYYY.111.---"
    const closingDate = screen.getByRole("combobox", { name: "engagement.closingDate *" });
    await user.click(closingDate);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("option")[0]);

    const preview = screen.getByTestId("engagement-code-preview");
    await waitFor(() => {
      expect(preview).toHaveTextContent(/\d{4}\.111\.---/);
    });
  });

  it("admin: practica select is enabled", async () => {
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: true, isLoading: false } as any);
    render(<EngagementForm />);
    const practica = screen.getByLabelText(/engagement\.practica/);
    await waitFor(() => {
      expect(practica).not.toBeDisabled();
    });
  });

  // Review 2: wire create mutation, submit a valid form, click "crear otro", assert reset state
  // Extended timeout: drives many sequential Selects (client/partner/manager/oficina/funcion/
  // closingDate) plus the create-and-reset round trip, which is slow with real timers.
  it("non-admin 'crear otro': after reset, practica/oficina/sociedad are re-seeded from the ficha and disabled", async () => {
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue({ engagement_code: "2026.011.001" });

    render(<EngagementForm />);

    // Fill engagement name (min 5 chars)
    await user.type(screen.getByLabelText(/engagement\.name/), "Test Engagement Alpha");

    // Select client
    const clientSelect = screen.getByLabelText(/engagement\.client/);
    await user.click(clientSelect);
    await waitFor(() => screen.getByRole("option", { name: "Acme Corp" }));
    await user.click(screen.getByRole("option", { name: "Acme Corp" }));

    // Select partner
    const partnerSelect = screen.getByLabelText(/engagement\.partner/);
    await user.click(partnerSelect);
    // BUG 0722-162: Socio/Director y SQR comparten el conjunto de candidatos (ambos piden Socio
    // o Director), y el mock de Popover de arriba renderiza todos los popovers a la vez — así que
    // "Juan Partner" aparece dos veces. El [0] es el del campo Socio/Director, que va primero.
    await waitFor(() => screen.getAllByRole("option", { name: "Juan Partner" }));
    await user.click(screen.getAllByRole("option", { name: "Juan Partner" })[0]);

    // Select manager
    const managerSelect = screen.getByLabelText(/engagement\.manager/);
    await user.click(managerSelect);
    await waitFor(() => screen.getByRole("option", { name: "Ana Manager" }));
    await user.click(screen.getByRole("option", { name: "Ana Manager" }));

    // Set start and end dates via the mocked Calendar inputs (always visible via Popover mock)
    const calendars = screen.getAllByTestId("calendar-mock");
    fireEvent.change(calendars[0], { target: { value: "2026-10-01" } });
    fireEvent.change(calendars[1], { target: { value: "2027-09-30" } });

    // BUG 0817-180 / cambio suelto 2026-08-26: oficina, sociedad y función ya no son de
    // elección libre para un no-admin — vienen pre-llenadas/fijas desde la ficha y el rol
    // (oficina "La Paz" -> 1, soc-1, función Cliente).
    await waitFor(() => expect(screen.getByLabelText(/engagement\.oficina/)).toBeDisabled());
    await waitFor(() => expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Ruizmier Pelaez S.R.L."));
    expect(screen.getByLabelText(/engagement\.funcion/)).toHaveTextContent("engagement.funcion_cli");

    // 0602-136: función Cliente exige una taxonomía real ("No aplica" queda oculto para Cliente).
    await user.click(screen.getByTestId("taxonomy-combobox-trigger"));
    await waitFor(() => screen.getByText("Test Taxonomy"));
    await user.click(screen.getByText("Test Taxonomy"));

    // 0604-143: closing date is required before the form can be submitted.
    const closingDate = screen.getByRole("combobox", { name: "engagement.closingDate *" });
    await user.click(closingDate);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("option")[0]);

    // 0625-151: upload the (now mandatory) scanned contract before submitting.
    const contractInput = document.getElementById("engagement-contract-upload") as HTMLInputElement;
    fireEvent.change(contractInput, { target: { files: [makePdfFile()] } });
    await waitFor(() => expect(mockContractUpload).toHaveBeenCalledTimes(1));

    // practica is auto-assigned to Auditoría; submit
    await user.click(screen.getByText("engagement.createEngagement"));

    // EngagementCreatedDialog mock renders once createdInfo is set
    await waitFor(() => {
      expect(screen.getByText("engagement.createAnother")).toBeInTheDocument();
    });

    // handleCreateAnother: resets form, then re-seeds practica/oficina/sociedad from the ficha
    await user.click(screen.getByText("engagement.createAnother"));

    const practica = screen.getByLabelText(/engagement\.practica/);
    await waitFor(() => {
      expect(practica).toHaveTextContent("Auditoría");
      expect(practica).toBeDisabled();
    });

    // BUG 0817-180: "crear otro" re-siembra sociedad/oficina desde la ficha — a diferencia del
    // comportamiento pre-0817-180 (elección libre reseteada a vacío), un creador restringido
    // nunca queda sin estos tres campos.
    expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Ruizmier Pelaez S.R.L.");
    expect(screen.getByLabelText(/engagement\.oficina/)).toHaveTextContent("engagement.oficina_laPaz");
  }, 15000);

  // 0722-157: "Ir a Matriz de Trabajo" must forward the just-created engagement_id so
  // /worksheets/new can preselect it instead of making the user search for it again.
  // 0722-157: the button (and this whole flow) only appears for funcion=Cliente, which in
  // turn requires a real taxonomy pick (0602-136 — "No aplica" is hidden for Cliente).
  it("'Ir a Matriz de Trabajo' forwards the created engagement_id (funcion=Cliente)", async () => {
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue({ engagement_code: "2026.011.001", engagement_id: "eng-abc" });
    const onGoToWorkMatrix = vi.fn();

    render(<EngagementForm onGoToWorkMatrix={onGoToWorkMatrix} />);

    await user.type(screen.getByLabelText(/engagement\.name/), "Test Engagement Alpha");

    const clientSelect = screen.getByLabelText(/engagement\.client/);
    await user.click(clientSelect);
    await waitFor(() => screen.getByRole("option", { name: "Acme Corp" }));
    await user.click(screen.getByRole("option", { name: "Acme Corp" }));

    const partnerSelect = screen.getByLabelText(/engagement\.partner/);
    await user.click(partnerSelect);
    // BUG 0722-162: Socio/Director y SQR comparten el conjunto de candidatos, y el mock de
    // Popover renderiza todos los popovers a la vez — "Juan Partner" aparece dos veces. El [0]
    // es el del campo Socio/Director, que va primero (mismo patrón que la prueba de arriba).
    await waitFor(() => screen.getAllByRole("option", { name: "Juan Partner" }));
    await user.click(screen.getAllByRole("option", { name: "Juan Partner" })[0]);

    const managerSelect = screen.getByLabelText(/engagement\.manager/);
    await user.click(managerSelect);
    await waitFor(() => screen.getByRole("option", { name: "Ana Manager" }));
    await user.click(screen.getByRole("option", { name: "Ana Manager" }));

    const calendars = screen.getAllByTestId("calendar-mock");
    fireEvent.change(calendars[0], { target: { value: "2026-10-01" } });
    fireEvent.change(calendars[1], { target: { value: "2027-09-30" } });

    // BUG 0817-180 / cambio suelto 2026-08-26: oficina, sociedad y función ya no son de
    // elección libre para un no-admin — función queda fija en Cliente (1), que es justo lo
    // que este test necesita, así que no hace falta seleccionarla a mano.
    await waitFor(() => expect(screen.getByLabelText(/engagement\.oficina/)).toBeDisabled());
    await waitFor(() => expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Ruizmier Pelaez S.R.L."));
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
      expect(screen.getByText("engagement.goToWorkMatrix")).toBeInTheDocument();
    });
    await user.click(screen.getByText("engagement.goToWorkMatrix"));

    expect(onGoToWorkMatrix).toHaveBeenCalledWith("eng-abc");
  }, 15000);

  // 0722-157: Administrativa/Capacitación/Control de Calidad don't budget hours in the Work
  // Matrix — the button must not appear at all for a non-Cliente engagement.
  it("hides 'Ir a Matriz de Trabajo' when the created engagement is funcion=Administrativa", async () => {
    // Cambio suelto 2026-08-26: función Administrativa ya no es alcanzable para un no-admin
    // (queda fija en Cliente) — este test necesita justo una función NO-Cliente, así que pasa
    // a ejercitarse como admin (que sigue con elección libre en sociedad/oficina/práctica/función).
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: true, isLoading: false } as any);
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue({ engagement_code: "2026.011.002", engagement_id: "eng-def" });

    render(<EngagementForm />);

    await user.type(screen.getByLabelText(/engagement\.name/), "Test Engagement Beta");

    const clientSelect = screen.getByLabelText(/engagement\.client/);
    await user.click(clientSelect);
    await waitFor(() => screen.getByRole("option", { name: "Acme Corp" }));
    await user.click(screen.getByRole("option", { name: "Acme Corp" }));

    const partnerSelect = screen.getByLabelText(/engagement\.partner/);
    await user.click(partnerSelect);
    // BUG 0722-162: Socio/Director y SQR comparten el conjunto de candidatos, y el mock de
    // Popover renderiza todos los popovers a la vez — "Juan Partner" aparece dos veces. El [0]
    // es el del campo Socio/Director, que va primero (mismo patrón que la prueba de arriba).
    await waitFor(() => screen.getAllByRole("option", { name: "Juan Partner" }));
    await user.click(screen.getAllByRole("option", { name: "Juan Partner" })[0]);

    const managerSelect = screen.getByLabelText(/engagement\.manager/);
    await user.click(managerSelect);
    await waitFor(() => screen.getByRole("option", { name: "Ana Manager" }));
    await user.click(screen.getByRole("option", { name: "Ana Manager" }));

    const calendars = screen.getAllByTestId("calendar-mock");
    fireEvent.change(calendars[0], { target: { value: "2026-10-01" } });
    fireEvent.change(calendars[1], { target: { value: "2027-09-30" } });

    // admin: sociedad/oficina/práctica siguen siendo de elección libre.
    const oficina = screen.getByLabelText(/engagement\.oficina/);
    await user.click(oficina);
    await waitFor(() => screen.getByRole("option", { name: "engagement.oficina_ambos" }));
    await user.click(screen.getByRole("option", { name: "engagement.oficina_ambos" }));

    const society = screen.getByLabelText(/engagement\.society/);
    await user.click(society);
    await waitFor(() => screen.getByRole("option", { name: "Ruizmier Pelaez S.R.L." }));
    await user.click(screen.getByRole("option", { name: "Ruizmier Pelaez S.R.L." }));

    const practica = screen.getByLabelText(/engagement\.practica/);
    await user.click(practica);
    await waitFor(() => screen.getByRole("option", { name: "Auditoría" }));
    await user.click(screen.getByRole("option", { name: "Auditoría" }));

    const funcion = screen.getByLabelText(/engagement\.funcion/);
    await user.click(funcion);
    await waitFor(() => screen.getByRole("option", { name: "engagement.funcion_adm" }));
    await user.click(screen.getByRole("option", { name: "engagement.funcion_adm" }));

    // 0722-160: al cruzar a una función administrativa, un cliente externo deja de ser elegible
    // y el formulario lo limpia — hay que elegir uno de los dos clientes internos controlados.
    await waitFor(() => expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("engagement.selectClient"));
    await user.click(screen.getByLabelText(/engagement\.client/));
    await waitFor(() => screen.getByRole("option", { name: /Ruizmier Pelaez S\.R\.L\./ }));
    await user.click(screen.getByRole("option", { name: /Ruizmier Pelaez S\.R\.L\./ }));

    const closingDate = screen.getByRole("combobox", { name: "engagement.closingDate *" });
    await user.click(closingDate);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("option")[0]);

    const contractInput = document.getElementById("engagement-contract-upload") as HTMLInputElement;
    fireEvent.change(contractInput, { target: { files: [makePdfFile()] } });
    await waitFor(() => expect(mockContractUpload).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("engagement.createEngagement"));

    await waitFor(() => {
      expect(screen.getByText("engagement.createAnother")).toBeInTheDocument();
    });
    expect(screen.queryByText("engagement.goToWorkMatrix")).not.toBeInTheDocument();

    // 0722-160 (review fix, Codex): el resumen resolvia el cliente contra clientOptions, que
    // nunca contiene a los clientes internos — vienen del RPC list_administrative_internal_clients.
    // Para hr_manager/hr_analyst (engagement.create sin client.read) clientOptions ademas viene
    // vacio, asi que el modal mostraba el cliente en blanco pese a haberse guardado bien.
    expect(screen.getByTestId("created-client-name")).toHaveTextContent("Ruizmier Pelaez S.R.L.");
  }, 15000);

  // 0722-160 (review fix, Codex): elegir una función administrativa y volver a Cliente dejaba
  // `is_internal` encendido para siempre — el efecto lo escribía al entrar y nadie lo apagaba al
  // salir. Consecuencia: un encargo de Cliente se creaba como interno y, de paso, se salteaba el
  // contrato obligatorio (que sólo se exige para Cliente NO interno). Hoy el valor se DERIVA de
  // la función, así que no queda estado viejo que limpiar.
  it("no deja is_internal encendido al volver de una función administrativa a Cliente", async () => {
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: true, isLoading: false } as any);
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue({ engagement_code: "2026.011.003", engagement_id: "eng-ghi" });

    render(<EngagementForm />);

    await user.type(screen.getByLabelText(/engagement\.name/), "Vuelta a Cliente");

    const clientSelect = screen.getByLabelText(/engagement\.client/);
    await user.click(clientSelect);
    await waitFor(() => screen.getByRole("option", { name: "Acme Corp" }));
    await user.click(screen.getByRole("option", { name: "Acme Corp" }));

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

    const oficina = screen.getByLabelText(/engagement\.oficina/);
    await user.click(oficina);
    await waitFor(() => screen.getByRole("option", { name: "engagement.oficina_ambos" }));
    await user.click(screen.getByRole("option", { name: "engagement.oficina_ambos" }));

    // La sociedad se elige ANTES de pasar por Administrativa: en función administrativa el
    // selector queda bloqueado porque lo deriva el cliente interno (review fix, Codex).
    const society = screen.getByLabelText(/engagement\.society/);
    await user.click(society);
    await waitFor(() => screen.getByRole("option", { name: "Ruizmier Pelaez S.R.L." }));
    await user.click(screen.getByRole("option", { name: "Ruizmier Pelaez S.R.L." }));

    const practica = screen.getByLabelText(/engagement\.practica/);
    await user.click(practica);
    await waitFor(() => screen.getByRole("option", { name: "Auditoría" }));
    await user.click(screen.getByRole("option", { name: "Auditoría" }));

    // Ida: función administrativa -> el encargo pasa a interno.
    const funcion = screen.getByLabelText(/engagement\.funcion/);
    await user.click(funcion);
    await waitFor(() => screen.getByRole("option", { name: "engagement.funcion_adm" }));
    await user.click(screen.getByRole("option", { name: "engagement.funcion_adm" }));
    await waitFor(() => expect(screen.getByLabelText(/engagement\.society/)).toBeDisabled());

    // El cruce limpia el cliente externo: ya no es elegible en una función administrativa.
    await waitFor(() => expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("engagement.selectClient"));

    // Vuelta: Cliente otra vez.
    await user.click(screen.getByLabelText(/engagement\.funcion/));
    await waitFor(() => screen.getByRole("option", { name: "engagement.funcion_cli" }));
    await user.click(screen.getByRole("option", { name: "engagement.funcion_cli" }));

    await user.click(screen.getByLabelText(/engagement\.client/));
    await waitFor(() => screen.getByRole("option", { name: "Acme Corp" }));
    await user.click(screen.getByRole("option", { name: "Acme Corp" }));

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

    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalled());
    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ funcion: 1, is_internal: false, client_id: "c1" }),
    );
  }, 20000);
});


// 0722-160 (review fix, Codex): el filtro de clientes internos por sociedad corria solo en el
// ALTA. En EDICION el selector de cliente sigue habilitado (solo lo apaga `readOnly`), pero el de
// sociedad esta deshabilitado para un no-admin y `society_id` no viaja en el payload (0722-157),
// y el efecto que deriva la sociedad del cliente no corre en edicion. Ofrecer el cliente interno
// de la otra sociedad era ofrecer una opcion que enforce_administrative_engagement_rules()
// rechaza siempre.
describe("0722-160 — clientes internos filtrados por sociedad en EDICION", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: false, isLoading: false } as any);
    vi.mocked(useCurrentStaff).mockReturnValue({ staffRecord: completeStaffRecord } as any);
  });

  it("no-admin: solo ofrece el cliente interno de la sociedad DEL ENCARGO, no el de su propia ficha", async () => {
    const user = userEvent.setup();
    render(<EngagementForm engagement={mockEngagementAdministrative} />);

    await user.click(screen.getByLabelText(/engagement\.client/));

    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    // El encargo es de soc-2 (Jauregui) y la ficha del editor es soc-1 (Pelaez): gana el encargo.
    expect(screen.getByRole("option", { name: /Ruizmier Jauregui S\.R\.L\./ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Ruizmier Pelaez S\.R\.L\./ })).not.toBeInTheDocument();
  });

  it("admin: sigue viendo los dos, porque es quien repara un par cliente/sociedad historico", async () => {
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: true, isLoading: false } as any);
    const user = userEvent.setup();
    render(<EngagementForm engagement={mockEngagementAdministrative} />);

    await user.click(screen.getByLabelText(/engagement\.client/));

    await waitFor(() => screen.getByRole("option", { name: /Ruizmier Jauregui S\.R\.L\./ }));
    expect(screen.getByRole("option", { name: /Ruizmier Pelaez S\.R\.L\./ })).toBeInTheDocument();
  });
});

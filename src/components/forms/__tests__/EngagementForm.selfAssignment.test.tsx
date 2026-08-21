import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * BUG 0810-172 — al CREAR un encargo, el Socio/Director o el Gerente que lo crea se autoasigna en
 * su campo y ese campo queda bloqueado. El admin conserva control total.
 *
 * El discriminador es `role_key` (decisión del operador 2026-08-17). Consecuencia declarada: hoy
 * solo `manager` tiene a la vez `engagement.create` y un grupo de candidatura, así que la rama
 * Socio/Director se ejercita acá y en los unit tests, pero en la app real no tiene camino hasta que
 * la matriz de permisos otorgue `engagement.create` a partner/director.
 *
 * Harness clonado de EngagementForm.teamRoles.test.tsx (0722-162), que queda intacto como suite de
 * regresión. Diferencia: acá `useCurrentStaff` y `useAuthorization` son mutables (rol + estado de
 * carga), porque son justamente las entradas del comportamiento nuevo.
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

// code=1 es AUDITORIA_SERVICE_CODE: los no-admin lo reciben auto-asignado en creación, así que el
// filtro por servicio queda activo y resuelto en SVC_AUDIT.
const SVC_AUDIT = "svc-audit";
const SVC_CONSULT = "svc-consult";
const mockServices = [
  { service_id: SVC_AUDIT,   name: "Auditoría",   code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
  { service_id: SVC_CONSULT, name: "Consultoría", code: 3, allows_rates_activities: true, is_active: true, created_at: "" },
];

const stableClients = [{ client_id: "c1", client_legal_name: "Acme Corp", is_active: true }];
const stableEmpty: never[] = [];

vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
  useServices: () => ({ data: mockServices }),
  useTaxonomies: () => ({ data: stableEmpty }),
  useSocieties: () => ({ data: stableEmpty }),
  useEngagementAssignments: () => ({ data: stableEmpty, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableEmpty }),
  useActiveStaffWithSkills: () => ({ data: stableEmpty }),
  useCategories: () => ({ data: stableEmpty }),
}));

// ── Identidad del usuario actual (mutable) ─────────────────────────────────────────────────────
let mockStaffRecord: { staff_id: string; first_name: string; last_name: string } | null = null;
let mockStaffLoading = false;
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: mockStaffRecord, isLoading: mockStaffLoading }),
}));

// ── Rol del usuario actual (mutable) ───────────────────────────────────────────────────────────
let mockRoleKey: string | null = "manager";
let mockRoleLoading = false;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: () => true,
    roleKey: mockRoleKey,
    isLoading: mockRoleLoading,
  }),
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

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: any) => (
    <input
      data-testid="calendar-mock"
      type="date"
      onChange={(e) => e.target.value && onSelect(new Date(e.target.value + "T12:00:00"))}
    />
  ),
}));

// ── Candidatos ─────────────────────────────────────────────────────────────────────────────────
const opt = (value: string, label: string, serviceId: string | null = SVC_AUDIT) => ({
  value,
  label,
  serviceId,
});

const SOCIO = opt("p1", "Sonia Socia");
const DIRECTOR = opt("d1", "Dario Director");
const GERENTE = opt("m1", "Gala Gerente");
const OTRO_GERENTE = opt("m2", "Mario OtroGerente");

let mockCandidates: any;
function resetCandidates() {
  mockCandidates = {
    partnerDirectorOptions: [SOCIO, DIRECTOR],
    managerRoleOptions: [GERENTE, OTRO_GERENTE],
    encargadoOptions: [],
    specialistItOptions: [],
    specialistTaxOptions: [],
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

/** Devuelve el trigger del combobox que muestra `text` (placeholder o nombre del seleccionado). */
function getTriggerByText(text: string | RegExp): HTMLElement {
  const node = screen.getByText(text);
  return (node.closest("button") ?? node) as HTMLElement;
}

const baseEngagement: Engagement = {
  engagement_id: "eng-1",
  client_id: "c1",
  engagement_name: "Auditoría Acme 2026",
  engagement_code: "2026.111.001",
  partner_id: SOCIO.value,
  manager_id: OTRO_GERENTE.value,
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

describe("EngagementForm — autoasignación y bloqueo del creador (0810-172)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoleKey = "manager";
    mockRoleLoading = false;
    mockStaffRecord = { staff_id: GERENTE.value, first_name: "Gala", last_name: "Gerente" };
    mockStaffLoading = false;
    resetCandidates();
  });

  // ── #1 y #2: el caso central, un campo por rol ────────────────────────────────────────────
  it("Gerente: se autoasigna en Gerente/Supervisor y ese campo queda bloqueado", async () => {
    render(<EngagementForm />);

    await waitFor(() => {
      expect(getTriggerByText(GERENTE.label)).toBeInTheDocument();
    });
    expect(getTriggerByText(GERENTE.label)).toBeDisabled();
    expect(screen.queryByText("engagement.selectManager")).toBeNull();
    // El texto de ayuda explica por qué no se puede tocar.
    expect(screen.getByText("engagement.selfAssignedLocked")).toBeInTheDocument();
  });

  it("Gerente: Socio/Director sigue libre y ofreciendo sus candidatos", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);
    await waitFor(() => expect(getTriggerByText(GERENTE.label)).toBeInTheDocument());

    const partnerTrigger = getTriggerByText("engagement.selectPartner");
    expect(partnerTrigger).not.toBeDisabled();
    await user.click(partnerTrigger);
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toHaveTextContent(SOCIO.label);
    expect(listbox).toHaveTextContent(DIRECTOR.label);
  });

  it("Socio: se autoasigna en Socio/Director y Gerente sigue libre", async () => {
    mockRoleKey = "partner";
    mockStaffRecord = { staff_id: SOCIO.value, first_name: "Sonia", last_name: "Socia" };
    render(<EngagementForm />);

    await waitFor(() => expect(getTriggerByText(SOCIO.label)).toBeInTheDocument());
    expect(getTriggerByText(SOCIO.label)).toBeDisabled();
    expect(getTriggerByText("engagement.selectManager")).not.toBeDisabled();
  });

  it("Director: se autoasigna en Socio/Director (decisión del operador 2026-08-17)", async () => {
    mockRoleKey = "director";
    mockStaffRecord = { staff_id: DIRECTOR.value, first_name: "Dario", last_name: "Director" };
    render(<EngagementForm />);

    await waitFor(() => expect(getTriggerByText(DIRECTOR.label)).toBeInTheDocument());
    expect(getTriggerByText(DIRECTOR.label)).toBeDisabled();
  });

  // ── #3: el popover bloqueado no se abre ───────────────────────────────────────────────────
  it("el campo bloqueado no abre su popover al hacer click", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);
    await waitFor(() => expect(getTriggerByText(GERENTE.label)).toBeInTheDocument());

    await user.click(getTriggerByText(GERENTE.label));
    expect(screen.queryByRole("listbox")).toBeNull();
    // Y el otro Gerente nunca se ofrece.
    expect(screen.queryByText(OTRO_GERENTE.label)).toBeNull();
  });

  // ── #4: admin conserva control total ──────────────────────────────────────────────────────
  it("admin: ningún campo se autoasigna ni se bloquea", async () => {
    const user = userEvent.setup();
    mockRoleKey = "admin";
    render(<EngagementForm />);

    await waitFor(() => {
      expect(getTriggerByText("engagement.selectManager")).toBeInTheDocument();
    });
    expect(getTriggerByText("engagement.selectPartner")).not.toBeDisabled();
    expect(getTriggerByText("engagement.selectManager")).not.toBeDisabled();
    expect(screen.queryByText("engagement.selfAssignedLocked")).toBeNull();

    // Y puede elegir a cualquier Gerente, incluido uno distinto de sí mismo.
    await user.click(getTriggerByText("engagement.selectManager"));
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toHaveTextContent(OTRO_GERENTE.label);
  });

  // ── #5: solo en creación ──────────────────────────────────────────────────────────────────
  it("edición: no reemplaza ni bloquea el Gerente guardado", async () => {
    render(<EngagementForm engagement={baseEngagement} />);

    await waitFor(() =>
      expect(screen.getByDisplayValue("Auditoría Acme 2026")).toBeInTheDocument()
    );
    // El encargo tiene OTRO_GERENTE; el usuario actual es GERENTE y NO debe sustituirlo.
    await waitFor(() => expect(getTriggerByText(OTRO_GERENTE.label)).toBeInTheDocument());
    expect(getTriggerByText(OTRO_GERENTE.label)).not.toBeDisabled();
    expect(screen.queryByText("engagement.selfAssignedLocked")).toBeNull();
  });

  // ── #6 y #7: exenciones ───────────────────────────────────────────────────────────────────
  it("un rol sin campo propio (senior) no autoasigna ni bloquea nada", async () => {
    mockRoleKey = "senior";
    render(<EngagementForm />);

    await waitFor(() => {
      expect(getTriggerByText("engagement.selectManager")).toBeInTheDocument();
    });
    expect(getTriggerByText("engagement.selectPartner")).not.toBeDisabled();
    expect(getTriggerByText("engagement.selectManager")).not.toBeDisabled();
  });

  it("sin staff vinculado no autoasigna ni bloquea (protege a los tests hermanos)", async () => {
    mockStaffRecord = null;
    render(<EngagementForm />);

    await waitFor(() => {
      expect(getTriggerByText("engagement.selectManager")).toBeInTheDocument();
    });
    expect(getTriggerByText("engagement.selectManager")).not.toBeDisabled();
    expect(screen.queryByText("engagement.selfAssignedLocked")).toBeNull();
  });

  // ── #8: ventana de clasificación ──────────────────────────────────────────────────────────
  it("mientras se clasifica al usuario, los DOS campos están deshabilitados y no hay siembra", async () => {
    mockRoleLoading = true;
    render(<EngagementForm />);

    await waitFor(() => {
      expect(getTriggerByText("engagement.selectPartner")).toBeInTheDocument();
    });
    expect(getTriggerByText("engagement.selectPartner")).toBeDisabled();
    expect(getTriggerByText("engagement.selectManager")).toBeDisabled();
    // Nada sembrado todavía: sigue el placeholder, no el nombre.
    expect(screen.queryByText(GERENTE.label)).toBeNull();
    // Y no se afirma que el campo esté bloqueado por rol — todavía no se sabe.
    expect(screen.queryByText("engagement.selfAssignedLocked")).toBeNull();
  });

  it("la carga de useCurrentStaff también cuenta como ventana de clasificación", async () => {
    mockStaffLoading = true;
    render(<EngagementForm />);

    await waitFor(() => {
      expect(getTriggerByText("engagement.selectManager")).toBeInTheDocument();
    });
    expect(getTriggerByText("engagement.selectManager")).toBeDisabled();
  });

  // ── #9: el escenario que dejaría el formulario sin salida ─────────────────────────────────
  it("aunque el creador no figure entre los candidatos del servicio, se muestra y NO se borra", async () => {
    // Caso real: el Gerente es de Consultoría y el encargo es de Auditoría (forzada a los
    // no-admin). filterByService lo excluye, y sin la inyección el efecto de limpieza de 0722-162
    // borraría el valor sembrado dejando un campo obligatorio bloqueado y vacío.
    mockCandidates.managerRoleOptions = [OTRO_GERENTE];

    render(<EngagementForm />);

    await waitFor(() => {
      expect(getTriggerByText(GERENTE.label)).toBeInTheDocument();
    });
    expect(getTriggerByText(GERENTE.label)).toBeDisabled();
    // Se mantiene en el tiempo: el efecto de limpieza corre tras resolverse el servicio.
    await new Promise((r) => setTimeout(r, 50));
    expect(getTriggerByText(GERENTE.label)).toBeInTheDocument();
    expect(screen.queryByText("engagement.selectManager")).toBeNull();
  });

  it("con cero candidatos de Gerente, el campo autoasignado no cuenta como personal faltante", async () => {
    // `missingTeamRoles` mide `managerFieldOptions.length === 0`. La inyección del creador lo deja
    // en 1, así que no se avisa de personal faltante ni se bloquea la creación.
    mockCandidates.managerRoleOptions = [];

    render(<EngagementForm />);

    await waitFor(() => expect(getTriggerByText(GERENTE.label)).toBeInTheDocument());
    expect(screen.queryByText("messages.missingTeamRoles")).toBeNull();
    expect(screen.getByText("engagement.createEngagement").closest("button")).not.toBeDisabled();
  });

  it("contraste: sin creador que inyectar, cero candidatos de Gerente SÍ avisa y bloquea", async () => {
    // Mismo escenario que el test anterior salvo que no hay staff vinculado ⇒ no hay autoasignación
    // ni inyección. Es lo que prueba que la aserción de arriba no pasa en vacío.
    mockCandidates.managerRoleOptions = [];
    mockStaffRecord = null;

    render(<EngagementForm />);

    await waitFor(() => {
      expect(screen.getByText("messages.missingTeamRoles")).toBeInTheDocument();
    });
    expect(screen.getByText("engagement.createEngagement").closest("button")).toBeDisabled();
  });

  // ── #10: el valor sembrado satisface la validación ────────────────────────────────────────
  it("el valor sembrado satisface el campo obligatorio sin interacción del usuario", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);
    await waitFor(() => expect(getTriggerByText(GERENTE.label)).toBeInTheDocument());

    // Submit con el formulario vacío: Zod corre antes que cualquier guard de onSubmit.
    await user.click(screen.getByText("engagement.createEngagement"));

    await waitFor(() => {
      // partner_id sigue vacío ⇒ su error aparece.
      expect(screen.getByText("Partner/Director is required")).toBeInTheDocument();
    });
    // manager_id lo llenó el sistema ⇒ su error NO aparece. Es la prueba de que el valor sembrado
    // está realmente en React Hook Form y llega al payload por el camino normal.
    expect(screen.queryByText("Manager is required")).toBeNull();
  }, 20000);

  // ── #11: no ensucia el formulario ─────────────────────────────────────────────────────────
  it("la siembra no marca el formulario como sucio", async () => {
    const onDirtyChange = vi.fn();
    render(<EngagementForm onDirtyChange={onDirtyChange} />);

    await waitFor(() => expect(getTriggerByText(GERENTE.label)).toBeInTheDocument());
    // Se llama con false al montar; nunca con true solo por la autoasignación.
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  // ── #12: la siembra no es de un solo disparo ──────────────────────────────────────────────
  it("un formulario montado de nuevo vuelve a sembrar el campo bloqueado", async () => {
    // ALCANCE DE ESTE TEST: cubre el remonte, no el `form.reset` de `handleCreateAnother` — para
    // llegar a ese botón hace falta un submit real, que exige subir un contrato a Storage. Que el
    // reset también re-siembre depende de que el efecto liste `wPartnerId`/`wManagerId` en sus
    // dependencias (un efecto atado solo a identidades no volvería a correr con el campo en ""):
    // eso está garantizado por la lista de dependencias del efecto, no por esta aserción.
    const { unmount } = render(<EngagementForm />);
    await waitFor(() => expect(getTriggerByText(GERENTE.label)).toBeInTheDocument());
    unmount();

    render(<EngagementForm />);
    await waitFor(() => expect(getTriggerByText(GERENTE.label)).toBeInTheDocument());
    expect(getTriggerByText(GERENTE.label)).toBeDisabled();
  });

  // ── #13: los otros cuatro campos no se tocan ──────────────────────────────────────────────
  it("SQR no se bloquea aunque comparta el grupo de candidatura con Socio/Director", async () => {
    mockRoleKey = "partner";
    mockStaffRecord = { staff_id: SOCIO.value, first_name: "Sonia", last_name: "Socia" };
    render(<EngagementForm />);

    await waitFor(() => expect(getTriggerByText(SOCIO.label)).toBeInTheDocument());
    // El campo SQR sigue con su placeholder y habilitado.
    expect(getTriggerByText("engagement.selectSqr")).not.toBeDisabled();
  });
});

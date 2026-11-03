import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * BUG 0923-198 — una Fecha de Inicio histórica (anterior a `created_at`) que fijó un admin no debe
 * bloquear al resto de los editores cuando guardan OTROS campos del encargo.
 *
 * Antes del fix, `onSubmit` validaba el `start_date` hidratado contra el piso `created_at` en cada
 * submit no-admin, aunque nadie lo hubiera tocado: cambiar solo el nombre o la fecha de fin
 * terminaba en `engagement.startDateBeforeCreation`. Ahora el piso aplica solo a un valor NUEVO;
 * cualquier cambio a un día anterior a la creación sigue rechazado.
 *
 * Fechas fijas a propósito: en edición el piso es `created_at`, no "hoy", así que no caducan.
 * `end_date` queda en el futuro para que el estado efectivo no sea Finalizado (que bloquea fechas).
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

const stableClients = [{ client_id: "client-1", client_legal_name: "Sociedad Prueba", is_active: true }];
const stableSocieties = [{ society_id: "society-1", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "" }];
const stableServices = [
  { practica_id: "svc-audit", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
];
const stableTaxonomies = [
  { taxonomy_id: "tx-1", code: "AA1006", name: "Audit Engagements Regulados Nuevos", practica_id: null, is_active: true, created_at: "" },
];
const stableEmpty: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClientDirectory: () => ({ data: stableClients }),
  useServices: () => ({ data: stableServices }),
  useTaxonomies: () => ({ data: stableTaxonomies }),
  useSocieties: () => ({ data: stableSocieties }),
  useEngagementAssignments: () => ({ data: stableEmpty, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableEmpty }),
  useActiveStaffWithSkills: () => ({ data: stableEmpty }),
  useCategories: () => ({ data: stableEmpty }),
}));

const stableCandidates = {
  partnerDirectorOptions: [{ value: "staff-partner", label: "Sonia Socia", serviceId: null }],
  managerRoleOptions: [{ value: "staff-manager", label: "Gala Gerente", serviceId: null }],
  encargadoOptions: stableEmpty,
  specialistItOptions: stableEmpty,
  specialistTaxOptions: stableEmpty,
  hasPartnerDirectorCandidates: true,
  hasManagerCandidates: true,
  isLoading: false,
  isFetching: false,
  isError: false,
};
vi.mock("@/hooks/useEngagementTeamCandidates", () => ({
  useEngagementTeamCandidates: () => stableCandidates,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: vi.fn(() => ({ upload: vi.fn() })) },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

vi.mock("@/components/engagements/StaffAssignmentsCard", () => ({
  StaffAssignmentsCard: () => null,
}));

// `isAdmin` del formulario sale de `roleKey === "admin"`. "manager" = editor restringido.
let mockRoleKey = "manager";
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: mockRoleKey, isLoading: false, isFetching: false, isError: false }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

// Mismo mock de Calendar que el resto de las suites del formulario, más la captura del predicado
// `disabled` por instancia (0 = Fecha de Inicio, 1 = Fecha de Fin). El input ignora `disabled` a
// propósito: así el submit puede recibir un día que el picker real deshabilitaría y se prueba el
// guard de `onSubmit` por sí solo.
const calendarDisabled: Array<((d: Date) => boolean) | undefined> = [];
vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect, disabled }: any) => {
    calendarDisabled.push(disabled);
    return (
      <input
        data-testid="calendar-mock"
        type="date"
        onChange={(e) => e.target.value && onSelect(new Date(e.target.value + "T12:00:00"))}
      />
    );
  },
}));
vi.mock("@/components/ui/popover", () => ({
  Popover:        ({ children }: any) => <>{children}</>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <>{children}</>,
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";
import { getFiscalYearForDate } from "@/lib/fiscalCalculations";
import { parseDateLocal } from "@/lib/timesheetUtils";

// Caso de la captura: encargo de Cliente aprobado, creado el 10/09 con inicio histórico el 02/09.
const historicalEngagement: Engagement = {
  engagement_id: "eng-historical-1",
  client_id: "client-1",
  engagement_name: "AUDITORIA DE ESTADOS FINANCIEROS - SOCIEDAD PRUEBA",
  engagement_code: "2027.111.003",
  partner_id: "staff-partner",
  manager_id: "staff-manager",
  status: "active",
  start_date: "2026-09-02",
  end_date: "2027-06-30",
  created_at: "2026-09-10T15:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 1,
  practica: 1,
  funcion: 1,
  anio_fiscal: getFiscalYearForDate(parseDateLocal("2026-12-31")),
  fecha_cierre: "2026-12-31",
  anio_fiscal_override: false,
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  taxonomy_id: "tx-1",
  contract_file_path: null,
  society_id: "society-1",
  engagement_state_override: null,
  work_order: { approval_status: "Approved", approved_at: "2026-09-10T16:00:00Z", risk_status: "Approved" },
};

const startCalendar = () => screen.getAllByTestId("calendar-mock")[0];
const endCalendar = () => screen.getAllByTestId("calendar-mock")[1];

async function renderHydrated() {
  render(<EngagementForm engagement={historicalEngagement} />);
  await waitFor(() =>
    expect(screen.getByDisplayValue(historicalEngagement.engagement_name)).toBeInTheDocument()
  );
}

async function save() {
  fireEvent.click(screen.getByRole("button", { name: "common.saveChanges" }));
}

function lastUpdatePayload() {
  const calls = mockUpdateMutateAsync.mock.calls;
  return calls[calls.length - 1][0].data;
}

describe("EngagementForm — fecha de inicio histórica fijada por un admin (BUG 0923-198)", () => {
  beforeEach(() => {
    mockUpdateMutateAsync.mockClear();
    calendarDisabled.length = 0;
    mockRoleKey = "manager";
  });

  it("un editor no-admin cambia solo el nombre y guarda, sin tocar la fecha histórica", async () => {
    const user = userEvent.setup();
    await renderHydrated();

    const nameInput = screen.getByDisplayValue(historicalEngagement.engagement_name);
    await user.clear(nameInput);
    await user.type(nameInput, "AUDITORIA 2027");
    await save();

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    expect(lastUpdatePayload()).toMatchObject({
      engagement_name: "AUDITORIA 2027",
      start_date: "2026-09-02",
    });
    expect(screen.queryByText("engagement.startDateBeforeCreation")).not.toBeInTheDocument();
  });

  it("un editor no-admin cambia solo la fecha de fin y guarda", async () => {
    await renderHydrated();

    fireEvent.change(endCalendar(), { target: { value: "2027-07-15" } });
    await save();

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    expect(lastUpdatePayload()).toMatchObject({ start_date: "2026-09-02", end_date: "2027-07-15" });
    expect(screen.queryByText("engagement.startDateBeforeCreation")).not.toBeInTheDocument();
  });

  it.each([
    ["anterior a la fecha histórica", "2026-08-25"],
    ["posterior a la histórica pero anterior a la creación", "2026-09-05"],
  ])("cambiar la fecha de inicio a un día %s sigue rechazado", async (_label, value) => {
    await renderHydrated();

    fireEvent.change(startCalendar(), { target: { value } });
    await save();

    expect(await screen.findByText("engagement.startDateBeforeCreation")).toBeInTheDocument();
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });

  it("cambiar la fecha de inicio al día de la creación guarda", async () => {
    await renderHydrated();

    fireEvent.change(startCalendar(), { target: { value: "2026-09-10" } });
    await save();

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    expect(lastUpdatePayload()).toMatchObject({ start_date: "2026-09-10" });
  });

  it("volver a poner la fecha histórica guardada (otro objeto Date, mismo día) cuenta como sin cambios", async () => {
    await renderHydrated();

    fireEvent.change(startCalendar(), { target: { value: "2026-09-05" } });
    fireEvent.change(startCalendar(), { target: { value: "2026-09-02" } });
    await save();

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    expect(lastUpdatePayload()).toMatchObject({ start_date: "2026-09-02" });
    expect(screen.queryByText("engagement.startDateBeforeCreation")).not.toBeInTheDocument();
  });

  it("el picker de fecha de inicio sigue deshabilitando los días anteriores a la creación", async () => {
    await renderHydrated();

    // El 05/09 lo deshabilita solo el picker de inicio (piso = creación, 10/09): el de fin usa la
    // fecha de inicio (02/09) como piso y lo deja habilitado.
    const startPredicates = calendarDisabled.filter(
      (fn): fn is (d: Date) => boolean => typeof fn === "function" && fn(new Date(2026, 8, 5))
    );
    expect(startPredicates.length).toBeGreaterThan(0);
    for (const fn of startPredicates) {
      expect(fn(new Date(2026, 8, 9))).toBe(true);
      expect(fn(new Date(2026, 8, 10))).toBe(false);
    }
  });

  it("el admin sigue pudiendo fijar una fecha anterior a la creación", async () => {
    mockRoleKey = "admin";
    await renderHydrated();

    fireEvent.change(startCalendar(), { target: { value: "2026-08-01" } });
    await save();

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    expect(lastUpdatePayload()).toMatchObject({ start_date: "2026-08-01" });
  });
});

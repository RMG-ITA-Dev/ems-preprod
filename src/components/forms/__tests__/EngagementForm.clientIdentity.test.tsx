import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 1028-211 — clientes homónimos en el selector de cliente de Nuevo Encargo.
 *
 * Desde ETL 02 la razón social puede repetirse. Los homónimos llevan un chip con su número
 * correlativo (#1, #2…), que calcula la vista clients_directory (`homonym_seq`) sobre toda la firma.
 * El chip va ANTES del nombre para que el trigger cerrado (una sola línea) no lo corte. Los nombres
 * únicos no llevan chip.
 */

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const ID_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ID_B = "bbbbbbbb-2222-4222-8222-222222222222";
const ID_C = "cccccccc-3333-4333-8333-333333333333";
const ID_D = "dddddddd-4444-4444-8444-444444444444";
// homonym_seq como lo devuelve la vista: numerado sobre TODOS los clientes (el D inactivo es el #3).
const stableClients = [
  { client_id: ID_A, client_legal_name: "Fideicomiso X", is_active: true, homonym_seq: 1 },
  { client_id: ID_B, client_legal_name: "fideicomiso x ", is_active: true, homonym_seq: 2 },
  { client_id: ID_C, client_legal_name: "Empresa Única", is_active: true, homonym_seq: null },
  // Homónimo inactivo: solo aparece por el deep-link (initialClientId).
  { client_id: ID_D, client_legal_name: "Fideicomiso X", is_active: false, homonym_seq: 3 },
];
const stableEmpty: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClientDirectory: () => ({ data: stableClients }),
  useServices: () => ({ data: stableEmpty }),
  useTaxonomies: () => ({ data: stableEmpty }),
  useSocieties: () => ({ data: stableEmpty }),
  useEngagementAssignments: () => ({ data: stableEmpty, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableEmpty }),
  useActiveStaffWithSkills: () => ({ data: stableEmpty }),
  useCategories: () => ({ data: stableEmpty }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partnerOptions: [], managerOptions: [], partners: [], managers: [] }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

vi.mock("@/components/engagements/StaffAssignmentsCard", () => ({
  StaffAssignmentsCard: () => null,
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    // 1110-220: canEditEngagement() lee el alcance; "firm" conserva la semántica previa de este suite.
    scope: () => "firm" as const,
    can: () => true,
    roleKey: "manager",
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

vi.mock("@/lib/fiscalCalculations", () => ({
  getUpcomingClosingDates: () => [
    { value: "2027-09-30", key: "September 30", year: 2027, date: new Date(2027, 8, 30) },
  ],
  getFiscalYearForDate: () => 2027,
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-manager" } }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});

const clientCombobox = () => screen.getByRole("combobox", { name: /^engagement\.client/ });

async function openClientMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(clientCombobox());
  return screen.getByRole("listbox");
}

describe("EngagementForm — clientes homónimos (1028-211)", () => {
  it("los homónimos llevan su número antes del nombre; el nombre único, no", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);
    const menu = await openClientMenu(user);
    const texts = within(menu).getAllByRole("option").map((o) => o.textContent);
    expect(texts).toEqual(["1Fideicomiso X", "2fideicomiso x ", "Empresa Única"]);
  });

  it("elegir cada homónimo deja seleccionado ese cliente", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    await openClientMenu(user);
    await user.click(screen.getByRole("option", { name: /^1Fideicomiso X/ }));
    expect(clientCombobox()).toHaveTextContent("1Fideicomiso X");

    await openClientMenu(user);
    await user.click(screen.getByRole("option", { name: /^2fideicomiso x/ }));
    expect(clientCombobox()).toHaveTextContent("2fideicomiso x");
    expect(clientCombobox()).not.toHaveTextContent("1Fideicomiso X");
  });

  it("un homónimo inactivo (deep-link) lleva su número global y el rótulo de inactivo", async () => {
    const user = userEvent.setup();
    render(<EngagementForm initialClientId={ID_D} />);
    expect(clientCombobox()).toHaveTextContent("3Fideicomiso X (status.inactive)");
    const menu = await openClientMenu(user);
    const texts = within(menu).getAllByRole("option").map((o) => o.textContent);
    expect(texts).toContain("3Fideicomiso X (status.inactive)");
    expect(texts).toContain("1Fideicomiso X");
  });

  it("Fase 2: un cliente inactivo por deep-link avisa que está pendiente de activación", () => {
    render(<EngagementForm initialClientId={ID_D} />);
    expect(screen.getByText("engagement.clientPendingActivation")).toBeInTheDocument();
  });

  it("Fase 2: un cliente activo no muestra el aviso", () => {
    render(<EngagementForm initialClientId={ID_A} />);
    expect(screen.queryByText("engagement.clientPendingActivation")).not.toBeInTheDocument();
  });

  it("el chip lleva el título traducible con el número", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);
    const menu = await openClientMenu(user);
    expect(within(menu).getAllByTitle("client.homonymTag")).toHaveLength(2);
  });
});

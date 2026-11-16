import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 1110-220 (review de Codex) — en el ALTA de un administrativo, admin elige el cliente interno (que deriva la sociedad) y
 * al Aprobador de horas. Si después cambia al cliente interno de la otra sociedad, un Aprobador con alcance por sociedad
 * (Contabilidad) deja de valer y el trigger lo rechazaría al guardar: se limpian rol y persona. Desde 2026-11-16 el resto de
 * roles (Gerente, Director, Talento Humano, Riesgos…) aprueba encargos de cualquier sociedad y se conserva.
 */

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const stableEmpty: never[] = [];
const societies = [
  { society_id: "soc-pel", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "" },
  { society_id: "soc-jau", name: "Ruizmier Jauregui S.R.L.", is_active: true, created_at: "" },
];
vi.mock("@/hooks/useEmsData", () => ({
  useClientDirectory: () => ({ data: stableEmpty }),
  useServices: () => ({ data: stableEmpty }),
  useTaxonomies: () => ({ data: stableEmpty }),
  useSocieties: () => ({ data: societies, isLoading: false, isFetching: false }),
  useEngagementAssignments: () => ({ data: stableEmpty, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableEmpty }),
  useActiveStaffWithSkills: () => ({ data: stableEmpty }),
  useCategories: () => ({ data: stableEmpty }),
}));

const internalClients = [
  { client_id: "client-pel", client_legal_name: "Ruizmier Pelaez S.R.L.", unique_tax_id: "1006979026", is_active: true },
  { client_id: "client-jau", client_legal_name: "Ruizmier Jauregui S.R.L.", unique_tax_id: "184046021", is_active: true },
];
vi.mock("@/hooks/useAdministrativeEngagements", () => ({
  useAdministrativeInternalClients: () => ({ data: internalClients }),
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

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true, isLoading: false }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    scope: () => "firm",
    can: () => true,
    roleKey: "admin",
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-admin" }, isLoading: false }),
}));

vi.mock("@/lib/fiscalCalculations", () => ({
  getUpcomingClosingDates: () => [
    { value: "2027-09-30", key: "September 30", year: 2027, date: new Date(2027, 8, 30) },
  ],
  getFiscalYearForDate: () => 2027,
}));

// Equipo (0722-162): sin este mock el hook real golpea Supabase y bloquea los selectores con "no se pudieron cargar".
vi.mock("@/hooks/useEngagementTeamCandidates", () => ({
  useEngagementTeamCandidates: () => ({
    partnerDirectorOptions: [],
    managerRoleOptions: [],
    encargadoOptions: [],
    specialistItOptions: [],
    specialistTaxOptions: [],
    hasPartnerDirectorCandidates: true,
    hasManagerCandidates: true,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useHoursApproverCandidates", () => ({
  useHoursApproverCandidates: () => ({
    candidates: [
      { staff_id: "m-pel", display_name: "Ana Pelaez", role_key: "accounting_manager", society_id: "soc-pel" },
      { staff_id: "m-jau", display_name: "Juan Jauregui", role_key: "accounting_manager", society_id: "soc-jau" },
      { staff_id: "d-pel", display_name: "Diego Director", role_key: "director", society_id: "soc-pel" },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";

if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (typeof (globalThis as any).PointerEvent === "undefined") {
  (globalThis as any).PointerEvent = MouseEvent;
}
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const clientTrigger = () =>
  screen.getByText("engagement.client").closest("div")!.querySelector('button[role="combobox"]') as HTMLElement;
const roleTrigger = () => document.getElementById("hours-approver-role") as HTMLElement;

describe("Alta administrativa: cambiar de sociedad y el Aprobador (review de Codex + operador 2026-11-16)", () => {
  it("Contabilidad de Pelaez y cambia al cliente de Jauregui: se limpian rol y persona (alcance por sociedad)", async () => {
    const user = userEvent.setup();
    render(<EngagementForm administrativeMode />);

    await user.click(clientTrigger());
    await user.click(await screen.findByRole("option", { name: /^Ruizmier Pelaez S\.R\.L\./ }));

    await waitFor(() => expect(roleTrigger()).not.toBeDisabled());
    await user.click(roleTrigger());
    await user.click(await screen.findByRole("option", { name: "authz.role.accounting_manager" }));
    expect(roleTrigger()).toHaveTextContent("authz.role.accounting_manager");
    await user.click(screen.getByText("engagement.selectHoursApprover"));
    await user.click(await screen.findByText("Ana Pelaez"));
    expect(screen.getByText("Ana Pelaez")).toBeInTheDocument();

    await user.click(clientTrigger());
    await user.click(await screen.findByRole("option", { name: /^Ruizmier Jauregui S\.R\.L\./ }));

    // El rol vuelve a "elegir rol" (Jauregui también tiene Contabilidad: sin el reset el rol seguiría elegido) y la persona
    // de Pelaez ya no está.
    await waitFor(() => expect(roleTrigger()).toHaveTextContent("engagement.selectHoursApproverRole"));
    expect(screen.queryByText("Ana Pelaez")).not.toBeInTheDocument();
  });

  it("un Director de Pelaez sigue como Aprobador al cambiar al cliente de Jauregui (aprueba de cualquier sociedad)", async () => {
    const user = userEvent.setup();
    render(<EngagementForm administrativeMode />);

    await user.click(clientTrigger());
    await user.click(await screen.findByRole("option", { name: /^Ruizmier Pelaez S\.R\.L\./ }));

    await waitFor(() => expect(roleTrigger()).not.toBeDisabled());
    await user.click(roleTrigger());
    await user.click(await screen.findByRole("option", { name: "authz.role.director" }));
    await user.click(screen.getByText("engagement.selectHoursApprover"));
    await user.click(await screen.findByText("Diego Director"));
    expect(screen.getByText("Diego Director")).toBeInTheDocument();

    await user.click(clientTrigger());
    await user.click(await screen.findByRole("option", { name: /^Ruizmier Jauregui S\.R\.L\./ }));

    // Sigue elegible en la sociedad nueva: ni el rol ni la persona se limpian.
    await waitFor(() => expect(roleTrigger()).toHaveTextContent("authz.role.director"));
    expect(screen.getByText("Diego Director")).toBeInTheDocument();
  });
});

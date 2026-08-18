import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * FEAT 0722-157: reorder of the Encargo form (Información Básica → Fechas → Clasificación →
 * Equipo → Asignación de personal → Política de Planilla) plus actionable validation
 * (scroll + focus to the first invalid field on a failed submit) and the new
 * "* Campos obligatorios" legend. Mirrors the pure-DOM-order/behavior testing approach used
 * elsewhere in this suite rather than re-deriving the reorder from source.
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
const scrollIntoViewMock = vi.fn();
Element.prototype.scrollIntoView = scrollIntoViewMock;
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockServices = [
  { service_id: "s1", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
];
const mockClients = [{ client_id: "client-1", client_legal_name: "Test Client", is_active: true }];
const mockSocieties = [{ society_id: "soc-1", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "" }];
const stableTaxonomies: never[] = [];
const stableAssignments: never[] = [];
const stableAggregatedReqs: never[] = [];
const stableActiveStaff: never[] = [];
const stableCategories: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: mockClients }),
  useServices: () => ({ data: mockServices }),
  useTaxonomies: () => ({ data: stableTaxonomies }),
  useSocieties: () => ({ data: mockSocieties }),
  useEngagementAssignments: () => ({ data: stableAssignments, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableAggregatedReqs }),
  useActiveStaffWithSkills: () => ({ data: stableActiveStaff }),
  useCategories: () => ({ data: stableCategories }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [],
    partnerOptions: [{ value: "p1", label: "Juan Partner" }],
    managerOptions: [{ value: "m1", label: "Ana Manager" }],
    allActiveStaff: [],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

// isAdmin: true, so the admin-only "Política de Planilla" section renders — needed to check
// its place in the reordered layout and its 2-column grid.
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "admin" }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";

describe("EngagementForm — section order after the 0722-157 reorder", () => {
  it("renders the section headings in the order: Información Básica, Equipo, Asignación, Política (Fechas and Clasificación have no heading, per feedback)", () => {
    const { container } = render(<EngagementForm />);
    const headings = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent);

    expect(headings).toEqual([
      "common.basicInfo",
      "common.team",
      "engagement.assignments.title",
      "engagement.timesheetPolicy",
    ]);
  });

  it("Información Básica fila 1: Cliente, then Sociedad, then Servicio (Taxonomía)", () => {
    const { container } = render(<EngagementForm />);
    const labels = Array.from(container.querySelectorAll("label")).map((l) => l.textContent ?? "");

    const clientIdx = labels.findIndex((t) => t.startsWith("engagement.client "));
    const societyIdx = labels.findIndex((t) => t.startsWith("engagement.society "));
    const taxonomyIdx = labels.findIndex((t) => t.startsWith("engagement.taxonomy"));

    expect(clientIdx).toBeGreaterThanOrEqual(0);
    expect(societyIdx).toBeGreaterThan(clientIdx);
    expect(taxonomyIdx).toBeGreaterThan(societyIdx);
  });

  it("Información Básica fila 2: Nombre del Encargo, then Contrato Escaneado", () => {
    const { container } = render(<EngagementForm />);
    const labels = Array.from(container.querySelectorAll("label")).map((l) => l.textContent ?? "");

    const nameIdx = labels.findIndex((t) => t.startsWith("engagement.name "));
    const contractIdx = labels.findIndex((t) => t.startsWith("engagement.contractScanned"));

    expect(nameIdx).toBeGreaterThanOrEqual(0);
    expect(contractIdx).toBeGreaterThan(nameIdx);
  });

  it("shows the '* Campos obligatorios' legend before the action buttons", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.requiredFieldsLegend")).toBeInTheDocument();
  });

  it("Política de Planilla renders its 4 switches inside a 2-column grid", () => {
    const { container } = render(<EngagementForm />);
    const heading = Array.from(container.querySelectorAll("h3")).find(
      (h) => h.textContent === "engagement.timesheetPolicy"
    ) as HTMLElement;
    const grid = heading.nextElementSibling as HTMLElement;

    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-2");
    expect(grid.querySelectorAll('button[role="switch"]')).toHaveLength(4);
  });
});

describe("EngagementForm — 'Otro' closing date reveals the custom date picker (unchanged by the reorder)", () => {
  it("selecting 'Otro' reveals the custom closing-date field", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    expect(screen.queryByLabelText(/engagement\.closingDateCustom/)).not.toBeInTheDocument();

    const closingDate = screen.getByRole("combobox", { name: "engagement.closingDate *" });
    await user.click(closingDate);
    await waitFor(() => screen.getByRole("option", { name: "engagement.closingDate_otro" }));
    await user.click(screen.getByRole("option", { name: "engagement.closingDate_otro" }));

    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.closingDateCustom/)).toBeInTheDocument();
    });
  });
});

describe("EngagementForm — actionable validation: scroll + focus the first invalid field (0722-157)", () => {
  beforeEach(() => {
    scrollIntoViewMock.mockClear();
    mockNavigate.mockClear();
  });

  it("submitting an empty create form focuses and scrolls to the first invalid field (Cliente, now first in DOM order) without navigating", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    await user.click(screen.getByText("engagement.createEngagement"));

    const clientTrigger = screen.getByLabelText(/engagement\.client/);
    await waitFor(() => {
      expect(clientTrigger).toHaveAttribute("aria-invalid", "true");
    });
    await waitFor(() => expect(document.activeElement).toBe(clientTrigger));
    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

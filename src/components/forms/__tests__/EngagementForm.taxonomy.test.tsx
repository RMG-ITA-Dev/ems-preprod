import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 0602-136: EngagementForm — taxonomy combobox.
 * - Combobox lists only ACTIVE taxonomies (+ the current one in edit mode, even if inactive)
 * - Editable in both create and edit mode
 * - Required only when funcion = Cliente (1) — and for Cliente, "No aplica" does NOT
 *   satisfy the requirement (unlike other funciones, where it's a valid opt-out); the
 *   option is hidden from the combobox entirely while funcion = Cliente. No exception
 *   for legacy null taxonomy on edit.
 * Mirrors the pure-logic testing approach used in EngagementForm.code-generation.test.tsx
 * for the parts that would otherwise require driving a full, fully-valid form submission.
 */

// cmdk (used by TaxonomyCombobox) and Radix Popover rely on browser APIs unavailable in JSDOM
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

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

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockServices = [
  { service_id: "s1", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
];

// 0722-157: deliberately out of code order — activeTaxonomyOptions must sort by code.
const mockTaxonomies = [
  { taxonomy_id: "tx-active-2", code: "AA1007", name: "Continued audit", service_id: null, is_active: true, created_at: "" },
  { taxonomy_id: "tx-active-1", code: "AA1006", name: "New audit", service_id: null, is_active: true, created_at: "" },
  { taxonomy_id: "tx-inactive", code: "AA1501", name: "Old audit", service_id: null, is_active: false, created_at: "" },
];

// Stable references: a fresh [] literal on every call gives StaffAssignmentsCard's
// reseed-while-clean effect a new `assignments` identity on every render (its dep array
// includes it), triggering setDrafts/setBaseline in an infinite render loop.
const stableClients: never[] = [];
const stableAssignments: never[] = [];
const stableAggregatedReqs: never[] = [];
const stableActiveStaff: never[] = [];
const stableCategories: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients:    () => ({ data: stableClients }),
  useServices:   () => ({ data: mockServices }),
  useTaxonomies: () => ({ data: mockTaxonomies }),
  useSocieties:  () => ({ data: [] }),
  // Fase 5: EngagementForm now mounts StaffAssignmentsCard in edit mode, which pulls these.
  useEngagementAssignments: () => ({ data: stableAssignments, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableAggregatedReqs }),
  useActiveStaffWithSkills: () => ({ data: stableActiveStaff }),
  useCategories: () => ({ data: stableCategories }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [],
    managerOptions: [],
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

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  // Estos tests mockean isAdmin: false; con isAdmin derivado de role_key,
  // roleKey debe ser NO-admin para seguir ejercitando el mismo caso.
  useAuthorization: () => ({ can: () => true, roleKey: "manager" }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import { NO_APLICA_VALUE } from "@/components/forms/TaxonomyCombobox";
import type { Engagement } from "@/hooks/useEmsData";

const mockEngagementInactiveTaxonomy: Engagement = {
  engagement_id:       "eng-tax-1",
  client_id:           "client-1",
  engagement_name:     "Old Client Engagement",
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
  practica:            1,
  funcion:             1,
  anio_fiscal:         2026,
  taxonomy_id:         "tx-inactive",
  society_id:          null,
};

const mockEngagementLegacyNullTaxonomy: Engagement = {
  ...mockEngagementInactiveTaxonomy,
  engagement_id: "eng-tax-2",
  funcion:       0, // Administrativa (not Cliente) — legacy, taxonomy_id was never set
  taxonomy_id:   null,
};

describe("EngagementForm — taxonomy combobox filtering (0602-136)", () => {
  it("renders the taxonomy field label without asterisk when funcion is unset", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.taxonomy")).toBeInTheDocument();
  });

  it("create mode: opening the combobox shows only active taxonomies plus 'No aplica'", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    await user.click(screen.getByTestId("taxonomy-combobox-trigger"));

    await waitFor(() => {
      expect(screen.getByText("engagement.noAplicaTaxonomy")).toBeInTheDocument();
      expect(screen.getByText("New audit")).toBeInTheDocument();
      expect(screen.getByText("Continued audit")).toBeInTheDocument();
      expect(screen.queryByText("Old audit")).not.toBeInTheDocument();
    });
  });

  // 0722-157: options display only the name (code stays in the searchable `value` — see the
  // "code search still filters" test below), ordered by code regardless of catalog order.
  it("create mode: options are ordered by code (AA1006 before AA1007), not catalog order", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    await user.click(screen.getByTestId("taxonomy-combobox-trigger"));

    await waitFor(() => screen.getByText("New audit"));
    const items = screen.getAllByText(/New audit|Continued audit/);
    expect(items.map((el) => el.textContent)).toEqual(["New audit", "Continued audit"]);
  });

  it("create mode: typing a code still filters the (name-only) options", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    await user.click(screen.getByTestId("taxonomy-combobox-trigger"));
    await waitFor(() => screen.getByText("New audit"));
    await user.type(screen.getByPlaceholderText("engagement.searchTaxonomy"), "AA1007");

    await waitFor(() => {
      expect(screen.getByText("Continued audit")).toBeInTheDocument();
      expect(screen.queryByText("New audit")).not.toBeInTheDocument();
    });
  });

  it("edit mode: the current taxonomy is shown even though it is now inactive, and the combobox is not disabled", () => {
    render(<EngagementForm engagement={mockEngagementInactiveTaxonomy} />);
    const trigger = screen.getByTestId("taxonomy-combobox-trigger");
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveTextContent("Old audit");
  });

  it("funcion=Cliente: 'No aplica' is hidden from the combobox options", async () => {
    const user = userEvent.setup();
    render(<EngagementForm engagement={mockEngagementInactiveTaxonomy} />);

    await user.click(screen.getByTestId("taxonomy-combobox-trigger"));

    await waitFor(() => {
      expect(screen.queryByText("engagement.noAplicaTaxonomy")).not.toBeInTheDocument();
      expect(screen.getByText("New audit")).toBeInTheDocument();
    });
  });
});

describe("EngagementForm — taxonomy requiredness (mirrors onSubmit logic, 0602-136)", () => {
  const FUNCION_CLIENTE = 1;

  // Mirrors the check in EngagementForm.tsx onSubmit: required for Cliente, and
  // "No aplica" does NOT satisfy it there (unlike other funciones).
  const isTaxonomyMissing = (funcion: number | undefined, taxonomyId: string | undefined) =>
    funcion === FUNCION_CLIENTE && (!taxonomyId || taxonomyId === NO_APLICA_VALUE);

  it("is missing when funcion=Cliente and the field was never touched", () => {
    expect(isTaxonomyMissing(FUNCION_CLIENTE, undefined)).toBe(true);
  });

  it("is missing when funcion=Cliente and the user picked 'No aplica'", () => {
    expect(isTaxonomyMissing(FUNCION_CLIENTE, NO_APLICA_VALUE)).toBe(true);
  });

  it("is NOT missing when funcion=Cliente and a real taxonomy was picked", () => {
    expect(isTaxonomyMissing(FUNCION_CLIENTE, "tx-active-1")).toBe(false);
  });

  it("is NOT missing for non-Cliente functions even when untouched", () => {
    expect(isTaxonomyMissing(0, undefined)).toBe(false);
  });

  // Mirrors the taxonomyIdPayload conversion in EngagementForm.tsx onSubmit.
  const toPayload = (taxonomyId: string | undefined) =>
    taxonomyId && taxonomyId !== NO_APLICA_VALUE ? taxonomyId : null;

  it("converts an untouched field to null on submit", () => {
    expect(toPayload(undefined)).toBeNull();
  });

  it("converts the 'No aplica' sentinel to null on submit", () => {
    expect(toPayload(NO_APLICA_VALUE)).toBeNull();
  });

  it("passes through a real taxonomy id on submit", () => {
    expect(toPayload("tx-active-1")).toBe("tx-active-1");
  });
});

describe("EngagementForm — legacy null taxonomy on edit (0602-136)", () => {
  it("edit mode: a legacy non-Cliente engagement with taxonomy_id=null shows the unanswered placeholder (not pre-filled to 'No aplica')", () => {
    render(<EngagementForm engagement={mockEngagementLegacyNullTaxonomy} />);
    const trigger = screen.getByTestId("taxonomy-combobox-trigger");
    expect(trigger).toHaveTextContent("engagement.selectTaxonomy");
  });
});

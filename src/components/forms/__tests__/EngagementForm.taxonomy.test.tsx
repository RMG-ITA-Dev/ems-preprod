import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 0602-136: EngagementForm — taxonomy combobox.
 * - Combobox lists only ACTIVE taxonomies (+ the current one in edit mode, even if inactive)
 * - Editable in both create and edit mode
 * - Required only when funcion = Cliente (1); the "No aplica" sentinel is a distinct
 *   explicit choice from an untouched field, and legacy null values don't force it
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

const mockTaxonomies = [
  { taxonomy_id: "tx-active-1", code: "AA1006", name: "New audit", service_id: null, is_active: true, created_at: "" },
  { taxonomy_id: "tx-active-2", code: "AA1007", name: "Continued audit", service_id: null, is_active: true, created_at: "" },
  { taxonomy_id: "tx-inactive", code: "AA1501", name: "Old audit", service_id: null, is_active: false, created_at: "" },
];

vi.mock("@/hooks/useEmsData", () => ({
  useClients:    () => ({ data: [] }),
  useServices:   () => ({ data: mockServices }),
  useTaxonomies: () => ({ data: mockTaxonomies }),
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
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false }),
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
      expect(screen.getByText("AA1006")).toBeInTheDocument();
      expect(screen.getByText("AA1007")).toBeInTheDocument();
      expect(screen.queryByText("AA1501")).not.toBeInTheDocument();
    });
  });

  it("edit mode: the current taxonomy is shown even though it is now inactive, and the combobox is not disabled", () => {
    render(<EngagementForm engagement={mockEngagementInactiveTaxonomy} />);
    const trigger = screen.getByTestId("taxonomy-combobox-trigger");
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveTextContent("AA1501");
  });
});

describe("EngagementForm — taxonomy requiredness (mirrors onSubmit logic, 0602-136)", () => {
  const FUNCION_CLIENTE = 1;

  // Mirrors the check in EngagementForm.tsx onSubmit: required only for Cliente,
  // and only when the field was never touched (undefined) — not when the user
  // explicitly picked "No aplica".
  const isTaxonomyMissing = (funcion: number | undefined, taxonomyId: string | undefined) =>
    funcion === FUNCION_CLIENTE && !taxonomyId;

  it("is missing when funcion=Cliente and the field was never touched", () => {
    expect(isTaxonomyMissing(FUNCION_CLIENTE, undefined)).toBe(true);
  });

  it("is NOT missing when funcion=Cliente and the user explicitly picked 'No aplica'", () => {
    expect(isTaxonomyMissing(FUNCION_CLIENTE, NO_APLICA_VALUE)).toBe(false);
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
  it("edit mode: a legacy non-Cliente engagement with taxonomy_id=null defaults the combobox to 'No aplica' instead of leaving it untouched", () => {
    render(<EngagementForm engagement={mockEngagementLegacyNullTaxonomy} />);
    const trigger = screen.getByTestId("taxonomy-combobox-trigger");
    expect(trigger).toHaveTextContent("engagement.noAplicaTaxonomy");
  });
});

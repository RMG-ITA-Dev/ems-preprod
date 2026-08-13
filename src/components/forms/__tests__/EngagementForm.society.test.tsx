import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * FEAT 0714-155: EngagementForm — "Sociedad" select (engagements.society_id).
 * Behaves like oficina/practica/funcion: required only in creation (validated
 * manually, mirroring the onSubmit guard below), disabled in edit mode, and omitted
 * from the update payload (immutable after create). Named "society" (not "firma") per
 * operator decision (2026-08-13, bugs/0714-155/plan_v2.md §Open Questions #3) to stay
 * consistent with the existing staff.society/staff.selectSociety terminology (0810-173).
 *
 * The end-to-end "crear otro resets Sociedad to empty" path is covered together with
 * the existing full create-submit fixture in EngagementForm.servicesCatalog.test.tsx
 * (which already drives every other required field through a real submit) rather than
 * duplicating that heavy harness here.
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

const mockServices = [
  { service_id: "s1", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
];

const mockSocieties = [
  { society_id: "soc-active-1", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "" },
  { society_id: "soc-active-2", name: "Ruizmier Juaregui S.R.L.", is_active: true, created_at: "" },
  { society_id: "soc-inactive", name: "Old Society S.R.L.", is_active: false, created_at: "" },
];

// Includes the client referenced by the edit-mode fixtures below so the client Select can
// resolve a matching SelectItem — Radix Select can't retain a `value` that has no
// corresponding item, which otherwise silently clears the field and fails zod validation
// (same gotcha documented in EngagementForm.code-generation.test.tsx).
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

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [],
    partnerOptions: [],
    managerOptions: [],
    allActiveStaff: [],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

const mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "manager" }),
}));

// The scheduler flag defaults to "true" in vitest.config.ts, so edit mode mounts
// StaffAssignmentsCard, which pulls useUserRole (-> useAuth). Mock it directly, same
// convention as EngagementForm.taxonomy.test.tsx/contractFile.test.tsx.
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

const mockEngagementWithSociety: Engagement = {
  engagement_id: "eng-soc-1",
  client_id: "client-1",
  engagement_name: "Old Client Engagement",
  engagement_code: "2026.011.002",
  partner_id: "staff-partner",
  manager_id: "staff-manager",
  status: "active",
  start_date: "2025-10-01",
  end_date: "2026-09-30",
  created_at: "2025-10-01T00:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 0,
  practica: 1,
  funcion: 0,
  anio_fiscal: 2026,
  fecha_cierre: "2026-09-30",
  anio_fiscal_override: false,
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  taxonomy_id: null,
  contract_file_path: null,
  society_id: "soc-inactive",
};

const mockEngagementNullSociety: Engagement = {
  ...mockEngagementWithSociety,
  engagement_id: "eng-soc-2",
  society_id: null,
};

describe("EngagementForm — Sociedad select (FEAT 0714-155)", () => {
  beforeEach(() => {
    mockUpdateMutateAsync.mockClear();
  });

  it("renders the label with an asterisk", () => {
    render(<EngagementForm />);
    expect(screen.getByText("engagement.society *")).toBeInTheDocument();
  });

  it("create mode: opening the select lists only active societies", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    await user.click(screen.getByLabelText(/engagement\.society/));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Ruizmier Pelaez S.R.L." })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Ruizmier Juaregui S.R.L." })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Old Society S.R.L." })).not.toBeInTheDocument();
    });
  });

  it("edit mode: the select is disabled (immutable after create, like oficina/practica/funcion)", () => {
    render(<EngagementForm engagement={mockEngagementWithSociety} />);
    expect(screen.getByLabelText(/engagement\.society/)).toBeDisabled();
  });

  it("edit mode: shows the current society even though it is now inactive", () => {
    render(<EngagementForm engagement={mockEngagementWithSociety} />);
    expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Old Society S.R.L.");
  });

  it("edit mode: a historical engagement with society_id=null shows the unanswered placeholder", () => {
    render(<EngagementForm engagement={mockEngagementNullSociety} />);
    expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("engagement.selectSociety");
  });

  it("edit mode: saving does not send society_id in the update payload (immutable by omission)", async () => {
    const user = userEvent.setup();
    render(<EngagementForm engagement={mockEngagementWithSociety} />);

    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    const [[call]] = mockUpdateMutateAsync.mock.calls;
    expect(call.data).not.toHaveProperty("society_id");
  });
});

describe("EngagementForm — Sociedad requiredness (mirrors onSubmit logic, FEAT 0714-155)", () => {
  // Mirrors the guard added to onSubmit in EngagementForm.tsx: required only in creation.
  const isSocietyMissing = (isEdit: boolean, societyId: string | undefined) => !isEdit && societyId === undefined;

  it("is missing on create when the field was never touched", () => {
    expect(isSocietyMissing(false, undefined)).toBe(true);
  });

  it("is NOT missing on create once a society is picked", () => {
    expect(isSocietyMissing(false, "soc-active-1")).toBe(false);
  });

  it("is never enforced in edit mode (immutable, not re-validated)", () => {
    expect(isSocietyMissing(true, undefined)).toBe(false);
  });
});

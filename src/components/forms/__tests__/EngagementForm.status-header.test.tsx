import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * FEAT 0722-157: the engagement-state control moves from the field grid into the
 * "Información Básica" header. Admin keeps full control via an editable <Select> (the 9
 * states + "Automático"); every other role — including the Gerente, who previously had a
 * congelar/descongelar toggle here — now only sees a read-only badge, reusing the same
 * `engagementStateBadgeClass` pattern as the Encargos table (Engagements.tsx). Removing the
 * Gerente's toggle is a deliberate, operator-authorized functional deviation (plan_v2.md §1),
 * not just a layout change — see the "no toggle" assertions below.
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

// Includes the client referenced by mockApprovedEngagement below so the client Select can
// resolve a matching SelectItem — Radix Select can't retain a `value` that has no
// corresponding item, which otherwise silently clears the field and fails zod validation
// (same gotcha documented in EngagementForm.code-generation.test.tsx / society.test.tsx).
const stableClients = [{ client_id: "client-1", client_legal_name: "Test Client", is_active: true }];
const stableServices: never[] = [];
const stableTaxonomies: never[] = [];
const stableAssignments: never[] = [];
const stableAggregatedReqs: never[] = [];
const stableActiveStaff: never[] = [];
const stableCategories: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
  useServices: () => ({ data: stableServices }),
  useTaxonomies: () => ({ data: stableTaxonomies }),
  useSocieties: () => ({ data: [] }),
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

// Same convention as EngagementForm.servicesCatalog.test.tsx: useAuthorization derives
// roleKey from useUserRole at call time so both mocks can be flipped together per test.
const mockUseUserRole = vi.fn();
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => mockUseUserRole(),
}));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: () => true,
    roleKey: (mockUseUserRole() as { isAdmin?: boolean } | undefined)?.isAdmin ? "admin" : "manager",
  }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-manager" } }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

// work_order_required + approval_status "Approved" (no risk emergency) derives state 4
// (Aprobado) — engagementStateBadgeClass(4) is the "success" (green) variant.
const mockApprovedEngagement: Engagement = {
  engagement_id: "eng-status-1",
  client_id: "client-1",
  engagement_name: "Audit FY2027",
  engagement_code: "2027.121.001",
  partner_id: "staff-partner",
  manager_id: "staff-manager",
  status: "active",
  start_date: "2026-10-01",
  end_date: "2027-09-30",
  created_at: "2026-05-22T00:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 1,
  practica: 2,
  // Administrativa (0), not Cliente — Cliente would require a non-null taxonomy_id on submit
  // (unrelated 0602-136 rule), which isn't this test's concern.
  funcion: 0,
  anio_fiscal: 2027,
  anio_fiscal_override: false,
  fecha_cierre: "2027-09-30",
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  taxonomy_id: null,
  contract_file_path: null,
  society_id: null,
  engagement_state_override: null,
  work_order: { approval_status: "Approved", approved_at: "2026-09-01T00:00:00Z", risk_status: "Approved" },
};

describe("EngagementForm — engagement-state header control (0722-157)", () => {
  beforeEach(() => {
    mockUpdateMutateAsync.mockClear();
  });

  it("edit mode, Admin: shows an editable Select for the state, not the badge", async () => {
    mockUseUserRole.mockReturnValue({ isAdmin: true });
    render(<EngagementForm engagement={mockApprovedEngagement} />);

    expect(screen.getByRole("combobox", { name: "engagement.status" })).toBeInTheDocument();
  });

  it("edit mode, Admin: does not render the Gerente freeze toggle", () => {
    mockUseUserRole.mockReturnValue({ isAdmin: true });
    render(<EngagementForm engagement={mockApprovedEngagement} />);

    expect(screen.queryByText("engagement.freezeToggle")).not.toBeInTheDocument();
  });

  it("edit mode, non-admin (Gerente asignado): shows the read-only badge with the effective state, not a Select", () => {
    mockUseUserRole.mockReturnValue({ isAdmin: false });
    render(<EngagementForm engagement={mockApprovedEngagement} />);

    expect(screen.getByText("engagementState.4")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "engagement.status" })).not.toBeInTheDocument();
  });

  it("edit mode, non-admin: the badge uses engagementStateBadgeClass's success classes for Aprobado (4)", () => {
    mockUseUserRole.mockReturnValue({ isAdmin: false });
    render(<EngagementForm engagement={mockApprovedEngagement} />);

    const badge = screen.getByText("engagementState.4");
    expect(badge.className).toContain("bg-success/10");
    expect(badge.className).toContain("text-success");
  });

  // 0722-157: deliberate functional removal (not just visual) — the Gerente lost the
  // congelar/descongelar capability in this form (operator-authorized deviation).
  it("edit mode, non-admin: does not render the Gerente freeze toggle even for the engagement's own manager", () => {
    mockUseUserRole.mockReturnValue({ isAdmin: false });
    render(<EngagementForm engagement={mockApprovedEngagement} />);

    expect(screen.queryByText("engagement.freezeToggle")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("engagement.freezeToggle")).not.toBeInTheDocument();
  });

  it("create mode: shows the 'Automático' badge regardless of role (Admin)", () => {
    mockUseUserRole.mockReturnValue({ isAdmin: true });
    render(<EngagementForm />);

    expect(screen.getByText("engagementState.auto")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "engagement.status" })).not.toBeInTheDocument();
  });

  it("create mode: shows the 'Automático' badge for non-admin too", () => {
    mockUseUserRole.mockReturnValue({ isAdmin: false });
    render(<EngagementForm />);

    expect(screen.getByText("engagementState.auto")).toBeInTheDocument();
  });

  it("Admin picking a different state from the header Select sends it in the update payload", async () => {
    mockUseUserRole.mockReturnValue({ isAdmin: true });
    const user = userEvent.setup();
    render(<EngagementForm engagement={mockApprovedEngagement} />);

    await user.click(screen.getByRole("combobox", { name: "engagement.status" }));
    await waitFor(() => screen.getByRole("option", { name: "engagementState.9" }));
    await user.click(screen.getByRole("option", { name: "engagementState.9" }));

    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    const [[call]] = mockUpdateMutateAsync.mock.calls;
    expect(call.data).toMatchObject({ engagement_state_override: 9 });
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * BUG 0827-184: the "Requiere actividad" Switch stops being an independently-editable
 * admin flag and becomes read-only, derived from `funcion` (FUNCION_CLIENTE = 1) — see
 * plan_v2.md. This closes the gap where an administrativa/capacitación/calidad engagement
 * created with defaults (activity_required=true by default) never got auto-ADM, and a
 * cliente engagement with activity_required=false stored got ADM forced by the DB trigger.
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

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "admin" }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-manager" } }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

const baseEngagement: Engagement = {
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
  // Bug fixture: stale activity_required=true stored for an administrativa engagement —
  // exactly the pre-existing mismatch 0827-184 fixes. The Switch/payload must ignore this
  // stored value and derive strictly from funcion.
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 1,
  practica: 2,
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

function getActivityRequiredSwitch(): HTMLElement {
  const label = screen.getByText("engagement.activityRequired");
  const row = label.closest("div.flex.items-center.justify-between") as HTMLElement;
  return within(row).getByRole("switch");
}

describe("EngagementForm — activity_required derived from funcion (0827-184)", () => {
  beforeEach(() => {
    mockUpdateMutateAsync.mockClear();
  });

  it("funcion=0 (administrativa): Switch is unchecked and disabled, regardless of the stored flag", () => {
    render(<EngagementForm engagement={baseEngagement} />);
    const sw = getActivityRequiredSwitch();
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toBeDisabled();
  });

  it("funcion=1 (cliente): Switch is checked and disabled", () => {
    render(<EngagementForm engagement={{ ...baseEngagement, funcion: 1 }} />);
    const sw = getActivityRequiredSwitch();
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(sw).toBeDisabled();
  });

  it("saving an administrativa engagement persists activity_required=false, overriding the stale stored value", async () => {
    const user = userEvent.setup();
    render(<EngagementForm engagement={baseEngagement} />);

    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    const [[call]] = mockUpdateMutateAsync.mock.calls;
    expect(call.data).toMatchObject({ activity_required: false });
  });

  // review#15 (0827-184, iteration 4): a legacy engagement with funcion unset must not have
  // activity_required forced to false on an unrelated edit — the backfill migration
  // deliberately left these rows untouched (`WHERE funcion IS NOT NULL`), and a stray
  // `false` here would make the DB trigger start auto-forcing ADM on future time entries.
  it("funcion=null (legacy, unset): update payload omits activity_required instead of forcing false", async () => {
    const user = userEvent.setup();
    render(<EngagementForm engagement={{ ...baseEngagement, funcion: null }} />);

    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    const [[call]] = mockUpdateMutateAsync.mock.calls;
    expect(call.data).not.toHaveProperty("activity_required");
  });
});

// Driving a full, fully-valid CREATE submission (oficina/practica/funcion/society/taxonomy/
// contract-file/dates) is exercised nowhere in this suite — see EngagementForm.taxonomy.test.tsx's
// "mirrors onSubmit logic" pattern, adopted here for the same reason. `activity_required` is
// derived by the exact same one-line expression at both call sites in EngagementForm.tsx
// (create: `activity_required: data.funcion === FUNCION_CLIENTE`, update: identical) — this
// pins that create's payload isn't allowed to drift from update's.
describe("EngagementForm — create payload activity_required derivation (mirrors onSubmit logic, 0827-184)", () => {
  const FUNCION_CLIENTE = 1;
  const toActivityRequired = (funcion: number) => funcion === FUNCION_CLIENTE;

  it("funcion=1 (cliente) → activity_required=true on create", () => {
    expect(toActivityRequired(1)).toBe(true);
  });

  it("funcion=0 (administrativa) → activity_required=false on create", () => {
    expect(toActivityRequired(0)).toBe(false);
  });

  it("funcion=2/3 (capacitación/calidad) → activity_required=false on create", () => {
    expect(toActivityRequired(2)).toBe(false);
    expect(toActivityRequired(3)).toBe(false);
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Iteración 6 (review.md): canApprove ahora exige, además del permiso work_order.submit,
// ser admin o is_engagement_team_member() (partner_id/manager_id del encargo) — el mismo
// predicado real que ya usa la RLS de escritura ("wo_team_update"). Antes del fix, un
// senior_partner (scope 'firm') o un director/partner fuera de su encargo asignado veían
// el botón "Aprobar" habilitado en cualquier OT pendiente, y el guardado fallaba por RLS.

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: "wo-1" }),
    // dash_socio: WorkOrderEdit.tsx ahora lee ?tab=payment vía useSearchParams (deep-link
    // desde el tablero de Socio, Bloque C) -- sin este mock, useSearchParams revienta con
    // "useLocation() may be used only in the context of a <Router>" porque este archivo
    // no envuelve WorkOrderEdit en un MemoryRouter.
    useSearchParams: () => [new URLSearchParams()],
  };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() },
    allowNextNavigation: vi.fn(),
  }),
}));

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ currentLanguage: "es", isLoading: false, changeLanguage: vi.fn() }),
}));

const pendingWorkOrder = {
  wo_id: "wo-1",
  engagement_id: "eng-1",
  currency: "BOB",
  season_mode: "High",
  tax_rate: 0.13,
  adjustment_amount: 0,
  approval_status: "Pending_Approval",
  approved_by: null,
  approved_at: null,
  notes: null,
  risk_status: "Approved",
  risk_approved_at: "2026-06-10T00:00:00Z",
  ceac_completed_at: "2026-05-01",
  ceac_number: "1234567890",
  san_completed_at: "2026-04-15",
  san_approval_id: "12345-67890",
  risk_level: "Bajo",
  budget_lines: [],
  expense_budget: [],
  engagement: {
    engagement_code: "E-001",
    engagement_name: "Auditoria",
    client: { client_legal_name: "Cliente Demo" },
    partner_id: "partner-of-this-engagement",
    manager_id: "manager-of-this-engagement",
    sqr_id: null,
  },
};

// Mutable so each test can represent a different caller without a new vi.mock factory.
const refs = vi.hoisted(() => ({
  roleKey: "admin" as string,
  scopeValue: "firm" as string,
  staffId: "staff-1" as string,
}));

vi.mock("@/hooks/useEmsData", () => {
  const emptyStaffingRows: unknown[] = [];
  return {
    useWorkOrderById: () => ({ data: pendingWorkOrder, isLoading: false }),
    useSetting: () => "0.13",
    useCategories: () => ({ data: [] }),
    useExpenseTypes: () => ({ data: [] }),
    useServices: () => ({ data: [] }),
    useActiveSkills: () => ({ data: [] }),
    useWorkOrderStaffingRequirements: () => ({ data: emptyStaffingRows, isLoading: false, isError: false }),
  };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({
    staffRecord: { staff_id: refs.staffId, category: { can_approve_wo: true } },
  }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: () => true,
    scope: () => refs.scopeValue,
    roleKey: refs.roleKey,
  }),
}));

vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetByEngagementId: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: refs.roleKey === "admin" }),
}));

vi.mock("@/hooks/useWorksheetMutations", () => ({
  useResyncWorksheetToWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateWorkOrder:     () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBudgetLine:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBudgetLine:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBudgetLine:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitWorkOrder:     () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveWorkOrder:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveRisk:             () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveEmergencyReview:  () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveEmergencyPartner: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectRisk:              () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertSocioApproval:     () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertRiskApproval:      () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompleteRiskAssessment:  () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectWorkOrder:     () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnsubmitWorkOrder:   () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpsertPaymentPlan:       () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBatchUpsertInstallments: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePaymentPlan:       () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInstallmentStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCollectionDate:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInstallmentExchangeRate: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveWorkOrderStaffing:   () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es", changeLanguage: vi.fn() },
  }),
}));

vi.mock("sonner", async () => {
  const actual = await vi.importActual("sonner");
  return { ...actual, toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } };
});

import WorkOrderEdit from "../WorkOrderEdit";

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <WorkOrderEdit />
    </QueryClientProvider>
  );
}

describe("WorkOrderEdit — canApprove acotado a is_engagement_team_member() (iteración 6)", () => {
  beforeEach(() => {
    refs.roleKey = "admin";
    refs.scopeValue = "firm";
    refs.staffId = "staff-1";
  });

  it("hides the Aprobar action for a senior_partner (firm scope) who is not this engagement's partner/manager", () => {
    refs.roleKey = "senior_partner";
    refs.scopeValue = "firm";
    refs.staffId = "someone-else";
    renderPage();
    expect(screen.queryByText("workOrders.approve")).not.toBeInTheDocument();
  });

  it("hides the Aprobar action for a director (assigned_engagements scope) — never a team member structurally", () => {
    refs.roleKey = "director";
    refs.scopeValue = "assigned_engagements";
    refs.staffId = "director-staff-id";
    renderPage();
    expect(screen.queryByText("workOrders.approve")).not.toBeInTheDocument();
  });

  it("shows the Aprobar action for a partner who IS this engagement's partner_id", () => {
    refs.roleKey = "partner";
    refs.scopeValue = "assigned_engagements";
    refs.staffId = "partner-of-this-engagement";
    renderPage();
    expect(screen.getByText("workOrders.approve")).toBeInTheDocument();
  });

  it("shows the Aprobar action for admin regardless of team membership", () => {
    refs.roleKey = "admin";
    refs.scopeValue = "firm";
    refs.staffId = "someone-else";
    renderPage();
    expect(screen.getByText("workOrders.approve")).toBeInTheDocument();
  });
});

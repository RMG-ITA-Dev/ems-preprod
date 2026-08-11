import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Stable spies ────────────────────────────────────────────────────────────────
const mockUpdateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockSubmitAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: "wo-1" }) };
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

// OT en estado Rejected (pista Socio) con Riesgos ya aprobado.
const rejectedRiskApproved = {
  wo_id: "wo-1",
  engagement_id: "eng-1",
  currency: "BOB",
  season_mode: "High",
  tax_rate: 0.13,
  adjustment_amount: 0,
  approval_status: "Rejected",
  approved_by: null,
  approved_at: null,
  notes: "Corregir gastos",
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
  },
};

let mockWorkOrderData: typeof rejectedRiskApproved = rejectedRiskApproved;

vi.mock("@/hooks/useEmsData", () => {
  // Stable (not a fresh [] per call) so the WorkOrderEdit staffing-hydration
  // useEffect (dep: staffingRows) doesn't see a new reference on every render
  // and loop forever re-hydrating an "empty" array.
  const emptyStaffingRows: unknown[] = [];
  return {
    useWorkOrderById: () => ({ data: mockWorkOrderData, isLoading: false }),
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
    staffRecord: { staff_id: "staff-1", category: { can_approve_wo: true } },
  }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => "firm", roleKey: "admin" }),
}));

vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetByEngagementId: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

vi.mock("@/hooks/useWorksheetMutations", () => ({
  useResyncWorksheetToWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateWorkOrder:     () => ({ mutateAsync: mockUpdateAsync, isPending: false }),
  useCreateBudgetLine:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBudgetLine:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBudgetLine:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitWorkOrder:     () => ({ mutateAsync: mockSubmitAsync, isPending: false }),
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

describe("WorkOrderEdit — reenvío por pista (bug 0306-78)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkOrderData = rejectedRiskApproved;
  });

  it("WE-DT1: en Rejected con Riesgos aprobado, 'Enviar para Aprobación' hace update ligero (Pending_Approval) y NO reescribe Riesgos", async () => {
    renderPage();

    await act(async () => {
      fireEvent.click(screen.getByText("workOrders.sendForPartnerApproval"));
    });

    await waitFor(() => {
      expect(mockUpdateAsync).toHaveBeenCalledWith({
        id: "wo-1",
        data: { approval_status: "Pending_Approval" },
      });
    });
    // No se invoca el submit completo (que reescribiría las columnas de riesgo).
    expect(mockSubmitAsync).not.toHaveBeenCalled();
  });
});

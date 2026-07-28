import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Stable spies for mutations ────────────────────────────────────────────────
const mockApproveAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockApproveRiskAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockApproveEmergencyReviewAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockApproveEmergencyPartnerAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockRejectRiskAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockCompleteRiskAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

// Capture the latest props WorkOrderEdit passes to WorkOrderForm.
// The mock is hoisted so it runs before any import of WorkOrderEdit.
let capturedFormProps: Record<string, any> = {};
vi.mock("@/components/forms/WorkOrderForm", () => ({
  WorkOrderForm: (props: any) => {
    capturedFormProps = props;
    return <div data-testid="work-order-form" />;
  },
}));

// ── Routing ───────────────────────────────────────────────────────────────────
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: "wo-1" }) };
});

// ── Page-leave lock ───────────────────────────────────────────────────────────
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() },
    allowNextNavigation: vi.fn(),
  }),
}));

// ── Data hooks ────────────────────────────────────────────────────────────────
const mockWorkOrder = {
  wo_id: "wo-1",
  engagement_id: "eng-1",
  currency: "BOB",
  season_mode: "High",
  tax_rate: 0.13,
  adjustment_amount: 0,
  approval_status: "Pending_Approval",
  approved_by: null,
  approved_at: null,
  ceac_completed_at: "2026-05-01",
  ceac_notes: "CEAC ok",
  san_completed_at: "2026-04-15",
  san_notes: null,
  ceac_number: "1234567890",
  san_approval_id: "12345-67890",
  risk_level: "Bajo",
  risk_status: "Pending",
  emergency_deadline_at: null,
  budget_lines: [],
  expense_budget: [],
  engagement: {
    engagement_code: "E-001",
    engagement_name: "Auditoria",
    client: { client_legal_name: "Cliente Demo" },
  },
};

vi.mock("@/hooks/useEmsData", () => ({
  useWorkOrderById: () => ({ data: mockWorkOrder, isLoading: false }),
  useSetting: () => "0.13",
  useCategories: () => ({ data: [] }),
  useExpenseTypes: () => ({ data: [] }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({
    staffRecord: { staff_id: "staff-1", category: { can_approve_wo: true } },
  }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => "firm", roleKey: "admin" }),
}));

// Administrator => Riesgos approver.
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetByEngagementId: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useWorksheetMutations", () => ({
  useResyncWorksheetToWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveWorkOrder: () => ({ mutateAsync: mockApproveAsync, isPending: false }),
  useApproveRisk: () => ({ mutateAsync: mockApproveRiskAsync, isPending: false }),
  useApproveEmergencyReview: () => ({ mutateAsync: mockApproveEmergencyReviewAsync, isPending: false }),
  useApproveEmergencyPartner: () => ({ mutateAsync: mockApproveEmergencyPartnerAsync, isPending: false }),
  useRejectRisk: () => ({ mutateAsync: mockRejectRiskAsync, isPending: false }),
  useRevertSocioApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertRiskApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompleteRiskAssessment: () => ({ mutateAsync: mockCompleteRiskAsync, isPending: false }),
  useRejectWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnsubmitWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpsertPaymentPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBatchUpsertInstallments: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePaymentPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInstallmentStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCollectionDate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

vi.mock("sonner", async () => {
  const actual = await vi.importActual("sonner");
  return { ...actual, toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } };
});

// ── Import under test ─────────────────────────────────────────────────────────
import WorkOrderEdit from "../WorkOrderEdit";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkOrderEdit — Risk dual-track + emergency (feat/0306-78)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFormProps = {};
  });

  it("WE1: hydrates CEAC/SAN state and passes risk_status/emergency props to WorkOrderForm", () => {
    renderPage();
    expect(capturedFormProps.ceacCompletedAt).toBe("2026-05-01");
    expect(capturedFormProps.ceacNotes).toBe("CEAC ok");
    expect(capturedFormProps.sanCompletedAt).toBe("2026-04-15");
    expect(capturedFormProps.ceacNumber).toBe("1234567890");
    expect(capturedFormProps.sanApprovalId).toBe("12345-67890");
    expect(capturedFormProps.riskLevel).toBe("Bajo");
    expect(capturedFormProps.riskStatus).toBe("Pending");
    expect(capturedFormProps.emergencyDeadlineAt).toBeNull();
  });

  it("WE2: handleApprove (Socio) calls mutateAsync without risk fields", async () => {
    renderPage();
    await act(async () => {
      await capturedFormProps.onApprove();
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockApproveAsync).toHaveBeenCalledWith({
      woId: "wo-1",
      staffId: "staff-1",
    });
  });

  it("WE3: canApproveRisk reflects isAdmin && staffRecord", () => {
    renderPage();
    expect(capturedFormProps.canApproveRisk).toBe(true);
  });

  it("WE4: handleApproveRisk calls useApproveRisk (single normal sign-off)", async () => {
    renderPage();
    await act(async () => {
      await capturedFormProps.onApproveRisk();
    });
    expect(mockApproveRiskAsync).toHaveBeenCalledWith({
      woId: "wo-1",
      staffId: "staff-1",
    });
  });

  it("WE5: emergency two-step handlers call the right mutations", async () => {
    renderPage();
    await act(async () => {
      await capturedFormProps.onApproveEmergencyReview();
    });
    expect(mockApproveEmergencyReviewAsync).toHaveBeenCalledWith({
      woId: "wo-1",
      staffId: "staff-1",
    });
    await act(async () => {
      await capturedFormProps.onApproveEmergencyPartner();
    });
    expect(mockApproveEmergencyPartnerAsync).toHaveBeenCalledWith({
      woId: "wo-1",
      staffId: "staff-1",
    });
  });

  it("WE6: handleRejectRisk calls useRejectRisk with the notes", async () => {
    renderPage();
    await act(async () => {
      await capturedFormProps.onRejectRisk("Falta documentación");
    });
    expect(mockRejectRiskAsync).toHaveBeenCalledWith({
      woId: "wo-1",
      riskNotes: "Falta documentación",
    });
  });

  it("WE7: emergency two-step + completion props are passed to WorkOrderForm", () => {
    renderPage();
    expect(typeof capturedFormProps.onApproveEmergencyReview).toBe("function");
    expect(typeof capturedFormProps.onApproveEmergencyPartner).toBe("function");
    expect(typeof capturedFormProps.onCompleteRisk).toBe("function");
    expect(capturedFormProps.onEmergencyApprove).toBeUndefined();
  });

  it("WE8: isDirty becomes true after onRiskAssessmentChange modifies CEAC date", async () => {
    renderPage();
    expect(capturedFormProps.isDirty).toBe(false);
    await act(async () => {
      capturedFormProps.onRiskAssessmentChange("ceacCompletedAt", "2026-06-01");
    });
    expect(capturedFormProps.isDirty).toBe(true);
  });
});

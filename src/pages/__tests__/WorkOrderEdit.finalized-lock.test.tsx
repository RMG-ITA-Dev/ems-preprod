import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * BUG 0817-178 — con el encargo 7 Finalizado la OT es de solo lectura para todos menos el admin:
 * sin Guardar/Enviar/Aprobar, sin Riesgos ni firma de emergencia, y sin la corrección en sitio de
 * una OT Rechazada. La cobranza (estado de cuota, facturar gastos, notas, confirmar/reprogramar)
 * sigue: es trabajo posterior a la entrega.
 */

const refs = vi.hoisted(() => ({
  roleKey: "manager" as string,
  staffId: "manager-of-this-engagement" as string,
  override: 7 as number | null,
  approvalStatus: "Draft" as string,
  // Referencia estable entre renders (un objeto nuevo por render dispara los efectos en loop);
  // se rearma en beforeEach.
  workOrder: null as any,
}));

let capturedFormProps: Record<string, any> = {};
vi.mock("@/components/forms/WorkOrderForm", () => ({
  WorkOrderForm: (props: any) => {
    capturedFormProps = props;
    return <div data-testid="work-order-form" />;
  },
  WorkOrderStatusBadge: () => null,
  WorkOrderTrackStatus: () => null,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: "wo-1" }),
    useSearchParams: () => [new URLSearchParams()],
    useLocation: () => ({ key: "default", pathname: "/work-orders/wo-1", search: "" }),
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

function makeWorkOrder() {
  const approved = refs.approvalStatus === "Approved";
  return {
    wo_id: "wo-1",
    engagement_id: "eng-1",
    currency: "BOB",
    season_mode: "High",
    tax_rate: 0.13,
    adjustment_amount: 0,
    approval_status: refs.approvalStatus,
    approved_by: null,
    approved_at: approved ? "2026-06-10T00:00:00Z" : null,
    notes: null,
    risk_status: approved ? "Approved" : "Pending",
    budget_lines: [],
    expense_budget: [],
    engagement: {
      engagement_id: "eng-1",
      engagement_code: "E-001",
      engagement_name: "Auditoria",
      client: { client_legal_name: "Cliente Demo" },
      partner_id: "partner-of-this-engagement",
      manager_id: "manager-of-this-engagement",
      sqr_id: null,
      funcion: 1,
      work_order_required: true,
      engagement_state_override: refs.override,
    },
  };
}

vi.mock("@/hooks/useEmsData", () => {
  const staffingRows = [{ id: "req-1", category_id: "cat-1", staff_count: 1, requirement_skills: [] }];
  const stableStaffing = { data: staffingRows, isLoading: false, isError: false };
  const empty = { data: [] };
  return {
    useWorkOrderById: () => {
      if (!refs.workOrder) refs.workOrder = makeWorkOrder();
      return { data: refs.workOrder, isLoading: false };
    },
    useSetting: () => "0.13",
    useCategories: () => empty,
    useExpenseTypes: () => empty,
    useServices: () => empty,
    useActiveSkills: () => empty,
    useWorkOrderStaffingRequirements: () => stableStaffing,
  };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: refs.staffId, category: { can_approve_wo: true } } }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => "firm", roleKey: refs.roleKey }),
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

vi.mock("@/hooks/mutations", () => {
  // Mismo barrel que WorkOrderEdit.approveScope.test.tsx; todos devuelven el mismo stub.
  const m = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    useUpdateWorkOrder: m,
    useCreateBudgetLine: m,
    useUpdateBudgetLine: m,
    useDeleteBudgetLine: m,
    useCreateExpenseBudget: m,
    useUpdateExpenseBudget: m,
    useDeleteExpenseBudget: m,
    useSubmitWorkOrder: m,
    useApproveWorkOrder: m,
    useApproveRisk: m,
    useApproveEmergencyReview: m,
    useApproveEmergencyPartner: m,
    useRejectRisk: m,
    useRevertSocioApproval: m,
    useRevertRiskApproval: m,
    useCompleteRiskAssessment: m,
    useRejectWorkOrder: m,
    useUnsubmitWorkOrder: m,
    useUpsertPaymentPlan: m,
    useBatchUpsertInstallments: m,
    useDeletePaymentPlan: m,
    useUpdateInstallmentStatus: m,
    useUpdateCollectionDate: m,
    useUpdateInstallmentExchangeRate: m,
    useRescheduleInstallment: m,
    useRecordInstallmentConfirmation: m,
    useAddInstallmentNote: m,
    useEditInstallmentNote: m,
    useDeleteInstallmentNote: m,
    useSaveWorkOrderStaffing: m,
    useCreateExpenseReimbursementRow: m,
    useSetExpenseReimbursementAmount: m,
    useAddInstallmentAdjustment: m,
    useDeleteInstallmentAdjustment: m,
    useSetInstallmentCurrency: m,
  };
});

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es", changeLanguage: vi.fn() } }),
}));

vi.mock("sonner", async () => {
  const actual = await vi.importActual("sonner");
  return { ...actual, toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } };
});

import WorkOrderEdit from "../WorkOrderEdit";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WorkOrderEdit />
    </QueryClientProvider>,
  );
}

describe("WorkOrderEdit — encargo Finalizado (BUG 0817-178)", () => {
  beforeEach(() => {
    capturedFormProps = {};
    refs.workOrder = null;
    refs.roleKey = "manager";
    refs.staffId = "manager-of-this-engagement";
    refs.override = 7;
    refs.approvalStatus = "Draft";
  });

  it("Gerente del encargo, OT en Draft: solo lectura completa con aviso", () => {
    renderPage();
    expect(screen.getByText("engagement.finalizedNotice")).toBeInTheDocument();
    expect(capturedFormProps.isLocked).toBe(true);
    expect(capturedFormProps.engagementFinalizedLock).toBe(true);
    expect(capturedFormProps.canApprove).toBe(false);
    expect(capturedFormProps.canApproveRisk).toBe(false);
    expect(capturedFormProps.canSignEmergency).toBe(false);
  });

  it("OT Rechazada: apaga también la corrección en sitio de la pista Socio", () => {
    refs.approvalStatus = "Rejected";
    renderPage();
    expect(capturedFormProps.engagementFinalizedLock).toBe(true);
  });

  it("cobranza sigue: collections_analyst conserva estado de cuota, facturar gastos y notas", () => {
    refs.roleKey = "collections_analyst";
    refs.staffId = "collections-staff";
    refs.approvalStatus = "Approved";
    renderPage();
    expect(capturedFormProps.isStatusEditable).toBe(true);
    expect(capturedFormProps.canBillExpenses).toBe(true);
    expect(capturedFormProps.canWriteNotes).toBe(true);
  });

  it("el Gerente conserva confirmar/reprogramar cuotas (canEditPaymentPlan) aunque la estructura quede bloqueada", () => {
    refs.approvalStatus = "Approved";
    renderPage();
    expect(capturedFormProps.canEditPaymentPlan).toBe(true);
    expect(capturedFormProps.isLocked).toBe(true);
  });

  it("admin: no queda bloqueado", () => {
    refs.roleKey = "admin";
    refs.staffId = "someone-else";
    renderPage();
    expect(screen.queryByText("engagement.finalizedNotice")).not.toBeInTheDocument();
    expect(capturedFormProps.isLocked).toBe(false);
    expect(capturedFormProps.engagementFinalizedLock).toBe(false);
    expect(capturedFormProps.canApprove).toBe(true);
  });

  it("encargo no finalizado: comportamiento sin cambios", () => {
    refs.override = null;
    renderPage();
    expect(screen.queryByText("engagement.finalizedNotice")).not.toBeInTheDocument();
    expect(capturedFormProps.isLocked).toBe(false);
    expect(capturedFormProps.engagementFinalizedLock).toBe(false);
    expect(capturedFormProps.canApprove).toBe(true);
  });
});

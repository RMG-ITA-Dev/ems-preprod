import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 0722-156b (Fase 2): hidratación y guardado de exchange_rate_mode / invoice_exchange_rate /
// payment_exchange_rate en WorkOrderEdit. Mismo harness que WorkOrderEdit.risk-assessment.test.tsx
// (captura los props que llegan a WorkOrderForm en vez de manejar dialogs reales).

const mockUpsertPaymentPlanAsync = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    plan_id: "plan-1",
    wo_id: "wo-1",
    exchange_rate: 6.96,
    payment_days: 30,
    exchange_rate_mode: "fijo",
  }),
);
const mockBatchUpsertInstallmentsAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockUpdateWorkOrderAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

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

// currency=USD (mode/TC boxes only apply to non-BOB currencies); Fijo plan with 2
// installments — inst-1 already Invoiced (frozen invoice_exchange_rate), inst-2 still Pending.
const mockWorkOrder = {
  wo_id: "wo-1",
  engagement_id: "eng-1",
  currency: "USD",
  season_mode: "High",
  tax_rate: 0.13,
  adjustment_amount: 0,
  approval_status: "Draft",
  approved_by: null,
  approved_at: null,
  budget_lines: [],
  expense_budget: [],
  engagement: {
    engagement_code: "E-001",
    engagement_name: "Auditoria",
    client: { client_legal_name: "Cliente Demo" },
  },
  payment_plan: {
    plan_id: "plan-1",
    wo_id: "wo-1",
    exchange_rate: 6.96,
    payment_days: 30,
    exchange_rate_mode: "variable",
    installments: [
      {
        installment_id: "inst-1",
        plan_id: "plan-1",
        wo_id: "wo-1",
        installment_number: 1,
        agreed_invoice_date: "2026-08-01",
        agreed_payment_date: "2026-08-31",
        collection_invoice_date: "2026-08-01",
        collection_payment_date: "2026-08-31",
        payment_date_actual: null,
        percentage: 50,
        amount: 500,
        status: "Invoiced",
        invoice_exchange_rate: 6.95,
        payment_exchange_rate: null,
      },
      {
        installment_id: "inst-2",
        plan_id: "plan-1",
        wo_id: "wo-1",
        installment_number: 2,
        agreed_invoice_date: null,
        agreed_payment_date: null,
        collection_invoice_date: null,
        collection_payment_date: null,
        payment_date_actual: null,
        percentage: 50,
        amount: 500,
        status: "Pending",
        invoice_exchange_rate: null,
        payment_exchange_rate: null,
      },
    ],
  },
};

vi.mock("@/hooks/useEmsData", () => {
  // 0923-196: non-empty — Staffing is now required to submit for approval, and
  // this suite's focus (exchange rates) is orthogonal to Staffing state.
  const staffingRows = [{ id: "req-1", category_id: "cat-1", staff_count: 1, requirement_skills: [] }];
  return {
    useWorkOrderById: () => ({ data: mockWorkOrder, isLoading: false }),
    useSetting: () => "0.13",
    useCategories: () => ({ data: [] }),
    useExpenseTypes: () => ({ data: [] }),
    useServices: () => ({ data: [] }),
    useActiveSkills: () => ({ data: [] }),
    useWorkOrderStaffingRequirements: () => ({ data: staffingRows, isLoading: false, isError: false }),
  };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1", category: { can_approve_wo: true } } }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => "firm", roleKey: "admin" }),
}));

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
  useUpdateWorkOrder: () => ({ mutateAsync: mockUpdateWorkOrderAsync, isPending: false }),
  useCreateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveRisk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveEmergencyReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveEmergencyPartner: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectRisk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertSocioApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertRiskApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompleteRiskAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnsubmitWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpsertPaymentPlan: () => ({ mutateAsync: mockUpsertPaymentPlanAsync, isPending: false }),
  useBatchUpsertInstallments: () => ({ mutateAsync: mockBatchUpsertInstallmentsAsync, isPending: false }),
  useDeletePaymentPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInstallmentStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCollectionDate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveWorkOrderStaffing: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

import WorkOrderEdit from "../WorkOrderEdit";

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <WorkOrderEdit />
    </QueryClientProvider>,
  );
}

describe("WorkOrderEdit — payment plan exchange rates (0722-156b Fase 2)", () => {
  const originalApprovalStatus = mockWorkOrder.approval_status;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedFormProps = {};
    mockWorkOrder.approval_status = originalApprovalStatus;
  });

  // Amendment 2026-09-07: Cobranza/Estado/TC por cuota (isStatusEditable) solo se
  // habilitan una vez Approved -- antes de eso no hay boton "Guardar" de pagina para
  // persistir lo que se edite ahi (bug reportado 2026-09-05: "Sin guardar" sin salida).
  it("WEX0: isStatusEditable is false while Draft, even for an admin", () => {
    mockWorkOrder.approval_status = "Draft";
    renderPage();
    expect(capturedFormProps.isStatusEditable).toBe(false);
  });

  it("WEX0b: isStatusEditable is true for an admin once the WO is Approved", () => {
    mockWorkOrder.approval_status = "Approved";
    renderPage();
    expect(capturedFormProps.isStatusEditable).toBe(true);
  });

  it("WEX1: hydrates exchange_rate_mode and per-installment invoice/payment_exchange_rate into paymentPlan/paymentInstallments props", () => {
    renderPage();
    expect(capturedFormProps.paymentPlan?.exchange_rate_mode).toBe("variable");
    expect(capturedFormProps.paymentInstallments).toHaveLength(2);
    expect(capturedFormProps.paymentInstallments[0]).toMatchObject({
      installment_id: "inst-1",
      status: "Invoiced",
      invoice_exchange_rate: 6.95,
      payment_exchange_rate: null,
    });
    expect(capturedFormProps.paymentInstallments[1]).toMatchObject({
      installment_id: "inst-2",
      status: "Pending",
      invoice_exchange_rate: null,
      payment_exchange_rate: null,
    });
  });

  it("WEX2: saving in modo Fijo syncs invoice/payment_exchange_rate for the still-editable installment before calling batchUpsertInstallments, leaving the already-frozen one untouched", async () => {
    renderPage();

    // Switch the hydrated plan (variable) to Fijo with a specific TC, as the user would
    // via WorkOrderPaymentPlanSection's onPlanChange callback.
    act(() => {
      capturedFormProps.onPaymentPlanChange({
        plan_id: "plan-1",
        wo_id: "wo-1",
        exchange_rate: 7.0,
        payment_days: 30,
        exchange_rate_mode: "fijo",
      });
    });

    await act(async () => {
      await capturedFormProps.onSubmit();
    });

    expect(mockUpsertPaymentPlanAsync).toHaveBeenCalledWith(
      expect.objectContaining({ exchange_rate: 7.0, exchange_rate_mode: "fijo" }),
    );

    const sentInstallments = mockBatchUpsertInstallmentsAsync.mock.calls[0][0].installments;
    const inst1 = sentInstallments.find((i: any) => i.installment_id === "inst-1");
    const inst2 = sentInstallments.find((i: any) => i.installment_id === "inst-2");
    // inst-1 already Invoiced: invoice_exchange_rate stays frozen at its original 6.95,
    // never force-synced to the new plan rate (7.0) — otherwise the DB freeze trigger
    // would reject the whole batch upsert.
    expect(inst1.invoice_exchange_rate).toBe(6.95);
    // inst-2 still Pending: both columns sync to the new Fijo plan rate.
    expect(inst2.invoice_exchange_rate).toBe(7.0);
    expect(inst2.payment_exchange_rate).toBe(7.0);
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 0722-156b (Fase 2): creating a work order with a Fijo-mode payment plan must sync
// invoice_exchange_rate/payment_exchange_rate to the plan's TC for every (still-Pending,
// brand-new) installment before the batch upsert, and forward exchange_rate_mode on the
// plan upsert itself. Same capture-props harness as WorkOrderEdit's equivalent suite —
// WorkOrderForm is stubbed to expose the callbacks WorkOrderNew wires into it.

const mockCreateWorkOrderAsync = vi.hoisted(() => vi.fn().mockResolvedValue({ wo_id: "wo-new-1" }));
const mockUpsertPaymentPlanAsync = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    plan_id: "plan-new-1",
    wo_id: "wo-new-1",
    exchange_rate: 6.96,
    payment_days: 30,
    exchange_rate_mode: "fijo",
  }),
);
const mockBatchUpsertInstallmentsAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

let capturedFormProps: Record<string, any> = {};
vi.mock("@/components/forms/WorkOrderForm", () => ({
  WorkOrderForm: (props: any) => {
    capturedFormProps = props;
    return <div data-testid="work-order-form" />;
  },
}));

const mockNavigate = vi.fn();
let mockSearchParams = new URLSearchParams("?engagement=eng-own");
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams, vi.fn()],
    Link: ({ children }: any) => <span>{children}</span>,
  };
});

const CURRENT_STAFF_ID = "staff-me";
const activeEngagement = {
  engagement_id: "eng-own",
  status: "active",
  engagement_code: "E-001",
  engagement_name: "Auditoria",
  client: { client_legal_name: "Cliente Demo" },
  created_by_staff_id: CURRENT_STAFF_ID,
  // Decision del operador 2026-09-10: solo el gerente del encargo (o admin) puede
  // crear/editar el plan de pagos -- sin esto, canEditPaymentPlan da false y
  // WorkOrderNew ya no intenta persistir el plan (paymentInstallments > 0 pero
  // canEditPaymentPlan false), rompiendo este escenario que asume que quien crea
  // la OT SÍ puede configurar su plan de pagos.
  manager_id: CURRENT_STAFF_ID,
};

const stableCategories: never[] = [];
const stableWorkOrders: never[] = [];

vi.mock("@/hooks/useEmsData", () => ({
  useEngagements: () => ({ data: [activeEngagement] }),
  useWorkOrders: () => ({ data: stableWorkOrders }),
  useCategories: () => ({ data: stableCategories }),
  useSetting: () => "0.13",
}));

vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetByEngagementId: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: CURRENT_STAFF_ID }, isLoading: false }),
}));

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() },
    allowNextNavigation: vi.fn(),
  }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateWorkOrder: () => ({ mutateAsync: mockCreateWorkOrderAsync, isPending: false }),
  useCreateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpsertPaymentPlan: () => ({ mutateAsync: mockUpsertPaymentPlanAsync, isPending: false }),
  useBatchUpsertInstallments: () => ({ mutateAsync: mockBatchUpsertInstallmentsAsync, isPending: false }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => null,
}));

// Minimal stand-in: WorkOrderNew's confirm dialog lives outside WorkOrderForm (its
// AlertDialogAction is what actually calls handleConfirmCreate), so expose it as a plain
// button instead of driving the real Radix portal/focus-trap machinery.
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogCancel: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => (
    <button data-testid="confirm-create" onClick={onClick}>{children}</button>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false, isPartner: false, isDirector: false, isManager: true, isLoading: false }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => "assigned_engagements", roleKey: "manager", isLoading: false }),
}));

vi.mock("sonner", async () => {
  const actual = await vi.importActual("sonner");
  return { ...actual, toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } };
});

import WorkOrderNew from "../WorkOrderNew";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkOrderNew />
    </QueryClientProvider>,
  );
}

describe("WorkOrderNew — payment plan exchange rates (0722-156b Fase 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams("?engagement=eng-own");
    capturedFormProps = {};
  });

  it("NEX1: creating in modo Fijo syncs invoice/payment_exchange_rate to the plan's TC for a still-Pending installment, and forwards exchange_rate_mode on the plan upsert", async () => {
    const { getByTestId } = renderPage();

    act(() => {
      capturedFormProps.onPaymentPlanChange({
        wo_id: "",
        exchange_rate: 6.96,
        payment_days: 30,
        exchange_rate_mode: "fijo",
      });
      capturedFormProps.onPaymentInstallmentsChange([
        {
          wo_id: "",
          installment_number: 1,
          agreed_invoice_date: null,
          agreed_payment_date: null,
          collection_invoice_date: null,
          collection_payment_date: null,
          payment_date_actual: null,
          percentage: 100,
          amount: 1000,
          status: "Pending",
          invoice_exchange_rate: null,
          payment_exchange_rate: null,
        },
      ]);
    });

    act(() => {
      capturedFormProps.onSubmit();
    });

    await act(async () => {
      getByTestId("confirm-create").click();
    });

    expect(mockUpsertPaymentPlanAsync).toHaveBeenCalledWith(
      expect.objectContaining({ wo_id: "wo-new-1", exchange_rate: 6.96, exchange_rate_mode: "fijo" }),
    );
    const sentInstallments = mockBatchUpsertInstallmentsAsync.mock.calls[0][0].installments;
    expect(sentInstallments).toHaveLength(1);
    expect(sentInstallments[0].invoice_exchange_rate).toBe(6.96);
    expect(sentInstallments[0].payment_exchange_rate).toBe(6.96);
  });
});

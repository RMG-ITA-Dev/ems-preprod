import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PaymentInstallmentInput, PaymentPlanInput } from "@/types/workOrderPaymentPlan";

// 0817-176: Organizar la Orden de Trabajo en pestañas — ver bugs/0817-176/plan_v2.md.

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: [] }),
  useExpenseTypes: () => ({ data: [] }),
  useSetting: () => null,
}));

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ currentLanguage: "es" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

// Radix Select requires PointerEvent APIs not available in jsdom — replace with
// native elements so JSDOM can render/interact without polyfills (same pattern as
// the sibling WorkOrderForm.*.test.tsx files).
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectGroup: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectLabel: () => null,
  SelectScrollUpButton: () => null,
  SelectScrollDownButton: () => null,
  SelectSeparator: () => null,
}));

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;
  if (!Element.prototype.hasPointerCapture) {
    (Element.prototype as any).hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    (Element.prototype as any).setPointerCapture = () => undefined;
  }
  if (!Element.prototype.releasePointerCapture) {
    (Element.prototype as any).releasePointerCapture = () => undefined;
  }
  (Element.prototype as any).scrollIntoView = vi.fn();
});

// ── Import under test (after all vi.mock hoists) ───────────────────────────────
import { WorkOrderForm } from "../WorkOrderForm";

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeQC = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const baseProps = {
  currency: "BOB" as const,
  seasonMode: "High" as const,
  approvalStatus: "Draft" as const,
  adjustmentAmount: 0,
  taxRate: 0.13,
  budgetLines: [],
  expenseBudget: [],
  isNew: false,
  isDirty: false,
  onCurrencyChange: vi.fn(),
  onSeasonChange: vi.fn(),
  onAdjustmentChange: vi.fn(),
  onBudgetLinesChange: vi.fn(),
  onExpenseBudgetChange: vi.fn(),
  onSubmit: vi.fn(),
  isLocked: false,
  canApprove: false,
  isSubmitting: false,
};

type FormOverrides = Partial<Parameters<typeof WorkOrderForm>[0]>;

function renderForm(overrides: FormOverrides = {}) {
  const props = { ...baseProps, ...overrides } as Parameters<typeof WorkOrderForm>[0];
  return render(
    <QueryClientProvider client={makeQC()}>
      <WorkOrderForm {...props} />
    </QueryClientProvider>,
  );
}

const fullRisk = {
  ceacCompletedAt: "2026-05-01",
  ceacNumber: "1234567890",
  sanCompletedAt: "2026-04-15",
  sanApprovalId: "12345-67890",
  riskLevel: "Bajo",
};

// Same anchor used by src/lib/__tests__/workOrderPaymentPlan.test.ts: "today" pinned
// to America/La_Paz (matches production, independent of the CI runner's timezone).
function dayOffset(offsetDays: number): string {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  const d = new Date(`${todayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const completePlan: PaymentPlanInput = { wo_id: "wo-1", exchange_rate: null, payment_days: 30 };

function makeInstallment(overrides: Partial<PaymentInstallmentInput> = {}): PaymentInstallmentInput {
  return {
    wo_id: "wo-1",
    installment_number: 1,
    agreed_invoice_date: dayOffset(-60),
    agreed_payment_date: dayOffset(-30),
    collection_invoice_date: null,
    collection_payment_date: null,
    payment_date_actual: null,
    percentage: 100,
    amount: 1000,
    status: "Pending",
    ...overrides,
  };
}

function getTabTrigger(tabKey: "budget" | "payment" | "risk" | "staffing") {
  return screen.getByText(`workOrders.tabs.${tabKey}`).closest("button")!;
}

function hasIndicator(trigger: HTMLElement, statusKey: string) {
  return !!trigger.querySelector(`[aria-label="workOrders.tabs.status.${statusKey}"]`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkOrderForm — Tabs (0817-176)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("T1: renders the 4 expected tab triggers, with Budget active by default", () => {
    renderForm();
    expect(getTabTrigger("budget")).toHaveAttribute("data-state", "active");
    expect(getTabTrigger("payment")).toHaveAttribute("data-state", "inactive");
    expect(getTabTrigger("risk")).toHaveAttribute("data-state", "inactive");
    expect(getTabTrigger("staffing")).toHaveAttribute("data-state", "inactive");
  });

  it("T2: /work-orders/new (isNew) keeps the vertical layout — no tabs rendered", () => {
    renderForm({ isNew: true });
    expect(screen.queryByText("workOrders.tabs.budget")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("T3: Risk tab content is always present, even with no data and no risk-approver role", () => {
    renderForm({ approvalStatus: "Approved", canApproveRisk: false });
    expect(screen.getByText("workOrders.riskAssessment")).toBeInTheDocument();
  });

  it("T4: with the Scheduler flag off, only 3 tabs render (no Staffing)", () => {
    vi.stubEnv("VITE_SCHEDULER_ENABLED", "false");
    try {
      renderForm({ onStaffingRequirementsChange: vi.fn() });
      expect(screen.queryByText("workOrders.tabs.staffing")).not.toBeInTheDocument();
      expect(screen.getAllByRole("tab")).toHaveLength(3);
    } finally {
      vi.stubEnv("VITE_SCHEDULER_ENABLED", "true");
    }
  });

  it("T5: switching to the Risk tab shows the Riesgos action box; Socio box lives in Budget (tab 1)", async () => {
    const user = userEvent.setup();
    renderForm({
      approvalStatus: "Pending_Approval",
      canApprove: true,
      onApprove: vi.fn(),
      onReject: vi.fn(),
      canApproveRisk: true,
      onApproveRisk: vi.fn(),
      onRejectRisk: vi.fn(),
      ...fullRisk,
    });
    // Budget tab is active by default: Socio box visible.
    expect(screen.getByText("workOrders.approve")).toBeInTheDocument();
    await user.click(await screen.findByRole("tab", { name: /workOrders\.tabs\.risk/ }));
    expect(screen.getByText("workOrders.approveRisk")).toBeInTheDocument();
  });

  it("T6: the global footer (Cancel) stays present regardless of the active tab", async () => {
    const user = userEvent.setup();
    renderForm({ onCancel: vi.fn() });
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
    await user.click(await screen.findByRole("tab", { name: /workOrders\.tabs\.payment/ }));
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
  });

  // ── Indicadores ──────────────────────────────────────────────────────────────

  it("T7: incomplete risk data shows a warning on tab 3; a complete submission clears it", () => {
    const { rerender } = renderForm({
      approvalStatus: "Draft",
      onRiskAssessmentChange: vi.fn(),
      ceacCompletedAt: "2026-05-01", // partial only
    });
    expect(hasIndicator(getTabTrigger("risk"), "incomplete")).toBe(true);

    rerender(
      <QueryClientProvider client={makeQC()}>
        <WorkOrderForm
          {...(baseProps as any)}
          approvalStatus="Draft"
          onRiskAssessmentChange={vi.fn()}
          {...fullRisk}
        />
      </QueryClientProvider>,
    );
    expect(hasIndicator(getTabTrigger("risk"), "incomplete")).toBe(false);
  });

  it("T8: Riesgos rechazado muestra ✗ en pest.3 y auto-abre esa pestaña al montar", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      riskStatus: "Rejected",
      riskNote: "Corrige el SAN",
      onRiskAssessmentChange: vi.fn(),
      onCompleteRisk: vi.fn(),
    });
    expect(hasIndicator(getTabTrigger("risk"), "rejected")).toBe(true);
    expect(getTabTrigger("risk")).toHaveAttribute("data-state", "active");
  });

  it("T9: incomplete payment plan shows a warning on tab 2; a fully-filled plan shows a checkmark", () => {
    const incompleteInstallments = [makeInstallment({ agreed_invoice_date: null, agreed_payment_date: null })];
    const { rerender } = renderForm({
      approvalStatus: "Draft",
      paymentPlan: completePlan,
      paymentInstallments: incompleteInstallments,
      onPaymentPlanChange: vi.fn(),
      onPaymentInstallmentsChange: vi.fn(),
    });
    expect(hasIndicator(getTabTrigger("payment"), "incomplete")).toBe(true);

    const completeInstallments = [makeInstallment()];
    rerender(
      <QueryClientProvider client={makeQC()}>
        <WorkOrderForm
          {...(baseProps as any)}
          approvalStatus="Draft"
          paymentPlan={completePlan}
          paymentInstallments={completeInstallments}
          onPaymentPlanChange={vi.fn()}
          onPaymentInstallmentsChange={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(hasIndicator(getTabTrigger("payment"), "approved")).toBe(true);
  });

  it("T10: Socio aprobado muestra ✓ en pest.1", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      approvedAt: "2026-06-19T10:00:00Z",
    });
    expect(hasIndicator(getTabTrigger("budget"), "approved")).toBe(true);
  });

  it("T11: 'aún no revisada' en pest.1/4 se limpia al visitar la pestaña", async () => {
    const user = userEvent.setup();
    // Riesgos rechazado abre pest.3 al montar (tras un "Retirar" que volvió la OT a
    // Draft), dejando pest.1 (Socio, aún sin decidir) sin visitar todavía.
    renderForm({
      approvalStatus: "Draft",
      riskStatus: "Rejected",
      onRiskAssessmentChange: vi.fn(),
      onCompleteRisk: vi.fn(),
    });
    expect(hasIndicator(getTabTrigger("budget"), "notReviewed")).toBe(true);
    await user.click(getTabTrigger("budget"));
    expect(hasIndicator(getTabTrigger("budget"), "notReviewed")).toBe(false);
  });

  it("T12: 'aún no revisada' en pest.1/4 se limpia al pulsar Enviar para Aprobación", async () => {
    const user = userEvent.setup();
    renderForm({
      approvalStatus: "Draft",
      onSubmitForApproval: vi.fn(),
      onRiskAssessmentChange: vi.fn(),
      onStaffingRequirementsChange: vi.fn(),
      ...fullRisk, // evita el diálogo de emergencia
    });
    expect(hasIndicator(getTabTrigger("staffing"), "notReviewed")).toBe(true);
    await user.click(screen.getByText("workOrders.submitForApproval").closest("button")!);
    expect(hasIndicator(getTabTrigger("staffing"), "notReviewed")).toBe(false);
  });

  it("T13: OT totalmente aprobada con toda la cobranza al 100% muestra ✓ en pest.4 y ✓ (check) en pest.2", () => {
    renderForm({
      approvalStatus: "Approved",
      approvedAt: "2026-06-19T10:00:00Z",
      riskStatus: "Approved",
      paymentPlan: completePlan,
      paymentInstallments: [makeInstallment({ status: "Completed", payment_date_actual: dayOffset(-1) })],
      onPaymentPlanChange: vi.fn(),
      onPaymentInstallmentsChange: vi.fn(),
      onStaffingRequirementsChange: vi.fn(),
    });
    expect(hasIndicator(getTabTrigger("staffing"), "approved")).toBe(true);
    expect(hasIndicator(getTabTrigger("payment"), "billingComplete")).toBe(true);
  });

  it("T13b: ☼ es rojo cuando una cuota sin cobrar tiene la fecha de PAGO por vencer/vencida tras la aprobación total", () => {
    renderForm({
      approvalStatus: "Approved",
      approvedAt: "2026-06-19T10:00:00Z",
      riskStatus: "Approved",
      paymentPlan: completePlan,
      paymentInstallments: [makeInstallment({ status: "Invoiced", agreed_payment_date: dayOffset(3) })],
      onPaymentPlanChange: vi.fn(),
      onPaymentInstallmentsChange: vi.fn(),
    });
    expect(hasIndicator(getTabTrigger("payment"), "billingAlert")).toBe(true);
  });

  it("T13c: ☼ es verde (en proceso) cuando hay cuotas facturadas pero sin pagos en riesgo", () => {
    renderForm({
      approvalStatus: "Approved",
      approvedAt: "2026-06-19T10:00:00Z",
      riskStatus: "Approved",
      paymentPlan: completePlan,
      paymentInstallments: [makeInstallment({ status: "Invoiced", agreed_payment_date: dayOffset(45) })],
      onPaymentPlanChange: vi.fn(),
      onPaymentInstallmentsChange: vi.fn(),
    });
    expect(hasIndicator(getTabTrigger("payment"), "billingOk")).toBe(true);
  });

  it("T14: Pending_Approval (enviada) no muestra indicador en ninguna pestaña sin pista decidida", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      riskStatus: "Pending",
      ...fullRisk,
      onStaffingRequirementsChange: vi.fn(),
    });
    expect(hasIndicator(getTabTrigger("budget"), "notReviewed")).toBe(false);
    expect(hasIndicator(getTabTrigger("budget"), "approved")).toBe(false);
    expect(hasIndicator(getTabTrigger("risk"), "incomplete")).toBe(false);
    expect(hasIndicator(getTabTrigger("staffing"), "notReviewed")).toBe(false);
  });

  it("T15: riskFocusSignal activa la pestaña de Riesgos (auto-switch de validación)", () => {
    const { rerender } = renderForm({ onRiskAssessmentChange: vi.fn(), riskFocusSignal: 0 });
    expect(getTabTrigger("budget")).toHaveAttribute("data-state", "active");
    rerender(
      <QueryClientProvider client={makeQC()}>
        <WorkOrderForm {...(baseProps as any)} onRiskAssessmentChange={vi.fn()} riskFocusSignal={1} />
      </QueryClientProvider>,
    );
    expect(getTabTrigger("risk")).toHaveAttribute("data-state", "active");
  });
});

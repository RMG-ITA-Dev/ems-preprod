import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

// Prevent Supabase client from being imported in the mutation hook
vi.mock("@/hooks/mutations", () => ({
  useUpdateInstallmentStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Radix Select requires PointerEvent APIs not available in jsdom
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
    <div data-testid="select" data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children, disabled }: { value?: string; children?: React.ReactNode; disabled?: boolean }) => (
    <option value={value} disabled={disabled}>{children}</option>
  ),
  SelectGroup:              ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectLabel:              () => null,
  SelectScrollUpButton:     () => null,
  SelectScrollDownButton:   () => null,
  SelectSeparator:          () => null,
}));

// Radix Dialog uses focus traps not available in jsdom
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent:     ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DialogHeader:      ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DialogTitle:       ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  DialogFooter:      ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// Expose controlled number input via testid so we can query disabled state
vi.mock("@/components/ui/numeric-input", () => ({
  NumericInput: ({ value, onChange, disabled }: {
    value?: number;
    onChange?: (val: number) => void;
    disabled?: boolean;
  }) => (
    <input
      data-testid="numeric-input"
      type="number"
      value={value}
      onChange={(e) => onChange?.(Number(e.target.value))}
      disabled={disabled}
    />
  ),
}));

beforeAll(() => {
  class MockResizeObserver {
    observe    = vi.fn();
    unobserve  = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;
  (Element.prototype as any).scrollIntoView = vi.fn();
});

// ── Import under test (after all vi.mock hoists) ───────────────────────────────
import { WorkOrderPaymentPlanSection } from "../WorkOrderPaymentPlanSection";
import type { PaymentInstallmentInput, PaymentInstallmentStatus } from "@/types/workOrderPaymentPlan";

// ── Helpers ───────────────────────────────────────────────────────────────────

let idSeq = 0;

function dayOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const makeQC = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

function makeInstallment(overrides: Partial<PaymentInstallmentInput> = {}): PaymentInstallmentInput {
  return {
    installment_id:          `inst-${++idSeq}`,
    plan_id:                  "plan-1",
    wo_id:                    "wo-1",
    installment_number:       1,
    agreed_invoice_date:      null,
    agreed_payment_date:      null,
    collection_invoice_date:  null,
    collection_payment_date:  null,
    payment_date_actual:      null,
    percentage:               100,
    amount:                   null,
    status:                   "Pending" as PaymentInstallmentStatus,
    ...overrides,
  };
}

// Fresh mocks each call so tests are independent
function renderSection(overrides: Record<string, unknown> = {}) {
  const props = {
    woId:                    "wo-1",   // non-empty → auto-init does NOT fire
    currency:                "BOB" as const,
    feeWithTax:              1000,
    plan:                    null,
    installments:            [] as PaymentInstallmentInput[],
    isEditable:              true,
    isStatusEditable:        false,
    isAdminDateEditable:     false,
    onPlanChange:            vi.fn(),
    onInstallmentsChange:    vi.fn(),
    ...overrides,
  };
  const { container } = render(
    <QueryClientProvider client={makeQC()}>
      <WorkOrderPaymentPlanSection {...(props as any)} />
    </QueryClientProvider>
  );
  return container;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkOrderPaymentPlanSection — section title", () => {
  it("PP0: section title is always rendered", () => {
    renderSection();
    expect(screen.getByText("workOrders.paymentPlan.title")).toBeInTheDocument();
  });
});

describe("WorkOrderPaymentPlanSection — Tipo de Cambio visibility", () => {
  it("PP1: hidden when currency='BOB'", () => {
    renderSection({ currency: "BOB" });
    expect(screen.queryByText("workOrders.paymentPlan.exchangeRate")).not.toBeInTheDocument();
  });

  it("PP2: visible when currency='USD'", () => {
    renderSection({ currency: "USD" });
    expect(screen.getByText("workOrders.paymentPlan.exchangeRate")).toBeInTheDocument();
  });

  it("PP3: visible when currency='USDT'", () => {
    renderSection({ currency: "USDT" });
    expect(screen.getByText("workOrders.paymentPlan.exchangeRate")).toBeInTheDocument();
  });
});

describe("WorkOrderPaymentPlanSection — installment row generation", () => {
  it("PP4: clicking + calls onInstallmentsChange with 1 row (starting from 0)", () => {
    const onInstallmentsChange = vi.fn();
    const container = renderSection({ installments: [], onInstallmentsChange });
    // With 0 installments the − button is disabled; + is the only enabled button
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    const plusBtn = buttons.find(b => !b.disabled)!;
    fireEvent.click(plusBtn);
    expect(onInstallmentsChange).toHaveBeenCalledTimes(1);
    expect(onInstallmentsChange.mock.calls[0][0]).toHaveLength(1);
  });

  it("PP5: 2 installments in props renders 2 table rows", () => {
    const installments = [
      makeInstallment({ installment_number: 1, percentage: 50 }),
      makeInstallment({ installment_number: 2, percentage: 50 }),
    ];
    const container = renderSection({ installments });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("PP6: initial row produced by + has percentage summing to 100", () => {
    const onInstallmentsChange = vi.fn();
    const container = renderSection({ installments: [], onInstallmentsChange });
    const plusBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find(b => !b.disabled)!;
    fireEvent.click(plusBtn);
    const rows = onInstallmentsChange.mock.calls[0][0] as PaymentInstallmentInput[];
    const sum = rows.reduce((s, r) => s + r.percentage, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });
});

describe("WorkOrderPaymentPlanSection — amounts and totals", () => {
  it("PP7: row amount cell reflects feeWithTax (50% × 1000 = 500)", () => {
    const installments = [makeInstallment({ percentage: 50 })];
    const container = renderSection({ feeWithTax: 1000, installments });
    const cells = Array.from(container.querySelectorAll("td"));
    const has500 = cells.some(td => td.textContent?.replace(/\s/g, "").includes("500"));
    expect(has500).toBe(true);
  });

  it("PP8: TOTAL percentage has no red class when sum = 100", () => {
    const installments = [makeInstallment({ percentage: 100 })];
    const container = renderSection({ installments });
    const spans = Array.from(container.querySelectorAll("span"));
    const totalSpan = spans.find(s => s.textContent?.trim() === "100%");
    expect(totalSpan?.className).not.toContain("text-destructive");
  });

  it("PP9: TOTAL percentage turns red when sum ≠ 100", () => {
    const installments = [
      makeInstallment({ installment_number: 1, percentage: 40 }),
      makeInstallment({ installment_number: 2, percentage: 40 }),
    ];
    const container = renderSection({ installments });
    const spans = Array.from(container.querySelectorAll("span"));
    const totalSpan = spans.find(s => s.textContent?.trim() === "80%");
    expect(totalSpan?.className).toContain("text-destructive");
  });
});

describe("WorkOrderPaymentPlanSection — input editability", () => {
  it("PP10: agreed_invoice_date input disabled when isEditable=false and isAdminDateEditable=false", () => {
    const installments = [makeInstallment()];
    const container = renderSection({ installments, isEditable: false, isAdminDateEditable: false });
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThan(0);
    dateInputs.forEach(input => expect(input.disabled).toBe(true));
  });

  it("PP11: agreed_invoice_date NOT disabled when isEditable=false but isAdminDateEditable=true", () => {
    const installments = [makeInstallment()];
    const container = renderSection({ installments, isEditable: false, isAdminDateEditable: true });
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThan(0);
    dateInputs.forEach(input => expect(input.disabled).toBe(false));
  });

  it("PP12: percentage NumericInput disabled when isEditable=false", () => {
    const installments = [makeInstallment()];
    const container = renderSection({ installments, isEditable: false });
    const numericInputs = container.querySelectorAll<HTMLInputElement>('[data-testid="numeric-input"]');
    numericInputs.forEach(input => expect(input.disabled).toBe(true));
  });
});

describe("WorkOrderPaymentPlanSection — status display", () => {
  it("PP13: chip rendered (no Select) when isStatusEditable=false", () => {
    const installments = [makeInstallment({ status: "Pending" })];
    const container = renderSection({ installments, isStatusEditable: false });
    expect(container.querySelector('[data-testid="select"]')).not.toBeInTheDocument();
    expect(screen.getByText("workOrders.paymentPlan.statusPending")).toBeInTheDocument();
  });

  it("PP14: Select rendered when isStatusEditable=true and Pending has available transitions", () => {
    const installments = [makeInstallment({ status: "Pending" })];
    const container = renderSection({ installments, isStatusEditable: true });
    expect(container.querySelector('[data-testid="select"]')).toBeInTheDocument();
  });

  it("PP15: Completed shows chip even when isStatusEditable=true (no transitions from Completed)", () => {
    const installments = [makeInstallment({ status: "Completed" })];
    const container = renderSection({ installments, isStatusEditable: true });
    expect(container.querySelector('[data-testid="select"]')).not.toBeInTheDocument();
    expect(screen.getByText("workOrders.paymentPlan.statusCompleted")).toBeInTheDocument();
  });

  it("PP16: status Select still rendered when isEditable=false but isStatusEditable=true (locked WO)", () => {
    const installments = [makeInstallment({ status: "Invoiced" })];
    const container = renderSection({ installments, isEditable: false, isStatusEditable: true });
    expect(container.querySelector('[data-testid="select"]')).toBeInTheDocument();
  });

  it("PP17: auto-Overdue chip shown when status=Pending and agreed_invoice_date is past", () => {
    const yesterday = dayOffset(-1);
    const installments = [makeInstallment({ status: "Pending", agreed_invoice_date: yesterday })];
    renderSection({ installments, isStatusEditable: false });
    // getEffectiveStatus converts Pending → Overdue; chip shows Overdue key
    expect(screen.getByText("workOrders.paymentPlan.statusOverdue")).toBeInTheDocument();
    expect(screen.queryByText("workOrders.paymentPlan.statusPending")).not.toBeInTheDocument();
  });

  it("PP18: future agreed_invoice_date keeps Pending status (no auto-Overdue)", () => {
    const nextMonth = dayOffset(30);
    const installments = [makeInstallment({ status: "Pending", agreed_invoice_date: nextMonth })];
    renderSection({ installments, isStatusEditable: false });
    expect(screen.getByText("workOrders.paymentPlan.statusPending")).toBeInTheDocument();
    expect(screen.queryByText("workOrders.paymentPlan.statusOverdue")).not.toBeInTheDocument();
  });
});

describe("WorkOrderPaymentPlanSection — alert banner", () => {
  it("PP19: alert banner shown when agreed_invoice_date within 7 days for a Pending installment", () => {
    const installments = [makeInstallment({ agreed_invoice_date: dayOffset(3), status: "Pending" })];
    renderSection({ installments });
    expect(screen.getByText("workOrders.paymentPlan.alertBanner")).toBeInTheDocument();
  });

  it("PP20: alert banner absent when agreed_invoice_date is more than 7 days away", () => {
    const installments = [makeInstallment({ agreed_invoice_date: dayOffset(30), status: "Pending" })];
    renderSection({ installments });
    expect(screen.queryByText("workOrders.paymentPlan.alertBanner")).not.toBeInTheDocument();
  });

  it("PP21: alert banner absent when no installments have upcoming dates", () => {
    const installments = [makeInstallment({ agreed_invoice_date: null })];
    renderSection({ installments });
    expect(screen.queryByText("workOrders.paymentPlan.alertBanner")).not.toBeInTheDocument();
  });
});

describe("WorkOrderPaymentPlanSection — collection_invoice_date rendering", () => {
  it("PP22: date input rendered for collection_invoice_date when isStatusEditable=true", () => {
    const installments = [makeInstallment()];
    const container = renderSection({ installments, isStatusEditable: true });
    // 2 date inputs: agreed_invoice_date + collection_invoice_date
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(2);
  });

  it("PP23: collection_invoice_date shown as plain text when isStatusEditable=false", () => {
    const installments = [makeInstallment({ collection_invoice_date: "2026-08-01" })];
    const container = renderSection({ installments, isStatusEditable: false });
    // Only 1 date input (agreed_invoice_date)
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(1);
    expect(screen.getByText("2026-08-01")).toBeInTheDocument();
  });
});

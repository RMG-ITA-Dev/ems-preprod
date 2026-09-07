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
  useUpdateCollectionDate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInstallmentExchangeRate: () => ({ mutate: vi.fn(), isPending: false }),
}));

// WorkOrderPaymentPlanSection now calls useLatestExchangeRate (0722-156b Fase 2) —
// unrelated to this suite's Fase-1-and-earlier coverage, so stub it out with no data.
vi.mock("@/hooks/useExchangeRate", () => ({
  useLatestExchangeRate: () => ({ data: null }),
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

// Expose controlled number input via testid so we can query disabled state.
// 0722-161: reenvia decimals/locale/min como atributos para poder afirmar el
// contrato del campo, y respeta un data-testid propio si el call site lo pasa.
vi.mock("@/components/ui/numeric-input", () => ({
  NumericInput: ({
    value,
    onChange,
    disabled,
    decimals,
    locale,
    min,
    "data-testid": testId,
  }: {
    value?: number;
    onChange?: (val: number) => void;
    disabled?: boolean;
    decimals?: number;
    locale?: string;
    min?: number;
    "data-testid"?: string;
  }) => (
    <input
      // El fallback sigue siendo "numeric-input": PP12 consulta ese selector
      // sobre todos los inputs de la seccion.
      data-testid={testId ?? "numeric-input"}
      data-decimals={decimals}
      data-locale={locale}
      type="number"
      value={value}
      min={min}
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

// BUG preexistente (M6, bugs/scheduler/fase_5/review.md), corregido acá: anclaba "hoy" al
// reloj de pared del sistema que corre el test en vez de a America/La_Paz, la misma zona que
// getEffectiveStatus()/isAlertDue() usan explícitamente (WorkOrderPaymentPlanSection.tsx:109).
// Ver el comentario completo en src/lib/__tests__/workOrderPaymentPlan.test.ts.
function dayOffset(n: number): string {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  const d = new Date(`${todayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
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
    invoice_exchange_rate:    null,
    payment_exchange_rate:    null,
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

// ── 0722-161: decimales en el tipo de cambio ──────────────────────────────────
// Antes no existia NINGUN test que escribiera en este campo. El bug reportado
// era que no aceptaba decimales: no pasaba `decimals` (dependia del default 2)
// ni `locale`, asi que la coma de un numpad es-BO se descartaba en silencio.

describe("WorkOrderPaymentPlanSection — Tipo de Cambio precision (0722-161)", () => {
  it("PP24: el campo declara 6 decimales, locale del idioma activo y min 0", () => {
    renderSection({ currency: "USD" });
    const input = screen.getByTestId("payment-plan-exchange-rate");

    // 6 decimales: es una tasa, no dinero, y ningun calculo aguas abajo la redondea
    expect(input).toHaveAttribute("data-decimals", "6");
    expect(input).toHaveAttribute("data-locale", "es");
    // min=0 evita teclear una tasa negativa que `val > 0 ? val : null` descartaba
    expect(input).toHaveAttribute("min", "0");
  });

  it("PP25: propaga una tasa fraccionaria sin truncar", () => {
    const onPlanChange = vi.fn();
    renderSection({ currency: "USD", onPlanChange });

    fireEvent.change(screen.getByTestId("payment-plan-exchange-rate"), {
      target: { value: "6.96" },
    });

    expect(onPlanChange).toHaveBeenCalledWith(
      expect.objectContaining({ exchange_rate: 6.96 }),
    );
  });

  it("PP26: propaga una tasa de alta precision (6 decimales)", () => {
    const onPlanChange = vi.fn();
    renderSection({ currency: "USD", onPlanChange });

    fireEvent.change(screen.getByTestId("payment-plan-exchange-rate"), {
      target: { value: "6.123456" },
    });

    expect(onPlanChange).toHaveBeenCalledWith(
      expect.objectContaining({ exchange_rate: 6.123456 }),
    );
  });

  it("PP27: borrar la tasa a 0 la guarda como null", () => {
    const onPlanChange = vi.fn();
    // Hay que partir de una tasa no nula: el campo se pinta con
    // `exchange_rate ?? 0`, asi que cambiar "0" -> "0" no dispara onChange.
    renderSection({
      currency: "USD",
      plan: { wo_id: "wo-1", exchange_rate: 6.96, payment_days: 30 },
      onPlanChange,
    });

    fireEvent.change(screen.getByTestId("payment-plan-exchange-rate"), {
      target: { value: "0" },
    });

    expect(onPlanChange).toHaveBeenCalledWith(
      expect.objectContaining({ exchange_rate: null }),
    );
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
    expect(screen.getByText("01/08/2026")).toBeInTheDocument();
  });
});

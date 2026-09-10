import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 0722-156b (Fase 2): plan-level Fijo/Variable toggle + per-installment invoice/payment
// exchange rate cells. Same mocking harness as WorkOrderPaymentPlanSection.test.tsx (that
// file stays untouched for the Fase-1-and-earlier behavior it already covers).

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, options?: Record<string, unknown>) =>
      options?.value !== undefined ? `${k}:${options.value}` : k,
    i18n: { language: "es" },
  }),
}));

const mockUpdateExchangeRate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/mutations", () => ({
  useUpdateInstallmentStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCollectionDate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInstallmentExchangeRate: () => ({ mutate: mockUpdateExchangeRate, isPending: false }),
}));

const latestRateRef: { current: { compra: number } | null } = { current: { compra: 11.57 } };
vi.mock("@/hooks/useExchangeRate", () => ({
  useLatestExchangeRate: () => ({ data: latestRateRef.current }),
}));

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

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent:     ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DialogHeader:      ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DialogTitle:       ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  DialogFooter:      ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/numeric-input", () => ({
  NumericInput: ({
    value,
    onChange,
    onBlur,
    disabled,
    "data-testid": testId,
  }: {
    value?: number;
    onChange?: (val: number) => void;
    onBlur?: () => void;
    disabled?: boolean;
    "data-testid"?: string;
  }) => (
    <input
      data-testid={testId ?? "numeric-input"}
      type="number"
      value={value}
      onChange={(e) => onChange?.(Number(e.target.value))}
      onBlur={onBlur}
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

import { WorkOrderPaymentPlanSection } from "../WorkOrderPaymentPlanSection";
import type { PaymentInstallmentInput, PaymentInstallmentStatus, PaymentPlanInput } from "@/types/workOrderPaymentPlan";

let idSeq = 0;

const makeQC = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

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
    amount:                   1000,
    status:                   "Pending" as PaymentInstallmentStatus,
    invoice_exchange_rate:    null,
    payment_exchange_rate:    null,
    ...overrides,
  };
}

function makePlan(overrides: Partial<PaymentPlanInput> = {}): PaymentPlanInput {
  return {
    plan_id: "plan-1",
    wo_id: "wo-1",
    exchange_rate: 6.96,
    payment_days: 30,
    exchange_rate_mode: "fijo",
    ...overrides,
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    woId:                    "wo-1",
    currency:                "USD" as const,
    feeWithTax:              1000,
    plan:                    makePlan(),
    installments:            [] as PaymentInstallmentInput[],
    isEditable:              true,
    isStatusEditable:        true,
    isAdminDateEditable:     false,
    canEditCreationExchangeRate: true,
    onPlanChange:            vi.fn(),
    onInstallmentsChange:    vi.fn(),
    ...overrides,
  };
}

function renderSection(overrides: Record<string, unknown> = {}) {
  const { container } = render(
    <QueryClientProvider client={makeQC()}>
      <WorkOrderPaymentPlanSection {...(baseProps(overrides) as any)} />
    </QueryClientProvider>,
  );
  return container;
}

// For tests that need to rerender with changed props (simulating a re-hydration from
// a query refetch) — renderSection() above only exposes the container.
function renderSectionFull(overrides: Record<string, unknown> = {}) {
  const qc = makeQC();
  const utils = render(
    <QueryClientProvider client={qc}>
      <WorkOrderPaymentPlanSection {...(baseProps(overrides) as any)} />
    </QueryClientProvider>,
  );
  const rerenderWith = (nextOverrides: Record<string, unknown>) =>
    utils.rerender(
      <QueryClientProvider client={qc}>
        <WorkOrderPaymentPlanSection {...(baseProps(nextOverrides) as any)} />
      </QueryClientProvider>,
    );
  return { ...utils, rerenderWith };
}

describe("WorkOrderPaymentPlanSection — exchange rate mode toggle (0722-156b Fase 2)", () => {
  it("PEM1: renders the Fijo/Variable toggle as 2 labeled buttons (not an unlabeled boolean switch), scoped to the plan (not per-cuota)", () => {
    renderSection();
    expect(screen.getByTestId("payment-plan-exchange-rate-mode-fijo")).toHaveTextContent(
      "workOrders.paymentPlan.exchangeRateModeFijo",
    );
    expect(screen.getByTestId("payment-plan-exchange-rate-mode-variable")).toHaveTextContent(
      "workOrders.paymentPlan.exchangeRateModeVariable",
    );
  });

  it("PEM2: hidden entirely for BOB currency, same gate as the creation TC field", () => {
    renderSection({ currency: "BOB" });
    expect(screen.queryByTestId("payment-plan-exchange-rate-mode-fijo")).not.toBeInTheDocument();
  });

  it("PEM3: clicking Variable calls onPlanChange with exchange_rate_mode='variable'", () => {
    const onPlanChange = vi.fn();
    renderSection({ onPlanChange });
    fireEvent.click(screen.getByTestId("payment-plan-exchange-rate-mode-variable"));
    expect(onPlanChange).toHaveBeenCalledWith(expect.objectContaining({ exchange_rate_mode: "variable" }));
  });

  it("PEM4: toggle buttons disabled when isEditable=false (frozen once the WO is Approved)", () => {
    renderSection({ isEditable: false });
    expect(screen.getByTestId("payment-plan-exchange-rate-mode-fijo")).toBeDisabled();
    expect(screen.getByTestId("payment-plan-exchange-rate-mode-variable")).toBeDisabled();
  });

  // Decision del operador 2026-09-10: el TC inicial y el toggle Fijo/Variable quedan
  // reservados al gerente del encargo (o admin) -- isEditable ya no alcanza por si solo.
  it("PEM4b: toggle buttons AND the creation TC field are disabled when canEditCreationExchangeRate=false, even if isEditable=true (e.g. a socio that isn't the engagement's manager)", () => {
    renderSection({ isEditable: true, canEditCreationExchangeRate: false });
    expect(screen.getByTestId("payment-plan-exchange-rate-mode-fijo")).toBeDisabled();
    expect(screen.getByTestId("payment-plan-exchange-rate-mode-variable")).toBeDisabled();
    expect(screen.getByTestId("payment-plan-exchange-rate")).toBeDisabled();
  });

  it("PEM5: current buy-rate reference text shown under the creation TC field", () => {
    renderSection();
    expect(screen.getByText("workOrders.paymentPlan.currentBuyRateReference:11,57")).toBeInTheDocument();
  });

  it("PEM6: creation TC autocompletes with the latest buy rate when empty and editable", () => {
    const onPlanChange = vi.fn();
    renderSection({ plan: makePlan({ exchange_rate: null }), installments: [makeInstallment()], onPlanChange });
    expect(onPlanChange).toHaveBeenCalledWith(expect.objectContaining({ exchange_rate: 11.57 }));
  });

  // Decision del operador 2026-09-10: si quien abre la OT no puede guardar el TC
  // inicial (no es el gerente del encargo ni admin), el efecto no debe autocompletarlo
  // -- mismo riesgo ya corregido para BOB (PEM7d): un valor autocompletado que el
  // trigger rechazaria (EXCHANGE_RATE_FORBIDDEN) dejaria la pagina "sucia" sin que el
  // usuario haya tocado nada.
  it("PEM6b: creation TC does NOT autocomplete when canEditCreationExchangeRate=false, even with installments and a resolved buy rate", () => {
    const onPlanChange = vi.fn();
    renderSection({
      plan: makePlan({ exchange_rate: null }),
      installments: [makeInstallment()],
      canEditCreationExchangeRate: false,
      onPlanChange,
    });
    expect(onPlanChange).not.toHaveBeenCalled();
  });

  it("PEM7: creation TC does NOT autocomplete when not editable (WO already Approved)", () => {
    const onPlanChange = vi.fn();
    renderSection({ plan: makePlan({ exchange_rate: null }), installments: [makeInstallment()], isEditable: false, onPlanChange });
    expect(onPlanChange).not.toHaveBeenCalled();
  });

  // MUST FIX 0722-156b review iteracion 4 #5: sin ninguna cuota todavia, autocompletar
  // el TC de creacion crea un plan "fantasma" (paymentPlan != originalPaymentPlan en
  // WorkOrderEdit.tsx) que no se puede ni guardar ni descartar -- ver PEM6 arriba, que
  // exige >= 1 cuota para que este mismo autocompletado dispare.
  it("PEM7a: creation TC does NOT autocomplete when there are no installments yet (would create an unsavable phantom plan)", () => {
    const onPlanChange = vi.fn();
    renderSection({ plan: makePlan({ exchange_rate: null }), installments: [], onPlanChange });
    expect(onPlanChange).not.toHaveBeenCalled();
  });

  // Regresión (reportada 2026-09-05): un candado "una sola vez para siempre" hacía que
  // la caja de creación se quedara en 0 si el efecto corría antes de que
  // useLatestExchangeRate resolviera, o si una rehidratación posterior (useWorkOrderById)
  // volvía a pisar el plan local con el exchange_rate null que seguía en la DB. El fix
  // quita ese candado: debe reintentar cada vez que quede vacío y elegible, no solo una vez.
  it("PEM7b: creation TC autofills even if the latest rate resolves AFTER the first render (no permanent one-shot lock)", () => {
    const onPlanChange = vi.fn();
    // First render: no rate known yet (simulates useLatestExchangeRate still loading).
    latestRateRef.current = null;
    const { rerenderWith } = renderSectionFull({ plan: makePlan({ exchange_rate: null }), installments: [makeInstallment()], onPlanChange });
    expect(onPlanChange).not.toHaveBeenCalled();

    // The query resolves later — the field must still autofill, not stay stuck at 0.
    latestRateRef.current = { compra: 11.57 };
    rerenderWith({ plan: makePlan({ exchange_rate: null }), installments: [makeInstallment()], onPlanChange });
    expect(onPlanChange).toHaveBeenCalledWith(expect.objectContaining({ exchange_rate: 11.57 }));
  });

  it("PEM7c: creation TC re-fills after an external rehydration resets it back to null (e.g. a stale work-order refetch), instead of staying stuck", () => {
    const onPlanChange = vi.fn();
    const { rerenderWith } = renderSectionFull({ plan: makePlan({ exchange_rate: 11.57 }), installments: [makeInstallment()], onPlanChange });
    expect(onPlanChange).not.toHaveBeenCalled(); // already has a value, nothing to fill

    // Simulate WorkOrderEdit's hydration effect resetting the local plan back to the
    // (still unsaved) null value from the DB.
    rerenderWith({ plan: makePlan({ exchange_rate: null }), installments: [makeInstallment()], onPlanChange });
    expect(onPlanChange).toHaveBeenCalledWith(expect.objectContaining({ exchange_rate: 11.57 }));
  });

  // MUST FIX 0722-156b review iteracion 10 #5: este efecto no chequeaba
  // currency !== "BOB" -- useLatestExchangeRate() no esta filtrado por moneda de la
  // OT, asi que autocompletaba exchange_rate en CUALQUIER OT en BOB con >= 1 cuota,
  // marcando "sin guardar" (WorkOrderEdit.tsx compara paymentPlan/originalPaymentPlan
  // con un JSON.stringify crudo) sin que el usuario tocara nada.
  it("PEM7d: creation TC does NOT autocomplete for BOB currency, even with installments and a resolved buy rate", () => {
    const onPlanChange = vi.fn();
    renderSection({ currency: "BOB", plan: makePlan({ exchange_rate: null }), installments: [makeInstallment()], onPlanChange });
    expect(onPlanChange).not.toHaveBeenCalled();
  });
});

describe("WorkOrderPaymentPlanSection — per-installment TC cells (0722-156b Fase 2)", () => {
  it("PEM8: modo Fijo renders the invoice/payment TC cells read-only, reflecting the plan's creation TC", () => {
    const installments = [makeInstallment({ invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 })];
    renderSection({ plan: makePlan({ exchange_rate_mode: "fijo", exchange_rate: 6.96 }), installments });

    expect(screen.getByTestId("installment-invoice-rate-readonly")).toHaveTextContent("6,96");
    expect(screen.getByTestId("installment-payment-rate-readonly")).toHaveTextContent("6,96");
    expect(screen.queryByTestId("installment-invoice-rate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("installment-payment-rate")).not.toBeInTheDocument();
  });

  it("PEM9: modo Variable renders an editable invoice-TC input for a Pending installment, auto-initialized with the latest buy rate, but keeps the payment-TC input disabled (nothing has been invoiced yet)", () => {
    // MUST FIX review iteracion 1 #1: el TC de pago no es una captura independiente
    // valida hasta que la cuota se factura — antes de esta correccion quedaba
    // habilitado incluso en Pending.
    const installments = [makeInstallment({ status: "Pending", invoice_exchange_rate: 11.57, payment_exchange_rate: 11.57 })];
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }), installments });

    const invoiceInput = screen.getByTestId("installment-invoice-rate") as HTMLInputElement;
    const paymentInput = screen.getByTestId("installment-payment-rate") as HTMLInputElement;
    expect(invoiceInput.disabled).toBe(false);
    expect(paymentInput.disabled).toBe(true);
    expect(Number(invoiceInput.value)).toBe(11.57);
  });

  it("PEM10: modo Variable freezes the invoice TC input once the installment is Invoiced (persisted status), and the payment TC becomes editable from that point on", () => {
    const installments = [makeInstallment({ status: "Invoiced", invoice_exchange_rate: 6.95, payment_exchange_rate: null })];
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }), installments });

    const invoiceInput = screen.getByTestId("installment-invoice-rate") as HTMLInputElement;
    const paymentInput = screen.getByTestId("installment-payment-rate") as HTMLInputElement;
    expect(invoiceInput.disabled).toBe(true);
    expect(paymentInput.disabled).toBe(false);
  });

  it("PEM10b: modo Variable keeps the payment TC input editable during a persisted post-invoice Overdue", () => {
    const installments = [makeInstallment({ status: "Overdue", invoice_exchange_rate: 6.95, payment_exchange_rate: null })];
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }), installments });

    expect((screen.getByTestId("installment-payment-rate") as HTMLInputElement).disabled).toBe(false);
  });

  it("PEM11: modo Variable freezes the payment TC input once the installment is Completed", () => {
    const installments = [makeInstallment({ status: "Completed", invoice_exchange_rate: 6.95, payment_exchange_rate: 7.01 })];
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }), installments });

    expect((screen.getByTestId("installment-invoice-rate") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("installment-payment-rate") as HTMLInputElement).disabled).toBe(true);
  });

  it("PEM12: derived Bs amounts use the frozen invoice/payment TC, not the live reference rate", () => {
    // amount=1000 (from feeWithTax=1000, percentage=100), invoice TC frozen at 6.95 -> 6950.00
    const installments = [makeInstallment({ status: "Invoiced", invoice_exchange_rate: 6.95, payment_exchange_rate: null })];
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }), installments });

    expect(screen.getByText("workOrders.paymentPlan.invoiceAmountBob:6.950")).toBeInTheDocument();
  });

  // MUST FIX 0722-156b review iteracion 4 #1/#6: las celdas de moneda del repo se
  // muestran sin decimales (docs/operations.md:36) -- formatBob redondeaba a 2.
  it("PEM12b: derived Bs amount with fractional bolivianos renders with zero decimals", () => {
    // amount = 33.33% of 1000 = 333.3 (fijado explicitamente: MUST FIX review iteracion 6
    // #5 -- una cuota Invoiced/locked usa su `amount` ya congelado, no un recalculo en
    // vivo desde percentage x feeWithTax); invoice TC frozen at 6.955 -> 333.3*6.955 =
    // 2318.1015 -> computeConvertedAmount redondea a 2318.10 -> formatBob debe redondear
    // mas a 2318 (sin decimales).
    const installments = [
      makeInstallment({ status: "Invoiced", percentage: 33.33, amount: 333.3, invoice_exchange_rate: 6.955, payment_exchange_rate: null }),
    ];
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }), installments });

    expect(screen.getByText("workOrders.paymentPlan.invoiceAmountBob:2.318")).toBeInTheDocument();
    expect(screen.queryByText(/2[.,]318[.,]07/)).not.toBeInTheDocument();
  });

  it("PEM13: TC cells absent entirely for BOB currency", () => {
    const installments = [makeInstallment()];
    renderSection({ currency: "BOB", plan: makePlan({ exchange_rate: null }), installments });

    expect(screen.queryByTestId("installment-invoice-rate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("installment-invoice-rate-readonly")).not.toBeInTheDocument();
  });

  // MUST FIX 0722-156b review iteracion 10 #5: el efecto de re-sincronizacion/
  // inicializacion (modo Fijo re-sync, modo Variable init) tampoco chequeaba
  // currency !== "BOB" -- aunque las celdas no se rendericen para BOB (PEM13), el
  // efecto igual llamaba a onInstallmentsChange en segundo plano.
  it("PEM13b: per-installment TC sync/init does NOT fire for BOB currency, even with a null TC and a resolved buy rate", () => {
    const onInstallmentsChange = vi.fn();
    const installments = [makeInstallment({ status: "Pending", invoice_exchange_rate: null, payment_exchange_rate: null })];
    renderSection({
      currency: "BOB",
      plan: makePlan({ exchange_rate_mode: "variable" }),
      installments,
      onInstallmentsChange,
    });

    expect(onInstallmentsChange).not.toHaveBeenCalled();
  });

  it("PEM14: editing the invoice TC in modo Variable calls onInstallmentsChange with only that row updated", () => {
    const onInstallmentsChange = vi.fn();
    const installments = [
      makeInstallment({ installment_number: 1, status: "Pending", invoice_exchange_rate: 11.57 }),
    ];
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }), installments, onInstallmentsChange });

    fireEvent.change(screen.getByTestId("installment-invoice-rate"), { target: { value: "7.02" } });
    expect(onInstallmentsChange).toHaveBeenCalledWith([
      expect.objectContaining({ invoice_exchange_rate: 7.02 }),
    ]);
  });

  // Amendment 2026-09-07: estos 2 campos solo se habilitan con la OT ya Aprobada, momento
  // en el que WorkOrderForm ya no ofrece un boton "Guardar" de pagina -- sin un guardado
  // directo el valor tecleado quedaba atrapado en memoria para siempre (bug reportado
  // 2026-09-05: "Sin guardar" pegado sin salida). Se persiste al perder el foco (blur).
  describe("guardado directo al perder el foco (Amendment 2026-09-07)", () => {
    it("PEM15: invoice TC persiste con useUpdateInstallmentExchangeRate al hacer blur", () => {
      mockUpdateExchangeRate.mockClear();
      // onInstallmentsChange debe re-alimentar el prop `installments` (como hace el
      // useState real de la pagina) para que `inst` en el closure del onBlur refleje
      // lo tecleado, no el valor con el que se monto el componente. Reenvia el resto
      // de overrides (plan/woId/el propio callback) tal cual, o se perderian en el rerender.
      const baseOverrides = {
        woId: "wo-99",
        plan: makePlan({ exchange_rate_mode: "variable" }),
        installments: [
          makeInstallment({ installment_id: "inst-42", status: "Pending", invoice_exchange_rate: 11.57 }),
        ] as PaymentInstallmentInput[],
      };
      const onInstallmentsChange = (next: PaymentInstallmentInput[]) =>
        rerenderWith({ ...baseOverrides, installments: next, onInstallmentsChange });
      const { rerenderWith } = renderSectionFull({ ...baseOverrides, onInstallmentsChange });

      const input = screen.getByTestId("installment-invoice-rate");
      fireEvent.change(input, { target: { value: "7.02" } });
      fireEvent.blur(input);

      expect(mockUpdateExchangeRate).toHaveBeenCalledWith({
        installmentId: "inst-42",
        field: "invoice_exchange_rate",
        value: 7.02,
        woId: "wo-99",
      });
    });

    it("PEM16: payment TC persiste con useUpdateInstallmentExchangeRate al hacer blur", () => {
      mockUpdateExchangeRate.mockClear();
      const baseOverrides = {
        woId: "wo-99",
        plan: makePlan({ exchange_rate_mode: "variable" }),
        installments: [
          makeInstallment({ installment_id: "inst-43", status: "Invoiced", payment_exchange_rate: 11.57 }),
        ] as PaymentInstallmentInput[],
      };
      const onInstallmentsChange = (next: PaymentInstallmentInput[]) =>
        rerenderWith({ ...baseOverrides, installments: next, onInstallmentsChange });
      const { rerenderWith } = renderSectionFull({ ...baseOverrides, onInstallmentsChange });

      const input = screen.getByTestId("installment-payment-rate");
      fireEvent.change(input, { target: { value: "6.80" } });
      fireEvent.blur(input);

      expect(mockUpdateExchangeRate).toHaveBeenCalledWith({
        installmentId: "inst-43",
        field: "payment_exchange_rate",
        value: 6.8,
        woId: "wo-99",
      });
    });

    // MUST FIX review iteracion 12 #3: pendingRateEditsRef nunca se limpiaba -- un blur
    // sin edicion nueva sobre una fila cuyo prop se refresco con un valor mas reciente
    // (ej. otra pestana ya guardo uno distinto) volvia a leer el valor viejo del ref y
    // lo repersistia, pisando el mas nuevo en silencio.
    it("PEM16b: a later blur with no new edit persists the fresh prop value, not a stale ref from an earlier edit", () => {
      mockUpdateExchangeRate.mockClear();
      const baseOverrides = {
        woId: "wo-99",
        plan: makePlan({ exchange_rate_mode: "variable" }),
      };
      const { rerenderWith } = renderSectionFull({
        ...baseOverrides,
        installments: [makeInstallment({ installment_id: "inst-42", status: "Pending", invoice_exchange_rate: 11.57 })],
      });

      // 1) User edits and blurs — persists 7.02, and (with the fix) clears the ref entry.
      const input = screen.getByTestId("installment-invoice-rate");
      fireEvent.change(input, { target: { value: "7.02" } });
      fireEvent.blur(input);
      expect(mockUpdateExchangeRate).toHaveBeenLastCalledWith({
        installmentId: "inst-42", field: "invoice_exchange_rate", value: 7.02, woId: "wo-99",
      });

      // 2) External refresh (e.g. a query refetch after another tab saved a newer value)
      // updates the prop directly — NOT via a local edit, so the ref should stay out of it.
      rerenderWith({
        ...baseOverrides,
        installments: [makeInstallment({ installment_id: "inst-42", status: "Pending", invoice_exchange_rate: 9.99 })],
      });

      // 3) Focus+blur again with no change event in between — must persist the fresh 9.99
      // from the prop, not the stale 7.02 left over in pendingRateEditsRef.
      const refreshedInput = screen.getByTestId("installment-invoice-rate");
      fireEvent.blur(refreshedInput);
      expect(mockUpdateExchangeRate).toHaveBeenLastCalledWith({
        installmentId: "inst-42", field: "invoice_exchange_rate", value: 9.99, woId: "wo-99",
      });
    });

    it("PEM17: no persiste al hacer blur en una fila nueva sin installment_id todavia", () => {
      mockUpdateExchangeRate.mockClear();
      const installments = [
        makeInstallment({ installment_id: undefined, status: "Pending", invoice_exchange_rate: 11.57 }),
      ];
      renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }), installments });

      const input = screen.getByTestId("installment-invoice-rate");
      fireEvent.change(input, { target: { value: "7.02" } });
      fireEvent.blur(input);

      expect(mockUpdateExchangeRate).not.toHaveBeenCalled();
    });

    it("PEM18: no persiste al hacer blur si el plan tiene cambios sin guardar (isPaymentPlanDirty)", () => {
      mockUpdateExchangeRate.mockClear();
      const installments = [
        makeInstallment({ installment_id: "inst-dirty", status: "Pending", invoice_exchange_rate: 11.57 }),
      ];
      renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }), installments, isPaymentPlanDirty: true });

      const input = screen.getByTestId("installment-invoice-rate");
      fireEvent.change(input, { target: { value: "7.02" } });
      fireEvent.blur(input);

      expect(mockUpdateExchangeRate).not.toHaveBeenCalled();
    });
  });
});

// review iteracion 2 #1/#3 (decision del operador: "si una cuota ya esta facturada, no
// se puede modificar o eliminar de ninguna manera").
describe("WorkOrderPaymentPlanSection — cuotas ya facturadas son inmutables (review iteracion 2)", () => {
  // Todas las cuotas de este describe traen invoice_exchange_rate/payment_exchange_rate
  // ya sincronizados con el TC del plan (6.96, ver makePlan()) para que el efecto de
  // auto-sincronizacion (review iteracion 1 #2) no dispare en el montaje y contamine
  // `mock.calls[0]` antes del click que cada test quiere ejercitar.
  it("PEM19: el boton de borrar no se muestra para una cuota ya facturada (Invoiced)", () => {
    const installments = [
      makeInstallment({ installment_number: 1, status: "Invoiced", invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
      makeInstallment({ installment_number: 2, status: "Pending", invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
    ];
    renderSection({ installments });

    expect(screen.queryByTestId("installment-delete-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("installment-delete-1")).toBeInTheDocument();
  });

  it("PEM20: reducir la cantidad de cuotas por debajo de las ya facturadas se rechaza sin tocar nada", () => {
    const onInstallmentsChange = vi.fn();
    const installments = [
      makeInstallment({ installment_number: 1, status: "Invoiced", percentage: 100, amount: 1000, invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
    ];
    renderSection({ installments, onInstallmentsChange });

    fireEvent.click(screen.getByTestId("payment-plan-installments-minus"));

    expect(onInstallmentsChange).not.toHaveBeenCalled();
  });

  it("PEM21: agregar cuotas redistribuye solo el porcentaje de las cuotas Pending, sin tocar la ya facturada", () => {
    const onInstallmentsChange = vi.fn();
    const installments = [
      makeInstallment({ installment_number: 1, status: "Invoiced", percentage: 40, amount: 400, invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
      makeInstallment({ installment_number: 2, status: "Pending", percentage: 60, amount: 600, invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
    ];
    renderSection({ installments, feeWithTax: 1000, onInstallmentsChange });

    fireEvent.click(screen.getByTestId("payment-plan-installments-plus"));

    const rows = onInstallmentsChange.mock.calls[0][0] as PaymentInstallmentInput[];
    const invoiced = rows.find((r) => r.status === "Invoiced")!;
    expect(invoiced.percentage).toBe(40); // unchanged
    expect(invoiced.amount).toBe(400); // unchanged
    const pendingSum = rows.filter((r) => r.status === "Pending").reduce((s, r) => s + r.percentage, 0);
    expect(Math.abs(pendingSum - 60)).toBeLessThanOrEqual(0.01); // remaining 60% split across Pending rows
  });

  it("PEM22: quitar cuotas solo remueve filas Pending, nunca la ya facturada", () => {
    const onInstallmentsChange = vi.fn();
    const installments = [
      makeInstallment({ installment_number: 1, status: "Invoiced", percentage: 30, amount: 300, invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
      makeInstallment({ installment_number: 2, status: "Pending", percentage: 35, amount: 350, invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
      makeInstallment({ installment_number: 3, status: "Pending", percentage: 35, amount: 350, invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
    ];
    renderSection({ installments, feeWithTax: 1000, onInstallmentsChange });

    fireEvent.click(screen.getByTestId("payment-plan-installments-minus"));

    const rows = onInstallmentsChange.mock.calls[0][0] as PaymentInstallmentInput[];
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.status === "Invoiced")).toBe(true);
    const pendingRow = rows.find((r) => r.status === "Pending")!;
    expect(pendingRow.percentage).toBe(70); // remaining 70% on the single surviving Pending row
  });

  it("PEM23: el TC/modo del plan quedan bloqueados si ya existe alguna cuota facturada, aunque isEditable siga true (revertir aprobacion)", () => {
    const installments = [
      makeInstallment({ installment_number: 1, status: "Invoiced", invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
    ];
    renderSection({ installments, isEditable: true });

    expect(screen.getByTestId("payment-plan-exchange-rate")).toBeDisabled();
    expect(screen.getByTestId("payment-plan-exchange-rate-mode-fijo")).toBeDisabled();
    expect(screen.getByTestId("payment-plan-exchange-rate-mode-variable")).toBeDisabled();
  });

  it("PEM24: el TC/modo del plan siguen editables cuando todas las cuotas son Pending", () => {
    const installments = [
      makeInstallment({ installment_number: 1, status: "Pending", invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
    ];
    renderSection({ installments, isEditable: true });

    expect(screen.getByTestId("payment-plan-exchange-rate")).not.toBeDisabled();
    expect(screen.getByTestId("payment-plan-exchange-rate-mode-fijo")).not.toBeDisabled();
  });

  // MUST FIX 0722-156b review iteracion 4 #4: recalcular `amount` de una cuota ya
  // facturada cuando cambia feeWithTax (ej. se corrige el ajuste tras revertir la
  // aprobacion) disparaba el guard INSTALLMENT_LOCKED del trigger de DB, rechazando el
  // guardado completo del plan. Las cuotas Pending si deben recalcularse.
  it("PEM25: cambiar feeWithTax recalcula amount solo en cuotas Pending, nunca en una ya facturada", () => {
    const onInstallmentsChange = vi.fn();
    const installments = [
      makeInstallment({ installment_number: 1, status: "Invoiced", percentage: 40, amount: 400, invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
      makeInstallment({ installment_number: 2, status: "Pending", percentage: 60, amount: 600, invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 }),
    ];
    const { rerenderWith } = renderSectionFull({ installments, feeWithTax: 1000, onInstallmentsChange });

    rerenderWith({ installments, feeWithTax: 2000, onInstallmentsChange });

    const rows = onInstallmentsChange.mock.calls[0][0] as PaymentInstallmentInput[];
    const invoiced = rows.find((r) => r.status === "Invoiced")!;
    expect(invoiced.amount).toBe(400); // unchanged — locked
    const pending = rows.find((r) => r.status === "Pending")!;
    expect(pending.amount).toBe(1200); // 60% of the new 2000 feeWithTax
  });
});

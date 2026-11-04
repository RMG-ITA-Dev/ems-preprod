import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 1028-214: traer el TC de una fecha — en el encabezado del plan (quien lo arma), en las celdas
// por fila del modo Variable y en el diálogo de facturar/cobrar (Cobranzas). Archivo aparte
// porque necesita mockear la RPC, el toast y el calendario, que las otras dos suites del plan
// de pagos usan reales o no usan.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

const mockUpdateStatus = vi.hoisted(() => vi.fn());
const mockUpdateExchangeRate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/mutations", () => ({
  useUpdateInstallmentStatus: () => ({ mutate: mockUpdateStatus, isPending: false }),
  useUpdateCollectionDate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInstallmentExchangeRate: () => ({ mutate: mockUpdateExchangeRate, isPending: false }),
  useRescheduleInstallment: () => ({ mutate: vi.fn(), isPending: false }),
  useRecordInstallmentConfirmation: () => ({ mutate: vi.fn(), isPending: false }),
  useAddInstallmentNote: () => ({ mutate: vi.fn(), isPending: false }),
  useEditInstallmentNote: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteInstallmentNote: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateExpenseReimbursementRow: () => ({ mutate: vi.fn(), isPending: false }),
  useSetExpenseReimbursementAmount: () => ({ mutate: vi.fn(), isPending: false }),
  useAddInstallmentAdjustment: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteInstallmentAdjustment: () => ({ mutate: vi.fn(), isPending: false }),
  useSetInstallmentCurrency: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useClientContacts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useClientContacts")>();
  return { ...real, useWorkOrderClientContacts: () => ({ data: [] }) };
});
vi.mock("@/hooks/useInstallmentNotes", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useInstallmentNotes")>();
  return { ...real, useInstallmentNotes: () => ({ data: [] }) };
});
vi.mock("@/hooks/useInstallmentEvents", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useInstallmentEvents")>();
  return { ...real, useInstallmentEvents: () => ({ data: [] }) };
});
vi.mock("@/hooks/useInstallmentAdjustments", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useInstallmentAdjustments")>();
  return { ...real, useInstallmentAdjustments: () => ({ data: [] }) };
});
vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useExchangeRate", () => ({
  useLatestExchangeRate: () => ({ data: { compra: 11.57, fecha_vigencia: "2026-11-03" } }),
}));

// La RPC exchange_rate_on_detail: cada test decide qué devuelve.
const mockRpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rpcUntyped", () => ({ rpcUntyped: mockRpc }));

const mockToastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: mockToastError, success: vi.fn() } }));

// El calendario real (react-day-picker dentro de un Popover) se prueba aparte en
// RateFromDatePicker.test.tsx. Acá es un botón que "elige" la fecha que el test deje en `pick`.
const pick = vi.hoisted(() => ({ date: "2026-10-11" }));
vi.mock("@/components/forms/RateFromDatePicker", () => ({
  RateFromDatePicker: ({
    onPick,
    disabled,
    testId,
  }: {
    onPick: (d: string) => void;
    disabled?: boolean;
    testId: string;
  }) => (
    <button type="button" data-testid={testId} disabled={disabled} onClick={() => onPick(pick.date)}>
      pick
    </button>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children?: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <select data-testid="select" value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children, disabled }: { value?: string; children?: React.ReactNode; disabled?: boolean }) => (
    <option value={value} disabled={disabled}>{children}</option>
  ),
  SelectGroup: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectLabel: () => null,
  SelectScrollUpButton: () => null,
  SelectScrollDownButton: () => null,
  SelectSeparator: () => null,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/numeric-input", () => ({
  NumericInput: ({
    value,
    onChange,
    onBlur,
    disabled,
    "data-testid": testId,
  }: {
    value?: number | string;
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
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;
  (Element.prototype as any).scrollIntoView = vi.fn();
});

import { WorkOrderPaymentPlanSection } from "../WorkOrderPaymentPlanSection";
import type { PaymentInstallmentInput, PaymentInstallmentStatus, PaymentPlanInput } from "@/types/workOrderPaymentPlan";

const makeQC = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

let idSeq = 0;
function makeInstallment(overrides: Partial<PaymentInstallmentInput> = {}): PaymentInstallmentInput {
  return {
    installment_id: `inst-${++idSeq}`,
    plan_id: "plan-1",
    wo_id: "wo-1",
    installment_number: 1,
    agreed_invoice_date: null,
    agreed_payment_date: null,
    collection_invoice_date: null,
    collection_payment_date: null,
    payment_date_actual: null,
    percentage: 100,
    amount: 1000,
    status: "Pending" as PaymentInstallmentStatus,
    // Ya sincronizados con el TC del plan: así los efectos de autocompletado no disparan al
    // montar y no ensucian los espías.
    invoice_exchange_rate: 6.96,
    payment_exchange_rate: 6.96,
    ...overrides,
  };
}

function makePlan(overrides: Partial<PaymentPlanInput> = {}): PaymentPlanInput {
  return { plan_id: "plan-1", wo_id: "wo-1", exchange_rate: 6.96, payment_days: 30, exchange_rate_mode: "fijo", ...overrides };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    woId: "wo-1",
    currency: "USD" as const,
    feeWithTax: 1000,
    plan: makePlan(),
    installments: [makeInstallment()],
    isEditable: true,
    isStatusEditable: true,
    isAdminDateEditable: false,
    canEditPaymentPlan: true,
    onPlanChange: vi.fn(),
    onInstallmentsChange: vi.fn(),
    ...overrides,
  };
}

function renderSection(overrides: Record<string, unknown> = {}) {
  const props = baseProps(overrides);
  const utils = render(
    <QueryClientProvider client={makeQC()}>
      <WorkOrderPaymentPlanSection {...(props as any)} />
    </QueryClientProvider>,
  );
  return { ...utils, props };
}

// Una página real guarda las cuotas en estado y las devuelve como prop. Sin esto, lo que
// cambia onInstallmentsChange no llega a la pantalla.
function renderStateful(overrides: Record<string, unknown> = {}) {
  const qc = makeQC();
  const onInstallmentsChange = vi.fn();
  function Harness() {
    const initial = baseProps(overrides);
    const [installments, setInstallments] = React.useState(initial.installments as PaymentInstallmentInput[]);
    return (
      <WorkOrderPaymentPlanSection
        {...(initial as any)}
        installments={installments}
        onInstallmentsChange={(next: PaymentInstallmentInput[]) => {
          onInstallmentsChange(next);
          setInstallments(next);
        }}
      />
    );
  }
  render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
  return { onInstallmentsChange };
}

const rateRow = (compra: number, fecha_vigencia: string) => ({ data: [{ compra, fecha_vigencia }], error: null });
const noRate = { data: [], error: null };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockToastError.mockReset();
  mockUpdateStatus.mockReset();
  mockUpdateExchangeRate.mockReset();
  pick.date = "2026-10-11";
});

describe("1028-214 — TC del encabezado del plan desde una fecha", () => {
  it("PEH1: el selector solo aparece cuando el campo se puede editar, y nunca en BOB", () => {
    const { unmount } = renderSection();
    expect(screen.getByTestId("payment-plan-exchange-rate-date")).toBeEnabled();
    unmount();

    // A quien no puede usarlo no se le muestra un control apagado.
    const r2 = renderSection({ isEditable: false });
    expect(screen.queryByTestId("payment-plan-exchange-rate-date")).not.toBeInTheDocument();
    r2.unmount();

    const r3 = renderSection({ canEditPaymentPlan: false });
    expect(screen.queryByTestId("payment-plan-exchange-rate-date")).not.toBeInTheDocument();
    r3.unmount();

    // Con una cuota ya facturada el plan está bloqueado.
    const r4 = renderSection({ installments: [makeInstallment({ status: "Invoiced" })] });
    expect(screen.queryByTestId("payment-plan-exchange-rate-date")).not.toBeInTheDocument();
    r4.unmount();

    renderSection({ currency: "BOB" });
    expect(screen.queryByTestId("payment-plan-exchange-rate-date")).not.toBeInTheDocument();
  });

  it("PEH1b: también está en modo Variable", () => {
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }) });
    expect(screen.getByTestId("payment-plan-exchange-rate-date")).toBeEnabled();
  });

  it("PEH2: trae el TC de la fecha y lo propaga a las cuotas en modo Fijo", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    const { props } = renderSection();
    (props.onPlanChange as ReturnType<typeof vi.fn>).mockClear();
    (props.onInstallmentsChange as ReturnType<typeof vi.fn>).mockClear();
    pick.date = "2026-10-09";

    fireEvent.click(screen.getByTestId("payment-plan-exchange-rate-date"));

    await waitFor(() =>
      expect(props.onPlanChange).toHaveBeenCalledWith(expect.objectContaining({ exchange_rate: 6.9 })),
    );
    expect(mockRpc).toHaveBeenCalledWith("exchange_rate_on_detail", { p_date: "2026-10-09" });
    expect(props.onInstallmentsChange).toHaveBeenCalledWith([
      expect.objectContaining({ invoice_exchange_rate: 6.9, payment_exchange_rate: 6.9 }),
    ]);
  });

  it("PEH3: avisa solo cuando la cotización es de un día anterior al elegido", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    pick.date = "2026-10-09";
    const { unmount } = renderSection();
    fireEvent.click(screen.getByTestId("payment-plan-exchange-rate-date"));
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId("rate-note-plan")).not.toBeInTheDocument();
    unmount();

    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    pick.date = "2026-10-11";
    renderSection();
    fireEvent.click(screen.getByTestId("payment-plan-exchange-rate-date"));
    expect(await screen.findByTestId("rate-note-plan")).toHaveTextContent("workOrders.paymentPlan.rateFromEarlierDate");
  });

  it("PEH4: sin cotización avisa y no toca el TC", async () => {
    mockRpc.mockResolvedValueOnce(noRate);
    const { props } = renderSection();
    (props.onPlanChange as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.click(screen.getByTestId("payment-plan-exchange-rate-date"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("workOrders.paymentPlan.invoiceRateNotFound"));
    expect(props.onPlanChange).not.toHaveBeenCalled();
  });

  it("PEH5: teclear borra el aviso, y una respuesta que llega después del tecleo se descarta", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    const { props } = renderSection();
    fireEvent.click(screen.getByTestId("payment-plan-exchange-rate-date"));
    await screen.findByTestId("rate-note-plan");

    fireEvent.change(screen.getByTestId("payment-plan-exchange-rate"), { target: { value: "7" } });
    fireEvent.change(screen.getByTestId("payment-plan-exchange-rate"), { target: { value: "7.1" } });
    expect(screen.queryByTestId("rate-note-plan")).not.toBeInTheDocument();

    // Consulta que vuelve tarde: la persona ya escribió otro valor.
    const late = deferred<ReturnType<typeof rateRow>>();
    mockRpc.mockReturnValueOnce(late.promise);
    fireEvent.click(screen.getByTestId("payment-plan-exchange-rate-date"));
    fireEvent.change(screen.getByTestId("payment-plan-exchange-rate"), { target: { value: "7.2" } });
    (props.onPlanChange as ReturnType<typeof vi.fn>).mockClear();
    await act(async () => { late.resolve(rateRow(5.5, "2026-10-09")); });

    expect(props.onPlanChange).not.toHaveBeenCalledWith(expect.objectContaining({ exchange_rate: 5.5 }));
    expect(screen.queryByTestId("rate-note-plan")).not.toBeInTheDocument();
  });
});

describe("1028-214 — TC por fila desde una fecha (modo Variable)", () => {
  const variable = makePlan({ exchange_rate_mode: "variable" });

  it("PER1: cada selector aparece solo en la ventana en que su celda se puede editar", () => {
    const { unmount } = renderSection({ plan: variable, installments: [makeInstallment({ status: "Pending" })] });
    expect(screen.getByTestId("installment-invoice-rate-date")).toBeEnabled();
    expect(screen.queryByTestId("installment-payment-rate-date")).not.toBeInTheDocument();
    unmount();

    for (const status of ["Invoiced", "Overdue"] as PaymentInstallmentStatus[]) {
      const r = renderSection({ plan: variable, installments: [makeInstallment({ status })] });
      expect(screen.queryByTestId("installment-invoice-rate-date")).not.toBeInTheDocument();
      expect(screen.getByTestId("installment-payment-rate-date")).toBeEnabled();
      r.unmount();
    }

    const r3 = renderSection({ plan: variable, installments: [makeInstallment({ status: "Completed" })] });
    expect(screen.queryByTestId("installment-invoice-rate-date")).not.toBeInTheDocument();
    expect(screen.queryByTestId("installment-payment-rate-date")).not.toBeInTheDocument();
    r3.unmount();

    // Gerente del encargo, socio, etc. (sin isStatusEditable): ven el TC pero no el selector.
    renderSection({ plan: variable, isStatusEditable: false, installments: [makeInstallment({ status: "Pending" })] });
    expect(screen.queryByTestId("installment-invoice-rate-date")).not.toBeInTheDocument();
    expect(screen.queryByTestId("installment-payment-rate-date")).not.toBeInTheDocument();
    expect(screen.getByTestId("installment-invoice-rate")).toBeDisabled();
  });

  it("PER2: en modo Fijo no hay selectores por fila", () => {
    renderSection({ installments: [makeInstallment({ status: "Invoiced" })] });
    expect(screen.queryByTestId("installment-invoice-rate-date")).not.toBeInTheDocument();
    expect(screen.queryByTestId("installment-payment-rate-date")).not.toBeInTheDocument();
  });

  it("PER3: trae el TC de la fecha, lo aplica solo a esa fila y lo guarda en el acto", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    const { onInstallmentsChange } = renderStateful({
      woId: "wo-9",
      plan: variable,
      installments: [makeInstallment({ installment_id: "inst-a", status: "Pending" })],
    });

    fireEvent.click(screen.getByTestId("installment-invoice-rate-date"));

    await waitFor(() =>
      expect(mockUpdateExchangeRate).toHaveBeenCalledWith({
        installmentId: "inst-a",
        field: "invoice_exchange_rate",
        value: 6.9,
        woId: "wo-9",
      }),
    );
    expect(onInstallmentsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ installment_id: "inst-a", invoice_exchange_rate: 6.9 }),
    ]);
    expect(screen.getByTestId("rate-note-inst-a:invoice")).toBeInTheDocument();
  });

  it("PER3b: lo mismo con el TC de pago de una cuota facturada", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    renderStateful({
      plan: variable,
      installments: [makeInstallment({ installment_id: "inst-b", status: "Invoiced" })],
    });

    fireEvent.click(screen.getByTestId("installment-payment-rate-date"));

    await waitFor(() =>
      expect(mockUpdateExchangeRate).toHaveBeenCalledWith(
        expect.objectContaining({ installmentId: "inst-b", field: "payment_exchange_rate", value: 6.9 }),
      ),
    );
  });

  it("PER4: con cambios del plan sin guardar avisa y no consulta ni guarda", () => {
    renderSection({ plan: variable, isPaymentPlanDirty: true, installments: [makeInstallment({ status: "Pending" })] });

    fireEvent.click(screen.getByTestId("installment-invoice-rate-date"));

    expect(mockToastError).toHaveBeenCalledWith("workOrders.paymentPlan.validationSavePlanFirst");
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpdateExchangeRate).not.toHaveBeenCalled();
  });

  it("PER5: una fila todavía sin guardar solo cambia en pantalla", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    const { onInstallmentsChange } = renderStateful({
      plan: variable,
      installments: [makeInstallment({ installment_id: undefined, status: "Pending" })],
    });
    onInstallmentsChange.mockClear();

    fireEvent.click(screen.getByTestId("installment-invoice-rate-date"));

    await waitFor(() =>
      expect(onInstallmentsChange).toHaveBeenCalledWith([expect.objectContaining({ invoice_exchange_rate: 6.9 })]),
    );
    expect(mockUpdateExchangeRate).not.toHaveBeenCalled();
  });

  it("PER6: después de traer el TC se puede corregir a mano, y se guarda lo tecleado", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    renderStateful({
      plan: variable,
      installments: [makeInstallment({ installment_id: "inst-c", status: "Pending" })],
    });
    fireEvent.click(screen.getByTestId("installment-invoice-rate-date"));
    await screen.findByTestId("rate-note-inst-c:invoice");
    mockUpdateExchangeRate.mockClear();

    const input = screen.getByTestId("installment-invoice-rate");
    for (const v of ["7", "7.1", "7.15"]) fireEvent.change(input, { target: { value: v } });
    fireEvent.blur(input);

    expect(mockUpdateExchangeRate).toHaveBeenCalledTimes(1);
    expect(mockUpdateExchangeRate).toHaveBeenCalledWith(expect.objectContaining({ installmentId: "inst-c", value: 7.15 }));
    expect(screen.queryByTestId("rate-note-inst-c:invoice")).not.toBeInTheDocument();
  });

  it("PER6b: un blur sin edición después de traer el TC no lo vuelve a guardar", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    renderStateful({
      plan: variable,
      installments: [makeInstallment({ installment_id: "inst-c2", status: "Pending" })],
    });
    fireEvent.click(screen.getByTestId("installment-invoice-rate-date"));
    await waitFor(() => expect(mockUpdateExchangeRate).toHaveBeenCalledTimes(1));

    fireEvent.blur(screen.getByTestId("installment-invoice-rate"));

    // El blur guarda el valor de la cuota, que ya es el traído: nunca uno anterior.
    for (const call of mockUpdateExchangeRate.mock.calls) expect(call[0].value).toBe(6.9);
  });

  it("PER7: si dos consultas vuelven en desorden, vale la última fecha elegida", async () => {
    const first = deferred<ReturnType<typeof rateRow>>();
    const second = deferred<ReturnType<typeof rateRow>>();
    mockRpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderStateful({
      plan: variable,
      installments: [makeInstallment({ installment_id: "inst-d", status: "Pending" })],
    });

    fireEvent.click(screen.getByTestId("installment-invoice-rate-date"));
    fireEvent.click(screen.getByTestId("installment-invoice-rate-date"));
    await act(async () => { second.resolve(rateRow(7.2, "2026-10-11")); });
    await act(async () => { first.resolve(rateRow(6.9, "2026-10-09")); });

    expect(mockUpdateExchangeRate).toHaveBeenCalledTimes(1);
    expect(mockUpdateExchangeRate).toHaveBeenCalledWith(expect.objectContaining({ value: 7.2 }));
    expect(screen.getByTestId("installment-invoice-rate")).toHaveValue(7.2);
  });

  it("PER8: elegir en una fila no toca la otra", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    const { onInstallmentsChange } = renderStateful({
      plan: variable,
      installments: [
        makeInstallment({ installment_id: "inst-e1", installment_number: 1, percentage: 50, status: "Pending" }),
        makeInstallment({ installment_id: "inst-e2", installment_number: 2, percentage: 50, status: "Pending" }),
      ],
    });

    fireEvent.click(screen.getAllByTestId("installment-invoice-rate-date")[1]);

    await waitFor(() =>
      expect(mockUpdateExchangeRate).toHaveBeenCalledWith(expect.objectContaining({ installmentId: "inst-e2" })),
    );
    expect(onInstallmentsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ installment_id: "inst-e1", invoice_exchange_rate: 6.96 }),
      expect.objectContaining({ installment_id: "inst-e2", invoice_exchange_rate: 6.9 }),
    ]);
    expect(screen.queryByTestId("rate-note-inst-e1:invoice")).not.toBeInTheDocument();
    expect(screen.getByTestId("rate-note-inst-e2:invoice")).toBeInTheDocument();
  });
});

describe("1028-214 — TC desde una fecha en el diálogo de facturar/cobrar (Cobranzas)", () => {
  // Abre el diálogo de cambio de estado de la fila `rowIdx` hacia `status`.
  const openStatusDialog = (status: PaymentInstallmentStatus, rowIdx = 0) => {
    const selects = screen
      .getAllByTestId("select")
      .filter((el) => Array.from((el as HTMLSelectElement).options).some((o) => o.value === status));
    fireEvent.change(selects[rowIdx], { target: { value: status } });
  };

  it("PTC6: elegir una fecha trae el TC al campo del diálogo", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }) });
    openStatusDialog("Invoiced");

    fireEvent.click(within(screen.getByRole("dialog")).getByTestId("invoice-rate-date"));

    await waitFor(() => expect(screen.getByTestId("invoice-rate-input")).toHaveValue(6.9));
    expect(mockRpc).toHaveBeenCalledWith("exchange_rate_on_detail", { p_date: "2026-10-11" });
  });

  it("PTC7: avisa si la cotización es de un día anterior; si es del mismo día, no", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    const { unmount } = renderSection();
    openStatusDialog("Invoiced");
    fireEvent.click(screen.getByTestId("invoice-rate-date"));
    expect(await screen.findByTestId("rate-note-dialog")).toBeInTheDocument();
    unmount();

    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    pick.date = "2026-10-09";
    renderSection();
    openStatusDialog("Invoiced");
    fireEvent.click(screen.getByTestId("invoice-rate-date"));
    await waitFor(() => expect(screen.getByTestId("invoice-rate-input")).toHaveValue(6.9));
    expect(screen.queryByTestId("rate-note-dialog")).not.toBeInTheDocument();
  });

  it("PTC8: teclear borra el aviso, y abrir el diálogo de otra cuota no lo arrastra", async () => {
    mockRpc.mockResolvedValue(rateRow(6.9, "2026-10-09"));
    renderSection({
      installments: [
        makeInstallment({ installment_number: 1, percentage: 50 }),
        makeInstallment({ installment_number: 2, percentage: 50 }),
      ],
    });
    openStatusDialog("Invoiced", 0);
    fireEvent.click(screen.getByTestId("invoice-rate-date"));
    await screen.findByTestId("rate-note-dialog");

    fireEvent.change(screen.getByTestId("invoice-rate-input"), { target: { value: "7.3" } });
    expect(screen.queryByTestId("rate-note-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("invoice-rate-date"));
    await screen.findByTestId("rate-note-dialog");
    fireEvent.click(screen.getByText("common.cancel"));
    openStatusDialog("Invoiced", 1);
    expect(screen.queryByTestId("rate-note-dialog")).not.toBeInTheDocument();
  });

  it("PTC9: al facturar se manda el TC traído y la fecha elegida", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }) });
    openStatusDialog("Invoiced");
    fireEvent.click(screen.getByTestId("invoice-rate-date"));
    await waitFor(() => expect(screen.getByTestId("invoice-rate-input")).toHaveValue(6.9));

    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmInvoicedAction"));

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: "Invoiced", invoiceExchangeRate: 6.9, invoiceExchangeRateDate: "2026-10-11" }),
    );
  });

  it("PTC9b: al cobrar se manda el TC traído", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    renderSection({
      installments: [
        makeInstallment({
          status: "Invoiced",
          collection_invoice_date: "2026-10-01",
          collection_payment_date: "2026-11-15",
        }),
      ],
    });
    openStatusDialog("Completed");
    fireEvent.click(screen.getByTestId("invoice-rate-date"));
    await waitFor(() => expect(screen.getByTestId("invoice-rate-input")).toHaveValue(6.9));

    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmCompletedAction"));

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: "Completed", paymentExchangeRate: 6.9 }),
    );
  });
});

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
const saveGate = vi.hoisted(() => ({ next: undefined as ((v: unknown) => Promise<void>) | undefined }));
vi.mock("@/hooks/mutations", () => ({
  useUpdateInstallmentStatus: () => ({ mutate: mockUpdateStatus, isPending: false }),
  useUpdateCollectionDate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // Los guardados de TC por celda salen por mutateAsync, encolados por celda. `saveGate` deja
  // que un test controle cuándo termina cada guardado.
  useUpdateInstallmentExchangeRate: () => ({
    mutate: mockUpdateExchangeRate,
    mutateAsync: (v: unknown) => {
      mockUpdateExchangeRate(v);
      return saveGate.next ? saveGate.next(v) : Promise.resolve();
    },
    isPending: false,
  }),
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
// La bitácora: vacía salvo en los tests del historial (Parte B).
const events = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/hooks/useInstallmentEvents", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useInstallmentEvents")>();
  return { ...real, useInstallmentEvents: () => ({ data: events.list }) };
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
  // `loading` se expone como atributo y NO deshabilita el mock: los tests de carrera necesitan
  // poder elegir dos fechas seguidas. Que el componente real se deshabilite lo prueba
  // RateFromDatePicker.test.tsx.
  RateFromDatePicker: ({
    onPick,
    disabled,
    loading,
    testId,
  }: {
    onPick: (d: string) => void;
    disabled?: boolean;
    loading?: boolean;
    testId: string;
  }) => (
    <button
      type="button"
      data-testid={testId}
      data-loading={loading ? "true" : undefined}
      disabled={disabled}
      onClick={() => onPick(pick.date)}
    >
      pick
    </button>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    disabled,
    onValueChange,
  }: {
    children?: React.ReactNode;
    value?: string;
    disabled?: boolean;
    onValueChange?: (v: string) => void;
  }) => (
    <select
      data-testid="select"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
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
  events.list = [];
  saveGate.next = undefined;
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
        // Parte B: se guarda también de qué cotización salió.
        rateDate: "2026-10-09",
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

  it("PTC9: al facturar se manda el TC traído y la fecha de SU cotización, no la elegida", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }) });
    openStatusDialog("Invoiced");
    fireEvent.click(screen.getByTestId("invoice-rate-date"));
    await waitFor(() => expect(screen.getByTestId("invoice-rate-input")).toHaveValue(6.9));

    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmInvoicedAction"));

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      // Se eligió el 11/10 (sin cotización) y el TC salió del 09/10: se guarda el 09/10.
      expect.objectContaining({ newStatus: "Invoiced", invoiceExchangeRate: 6.9, invoiceExchangeRateDate: "2026-10-09" }),
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

// Parte B (commit aparte): la trazabilidad que pidió Q49. Lo que se guarda es la fecha DE LA
// COTIZACIÓN de la que salió el TC —no la elegida en el calendario—, también para el TC de pago;
// la bitácora registra el TC con que se facturó o se cobró; la pantalla lo muestra; y corregir la
// Fecha Fact. avisa si la fecha nueva tiene otra cotización.
describe("1028-214 Parte B — trazabilidad del TC en Cobranzas", () => {
  const variable = makePlan({ exchange_rate_mode: "variable" });
  const openStatusDialog = (status: PaymentInstallmentStatus) => {
    const select = screen
      .getAllByTestId("select")
      .find((el) => Array.from((el as HTMLSelectElement).options).some((o) => o.value === status))!;
    fireEvent.change(select, { target: { value: status } });
  };
  const facturada = (over: Partial<PaymentInstallmentInput> = {}) =>
    makeInstallment({
      status: "Invoiced",
      collection_invoice_date: "2026-10-21",
      collection_payment_date: "2026-11-20",
      invoice_exchange_rate: 11.73,
      invoice_exchange_rate_date: "2026-10-21",
      payment_exchange_rate: null,
      ...over,
    });

  it("PTC10: facturar en Variable sin tocar nada guarda la fecha de la cotización del día", () => {
    renderSection({ plan: variable, installments: [makeInstallment()] });
    openStatusDialog("Invoiced");
    expect(screen.getByTestId("invoice-rate-input")).toHaveValue(11.57);
    expect(screen.getByTestId("invoice-rate-origin")).toHaveTextContent("workOrders.paymentPlan.rateOriginDate");

    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmInvoicedAction"));

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceExchangeRate: 11.57, invoiceExchangeRateDate: "2026-11-03" }),
    );
  });

  it("PTC11: en Variable, el TC traído de una fecha desde la fila se respeta al facturar", () => {
    renderSection({
      plan: variable,
      installments: [makeInstallment({ invoice_exchange_rate: 6.9, invoice_exchange_rate_date: "2026-10-09" })],
    });
    openStatusDialog("Invoiced");
    expect(screen.getByTestId("invoice-rate-input")).toHaveValue(6.9);

    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmInvoicedAction"));

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceExchangeRate: 6.9, invoiceExchangeRateDate: "2026-10-09" }),
    );
  });

  it("PTC11b: sin fecha en la fila, Variable sigue proponiendo el TC del día (Q49)", () => {
    renderSection({ plan: variable, installments: [makeInstallment({ invoice_exchange_rate: 6.9 })] });
    openStatusDialog("Invoiced");
    expect(screen.getByTestId("invoice-rate-input")).toHaveValue(11.57);
  });

  it("PTC13: un TC tecleado, o el del plan en Fijo, se guarda sin fecha", () => {
    const { unmount } = renderSection({ plan: variable, installments: [makeInstallment()] });
    openStatusDialog("Invoiced");
    fireEvent.change(screen.getByTestId("invoice-rate-input"), { target: { value: "7.3" } });
    expect(screen.getByTestId("invoice-rate-origin")).toHaveTextContent("workOrders.paymentPlan.rateOriginManual");
    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmInvoicedAction"));
    expect(mockUpdateStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ invoiceExchangeRate: 7.3, invoiceExchangeRateDate: null }),
    );
    unmount();

    renderSection({ installments: [makeInstallment()] });
    openStatusDialog("Invoiced");
    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmInvoicedAction"));
    expect(mockUpdateStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ invoiceExchangeRate: 6.96, invoiceExchangeRateDate: null }),
    );
  });

  it("PTC14: cobrar guarda la fecha de la cotización del TC de pago", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    const { unmount } = renderSection({ plan: variable, installments: [facturada()] });
    openStatusDialog("Completed");
    // Sin TC de pago en la cuota, propone el del día con su cotización.
    expect(screen.getByTestId("invoice-rate-input")).toHaveValue(11.57);
    fireEvent.click(screen.getByTestId("invoice-rate-date"));
    await waitFor(() => expect(screen.getByTestId("invoice-rate-input")).toHaveValue(6.9));
    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmCompletedAction"));
    expect(mockUpdateStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ newStatus: "Completed", paymentExchangeRate: 6.9, paymentExchangeRateDate: "2026-10-09" }),
    );
    unmount();

    // Con un TC de pago ya capturado desde la fila, se respeta él y su fecha.
    renderSection({
      plan: variable,
      installments: [facturada({ payment_exchange_rate: 11.9, payment_exchange_rate_date: "2026-10-30" })],
    });
    openStatusDialog("Completed");
    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmCompletedAction"));
    expect(mockUpdateStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ paymentExchangeRate: 11.9, paymentExchangeRateDate: "2026-10-30" }),
    );
  });

  it("PTC15: el historial muestra el TC de facturar/cobrar y de qué cotización salió", () => {
    const ev = (over: Record<string, unknown>) => ({
      event_id: `ev-${Math.random()}`,
      seq: 1,
      installment_id: "i-h",
      wo_id: "wo-1",
      action: "status_change",
      from_status: "Pending",
      to_status: "Invoiced",
      old_date: null,
      new_date: null,
      amount: null,
      currency: null,
      reason: null,
      actor_staff_id: "s-1",
      created_at: "2026-10-21T15:00:00Z",
      actor: { first_name: "Ana", last_name: "Cobranzas" },
      ...over,
    });
    events.list = [
      ev({ exchange_rate: 11.73, exchange_rate_date: "2026-10-21" }),
      ev({ from_status: "Invoiced", to_status: "Completed", exchange_rate: 11.9, exchange_rate_date: null }),
      ev({ from_status: "Invoiced", to_status: "Overdue" }),
    ];
    renderSection({ installments: [facturada({ installment_id: "i-h" })] });
    fireEvent.click(screen.getByText("workOrders.paymentPlan.historyCount"));

    const lines = screen.getAllByText(/workOrders\.paymentPlan\.historyStatusChange/).map((el) => el.textContent);
    expect(lines).toContain(
      "workOrders.paymentPlan.historyStatusChange" +
        "workOrders.paymentPlan.historyExchangeRate" +
        "workOrders.paymentPlan.historyExchangeRateDate",
    );
    expect(lines).toContain(
      "workOrders.paymentPlan.historyStatusChange" +
        "workOrders.paymentPlan.historyExchangeRate" +
        "workOrders.paymentPlan.historyExchangeRateManual",
    );
    expect(lines).toContain("workOrders.paymentPlan.historyStatusChange");
  });

  it("PER10: la celda muestra de qué cotización es el TC, también en Fijo", () => {
    const { unmount } = renderSection({
      plan: variable,
      installments: [facturada({ installment_id: "i-v" })],
    });
    expect(screen.getByTestId("rate-origin-i-v:invoice")).toHaveTextContent("workOrders.paymentPlan.rateOriginDate");
    expect(screen.queryByTestId("rate-origin-i-v:payment")).not.toBeInTheDocument();
    unmount();

    renderSection({
      installments: [facturada({ installment_id: "i-f", payment_exchange_rate: 6.96, payment_exchange_rate_date: "2026-10-30" })],
    });
    expect(screen.getByTestId("rate-origin-i-f:payment")).toBeInTheDocument();
  });

  describe("aviso al corregir la Fecha Fact.", () => {
    const changeInvoiceDate = (container: HTMLElement, from: string, to: string) => {
      const input = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]')).find(
        (el) => el.value === from,
      )!;
      fireEvent.change(input, { target: { value: to } });
    };

    it("PTC16: si la fecha nueva tiene otra cotización, avisa con los dos TC y no bloquea", async () => {
      mockRpc.mockResolvedValueOnce(rateRow(11.68, "2026-10-15"));
      const { container } = renderSection({ installments: [facturada()] });

      changeInvoiceDate(container, "2026-10-21", "2026-10-15");

      expect(await screen.findByTestId("collection-date-rate-warning")).toHaveTextContent(
        "workOrders.paymentPlan.collectionDateRateMismatch",
      );
      expect(mockRpc).toHaveBeenCalledWith("exchange_rate_on_detail", { p_date: "2026-10-15" });
      expect(screen.getByText("workOrders.paymentPlan.confirmCollectionDateAction")).toBeEnabled();
    });

    it("PTC17: si la cotización vigente es la misma que la del TC, no avisa", async () => {
      // Domingo 26/10: su cotización vigente es la del 24/10, que es la que ya tiene el TC.
      mockRpc.mockResolvedValueOnce(rateRow(11.88, "2026-10-24"));
      const { container } = renderSection({
        installments: [facturada({ invoice_exchange_rate: 11.88, invoice_exchange_rate_date: "2026-10-24" })],
      });

      changeInvoiceDate(container, "2026-10-21", "2026-10-26");

      await waitFor(() => expect(mockRpc).toHaveBeenCalled());
      await act(async () => {});
      expect(screen.queryByTestId("collection-date-rate-warning")).not.toBeInTheDocument();
    });

    it("PTC17b: misma cotización pero el proveedor la corrigió (otro valor): avisa", async () => {
      // El sync pisa la cotización de una fecha ya publicada (upsert por fecha_vigencia): la
      // fecha coincide, pero el TC congelado ya no es el vigente (review de Codex).
      mockRpc.mockResolvedValueOnce(rateRow(11.9, "2026-10-24"));
      const { container } = renderSection({
        installments: [facturada({ invoice_exchange_rate: 11.88, invoice_exchange_rate_date: "2026-10-24" })],
      });

      changeInvoiceDate(container, "2026-10-21", "2026-10-26");

      expect(await screen.findByTestId("collection-date-rate-warning")).toHaveTextContent(
        "workOrders.paymentPlan.collectionDateRateMismatch",
      );
    });

    it("PTC18: sin consulta ni aviso para un TC escrito a mano o una cuota en Bs", async () => {
      const r1 = renderSection({ installments: [facturada({ invoice_exchange_rate_date: null })] });
      changeInvoiceDate(r1.container, "2026-10-21", "2026-10-15");
      r1.unmount();

      renderSection({ installments: [facturada({ currency: "BOB" })] });
      changeInvoiceDate(document.body, "2026-10-21", "2026-10-15");

      await act(async () => {});
      expect(mockRpc).not.toHaveBeenCalled();
      expect(screen.queryByTestId("collection-date-rate-warning")).not.toBeInTheDocument();
    });

    it("PTC19: sin cotización no avisa, y cancelar no deja el aviso para la próxima vez", async () => {
      mockRpc.mockResolvedValueOnce(noRate);
      const { container } = renderSection({ installments: [facturada()] });
      changeInvoiceDate(container, "2026-10-21", "2026-09-01");
      await waitFor(() => expect(mockRpc).toHaveBeenCalled());
      await act(async () => {});
      expect(screen.queryByTestId("collection-date-rate-warning")).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("common.cancel"));

      // Una consulta que vuelve después de cancelar tampoco lo muestra.
      const late = deferred<ReturnType<typeof rateRow>>();
      mockRpc.mockReturnValueOnce(late.promise);
      changeInvoiceDate(container, "2026-10-21", "2026-10-15");
      fireEvent.click(screen.getByText("common.cancel"));
      await act(async () => { late.resolve(rateRow(11.68, "2026-10-15")); });
      expect(screen.queryByTestId("collection-date-rate-warning")).not.toBeInTheDocument();
    });
  });
});

// Review de Codex sobre el PR: no se puede confirmar mientras se espera una consulta de TC.
describe("1028-214 — confirmar espera a la consulta del TC (review)", () => {
  const openStatusDialog = (status: PaymentInstallmentStatus) => {
    const select = screen
      .getAllByTestId("select")
      .find((el) => Array.from((el as HTMLSelectElement).options).some((o) => o.value === status))!;
    fireEvent.change(select, { target: { value: status } });
  };

  it("PTC20: facturar no se confirma con el TC anterior mientras llega el de la fecha elegida", async () => {
    const slow = deferred<ReturnType<typeof rateRow>>();
    mockRpc.mockReturnValueOnce(slow.promise);
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }) });
    openStatusDialog("Invoiced");

    fireEvent.click(screen.getByTestId("invoice-rate-date"));

    expect(screen.getByTestId("confirm-status-change")).toBeDisabled();
    expect(screen.getByTestId("invoice-rate-date")).toHaveAttribute("data-loading", "true");
    fireEvent.click(screen.getByTestId("confirm-status-change"));
    expect(mockUpdateStatus).not.toHaveBeenCalled();

    await act(async () => { slow.resolve(rateRow(6.9, "2026-10-09")); });

    expect(screen.getByTestId("confirm-status-change")).toBeEnabled();
    fireEvent.click(screen.getByTestId("confirm-status-change"));
    expect(mockUpdateStatus).toHaveBeenCalledWith(expect.objectContaining({ invoiceExchangeRate: 6.9 }));
  });

  it("PTC20b: teclear a mano durante la consulta la descarta y vuelve a habilitar Confirmar", async () => {
    const slow = deferred<ReturnType<typeof rateRow>>();
    mockRpc.mockReturnValueOnce(slow.promise);
    renderSection({ plan: makePlan({ exchange_rate_mode: "variable" }) });
    openStatusDialog("Invoiced");
    fireEvent.click(screen.getByTestId("invoice-rate-date"));
    expect(screen.getByTestId("confirm-status-change")).toBeDisabled();

    fireEvent.change(screen.getByTestId("invoice-rate-input"), { target: { value: "7.3" } });

    expect(screen.getByTestId("confirm-status-change")).toBeEnabled();
    await act(async () => { slow.resolve(rateRow(6.9, "2026-10-09")); });
    expect(screen.getByTestId("invoice-rate-input")).toHaveValue(7.3);
  });

  it("PTC21: la corrección de Fecha Fact. espera la comparación antes de dejar confirmar", async () => {
    const slow = deferred<ReturnType<typeof rateRow>>();
    mockRpc.mockReturnValueOnce(slow.promise);
    const { container } = renderSection({
      installments: [
        makeInstallment({
          status: "Invoiced",
          collection_invoice_date: "2026-10-21",
          collection_payment_date: "2026-11-20",
          invoice_exchange_rate: 11.73,
          invoice_exchange_rate_date: "2026-10-21",
        }),
      ],
    });
    const input = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]')).find(
      (el) => el.value === "2026-10-21",
    )!;
    fireEvent.change(input, { target: { value: "2026-10-15" } });

    expect(screen.getByTestId("confirm-collection-date")).toBeDisabled();
    await act(async () => { slow.resolve(rateRow(11.68, "2026-10-15")); });

    expect(screen.getByTestId("collection-date-rate-warning")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-collection-date")).toBeEnabled();
  });

  it("PTC21b: sin nada que comparar (TC a mano), se puede confirmar de inmediato", () => {
    const { container } = renderSection({
      installments: [
        makeInstallment({
          status: "Invoiced",
          collection_invoice_date: "2026-10-21",
          collection_payment_date: "2026-11-20",
          invoice_exchange_rate: 11.73,
          invoice_exchange_rate_date: null,
        }),
      ],
    });
    const input = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]')).find(
      (el) => el.value === "2026-10-21",
    )!;
    fireEvent.change(input, { target: { value: "2026-10-15" } });

    expect(screen.getByTestId("confirm-collection-date")).toBeEnabled();
  });
});

// Segunda review de Codex: la consulta de la FILA también tiene que terminar antes de facturar o
// cobrar esa cuota. Si no, el diálogo se prellena con el TC anterior y lo congela.
describe("1028-214 — el estado de la fila espera su consulta de TC (review 2)", () => {
  const statusSelect = () =>
    screen
      .getAllByTestId("select")
      .find((el) => Array.from((el as HTMLSelectElement).options).some((o) => o.value === "Invoiced"))!;

  it("PTC22: con la consulta de la fila en curso no se cambia el estado; al volver, el diálogo trae el TC nuevo", async () => {
    const slow = deferred<ReturnType<typeof rateRow>>();
    mockRpc.mockReturnValueOnce(slow.promise);
    renderStateful({
      plan: makePlan({ exchange_rate_mode: "variable" }),
      installments: [makeInstallment({ installment_id: "inst-r", status: "Pending" })],
    });

    fireEvent.click(screen.getByTestId("installment-invoice-rate-date"));

    expect(statusSelect()).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => { slow.resolve(rateRow(6.9, "2026-10-09")); });

    expect(statusSelect()).toBeEnabled();
    fireEvent.change(statusSelect(), { target: { value: "Invoiced" } });
    // La fila ya tiene el TC de la fecha y su cotización: el diálogo lo propone.
    expect(screen.getByTestId("invoice-rate-input")).toHaveValue(6.9);
    fireEvent.click(screen.getByTestId("confirm-status-change"));
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceExchangeRate: 6.9, invoiceExchangeRateDate: "2026-10-09" }),
    );
  });

  it("PTC22b: una consulta en otra fila no bloquea el estado de esta", () => {
    mockRpc.mockReturnValueOnce(deferred<ReturnType<typeof rateRow>>().promise);
    renderStateful({
      plan: makePlan({ exchange_rate_mode: "variable" }),
      installments: [
        makeInstallment({ installment_id: "inst-s1", installment_number: 1, percentage: 50, status: "Pending" }),
        makeInstallment({ installment_id: "inst-s2", installment_number: 2, percentage: 50, status: "Pending" }),
      ],
    });

    fireEvent.click(screen.getAllByTestId("installment-invoice-rate-date")[0]);

    const selects = screen
      .getAllByTestId("select")
      .filter((el) => Array.from((el as HTMLSelectElement).options).some((o) => o.value === "Invoiced"));
    expect(selects[0]).toBeDisabled();
    expect(selects[1]).toBeEnabled();
  });
});

// Tercera review de Codex: el formulario necesita saber que el TC del encabezado está en camino.
describe("1028-214 — la sección avisa la consulta del TC del encabezado (review 3)", () => {
  it("PEH6: avisa al empezar y al terminar la consulta, también si no hay cotización", async () => {
    const onPlanRateLookupChange = vi.fn();
    const slow = deferred<typeof noRate>();
    mockRpc.mockReturnValueOnce(slow.promise);
    renderSection({ onPlanRateLookupChange });
    onPlanRateLookupChange.mockClear();

    fireEvent.click(screen.getByTestId("payment-plan-exchange-rate-date"));
    expect(onPlanRateLookupChange).toHaveBeenLastCalledWith(true);

    await act(async () => { slow.resolve(noRate); });
    expect(onPlanRateLookupChange).toHaveBeenLastCalledWith(false);
  });

  it("PEH7: teclear el TC durante la consulta también libera el aviso", () => {
    const onPlanRateLookupChange = vi.fn();
    mockRpc.mockReturnValueOnce(deferred<typeof noRate>().promise);
    renderSection({ onPlanRateLookupChange });

    fireEvent.click(screen.getByTestId("payment-plan-exchange-rate-date"));
    expect(onPlanRateLookupChange).toHaveBeenLastCalledWith(true);

    fireEvent.change(screen.getByTestId("payment-plan-exchange-rate"), { target: { value: "7" } });
    expect(onPlanRateLookupChange).toHaveBeenLastCalledWith(false);
  });

  it("PEH8: las consultas de una fila no bloquean el guardado del plan", () => {
    const onPlanRateLookupChange = vi.fn();
    mockRpc.mockReturnValueOnce(deferred<typeof noRate>().promise);
    renderSection({
      onPlanRateLookupChange,
      plan: makePlan({ exchange_rate_mode: "variable" }),
      installments: [makeInstallment({ status: "Pending" })],
    });

    fireEvent.click(screen.getByTestId("installment-invoice-rate-date"));

    expect(onPlanRateLookupChange).not.toHaveBeenCalledWith(true);
  });
});

// Quinta review de Codex: dos guardados seguidos de la misma celda no pueden llegar en desorden.
describe("1028-214 — los guardados de una celda de TC se encolan (review 5)", () => {
  it("PER11: el segundo guardado espera al primero, y queda escrito el último que se pidió", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    const firstSave = deferred<void>();
    const calls: number[] = [];
    saveGate.next = (v) => {
      calls.push((v as { value: number }).value);
      return calls.length === 1 ? firstSave.promise : Promise.resolve();
    };
    renderStateful({
      plan: makePlan({ exchange_rate_mode: "variable" }),
      installments: [makeInstallment({ installment_id: "inst-q", status: "Pending" })],
    });

    // 1) El calendario guarda 6.9 y ese guardado queda en vuelo.
    fireEvent.click(screen.getByTestId("installment-invoice-rate-date"));
    await waitFor(() => expect(calls).toEqual([6.9]));

    // 2) Enseguida se teclea 7.2 y se sale de la celda: el segundo guardado NO sale todavía.
    const input = screen.getByTestId("installment-invoice-rate");
    fireEvent.change(input, { target: { value: "7.2" } });
    fireEvent.blur(input);
    expect(calls).toEqual([6.9]);

    // 3) Termina el primero; recién ahí sale el segundo, que es el que queda escrito.
    await act(async () => { firstSave.resolve(); });
    await waitFor(() => expect(calls).toEqual([6.9, 7.2]));
    expect(mockUpdateExchangeRate).toHaveBeenLastCalledWith(
      expect.objectContaining({ installmentId: "inst-q", value: 7.2, rateDate: null }),
    );
  });

  it("PER12: guardados de celdas distintas no se esperan entre sí", async () => {
    mockRpc.mockResolvedValueOnce(rateRow(6.9, "2026-10-09"));
    const calls: string[] = [];
    saveGate.next = (v) => {
      calls.push((v as { installmentId: string }).installmentId);
      return new Promise<void>(() => {}); // nunca termina
    };
    renderStateful({
      plan: makePlan({ exchange_rate_mode: "variable" }),
      installments: [
        makeInstallment({ installment_id: "inst-a1", installment_number: 1, percentage: 50, status: "Pending" }),
        makeInstallment({ installment_id: "inst-a2", installment_number: 2, percentage: 50, status: "Pending" }),
      ],
    });

    fireEvent.click(screen.getAllByTestId("installment-invoice-rate-date")[0]);
    await waitFor(() => expect(calls).toEqual(["inst-a1"]));
    const second = screen.getAllByTestId("installment-invoice-rate")[1];
    fireEvent.change(second, { target: { value: "7.4" } });
    fireEvent.blur(second);

    expect(calls).toEqual(["inst-a1", "inst-a2"]);
  });
});

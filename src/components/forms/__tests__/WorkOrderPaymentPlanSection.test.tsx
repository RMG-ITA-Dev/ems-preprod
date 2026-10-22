import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

// Prevent Supabase client from being imported in the mutation hook
// Cobranzas Fase 3: los espías viven fuera para poder afirmar CON QUÉ se llamó a la RPC.
const mockReschedule = vi.fn();
const mockAddNote = vi.fn();
const mockRecordConfirmation = vi.fn();

const mockUpdateStatus = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/mutations", () => ({
  useUpdateInstallmentStatus: () => ({ mutate: mockUpdateStatus, isPending: false }),
  useUpdateCollectionDate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateInstallmentExchangeRate: () => ({ mutate: vi.fn(), isPending: false }),
  useRescheduleInstallment: () => ({ mutate: mockReschedule, isPending: false }),
  useRecordInstallmentConfirmation: () => ({ mutate: mockRecordConfirmation, isPending: false }),
  useAddInstallmentNote: () => ({ mutate: mockAddNote, isPending: false }),
  useEditInstallmentNote: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteInstallmentNote: () => ({ mutate: vi.fn(), isPending: false }),
  // Cobranzas Fase 7: las dos RPC con las que Contabilidad le factura al cliente los gastos
  // ya ejecutados.
  useCreateExpenseReimbursementRow: () => ({ mutate: vi.fn(), isPending: false }),
  useSetExpenseReimbursementAmount: () => ({ mutate: vi.fn(), isPending: false }),
  // Cobranzas Fase 9: ajustes sobre una cuota, y la moneda de la fila de gastos.
  useAddInstallmentAdjustment: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteInstallmentAdjustment: () => ({ mutate: vi.fn(), isPending: false }),
  useSetInstallmentCurrency: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Cobranzas Fase 4: el hilo de notas se trae con su propia consulta. Se controla desde los
// tests para poder montar la sección con y sin notas.
let mockNotes: unknown[] = [];
// Cobranzas Fase 5: los contactos del cliente se traen con su propia RPC.
vi.mock("@/hooks/useClientContacts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useClientContacts")>();
  return { ...real, useWorkOrderClientContacts: () => ({ data: [] }) };
});

vi.mock("@/hooks/useInstallmentNotes", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useInstallmentNotes")>();
  return { ...real, useInstallmentNotes: () => ({ data: mockNotes }) };
});

// La bitácora de la cuota. Se controla desde los tests para montar la sección con y sin
// historial: sin eventos el botón no existe, que es el caso normal de una cuota recién creada.
let mockEvents: unknown[] = [];
vi.mock("@/hooks/useInstallmentEvents", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useInstallmentEvents")>();
  return { ...real, useInstallmentEvents: () => ({ data: mockEvents }) };
});

// Los ajustes de la OT. Vacío salvo en los tests que los necesitan.
let mockAdjustments: unknown[] = [];
vi.mock("@/hooks/useInstallmentAdjustments", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useInstallmentAdjustments")>();
  return { ...real, useInstallmentAdjustments: () => ({ data: mockAdjustments }) };
});

// WorkOrderPaymentPlanSection now calls useLatestExchangeRate (0722-156b Fase 2) —
// unrelated to this suite's Fase-1-and-earlier coverage, so stub it out with no data.
vi.mock("@/hooks/useExchangeRate", () => ({
  useLatestExchangeRate: () => ({ data: null }),
}));

// Radix Select requires PointerEvent APIs not available in jsdom.
// Se renderiza como un <select> nativo —y no como un <div>— para poder DISPARAR el cambio de
// estado desde el test: el diálogo de cobro sólo se abre por esa vía.
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
    <select
      data-testid="select"
      data-value={value}
      value={value ?? ""}
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
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...(props as object)} />,
}));

vi.mock("@/components/ui/numeric-input", () => ({
  NumericInput: ({
    value,
    onChange,
    onBlur,
    disabled,
    decimals,
    locale,
    min,
    "data-testid": testId,
  }: {
    value?: number | string;
    onChange?: (val: number) => void;
    onBlur?: () => void;
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
    canEditPaymentPlan: true,
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

  // Iteración 17/18 (decisión del operador 2026-09-10): NULL sigue siendo válido solo
  // mientras el plan NUNCA tuvo un TC real -- una vez que tiene un valor real, no se
  // permite borrarlo a NULL (reemplaza el comportamiento anterior, que sí lo permitía
  // y podía dejar cuotas ya sincronizadas con un TC viejo desalineado del plan).
  it("PP27: borrar a 0 una tasa YA real se ignora (no dispara onPlanChange)", () => {
    const onPlanChange = vi.fn();
    renderSection({
      currency: "USD",
      plan: { wo_id: "wo-1", exchange_rate: 6.96, payment_days: 30 },
      onPlanChange,
    });

    fireEvent.change(screen.getByTestId("payment-plan-exchange-rate"), {
      target: { value: "0" },
    });

    expect(onPlanChange).not.toHaveBeenCalled();
  });

  // review iteración 18 #2: antes de este fix, PP27 de arriba dejaba el input
  // re-mostrando de inmediato el valor viejo (6.96) apenas se borraba -- la
  // siguiente tecla se insertaba sobre ese valor en vez de reemplazarlo.
  it("PP28: borrar una tasa YA real deja el campo vacío en pantalla (no reaparece el valor viejo)", () => {
    renderSection({
      currency: "USD",
      plan: { wo_id: "wo-1", exchange_rate: 6.96, payment_days: 30 },
    });
    const input = screen.getByTestId("payment-plan-exchange-rate") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "0" } });

    expect(input.value).toBe("");
  });

  it("PP29: escribir un valor nuevo justo después de borrar no se mezcla con el valor viejo", () => {
    const onPlanChange = vi.fn();
    renderSection({
      currency: "USD",
      plan: { wo_id: "wo-1", exchange_rate: 6.96, payment_days: 30 },
      onPlanChange,
    });
    const input = screen.getByTestId("payment-plan-exchange-rate");

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(input, { target: { value: "7.02" } });

    expect(onPlanChange).toHaveBeenCalledWith(
      expect.objectContaining({ exchange_rate: 7.02 }),
    );
  });

  it("PP30: salir del campo sin terminar de escribir restaura el valor real en pantalla", () => {
    renderSection({
      currency: "USD",
      plan: { wo_id: "wo-1", exchange_rate: 6.96, payment_days: 30 },
    });
    const input = screen.getByTestId("payment-plan-exchange-rate") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("");

    fireEvent.blur(input);

    expect(input.value).toBe("6.96");
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

  // review iteración 18 #3: antes de este fix, el TOTAL del footer recalculaba
  // TODAS las cuotas con el feeWithTax actual (1000), incluida la ya facturada
  // (50% × 1000 = 500) -- ignorando que su fila visible ya mostraba el monto
  // congelado (380, de un fee distinto). El footer daba 500+500=1000, distinto de
  // lo que se veía en las 2 filas (380+500=880).
  it("PP31: TOTAL del footer respeta el monto congelado de una cuota ya facturada, no lo recalcula con el fee actual", () => {
    const installments = [
      makeInstallment({ installment_number: 1, percentage: 50, status: "Invoiced", amount: 380 }),
      makeInstallment({ installment_number: 2, percentage: 50, status: "Pending", amount: null }),
    ];
    const container = renderSection({ feeWithTax: 1000, installments });
    const tfoot = container.querySelector("tfoot");
    expect(tfoot?.textContent?.replace(/\s/g, "")).toContain("880");
    expect(tfoot?.textContent?.replace(/\s/g, "")).not.toContain("1.000");
    expect(tfoot?.textContent?.replace(/\s/g, "")).not.toContain("1000");
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

  // Cobranzas Fase 1 (issue #352 / 0923-206) — este caso cambió de significado a propósito.
  // Antes, una cuota todavía SIN FACTURAR con su fecha de facturación pasada se mostraba como
  // "Mora", mezclando dos cosas distintas: que nosotros no facturamos a tiempo y que el
  // cliente no pagó. Ahora conserva su etapa ("Pendiente") y la condición de calendario va en
  // una insignia aparte, "Facturación atrasada". La mora queda reservada a una cuota ya
  // facturada que pasó su vencimiento (decisión del operador Q4).
  it("PP17: una cuota sin facturar con la fecha pasada muestra 'facturación atrasada', no mora", () => {
    const yesterday = dayOffset(-1);
    const installments = [makeInstallment({ status: "Pending", agreed_invoice_date: yesterday })];
    renderSection({ installments, isStatusEditable: false });
    expect(screen.getByText("workOrders.paymentPlan.statusPending")).toBeInTheDocument();
    expect(screen.getByText("workOrders.paymentPlan.statusBillingLate")).toBeInTheDocument();
    expect(screen.queryByText("workOrders.paymentPlan.statusOverdue")).not.toBeInTheDocument();
  });

  it("PP17b: una cuota FACTURADA que pasó su vencimiento real sí muestra mora", () => {
    const installments = [
      makeInstallment({
        status: "Invoiced",
        agreed_invoice_date: dayOffset(-40),
        collection_invoice_date: dayOffset(-40),
        collection_payment_date: dayOffset(-1),
      }),
    ];
    renderSection({ installments, isStatusEditable: false });
    expect(screen.getByText("workOrders.paymentPlan.statusOverdue")).toBeInTheDocument();
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

  // Reportado 2026-09-09 como bug ("sigue editable en Completado") y luego revertido
  // el mismo dia tras confirmar que es intencional: preexistente a 0722-156b (commit
  // 0253f93e, 2026-06-29), un mecanismo de CORRECCION admin/collections_analyst
  // (dialogo + useUpdateCollectionDate) que la base de datos nunca bloquea por status
  // -- a proposito, para poder corregir la fecha real de facturacion de Contabilidad
  // aunque la cuota ya haya avanzado o se haya completado. Decision confirmada por el
  // operador de mantener el comportamiento original (PP22 ya cubria el caso Pending).
  it("PP23b: collection_invoice_date stays editable for a Completed cuota (intentional correction path, not frozen by status)", () => {
    const installments = [makeInstallment({ status: "Completed", collection_invoice_date: "2026-08-01" })];
    const container = renderSection({ installments, isStatusEditable: true });
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(2);
  });

  it("PP23c: collection_invoice_date stays editable for an Invoiced (already-billed) cuota too", () => {
    const installments = [makeInstallment({ status: "Invoiced", collection_invoice_date: "2026-08-01" })];
    const container = renderSection({ installments, isStatusEditable: true });
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(2);
  });
});


// ── Cobranzas Fase 3 (issue #352): confirmación con el cliente y reprogramación ───────────
// Las dos acciones son del GERENTE del encargo (decisiones del operador Q11 y Q42), que en
// esta sección es justo el predicado `canEditPaymentPlan`.

describe("WorkOrderPaymentPlanSection — confirmación y reprogramación (Fase 3)", () => {
  beforeEach(() => {
    mockReschedule.mockClear();
    mockRecordConfirmation.mockClear();
  });

  // El check sólo tiene sentido cuando la fecha está encima: preguntarle al cliente con un
  // mes de anticipación no sirve, y llenar la fila de botones tampoco.
  it("PPF3-1: el check de confirmación aparece cuando faltan ≤7 días, no antes", () => {
    renderSection({
      installments: [makeInstallment({ status: "Pending", agreed_invoice_date: dayOffset(3) })],
      plan: { wo_id: "wo-1", exchange_rate: null, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    expect(screen.getByText("workOrders.paymentPlan.confirmCheckLabel")).toBeInTheDocument();
  });

  it("PPF3-2: con la fecha lejana no se ofrece el check, pero sí reprogramar", () => {
    renderSection({
      installments: [makeInstallment({ status: "Pending", agreed_invoice_date: dayOffset(40) })],
      plan: { wo_id: "wo-1", exchange_rate: null, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    expect(screen.queryByText("workOrders.paymentPlan.confirmCheckLabel")).not.toBeInTheDocument();
    expect(screen.getByText("workOrders.paymentPlan.rescheduleAction")).toBeInTheDocument();
  });

  it("PPF3-3: quien no puede editar el plan no ve ninguna de las dos acciones", () => {
    renderSection({
      canEditPaymentPlan: false,
      installments: [makeInstallment({ status: "Pending", agreed_invoice_date: dayOffset(3) })],
      plan: { wo_id: "wo-1", exchange_rate: null, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    expect(screen.queryByText("workOrders.paymentPlan.confirmCheckLabel")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.paymentPlan.rescheduleAction")).not.toBeInTheDocument();
  });

  it("PPF3-4: confirmar manda la fecha vigente como control de concurrencia", () => {
    renderSection({
      installments: [makeInstallment({ status: "Pending", agreed_invoice_date: dayOffset(3) })],
      plan: { wo_id: "wo-1", exchange_rate: null, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmYes"));
    expect(mockRecordConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed: true, expectedInvoiceDate: dayOffset(3) }),
    );
  });

  // El botón arranca deshabilitado: sin motivo y sin fecha nueva, la cuota quedaría marcada
  // como problemática sin decir qué pasa ni para cuándo. El servidor los exige igual.
  it("PPF3-5: reprogramar exige fecha y motivo, y recién ahí habilita el botón", () => {
    renderSection({
      installments: [makeInstallment({ status: "Pending", agreed_invoice_date: dayOffset(40) })],
      plan: { wo_id: "wo-1", exchange_rate: null, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    fireEvent.click(screen.getByText("workOrders.paymentPlan.rescheduleAction"));

    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByText("workOrders.paymentPlan.rescheduleAction").closest("button")!;
    expect(submit).toBeDisabled();

    // Se teclea de verdad sobre el valor del input, con el estado real del componente detrás.
    const dateInput = document.getElementById("reschedule-date") as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: dayOffset(70) } });
    expect(submit).toBeDisabled(); // falta el motivo

    const reason = document.getElementById("reschedule-reason") as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: "el cliente pidió correrlo" } });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    expect(mockReschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        newInvoiceDate: dayOffset(70),
        reason: "el cliente pidió correrlo",
        expectedInvoiceDate: dayOffset(40),
      }),
    );
  });

  it("PPF3-6: 'no confirma' usa el mismo formulario y registra que el cliente dijo que no", () => {
    renderSection({
      installments: [makeInstallment({ status: "Pending", agreed_invoice_date: dayOffset(2) })],
      plan: { wo_id: "wo-1", exchange_rate: null, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmNo"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("workOrders.paymentPlan.notConfirmedTitle")).toBeInTheDocument();

    fireEvent.change(document.getElementById("reschedule-date") as HTMLInputElement, {
      target: { value: dayOffset(35) },
    });
    fireEvent.change(document.getElementById("reschedule-reason") as HTMLTextAreaElement, {
      target: { value: "sin liquidez este mes" },
    });
    fireEvent.click(within(dialog).getByText("workOrders.paymentPlan.rescheduleAction").closest("button")!);

    expect(mockRecordConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmed: false,
        note: "sin liquidez este mes",
        newInvoiceDate: dayOffset(35),
      }),
    );
    // No pasa por la RPC de reprogramar: la reprogramación la hace la misma RPC de
    // confirmación, en una sola transacción (decisión Q11).
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  // La fecha ACORDADA es el contrato y no se toca; lo que se mueve es la vigente. Mostrar las
  // dos es lo que permite distinguir una reprogramación de una cuota vencida (issue #352).
  it("PPF3-7: una cuota reprogramada muestra su fecha vigente además de la acordada", () => {
    renderSection({
      installments: [
        makeInstallment({
          status: "Pending",
          agreed_invoice_date: dayOffset(-10),
          current_invoice_date: dayOffset(20),
        }),
      ],
      plan: { wo_id: "wo-1", exchange_rate: null, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    expect(screen.getByText("workOrders.paymentPlan.currentInvoiceDateLabel")).toBeInTheDocument();
    // Y ya no está atrasada: la fecha que manda es la vigente.
    expect(screen.queryByText("workOrders.paymentPlan.statusBillingLate")).not.toBeInTheDocument();
  });

  it("PPF3-8: una cuota ya facturada no ofrece reprogramar", () => {
    renderSection({
      installments: [
        makeInstallment({
          status: "Invoiced",
          agreed_invoice_date: dayOffset(-10),
          collection_invoice_date: dayOffset(-10),
          collection_payment_date: dayOffset(20),
        }),
      ],
      plan: { wo_id: "wo-1", exchange_rate: null, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    expect(screen.queryByText("workOrders.paymentPlan.rescheduleAction")).not.toBeInTheDocument();
  });
});


// ── Cobranzas Fase 4 (issue #352): notas entre el encargo y Contabilidad ─────────────────
// Lo que el requisito llamaba "excepción para revisar gerente y socio" resultó ser esto
// (decisión Q6): notas que Contabilidad lee al facturar, y a las que responde. Se MUESTRAN,
// no se marcan como leídas (Q34).

function makeNote(over: Record<string, unknown> = {}) {
  return {
    note_id: "n1",
    wo_id: "wo-1",
    installment_id: null,
    author_staff_id: "staff-1",
    author_role: "manager",
    body: "el cliente pidió factura separada",
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-01T12:00:00Z",
    author: { first_name: "Ana", last_name: "Pérez" },
    ...over,
  };
}

describe("WorkOrderPaymentPlanSection — notas (Fase 4)", () => {
  beforeEach(() => {
    mockNotes = [];
    mockAddNote.mockClear();
  });

  it("PPF4-1: las notas del plan se muestran arriba, siempre visibles", () => {
    mockNotes = [makeNote({ body: "este cliente paga siempre a 60 días" })];
    renderSection({ canWriteNotes: true, installments: [makeInstallment()] });
    expect(screen.getByText("workOrders.paymentPlan.notesPlanTitle")).toBeInTheDocument();
    expect(screen.getByText("este cliente paga siempre a 60 días")).toBeInTheDocument();
  });

  it("PPF4-2: quien no participa del hilo no ve el bloque de notas ni puede escribir", () => {
    mockNotes = [];
    renderSection({ canWriteNotes: false, installments: [makeInstallment()] });
    expect(screen.queryByText("workOrders.paymentPlan.notesPlanTitle")).not.toBeInTheDocument();
  });

  it("PPF4-3: el contador de la fila cuenta sólo las notas de esa cuota", () => {
    const inst = makeInstallment();
    mockNotes = [
      makeNote({ note_id: "n1", installment_id: inst.installment_id }),
      makeNote({ note_id: "n2", installment_id: inst.installment_id }),
      makeNote({ note_id: "n3", installment_id: null }), // la del plan no cuenta acá
    ];
    renderSection({ canWriteNotes: true, installments: [inst] });
    expect(screen.getByText("workOrders.paymentPlan.notesCount")).toBeInTheDocument();
  });

  it("PPF4-4: escribir una nota manda la cuota correcta y el texto", () => {
    const inst = makeInstallment();
    mockNotes = [];
    renderSection({ canWriteNotes: true, installments: [inst] });

    // Se acota al bloque del PLAN: el contador de la fila también ofrece agregar, y sin
    // acotar la consulta encuentra los dos.
    const planBlock = within(screen.getByTestId("plan-notes"));
    const box = planBlock.getByLabelText("workOrders.paymentPlan.notesAdd") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "ojo con este cliente" } });
    fireEvent.click(planBlock.getByText("workOrders.paymentPlan.notesAdd").closest("button")!);

    expect(mockAddNote).toHaveBeenCalledWith(
      expect.objectContaining({ installmentId: null, body: "ojo con este cliente" }),
    );
  });

  it("PPF4-5: sólo el autor ve editar y borrar; la otra parte del hilo no", () => {
    mockNotes = [makeNote({ author_staff_id: "staff-OTRO" })];
    renderSection({ canWriteNotes: true, currentStaffId: "staff-1", installments: [makeInstallment()] });
    expect(screen.queryByLabelText("workOrders.paymentPlan.notesEdit")).not.toBeInTheDocument();

    mockNotes = [makeNote({ author_staff_id: "staff-1" })];
    renderSection({ canWriteNotes: true, currentStaffId: "staff-1", installments: [makeInstallment()] });
    expect(screen.getAllByLabelText("workOrders.paymentPlan.notesEdit").length).toBeGreaterThan(0);
  });

  it("PPF4-6: una nota editada se marca como tal", () => {
    mockNotes = [makeNote({ updated_at: "2026-10-05T12:00:00Z" })];
    renderSection({ canWriteNotes: true, installments: [makeInstallment()] });
    // El componente la muestra entre paréntesis, así que el texto no queda exacto.
    expect(screen.getByText(/notesEdited/)).toBeInTheDocument();
  });
});

// ── Cobranzas Fase 6 (issue #352): cuotas en monedas distintas ───────────────────────────
// "Tipo de cambio MIX" resultó ser esto (decisión Q29): un plan puede tener una cuota en Bs y
// otra en USD. Sin pagos partidos: una cuota tiene UNA moneda.

describe("WorkOrderPaymentPlanSection — moneda por cuota (Fase 6)", () => {
  it("PPF6-1: una cuota en otra moneda que la OT muestra su moneda junto al monto", () => {
    renderSection({
      currency: "BOB",
      installments: [makeInstallment({ percentage: 100, currency: "USD" })],
      plan: { wo_id: "wo-1", exchange_rate: 6.96, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    expect(screen.getAllByText("USD").length).toBeGreaterThan(0);
  });

  it("PPF6-2: si todas las cuotas van en la moneda de la OT, el total sigue siendo uno solo", () => {
    renderSection({
      currency: "BOB",
      installments: [
        makeInstallment({ installment_number: 1, percentage: 50 }),
        makeInstallment({ installment_number: 2, percentage: 50 }),
      ],
      plan: { wo_id: "wo-1", exchange_rate: 6.96, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    expect(screen.queryByTestId("totals-by-currency")).not.toBeInTheDocument();
  });

  // Un total que suma Bs con USD no significa nada: se muestran subtotales por moneda.
  it("PPF6-3: con dos monedas en el plan, el total se parte por moneda", () => {
    renderSection({
      currency: "BOB",
      installments: [
        makeInstallment({ installment_number: 1, percentage: 50 }),
        makeInstallment({ installment_number: 2, percentage: 50, currency: "USD" }),
      ],
      plan: { wo_id: "wo-1", exchange_rate: 6.96, payment_days: 30, exchange_rate_mode: "fijo" },
    });
    const totals = screen.getByTestId("totals-by-currency");
    expect(within(totals).getByText("BOB")).toBeInTheDocument();
    expect(within(totals).getByText("USD")).toBeInTheDocument();
  });
});


describe("WorkOrderPaymentPlanSection — el TC al COBRAR se confirma en el diálogo (2026-10-21)", () => {
  // Antes, el TC de pago era una columna suelta que había que acordarse de editar ANTES de
  // cambiar el estado. Si se olvidaba, la cuota se cobraba con el valor viejo y quedaba
  // congelada —isPaymentRateCaptureEditable sólo lo deja tocar mientras sigue Facturada o En
  // mora—, y la diferencia de cambio de la Fase 9 salía calculada sobre ese número. Ahora se
  // confirma en el mismo diálogo que la fecha de pago, igual que al facturar.

  const facturada = () =>
    makeInstallment({
      status: "Invoiced" as PaymentInstallmentStatus,
      amount: 1000,
      collection_invoice_date: "2026-10-01",
      collection_payment_date: "2026-11-15",
      invoice_exchange_rate: 6.96,
      payment_exchange_rate: 6.96,
    });

  const cobrar = (container: HTMLElement) => {
    const selects = Array.from(container.querySelectorAll("select"));
    const estado = selects.find((el) =>
      Array.from(el.options).some((o) => o.value === "Completed"),
    );
    if (!estado) throw new Error("no se encontró el selector de estado");
    fireEvent.change(estado, { target: { value: "Completed" } });
  };

  it("PTC1: el diálogo de cobro ofrece el TC, igual que el de facturación", () => {
    const container = renderSection({
      currency: "USD" as const,
      isStatusEditable: true,
      installments: [facturada()],
    });
    cobrar(container);
    expect(screen.getByTestId("invoice-rate-input")).toBeInTheDocument();
  });

  it("PTC2: confirmar manda el TC tecleado, no el que traía la cuota", () => {
    mockUpdateStatus.mockClear();
    const container = renderSection({
      currency: "USD" as const,
      isStatusEditable: true,
      installments: [facturada()],
    });
    cobrar(container);

    fireEvent.change(screen.getByTestId("invoice-rate-input"), { target: { value: "7.25" } });
    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmCompletedAction"));

    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
    const args = mockUpdateStatus.mock.calls[0][0];
    expect(args.newStatus).toBe("Completed");
    expect(args.paymentExchangeRate).toBe(7.25);
  });

  it("PTC4: una cuota en Bs dentro de una OT en USD NO recibe el TC del diálogo", () => {
    // Hallazgo de la revisión previa al PR (2026-10-22): el diálogo prellenaba un TC y se le
    // escribía igual a la cuota en bolivianos — sin sentido, y en modo fijo hacía rebotar el
    // cobro con EXCHANGE_RATE_LOCKED. Ahora el TC sólo viaja si la cuota NO va en Bs.
    mockUpdateStatus.mockClear();
    const container = renderSection({
      currency: "USD" as const,
      isStatusEditable: true,
      plan: { plan_id: "plan-1", wo_id: "wo-1", exchange_rate: 6.96, payment_days: 30, exchange_rate_mode: "fijo" },
      installments: [{ ...facturada(), currency: "BOB", payment_exchange_rate: null }],
    });
    cobrar(container);
    fireEvent.click(screen.getByText("workOrders.paymentPlan.confirmCompletedAction"));

    const args = mockUpdateStatus.mock.calls[0][0];
    expect(args.paymentExchangeRate).toBeNull();
  });

  it("PTC3: una cuota en Bs no muestra el campo — no hay nada que convertir", () => {
    const container = renderSection({
      currency: "BOB" as const,
      isStatusEditable: true,
      installments: [facturada()],
    });
    cobrar(container);
    expect(screen.queryByTestId("invoice-rate-input")).not.toBeInTheDocument();
  });
});


describe("WorkOrderPaymentPlanSection — la bitácora de la cuota (2026-10-21)", () => {
  // `wo_installment_events` se escribe sola desde la Fase 1 y nadie la puede editar, pero no
  // se veía en ninguna pantalla: el rastro existía sólo en la base. Sin esto, cambiar un hecho
  // ya registrado —desconfirmar, reprogramar, corregir una fecha de cobro— no dejaba nada
  // visible, y es justamente lo que vuelve defendible ese cambio.

  const inst = () => makeInstallment({ installment_id: "i-h", status: "Invoiced" as PaymentInstallmentStatus });

  const evento = (over: Record<string, unknown>) => ({
    event_id: `ev-${Math.random()}`,
    seq: 1,
    installment_id: "i-h",
    wo_id: "wo-1",
    action: "status_change",
    from_status: null,
    to_status: null,
    old_date: null,
    new_date: null,
    amount: null,
    currency: null,
    reason: null,
    actor_staff_id: "s-1",
    created_at: "2026-10-21T15:00:00Z",
    actor: { first_name: "Ana", last_name: "Gerente" },
    ...over,
  });

  afterEach(() => {
    mockEvents = [];
  });

  it("sin eventos no hay botón: una cuota recién creada no tiene historial que mostrar", () => {
    renderSection({ installments: [inst()] });
    expect(screen.queryByText(/workOrders.paymentPlan.historyCount/)).not.toBeInTheDocument();
  });

  it("con eventos aparece el contador", () => {
    mockEvents = [evento({ from_status: "Pending", to_status: "Invoiced" })];
    renderSection({ installments: [inst()] });
    expect(screen.getByText(/workOrders.paymentPlan.historyCount/)).toBeInTheDocument();
  });

  it("cuenta sólo los eventos de ESA cuota", () => {
    mockEvents = [
      evento({ from_status: "Pending", to_status: "Invoiced" }),
      evento({ installment_id: "otra-cuota" }),
    ];
    const container = renderSection({ installments: [inst()] });
    const boton = container.querySelector("button:not([aria-label])");
    expect(screen.getByText("workOrders.paymentPlan.historyCount")).toBeInTheDocument();
    expect(boton).toBeTruthy();
  });

  it("distingue una confirmación de un rechazo por la fecha que lleva cada una", () => {
    // La confirmación guarda la fecha confirmada en new_date; el rechazo, la fecha rechazada
    // en old_date. Si se leyeran igual, "confirmó para el X" y "no confirmó el X" serían
    // indistinguibles en la bitácora, que es el unico lugar donde queda el rastro.
    mockEvents = [
      // Sin nota la confirmación no lleva motivo: el texto lo pone la traducción de la acción.
      evento({ action: "confirmation", new_date: "2026-11-20", reason: null }),
      evento({ action: "confirmation", old_date: "2026-11-20", reason: "pidió más plazo" }),
    ];
    renderSection({ installments: [inst()] });
    fireEvent.click(screen.getByText("workOrders.paymentPlan.historyCount"));
    expect(screen.getByText("workOrders.paymentPlan.historyConfirmed")).toBeInTheDocument();
    expect(screen.getByText("workOrders.paymentPlan.historyNotConfirmed")).toBeInTheDocument();
    // El motivo viaja con el evento: sin él, un rechazo no se puede explicar después.
    expect(screen.getByText("pidió más plazo")).toBeInTheDocument();
  });

  it("muestra el más reciente primero", () => {
    mockEvents = [
      evento({ seq: 1, action: "rescheduled", old_date: "2026-11-01", new_date: "2026-11-20" }),
      evento({ seq: 2, action: "confirmation", new_date: "2026-11-20" }),
    ];
    renderSection({ installments: [inst()] });
    fireEvent.click(screen.getByText("workOrders.paymentPlan.historyCount"));
    const lineas = screen.getAllByText(/workOrders.paymentPlan.history(Confirmed|Rescheduled)/);
    expect(lineas[0].textContent).toBe("workOrders.paymentPlan.historyConfirmed");
  });

  it("un evento sin autor dice Sistema en vez de dejar el hueco", () => {
    mockEvents = [evento({ actor: null, actor_staff_id: null })];
    renderSection({ installments: [inst()] });
    fireEvent.click(screen.getByText("workOrders.paymentPlan.historyCount"));
    expect(screen.getByText("workOrders.paymentPlan.historyUnknownActor")).toBeInTheDocument();
  });
});


describe("WorkOrderPaymentPlanSection — el formulario de ajustes arranca en blanco (2026-10-21)", () => {
  // Reportado probando: se cargaba un ajuste en una cuota, se cerraba con "Cerrar" y al abrir
  // el de OTRA cuota seguían los valores anteriores. El formulario se limpiaba sólo en
  // `onOpenChange`, que Radix dispara al cerrar por ESC/overlay/X — pero el botón "Cerrar"
  // pone el estado en null por su cuenta, así que ese camino nunca limpiaba. Ahora se limpia
  // al ABRIR, que es el único momento que garantiza empezar en blanco.

  const dos = () => [
    makeInstallment({ installment_id: "i-1", installment_number: 1, percentage: 50, amount: 1000, status: "Invoiced" as PaymentInstallmentStatus }),
    makeInstallment({ installment_id: "i-2", installment_number: 2, percentage: 50, amount: 1000, status: "Invoiced" as PaymentInstallmentStatus }),
  ];

  const abrirAjustes = (container: HTMLElement, fila: number) => {
    const botones = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("workOrders.paymentPlan.adjustmentsAdd"),
    );
    fireEvent.click(botones[fila]);
  };

  it("un motivo tecleado en una cuota no aparece en el de la siguiente", () => {
    const container = renderSection({ installments: dos(), canBillExpenses: true });

    abrirAjustes(container, 0);
    const motivo = screen.getByPlaceholderText("workOrders.paymentPlan.adjustmentReasonPlaceholder");
    fireEvent.change(motivo, { target: { value: "rebaja de la cuota 1" } });

    // Se cierra por el BOTÓN, que es el camino que no limpiaba.
    fireEvent.click(screen.getByText("common.close"));

    abrirAjustes(container, 1);
    expect(
      (screen.getByPlaceholderText("workOrders.paymentPlan.adjustmentReasonPlaceholder") as HTMLTextAreaElement).value,
    ).toBe("");
  });

  it("el botón de registrar arranca deshabilitado: sin motivo no se puede guardar", () => {
    const container = renderSection({ installments: dos(), canBillExpenses: true });
    abrirAjustes(container, 0);
    expect(screen.getByText("workOrders.paymentPlan.adjustmentAdd").closest("button")).toBeDisabled();
  });
});

describe("WorkOrderPaymentPlanSection — ajustes de una cuota cobrada (revisión de Codex, 2026-10-22)", () => {
  afterEach(() => {
    mockAdjustments = [];
    mockEvents = [];
  });

  const descuento = (installmentId: string) => ({
    adjustment_id: `adj-${installmentId}`,
    installment_id: installmentId,
    wo_id: "wo-1",
    adjustment_type: "descuento",
    amount: -100,
    currency: "BOB",
    reason: "pronto pago",
    created_by_staff_id: null,
    created_at: "2026-10-01T00:00:00Z",
    deleted_at: null,
  });

  const abrir = (container: HTMLElement, fila: number) => {
    const botones = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("workOrders.paymentPlan.adjustmentsCount"),
    );
    fireEvent.click(botones[fila]);
  };

  it("con la cuota cobrada su descuento ya no ofrece 'Retirar'; sin cobrar, sí", () => {
    // El servidor lo rechaza igual (ADJUSTMENT_LOCKED): retirarlo subiría lo cobrado de una
    // cuota cerrada. La pantalla no ofrece un botón que siempre va a fallar.
    mockAdjustments = [descuento("i-1"), descuento("i-2")];
    const container = renderSection({
      canBillExpenses: true,
      installments: [
        makeInstallment({ installment_id: "i-1", installment_number: 1, percentage: 50, amount: 1000, status: "Completed" as PaymentInstallmentStatus }),
        makeInstallment({ installment_id: "i-2", installment_number: 2, percentage: 50, amount: 1000, status: "Invoiced" as PaymentInstallmentStatus }),
      ],
    });

    abrir(container, 0);
    expect(screen.queryByText("workOrders.paymentPlan.adjustmentRemove")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("common.close"));

    abrir(container, 1);
    expect(screen.getByText("workOrders.paymentPlan.adjustmentRemove")).toBeInTheDocument();
  });

  it("la bitácora muestra el retiro de un ajuste como tal", () => {
    mockEvents = [
      {
        event_id: "ev-r", seq: 2, installment_id: "i-1", wo_id: "wo-1", action: "adjustment_removed",
        from_status: null, to_status: null, old_date: null, new_date: null,
        amount: -100, currency: "BOB", reason: "pronto pago", actor_staff_id: null,
        created_at: "2026-10-02T00:00:00Z",
      },
    ];
    renderSection({ installments: [makeInstallment({ installment_id: "i-1", installment_number: 1, percentage: 100, amount: 1000 })] });
    fireEvent.click(screen.getByText("workOrders.paymentPlan.historyCount"));
    expect(screen.getByText("workOrders.paymentPlan.historyAdjustmentRemoved")).toBeInTheDocument();
  });
});

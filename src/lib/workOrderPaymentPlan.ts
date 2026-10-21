import { getBoliviaNationalHolidays } from './boliviaHolidays';
import type { ExchangeRateMode, InstallmentCalendarState, PaymentInstallmentInput, PaymentInstallmentStatus, PaymentPlanInput } from '@/types/workOrderPaymentPlan';

// Returns a new Date that is `days` business days after `start`.
// Skips weekends and Bolivia national holidays.
export function addBusinessDays(start: Date, days: number): Date {
  if (days <= 0) return new Date(start);

  // Pre-fetch holidays for the years we might span. This is a global
  // business-day calendar with no staff/office context, so only oficina=0
  // (national) holidays apply here -- La Paz/Santa Cruz departmental
  // holidays (oficina=1|2) must not skip payment dates for every office.
  const startYear = start.getFullYear();
  const holidays = new Set<string>([
    ...getBoliviaNationalHolidays(startYear).filter((h) => h.oficina === 0).map((h) => h.date),
    ...getBoliviaNationalHolidays(startYear + 1).filter((h) => h.oficina === 0).map((h) => h.date),
  ]);

  const isHolidayOrWeekend = (d: Date): boolean => {
    const day = d.getUTCDay();
    if (day === 0 || day === 6) return true;
    const ymd = d.toISOString().slice(0, 10);
    return holidays.has(ymd);
  };

  let current = new Date(start);
  let counted = 0;
  while (counted < days) {
    current = new Date(current.getTime() + 86400000);
    if (!isHolidayOrWeekend(current)) counted++;
  }
  return current;
}

// Returns an array of `count` percentages that sum exactly to `total` (default 100.00,
// 2 decimal places). The last row absorbs the rounding remainder. `total` lets callers
// redistribute only the REMAINING percentage when some rows are excluded (0722-156b
// review iteracion 2 #3: cuotas ya facturadas no participan de la redistribucion).
export function distributePercentages(count: number, total: number = 100): number[] {
  if (count <= 0) return [];
  const base = Math.floor((total / count) * 100) / 100;
  const result = Array(count).fill(base);
  const remainder = parseFloat((total - base * count).toFixed(2));
  result[count - 1] = parseFloat((base + remainder).toFixed(2));
  return result;
}

// Computes the installment amount from percentage and the total fee (honorario c/IVA).
export function computeAmount(percentage: number, feeWithTax: number): number {
  return parseFloat(((percentage / 100) * feeWithTax).toFixed(2));
}

/**
 * Cobranzas Fase 6 (decisión Q29, UI resuelta el 2026-10-20): el monto de una cuota EN SU
 * MONEDA.
 *
 * El honorario está en la moneda de la OT, así que `porcentaje × honorario` da un número en
 * esa moneda. Cuando la cuota se cobra en otra, el cliente paga **el mismo valor convertido**,
 * no un monto distinto: por eso se aplica el tipo de cambio del plan y el porcentaje sigue
 * significando lo que dice. Sin esto, pasar una cuota a bolivianos dejaba el número de dólares
 * con una etiqueta de bolivianos al lado.
 *
 * Solo se convierte entre la moneda de la OT y Bs, que es el único caso que la pantalla ofrece.
 * Sin tipo de cambio no hay conversión posible, así que devuelve el monto sin tocar.
 */
export function computeAmountInCurrency(
  percentage: number,
  feeWithTax: number,
  rowCurrency: string,
  woCurrency: string,
  planRate: number | null | undefined,
): number {
  const base = computeAmount(percentage, feeWithTax);
  if (rowCurrency === woCurrency) return base;
  if (!planRate || planRate <= 0) return base;
  // El TC del plan son bolivianos por unidad de la moneda de la OT.
  const converted = rowCurrency === "BOB" ? base * planRate : base / planRate;
  return parseFloat(converted.toFixed(2));
}

// Computes the payment date from an invoice date string (YYYY-MM-DD) and business days.
// Returns null if invoiceDate is null.
export function computePaymentDate(invoiceDate: string | null, paymentDays: number): string | null {
  if (!invoiceDate) return null;
  const start = new Date(`${invoiceDate}T00:00:00Z`);
  const result = addBusinessDays(start, paymentDays);
  return result.toISOString().slice(0, 10);
}

// Today's date (YYYY-MM-DD) in Bolivia. The DB equivalent is public.fund_today().
export function todayInLaPaz(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
}

// Whole days between two YYYY-MM-DD dates (b - a). Parsed at midnight UTC so the result is
// a pure date difference, never shifted by the viewer's timezone or by DST.
function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
}

// Cobranzas Fase 1 (issue #352 / 0923-206) — REGLA UNICA de la condición de calendario.
// Espejo exacto de public.installment_calendar_state(...) en la base, con los mismos casos
// de prueba; si una cambia, la otra también.
//
// Reemplaza a los CINCO criterios de mora que convivían antes, ninguno de los cuales miraba
// la fecha de vencimiento real: getEffectiveInstallmentStatus (pantalla),
// isPaymentDueSoonOrOverdue (indicador de la pestaña), detectOverdue (muerta), el contador
// de avisos y los dashboards. Decisión del operador (Q4): la mora se cuenta desde la fecha
// de facturación REAL más los días hábiles pactados. Antes de facturar NO hay mora, como
// mucho "facturación atrasada".
export function installmentCalendarState(
  status: PaymentInstallmentStatus,
  invoiceDate: string | null,
  paymentDueDate: string | null,
  today: string,
  windowDays = 7,
): InstallmentCalendarState {
  if (status === 'Completed') return 'closed';
  // La mora MANUAL (Invoiced -> Overdue, que el operador decidió mantener en Q3) es mora
  // aunque su vencimiento no haya pasado.
  if (status === 'Overdue') return 'overdue';

  if (status === 'Invoiced') {
    if (!paymentDueDate) return 'on_track';
    if (today > paymentDueDate) return 'overdue';
    return daysBetween(today, paymentDueDate) <= windowDays ? 'payment_due_soon' : 'on_track';
  }

  // Pending: su fecha relevante es la de FACTURACIÓN, no la de pago.
  if (!invoiceDate) return 'on_track';
  if (today > invoiceDate) return 'billing_late';
  return daysBetween(today, invoiceDate) <= windowDays ? 'billing_due_soon' : 'on_track';
}

// Fecha de facturación vigente: la reprogramada si la hubo, si no la del contrato.
export function currentInvoiceDate(installment: PaymentInstallmentInput): string | null {
  return installment.current_invoice_date ?? installment.agreed_invoice_date;
}

// Vencimiento vigente: la fecha de facturación REAL + los días hábiles del plan. El fallback
// a la pactada es defensivo — una cuota facturada sin collection_payment_date es una anomalía
// (invoice_installment() siempre la exige) y dejarla sin fecha la volvería permanentemente
// "en plazo", escondiendo mora real.
export function currentDueDate(installment: PaymentInstallmentInput): string | null {
  return installment.collection_payment_date ?? installment.agreed_payment_date;
}

export function getInstallmentCalendarState(
  installment: PaymentInstallmentInput,
  today: string = todayInLaPaz(),
  windowDays = 7,
): InstallmentCalendarState {
  return installmentCalendarState(
    installment.status,
    currentInvoiceDate(installment),
    currentDueDate(installment),
    today,
    windowDays,
  );
}

// Lo que la fila necesita para pintarse: la etapa persistida, la condición de calendario y,
// cuando hay mora, de cuál de las dos se trata. La pantalla muestra UN SOLO chip "En mora"
// para los dos casos (decisión del operador Q2: priorizar la claridad) y aclara en el
// tooltip si fue marcada a mano o la decidió la fecha.
export function getInstallmentDisplay(
  installment: PaymentInstallmentInput,
  today: string = todayInLaPaz(),
  windowDays = 7,
): {
  stage: PaymentInstallmentStatus;
  calendar: InstallmentCalendarState;
  isOverdue: boolean;
  overdueKind: 'manual' | 'payment' | null;
} {
  const calendar = getInstallmentCalendarState(installment, today, windowDays);
  const isOverdue = calendar === 'overdue';
  return {
    stage: installment.status,
    calendar,
    isOverdue,
    overdueKind: isOverdue ? (installment.status === 'Overdue' ? 'manual' : 'payment') : null,
  };
}

// Banner "hay cuotas por facturar pronto" de la sección: una cuota todavía sin facturar cuya
// fecha de facturación VIGENTE cae dentro de la ventana. Antes miraba `agreed_invoice_date`,
// así que una cuota reprogramada seguía avisando en su fecha original.
export function isAlertDue(installment: PaymentInstallmentInput, windowDays = 7): boolean {
  return getInstallmentCalendarState(installment, todayInLaPaz(), windowDays) === 'billing_due_soon';
}

// Billing indicator (0817-176 §Indicadores, review iteración 2 #1/#2) for a
// fully-approved Work Order's Payment tab:
// - "unconfigured": no installments at all, or none of them ever got an agreed PAYMENT
//   date — the plan's completeness hint in Draft is a non-blocking suggestion (plan_v2.md
//   Open Question #2), so an OT can reach full approval with its payment plan never
//   filled in. Surfacing that as "on track" (green) would be misleading.
// - "complete": every installment is Collected (Completed) AND their percentages sum to
//   ~100% → rendered as the green check ✓ like the other tabs (collection closed 100%
//   of the fee, not just of the recorded rows).
// - "red" (☼): alguna cuota está en riesgo — en mora, por vencer, o con la facturación
//   atrasada. Cobranzas Fase 1 (Q4): la decide la regla única installmentCalendarState, no
//   una comparación propia contra `agreed_payment_date`. Dos cambios reales frente al
//   criterio anterior: una cuota todavía Pendiente con la fecha de PAGO pactada ya pasada
//   dejó de contar como riesgo de cobro (nunca se facturó: ahora cuenta como facturación
//   atrasada, que también pinta rojo), y una cuota facturada tarde se mide contra su
//   vencimiento real.
// - "green" (☼): otherwise — approved and in progress with no payment at risk.
export function computeBillingIndicator(
  installments: PaymentInstallmentInput[],
  today: string = todayInLaPaz(),
): 'red' | 'green' | 'complete' | 'unconfigured' {
  if (installments.length === 0) return 'unconfigured';
  if (installments.every((i) => i.status === 'Completed')) {
    const pctSum = installments.reduce((sum, i) => sum + i.percentage, 0);
    if (Math.abs(pctSum - 100) <= 0.01) return 'complete';
  } else if (!installments.some((i) => !!i.agreed_payment_date)) {
    return 'unconfigured';
  }
  const atRisk: InstallmentCalendarState[] = ['overdue', 'payment_due_soon', 'billing_late', 'billing_due_soon'];
  const hasPaymentAtRisk = installments.some((installment) =>
    atRisk.includes(getInstallmentCalendarState(installment, today, 7)),
  );
  return hasPaymentAtRisk ? 'red' : 'green';
}

// 0722-156b (Fase 2): freeze windows for the two per-installment exchange rate
// snapshots, based ONLY on the persisted `status` column — never on
// getEffectiveInstallmentStatus's screen-only Overdue. A persisted 'Overdue' can only
// be reached from 'Invoiced' (see STATUS_TRANSITIONS in WorkOrderPaymentPlanSection),
// so "status left Pending" and "was ever Invoiced" are equivalent here.
export function isInvoiceRateEditable(status: PaymentInstallmentStatus): boolean {
  return status === 'Pending';
}

// "Not yet frozen for writes" — the broad not-Completed window used by the modo Fijo
// resync (applyExchangeRateMode) and mirrored by the DB freeze trigger's unconditional
// payment_exchange_rate guard. Deliberately NOT the same as the modo Variable capture
// window below: Fijo's resync must still reach a Pending cuota (during Draft, every
// cuota IS Pending — see isPaymentRateCaptureEditable for why Pending is excluded there).
export function isPaymentRateEditable(status: PaymentInstallmentStatus): boolean {
  return status !== 'Completed';
}

// Modo Variable UI capture window — MUST FIX 0722-156b review iteracion 1 #1: a payment
// rate is an independent per-cuota capture only from the moment the cuota is actually
// invoiced onward (Decision #4: "editable durante todo el tramo posterior a la
// facturacion... hasta Completed"), never while still Pending (nothing has been billed
// yet). Distinct from isPaymentRateEditable, which stays broader on purpose for the
// modo Fijo resync above.
export function isPaymentRateCaptureEditable(status: PaymentInstallmentStatus): boolean {
  return status === 'Invoiced' || status === 'Overdue';
}

// Derived amount shown in Bs next to a cuota's invoice/payment cell — never persisted
// (plan_v2.md Proposed Fix §3): `amount` (original currency) × the applicable TC.
export function computeConvertedAmount(amount: number | null, rate: number | null): number | null {
  if (amount == null || rate == null) return null;
  return parseFloat((amount * rate).toFixed(2));
}

// MUST FIX 0722-156b review iteracion 3 #4: invoice_exchange_rate/payment_exchange_rate
// (modo Variable) se guardan directo en su propio onBlur (Amendment 2026-09-07), sin pasar
// por el flujo de "Guardar" de pagina -- son autonomos, no parte del "resto" del plan. Si
// el guard que bloquea ese guardado directo cuando "el resto del plan tiene cambios sin
// guardar" compara el array de cuotas completo, el propio cambio que el usuario esta
// tipeando ya se refleja ahi (via onInstallmentsChange) antes de que el blur dispare el
// guard, y el campo termina bloqueando su propio guardado. Comparar ignorando estos 2
// campos evita ese autobloqueo, sin dejar de detectar cambios reales pendientes en el
// resto de la fila (porcentaje, fechas via el batch, etc.).
function withoutSelfSavingRateFields(inst: PaymentInstallmentInput): Omit<PaymentInstallmentInput, 'invoice_exchange_rate' | 'payment_exchange_rate'> {
  const { invoice_exchange_rate, payment_exchange_rate, ...rest } = inst;
  return rest;
}

export function isPaymentPlanRestDirty(
  installments: PaymentInstallmentInput[],
  originalInstallments: PaymentInstallmentInput[],
  plan: PaymentPlanInput | null,
  originalPlan: PaymentPlanInput | null,
): boolean {
  return (
    JSON.stringify(installments.map(withoutSelfSavingRateFields)) !==
      JSON.stringify(originalInstallments.map(withoutSelfSavingRateFields)) ||
    JSON.stringify(plan) !== JSON.stringify(originalPlan)
  );
}

// Modo Fijo: el TC de creacion del plan se aplica tal cual a las 2 columnas de TC de
// TODAS las cuotas AUN EDITABLES (por estado persistido); una cuota ya congelada
// conserva su valor guardado sin cambios, para que el UPDATE sincronizado sea un no-op
// para el trigger de freeze (nunca reintenta reescribir un TC ya congelado con un valor
// distinto). Modo Variable: cada cuota mantiene su captura independiente, sin cambios.
export function applyExchangeRateMode(
  mode: ExchangeRateMode,
  planExchangeRate: number | null,
  installments: PaymentInstallmentInput[],
): PaymentInstallmentInput[] {
  if (mode !== 'fijo') return installments;
  return installments.map((inst) => ({
    ...inst,
    invoice_exchange_rate: isInvoiceRateEditable(inst.status) ? planExchangeRate : inst.invoice_exchange_rate,
    payment_exchange_rate: isPaymentRateEditable(inst.status) ? planExchangeRate : inst.payment_exchange_rate,
  }));
}

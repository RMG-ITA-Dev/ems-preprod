import { getBoliviaNationalHolidays } from './boliviaHolidays';
import type { ExchangeRateMode, PaymentInstallmentInput, PaymentInstallmentStatus, PaymentPlanInput } from '@/types/workOrderPaymentPlan';

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

// Computes the payment date from an invoice date string (YYYY-MM-DD) and business days.
// Returns null if invoiceDate is null.
export function computePaymentDate(invoiceDate: string | null, paymentDays: number): string | null {
  if (!invoiceDate) return null;
  const start = new Date(`${invoiceDate}T00:00:00Z`);
  const result = addBusinessDays(start, paymentDays);
  return result.toISOString().slice(0, 10);
}

// Returns true when the installment should be considered Overdue:
// status is Invoiced and agreed_payment_date has already passed.
export function detectOverdue(installment: PaymentInstallmentInput): boolean {
  if (installment.status !== 'Invoiced') return false;
  if (!installment.agreed_payment_date) return false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  return installment.agreed_payment_date < today;
}

// Returns true when the installment's agreed_invoice_date is within `windowDays` calendar days.
export function isAlertDue(installment: PaymentInstallmentInput, windowDays = 7): boolean {
  if (!installment.agreed_invoice_date) return false;
  if (installment.status !== 'Pending' && installment.status !== 'Invoiced') return false;
  // Normalize both to midnight local (Bolivia) to compare pure dates, not timestamps
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  const today = new Date(todayStr + "T00:00:00");
  const invoice = new Date(installment.agreed_invoice_date + "T00:00:00");
  const diffDays = (invoice.getTime() - today.getTime()) / 86400000;
  return diffDays >= 0 && diffDays <= windowDays;
}

// Effective display status: a still-Pending installment whose invoice date has already
// passed reads as Overdue, without needing a persisted status transition.
export function getEffectiveInstallmentStatus(
  installment: PaymentInstallmentInput,
): PaymentInstallmentStatus {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  if (installment.status === 'Pending' && installment.agreed_invoice_date && installment.agreed_invoice_date < today) {
    return 'Overdue';
  }
  return installment.status;
}

// Returns true when a not-yet-collected installment's agreed PAYMENT date is within
// `windowDays` calendar days ahead OR already past (overdue) — i.e. payment due soon or
// already overdue and still unpaid. A Completed (collected) installment never qualifies;
// an installment already flagged Overdue always does.
export function isPaymentDueSoonOrOverdue(
  installment: PaymentInstallmentInput,
  windowDays = 7,
): boolean {
  if (installment.status === 'Completed') return false;
  if (installment.status === 'Overdue') return true;
  if (!installment.agreed_payment_date) return false;
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  const today = new Date(todayStr + "T00:00:00");
  const pay = new Date(installment.agreed_payment_date + "T00:00:00");
  const diffDays = (pay.getTime() - today.getTime()) / 86400000;
  return diffDays <= windowDays; // within the window ahead, or already past
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
// - "red" (☼): some not-yet-Collected installment's agreed PAYMENT date is within the
//   alert window or already overdue (payment due soon / overdue and still unpaid).
// - "green" (☼): otherwise — approved and in progress with no payment at risk.
export function computeBillingIndicator(
  installments: PaymentInstallmentInput[],
): 'red' | 'green' | 'complete' | 'unconfigured' {
  if (installments.length === 0) return 'unconfigured';
  if (installments.every((i) => i.status === 'Completed')) {
    const pctSum = installments.reduce((sum, i) => sum + i.percentage, 0);
    if (Math.abs(pctSum - 100) <= 0.01) return 'complete';
  } else if (!installments.some((i) => !!i.agreed_payment_date)) {
    return 'unconfigured';
  }
  const hasPaymentAtRisk = installments.some((installment) =>
    isPaymentDueSoonOrOverdue(installment, 7),
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

import { getBoliviaNationalHolidays } from './boliviaHolidays';
import type { PaymentInstallmentInput, PaymentInstallmentStatus } from '@/types/workOrderPaymentPlan';

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

// Returns an array of `count` percentages that sum exactly to 100.00 (2 decimal places).
// The last row absorbs the rounding remainder.
export function distributePercentages(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor((100 / count) * 100) / 100;
  const result = Array(count).fill(base);
  const remainder = parseFloat((100 - base * count).toFixed(2));
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

import { getBoliviaNationalHolidays } from './boliviaHolidays';
import type { PaymentInstallmentInput } from '@/types/workOrderPaymentPlan';

// Returns a new Date that is `days` business days after `start`.
// Skips weekends and Bolivia national holidays.
export function addBusinessDays(start: Date, days: number): Date {
  if (days <= 0) return new Date(start);

  // Pre-fetch holidays for the years we might span
  const startYear = start.getFullYear();
  const holidays = new Set<string>([
    ...getBoliviaNationalHolidays(startYear).map((h) => h.date),
    ...getBoliviaNationalHolidays(startYear + 1).map((h) => h.date),
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
  const today = new Date().toISOString().slice(0, 10);
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

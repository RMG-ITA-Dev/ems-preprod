export type PaymentInstallmentStatus = 'Pending' | 'Invoiced' | 'Completed' | 'Overdue';

// 0722-156b (Fase 2): a nivel de PLAN (no por cuota, pese a lo que decia el ticket
// original) — 'fijo' aplica el TC de creacion tal cual a todas las cuotas; 'variable'
// captura un TC de facturacion/pago independiente por cuota. Ver bugs/0722-156/plan_v2.md.
export type ExchangeRateMode = 'fijo' | 'variable';

export interface PaymentPlanInput {
  plan_id?: string;
  wo_id: string;
  exchange_rate: number | null;
  payment_days: number;
  exchange_rate_mode: ExchangeRateMode;
}

export interface PaymentInstallmentInput {
  installment_id?: string;
  plan_id?: string;
  wo_id: string;
  installment_number: number;
  agreed_invoice_date: string | null;
  agreed_payment_date: string | null;
  collection_invoice_date: string | null;
  collection_payment_date: string | null;
  payment_date_actual: string | null;
  percentage: number;
  amount: number | null;
  status: PaymentInstallmentStatus;
  invoice_exchange_rate: number | null;
  payment_exchange_rate: number | null;
}

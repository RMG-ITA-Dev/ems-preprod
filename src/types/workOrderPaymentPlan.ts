export type PaymentInstallmentStatus = 'Pending' | 'Invoiced' | 'Completed' | 'Overdue';

export interface PaymentPlanInput {
  plan_id?: string;
  wo_id: string;
  exchange_rate: number | null;
  payment_days: number;
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
}

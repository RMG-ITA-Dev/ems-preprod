export type PaymentInstallmentStatus = 'Pending' | 'Invoiced' | 'Completed' | 'Overdue';

// Cobranzas Fase 1 (issue #352 / 0923-206). La cuota tiene DOS dimensiones independientes:
//   * la ETAPA economica, que es el `status` persistido de arriba;
//   * la CONDICION DE CALENDARIO, que se deriva de las fechas y nunca se guarda.
// Mezclarlas fue justamente el problema del issue: "Mora" nombraba a la vez una cuota que
// no se facturo a tiempo y una facturada que el cliente no pago. Ahora:
//   'billing_late'     -> todavia sin facturar y su fecha de facturacion vigente paso.
//   'overdue'          -> mora de verdad: facturada y pasada su fecha de vencimiento
//                         vigente, o marcada en mora a mano.
// Espejo exacto de public.installment_calendar_state(...) en la base.
export type InstallmentCalendarState =
  | 'on_track'
  | 'billing_due_soon'
  | 'billing_late'
  | 'payment_due_soon'
  | 'overdue'
  | 'closed';

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
  // Fechas VIGENTES tras una reprogramacion (Fase 3). NULL = nunca se reprogramo y vale la
  // acordada; por eso todo consumidor lee COALESCE(current_*, agreed_*). Las agreed_* no se
  // tocan nunca: son el contrato, y #352 pide no perderlo al reprogramar.
  // Opcionales como installment_id/plan_id: una cuota recién creada en memoria todavía no
  // las tiene, y `?? agreed_*` trata igual a undefined y a null.
  current_invoice_date?: string | null;
  current_payment_date?: string | null;
  // Cobranzas Fase 3: gestión de la confirmación con el cliente. Es una dimensión aparte del
  // estado — una cuota puede estar Pendiente y confirmada, o Pendiente y sin gestionar.
  confirmation_status?: 'sin_gestionar' | 'confirmada' | 'no_confirmada';
  confirmed_for_date?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  collection_invoice_date: string | null;
  collection_payment_date: string | null;
  payment_date_actual: string | null;
  percentage: number;
  amount: number | null;
  status: PaymentInstallmentStatus;
  invoice_exchange_rate: number | null;
  payment_exchange_rate: number | null;
  // Cobranzas Fase 6 (decisión Q29): la cuota puede ir en otra moneda que la OT. null/undefined
  // = la de la OT, que es el caso normal.
  currency?: 'BOB' | 'USD' | 'USDT' | null;
  // De qué fecha salió el TC de facturación; null = se escribió a mano (Q49).
  invoice_exchange_rate_date?: string | null;
}

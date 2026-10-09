// Lógica pura del módulo de Solicitud de Fondos (sin React) — fácil de testear.

import type { FundRequestExpenseStatus } from "@/hooks/useFundRequestExpenses";

/**
 * Días (tiempo) derivados del rango Del/Al, inclusivos.
 * Una sola fecha = 1 día. Rango inválido (Al < Del) = null.
 */
export function computeExpenseDays(start: string, end: string): number | null {
  if (!start) return null;
  if (!end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1;
  return diff > 0 ? diff : null;
}

export interface SettlementCalc {
  /** entregado − gastado, redondeado a 2 decimales. >0 sobró, <0 gastó de más */
  balance: number;
  favorsFirm: boolean; // sobró dinero (a favor de la firma)
  favorsRequester: boolean; // gastó de más (a favor del solicitante)
  noBalance: boolean;
}

/** Cálculo de liquidación: entregado − gastado(validado) = saldo, con su dirección. */
export function computeSettlement(disbursed: number, spent: number): SettlementCalc {
  const balance = Math.round((disbursed - spent) * 100) / 100;
  const favorsFirm = balance > 0.009;
  const favorsRequester = balance < -0.009;
  return { balance, favorsFirm, favorsRequester, noBalance: !favorsFirm && !favorsRequester };
}

export type ExpensePhase = "review" | "ready" | "delivered";

/** Conteo de gastos por estado de una solicitud (RLS lo limita por rol). */
export type ExpenseStatusCounts = Partial<Record<FundRequestExpenseStatus, number>> & {
  total?: number;
};

/**
 * Fase de gastos de una solicitud en fondos_entregados (mutuamente excluyente):
 *   review    → hay gastos esperando a contabilidad (aprobado_gerente)
 *   ready     → todos los gastos finalizados (revisados, vencidos o rechazados ya sin
 *               plazo) → por liquidar
 *   delivered → recién entregada / gastos aún en proceso del solicitante o gerente
 *
 * `deadlinePassed`: pasó la fecha fin de la solicitud (Fase 3). Hasta entonces un gasto
 * rechazado se puede corregir y reenviar, así que sigue "en curso"; después es final.
 * `vencido` siempre es final. Mismo criterio que unfinishedExpenses y fund_request_settle.
 */
export function expensePhase(c?: ExpenseStatusCounts, deadlinePassed = false): ExpensePhase {
  const total = c?.total ?? 0;
  const toReview = c?.aprobado_gerente ?? 0;
  const inFlight =
    (c?.borrador ?? 0) +
    (c?.pendiente_aprobacion ?? 0) +
    (c?.observado ?? 0) +
    (deadlinePassed ? 0 : c?.rechazado ?? 0);
  if (toReview > 0) return "review";
  if (total > 0 && inFlight === 0) return "ready";
  // Sin gastos y con la fecha fin vencida ya no puede llegar ninguno: se liquida igual
  // (devolución total). Mismo criterio que el contador fund.settlement.pending.
  if (total === 0 && deadlinePassed) return "ready";
  return "delivered";
}

// ── Fase 4: movimiento de dinero de la liquidación ─────────────────────────

/** Qué dinero se mueve según la resolución de la liquidación. */
export type SettlementMovementKind = "reimbursement" | "return" | "payroll";

export interface SettlementMovement {
  kind: SettlementMovementKind;
  amount: number;
  /** true mientras Contabilidad no confirmó el movimiento (solicitud en en_liquidacion). */
  pending: boolean;
  confirmedAt: string | null;
}

const MOVEMENT_BY_RESOLUTION: Record<string, SettlementMovementKind> = {
  pago_solicitante: "reimbursement", // la firma paga al empleado
  devolucion: "return", // el empleado devuelve el sobrante
  descuento_planilla: "payroll", // el sobrante se descuenta del sueldo
};

/**
 * El movimiento de dinero de una solicitud liquidada, o null si no hay (sin saldo o todavía sin
 * liquidar). Con saldo la solicitud queda en `en_liquidacion` hasta que Contabilidad confirma.
 */
export function settlementMovement(fr: {
  settlement_resolution: string | null;
  settlement_amount: number | null;
  settlement_confirmed_at: string | null;
}): SettlementMovement | null {
  const kind = fr.settlement_resolution ? MOVEMENT_BY_RESOLUTION[fr.settlement_resolution] : undefined;
  if (!kind) return null;
  return {
    kind,
    amount: Number(fr.settlement_amount ?? 0),
    pending: !fr.settlement_confirmed_at,
    confirmedAt: fr.settlement_confirmed_at,
  };
}

/** Pasos del flujo que ve el solicitante (línea de pasos en el detalle). */
export const FUND_REQUEST_STEPS = [
  "requested",
  "approved",
  "disbursed",
  "settled",
  "closed",
] as const;
export type FundRequestStep = (typeof FUND_REQUEST_STEPS)[number];

/**
 * Índice del paso en curso (el último alcanzado). null para borrador y cancelada, que no
 * avanzan por el flujo. Observada/rechazada vuelven al paso "solicitada".
 */
export function fundRequestStepIndex(status: string): number | null {
  switch (status) {
    case "pendiente_aprobacion":
    case "observado":
    case "rechazado":
      return 0;
    case "aprobado_gerente":
      return 1;
    case "fondos_entregados":
      return 2;
    case "en_liquidacion":
      return 3;
    case "cerrado":
      return 4;
    default:
      return null;
  }
}

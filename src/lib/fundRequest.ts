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
 *   ready     → todos los gastos finalizados (revisados) → por liquidar
 *   delivered → recién entregada / gastos aún en proceso (incl. rechazado, que
 *               sigue siendo corregible) del solicitante o gerente
 */
export function expensePhase(c?: ExpenseStatusCounts): ExpensePhase {
  const total = c?.total ?? 0;
  const toReview = c?.aprobado_gerente ?? 0;
  const inFlight =
    (c?.borrador ?? 0) +
    (c?.pendiente_aprobacion ?? 0) +
    (c?.observado ?? 0) +
    // rechazado sigue siendo corregible/reenviable → no está finalizado, así que
    // la solicitud no debe entrar a "Por liquidar" hasta resolverlo (consistente
    // con unfinishedExpenses en FundRequestEdit).
    (c?.rechazado ?? 0);
  if (toReview > 0) return "review";
  if (total > 0 && inFlight === 0) return "ready";
  return "delivered";
}

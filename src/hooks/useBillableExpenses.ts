import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cobranzas Fase 7 (issue #352) — qué gastos de una orden de trabajo se le pueden facturar
 * todavía al cliente.
 *
 * Son los que terminaron TODO el proceso de gastos (decisión del operador Q37): registrados,
 * aprobados por el gerente y revisados por Contabilidad. Uno que sigue en revisión no entra:
 * todavía puede cambiar de monto o caerse, y cobrárselo al cliente antes obligaría después a
 * emitir una nota de crédito.
 *
 * Quedan fuera los que ya entraron en una fila de reembolso anterior, que es lo que deja
 * volver a pulsar el botón sin cobrar nada dos veces.
 *
 * La RPC es la misma fuente que usa `create_expense_reimbursement_row`, así que lo que la
 * pantalla muestra como "pendiente de facturar" y lo que el botón realmente factura no pueden
 * divergir.
 */
export interface BillableExpense {
  fre_id: string;
  amount: number;
}

// src/integrations/supabase/types.ts está desactualizado y no conoce las RPC de cobranzas;
// mismo puente que useWorkOrderPaymentPlanMutations. Se borra cuando se regeneren los tipos.
const rpcUntyped = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export function useBillableExpenses(woId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["billable_expenses", woId],
    queryFn: async (): Promise<BillableExpense[]> => {
      const { data, error } = await rpcUntyped("wo_billable_expenses", { p_wo_id: woId! });
      if (error) throw error;
      return ((data ?? []) as BillableExpense[]).map((e) => ({
        fre_id: e.fre_id,
        amount: Number(e.amount),
      }));
    },
    enabled: !!woId && enabled,
  });
}

/** Lo que suman los gastos pendientes de facturar, que es lo que crearía el botón. */
export function totalBillable(expenses: BillableExpense[] | undefined): number {
  return (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);
}

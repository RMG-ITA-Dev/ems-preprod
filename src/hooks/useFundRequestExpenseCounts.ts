import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FundRequestExpenseStatus } from "@/hooks/useFundRequestExpenses";

// NOTE: fund_request_expenses is not yet in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type ExpenseCountsByRequest = Record<
  string,
  Partial<Record<FundRequestExpenseStatus, number>> & { total: number }
>;

/**
 * Devuelve, por solicitud de fondos, el conteo de gastos agrupado por estado.
 * RLS limita la visibilidad a las solicitudes donde el usuario es solicitante,
 * gerente o admin — así cada rol obtiene solo lo relevante.
 *
 * Se usa para mostrar indicadores en las listas ("N gastos por revisar", etc.)
 * sin tener que entrar a cada solicitud.
 */
export function useFundRequestExpenseCounts() {
  return useQuery({
    queryKey: ["fund_request_expense_counts"],
    queryFn: async (): Promise<ExpenseCountsByRequest> => {
      const { data, error } = await sb
        .from("fund_request_expenses")
        .select("fund_request_id, status");
      if (error) throw error;

      const map: ExpenseCountsByRequest = {};
      for (const row of (data ?? []) as {
        fund_request_id: string;
        status: FundRequestExpenseStatus;
      }[]) {
        const entry = (map[row.fund_request_id] ??= { total: 0 });
        entry[row.status] = (entry[row.status] ?? 0) + 1;
        entry.total += 1;
      }
      return map;
    },
  });
}

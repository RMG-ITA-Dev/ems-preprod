import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FundRequestExpenseStatus } from "@/hooks/useFundRequestExpenses";
import type { FundRequestStatus } from "@/hooks/useFundRequests";

// NOTE: las RPC de gastos por OT no están todavía en los tipos generados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// Detalle de gastos por OT (docs/plan-contabilidad-gastos.md, Fase 5). Lo ven el Gerente y el
// Analista de Contabilidad (expense_settlement.read); las RPC tienen su propio portón porque
// Contabilidad no tiene work_order.read.

// `type` y no `interface`: DataTable exige Record<string, unknown>, y una interface no tiene firma de índice.
/** Una OT con solicitudes de fondos en la fase contable. */
export type WorkOrderExpenseSummary = {
  wo_id: string;
  engagement_code: string | null;
  engagement_name: string | null;
  client_name: string | null;
  request_count: number;
  expense_count: number;
  /** Lo asignado a la OT en sus solicitudes. */
  assigned: number;
  /** Gastos validados por Contabilidad (lo que cuenta en la liquidación). */
  spent: number;
  /** Gastos enviados que todavía no son finales. */
  in_process: number;
  /** Presupuesto de gastos de la OT. */
  budget: number;
}

export type WorkOrderExpense = {
  fre_id: string;
  fund_request_id: string;
  request_number: string | null;
  requester_staff_id: string;
  requester_name: string;
  expense_date: string;
  expense_date_end: string | null;
  amount: number;
  currency: "BOB" | "USD";
  status: FundRequestExpenseStatus;
  expense_type_id: string | null;
  expense_type_name: string | null;
  description: string | null;
  document_number: string | null;
  supplier_name: string | null;
  iva_penalty_amount: number;
  manager_auto_approved: boolean;
  review_auto_approved: boolean;
}

export type WorkOrderBudgetLine = {
  expense_type_id: string | null;
  expense_type_name: string | null;
  budgeted: number;
  spent: number;
  in_process: number;
}

export interface WorkOrderExpenseDetail {
  work_order: {
    wo_id: string;
    engagement_code: string | null;
    engagement_name: string | null;
    client_name: string | null;
  } | null;
  totals: { assigned: number; spent: number; in_process: number; budget: number };
  requests: {
    fund_request_id: string;
    request_number: string | null;
    status: FundRequestStatus;
    requester_name: string;
    allocated_amount: number;
  }[];
  expenses: WorkOrderExpense[];
  budget_by_type: WorkOrderBudgetLine[];
}

export function useWorkOrderExpenseSummary() {
  return useQuery({
    queryKey: ["work_order_expense_summary"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("fund_work_order_expense_summary");
      if (error) throw error;
      return ((data ?? []) as WorkOrderExpenseSummary[]).map((r) => ({
        ...r,
        assigned: Number(r.assigned),
        spent: Number(r.spent),
        in_process: Number(r.in_process),
        budget: Number(r.budget),
      }));
    },
  });
}

export function useWorkOrderExpenseDetail(woId: string | undefined) {
  return useQuery({
    queryKey: ["work_order_expense_detail", woId],
    queryFn: async () => {
      if (!woId) return null;
      const { data, error } = await sb.rpc("fund_work_order_expense_detail", { p_wo_id: woId });
      if (error) throw error;
      return data as WorkOrderExpenseDetail | null;
    },
    enabled: !!woId,
  });
}

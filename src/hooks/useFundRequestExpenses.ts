import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Staff, WorkOrder, ExpenseType } from "@/hooks/useEmsData";

// NOTE: fund_request_expenses is not yet in the generated Supabase types.
// Cast the client until Lovable regenerates types after the migration runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type FundRequestExpenseStatus =
  | "borrador"
  | "pendiente_aprobacion"
  | "aprobado_gerente"
  | "observado"
  | "rechazado"
  | "revisado_asistente";

export interface FundRequestExpense {
  fre_id: string;
  fund_request_id: string;
  wo_id: string;
  expense_type_id: string | null;
  expense_date: string;
  amount: number;
  currency: "BOB" | "USD";
  description: string | null;
  document_number: string | null;
  supplier_name: string | null;
  supplier_tax_id: string | null;
  attachment_url: string | null;
  status: FundRequestExpenseStatus;
  submitted_at: string | null;
  manager_decided_at: string | null;
  manager_notes: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by_staff_id: string | null;
  has_invoice_observation: boolean;
  invoice_observation_notes: string | null;
  iva_penalty_amount: number;
  created_at: string;
  updated_at: string;
  work_order?: WorkOrder;
  expense_type?: ExpenseType;
  reviewed_by?: Staff;
}

const expenseSelect = `
  *,
  work_order:work_orders(
    wo_id,
    currency,
    engagement:engagements(
      engagement_id,
      engagement_code,
      engagement_name,
      client:clients(client_legal_name)
    )
  ),
  expense_type:expense_types(expense_type_id, expense_name),
  reviewed_by:staff!fund_request_expenses_reviewed_by_staff_id_fkey(staff_id, first_name, last_name, short_name, initials)
`;

export function useFundRequestExpenses(fundRequestId: string | undefined) {
  return useQuery({
    queryKey: ["fund_request_expenses", fundRequestId],
    queryFn: async () => {
      if (!fundRequestId) return [];
      const { data, error } = await sb
        .from("fund_request_expenses")
        .select(expenseSelect)
        .eq("fund_request_id", fundRequestId)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FundRequestExpense[];
    },
    enabled: !!fundRequestId,
  });
}

export function useFundRequestExpenseById(id: string | undefined) {
  return useQuery({
    queryKey: ["fund_request_expense", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await sb
        .from("fund_request_expenses")
        .select(expenseSelect)
        .eq("fre_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as FundRequestExpense | null;
    },
    enabled: !!id,
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Staff, WorkOrder } from "@/hooks/useEmsData";

// NOTE: fund_requests is not yet in the generated Supabase types. Cast the
// client until Lovable regenerates types after the migration runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type FundRequestStatus =
  | "borrador"
  | "pendiente_aprobacion"
  | "aprobado_gerente"
  | "observado"
  | "rechazado"
  | "fondos_entregados"
  | "en_liquidacion"
  | "cerrado"
  | "cancelado";

export interface FundRequestWorkOrder {
  fr_wo_id: string;
  fund_request_id: string;
  wo_id: string;
  allocated_amount: number;
  created_at: string;
  work_order?: WorkOrder;
}

export interface FundRequest {
  fund_request_id: string;
  request_number: string;
  requester_staff_id: string;
  approver_manager_staff_id: string;
  total_requested_amount: number;
  total_disbursed_amount: number;
  currency: "BOB" | "USD";
  status: FundRequestStatus;
  purpose: string | null;
  due_back_date: string | null;
  submitted_at: string | null;
  manager_decided_at: string | null;
  manager_notes: string | null;
  rejection_reason: string | null;
  disbursed_at: string | null;
  disbursed_by_staff_id: string | null;
  accounting_notes: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  requester?: Staff;
  approver_manager?: Staff;
  disbursed_by?: Staff;
  fund_request_work_orders?: FundRequestWorkOrder[];
}

const fundRequestSelect = `
  *,
  requester:staff!fund_requests_requester_staff_id_fkey(staff_id, first_name, last_name, short_name, initials),
  approver_manager:staff!fund_requests_approver_manager_staff_id_fkey(staff_id, first_name, last_name, short_name, initials),
  disbursed_by:staff!fund_requests_disbursed_by_staff_id_fkey(staff_id, first_name, last_name, short_name, initials),
  fund_request_work_orders(
    *,
    work_order:work_orders(
      wo_id,
      currency,
      approval_status,
      engagement:engagements(
        engagement_id,
        engagement_code,
        engagement_name,
        client:clients(client_legal_name)
      )
    )
  )
`;

export function useFundRequests() {
  return useQuery({
    queryKey: ["fund_requests"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("fund_requests")
        .select(fundRequestSelect)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FundRequest[];
    },
  });
}

export function useFundRequestById(id: string | undefined) {
  return useQuery({
    queryKey: ["fund_request", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await sb
        .from("fund_requests")
        .select(fundRequestSelect)
        .eq("fund_request_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as FundRequest | null;
    },
    enabled: !!id,
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Staff, WorkOrder } from "@/hooks/useEmsData";

// NOTE: fund_requests is not yet in the generated Supabase types. Cast the
// client until Lovable regenerates types after the migration runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type SettlementResolution =
  | "sin_saldo"
  | "devolucion"
  | "descuento_planilla"
  | "pago_solicitante";

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

export type FrWoApprovalStatus = "pendiente" | "aprobado" | "observado" | "rechazado";

export interface FundRequestWorkOrder {
  fr_wo_id: string;
  fund_request_id: string;
  wo_id: string;
  allocated_amount: number;
  created_at: string;
  // Aprobación por OT (modelo multi-gerente)
  manager_staff_id: string | null;
  approval_status: FrWoApprovalStatus;
  manager_notes: string | null;
  rejection_reason: string | null;
  manager_decided_at: string | null;
  work_order?: WorkOrder;
  manager?: Staff;
}

export interface FundRequest {
  fund_request_id: string;
  request_number: string;
  requester_staff_id: string;
  approver_manager_staff_id: string | null;
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
  // Liquidación (Fase 7)
  settlement_total_spent: number | null;
  settlement_balance: number | null;
  settlement_iva_total: number | null;
  settlement_resolution: SettlementResolution | null;
  settlement_amount: number | null;
  settlement_notes: string | null;
  settled_at: string | null;
  settled_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
  requester?: Staff;
  approver_manager?: Staff;
  disbursed_by?: Staff;
  settled_by?: Staff;
  fund_request_work_orders?: FundRequestWorkOrder[];
}

const fundRequestSelect = `
  *,
  requester:staff!fund_requests_requester_staff_id_fkey(staff_id, first_name, last_name, short_name, initials),
  approver_manager:staff!fund_requests_approver_manager_staff_id_fkey(staff_id, first_name, last_name, short_name, initials),
  disbursed_by:staff!fund_requests_disbursed_by_staff_id_fkey(staff_id, first_name, last_name, short_name, initials),
  settled_by:staff!fund_requests_settled_by_staff_id_fkey(staff_id, first_name, last_name, short_name, initials),
  fund_request_work_orders(
    *,
    manager:staff!fund_request_work_orders_manager_staff_id_fkey(staff_id, first_name, last_name, short_name, initials),
    work_order:work_orders(
      wo_id,
      currency,
      approval_status,
      engagement:engagements(
        engagement_id,
        engagement_code,
        engagement_name,
        manager_id,
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

// OTs aprobadas seleccionables para una solicitud de fondos. Lee la VISTA
// segura `fund_request_selectable_work_orders` (solo columnas mínimas), NO la
// tabla base — así el dropdown no expone cliente/NIT/presupuesto/notas.
export interface SelectableWorkOrder {
  wo_id: string;
  currency: "BOB" | "USD";
  approval_status: string;
  engagement: {
    engagement_id: string;
    engagement_code: string | null;
    engagement_name: string | null;
    manager_id: string | null;
    manager: {
      staff_id: string;
      short_name: string | null;
      first_name: string;
      last_name: string;
    } | null;
  };
}

export function useSelectableWorkOrders() {
  return useQuery({
    queryKey: ["fund_request_selectable_work_orders"],
    queryFn: async (): Promise<SelectableWorkOrder[]> => {
      const { data, error } = await sb
        .from("fund_request_selectable_work_orders")
        .select("*");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        wo_id: r.wo_id,
        currency: r.currency,
        approval_status: r.approval_status,
        engagement: {
          engagement_id: r.engagement_id,
          engagement_code: r.engagement_code,
          engagement_name: r.engagement_name,
          manager_id: r.manager_id,
          manager: r.manager_staff_id
            ? {
                staff_id: r.manager_staff_id,
                short_name: r.manager_short_name,
                first_name: r.manager_first_name,
                last_name: r.manager_last_name,
              }
            : null,
        },
      }));
    },
  });
}

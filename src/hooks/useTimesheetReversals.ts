import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { subWeeks } from "date-fns";
import i18n from "@/i18n";
import { createMutationErrorHandler } from "@/lib/error-handler";
import { toISODateString } from "@/lib/timesheetUtils";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

// PostgREST trunca en silencio a 1000 filas por página (riesgo G4): "Aprobadas" es histórico
// y puede superarlo dentro del rango de semanas filtrado, así que se pagina hasta agotar.
const APPROVED_LINES_PAGE_SIZE = 1000;

export type ReversalScope = "engagement" | "week";
export type ReversalStatus = "pending" | "executed" | "rejected";

export interface ReversalRequest {
  request_id: string;
  period_id: string;
  scope: ReversalScope;
  engagement_id: string | null;
  requested_by: string;
  requested_at: string;
  reason: string;
  status: ReversalStatus;
  is_direct: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  period?: {
    period_id: string;
    week_start_date: string;
    week_number: number;
    year: number;
    staff_id: string;
    staff?: {
      staff_id: string;
      first_name: string;
      last_name: string;
      short_name: string | null;
    };
  };
  engagement?: {
    engagement_id: string;
    engagement_code: string | null;
    engagement_name: string;
  };
}

export interface ApprovedApprovalGroup {
  period_id: string;
  engagement_id: string;
  staff_id: string;
  week_start_date: string;
  week_number: number;
  year: number;
  staff: {
    staff_id: string;
    first_name: string;
    last_name: string;
    short_name: string | null;
  };
  engagement: {
    engagement_id: string;
    engagement_code: string | null;
    engagement_name: string;
  };
  approvedLineCount: number;
}

export interface ReversalFilters {
  staffId?: string;
  engagementId?: string;
  weeksBack?: number;
}

// Invalida el mismo set que useRequestRevision invalidaba, más las colas de reversión y
// la campana -- ambas mutaciones de admin y la de solicitud terminan escribiendo la misma
// tabla y, en alcance semana, también timesheet_periods.
function invalidateReversalQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["pending-approval-summaries"] });
  queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
  queryClient.invalidateQueries({ queryKey: ["staff-timesheet-for-approval"] });
  queryClient.invalidateQueries({ queryKey: ["timesheet-week"] });
  queryClient.invalidateQueries({ queryKey: ["timesheet-period"] });
  queryClient.invalidateQueries({ queryKey: ["reversal-requests"] });
  queryClient.invalidateQueries({ queryKey: ["approved-approval-groups"] });
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
}

// approval.reversalErrors.<token> -- mismo patrón que useUnsubmitTimesheet con UNSUBMIT_*.
const REVERSAL_ERROR_KEYS: Record<string, string> = {
  REVERSAL_NOT_FULLY_APPROVED: "approval.reversalErrors.notFullyApproved",
  REVERSAL_NOTHING_APPROVED: "approval.reversalErrors.nothingApproved",
  REVERSAL_BAD_SCOPE: "approval.reversalErrors.badScope",
  REVERSAL_REASON_REQUIRED: "approval.reversalErrors.reasonRequired",
  REVERSAL_NOT_SUBMITTED: "approval.reversalErrors.notSubmitted",
  REVERSAL_PERIOD_LOCKED: "approval.reversalErrors.periodLocked",
  REVERSAL_NOT_AUTHORIZED: "approval.reversalErrors.notAuthorized",
  REVERSAL_ALREADY_REQUESTED: "approval.reversalErrors.alreadyRequested",
  REVERSAL_NOT_ADMIN: "approval.reversalErrors.notAdmin",
  REVERSAL_NOT_PENDING: "approval.reversalErrors.notPending",
  REVERSAL_REJECT_NOTES_REQUIRED: "approval.reversalErrors.rejectNotesRequired",
};

function handleReversalError(context: string) {
  return (error: Error) => {
    const msg = error.message || "";
    const matchedToken = Object.keys(REVERSAL_ERROR_KEYS).find((token) => msg.includes(token));
    if (matchedToken) {
      toast.error(i18n.t(REVERSAL_ERROR_KEYS[matchedToken]));
      return;
    }
    createMutationErrorHandler(context)(error);
  };
}

// Grupos (staff, encargo, semana) con >=1 línea aprobada, acotados por RLS a lo que el
// llamante puede ver (can_approve_timesheet_line vía la policy de timesheet_line_approvals;
// el admin ve todo por is_admin()). Filtro de rango de semanas en servidor (default últimas
// 8): "approved" es histórico y PostgREST trunca en silencio a 1000 filas (riesgo G4).
type ApprovedLineRow = {
  period_id: string;
  engagement_id: string;
  period: {
    period_id: string;
    week_start_date: string;
    week_number: number;
    year: number;
    staff_id: string;
    staff: ApprovedApprovalGroup["staff"] | null;
  } | null;
  engagement: ApprovedApprovalGroup["engagement"] | null;
} & Record<string, unknown>;

export function useApprovedApprovalGroups(filters: ReversalFilters = {}) {
  const weeksBack = filters.weeksBack ?? 8;

  return useQuery({
    queryKey: ["approved-approval-groups", filters.staffId, filters.engagementId, weeksBack],
    queryFn: async (): Promise<ApprovedApprovalGroup[]> => {
      const sinceDate = toISODateString(subWeeks(new Date(), weeksBack));

      // Página hasta agotar: una sola llamada sin `.range()` se corta en silencio a 1000
      // filas -- "aprobadas" es histórico y ese tope se puede superar aun dentro de las 8
      // semanas por defecto (riesgo G4).
      const rows: ApprovedLineRow[] = [];
      let page = 0;
      for (;;) {
        let query = supabase
          .from("timesheet_line_approvals")
          .select(`
            period_id,
            engagement_id,
            status,
            period:timesheet_periods!inner(
              period_id,
              week_start_date,
              week_number,
              year,
              staff_id,
              staff:staff!timesheet_periods_staff_id_fkey(
                staff_id,
                first_name,
                last_name,
                short_name
              )
            ),
            engagement:engagements(
              engagement_id,
              engagement_code,
              engagement_name
            )
          `)
          .eq("status", "approved")
          .gte("period.week_start_date", sinceDate)
          .range(page * APPROVED_LINES_PAGE_SIZE, page * APPROVED_LINES_PAGE_SIZE + APPROVED_LINES_PAGE_SIZE - 1);

        if (filters.staffId) query = query.eq("period.staff_id", filters.staffId);
        if (filters.engagementId) query = query.eq("engagement_id", filters.engagementId);

        const { data, error } = await query;
        if (error) throw error;

        const batch = (data || []) as unknown as ApprovedLineRow[];
        rows.push(...batch);
        if (batch.length < APPROVED_LINES_PAGE_SIZE) break;
        page++;
      }

      const groups = new Map<string, ApprovedApprovalGroup>();
      rows.forEach((row) => {
        if (!row.period || !row.period.staff || !row.engagement) return;
        const key = `${row.period_id}:${row.engagement_id}`;
        const existing = groups.get(key);
        if (existing) {
          existing.approvedLineCount++;
          return;
        }
        groups.set(key, {
          period_id: row.period_id,
          engagement_id: row.engagement_id,
          staff_id: row.period.staff_id,
          week_start_date: row.period.week_start_date,
          week_number: row.period.week_number,
          year: row.period.year,
          staff: row.period.staff,
          engagement: row.engagement,
          approvedLineCount: 1,
        });
      });

      return Array.from(groups.values()).sort((a, b) =>
        b.week_start_date.localeCompare(a.week_start_date)
      );
    },
  });
}

// Cola de solicitudes (admin): todas las pending, o cualquier estado si se filtra distinto.
export function useReversalRequests(
  filters: ReversalFilters & { status?: ReversalStatus; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["reversal-requests", "queue", filters.staffId, filters.engagementId, filters.status],
    enabled: filters.enabled ?? true,
    queryFn: async (): Promise<ReversalRequest[]> => {
      let query = supabase
        .from("timesheet_reversal_requests" as never)
        .select(`
          *,
          period:timesheet_periods!inner(
            period_id,
            week_start_date,
            week_number,
            year,
            staff_id,
            staff:staff!timesheet_periods_staff_id_fkey(
              staff_id,
              first_name,
              last_name,
              short_name
            )
          ),
          engagement:engagements(
            engagement_id,
            engagement_code,
            engagement_name
          )
        `)
        .order("requested_at", { ascending: false });

      query = query.eq("status", filters.status ?? "pending");
      if (filters.staffId) query = query.eq("period.staff_id", filters.staffId);
      if (filters.engagementId) query = query.eq("engagement_id", filters.engagementId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ReversalRequest[];
    },
  });
}

// "Mis solicitudes": todas las del usuario actual, de cualquier alcance y estado (decisión
// del operador, §i.2 -- incluidas las de su propia boleta). Filtra por `requested_by`: la RLS
// por sí sola es más amplia (también expone, a un aprobador, las solicitudes de alcance
// ENCARGO que OTRO aprobador hizo sobre un encargo que ambos pueden aprobar), así que sin este
// `.eq` "mis solicitudes" mostraba pedidos ajenos (review iteración 1, hallazgo #4).
export function useMyReversalRequests() {
  const { staffRecord } = useCurrentStaff();
  const staffId = staffRecord?.staff_id;

  return useQuery({
    queryKey: ["reversal-requests", "mine", staffId],
    enabled: !!staffId,
    queryFn: async (): Promise<ReversalRequest[]> => {
      const { data, error } = await supabase
        .from("timesheet_reversal_requests" as never)
        .select(`
          *,
          period:timesheet_periods!inner(
            period_id,
            week_start_date,
            week_number,
            year,
            staff_id,
            staff:staff!timesheet_periods_staff_id_fkey(
              staff_id,
              first_name,
              last_name,
              short_name
            )
          ),
          engagement:engagements(
            engagement_id,
            engagement_code,
            engagement_name
          )
        `)
        .eq("requested_by", staffId as string)
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as ReversalRequest[];
    },
  });
}

export function useRequestTimesheetReversal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      periodId: string;
      scope: ReversalScope;
      engagementId: string | null;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc("request_timesheet_reversal" as never, {
        p_period_id: params.periodId,
        p_scope: params.scope,
        p_engagement_id: params.engagementId,
        p_reason: params.reason,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateReversalQueries(queryClient);
      toast.success(i18n.t("timesheet.reversalRequested"));
    },
    onError: handleReversalError("requesting timesheet reversal"),
  });
}

export function useExecuteTimesheetReversal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      periodId: string;
      scope: ReversalScope;
      engagementId?: string | null;
      reason: string;
      requestId?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("execute_timesheet_reversal" as never, {
        p_period_id: params.periodId,
        p_scope: params.scope,
        p_engagement_id: params.engagementId ?? null,
        p_reason: params.reason,
        p_request_id: params.requestId ?? null,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateReversalQueries(queryClient);
      toast.success(i18n.t("approval.reversalExecuted"));
    },
    onError: handleReversalError("executing timesheet reversal"),
  });
}

export function useRejectTimesheetReversal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { requestId: string; notes: string }) => {
      const { error } = await supabase.rpc("reject_timesheet_reversal" as never, {
        p_request_id: params.requestId,
        p_notes: params.notes,
      } as never);
      if (error) throw error;
      return { requestId: params.requestId };
    },
    onSuccess: () => {
      invalidateReversalQueries(queryClient);
      toast.success(i18n.t("approval.reversalRejected"));
    },
    onError: handleReversalError("rejecting timesheet reversal"),
  });
}

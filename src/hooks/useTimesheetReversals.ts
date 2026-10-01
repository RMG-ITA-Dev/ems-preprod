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
// Mismo tope aplica a las listas de solicitudes -- "Mis solicitudes" acumula todo el
// historial (pending+executed+rejected) de un solicitante activo (review iteración 3,
// hallazgo #9).
const REVERSAL_LIST_PAGE_SIZE = 1000;

// Pagina por keyset (cursor = última fila de la página anterior), no por offset (review
// iteración 4, hallazgo #3): con `.range(from, to)` un INSERT/UPDATE/DELETE concurrente entre
// el fetch de una página y la siguiente puede correr una fila de lugar y dejarla fuera de
// ambas páginas. Con keyset cada página pide "lo que sigue después del cursor" según el mismo
// orden estable de la consulta, así que no depende de la posición y no le afectan los cambios
// concurrentes. `buildPage` reconstruye la consulta completa en cada vuelta (los query
// builders de supabase-js no son reutilizables) y aplica el cursor de la fila anterior.
async function fetchAllPages<T>(
  buildPage: (cursor: T | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: T | null = null;
  for (;;) {
    const { data, error } = await buildPage(cursor);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < REVERSAL_LIST_PAGE_SIZE) break;
    cursor = batch[batch.length - 1];
  }
  return rows;
}

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
    // Sólo gerente/socio pueden solicitar reversión (can_approve_timesheet_line); la policy de
    // lectura `assigned_engagements` también muestra encargos donde se es sqr/encargado
    // (review iteración 10, hallazgo #2).
    manager_id?: string | null;
    partner_id?: string | null;
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
  approval_id: string;
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

      // Página hasta agotar: una sola llamada sin paginar se corta en silencio a 1000 filas --
      // "aprobadas" es histórico y ese tope se puede superar aun dentro de las 8 semanas por
      // defecto (riesgo G4). Keyset por `approval_id` (orden estable, review iteración 2,
      // hallazgo #2) en vez de `.range()` (review iteración 4, hallazgo #3).
      const rows = await fetchAllPages<ApprovedLineRow>((cursor) => {
        let query = supabase
          .from("timesheet_line_approvals")
          .select(`
            approval_id,
            period_id,
            engagement_id,
            status,
            period:timesheet_periods!inner(
              period_id,
              week_start_date,
              week_number,
              year,
              staff_id,
              submitted_at,
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
              engagement_name,
              manager_id,
              partner_id
            )
          `)
          .eq("status", "approved")
          .gte("period.week_start_date", sinceDate)
          // Excluye períodos retirados (review iteración 5, hallazgo #3): un unsubmit parcial
          // (riesgo documentado en la iteración 3, hallazgo #3) puede dejar `submitted_at NULL`
          // con líneas `approved` sueltas -- ambas RPC rechazan con REVERSAL_NOT_SUBMITTED sobre
          // un período así, así que sin este filtro la fila se ve accionable pero cualquier
          // acción sobre ella siempre falla. Mismo filtro que ya aplica la query de "Pendientes"
          // (useTimesheetApprovals.ts).
          .not("period.submitted_at", "is", null)
          // Excluye períodos bloqueados (review iteración 9, hallazgo #2): ambas RPC rechazan con
          // REVERSAL_PERIOD_LOCKED, así que sin este filtro la fila ofrece acciones que siempre
          // fallan. `is.true` negado también deja pasar NULL, igual que `IF v_period.is_period_locked`.
          .not("period.is_period_locked", "is", true)
          .order("approval_id", { ascending: true })
          .limit(REVERSAL_LIST_PAGE_SIZE);

        if (cursor) query = query.gt("approval_id", cursor.approval_id);
        if (filters.staffId) query = query.eq("period.staff_id", filters.staffId);
        if (filters.engagementId) query = query.eq("engagement_id", filters.engagementId);

        return query as unknown as PromiseLike<{ data: ApprovedLineRow[] | null; error: unknown }>;
      });

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

// Cursor compuesto para el orden `requested_at desc, request_id asc` que usan las dos listas
// de solicitudes: la próxima página son las filas con `requested_at` estrictamente menor, MÁS
// las que empatan en `requested_at` pero con `request_id` mayor (desempate del propio orden).
// Keyset en vez de `.range()` (review iteración 4, hallazgo #3): un `.range()` por offset
// puede correr una fila de página si se crea/resuelve una solicitud entre el fetch de una
// página y la siguiente.
function applyReversalRequestsCursor<
  Q extends { or: (filter: string) => Q },
>(query: Q, cursor: ReversalRequest | null): Q {
  if (!cursor) return query;
  return query.or(
    `requested_at.lt.${cursor.requested_at},and(requested_at.eq.${cursor.requested_at},request_id.gt.${cursor.request_id})`,
  );
}

// Cola de solicitudes (admin): todas las pending, o cualquier estado si se filtra distinto.
export function useReversalRequests(
  filters: ReversalFilters & { status?: ReversalStatus; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["reversal-requests", "queue", filters.staffId, filters.engagementId, filters.status],
    enabled: filters.enabled ?? true,
    queryFn: async (): Promise<ReversalRequest[]> => {
      // Paginado (review iteración 3, hallazgo #9): sin esto, una cola con más de 1000 filas
      // se corta en silencio -- el badge "(N)" de la tab quedaría subcontando.
      return fetchAllPages<ReversalRequest>((cursor) => {
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
          .eq("status", filters.status ?? "pending")
          .order("requested_at", { ascending: false })
          .order("request_id", { ascending: true })
          .limit(REVERSAL_LIST_PAGE_SIZE);

        query = applyReversalRequestsCursor(query, cursor);
        if (filters.staffId) query = query.eq("period.staff_id", filters.staffId);
        if (filters.engagementId) query = query.eq("engagement_id", filters.engagementId);

        return query as unknown as PromiseLike<{ data: ReversalRequest[] | null; error: unknown }>;
      });
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
      // Paginado (review iteración 3, hallazgo #9): "Mis solicitudes" acumula TODO el
      // historial (pending+executed+rejected) de un solicitante activo -- sin paginar, un
      // solicitante frecuente puede perder en silencio sus solicitudes más viejas al superar
      // las 1000 filas de PostgREST. Keyset, no `.range()` (review iteración 4, hallazgo #3).
      return fetchAllPages<ReversalRequest>((cursor) => {
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
          .eq("requested_by", staffId as string)
          .order("requested_at", { ascending: false })
          .order("request_id", { ascending: true })
          .limit(REVERSAL_LIST_PAGE_SIZE);

        query = applyReversalRequestsCursor(query, cursor);

        return query as unknown as PromiseLike<{ data: ReversalRequest[] | null; error: unknown }>;
      });
    },
  });
}

// ¿Ya hay una solicitud SEMANA abierta sobre este período? (review iteración 12, hallazgo #1).
// El dueño la puede leer por RLS (trr_select_visible, rama "dueño del período"). Se usa para
// reemplazar "Solicitar reversión" por "Solicitud pendiente" en /timesheet: el período sigue
// enviado y 100% aprobado hasta que el admin resuelva, así que sin esto el botón se reactiva
// y todo nuevo intento sólo falla con REVERSAL_ALREADY_REQUESTED. Cuelga de la llave
// ["reversal-requests"], que las 3 mutaciones ya invalidan por prefijo.
export function usePendingWeekReversal(periodId: string | null | undefined) {
  return useQuery({
    queryKey: ["reversal-requests", "pending-week", periodId],
    enabled: !!periodId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("timesheet_reversal_requests" as never)
        .select("request_id")
        .eq("period_id", periodId as string)
        .eq("scope", "week")
        .eq("status", "pending")
        .limit(1);
      if (error) throw error;
      return ((data as unknown[] | null) ?? []).length > 0;
    },
  });
}

// Solicitudes ENCARGO abiertas visibles para el usuario, como claves `period_id:engagement_id`
// (review iteración 14, hallazgo #1). Caso hermano de `usePendingWeekReversal`: en "Aprobadas"
// el botón de un aprobador seguía activo tras solicitar, y `uq_trr_open_engagement` es único por
// (período, encargo) sin importar QUIÉN pidió -- por eso se traen todas las pendientes que la RLS
// le deja ver (incluidas las de otro aprobador del mismo encargo), no sólo las propias. Sólo hay
// tantas filas como solicitudes abiertas, así que no necesita paginar. `enabled` evita la
// consulta para perfiles que no solicitan (sólo lectura / admin).
export function usePendingEngagementReversals(enabled: boolean) {
  return useQuery({
    queryKey: ["reversal-requests", "pending-engagement"],
    enabled,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("timesheet_reversal_requests" as never)
        .select("period_id, engagement_id")
        .eq("scope", "engagement")
        .eq("status", "pending");
      if (error) throw error;
      const rows = (data as Array<{ period_id: string; engagement_id: string | null }> | null) ?? [];
      return new Set(rows.map((r) => `${r.period_id}:${r.engagement_id}`));
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

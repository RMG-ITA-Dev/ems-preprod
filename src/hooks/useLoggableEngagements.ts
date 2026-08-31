import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canLogHours, type EngagementState } from "@/lib/engagementStatus";

/**
 * BUG 0828-186: forma compartida de los encargos elegibles para cargar horas (Hoja de
 * Tiempo, Tracker/Registro Diario, Carga Manual), devuelta por el RPC
 * list_loggable_engagements(). Sin filtro de asignación por diseño -- decisión del operador
 * (2026-08-30): todos los empleados deben poder encontrar todos los encargos elegibles.
 */
export interface LoggableEngagement {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  activity_required: boolean;
  work_order_required: boolean;
  is_internal: boolean;
  practica: number | null;
  start_date: string | null;
  end_date: string | null;
  engagement_state_override?: number | null;
  client: {
    client_id: string;
    client_legal_name: string;
  } | null;
}

interface LoggableEngagementRow {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  activity_required: boolean;
  work_order_required: boolean;
  is_internal: boolean;
  practica: number | null;
  start_date: string | null;
  end_date: string | null;
  engagement_state_override: number | null;
  client_id: string | null;
  client_legal_name: string | null;
}

function toLoggableEngagement(row: LoggableEngagementRow): LoggableEngagement {
  return {
    engagement_id: row.engagement_id,
    engagement_code: row.engagement_code,
    engagement_name: row.engagement_name,
    activity_required: row.activity_required,
    work_order_required: row.work_order_required,
    is_internal: row.is_internal,
    practica: row.practica,
    start_date: row.start_date,
    end_date: row.end_date,
    engagement_state_override: row.engagement_state_override,
    client: row.client_id
      ? { client_id: row.client_id, client_legal_name: row.client_legal_name ?? "" }
      : null,
  };
}

// FEAT 0602-135: excluye encargos cuyo override manual (6 Cancelado, 7 Finalizado, 8
// Rechazado, 9 Congelado) impide cargar horas. El RPC ya los excluye en el WHERE; se
// reaplica en JS para que las 3 pantallas queden consistentes con engagementStatus.ts.
function isLoggable(e: LoggableEngagement): boolean {
  const override = e.engagement_state_override;
  return override == null || canLogHours(override as EngagementState);
}

export interface UseLoggableEngagementsOptions {
  /** Tracker: excluye encargos internos/administrativos de la lista. */
  excludeInternal?: boolean;
  enabled?: boolean;
  staleTime?: number;
}

/**
 * Hook base compartido por useTimesheetWeek, useApprovedEngagements y
 * useManualEntryEngagements. Llama al RPC SECURITY DEFINER list_loggable_engagements
 * (gateado por time_entry.create) en vez de leer `engagements` directamente -- ese SELECT
 * queda sujeto a RLS por asignación, que es justamente el bug reportado.
 */
export function useLoggableEngagements(
  queryKey: readonly unknown[],
  options: UseLoggableEngagementsOptions = {},
) {
  const { excludeInternal = false, enabled = true, staleTime } = options;

  return useQuery({
    queryKey,
    staleTime,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_loggable_engagements" as never);
      if (error) throw error;
      const rows = ((data || []) as unknown) as LoggableEngagementRow[];
      let engagements = rows.map(toLoggableEngagement).filter(isLoggable);
      if (excludeInternal) {
        engagements = engagements.filter((e) => !e.is_internal);
      }
      return engagements;
    },
    enabled,
  });
}

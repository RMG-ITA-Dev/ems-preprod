import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canLogHours, EngagementState } from "@/lib/engagementStatus";
import { engagementCoversDate } from "@/lib/timesheetEngagementOptions";

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
  // 0827-184: 0 administrativa, 1 cliente, 2 capacitación, 3 calidad. Consumido por
  // filterActivitiesForEngagement/TimesheetGrid/TrackerBar/ManualEntryDialog/TrackerEdit para
  // decidir si un encargo requiere actividad -- debe viajar por el RPC igual que antes viajaba
  // en el SELECT directo a `engagements` que este bug reemplazó.
  funcion: number | null;
  start_date: string | null;
  end_date: string | null;
  engagement_state_override?: number | null;
  partner_approval_status?: string | null;
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
  funcion: number | null;
  start_date: string | null;
  end_date: string | null;
  engagement_state_override: number | null;
  partner_approval_status?: string | null;
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
    funcion: row.funcion,
    start_date: row.start_date,
    end_date: row.end_date,
    engagement_state_override: row.engagement_state_override,
    partner_approval_status: row.partner_approval_status,
    client: row.client_id
      ? { client_id: row.client_id, client_legal_name: row.client_legal_name ?? "" }
      : null,
  };
}

// FEAT 0602-135: excluye encargos cuyo override manual (6 Cancelado, 7 Finalizado, 8
// Rechazado, 9 Congelado) impide cargar horas. El RPC ya los excluye en el WHERE; se
// reaplica en JS para que las 3 pantallas queden consistentes con engagementStatus.ts.
// BUG 1028-217: con fecha de referencia, un Finalizado (7) sigue siendo cargable si su fin cae
// en esa fecha o después -- la fecha manda, no el estado (mismo criterio que el RPC).
function isLoggable(e: LoggableEngagement, refDate?: string): boolean {
  if (!e.work_order_required && e.funcion != null && e.funcion !== 1 && e.partner_approval_status !== "approved") {
    return false;
  }
  const override = e.engagement_state_override;
  if (override == null || canLogHours(override as EngagementState)) return true;
  return (
    override === EngagementState.Finalizado &&
    !!refDate &&
    !!e.end_date &&
    e.end_date >= refDate
  );
}

export interface UseLoggableEngagementsOptions {
  /**
   * BUG 1028-217: fecha (yyyy-MM-dd) desde la que se quiere cargar. Con ella también vuelven
   * los Finalizados cuyo end_date >= refDate. Sin ella, la lista es la de siempre.
   */
  refDate?: string;
  /**
   * BUG 1028-217: deja solo los encargos cuyo rango incluye refDate (pantallas de un solo día:
   * Tracker, Carga Manual, Edición). La Hoja de Tiempo no lo usa: recorta por semana en la grilla.
   */
  onlyCoveringRefDate?: boolean;
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
  const { refDate, onlyCoveringRefDate = false, enabled = true, staleTime } = options;

  return useQuery({
    queryKey,
    staleTime,
    queryFn: async () => {
      const { data, error } = refDate
        ? await supabase.rpc("list_loggable_engagements" as never, { p_ref_date: refDate } as never)
        : await supabase.rpc("list_loggable_engagements" as never);
      if (error) throw error;
      const rows = ((data || []) as unknown) as LoggableEngagementRow[];
      let engagements = rows.map(toLoggableEngagement).filter((e) => isLoggable(e, refDate));
      if (onlyCoveringRefDate && refDate) {
        engagements = engagements.filter((e) => engagementCoversDate(e, refDate));
      }
      return engagements;
    },
    enabled,
  });
}

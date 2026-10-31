import { useLoggableEngagements } from "@/hooks/useLoggableEngagements";

/**
 * BUG 0828-186: encargos elegibles para cargar horas en el Tracker, vía el RPC
 * list_loggable_engagements (SECURITY DEFINER, gateado por time_entry.create) -- sin filtro
 * de asignación por diseño. Excluye internos/administrativos (Tracker-only, a diferencia de
 * useManualEntryEngagements que sí los incluye).
 * BUG 1028-217: con refDate (yyyy-MM-dd) deja solo los encargos cuyo rango incluye esa fecha,
 * Finalizados incluidos -- misma regla que la Hoja de Tiempo.
 */
export function useApprovedEngagements(refDate?: string) {
  return useLoggableEngagements(["approved-engagements-for-tracker", refDate], {
    refDate,
    onlyCoveringRefDate: true,
    excludeInternal: true,
  });
}

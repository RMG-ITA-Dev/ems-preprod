import { useLoggableEngagements } from "@/hooks/useLoggableEngagements";

/**
 * Engagement list for the manual timer entry dialog.
 * BUG 0828-186: vía el RPC list_loggable_engagements (SECURITY DEFINER, gateado por
 * time_entry.create) -- sin filtro de asignación por diseño. Includes internal/ADMIN
 * engagements (unlike useApprovedEngagements which is tracker-only).
 * Uses a dedicated query key to avoid cache coupling with the stopwatch hook.
 * BUG 1028-217: con refDate (yyyy-MM-dd) deja solo los encargos cuyo rango incluye esa fecha,
 * Finalizados incluidos -- misma regla que la Hoja de Tiempo.
 */
export function useManualEntryEngagements(refDate?: string) {
  return useLoggableEngagements(["engagements-for-manual-entry", refDate], {
    refDate,
    onlyCoveringRefDate: true,
  });
}

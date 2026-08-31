import { useLoggableEngagements } from "@/hooks/useLoggableEngagements";

/**
 * BUG 0828-186: encargos elegibles para cargar horas en el Tracker, vía el RPC
 * list_loggable_engagements (SECURITY DEFINER, gateado por time_entry.create) -- sin filtro
 * de asignación por diseño. Excluye internos/administrativos (Tracker-only, a diferencia de
 * useManualEntryEngagements que sí los incluye).
 */
export function useApprovedEngagements() {
  return useLoggableEngagements(["approved-engagements-for-tracker"], {
    excludeInternal: true,
  });
}

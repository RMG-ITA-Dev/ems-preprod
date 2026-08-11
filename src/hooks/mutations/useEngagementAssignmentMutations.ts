import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import i18n from "@/i18n";
import { handleError } from "@/lib/error-handler";
import {
  SCHEDULER_GAPS_KEY,
  SCHEDULER_L1_KEY,
  SCHEDULER_STAFF_LOAD_KEY,
  SCHEDULER_STAFF_TIMELINE_KEY,
  SCHEDULER_TIMESHEET_AUTHZ_KEY,
} from "@/hooks/scheduler/keys";
import {
  computeAssignmentDiff,
  rpcRowToDraft,
  type AssignmentDraft,
  type PersistedAssignment,
  type RpcAssignmentRow,
} from "@/lib/engagementAssignments";

// Fase 5 — thin wrapper de la RPC transaccional `save_engagement_assignments`
// (supabase/migrations/20260727130000_scheduler_fase2_rpc_save_engagement_assignments.sql,
// enmendada en bugs/scheduler/fase_5/plan_v2.md). UNA sola llamada por operación: el diff
// (soft-delete/update/insert) se computa client-side con el helper puro y se envía completo — la
// BD hace atómicamente soft-delete -> update -> insert -> overlap, y revierte TODO si algo falla
// (nunca un guardado parcial). No se implementa el guardado secuencial cliente-side del scheduler
// de referencia.
//
// save_engagement_assignments no está todavía en src/integrations/supabase/types.ts (falta
// category_id y la RPC misma) — se invoca con el mismo escape (supabase as any) que
// useWorkOrderStaffingMutations.ts ya usa para save_wo_staffing.

export type { AssignmentDraft };

export interface SaveAssignmentsInput {
  engagementId: string;
  current: AssignmentDraft[];
  original: PersistedAssignment[];
  /**
   * assignment_ids que el usuario eliminó explícitamente. El borrado nunca se infiere de la
   * ausencia — `original` es un snapshot de query en movimiento y una fila agregada
   * concurrentemente por otro usuario no debe barrerse.
   */
  deletedIds: string[];
}

// Tokens EAS_* documentados en la RPC (incl. las enmiendas de Fase 5: EAS_ENGAGEMENT_RANGE,
// EAS_STAFF_INELIGIBLE) -> clave i18n. Errores desconocidos caen en el manejador centralizado
// (handleError), que ya muestra su propio toast.
const EAS_ERROR_I18N_KEY: Record<string, string> = {
  EAS_ENGAGEMENT_NOT_FOUND: "engagement.assignments.errors.engagementNotFound",
  EAS_DENIED: "engagement.assignments.errors.denied",
  EAS_ENGAGEMENT_LOCKED: "engagement.assignments.errors.locked",
  EAS_MISSING_FIELD: "engagement.assignments.errors.requiredFields",
  EAS_DATE_RANGE: "engagement.assignments.errors.dateRange",
  EAS_ENGAGEMENT_RANGE: "engagement.assignments.errors.outOfEngagementRange",
  EAS_HOURS_RANGE: "engagement.assignments.errors.numericRange",
  EAS_ALLOCATION_RANGE: "engagement.assignments.errors.numericRange",
  EAS_CATEGORY_FOREIGN_SERVICE: "engagement.assignments.errors.categoryForeignService",
  EAS_STAFF_INELIGIBLE: "engagement.assignments.errors.staffIneligible",
  EAS_OVERLAP: "scheduler.errors.overlap",
};

function findEasErrorCode(error: unknown): string | undefined {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error);
  return Object.keys(EAS_ERROR_I18N_KEY).find((code) => message.includes(code));
}

/** Thin wrapper de la RPC transaccional `save_engagement_assignments` — sin DML directa, sin guardado secuencial. */
export function useSaveEngagementAssignments() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ engagementId, current, original, deletedIds }: SaveAssignmentsInput) => {
      const { toSoftDelete, toUpdate, toInsert } = computeAssignmentDiff({
        current,
        original,
        deletedIds,
      });
      const p_upserts = [
        ...toUpdate.map((d) => ({
          assignment_id: d.assignment_id,
          staff_id: d.staff_id,
          category_id: d.category_id,
          start_date: d.start_date,
          end_date: d.end_date,
          hours_per_week: d.hours_per_week,
          allocation_percent: d.allocation_percent,
          notes: d.notes || null,
        })),
        ...toInsert.map((d) => ({
          assignment_id: d.key, // insert idempotente por UUID cliente — la BD lo adopta si no existe
          staff_id: d.staff_id,
          category_id: d.category_id,
          start_date: d.start_date,
          end_date: d.end_date,
          hours_per_week: d.hours_per_week,
          allocation_percent: d.allocation_percent,
          notes: d.notes || null,
        })),
      ];
      // status/created_by intencionalmente omitidos — el DEFAULT de la BD gobierna (PROPOSED).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("save_engagement_assignments", {
        p_engagement_id: engagementId,
        p_upserts,
        p_deleted_ids: toSoftDelete,
      });
      if (error) throw error;
      return (data ?? []) as RpcAssignmentRow[];
    },
    onSettled: () => {
      // Sitio ÚNICO de invalidación, por prefijo (compatible con keys viewer-scoped como
      // ["engagementAssignments", viewerId, engagementId]). Los componentes (Card/Sheet/Gantt)
      // NUNCA invalidan por su cuenta — evita doble-invalidación; sobre-invalidar una query sin
      // observadores es no-op en React Query. Se ejecuta en éxito Y en fallo: un fallo a mitad de
      // camino puede haber escrito parcialmente del lado del servidor de otra operación anterior.
      void queryClient.invalidateQueries({ queryKey: ["engagementAssignments"] });
      void queryClient.invalidateQueries({ queryKey: [SCHEDULER_L1_KEY] });
      void queryClient.invalidateQueries({ queryKey: [SCHEDULER_STAFF_LOAD_KEY] });
      void queryClient.invalidateQueries({ queryKey: [SCHEDULER_STAFF_TIMELINE_KEY] });
      void queryClient.invalidateQueries({ queryKey: [SCHEDULER_GAPS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [SCHEDULER_TIMESHEET_AUTHZ_KEY] });
    },
    onError: (error: unknown) => {
      const code = findEasErrorCode(error);
      if (code) {
        toast.error(i18n.t(EAS_ERROR_I18N_KEY[code]));
        return;
      }
      handleError(error, {
        toastTitle: i18n.t("engagement.assignments.errors.persistFailed"),
        context: { operation: "saveEngagementAssignments" },
      });
    },
  });

  return {
    saveAssignments: (input: SaveAssignmentsInput) => mutation.mutateAsync(input),
    isSaving: mutation.isPending,
  };
}

export { rpcRowToDraft };

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/error-handler";
import { toast } from "sonner";
import i18n from "@/i18n";
import {
  buildStaffingPayload,
  type StaffingProficiencyLevel,
  type StaffingRequirementInput,
} from "@/lib/workOrderStaffing";

// save_wo_staffing (Fase 2, supabase/migrations/20260727120000_...) no está
// todavía en src/integrations/supabase/types.ts — se invoca con el mismo
// escape (supabase as any) que development ya usa para tablas/RPCs aún no
// tipadas (ver useEmsData.ts). No existe un export `supabaseUntyped` en
// @/integrations/supabase/client; el cast se acota aquí, en el borde de la
// llamada RPC, en vez de introducir un nuevo export.

export interface SavedStaffingRequirementSkill {
  skill_id: string;
  min_proficiency_level: StaffingProficiencyLevel;
}

export interface SavedStaffingRequirement {
  id: string;
  category_id: string;
  staff_count: number;
  skills: SavedStaffingRequirementSkill[];
}

// Mapea los tokens WOS_* que lanza save_wo_staffing a una clave i18n. Errores
// desconocidos caen en el manejador centralizado (handleError), que ya
// muestra su propio toast — cada rama emite un único mensaje.
const WOS_ERROR_I18N_KEY: Record<string, string> = {
  WOS_WO_NOT_FOUND: "workOrders.staffingRequirements.errors.workOrderNotFound",
  WOS_DENIED: "workOrders.staffingRequirements.errors.denied",
  WOS_WO_LOCKED: "workOrders.staffingRequirements.errors.locked",
  WOS_REQUIREMENT_DUPLICATE: "workOrders.staffingRequirements.errors.categoryDuplicate",
  WOS_SKILL_DUPLICATE: "workOrders.staffingRequirements.errors.skillDuplicate",
  WOS_STAFF_COUNT_RANGE: "workOrders.staffingRequirements.errors.staffCountRange",
  WOS_PROFICIENCY_INVALID: "workOrders.staffingRequirements.errors.proficiencyInvalid",
  WOS_CATEGORY_FOREIGN_SERVICE: "workOrders.staffingRequirements.errors.categoryForeignService",
};

function findWosErrorCode(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  return Object.keys(WOS_ERROR_I18N_KEY).find((code) => message.includes(code));
}

/** Thin wrapper de la RPC transaccional `save_wo_staffing` — sin DML directa. */
export function useSaveWorkOrderStaffing() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const viewerId = user?.id;

  return useMutation({
    mutationFn: async ({
      woId,
      requirements,
    }: {
      woId: string;
      requirements: StaffingRequirementInput[];
    }) => {
      const p_requirements = buildStaffingPayload(requirements);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("save_wo_staffing", {
        p_wo_id: woId,
        p_requirements,
      });
      if (error) throw error;
      return (data ?? []) as SavedStaffingRequirement[];
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["workOrderStaffingRequirements", viewerId, variables.woId],
      });
    },
    onError: (error: unknown) => {
      const code = findWosErrorCode(error);
      if (code) {
        toast.error(i18n.t(WOS_ERROR_I18N_KEY[code]));
        return;
      }
      handleError(error, {
        toastTitle: i18n.t("workOrders.staffingRequirements.errors.persistFailed"),
        context: { operation: "saveWorkOrderStaffing" },
      });
    },
  });
}

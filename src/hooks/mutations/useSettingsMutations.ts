import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createMutationErrorHandler } from "@/lib/error-handler";

// Claves que leen las alarmas de la campana (notif_timesheet_window_start()).
const NOTIFICATION_WINDOW_KEYS = ["TS_ALERT_WINDOW_WEEKS", "TS_TRACKING_START_DATE"];

export function useUpdateGlobalSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      // Upsert, not update-only: si la clave todavía no existe en global_settings (hallazgo de
      // review de PR #310 — LANGUAGE/ALLOW_WEEKEND_TRACKING faltaban en el seed y un update
      // sobre 0 filas + .single() rompía el guardado completo de Configuración), la crea en vez
      // de fallar con "no rows returned".
      const { data: result, error } = await supabase
        .from("global_settings")
        .upsert({ setting_key: key, setting_value: value }, { onConflict: "setting_key" })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: (_data, { key }) => {
      queryClient.invalidateQueries({ queryKey: ["global_settings"] });
      // 1112-227: la ventana de alarmas recorta los contadores de horas de la campana. Sin esto
      // la campana seguía con los números viejos hasta el próximo foco o el refresco de 5 min.
      // Va acá y no en Settings para cubrir también un guardado parcial (una clave posterior
      // que falla no deja a esta sin refrescar).
      if (NOTIFICATION_WINDOW_KEYS.includes(key)) {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
      // No toast here (1028-215): Settings saves one key per call, so a per-key toast
      // stacked N copies. The caller shows a single "settingsSaved" when it finishes.
    },
    onError: createMutationErrorHandler("updating setting"),
  });
}

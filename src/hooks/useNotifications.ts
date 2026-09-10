import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { logger } from "@/lib/logger";
import {
  EMPTY_PAYLOAD,
  normalizePayload,
  type NotificationsPayload,
} from "@/lib/notifications";

/**
 * NOTIFICACIONES — FASE 1: lectura de la bandeja del usuario.
 *
 * Consume `get_my_notifications()`, que devuelve eventos + contadores + no leídas en una sola
 * llamada. Una sola query, no N: el panel se refresca cada 5 minutos para todos los usuarios
 * conectados, así que sumar consultas acá se paga caro.
 *
 * La cadencia es idéntica a `useStaffingAlerts` a propósito — mientras el panel viejo y el
 * nuevo convivan (Fase 2), que ambos se refresquen a la vez evita que muestren estados
 * distintos del mismo hecho.
 *
 * El nombre del RPC va casteado porque `src/integrations/supabase/types.ts` es autogenerado y
 * no se edita a mano: Lovable lo regenera al aplicar la migración, y recién ahí se puede
 * quitar el cast. Mismo patrón que `useAuthorization`.
 */
export function useNotifications() {
  const { data: staffRecord } = useCurrentStaff();

  return useQuery({
    queryKey: ["notifications", staffRecord?.staff_id],
    queryFn: async (): Promise<NotificationsPayload> => {
      const { data, error } = await supabase.rpc(
        "get_my_notifications" as never,
      );

      if (error) {
        logger.error("Failed to load notifications:", error.message);
        throw error;
      }

      return normalizePayload(data);
    },
    enabled: !!staffRecord?.staff_id,
    placeholderData: EMPTY_PAYLOAD,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

/**
 * Marca eventos como leídos.
 *
 * Sólo aplica a los de tipo evento: los contadores no tienen "leído" — bajan cuando el
 * usuario resuelve lo que los produjo, no cuando abre el panel.
 *
 * El backend ignora ids ajenos (filtra por `recipient_staff_id = get_my_staff_id()`), así que
 * el peor caso de un id equivocado es que no pase nada.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return 0;

      const { data, error } = await supabase.rpc(
        "mark_notifications_read" as never,
        { p_ids: ids } as never,
      );

      if (error) {
        logger.error("Failed to mark notifications read:", error.message);
        throw error;
      }

      return (data as number) ?? 0;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

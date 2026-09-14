import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { toast } from "sonner";
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
 *
 * Sobre el refresco: los 5 minutos son el piso, no el mecanismo. Una notificación nueva llega
 * por Realtime y el panel se actualiza solo; el intervalo queda para lo que Realtime no puede
 * ver —los contadores, que se calculan sobre `fund_requests`, `timesheet_line_approvals`, etc.,
 * no sobre `public.notifications`— y como red si la suscripción se cae.
 */
export function useNotifications() {
  const { data: staffRecord } = useCurrentStaff();
  const staffId = staffRecord?.staff_id;
  const queryClient = useQueryClient();

  // Realtime sobre la bandeja propia. Sin esto hay que recargar la página para ver un aviso
  // recién emitido, que es justo lo que se reportó probando.
  //
  // Sólo INSERT: el "leído" y el descarte los origina esta misma pestaña, y esas mutaciones ya
  // invalidan la query por su cuenta. Escuchar DELETE además obligaría a publicar la fila vieja
  // completa (`REPLICA IDENTITY FULL`) para poder filtrarla por destinatario.
  //
  // El filtro por `recipient_staff_id` es para no despertar a todo el mundo en cada emisión;
  // quien manda de verdad es la RLS (`notifications_select_own`), que Realtime también aplica.
  //
  // Se invalida y no se escribe la fila en el cache: el payload del panel son eventos YA
  // agrupados y traducidos por `get_my_notifications()`, no filas crudas de la tabla.
  useEffect(() => {
    if (!staffId) return;

    const channel = supabase
      .channel(`notifications:${staffId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_staff_id=eq.${staffId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["notifications", staffId],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffId, queryClient]);

  return useQuery({
    queryKey: ["notifications", staffId],
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
    enabled: !!staffId,
    placeholderData: EMPTY_PAYLOAD,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    // Volver a la pestaña también refresca: cubre los contadores cuando el usuario resolvió
    // lo que los producía en otra pantalla, y el hueco de una suscripción caída.
    refetchOnWindowFocus: true,
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

/**
 * Descarta (BORRA) notificaciones propias — la "x" de cada fila del panel.
 *
 * Borra de verdad y no marca una columna: la fila tiene un solo destinatario, así que es
 * enteramente suya, y el hecho que la originó vive en su propia tabla. Es además lo que hace
 * que el descarte sirva para el tamaño de `public.notifications`, en vez de dejar la limpieza
 * entera en manos del cron de retención.
 *
 * El backend ignora ids ajenos (filtra por `recipient_staff_id = get_my_staff_id()`), igual
 * que `mark_notifications_read`.
 */
export function useDismissNotifications() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return 0;

      const { data, error } = await supabase.rpc(
        "dismiss_notifications" as never,
        { p_ids: ids } as never,
      );

      if (error) {
        logger.error("Failed to dismiss notifications:", error.message);
        throw error;
      }

      return (data as number) ?? 0;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    // A diferencia de marcar leido —que ocurre solo, al cerrar el panel— descartar es un
    // click explicito: si falla, la fila se queda ahi y sin aviso el usuario cree que la x
    // no funciona. Es exactamente lo que paso probando contra un mirror sin el RPC aplicado.
    onError: () => {
      toast.error(t("notifications.dismissError"));
    },
  });
}

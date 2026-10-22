import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cobranzas — la bitácora de una cuota.
 *
 * `wo_installment_events` se escribe sola desde la Fase 1 y nadie la puede editar, pero hasta
 * el 2026-10-21 no se veía en ninguna pantalla: el rastro existía sólo en la base. Esto la
 * saca a la luz, que es lo que hace que un cambio sobre un hecho ya registrado —confirmar y
 * después desconfirmar, reprogramar, corregir una fecha de cobro— deje de ser invisible.
 *
 * Se trae el conjunto completo de la OT en UNA consulta, igual que el hilo de notas y los
 * ajustes: la pantalla necesita el historial de cada fila y pedirlo por cuota multiplicaría
 * las idas al servidor por la cantidad de cuotas.
 */
export type InstallmentEventAction =
  | "status_change"
  | "rescheduled"
  | "confirmation"
  | "adjustment"
  | "payment_date_corrected"
  | "reimbursement_amount_changed";

export interface InstallmentEvent {
  event_id: string;
  /** Orden REAL de inserción: `created_at` empata dentro de una misma transacción. */
  seq: number;
  installment_id: string;
  wo_id: string;
  action: InstallmentEventAction;
  from_status: string | null;
  to_status: string | null;
  old_date: string | null;
  new_date: string | null;
  amount: number | null;
  currency: string | null;
  reason: string | null;
  actor_staff_id: string | null;
  created_at: string;
  actor?: { first_name: string | null; last_name: string | null } | null;
}

export function useInstallmentEvents(woId: string | undefined) {
  return useQuery({
    queryKey: ["installment_events", woId],
    queryFn: async (): Promise<InstallmentEvent[]> => {
      const { data, error } = await supabase
        .from("wo_installment_events" as never)
        .select("*, actor:staff!wo_installment_events_actor_staff_id_fkey(first_name, last_name)")
        .eq("wo_id", woId!)
        // Por `seq` y no por fecha: dentro de una transacción —"el cliente no confirma", que
        // además reprograma— los `created_at` son idénticos y el orden se perdería.
        .order("seq", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as InstallmentEvent[];
    },
    enabled: !!woId,
  });
}

/** Los eventos de UNA cuota, del más reciente al más viejo, a partir del conjunto ya traído. */
export function eventsForInstallment(
  events: InstallmentEvent[] | undefined,
  installmentId: string | null | undefined,
): InstallmentEvent[] {
  if (!events || !installmentId) return [];
  return events.filter((e) => e.installment_id === installmentId).slice().reverse();
}

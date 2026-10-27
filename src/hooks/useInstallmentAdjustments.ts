import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cobranzas Fase 9 (issue #352) — ajustes sobre las cuotas de una orden de trabajo.
 *
 * Un ajuste no pisa el monto de la cuota: es una línea aparte. El monto es el contrato con el
 * cliente, y sobreescribirlo borraría la diferencia entre lo pactado y lo que finalmente se
 * cobra, que es justo lo que después hay que explicar.
 *
 * Se trae el conjunto completo de la OT en UNA consulta, igual que el hilo de notas: la
 * pantalla necesita el total por cuota en cada fila, y pedirlo fila por fila multiplicaría las
 * idas al servidor por la cantidad de cuotas.
 *
 * Los retirados vienen también (`deleted_at` no nulo). La pantalla los muestra tachados: un
 * descuento que estuvo vigente explica por qué la cuota cambió de monto a cobrar entre dos
 * momentos. Lo que no hacen es sumar.
 */
export type AdjustmentType = "descuento" | "diferencia_cambio";

export interface InstallmentAdjustment {
  adjustment_id: string;
  installment_id: string;
  wo_id: string;
  adjustment_type: AdjustmentType;
  amount: number;
  currency: string;
  reason: string;
  created_by_staff_id: string | null;
  created_at: string;
  deleted_at: string | null;
  author?: { first_name: string | null; last_name: string | null } | null;
}

export function useInstallmentAdjustments(woId: string | undefined) {
  return useQuery({
    queryKey: ["installment_adjustments", woId],
    queryFn: async (): Promise<InstallmentAdjustment[]> => {
      const { data, error } = await supabase
        .from("wo_installment_adjustments" as never)
        .select("*, author:staff!wo_installment_adjustments_created_by_fkey(first_name, last_name)")
        .eq("wo_id", woId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as InstallmentAdjustment[]).map((a) => ({
        ...a,
        // NUMERIC llega como string desde PostgREST: se convierte una vez, acá, para que
        // ninguna pantalla haga aritmética con texto.
        amount: Number(a.amount),
      }));
    },
    enabled: !!woId,
  });
}

/** Los ajustes de UNA cuota, a partir del conjunto ya traído. */
export function adjustmentsForInstallment(
  adjustments: InstallmentAdjustment[] | undefined,
  installmentId: string | null | undefined,
): InstallmentAdjustment[] {
  if (!adjustments || !installmentId) return [];
  return adjustments.filter((a) => a.installment_id === installmentId);
}

/**
 * Lo que los ajustes vigentes suman o restan, EN UNA MONEDA. La moneda es obligatoria y no un
 * detalle: un descuento va en la moneda de la cuota y una diferencia de cambio va en Bs, así
 * que sumarlos a ciegas daría un número que no significa nada. Espejo exacto de
 * `public.installment_adjustments_total()`.
 */
export function adjustmentsTotal(
  adjustments: InstallmentAdjustment[] | undefined,
  installmentId: string | null | undefined,
  currency: string,
): number {
  return adjustmentsForInstallment(adjustments, installmentId)
    .filter((a) => a.deleted_at === null && a.currency === currency)
    .reduce((sum, a) => sum + a.amount, 0);
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cobranzas Fase 4 (issue #352) — hilo de notas de una orden de trabajo.
 *
 * Lo que el requisito original llamaba "excepción para revisar gerente y socio" resultó ser
 * esto (decisión del operador Q6): el gerente o el socio dejan por escrito algo que
 * Contabilidad tiene que leer al facturar o al cobrar, y Contabilidad responde por el mismo
 * canal. Por eso no hay dos funcionalidades (la "excepción" y los "comentarios de
 * contabilidad") sino una.
 *
 * `installment_id` null = la nota es del plan entero, no de una cuota (decisión Q33).
 */
export interface InstallmentNote {
  note_id: string;
  wo_id: string;
  installment_id: string | null;
  author_staff_id: string | null;
  author_role: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author?: { first_name: string | null; last_name: string | null } | null;
}

/**
 * Trae el hilo completo de la OT en UNA consulta: el banner del plan y los contadores por
 * cuota salen del mismo arreglo, así que pedirlo por cuota multiplicaría las idas al servidor
 * por la cantidad de filas de la tabla.
 *
 * Las notas borradas no vienen: la policy de lectura ya filtra por `deleted_at`, y el filtro
 * de acá es la misma regla dicha dos veces para que una consulta con `service_role` (sin RLS)
 * tampoco las muestre.
 */
export function useInstallmentNotes(woId: string | undefined) {
  return useQuery({
    queryKey: ["installment_notes", woId],
    queryFn: async (): Promise<InstallmentNote[]> => {
      const { data, error } = await supabase
        .from("wo_installment_notes" as never)
        .select("*, author:staff!wo_installment_notes_author_staff_id_fkey(first_name, last_name)")
        .eq("wo_id", woId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as InstallmentNote[];
    },
    enabled: !!woId,
  });
}

/** Las notas de UNA cuota, a partir del hilo ya traído. */
export function notesForInstallment(
  notes: InstallmentNote[] | undefined,
  installmentId: string | null | undefined,
): InstallmentNote[] {
  if (!notes || !installmentId) return [];
  return notes.filter((n) => n.installment_id === installmentId);
}

/** Las notas del plan entero (las que no cuelgan de ninguna cuota). */
export function planLevelNotes(notes: InstallmentNote[] | undefined): InstallmentNote[] {
  return (notes ?? []).filter((n) => n.installment_id === null);
}

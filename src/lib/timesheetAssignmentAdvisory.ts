// Advisory de asignaciones (Fase 6). Puro; comparación de strings ISO EXCLUSIVAMENTE —
// nunca construir un Date desde start_date/end_date (BUG 0220-59: las fechas civiles
// se desplazan por UTC en el constructor de Date).

export interface AssignmentWindow {
  start_date: string; // YYYY-MM-DD, nombres de columna de la RPC
  end_date: string;   // YYYY-MM-DD
}

export type SegmentsByEngagement = Map<string, AssignmentWindow[]>;

/** True si dateStr está cubierto por al menos una ventana. Límites inclusivos.
 *  `undefined` (engagement ausente de un mapa autoritativo) = no cubierto — el
 *  gating de disponibilidad es responsabilidad del caller. */
export function isDateInAnyWindow(
  windows: AssignmentWindow[] | undefined,
  dateStr: string,
): boolean {
  if (!windows) return false;
  return windows.some((w) => w.start_date <= dateStr && dateStr <= w.end_date);
}

/** Conteo para el banner semanal y el toast post-submit. Mapa `null`/`undefined`
 *  = datos no disponibles -> 0 (fail-open). */
export function countUnauthorizedEntries(
  entries: Array<{ engagement_id: string; date_worked: string; hours_logged: number }>,
  windows: SegmentsByEngagement | null | undefined,
): number {
  if (!windows) return 0;
  let n = 0;
  for (const e of entries) {
    if (e.hours_logged > 0 && !isDateInAnyWindow(windows.get(e.engagement_id), e.date_worked)) {
      n++;
    }
  }
  return n;
}

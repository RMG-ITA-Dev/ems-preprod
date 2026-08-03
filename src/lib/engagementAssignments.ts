// Fase 5 — Engagement Staff Assignments: pure grid/save logic.
//
// Adaptado de `sruizmier-scheduler-v3` (src/lib/engagementAssignments.ts) para el contrato de
// la RPC `save_engagement_assignments` enmendado en bugs/scheduler/fase_5/plan_v2.md (O1/O4/O6/
// O7): el cliente genera un UUID estable por draft (`key`) que SIEMPRE se envía como
// `assignment_id` — presente en la BD -> UPDATE; ausente -> INSERT con ese mismo id (retry
// idempotente). No hay imports de React, Supabase, ni llamadas de red.

export interface AssignmentDraft {
  /**
   * UUID generado UNA SOLA VEZ por el cliente (crypto.randomUUID()), estable entre reintentos.
   * Dobla como React key y como el `assignment_id` enviado en la RPC para inserts idempotentes.
   */
  key: string;
  /** Presente cuando el draft refleja una fila ya persistida (igual a `key` en ese caso). */
  assignment_id?: string;
  staff_id: string;
  category_id: string;
  start_date: string; // yyyy-MM-dd
  end_date: string; // yyyy-MM-dd
  hours_per_week: number;
  allocation_percent: number;
  notes: string;
}

// Subconjunto estructural de EngagementAssignmentRow (useEmsData) — declarado aquí para que
// este módulo siga siendo dependency-free.
export interface PersistedAssignment {
  assignment_id: string;
  staff_id: string;
  category_id: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  allocation_percent: number;
  notes: string | null;
}

// Forma de una fila devuelta por la RPC save_engagement_assignments (jsonb_build_object del
// paso 7 de la función) — estado autoritativo que el caller adopta tras un guardado exitoso.
export interface RpcAssignmentRow {
  assignment_id: string;
  staff_id: string;
  category_id: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  allocation_percent: number;
  status: string;
  notes: string | null;
}

/** Adopta una fila devuelta por la RPC como draft/baseline — reemplaza el UUID cliente por el id autoritativo (son el mismo valor salvo colisión, imposible en la práctica). */
export function rpcRowToDraft(row: RpcAssignmentRow): AssignmentDraft {
  return {
    key: row.assignment_id,
    assignment_id: row.assignment_id,
    staff_id: row.staff_id,
    category_id: row.category_id,
    start_date: row.start_date,
    end_date: row.end_date,
    hours_per_week: Number(row.hours_per_week),
    allocation_percent: Number(row.allocation_percent),
    notes: row.notes ?? "",
  };
}

export function assignmentChanged(
  draft: AssignmentDraft,
  orig: PersistedAssignment
): boolean {
  return (
    draft.staff_id !== orig.staff_id ||
    draft.category_id !== orig.category_id ||
    draft.start_date !== orig.start_date ||
    draft.end_date !== orig.end_date ||
    Number(draft.hours_per_week) !== Number(orig.hours_per_week) ||
    Number(draft.allocation_percent) !== Number(orig.allocation_percent) ||
    (draft.notes || null) !== (orig.notes || null)
  );
}

export interface AssignmentDiffInput {
  current: AssignmentDraft[];
  original: PersistedAssignment[];
  /**
   * assignment_ids que el usuario eliminó explícitamente. El borrado NUNCA se infiere de la
   * ausencia: `original` es un snapshot de query en movimiento, así que una fila agregada
   * concurrentemente por otro usuario (presente en un refetch de fondo pero no en los drafts
   * locales) no debe ser arrastrada por el soft-delete.
   */
  deletedIds: string[];
}

export interface AssignmentDiff {
  /** Filas explícitamente eliminadas a soft-delete. */
  toSoftDelete: string[];
  /** Drafts persistidos cuyos campos difieren de la última fila del servidor. */
  toUpdate: AssignmentDraft[];
  /** Drafts nuevos (sin assignment_id) a insertar — el cliente ya generó su `key`/id estable. */
  toInsert: AssignmentDraft[];
}

export function computeAssignmentDiff({
  current,
  original,
  deletedIds,
}: AssignmentDiffInput): AssignmentDiff {
  const originalById = new Map(original.map((o) => [o.assignment_id, o]));
  const currentIds = new Set(
    current.map((d) => d.assignment_id).filter((id): id is string => !!id)
  );

  // Solo eliminaciones explícitas; guarda contra un id que de algún modo siga en la grilla.
  // Ids que ya no están en `original` (borrados en otro lado) se conservan — re-soft-deletar es
  // idempotente, así que un reintento es seguro.
  const toSoftDelete = Array.from(new Set(deletedIds)).filter(
    (id) => !currentIds.has(id)
  );

  const toUpdate = current.filter((d) => {
    if (!d.assignment_id) return false;
    const orig = originalById.get(d.assignment_id);
    // Un draft persistido cuya fila del servidor desapareció (borrada en otro lado) se omite en
    // vez de reescribirla a ciegas.
    return !!orig && assignmentChanged(d, orig);
  });

  const toInsert = current.filter((d) => !d.assignment_id);

  return { toSoftDelete, toUpdate, toInsert };
}

// Cotas numéricas — decisión de Fase 5 (issue + RPC): estrictamente > 0, con tope inclusive.
// Admiten decimales (a diferencia del `min=1` heredado del scheduler de referencia).
export const HOURS_PER_WEEK_MAX = 80;
export const ALLOCATION_PERCENT_MAX = 100;

export interface AssignmentValidation {
  /** Draft keys sin staff, categoría, o alguna de las dos fechas. */
  missing: Set<string>;
  /** Draft keys con end_date < start_date. */
  badDates: Set<string>;
  /** Draft keys con horas/allocation fuera de las cotas aceptadas por la BD. */
  badNumbers: Set<string>;
  valid: boolean;
}

export function validateAssignmentDrafts(
  drafts: AssignmentDraft[]
): AssignmentValidation {
  const missing = new Set<string>();
  const badDates = new Set<string>();
  const badNumbers = new Set<string>();

  for (const d of drafts) {
    if (!d.staff_id || !d.category_id || !d.start_date || !d.end_date) {
      missing.add(d.key);
      continue;
    }
    if (d.end_date < d.start_date) {
      badDates.add(d.key);
    }
    const hours = Number(d.hours_per_week);
    const alloc = Number(d.allocation_percent);
    if (
      !Number.isFinite(hours) ||
      hours <= 0 ||
      hours > HOURS_PER_WEEK_MAX ||
      !Number.isFinite(alloc) ||
      alloc <= 0 ||
      alloc > ALLOCATION_PERCENT_MAX
    ) {
      badNumbers.add(d.key);
    }
  }

  return {
    missing,
    badDates,
    badNumbers,
    valid: missing.size === 0 && badDates.size === 0 && badNumbers.size === 0,
  };
}

/**
 * El objetivo del scheduler permite varios segmentos por (engagement, staff) SOLO cuando no se
 * solapan — un overlap duplica al staff en los rollups de staffing. La BD no tiene un exclusion
 * constraint (lo enforce la RPC, EAS_OVERLAP), así que las superficies de guardado del cliente
 * (Card, Sheet, drag del Gantt) rechazan drafts solapados como primera barrera de UX.
 *
 * Devuelve el assignment_id del primer segmento ACTIVO del mismo staff que se solapa con
 * [start_date, end_date] del draft (inclusivo), o null si no hay conflicto. La propia fila del
 * draft se excluye por assignment_id.
 */
export function findStaffSegmentOverlap(
  draft: Pick<AssignmentDraft, "assignment_id" | "staff_id" | "start_date" | "end_date">,
  existing: Array<
    Pick<PersistedAssignment, "assignment_id" | "staff_id" | "start_date" | "end_date">
  >
): string | null {
  if (!draft.staff_id || !draft.start_date || !draft.end_date) return null;
  for (const row of existing) {
    if (row.assignment_id === draft.assignment_id) continue;
    if (row.staff_id !== draft.staff_id) continue;
    // Intersección inclusiva de rango de fechas (yyyy-MM-dd compara lexicográficamente).
    if (draft.start_date <= row.end_date && row.start_date <= draft.end_date) {
      return row.assignment_id;
    }
  }
  return null;
}

/**
 * Nombre a mostrar para el staff de un assignment. Prefiere la lista de staff activo; recurre al
 * nombre embebido en la fila persistida para que un staff que se volvió inactivo siga
 * mostrándose (en vez de un "Seleccionar staff..." vacío que oculta el valor guardado).
 */
export function resolveStaffLabel(
  staffId: string,
  activeNames: Map<string, string>,
  persistedNames: Map<string, string>
): string | undefined {
  if (!staffId) return undefined;
  return activeNames.get(staffId) ?? persistedNames.get(staffId);
}

/**
 * Categoría histórica incompatible (issue §6 / plan_v2.md §3): una fila persistida cuya
 * categoría no pertenece al conjunto de categorías válidas del servicio del Engagement. Se usa
 * para marcar error inline y bloquear el guardado hasta corregir — nunca para eliminar la fila
 * automáticamente. Un `validCategoryIds` vacío (servicio sin resolver aún) no marca nada.
 */
export function findForeignCategoryKeys(
  drafts: AssignmentDraft[],
  validCategoryIds: ReadonlySet<string>
): Set<string> {
  const result = new Set<string>();
  if (validCategoryIds.size === 0) return result;
  for (const d of drafts) {
    if (d.category_id && !validCategoryIds.has(d.category_id)) {
      result.add(d.key);
    }
  }
  return result;
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { isSchedulerEnabled } from "@/lib/schedulerFeature";
import { SCHEDULER_TIMESHEET_AUTHZ_KEY } from "./keys";
import type { AssignmentWindow, SegmentsByEngagement } from "@/lib/timesheetAssignmentAdvisory";

// TODO(types): borrar esta fachada en cuanto Lovable regenere src/integrations/supabase/types.ts
// con get_staff_assignment_segments. El issue prohíbe editar types.ts a mano y la generación
// ocurre fuera de este repo (docs/scheduler/fase_2/scheduler-fase-2-verificacion.md:119).
// Acotada al módulo a propósito: no es un export global.
interface AssignmentSegmentRow {
  engagement_id: string;
  start_date: string;
  end_date: string;
}
type SegmentsRpcResult = { data: AssignmentSegmentRow[] | null; error: { message?: string; code?: string } | null };
type SegmentsRpc = {
  rpc(
    fn: "get_staff_assignment_segments",
    args: { p_staff_id: string; p_week_start: string; p_week_end: string },
  ): { abortSignal(signal: AbortSignal): PromiseLike<SegmentsRpcResult> };
};
const segmentsClient = supabase as unknown as SegmentsRpc;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fecha civil real en YYYY-MM-DD. Aritmética de strings/números — nunca `new Date(str)`. */
function isRealIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const y = Number(s.slice(0, 4)), mo = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

/** Validación en runtime: una forma inesperada debe APAGAR el advisory, no producir
 *  falsos "sin asignación". Devuelve el Map agrupado, o `null` = advisory off.
 *  Un body `null` exitoso NO es resultado vacío válido para una RPC que devuelve TABLE
 *  (eso es `[]`), así que también falla abierto. */
export function buildSegmentMap(data: unknown): SegmentsByEngagement | null {
  if (!Array.isArray(data)) return null;
  const map: SegmentsByEngagement = new Map();
  for (const row of data) {
    if (!row || typeof row !== "object") return null;
    const { engagement_id, start_date, end_date } = row as Record<string, unknown>;
    if (
      typeof engagement_id !== "string" || !UUID.test(engagement_id) ||
      typeof start_date !== "string" || typeof end_date !== "string" ||
      !isRealIsoDate(start_date) || !isRealIsoDate(end_date) ||
      start_date > end_date   // los strings ISO ordenan cronológicamente
    ) {
      return null;            // nunca un mapa parcial
    }
    const arr = map.get(engagement_id) ?? [];
    arr.push({ start_date, end_date } as AssignmentWindow);
    map.set(engagement_id, arr);
  }
  return map;
}

/**
 * Contrato de datos del advisory (Fase 6):
 *   data === null -> NO DISPONIBLE (denegado / no desplegado / error / forma inesperada)
 *                    -> advisory OFF en todas las superficies; nunca una advertencia,
 *                       nunca un error en el estado de React Query.
 *   data es Map   -> AUTORITATIVO; engagement ausente o sin ventana que cubra => marcar.
 * Toda falla degrada a silencio. La ÚNICA excepción es una cancelación: se relanza para
 * que React Query sea dueño de la cancelación y un fetch abortado nunca se cachee como null.
 */
export function useStaffAssignmentSegments(
  staffId: string | undefined,
  weekStartStr: string | undefined, // lunes canónico; la RPC rechaza otro día (ISODOW=1)
  weekEndStr: string | undefined,   // último día MOSTRADO (span <= 6 respecto de weekStart)
) {
  // El resultado es ESPECÍFICO DEL VIEWER (arms self / firmwide / approver devuelven filas
  // distintas y un viewer ajeno es denegado). El QueryClient es de módulo (App.tsx) y ya no
  // sobrevive intacto a un cambio de identidad in-SPA: SessionCacheGuard (Fase 7, plan v2 §A.4)
  // lo limpia globalmente en cada cambio de cuenta o sign-out. La key con `viewerId` sigue
  // siendo la defensa LOCAL — evita que una respuesta en vuelo de la cuenta anterior se
  // escriba bajo la key de la nueva antes de que el guard global termine de limpiar.
  const { user } = useAuth();
  const viewerId = user?.id;

  return useQuery<SegmentsByEngagement | null>({
    queryKey: [SCHEDULER_TIMESHEET_AUTHZ_KEY, viewerId, staffId, weekStartStr, weekEndStr],
    // Fase 7 (plan v2 §B.4#7): con el flag apagado la RPC no existe — sin
    // este guard, la query dispararía en cada carga de /timesheet y
    // /timesheet/approvals/:id contra un endpoint inexistente.
    enabled: isSchedulerEnabled() && !!viewerId && !!staffId && !!weekStartStr && !!weekEndStr,
    // Tier de autorización: advisory, tolerante a staleness. La invalidación al guardar
    // assignments (useEngagementAssignmentMutations.ts:128) es lo que fuerza el refetch.
    staleTime: 300_000,
    retry: false, // una denegación o una RPC no desplegada no sanan reintentando
    queryFn: async ({ signal }) => {
      try {
        const { data, error } = await segmentsClient
          .rpc("get_staff_assignment_segments", {
            p_staff_id: staffId!,
            p_week_start: weekStartStr!,
            p_week_end: weekEndStr!,
          })
          .abortSignal(signal);

        if (error) {
          // Solo código/clasificación — nunca notas, horas, tokens ni datos de sesión.
          const code = error.code ?? "unknown";
          if (String(error.message ?? "").includes("EA_SEGMENTS_INVALID_RANGE")) {
            logger.debug("assignment segments: non-canonical range rejected — advisory off", code);
          } else {
            logger.warn("assignment segments unavailable — advisory off", code);
          }
          return null;
        }

        const map = buildSegmentMap(data);
        if (map === null) {
          // Clasificación, no el payload crudo.
          logger.warn(
            "assignment segments malformed — advisory off",
            Array.isArray(data) ? `rows=${data.length}` : typeof data,
          );
        }
        return map;
      } catch (e) {
        if (signal.aborted) throw e; // React Query maneja la cancelación; nunca cachear null
        logger.warn("assignment segments threw — advisory off");
        return null;
      }
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCurrentStaff } from "./useCurrentStaff";

// 0922-190 — "Mis asignaciones": lee `engagement_assignments` bajo la policy
// aditiva `ea_select_own` (staff_id = get_my_staff_id()), sin filtrar
// deleted_at ni status — vigente + histórico, calco de useEngagementAssignments()
// (src/hooks/useEmsData.ts) salvo por ese filtro y por estar acotada a la propia fila.
export interface MyAssignmentRow {
  assignment_id: string;
  engagement_id: string;
  category_id: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  allocation_percent: number;
  notes: string | null;
  status: string;
  deleted_at: string | null;
  engagement: {
    engagement_id: string;
    engagement_code: string | null;
    engagement_name: string;
    client: { client_id: string; client_legal_name: string } | null;
  } | null;
  category: { category_id: string; category_name: string } | null;
  assigned_hours: number;
  /** SUM(time_entries.hours_logged) dentro de [start_date, end_date] de la fila. */
  loaded_hours: number;
}

interface TimeEntryHoursRow {
  engagement_id: string;
  date_worked: string;
  hours_logged: number;
}

// Tamaño de página para paginar time_entries (review 2026-09-28, SHOULD FIX) — ver el loop en
// useMyAssignments() más abajo.
const TIME_ENTRIES_PAGE_SIZE = 1000;

// Forma plana que devuelve la RPC `list_my_assignments` (ver migración 20260924120000)
// — sin objetos anidados, porque el embed de PostgREST a engagements/clients depende de
// policies (engagement.read/client.read) que la población de este ticket no siempre tiene
// (review 2026-09-25, MUST FIX). La RPC es SECURITY DEFINER y hace su propio chequeo
// staff_id = get_my_staff_id(), así que estas etiquetas son seguras de traer siempre.
interface RpcAssignmentRow {
  assignment_id: string;
  engagement_id: string;
  category_id: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  allocation_percent: number;
  notes: string | null;
  status: string;
  deleted_at: string | null;
  engagement_code: string | null;
  engagement_name: string | null;
  client_id: string | null;
  client_legal_name: string | null;
  category_name: string | null;
}

export type MyAssignmentsToggle = "current" | "historical" | "all";

export interface MyAssignmentsFilter {
  toggle: MyAssignmentsToggle;
  dateFrom: string;
  dateTo: string;
}

// Lunes (UTC) de la semana ISO que contiene `d` — en UTC para no depender de la zona
// horaria del navegador, mismo criterio de semana lunes-domingo que personal_overview()
// (supabase/migrations/20260921140000_dash_personal_overview.sql).
function startOfIsoWeekUTC(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday;
}

/**
 * Semanas calendario (lunes-domingo) que toca el rango [startDate, endDate], sin fraccionar
 * — mismo criterio que personal_overview(), aplicado aquí sobre todo el período de la fila
 * en vez de una ventana fija de 4 semanas. Una asignación que empieza un miércoles cuenta
 * la semana completa igual (plan_v2.md §"Regression Risks").
 */
export function weeksTouched(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const startMonday = startOfIsoWeekUTC(start);
  const endMonday = startOfIsoWeekUTC(end);
  const diffDays = Math.round((endMonday.getTime() - startMonday.getTime()) / 86400000);
  return diffDays / 7 + 1;
}

/**
 * Horas totales asignadas por la fila: hours_per_week × semanas tocadas.
 * `allocation_percent` es informativo y NO multiplica — decisión cerrada del operador
 * (plan_v2.md §"Fórmula de horas", validada contra la distribución real de datos).
 */
export function totalAssignedHours(
  row: Pick<MyAssignmentRow, "hours_per_week" | "start_date" | "end_date">,
): number {
  return Number(row.hours_per_week) * weeksTouched(row.start_date, row.end_date);
}

/** Porcentaje de avance (cargado sobre asignado). Sin clamp. */
export function progressPercent(loadedHours: number, assignedHours: number): number {
  if (!assignedHours || assignedHours <= 0) return 0;
  return Math.round((loadedHours / assignedHours) * 100);
}

/** Valor para `<Progress value={...}>`: nunca pasa de 100, aunque el texto sí pueda superarlo. */
export function clampProgressForBar(pct: number): number {
  return Math.min(pct, 100);
}

/**
 * Horas cargadas de una fila: SUM(time_entries.hours_logged) con el mismo engagement_id y
 * date_worked dentro de [start_date, end_date] de la fila — plan_v2.md §"Fórmula de horas".
 */
export function loadedHoursForRow(
  row: Pick<MyAssignmentRow, "engagement_id" | "start_date" | "end_date">,
  entries: TimeEntryHoursRow[],
): number {
  let total = 0;
  for (const e of entries) {
    if (e.engagement_id !== row.engagement_id) continue;
    if (e.date_worked < row.start_date || e.date_worked > row.end_date) continue;
    total += Number(e.hours_logged);
  }
  return total;
}

/**
 * Asignaciones propias del usuario autenticado. Horas cargadas por fila:
 * SUM(time_entries.hours_logged), staff_id propio, mismo engagement_id, date_worked
 * dentro de [start_date, end_date] de la fila, is_forecast = false — puede haber doble
 * conteo si dos filas del mismo staff/encargo tienen rangos superpuestos (riesgo aceptado,
 * plan_v2.md §"Regression Risks").
 *
 * Acotador de rendimiento (review 2026-09-25, SHOULD FIX): en "Vigentes" no se filtra por
 * fecha (son pocas filas por diseño — vigentes reales); en "Históricas"/"Todas" la query
 * SÍ acota por [dateFrom, dateTo] en el servidor, para que el filtro de año calendario
 * reduzca de verdad lo que viaja de la base — antes solo se filtraba en el cliente después
 * de traer todo el historial. La condición de solape replica exactamente la que ya usaba
 * `filteredRows` en MyAssignments.tsx: incluir si `end_date >= dateFrom && start_date <= dateTo`.
 *
 * Etiquetas de encargo/cliente vía RPC, no embed (review 2026-09-25, MUST FIX): un embed
 * anidado de PostgREST a engagements/clients exige engagement.read/client.read de esas
 * tablas — permiso que los roles destinatarios del aviso de staffing no siempre tienen —
 * así que la fila se veía pero encargo/cliente llegaban null ("-"). `list_my_assignments`
 * es SECURITY DEFINER, hace su propio chequeo `staff_id = get_my_staff_id()` y devuelve
 * solo las columnas de etiqueta, nunca las tablas completas.
 */
export function useMyAssignments(filter: MyAssignmentsFilter) {
  const { user } = useAuth();
  const viewerId = user?.id;
  const { data: staffRecord } = useCurrentStaff();
  const staffId = staffRecord?.staff_id;
  const { toggle, dateFrom, dateTo } = filter;

  return useQuery({
    queryKey: ["myAssignments", viewerId, staffId, toggle, dateFrom, dateTo],
    enabled: Boolean(viewerId && staffId),
    queryFn: async (): Promise<MyAssignmentRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcData, error: rpcError } = await (supabase as any).rpc("list_my_assignments", {
        p_toggle: toggle,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });
      if (rpcError) throw rpcError;
      const rpcRows = (rpcData ?? []) as RpcAssignmentRow[];
      const rows: Array<Omit<MyAssignmentRow, "assigned_hours" | "loaded_hours">> = rpcRows.map((r) => ({
        assignment_id: r.assignment_id,
        engagement_id: r.engagement_id,
        category_id: r.category_id,
        start_date: r.start_date,
        end_date: r.end_date,
        hours_per_week: r.hours_per_week,
        allocation_percent: r.allocation_percent,
        notes: r.notes,
        status: r.status,
        deleted_at: r.deleted_at,
        engagement: r.engagement_name
          ? {
              engagement_id: r.engagement_id,
              engagement_code: r.engagement_code,
              engagement_name: r.engagement_name,
              client:
                r.client_id && r.client_legal_name
                  ? { client_id: r.client_id, client_legal_name: r.client_legal_name }
                  : null,
            }
          : null,
        category: r.category_name ? { category_id: r.category_id, category_name: r.category_name } : null,
      }));

      const engagementIds = [...new Set(rows.map((r) => r.engagement_id))];
      let entries: TimeEntryHoursRow[] = [];
      if (engagementIds.length > 0) {
        // Acota time_entries a la ventana real cubierta por las filas ya filtradas arriba,
        // en vez de traer todo el historial del encargo — mismo objetivo de rendimiento.
        const minStart = rows.reduce((min, r) => (r.start_date < min ? r.start_date : min), rows[0].start_date);
        const maxEnd = rows.reduce((max, r) => (r.end_date > max ? r.end_date : max), rows[0].end_date);
        // Pagina explícitamente (review 2026-09-28, SHOULD FIX): PostgREST trunca en silencio
        // a su límite de filas por página (sin error) — para un staff con mucho volumen
        // histórico, una sola página podía subestimar loaded_hours sin ningún aviso. Se sigue
        // pidiendo página tras página hasta que una devuelva menos de TIME_ENTRIES_PAGE_SIZE.
        let offset = 0;
        while (true) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: entriesData, error: entriesError } = await (supabase as any)
            .from("time_entries")
            .select("engagement_id, date_worked, hours_logged")
            .eq("staff_id", staffId)
            .eq("is_forecast", false)
            .in("engagement_id", engagementIds)
            .gte("date_worked", minStart)
            .lte("date_worked", maxEnd)
            .order("date_worked", { ascending: true })
            .range(offset, offset + TIME_ENTRIES_PAGE_SIZE - 1);
          if (entriesError) throw entriesError;
          const page = (entriesData ?? []) as TimeEntryHoursRow[];
          entries = entries.concat(page);
          if (page.length < TIME_ENTRIES_PAGE_SIZE) break;
          offset += TIME_ENTRIES_PAGE_SIZE;
        }
      }

      return rows.map((row) => ({
        ...row,
        assigned_hours: totalAssignedHours(row),
        loaded_hours: loadedHoursForRow(row, entries),
      }));
    },
  });
}

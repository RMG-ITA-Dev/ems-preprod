-- Bug 0922-190 — pantalla "Mis asignaciones" (Staff Scheduling).
--
-- `public.engagement_assignments` ya guarda encargo, fechas, hours_per_week,
-- allocation_percent, notas y categoría para cada asignación, pero las 4 policies
-- SELECT existentes (ea_select_assigned/firmwide/lead/responsible) son todas de
-- equipo/rol — ninguna da autovisibilidad. Un usuario sin ese rol no tiene forma
-- de consultar sus propias asignaciones.
--
-- Policy aditiva (Postgres combina policies permisivas con OR; sin AS RESTRICTIVE),
-- no reemplaza ninguna de las 4 existentes. Deliberadamente NO filtra deleted_at ni
-- status: la pantalla "Mis asignaciones" muestra vigente + histórico (incluye
-- asignaciones dadas de baja o reemplazadas), plan_v2.md §"Arquitectura".
--
-- Decisión del operador (plan_v2.md, cerrada): Opción A (RLS + query directa) en vez
-- de un RPC SECURITY DEFINER, porque el próximo feature previsto (repartir horas por
-- semana) reutiliza la misma visibilidad de filas propias.

CREATE POLICY ea_select_own
  ON public.engagement_assignments
  FOR SELECT
  TO authenticated
  USING (staff_id = public.get_my_staff_id());

-- Review 2026-09-25 (iteración 2, MUST FIX): "Mis asignaciones" también necesita el
-- nombre/código del encargo y el nombre del cliente para cada fila. useMyAssignments.ts
-- los traía con un embed anidado de PostgREST (engagement:engagements(...),
-- client:clients(...)), pero las policies SELECT de esas tablas exigen
-- engagement.read/client.read (docs/database-schema.sql "engagements read"/"clients
-- read") — justo el permiso que, según el propio Context de este ticket, no tienen los
-- roles que más reciben el aviso de staffing. Resultado: la fila se veía (ea_select_own
-- ya la habilita), pero encargo/cliente llegaban null y se pintaban como "-".
--
-- Esto NO reabre la decisión "Opción A" de arriba: no se agrega ninguna policy nueva
-- sobre engagement_assignments, ni se amplía el acceso a las tablas engagements/clients
-- completas (eso expondría presupuesto/márgenes a personal sin ese permiso). En su lugar,
-- un SECURITY DEFINER de mínimo privilegio hace su propio chequeo de autorización
-- (staff_id = get_my_staff_id(), igual que ea_select_own) y devuelve SOLO las columnas
-- de etiqueta que la pantalla necesita — nunca las filas completas de esas tablas.
CREATE FUNCTION public.list_my_assignments(p_toggle text, p_date_from date, p_date_to date)
RETURNS TABLE (
  assignment_id uuid,
  engagement_id uuid,
  category_id uuid,
  start_date date,
  end_date date,
  hours_per_week numeric,
  allocation_percent numeric,
  notes text,
  status text,
  deleted_at timestamptz,
  engagement_code text,
  engagement_name text,
  client_id uuid,
  client_legal_name text,
  category_name text
)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_toggle NOT IN ('current', 'historical', 'all') THEN
    RAISE EXCEPTION 'MY_ASSIGNMENTS_INVALID_TOGGLE';
  END IF;

  RETURN QUERY
  SELECT
    ea.assignment_id, ea.engagement_id, ea.category_id, ea.start_date, ea.end_date,
    ea.hours_per_week, ea.allocation_percent, ea.notes, ea.status, ea.deleted_at,
    e.engagement_code::text, e.engagement_name::text,
    e.client_id, cl.client_legal_name::text,
    cat.category_name::text
  FROM public.engagement_assignments ea
  LEFT JOIN public.engagements e ON e.engagement_id = ea.engagement_id
  LEFT JOIN public.clients cl ON cl.client_id = e.client_id
  LEFT JOIN public.categories cat ON cat.category_id = ea.category_id
  WHERE ea.staff_id = public.get_my_staff_id()  -- único gate de autorización: RLS no aplica dentro de un SECURITY DEFINER
    AND (
      (p_toggle = 'current' AND ea.deleted_at IS NULL AND ea.status <> 'CANCELLED')
      OR (p_toggle = 'historical' AND (ea.deleted_at IS NOT NULL OR ea.status = 'CANCELLED')
          AND ea.end_date >= p_date_from AND ea.start_date <= p_date_to)
      OR (p_toggle = 'all' AND ea.end_date >= p_date_from AND ea.start_date <= p_date_to)
    )
  ORDER BY ea.start_date DESC;
END;
$$;

COMMENT ON FUNCTION public.list_my_assignments(text, date, date) IS '0922-190 "Mis asignaciones": único gate de autorización es staff_id = get_my_staff_id() (SECURITY DEFINER bypassa RLS, así que este WHERE reemplaza a ea_select_own dentro de la función). Devuelve solo columnas de etiqueta (engagement_code/name, client_legal_name, category_name) para la fila propia -- nunca las tablas engagements/clients completas, que exigen engagement.read/client.read que la población objetivo de este ticket no siempre tiene. p_toggle: "current" no acota fecha (deleted_at IS NULL AND status <> CANCELLED); "historical" exige histórico Y solapa [p_date_from, p_date_to]; "all" solo exige solape de fecha, sin filtrar por histórico/vigente -- mismo criterio que el filtro cliente de MyAssignments.tsx.';

REVOKE ALL ON FUNCTION public.list_my_assignments(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_assignments(text, date, date) TO authenticated, service_role;

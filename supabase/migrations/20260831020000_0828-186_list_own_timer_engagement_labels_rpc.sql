--
-- BUG 0828-186 (review Iteración 4): RPC de respaldo para el historial del Tracker
-- (timer_entries), distinto de list_loggable_engagements().
--
-- Hallazgo: useTimerEntries/useRunningTimerEntry leen `engagement:engagements(...)` con un
-- embed sujeto a la RLS normal ("engagements read", alcance assigned_engagements). Como el
-- fix de esta rama ahora permite cargar horas en encargos NO asignados desde el Tracker
-- (list_loggable_engagements_rpc.sql), esas filas llegan con engagement=null. Un primer
-- respaldo (Iteración 3) reutilizó list_loggable_engagements(), pero esa función filtra por
-- ELEGIBILIDAD ACTUAL (status='active', override IN (4,5)) -- si el encargo deja de ser
-- cargable DESPUÉS de haberse registrado la hora, el nombre volvía a quedar en blanco
-- (review Iteración 4).
--
-- Esta función resuelve el nombre/código por PERTENENCIA del registro, no por elegibilidad:
-- solo devuelve datos de un engagement_id si el caller YA tiene un timer_entries propio que
-- lo referencia (es decir, ya conocía ese engagement_id porque lo cargó él mismo). No expone
-- client_legal_name ni ningún otro campo -- superficie mínima, más chica que la del selector.
--

CREATE FUNCTION public.list_own_timer_engagement_labels(p_engagement_ids uuid[])
  RETURNS TABLE (
    engagement_id uuid,
    engagement_code character varying(50),
    engagement_name character varying(255)
  )
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT e.engagement_id, e.engagement_code, e.engagement_name
    FROM public.engagements e
   WHERE e.engagement_id = ANY(p_engagement_ids)
     AND EXISTS (
       SELECT 1 FROM public.timer_entries te
        WHERE te.engagement_id = e.engagement_id
          AND te.staff_id = public.get_my_staff_id()
     )
$$;

COMMENT ON FUNCTION public.list_own_timer_engagement_labels(uuid[]) IS 'BUG 0828-186 (Iteración 4): resuelve engagement_name/engagement_code por pertenencia (el caller ya tiene un timer_entries propio con ese engagement_id), sin filtrar por elegibilidad actual -- a diferencia de list_loggable_engagements(). Respaldo para Tracker History cuando el embed normal cae a null por RLS de asignación.';

REVOKE ALL ON FUNCTION public.list_own_timer_engagement_labels(uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_own_timer_engagement_labels(uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.list_own_timer_engagement_labels(uuid[]) TO service_role;

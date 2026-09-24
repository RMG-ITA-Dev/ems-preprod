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

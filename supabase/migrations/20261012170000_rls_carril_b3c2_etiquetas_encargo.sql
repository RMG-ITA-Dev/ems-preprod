-- Carril B, etapa B3c-2 del barrido de seguridad RLS: etiqueta (código y nombre) de un encargo para quien tiene
-- registros propios sobre él pero no puede leerlo. Q4 del análisis de B3c.
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Idempotente (DROP + CREATE de una función nueva).
--
-- Por qué: B3c activó RLS en `engagements`. Asistente, senior y semisenior no tienen `engagement.read`, así que el
-- embed `engagement:engagements(...)` de sus solicitudes de reversión llega null y la pantalla pintaba «Semana
-- completa» en una solicitud de alcance ENCARGO (1 caso medido en Dev 2.0). Mismo patrón que
-- list_own_timer_engagement_labels (0828-186), que ya resuelve los timers por pertenencia.
--
-- Qué hace: devuelve (engagement_id, engagement_code, engagement_name) de los encargos pedidos donde el llamador
-- tiene algo PROPIO: una hora cargada, un timer o una solicitud de reversión (como solicitante o como dueño de la
-- boleta). Nada más: ni cliente, ni equipo, ni fechas. No sustituye a list_loggable_engagements (selector de carga)
-- ni abre el catálogo de encargos: pedir un encargo sin registros propios devuelve 0 filas.
--
-- SECURITY DEFINER (lee `engagements` por encima de su RLS) con search_path fijo; la pertenencia se calcula con
-- get_my_staff_id(), así que un usuario sin ficha de staff no recibe nada. Se retira EXECUTE a PUBLIC y anon.

DROP FUNCTION IF EXISTS public.list_own_engagement_labels(uuid[]);

CREATE FUNCTION public.list_own_engagement_labels(p_engagement_ids uuid[])
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
   WHERE e.engagement_id = ANY (p_engagement_ids)
     AND public.get_my_staff_id() IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM public.time_entries te
                WHERE te.engagement_id = e.engagement_id AND te.staff_id = public.get_my_staff_id())
       OR EXISTS (SELECT 1 FROM public.timer_entries ti
                   WHERE ti.engagement_id = e.engagement_id AND ti.staff_id = public.get_my_staff_id())
       OR EXISTS (SELECT 1 FROM public.timesheet_reversal_requests r
                    JOIN public.timesheet_periods p ON p.period_id = r.period_id
                   WHERE r.engagement_id = e.engagement_id
                     AND (r.requested_by = public.get_my_staff_id() OR p.staff_id = public.get_my_staff_id()))
     )
$$;

COMMENT ON FUNCTION public.list_own_engagement_labels(uuid[]) IS
  'B3c-2: codigo y nombre de los encargos pedidos donde el llamador tiene registros propios (horas, timers o '
  'solicitudes de reversion). DEFINER a proposito: engagements tiene RLS y quien no tiene engagement.read '
  '(asistente, senior, semisenior) ve null en el embed. NUNCA agregar cliente, equipo ni fechas.';

REVOKE ALL ON FUNCTION public.list_own_engagement_labels(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_own_engagement_labels(uuid[]) TO authenticated, service_role;

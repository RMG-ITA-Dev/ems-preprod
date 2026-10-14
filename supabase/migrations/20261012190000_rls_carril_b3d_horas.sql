-- Carril B, etapa B3d del barrido de seguridad RLS: RLS en las horas y sus aprobaciones (time_entries,
-- timer_entries, timesheet_periods, timesheet_line_approvals). BAR-002 y BAR-013 (parte).
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Idempotente (CREATE OR REPLACE, DROP POLICY IF EXISTS +
-- CREATE, ENABLE RLS repetido no cambia nada): se aplica primero a mano en Dev 2.0 para probar y después con `db push`.
--
-- Por qué estaba apagado: ver 20261012130000 (B3a): la migración 20260115000154 del bot de Lovable apagó el RLS
-- «for beta testing» y nunca se revirtió. Las demás políticas siguen escritas en cero_05 y no se tocan.
--
-- Decisiones del operador (12/10/2026) que implementa:
--   1. admin y senior_partner ven TODAS las horas de todos, incluidas las suyas.
--   2. Ven las horas de TODO el equipo de un encargo: el gerente (manager_id), el socio (partner_id) y el encargado
--      (encargado_id, asistente de manejo de horas que controla y reporta al gerente). director, risk_partner y sqr
--      cuentan como socio SOLO si figuran como partner_id; sqr y especialistas (ita/tax) NO ven el equipo por su
--      campo (sqr_id, specialist_*): solo si además son encargado_id. No se toca is_engagement_team_member (lo usan
--      otras políticas: presupuestos, OT).
--   3. Un aprobador aprueba SOLO las horas de SUS encargos (can_approve_timesheet_line, sin cambios).
--   4. Los responsables del encargo leen también el período y las líneas de boletas de quien se AUTOAPRUEBA (hoy
--      can_approve_timesheet lo impide vía get_timesheet_approvers): sin esto el embed `period:timesheet_periods!inner`
--      de «Aprobadas» y de las solicitudes de reversión descarta la fila.
--   5. La RLS decide por identidad, no por estado: el responsable puede leer también las horas guardadas y no enviadas
--      del equipo; qué cuenta como aprobada, pendiente o guardada lo decide la app.
--
-- Qué se ve y qué no:
--   · time_entries SELECT = admin, o responsable del encargo (admin/senior_partner, manager_id, partner_id,
--     encargado_id), o fila propia con time_entry.read. INSERT/UPDATE/DELETE no cambian (fila propia, o admin).
--   · timesheet_line_approvals: política nueva «responsible read» por encargo de la línea (el responsable ve solo las
--     líneas de SUS encargos, no las de otros encargos de la misma boleta). Las políticas de dueño, aprobador y firma
--     (timesheet_approval.read con scope firm) siguen.
--   · timesheet_periods: política nueva «responsible read» si existe una hora o una línea del período en un encargo
--     del que soy responsable.
--   · timer_entries: el dueño (timer.use) como antes; se agrega lectura para admin porque useDeleteStaff decide
--     entre baja lógica y física mirando si el empleado tiene timers (sin esto un admin vería 0 y la baja física
--     fallaría por la FK). Escritura de timers: solo el dueño.
--   · «Firma» (timesheet_approval.read con scope firm: admin y senior_partner): las políticas «Firm-wide read» de cero_05 consultaban
--     authorization_role_permissions EN LÍNEA, y esa tabla tiene RLS con lectura solo para admin (authz_rp_select_admin): para
--     cualquier otro rol la subconsulta devolvía 0 filas y la política nunca abría nada. Quedó oculto porque estas tablas no tenían
--     RLS; con RLS activa senior_partner habría visto 0 períodos y 0 líneas (medido en Dev 2.0 con un usuario sintético: 0 de 3).
--     Se reescriben con is_firm_hours_reader() (DEFINER, lee los permisos sin depender de la RLS del que consulta).
--   · Sin cambio: UPDATE de períodos y líneas (dueño no bloqueado, aprobador asignado, admin); no hay políticas de
--     DELETE en períodos ni líneas (solo funciones SECURITY DEFINER las borran).
--
-- No cambia lo que ya funciona fuera de RLS: todas las funciones que escriben o leen estas tablas son SECURITY
-- DEFINER y su dueño es postgres con BYPASSRLS (verificado en Dev 2.0); los 8 triggers lo son también; las Edge
-- Functions (dashboard-data, scheduler-*, test-resubmission-state) usan service_role. Las dos vistas security_invoker
-- que leen estas tablas (vw_actual_hours_by_category_activity, vw_staffing_alerts) ahora dependen del usuario.

-- 1. Helpers (SECURITY DEFINER: leen engagements/user_roles sin depender de la RLS del que consulta) ─────────────────

-- Alcance «firma» sobre las aprobaciones de horas: admin, o un rol con timesheet_approval.read de scope firm (hoy admin y
-- senior_partner). Es el mismo criterio que escribió cero_05 en las políticas «Firm-wide read», pero leído como DEFINER.
-- is_admin() mira la columna legada user_roles.role; la subconsulta mira role_key.
CREATE OR REPLACE FUNCTION public.is_firm_hours_reader() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.authorization_role_permissions rp ON rp.role_key = ur.role_key
     WHERE ur.user_id = auth.uid()
       AND rp.permission_key = 'timesheet_approval.read'
       AND rp.scope_key = 'firm'
  )
$$;

-- Encargos de los que soy responsable: gerente, socio o encargado. Devuelve un CONJUNTO para que las políticas lo usen como
-- `engagement_id IN (SELECT ...)`: PostgreSQL lo calcula UNA vez por consulta. Una función booleana por fila (is_admin +
-- permisos + engagements en cada fila) costaba ~0,8 ms por fila en Dev 2.0 (135 filas = 104 ms) y no escala.
CREATE OR REPLACE FUNCTION public.my_responsible_engagement_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT e.engagement_id
    FROM public.engagements e
   WHERE e.manager_id   = (SELECT public.get_my_staff_id())
      OR e.partner_id   = (SELECT public.get_my_staff_id())
      OR e.encargado_id = (SELECT public.get_my_staff_id())
$$;

-- Períodos con horas o líneas en un encargo del que soy responsable (para que el responsable lea el período aunque el
-- dueño se autoapruebe y no haya aprobador asignado).
CREATE OR REPLACE FUNCTION public.my_responsible_period_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT te.period_id FROM public.time_entries te
   WHERE te.period_id IS NOT NULL AND te.engagement_id IN (SELECT public.my_responsible_engagement_ids())
  UNION
  SELECT tla.period_id FROM public.timesheet_line_approvals tla
   WHERE tla.engagement_id IN (SELECT public.my_responsible_engagement_ids())
$$;

REVOKE ALL ON FUNCTION public.is_firm_hours_reader()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_responsible_engagement_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_responsible_period_ids()     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_firm_hours_reader()          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_responsible_engagement_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_responsible_period_ids()     TO authenticated, service_role;

-- 2. Políticas ──────────────────────────────────────────────────────────────────────────────────────────────────────

-- Lo que no depende de la fila va en (SELECT ...): PostgreSQL lo evalúa una vez por consulta (InitPlan), no por fila.
DROP POLICY IF EXISTS "time_entries read" ON public.time_entries;
CREATE POLICY "time_entries read" ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_firm_hours_reader())
    OR engagement_id IN (SELECT public.my_responsible_engagement_ids())
    OR ((SELECT public.has_permission('time_entry.read'::text)) AND staff_id = (SELECT public.get_my_staff_id()))
  );

DROP POLICY IF EXISTS "timer_entries read" ON public.timer_entries;
CREATE POLICY "timer_entries read" ON public.timer_entries
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR ((SELECT public.has_permission('timer.use'::text)) AND staff_id = (SELECT public.get_my_staff_id()))
  );

DROP POLICY IF EXISTS "Firm-wide read line approvals" ON public.timesheet_line_approvals;
CREATE POLICY "Firm-wide read line approvals" ON public.timesheet_line_approvals
  FOR SELECT USING ((SELECT public.is_firm_hours_reader()));

DROP POLICY IF EXISTS "Firm-wide read periods" ON public.timesheet_periods;
CREATE POLICY "Firm-wide read periods" ON public.timesheet_periods
  FOR SELECT USING ((SELECT public.is_firm_hours_reader()));

DROP POLICY IF EXISTS "Responsible read line approvals" ON public.timesheet_line_approvals;
CREATE POLICY "Responsible read line approvals" ON public.timesheet_line_approvals
  FOR SELECT TO authenticated
  USING (engagement_id IN (SELECT public.my_responsible_engagement_ids()));

DROP POLICY IF EXISTS "Responsible read periods" ON public.timesheet_periods;
CREATE POLICY "Responsible read periods" ON public.timesheet_periods
  FOR SELECT TO authenticated
  USING (period_id IN (SELECT public.my_responsible_period_ids()));

-- 3. Guarda y ENABLE RLS ────────────────────────────────────────────────────────────────────────────────────────────
-- Activar RLS sin política de lectura dejaría la tabla ilegible para todos (fallo silencioso).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['time_entries', 'timer_entries', 'timesheet_periods', 'timesheet_line_approvals'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT') THEN
      RAISE EXCEPTION 'B3d: public.% no tiene política de lectura; activar RLS la dejaría ilegible para todos', t;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.time_entries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_entries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_periods        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_line_approvals ENABLE ROW LEVEL SECURITY;

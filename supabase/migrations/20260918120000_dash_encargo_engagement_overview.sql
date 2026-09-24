-- FEAT dash_encargo: rediseño de la pestaña Encargo -- backend (bugs/dashboard/encargo/
-- plan_v2.md, secciones 6 y 7; decisiones de negocio en bugs/dashboard/encargo/decisiones.md).
--
-- Contenido, en orden (idempotente: CREATE OR REPLACE / ON CONFLICT DO NOTHING en todo el
-- archivo, per plan_v2.md §10):
--   1. authorization_role_permissions <- ('semisenior','dashboard.engagement.read', ...)
--   2. global_settings <- DASH_ENGAGEMENT_PENDING_ALERT_WEEKS
--   3. can_read_engagement_dashboard(uuid) -- única materialización de decisiones.md §2
--   4. list_dashboard_engagements() -- alimenta el selector con el alcance de §2 completo
--   5. engagement_overview(uuid, date, date) -- payload completo de la pestaña, un round-trip
--   6. COMMENT ON de los 3 objetos + REVOKE ALL FROM PUBLIC + GRANT EXECUTE a
--      authenticated/service_role
--
-- DEPENDENCIA (plan_v2.md §3.1): usa public.latest_exchange_rate(), creada por
-- 20260915130000_dash_socio_partner_overview.sql. Debe aplicarse después de esa migración
-- (timestamp posterior + orden explícito en supabase/tests/local/run-rls-tests.sh).
--
-- Nada de esto se aplica aquí a ningún Supabase real (ni Lovable, ni Dev 2.0, ni Test) --
-- solo se crea el archivo, per instrucción explícita del operador.
--
-- CORRECCIONES POST-EJECUCIÓN (acordadas con el operador en conversación, archivo aún sin
-- aplicar a ningún Supabase real -- se editan en el mismo archivo, no en uno nuevo):
--   #1. list_dashboard_engagements(): filtro funcion=1 (Cliente) + campo end_date.
--   #2. engagement_overview(): bloque approval_queue (Cola de Aprobación por persona, junto
--       a Gastos en el frontend) -- ver detalle en el COMMENT ON de la función.
--   #3. (review.md iteración 1, MF-01) pending_lines: el LATERAL de horas por línea pendiente
--       no filtraba is_forecast -- una hora Pronóstico en el mismo period_id/engagement_id/
--       activity_id que una línea realmente enviada a aprobar se sumaba igual. Decisión del
--       operador: KPI "Horas pendientes de aprobación" y Cola de Aprobación cuentan SOLO
--       horas efectivamente mandadas a aprobar (is_forecast=false), igual que el resto del
--       archivo -- el widget de Staffing y el modal de 9 semanas ya filtraban forecast desde
--       la primera versión y no cambian.
--   #4. (review.md iteración 1, SF-02) staff_category: el fallback a la categoría de la
--       asignación más reciente no excluía asignaciones con deleted_at IS NOT NULL (sí
--       excluía CANCELLED). Corregido para que coincida con el resto de las CTEs del archivo.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1-2. Catálogo: permiso de semisenior + setting del umbral de antigüedad (decisiones.md §3)
-- ═══════════════════════════════════════════════════════════════════════════════════════

INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
VALUES ('semisenior', 'dashboard.engagement.read', 'assigned_engagements')
ON CONFLICT (role_key, permission_key) DO NOTHING;

INSERT INTO public.global_settings (setting_key, setting_value, description)
VALUES ('DASH_ENGAGEMENT_PENDING_ALERT_WEEKS', '3',
        'dash_encargo: semanas de antiguedad a partir de las cuales las aprobaciones de horas pendientes se marcan en el KPI de la pestana Encargo (decisiones.md 4.1/5.1). Sin relacion con TS_EMPLOYEE_RETRO_DAYS.')
ON CONFLICT (setting_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 3. can_read_engagement_dashboard() -- única materialización de decisiones.md §2
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Fail-closed: sin sesión, sin el permiso, o un role_key fuera de la tabla de decisiones.md
-- §2 -> false (el ELSE false del CASE cubre cualquier rol no listado, nunca un "true" por
-- defecto). NUNCA lee authorization_role_permissions.scope_key -- risk_partner se trata
-- idéntico a partner/director (decisiones.md §5.2, mismo criterio que portfolio_overview()).
-- Un engagement_id inexistente hace que el EXISTS no encuentre fila -> false, sin distinguir
-- "no existe" de "no es tuyo" (decisiones.md delega esto a engagement_overview §7.3 punto 4).

CREATE OR REPLACE FUNCTION public.can_read_engagement_dashboard(p_engagement_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.has_permission('dashboard.engagement.read')
    AND EXISTS (
      SELECT 1
      FROM public.engagements e
      WHERE e.engagement_id = p_engagement_id
        AND (
          public.current_role_key() IN ('admin', 'senior_partner')
          OR (
            public.get_my_staff_id() IS NOT NULL
            AND CASE public.current_role_key()
                  WHEN 'partner'      THEN e.partner_id = public.get_my_staff_id()
                  WHEN 'director'     THEN e.partner_id = public.get_my_staff_id()
                  WHEN 'risk_partner' THEN e.partner_id = public.get_my_staff_id()
                  WHEN 'sqr'          THEN e.partner_id = public.get_my_staff_id()
                  WHEN 'manager'      THEN e.manager_id = public.get_my_staff_id()
                  WHEN 'ita_manager'  THEN e.manager_id = public.get_my_staff_id()
                  WHEN 'tax_manager'  THEN e.manager_id = public.get_my_staff_id()
                  WHEN 'senior'       THEN e.encargado_id = public.get_my_staff_id()
                  WHEN 'semisenior'   THEN e.encargado_id = public.get_my_staff_id()
                  WHEN 'ita_senior'   THEN e.specialist_it_id = public.get_my_staff_id()
                  WHEN 'tax_senior'   THEN e.specialist_tax_id = public.get_my_staff_id()
                  ELSE false
                END
          )
        )
    );
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 4. list_dashboard_engagements() -- alimenta el selector con el alcance de §2 completo
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Mismo mapeo rol->campo que can_read_engagement_dashboard(), pero inline (no se llama fila
-- por fila -- plan_v2.md §7.2) porque el role_key/staff_id del llamante no cambian entre
-- filas. Filtros de "activo" idénticos a los de hoy (EngagementSelector.tsx) para no
-- expandir alcance: status='active' + engagement_state_override NOT IN (6,7) -- espejo SQL
-- de isHiddenFromActivePickers() (src/lib/engagementStatus.ts). funcion = 1 (Cliente,
-- corrección post-ejecución acordada con el operador): SIN este filtro el selector listaba
-- también encargos administrativos (funcion=0) -- mismo criterio que portfolio_overview()
-- (dash_cartera). Deliberadamente NO va en can_read_engagement_dashboard(): ese gate cubre
-- un engagement_id puntual que puede llegar por otra vía y no debe bloquearlo por funcion.
-- end_date viaja en el payload para que el frontend pueda autoseleccionar el encargo con
-- fecha de fin más próxima (EncargoTab.tsx) sin una segunda ida y vuelta.

CREATE OR REPLACE FUNCTION public.list_dashboard_engagements()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role   text;
  v_staff  uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: no session';
  END IF;
  IF NOT public.has_permission('dashboard.engagement.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.engagement.read';
  END IF;

  v_role := public.current_role_key();
  v_staff := public.get_my_staff_id();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'engagement_id', e.engagement_id,
    'engagement_code', e.engagement_code,
    'engagement_name', e.engagement_name,
    'client_legal_name', cl.client_legal_name,
    'end_date', e.end_date
  ) ORDER BY e.engagement_code NULLS LAST, e.engagement_id), '[]'::jsonb)
  INTO v_result
  FROM public.engagements e
  JOIN public.clients cl ON cl.client_id = e.client_id
  WHERE e.status = 'active'
    AND COALESCE(e.engagement_state_override, 0) NOT IN (6, 7)
    AND e.funcion = 1
    AND (
      v_role IN ('admin', 'senior_partner')
      OR (
        v_staff IS NOT NULL
        AND CASE v_role
              WHEN 'partner'      THEN e.partner_id = v_staff
              WHEN 'director'     THEN e.partner_id = v_staff
              WHEN 'risk_partner' THEN e.partner_id = v_staff
              WHEN 'sqr'          THEN e.partner_id = v_staff
              WHEN 'manager'      THEN e.manager_id = v_staff
              WHEN 'ita_manager'  THEN e.manager_id = v_staff
              WHEN 'tax_manager'  THEN e.manager_id = v_staff
              WHEN 'senior'       THEN e.encargado_id = v_staff
              WHEN 'semisenior'   THEN e.encargado_id = v_staff
              WHEN 'ita_senior'   THEN e.specialist_it_id = v_staff
              WHEN 'tax_senior'   THEN e.specialist_tax_id = v_staff
              ELSE false
            END
      )
    );

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 5. engagement_overview() -- RPC principal (decisiones.md §4; plan_v2.md §7.3/§7.4/§7.5)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Guardas de sesión/permiso/rango ANTES de cualquier CTE (R-1: las vistas vw_* usadas abajo
-- son security_invoker='on' pero corren con los privilegios del OWNER dentro de este
-- SECURITY DEFINER y NO filtran por RLS -- por eso además cada CTE que las toca lleva
-- WHERE engagement_id = p_engagement_id). Un encargo fuera de alcance (o inexistente) NO
-- lanza excepción: devuelve selected_accessible=false + detail=null (decisiones.md delega
-- este caso a plan_v2.md §7.3 punto 4 -- ni el frontend ni el llamante pueden distinguir
-- "no existe" de "no es tuyo").

CREATE OR REPLACE FUNCTION public.engagement_overview(
  p_engagement_id uuid,
  p_start         date,
  p_end           date
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_today           date;
  v_week_start      date;
  v_prev_week_start date;
  v_alert_weeks     int;
  v_role            text;
  v_result          jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: no session';
  END IF;
  IF NOT public.has_permission('dashboard.engagement.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.engagement.read';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  v_today := ((now() AT TIME ZONE 'America/La_Paz')::date);
  v_week_start := date_trunc('week', v_today)::date;
  v_prev_week_start := v_week_start - 7;
  v_role := public.current_role_key();

  -- Lectura tolerante del setting (plan_v2.md §6.2, R-5): vacío/no numérico/fuera de
  -- [1,52] -> 3. Nunca lanza (::int sobre 'abc' sí lanzaría sin el regexp_replace).
  v_alert_weeks := COALESCE(
    NULLIF(regexp_replace(
      COALESCE((SELECT setting_value FROM public.global_settings
                 WHERE setting_key = 'DASH_ENGAGEMENT_PENDING_ALERT_WEEKS'), ''),
      '[^0-9]', '', 'g'), '')::int, 3);
  IF v_alert_weeks < 1 OR v_alert_weeks > 52 THEN
    v_alert_weeks := 3;
  END IF;

  IF NOT public.can_read_engagement_dashboard(p_engagement_id) THEN
    RETURN jsonb_build_object(
      'meta', jsonb_build_object(
        'engagement_id', p_engagement_id,
        'selected_accessible', false,
        'today', v_today,
        'alert_weeks', v_alert_weeks
      ),
      'detail', null
    );
  END IF;

  v_result := (
  WITH
  -- ── Encargo + cliente ─────────────────────────────────────────────────────────────────
  eng AS (
    SELECT e.*, cl.client_legal_name
    FROM public.engagements e
    JOIN public.clients cl ON cl.client_id = e.client_id
    WHERE e.engagement_id = p_engagement_id
  ),

  -- ── KPI Staffing (§4.1/§7.3): fracción de asignados con Cargado > 0, semana actual y
  -- semana pasada. Asignaciones vigentes = deleted_at IS NULL, status <> 'CANCELLED', con
  -- solape [start_date,end_date] contra la semana (D-2). ────────────────────────────────
  assigned_current AS (
    SELECT DISTINCT ea.staff_id
    FROM public.engagement_assignments ea
    WHERE ea.engagement_id = p_engagement_id
      AND ea.deleted_at IS NULL AND ea.status <> 'CANCELLED'
      AND ea.start_date <= (v_week_start + 6) AND ea.end_date >= v_week_start
  ),
  assigned_previous AS (
    SELECT DISTINCT ea.staff_id
    FROM public.engagement_assignments ea
    WHERE ea.engagement_id = p_engagement_id
      AND ea.deleted_at IS NULL AND ea.status <> 'CANCELLED'
      AND ea.start_date <= (v_prev_week_start + 6) AND ea.end_date >= v_prev_week_start
  ),
  logged_current AS (
    SELECT te.staff_id, SUM(te.hours_logged) AS hours
    FROM public.time_entries te
    WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
      AND date_trunc('week', te.date_worked) = v_week_start
    GROUP BY te.staff_id
  ),
  logged_previous AS (
    SELECT te.staff_id, SUM(te.hours_logged) AS hours
    FROM public.time_entries te
    WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
      AND date_trunc('week', te.date_worked) = v_prev_week_start
    GROUP BY te.staff_id
  ),
  kpi_staffing AS (
    SELECT
      (SELECT COUNT(*) FROM assigned_current) AS current_assigned,
      (SELECT COUNT(*) FROM assigned_current ac JOIN logged_current lc ON lc.staff_id = ac.staff_id WHERE lc.hours > 0) AS current_logged,
      (SELECT COUNT(*) FROM assigned_previous) AS previous_assigned,
      (SELECT COUNT(*) FROM assigned_previous ap JOIN logged_previous lp ON lp.staff_id = ap.staff_id WHERE lp.hours > 0) AS previous_logged
  ),

  -- ── KPI Horas pendientes de aprobación (§4.1): join a timesheet_line_approvals
  -- status='pending' -- horas sin fila de aprobación NUNCA cuentan acá (R-4). staff_id viaja
  -- acá (corrección post-ejecución #2) para alimentar approval_queue_* más abajo sin un
  -- segundo barrido de timesheet_line_approvals -- no cambia kpi_pending, que sigue leyendo
  -- exactamente las mismas columnas que ya usaba. ─────────────────────────────────────────
  pending_lines AS (
    SELECT tla.approval_id, tp.week_start_date, tp.staff_id, tesum.hours
    FROM public.timesheet_line_approvals tla
    JOIN public.timesheet_periods tp ON tp.period_id = tla.period_id
    LEFT JOIN LATERAL (
      SELECT SUM(te.hours_logged) AS hours
      FROM public.time_entries te
      WHERE te.period_id = tla.period_id AND te.engagement_id = tla.engagement_id
        AND te.activity_id = tla.activity_id AND COALESCE(te.is_forecast, false) = false
    ) tesum ON true
    WHERE tla.engagement_id = p_engagement_id AND tla.status = 'pending'
  ),
  kpi_pending AS (
    SELECT
      COALESCE(SUM(hours) FILTER (WHERE week_start_date = v_prev_week_start), 0) AS last_week_hours,
      COALESCE(SUM(hours) FILTER (WHERE FLOOR((v_today - week_start_date) / 7.0) >= v_alert_weeks), 0) AS aged_hours
    FROM pending_lines
  ),

  -- ── Cola de Aprobación por persona (corrección post-ejecución #2, acordada con el
  -- operador): a diferencia del KPI de arriba (agregado, sin desglose), acá se consolida
  -- pending_lines POR PERSONA -- horas totales pendientes de esa persona en este encargo
  -- (suma de TODAS sus líneas pendientes, no solo la más vieja) y weeks_old de su línea más
  -- antigua (MAX, ya que week_start_date más chico = más vieja = days_old/weeks_old más
  -- grande). `alert` reutiliza v_alert_weeks -- MISMO umbral que ya usa aged_hours arriba,
  -- ninguna fuente de verdad nueva (review.md iteración 1, MF-05, decisión del operador:
  -- "crítico" en el frontend es exactamente este `alert` -- sin un segundo escalón más
  -- severo; encargoOverviewAggregation.ts no recibe ni calcula ningún umbral adicional).
  -- ─────────────────────────────────────────────────────────────────────────────────────
  approval_queue_staff AS (
    SELECT pl.staff_id, COALESCE(SUM(pl.hours), 0) AS hours,
      MAX(FLOOR((v_today - pl.week_start_date) / 7.0))::int AS weeks_old
    FROM pending_lines pl
    WHERE pl.staff_id IS NOT NULL
    GROUP BY pl.staff_id
  ),
  approval_queue_rows AS (
    SELECT
      aqs.staff_id,
      COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))) AS staff_name,
      aqs.hours, aqs.weeks_old,
      (aqs.weeks_old >= v_alert_weeks) AS alert
    FROM approval_queue_staff aqs
    LEFT JOIN public.staff s ON s.staff_id = aqs.staff_id
  ),
  approval_queue_json AS (
    SELECT
      COALESCE(SUM(hours), 0) AS total_hours,
      COUNT(*) AS distinct_people,
      COALESCE(jsonb_agg(jsonb_build_object(
        'staff_id', staff_id, 'staff_name', staff_name, 'hours', hours,
        'weeks_old', weeks_old, 'alert', alert
      ) ORDER BY weeks_old DESC, hours DESC, staff_name), '[]'::jsonb) AS items
    FROM approval_queue_rows
  ),

  -- ── KPI Última carga / Última aprobación (§4.1) ─────────────────────────────────────
  kpi_last_entry AS (
    SELECT MAX(te.date_worked) AS last_date
    FROM public.time_entries te
    WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
  ),
  kpi_last_approval AS (
    SELECT MAX(tla.approved_at) AS last_at
    FROM public.timesheet_line_approvals tla
    WHERE tla.engagement_id = p_engagement_id AND tla.status = 'approved'
  ),

  -- ── Consumo de presupuesto (§4.2, sin cambios) -- mismas fuentes que EncargoTab hoy ──
  budget_hours_cte AS (
    SELECT COALESCE(SUM(total_budget_hours), 0) AS hours
    FROM public.vw_wo_budget_hours_by_category
    WHERE engagement_id = p_engagement_id
  ),
  actual_hours_cte AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS hours
    FROM public.time_entries te
    WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
      AND te.date_worked BETWEEN p_start AND p_end
  ),

  -- ── Desglose Categoría->Actividad unificado (§4.3): fuente única, sin filtro de fecha,
  -- ocultando filas 0/0. ──────────────────────────────────────────────────────────────
  breakdown_rows AS (
    SELECT category_id, category_name, category_display_order, activity_id, activity_code,
           activity_description, budget_hours, actual_hours, variance_hours
    FROM public.vw_budget_vs_actual_hours_by_category_activity
    WHERE engagement_id = p_engagement_id
      AND NOT (budget_hours = 0 AND actual_hours = 0)
  ),
  breakdown_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'category_id', category_id, 'category_name', category_name,
      'category_display_order', category_display_order,
      'activity_id', activity_id, 'activity_code', activity_code,
      'activity_description', activity_description,
      'budget_hours', budget_hours, 'actual_hours', actual_hours, 'variance_hours', variance_hours
    ) ORDER BY category_display_order NULLS LAST, category_name, activity_code, activity_id), '[]'::jsonb) AS items
    FROM breakdown_rows
  ),

  -- ── Equipo responsable (§4.4): 6 roles formales, NULL -> "-" en el frontend. ────────
  team_raw AS (
    SELECT
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.partner_id) AS partner,
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.manager_id) AS manager,
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.encargado_id) AS encargado,
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.specialist_it_id) AS specialist_it,
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.specialist_tax_id) AS specialist_tax,
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.sqr_id) AS sqr
    FROM eng
  ),

  -- ── Staffing (§4.5/§7.4): universo = FULL JOIN conceptual asignados <-> quienes cargaron
  -- horas. Una fila por persona. ──────────────────────────────────────────────────────
  assignments AS (
    SELECT ea.staff_id, ea.start_date, ea.end_date, ea.hours_per_week, ea.allocation_percent,
           ea.category_id, ea.updated_at
    FROM public.engagement_assignments ea
    WHERE ea.engagement_id = p_engagement_id
      AND ea.deleted_at IS NULL AND ea.status <> 'CANCELLED'
  ),
  staffing_universe AS (
    SELECT staff_id FROM assignments
    UNION
    SELECT te.staff_id
    FROM public.time_entries te
    WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
  ),
  -- D-1: "semanas del rango" = semanas calendario tocadas, lunes a lunes.
  -- review.md dash_encargo iteración 3, G-01 (2026-09-22): hours_per_week YA es el
  -- compromiso semanal real de la asignación, no una tasa nominal a prorratear -- confirmado
  -- por personal_overview() ("hours_per_week completo... sin prorrateo") y por
  -- computeUtilizationBands() del scheduler (suma hours_per_week directo entre asignaciones
  -- superpuestas). Multiplicar por allocation_percent/100 aquí contaba la dedicación parcial
  -- dos veces (una asignación real de 20 h/semana al 50% quedaba en 10 h/semana).
  assignment_hours AS (
    SELECT staff_id,
      SUM(hours_per_week *
        (((date_trunc('week', end_date)::date - date_trunc('week', start_date)::date) / 7) + 1)
      ) AS assigned_hours
    FROM assignments
    GROUP BY staff_id
  ),
  -- Alerta binaria de "semana en cero" (§4.5.a): recorre cada semana calendario tocada por
  -- CUALQUIERA de las asignaciones de la persona (hasta hoy, sin evaluar semanas futuras) y
  -- marca si esa semana tuvo cero horas cargadas en este encargo.
  assignment_weeks AS (
    SELECT a.staff_id, gw.week_start::date AS week_start
    FROM assignments a
    CROSS JOIN LATERAL generate_series(
      date_trunc('week', a.start_date),
      LEAST(date_trunc('week', a.end_date), date_trunc('week', v_today)),
      interval '7 days'
    ) AS gw(week_start)
  ),
  zero_week_flags AS (
    SELECT aw.staff_id, bool_or(COALESCE(wk.hours, 0) = 0) AS has_zero_week
    FROM assignment_weeks aw
    LEFT JOIN LATERAL (
      SELECT SUM(te.hours_logged) AS hours
      FROM public.time_entries te
      WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
        AND te.staff_id = aw.staff_id AND date_trunc('week', te.date_worked) = aw.week_start
    ) wk ON true
    GROUP BY aw.staff_id
  ),
  -- Categoría: staff.category_id primero (coincide con el desglose de la misma pantalla);
  -- fallback a la categoría de la asignación no cancelada más reciente (staff.category_id
  -- es nullable).
  staff_category AS (
    SELECT su.staff_id, COALESCE(cat_own.category_name, cat_fallback.category_name) AS category_name
    FROM staffing_universe su
    LEFT JOIN public.staff s ON s.staff_id = su.staff_id
    LEFT JOIN public.categories cat_own ON cat_own.category_id = s.category_id
    LEFT JOIN LATERAL (
      SELECT c.category_name
      FROM public.engagement_assignments ea2
      JOIN public.categories c ON c.category_id = ea2.category_id
      WHERE ea2.staff_id = su.staff_id AND ea2.engagement_id = p_engagement_id
        AND ea2.status <> 'CANCELLED' AND ea2.deleted_at IS NULL
      ORDER BY ea2.updated_at DESC
      LIMIT 1
    ) cat_fallback ON true
  ),
  people_rows AS (
    SELECT
      su.staff_id,
      COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))) AS display_name,
      sc.category_name,
      COALESCE(ah.assigned_hours, 0) AS assigned_hours,
      COALESCE(zwf.has_zero_week, false) AS zero_week_alert
    FROM staffing_universe su
    LEFT JOIN public.staff s ON s.staff_id = su.staff_id
    LEFT JOIN staff_category sc ON sc.staff_id = su.staff_id
    LEFT JOIN assignment_hours ah ON ah.staff_id = su.staff_id
    LEFT JOIN zero_week_flags zwf ON zwf.staff_id = su.staff_id
  ),
  people_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'staff_id', staff_id, 'display_name', display_name, 'category_name', category_name,
      'assigned_hours', assigned_hours, 'zero_week_alert', zero_week_alert
    ) ORDER BY display_name, staff_id), '[]'::jsonb) AS items
    FROM people_rows
  ),
  -- Las 9 semanas: offset -4..+4 respecto de la semana actual, precargadas en el payload
  -- (plan_v2.md §3.1/§4.5: cero requests al navegar el modal).
  staff_earliest AS (
    SELECT su.staff_id,
      COALESCE(
        (SELECT MIN(date_trunc('week', a.start_date))::date FROM assignments a WHERE a.staff_id = su.staff_id),
        (SELECT MIN(date_trunc('week', te.date_worked))::date FROM public.time_entries te
           WHERE te.staff_id = su.staff_id AND te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false)
      ) AS earliest_start
    FROM staffing_universe su
  ),
  weeks_base AS (
    SELECT gs AS week_offset,
           (v_week_start + (gs * 7)) AS week_start,
           (v_week_start + (gs * 7) + 6) AS week_end,
           EXTRACT(WEEK FROM (v_week_start + (gs * 7)))::int AS week_number
    FROM generate_series(-4, 4) gs
  ),
  week_rows AS (
    SELECT
      wb.week_offset, wb.week_start,
      su.staff_id,
      COALESCE(lw.hours, 0) AS logged_hours,
      COALESCE(uw.hours, 0) AS used_hours
    FROM weeks_base wb
    CROSS JOIN staffing_universe su
    LEFT JOIN staff_earliest se ON se.staff_id = su.staff_id
    LEFT JOIN LATERAL (
      SELECT SUM(te.hours_logged) AS hours
      FROM public.time_entries te
      WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
        AND te.staff_id = su.staff_id AND date_trunc('week', te.date_worked) = wb.week_start
    ) lw ON true
    LEFT JOIN LATERAL (
      SELECT SUM(te.hours_logged) AS hours
      FROM public.time_entries te
      WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
        AND te.staff_id = su.staff_id
        AND te.date_worked <= wb.week_end
        AND (se.earliest_start IS NULL OR te.date_worked >= se.earliest_start)
    ) uw ON true
  ),
  weeks_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'offset', wb.week_offset, 'week_start', wb.week_start, 'week_end', wb.week_end,
        'week_number', wb.week_number,
        'rows', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('staff_id', wr.staff_id, 'logged_hours', wr.logged_hours, 'used_hours', wr.used_hours) ORDER BY wr.staff_id)
          FROM week_rows wr WHERE wr.week_offset = wb.week_offset
        ), '[]'::jsonb)
      ) ORDER BY wb.week_offset
    ), '[]'::jsonb) AS items
    FROM weeks_base wb
  ),

  -- ── Gastos (§4.6/§7.5): normalizado a BOB, mismo rate_to_bob que dash_cartera/dash_socio.
  -- Presupuesto solo de OT Approved (D-3); gastos reales de todas las OT del encargo. ────
  wo_scope AS (
    SELECT wo.wo_id, wo.currency, wo.approval_status, p.exchange_rate AS plan_exchange_rate
    FROM public.work_orders wo
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = wo.wo_id
    WHERE wo.engagement_id = p_engagement_id
  ),
  wo_rate AS (
    SELECT wo_id, approval_status,
      CASE WHEN currency = 'BOB' THEN 1
           WHEN plan_exchange_rate IS NOT NULL THEN plan_exchange_rate
           WHEN currency = 'USD' THEN public.latest_exchange_rate()
           ELSE NULL END AS rate_to_bob
    FROM wo_scope
  ),
  expense_budget_bob AS (
    SELECT COALESCE(SUM(web.budgeted_amount * wr.rate_to_bob), 0) AS budget_bob
    FROM wo_rate wr
    JOIN public.wo_expense_budget web ON web.wo_id = wr.wo_id
    WHERE wr.approval_status = 'Approved'
  ),
  expense_amount_bob AS (
    SELECT fre.fre_id, fre.expense_date, fre.description, fre.amount, fre.currency, fre.status,
      (fre.amount * CASE fre.currency WHEN 'BOB' THEN 1 ELSE COALESCE(wr.rate_to_bob, public.latest_exchange_rate()) END) AS amount_bob
    FROM public.fund_request_expenses fre
    JOIN wo_rate wr ON wr.wo_id = fre.wo_id
  ),
  executed_bob_cte AS (
    SELECT COALESCE(SUM(amount_bob) FILTER (WHERE status = 'revisado_asistente'), 0) AS executed_bob
    FROM expense_amount_bob
  ),
  approved_expenses_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fre_id', fre_id, 'expense_date', expense_date, 'description', description,
      'amount', amount, 'currency', currency, 'amount_bob', amount_bob, 'status', status
    ) ORDER BY expense_date DESC, fre_id DESC), '[]'::jsonb) AS items
    FROM (SELECT * FROM expense_amount_bob WHERE status = 'revisado_asistente' ORDER BY expense_date DESC, fre_id DESC LIMIT 5) t
  ),
  pending_expenses_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fre_id', fre_id, 'expense_date', expense_date, 'description', description,
      'amount', amount, 'currency', currency, 'amount_bob', amount_bob, 'status', status
    ) ORDER BY expense_date DESC, fre_id DESC), '[]'::jsonb) AS items
    FROM (SELECT * FROM expense_amount_bob WHERE status IN ('pendiente_aprobacion', 'aprobado_gerente') ORDER BY expense_date DESC, fre_id DESC LIMIT 5) t
  ),
  -- display_status (§4.6/§5.3): pendiente_gerente / aprobado_pendiente_desembolso /
  -- desembolsado / observado / rechazado. Excluye solicitudes padre en borrador (D-4:
  -- approval_status='pendiente' por default ahi, y aparecerian falsamente como pendientes).
  requests_raw AS (
    SELECT frwo.fr_wo_id, frwo.fund_request_id, fr.request_number, frwo.allocated_amount,
      fr.currency,
      CASE fr.currency WHEN 'BOB' THEN 1 ELSE COALESCE(wr.rate_to_bob, public.latest_exchange_rate()) END AS rate_to_bob,
      CASE
        WHEN frwo.approval_status = 'pendiente' THEN 'pendiente_gerente'
        WHEN frwo.approval_status = 'aprobado' AND fr.status NOT IN ('fondos_entregados', 'en_liquidacion', 'cerrado') THEN 'aprobado_pendiente_desembolso'
        WHEN frwo.approval_status = 'aprobado' AND fr.status IN ('fondos_entregados', 'en_liquidacion', 'cerrado') THEN 'desembolsado'
        WHEN frwo.approval_status = 'observado' THEN 'observado'
        WHEN frwo.approval_status = 'rechazado' THEN 'rechazado'
      END AS display_status,
      frwo.manager_decided_at,
      COALESCE(fr.submitted_at, fr.created_at) AS submitted_at
    FROM public.fund_request_work_orders frwo
    JOIN wo_rate wr ON wr.wo_id = frwo.wo_id
    JOIN public.fund_requests fr ON fr.fund_request_id = frwo.fund_request_id
    WHERE fr.status <> 'borrador'
  ),
  requests_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fr_wo_id', fr_wo_id, 'fund_request_id', fund_request_id, 'request_number', request_number,
      'allocated_amount', allocated_amount, 'currency', currency,
      'allocated_amount_bob', allocated_amount * rate_to_bob,
      'display_status', display_status, 'decided_at', manager_decided_at, 'submitted_at', submitted_at
    ) ORDER BY submitted_at DESC, fr_wo_id DESC), '[]'::jsonb) AS items
    FROM (SELECT * FROM requests_raw ORDER BY submitted_at DESC, fr_wo_id DESC LIMIT 5) t
  )

  -- ── Ensamblado final (plan_v2.md §7.3: forma exacta del payload) ────────────────────
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'engagement_id', eng.engagement_id,
      'engagement_code', eng.engagement_code,
      'engagement_name', eng.engagement_name,
      'client_legal_name', eng.client_legal_name,
      'role_key', v_role,
      'today', v_today,
      'week_start', v_week_start,
      'prev_week_start', v_prev_week_start,
      'period_start', p_start,
      'period_end', p_end,
      'alert_weeks', v_alert_weeks,
      'selected_accessible', true
    ),
    'detail', jsonb_build_object(
      'kpis', jsonb_build_object(
        'staffing', jsonb_build_object(
          'current', jsonb_build_object('logged', ks.current_logged, 'assigned', ks.current_assigned),
          'previous', jsonb_build_object('logged', ks.previous_logged, 'assigned', ks.previous_assigned)
        ),
        'pending_approval', jsonb_build_object('last_week_hours', kp.last_week_hours, 'aged_hours', kp.aged_hours),
        'last_time_entry', jsonb_build_object(
          'date', kle.last_date,
          'days', CASE WHEN kle.last_date IS NULL THEN NULL ELSE (v_today - kle.last_date) END
        ),
        'last_approval', jsonb_build_object(
          'date', kla.last_at::date,
          'days', CASE WHEN kla.last_at IS NULL THEN NULL ELSE (v_today - kla.last_at::date) END
        )
      ),
      'budget', jsonb_build_object(
        'budget_hours', bh.hours, 'actual_hours', ah.hours,
        'consumed_percent', CASE WHEN bh.hours > 0 THEN (ah.hours / bh.hours) * 100 ELSE 0 END
      ),
      'breakdown', bj.items,
      'team', jsonb_build_object(
        'partner', tr.partner, 'manager', tr.manager, 'encargado', tr.encargado,
        'specialist_it', tr.specialist_it, 'specialist_tax', tr.specialist_tax, 'sqr', tr.sqr
      ),
      'staffing', jsonb_build_object('people', pj.items, 'weeks', wj.items),
      'expenses', jsonb_build_object(
        'budget_bob', ebb.budget_bob, 'executed_bob', ebc.executed_bob,
        'executed_percent', CASE WHEN ebb.budget_bob > 0 THEN (ebc.executed_bob / ebb.budget_bob) * 100 ELSE 0 END,
        'approved', aej.items, 'pending', pej.items, 'requests', rj.items
      ),
      'approval_queue', jsonb_build_object(
        'total_hours', aqj.total_hours, 'distinct_people', aqj.distinct_people, 'items', aqj.items
      )
    )
  )
  FROM eng
  CROSS JOIN kpi_staffing ks
  CROSS JOIN kpi_pending kp
  CROSS JOIN kpi_last_entry kle
  CROSS JOIN kpi_last_approval kla
  CROSS JOIN budget_hours_cte bh
  CROSS JOIN actual_hours_cte ah
  CROSS JOIN breakdown_json bj
  CROSS JOIN team_raw tr
  CROSS JOIN people_json pj
  CROSS JOIN weeks_json wj
  CROSS JOIN expense_budget_bob ebb
  CROSS JOIN executed_bob_cte ebc
  CROSS JOIN approved_expenses_json aej
  CROSS JOIN pending_expenses_json pej
  CROSS JOIN requests_json rj
  CROSS JOIN approval_queue_json aqj
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 6. Cierre: COMMENT ON + REVOKE ALL FROM PUBLIC + GRANT EXECUTE (patrón 20260917160000)
-- ═══════════════════════════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION public.can_read_engagement_dashboard(uuid) IS 'dash_encargo (decisiones.md §2, plan_v2.md §7.1): única materialización del alcance por rol de la pestaña Encargo. Fail-closed (ELSE false); NUNCA lee authorization_role_permissions.scope_key -- risk_partner se trata igual que partner/director. sqr entra SOLO por partner_id (ser sqr_id de un encargo no da acceso aqui, esas horas ya se ven en Práctica).';

COMMENT ON FUNCTION public.list_dashboard_engagements() IS 'dash_encargo (plan_v2.md §7.2; corrección post-ejecución): alimenta EngagementSelector con el alcance completo de decisiones.md §2 (encargado_id/specialist_it_id/specialist_tax_id incluidos, no solo partner_id/manager_id como el filtro legacy de EngagementSelector.tsx). Mismo mapeo rol->campo que can_read_engagement_dashboard(), inline por rendimiento. Filtro de "activo" idéntico al legacy: status=active y engagement_state_override NOT IN (6,7). Agrega funcion=1 (Cliente, no en can_read_engagement_dashboard() a propósito -- ver comentario en el CREATE) para no listar encargos administrativos, y devuelve end_date (nullable) para que el frontend autoseleccione el encargo con fecha de fin más próxima.';

COMMENT ON FUNCTION public.engagement_overview(uuid, date, date) IS 'dash_encargo (decisiones.md §4, plan_v2.md §7.3-§7.5; corrección post-ejecución #2): payload completo de la pestaña Encargo (4 KPI sin montos, consumo de presupuesto, desglose Categoría->Actividad, equipo responsable, staffing con 9 semanas precargadas, gastos normalizados a BOB, cola de aprobación por persona) en un único round-trip/instantánea MVCC. Un encargo fuera de alcance o inexistente devuelve selected_accessible=false + detail=null, SIN excepción (no distingue "no existe" de "no es tuyo"). R-1: las vistas vw_* que usa son security_invoker=on pero corren sin RLS dentro de este SECURITY DEFINER -- por eso can_read_engagement_dashboard() corre antes de cualquier CTE y cada CTE que toca una vista filtra por engagement_id. R-3 (heredado, sin cambios): vw_wo_budget_hours_by_category no filtra por version/status de la worksheet, puede doble-contar si un WO tiene mas de una hoja -- mismo comportamiento que la pestaña actual. R-4 (deliberado, decisiones.md §4.1): horas cargadas sin fila en timesheet_line_approvals NUNCA cuentan como "pendientes", pero sí como Cargado/consumo -- también aplica a approval_queue, que se alimenta de la misma pending_lines. D-1: "semanas del rango" para Asignado = semanas calendario tocadas (lunes a lunes), no fracciones. Gastos: "ejecutado" = SOLO revisado_asistente (decisiones.md §4.6, corrige la inconsistencia de portfolio_overview() que sí cuenta aprobado_gerente -- ese bug de Cartera queda fuera de alcance de esta migración). Solicitudes excluyen fund_requests.status=borrador. approval_queue: consolida pending_lines POR PERSONA (staff_id) -- hours es la SUMA de todas sus líneas pendientes en este encargo (no solo la más vieja, a diferencia de portfolio_overview() en dash_cartera), weeks_old es el de su línea más antigua, alert reutiliza el mismo v_alert_weeks que aged_hours (ninguna fuente de verdad nueva); "crítico" en el frontend (review.md iteración 1, MF-05) es exactamente este alert, sin un segundo escalón más severo -- encargoOverviewAggregation.ts no calcula ningún umbral adicional.';

REVOKE ALL ON FUNCTION public.can_read_engagement_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_engagement_dashboard(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_dashboard_engagements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_dashboard_engagements() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.engagement_overview(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engagement_overview(uuid, date, date) TO authenticated, service_role;

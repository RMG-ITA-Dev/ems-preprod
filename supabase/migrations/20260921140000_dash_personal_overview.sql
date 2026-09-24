-- FEAT dash_personal: rediseño de la pestaña Personal (bugs/dashboard/personal/plan_v2.md
-- secciones 3, 6, 7; decisiones de negocio en bugs/dashboard/personal/decisiones.md).
--
-- Crea un único RPC SECURITY DEFINER, `personal_overview(date, date)`, que alimenta toda la
-- pestaña en un round-trip. A diferencia de dash_encargo/dash_cartera no agrega ningún
-- permiso nuevo: `dashboard.personal.read` ya está concedido a los 22 role_key operativos
-- desde el seed real de producción (20251204001004_cero_13_seed_authorization_rbac.sql) --
-- plan_v2.md §2 punto 1 asume ese estado, no lo crea.
--
-- No se crea ni modifica ninguna policy de RLS (plan_v2.md §6.2): el RPC filtra
-- explícitamente por `staff_id = get_my_staff_id()` en cada CTE que toca
-- engagement_assignments/time_entries/timesheet_periods/fund_requests -- nunca acepta un
-- identificador de empleado como parámetro, así que ni siquiera un admin puede pedir datos
-- de otra persona a través de este RPC.
--
-- Nada de esto se aplica aquí a ningún Supabase real (ni Lovable, ni Dev 2.0, ni Test) --
-- solo se crea el archivo, per instrucción explícita del operador.

CREATE OR REPLACE FUNCTION public.personal_overview(
  p_history_start date,
  p_history_end   date
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id        uuid;
  v_today           date;
  v_week_start      date;
  v_operational_end date;
  v_result          jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: no session';
  END IF;
  IF NOT public.has_permission('dashboard.personal.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.personal.read';
  END IF;
  IF p_history_start IS NULL OR p_history_end IS NULL OR p_history_start > p_history_end THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  v_today           := ((now() AT TIME ZONE 'America/La_Paz')::date);
  v_week_start      := date_trunc('week', v_today)::date;
  v_operational_end := v_week_start + 27; -- semana actual + 3 siguientes (lunes-domingo, decisiones.md)
  v_staff_id        := public.get_my_staff_id();

  -- Sesión autenticada sin ficha de personal asociada: estado vacío explícito
  -- (has_staff_record=false), sin excepción -- plan_v2.md §6.1. El factory TypeScript
  -- (emptyPersonalOverviewPayload / toPersonalViewModel) completa el resto de forma segura.
  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object(
      'meta', jsonb_build_object(
        'has_staff_record', false,
        'today', v_today,
        'current_week_start', v_week_start,
        'operational_end', v_operational_end,
        'history_start', p_history_start,
        'history_end', p_history_end,
        'generated_at', now()
      ),
      'current_week', '{}'::jsonb,
      'workload_weeks', '[]'::jsonb,
      'assignments', '[]'::jsonb,
      'current_week_engagements', '[]'::jsonb,
      'compliance_weeks', '[]'::jsonb,
      'fund_requests', '[]'::jsonb,
      'historical', '{}'::jsonb
    );
  END IF;

  v_result := (
  WITH
  -- review.md dash_personal iteración 3, G-01 (2026-09-22): timesheet_periods.deadline
  -- nunca se puebla (el INSERT de useTimesheetWeek.ts la omite) -- el vencimiento real de
  -- envío se deriva del mismo ajuste que ya usa portfolio_overview() para su Cola de
  -- aprobación (TS_EMPLOYEE_RETRO_DAYS, 20260917160000:196-200), NO de esa columna.
  retro_days_ctx AS (
    SELECT COALESCE(
      (SELECT setting_value::int FROM public.global_settings WHERE setting_key = 'TS_EMPLOYEE_RETRO_DAYS'),
      30
    ) AS retro_days
  ),
  -- ── Asignaciones propias que solapan la ventana operativa (semana actual + 3 siguientes,
  -- inclusive) -- decisiones.md §14: hours_per_week completo por cada fila que solape,
  -- ningún prorrateo. Filtra deleted_at/CANCELLED, igual que dash_encargo. ──────────────────
  assignments_window AS (
    SELECT ea.assignment_id, ea.engagement_id, ea.start_date, ea.end_date,
           ea.hours_per_week, ea.status,
           e.engagement_code, e.engagement_name, e.funcion AS function_code
    FROM public.engagement_assignments ea
    JOIN public.engagements e ON e.engagement_id = ea.engagement_id
    WHERE ea.staff_id = v_staff_id
      AND ea.deleted_at IS NULL
      AND ea.status <> 'CANCELLED'
      AND ea.start_date <= v_operational_end
      AND ea.end_date >= v_week_start
  ),
  assignments_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'assignment_id', assignment_id, 'engagement_id', engagement_id,
      'engagement_code', engagement_code, 'engagement_name', engagement_name,
      'function_code', function_code, 'start_date', start_date, 'end_date', end_date,
      'hours_per_week', hours_per_week, 'status', status
    ) ORDER BY start_date, engagement_code NULLS LAST, assignment_id), '[]'::jsonb) AS items
    FROM assignments_window
  ),

  -- ── Horas planificadas vs. guardadas -- 4 semanas lunes-domingo (offset 0..3) ───────────
  workload_weeks_base AS (
    SELECT gs AS week_offset,
           (v_week_start + (gs * 7)) AS week_start,
           (v_week_start + (gs * 7) + 6) AS week_end
    FROM generate_series(0, 3) gs
  ),
  workload_planned AS (
    SELECT wb.week_offset, COALESCE(SUM(aw.hours_per_week), 0) AS planned_hours
    FROM workload_weeks_base wb
    LEFT JOIN assignments_window aw
      ON aw.start_date <= wb.week_end AND aw.end_date >= wb.week_start
    GROUP BY wb.week_offset
  ),
  workload_saved AS (
    SELECT wb.week_offset, COALESCE(SUM(te.hours_logged), 0) AS saved_hours
    FROM workload_weeks_base wb
    LEFT JOIN public.time_entries te
      ON te.staff_id = v_staff_id AND te.is_forecast = false
     AND te.date_worked BETWEEN wb.week_start AND wb.week_end
    GROUP BY wb.week_offset
  ),
  workload_weeks_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'week_start', wb.week_start, 'week_end', wb.week_end,
      'planned_hours', wp.planned_hours, 'saved_hours', ws.saved_hours
    ) ORDER BY wb.week_offset), '[]'::jsonb) AS items
    FROM workload_weeks_base wb
    JOIN workload_planned wp ON wp.week_offset = wb.week_offset
    JOIN workload_saved ws ON ws.week_offset = wb.week_offset
  ),

  -- ── Semana actual: pronóstico (is_forecast=true, SOLO semana actual -- decisiones.md §18)
  -- y horas aprobadas (claves period_id+engagement_id+activity_id con una aprobación
  -- 'approved'). planned_hours/saved_hours reutilizan workload_planned/workload_saved
  -- offset=0 -- misma fuente, sin recalcular. ─────────────────────────────────────────────
  current_week_forecast AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS forecast_hours
    FROM public.time_entries te
    WHERE te.staff_id = v_staff_id AND te.is_forecast = true
      AND te.date_worked BETWEEN v_week_start AND (v_week_start + 6)
  ),
  current_week_approved AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS approved_hours
    FROM public.timesheet_periods tp
    JOIN public.time_entries te ON te.period_id = tp.period_id AND te.is_forecast = false
    WHERE tp.staff_id = v_staff_id AND tp.week_start_date = v_week_start
      AND EXISTS (
        SELECT 1 FROM public.timesheet_line_approvals tla
        WHERE tla.period_id = te.period_id AND tla.engagement_id = te.engagement_id
          AND tla.activity_id = te.activity_id AND tla.status = 'approved'
      )
  ),
  current_week_summary AS (
    SELECT
      (SELECT planned_hours FROM workload_planned WHERE week_offset = 0) AS planned_hours,
      (SELECT saved_hours FROM workload_saved WHERE week_offset = 0) AS saved_hours,
      (SELECT forecast_hours FROM current_week_forecast) AS forecast_hours,
      (SELECT approved_hours FROM current_week_approved) AS approved_hours
  ),

  -- ── Carga por encargo (semana actual): unión de asignadas y guardadas, decisiones.md §15 --
  -- un encargo con carga pero sin asignación no desaparece, uno solo asignado muestra
  -- saved_hours=0. ─────────────────────────────────────────────────────────────────────────
  current_week_assigned_by_eng AS (
    SELECT aw.engagement_id, aw.engagement_code, aw.engagement_name, aw.function_code,
      SUM(aw.hours_per_week) AS assigned_hours
    FROM assignments_window aw
    WHERE aw.start_date <= (v_week_start + 6) AND aw.end_date >= v_week_start
    GROUP BY aw.engagement_id, aw.engagement_code, aw.engagement_name, aw.function_code
  ),
  current_week_saved_by_eng AS (
    SELECT te.engagement_id, e.engagement_code, e.engagement_name, e.funcion AS function_code,
      SUM(te.hours_logged) AS saved_hours
    FROM public.time_entries te
    JOIN public.engagements e ON e.engagement_id = te.engagement_id
    WHERE te.staff_id = v_staff_id AND te.is_forecast = false
      AND te.date_worked BETWEEN v_week_start AND (v_week_start + 6)
    GROUP BY te.engagement_id, e.engagement_code, e.engagement_name, e.funcion
  ),
  current_week_engagements_union AS (
    SELECT
      COALESCE(a.engagement_id, s.engagement_id) AS engagement_id,
      COALESCE(a.engagement_code, s.engagement_code) AS engagement_code,
      COALESCE(a.engagement_name, s.engagement_name) AS engagement_name,
      COALESCE(a.function_code, s.function_code) AS function_code,
      COALESCE(a.assigned_hours, 0) AS assigned_hours,
      COALESCE(s.saved_hours, 0) AS saved_hours
    FROM current_week_assigned_by_eng a
    FULL OUTER JOIN current_week_saved_by_eng s ON s.engagement_id = a.engagement_id
  ),
  current_week_engagements_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'engagement_id', engagement_id, 'engagement_code', engagement_code,
      'engagement_name', engagement_name, 'function_code', function_code,
      'assigned_hours', assigned_hours, 'saved_hours', saved_hours
    ) ORDER BY engagement_code NULLS LAST, engagement_id), '[]'::jsonb) AS items
    FROM current_week_engagements_union
  ),

  -- ── Cumplimiento de timesheets: 12 semanas totales, 9 anteriores + actual + 2 futuras
  -- (decisiones.md §13, offset -9..2). Máquina de estados exacta de plan_v2.md §4.2. ───────
  compliance_base AS (
    SELECT gs AS week_offset,
           (v_week_start + (gs * 7)) AS week_start,
           (v_week_start + (gs * 7) + 6) AS week_end
    FROM generate_series(-9, 2) gs
  ),
  compliance_period AS (
    -- review.md iteración 3, G-01: deadline derivado (week_end + retro_days), no
    -- tp.deadline (columna real pero nunca poblada por el flujo de carga de horas).
    SELECT cb.week_offset, tp.period_id, tp.submitted_at,
           cb.week_end + (SELECT retro_days FROM retro_days_ctx) AS deadline
    FROM compliance_base cb
    LEFT JOIN public.timesheet_periods tp
      ON tp.staff_id = v_staff_id AND tp.week_start_date = cb.week_start
  ),
  compliance_saved AS (
    SELECT cb.week_offset, COALESCE(SUM(te.hours_logged), 0) AS saved_hours
    FROM compliance_base cb
    LEFT JOIN public.time_entries te
      ON te.staff_id = v_staff_id AND te.is_forecast = false
     AND te.date_worked BETWEEN cb.week_start AND cb.week_end
    GROUP BY cb.week_offset
  ),
  compliance_approved AS (
    SELECT cp.week_offset, COALESCE(SUM(te.hours_logged), 0) AS approved_hours
    FROM compliance_period cp
    LEFT JOIN public.time_entries te
      ON te.period_id = cp.period_id AND te.is_forecast = false
     AND EXISTS (
        SELECT 1 FROM public.timesheet_line_approvals tla
        WHERE tla.period_id = te.period_id AND tla.engagement_id = te.engagement_id
          AND tla.activity_id = te.activity_id AND tla.status = 'approved'
      )
    WHERE cp.period_id IS NOT NULL
    GROUP BY cp.week_offset
  ),
  compliance_approval_flags AS (
    SELECT cp.week_offset,
      bool_or(tla.status = 'rejected') AS has_rejected,
      COUNT(tla.approval_id) AS approval_count,
      bool_and(tla.status = 'approved') AS all_approved
    FROM compliance_period cp
    LEFT JOIN public.timesheet_line_approvals tla ON tla.period_id = cp.period_id
    WHERE cp.period_id IS NOT NULL
    GROUP BY cp.week_offset
  ),
  -- Toda review_notes no vacía viaja con su estado real, incluida una línea que volvió a
  -- 'pending' por useRequestRevision -- decisiones.md §4/plan_v2.md §4.2 R-4: nunca se
  -- etiqueta "Observado", la etiqueta sigue siendo la del estado real de la línea.
  compliance_review_notes AS (
    SELECT cp.week_offset,
      COALESCE(jsonb_agg(jsonb_build_object(
        'approval_id', tla.approval_id,
        'approval_status', tla.status,
        'engagement_id', tla.engagement_id,
        'engagement_code', e.engagement_code,
        'engagement_name', e.engagement_name,
        'activity_id', tla.activity_id,
        'activity_code', ac.activity_code,
        'notes', tla.review_notes
      ) ORDER BY tla.updated_at DESC NULLS LAST, tla.approval_id)
        FILTER (WHERE tla.review_notes IS NOT NULL AND tla.review_notes <> ''), '[]'::jsonb) AS items
    FROM compliance_period cp
    LEFT JOIN public.timesheet_line_approvals tla ON tla.period_id = cp.period_id
    LEFT JOIN public.engagements e ON e.engagement_id = tla.engagement_id
    LEFT JOIN public.activity_codes ac ON ac.activity_id = tla.activity_id
    WHERE cp.period_id IS NOT NULL
    GROUP BY cp.week_offset
  ),
  compliance_rows AS (
    SELECT
      cb.week_offset, cb.week_start, cb.week_end,
      cp.period_id, cp.deadline, cp.submitted_at,
      COALESCE(cs.saved_hours, 0) AS saved_hours,
      COALESCE(ca.approved_hours, 0) AS approved_hours,
      COALESCE(crn.items, '[]'::jsonb) AS review_notes,
      CASE
        WHEN cb.week_start > v_week_start THEN 'FUTURE'
        WHEN cp.period_id IS NULL AND COALESCE(cs.saved_hours, 0) = 0 THEN 'NOT_LOGGED'
        WHEN cp.period_id IS NULL AND COALESCE(cs.saved_hours, 0) > 0 THEN 'NOT_SUBMITTED'
        WHEN cp.period_id IS NOT NULL AND cp.submitted_at IS NULL THEN 'DRAFT'
        WHEN cp.period_id IS NOT NULL AND cp.submitted_at IS NOT NULL
             AND COALESCE(caf.has_rejected, false) THEN 'REJECTED'
        WHEN cp.period_id IS NOT NULL AND cp.submitted_at IS NOT NULL
             AND COALESCE(caf.approval_count, 0) > 0 AND COALESCE(caf.all_approved, false) THEN 'APPROVED'
        ELSE 'PENDING'
      END AS status
    FROM compliance_base cb
    LEFT JOIN compliance_period cp ON cp.week_offset = cb.week_offset
    LEFT JOIN compliance_saved cs ON cs.week_offset = cb.week_offset
    LEFT JOIN compliance_approved ca ON ca.week_offset = cb.week_offset
    LEFT JOIN compliance_approval_flags caf ON caf.week_offset = cb.week_offset
    LEFT JOIN compliance_review_notes crn ON crn.week_offset = cb.week_offset
  ),
  compliance_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'week_start', week_start, 'week_end', week_end, 'status', status,
      'saved_hours', saved_hours, 'approved_hours', approved_hours,
      'period_id', period_id, 'deadline', deadline, 'submitted_at', submitted_at,
      'review_notes', review_notes
    ) ORDER BY week_offset), '[]'::jsonb) AS items
    FROM compliance_rows
  ),

  -- ── Fondos y gastos: solicitudes propias, excluidas 'cerrado'/'cancelado' (decisiones.md
  -- §3.3). Cada importe se agrupa por SU PROPIA moneda de fuente -- solicitud/desembolso por
  -- fund_requests.currency, gastos por fund_request_expenses.currency -- nunca se suman BOB
  -- y USD (decisiones.md §4/plan_v2.md §4.3). No se toca ningún trigger de moneda. ─────────
  fund_requests_scope AS (
    SELECT fr.*
    FROM public.fund_requests fr
    WHERE fr.requester_staff_id = v_staff_id
      AND fr.status NOT IN ('cerrado', 'cancelado')
  ),
  fr_currencies AS (
    SELECT frs.fund_request_id, frs.currency AS c FROM fund_requests_scope frs
    UNION
    SELECT fre.fund_request_id, fre.currency
    FROM public.fund_request_expenses fre
    JOIN fund_requests_scope frs2 ON frs2.fund_request_id = fre.fund_request_id
  ),
  fr_amounts AS (
    SELECT
      fc.fund_request_id, fc.c AS currency,
      CASE WHEN frs.currency = fc.c THEN frs.total_requested_amount ELSE 0 END AS requested_amount,
      CASE WHEN frs.currency = fc.c THEN frs.total_disbursed_amount ELSE 0 END AS disbursed_amount,
      COALESCE((SELECT SUM(fre.amount) FROM public.fund_request_expenses fre
         WHERE fre.fund_request_id = fc.fund_request_id AND fre.currency = fc.c), 0) AS expenses_loaded_amount,
      COALESCE((SELECT SUM(fre.amount) FROM public.fund_request_expenses fre
         WHERE fre.fund_request_id = fc.fund_request_id AND fre.currency = fc.c
           AND fre.status IN ('aprobado_gerente', 'revisado_asistente')), 0) AS manager_approved_amount,
      COALESCE((SELECT SUM(fre.amount) FROM public.fund_request_expenses fre
         WHERE fre.fund_request_id = fc.fund_request_id AND fre.currency = fc.c
           AND fre.status = 'revisado_asistente'), 0) AS accounting_reviewed_amount
    FROM fr_currencies fc
    JOIN fund_requests_scope frs ON frs.fund_request_id = fc.fund_request_id
  ),
  fr_amounts_json AS (
    SELECT fund_request_id,
      jsonb_agg(jsonb_build_object(
        'currency', currency, 'requested_amount', requested_amount, 'disbursed_amount', disbursed_amount,
        'expenses_loaded_amount', expenses_loaded_amount, 'manager_approved_amount', manager_approved_amount,
        'accounting_reviewed_amount', accounting_reviewed_amount
      ) ORDER BY currency) AS items
    FROM fr_amounts
    GROUP BY fund_request_id
  ),
  fr_expenses_json AS (
    SELECT fund_request_id,
      COALESCE(jsonb_agg(jsonb_build_object(
        'expense_id', fre_id, 'expense_date', expense_date, 'description', description,
        'status', status, 'currency', currency, 'amount', amount,
        -- review.md Iteración 2, MUST FIX R2.1: attachment_url no tiene CHECK contra
        -- cadena vacía; checklist_verificacion.md PT-36 define "sin respaldo" como
        -- attachment_url vacío, no solo NULL.
        'has_attachment', (NULLIF(btrim(attachment_url), '') IS NOT NULL),
        'has_invoice_observation', has_invoice_observation,
        'invoice_observation_notes', invoice_observation_notes,
        'returned_by_assistant', returned_by_assistant,
        'manager_notes', manager_notes,
        'rejection_reason', rejection_reason
      ) ORDER BY expense_date DESC, fre_id), '[]'::jsonb) AS items
    FROM public.fund_request_expenses
    WHERE fund_request_id IN (SELECT fund_request_id FROM fund_requests_scope)
    GROUP BY fund_request_id
  ),
  fund_requests_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fund_request_id', frs.fund_request_id,
      'request_number', frs.request_number,
      'purpose', frs.purpose,
      'status', frs.status,
      'request_currency', frs.currency,
      'due_back_date', frs.due_back_date,
      'amounts_by_currency', COALESCE(faj.items, '[]'::jsonb),
      'expenses', COALESCE(fej.items, '[]'::jsonb)
    ) ORDER BY COALESCE(frs.submitted_at, frs.created_at) DESC, frs.fund_request_id), '[]'::jsonb) AS items
    FROM fund_requests_scope frs
    LEFT JOIN fr_amounts_json faj ON faj.fund_request_id = frs.fund_request_id
    LEFT JOIN fr_expenses_json fej ON fej.fund_request_id = frs.fund_request_id
  ),

  -- ── Histórico: SOLO horas guardadas por los parámetros del selector global -- no
  -- reconstruye asignaciones históricas (decisiones.md §16/plan_v2.md §3.3). ──────────────
  historical_saved AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS saved_hours
    FROM public.time_entries te
    WHERE te.staff_id = v_staff_id AND te.is_forecast = false
      AND te.date_worked BETWEEN p_history_start AND p_history_end
  ),
  historical_by_engagement AS (
    SELECT te.engagement_id, e.engagement_code, e.engagement_name, e.funcion AS function_code,
      SUM(te.hours_logged) AS saved_hours
    FROM public.time_entries te
    JOIN public.engagements e ON e.engagement_id = te.engagement_id
    WHERE te.staff_id = v_staff_id AND te.is_forecast = false
      AND te.date_worked BETWEEN p_history_start AND p_history_end
    GROUP BY te.engagement_id, e.engagement_code, e.engagement_name, e.funcion
  ),
  historical_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'engagement_id', engagement_id, 'engagement_code', engagement_code,
      'engagement_name', engagement_name, 'function_code', function_code,
      'saved_hours', saved_hours
    ) ORDER BY saved_hours DESC, engagement_code NULLS LAST), '[]'::jsonb) AS items
    FROM historical_by_engagement
  )

  -- ── Ensamblado final (plan_v2.md §3.2: forma exacta del payload) ────────────────────────
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'has_staff_record', true,
      'today', v_today,
      'current_week_start', v_week_start,
      'operational_end', v_operational_end,
      'history_start', p_history_start,
      'history_end', p_history_end,
      'generated_at', now()
    ),
    'current_week', jsonb_build_object(
      'planned_hours', cws.planned_hours,
      'saved_hours', cws.saved_hours,
      'forecast_hours', cws.forecast_hours,
      'approved_hours', cws.approved_hours
    ),
    'workload_weeks', wwj.items,
    'assignments', aj.items,
    'current_week_engagements', cwej.items,
    'compliance_weeks', cj.items,
    'fund_requests', frj.items,
    'historical', jsonb_build_object(
      'saved_hours', hs.saved_hours,
      'by_engagement', hbe.items
    )
  )
  FROM current_week_summary cws
  CROSS JOIN workload_weeks_json wwj
  CROSS JOIN assignments_json aj
  CROSS JOIN current_week_engagements_json cwej
  CROSS JOIN compliance_json cj
  CROSS JOIN fund_requests_json frj
  CROSS JOIN historical_saved hs
  CROSS JOIN historical_json hbe
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.personal_overview(date, date) IS 'dash_personal (decisiones.md, plan_v2.md §3/§6): vista propia operativa e histórica de la pestaña Personal en un único payload/round-trip. staff_id SIEMPRE derivado de get_my_staff_id() -- la función no acepta un identificador de empleado y no crea ni depende de ninguna policy nueva de autovisualización sobre engagement_assignments. Sin ficha de personal -> has_staff_record=false, sin excepción. Horas planificadas = hours_per_week completo por cada asignación propia (no eliminada, no CANCELLED) que solape inclusivamente la ventana operativa (semana actual + 3 siguientes) -- sin prorrateo. Horas guardadas = time_entries.is_forecast=false, independientes del estado de envío/aprobación. Pronóstico (is_forecast=true) se devuelve SOLO en current_week.forecast_hours, exclusivamente semana actual -- nunca cuenta como guardada, aprobada, de cumplimiento ni histórica. compliance_weeks: 12 semanas exactas (9 anteriores + actual + 2 futuras), máquina de estados de plan_v2.md §4.2 (REJECTED prevalece sobre APPROVED/PENDING; una semana enviada sin aprobaciones nunca es APPROVED); toda review_notes no vacía viaja con su estado real, incluida una línea vuelta a pending por revisión solicitada -- nunca se inventa un estado Observado. Fondos: aprobado_gerente se deja tal cual (el frontend lo presenta como Pendiente de contabilidad); cada importe se agrupa por su propia moneda de fuente (solicitud/desembolso por fund_requests.currency, gastos por fund_request_expenses.currency) -- nunca se suman BOB y USD, y no se toca fre_validate_wo_in_request()/fund_requests_enforce_bob(). Excluye solicitudes cerrado/cancelado. historical solo trae horas guardadas para los parámetros p_history_start/p_history_end -- no reconstruye asignaciones históricas.';

-- REVOKE ... FROM PUBLIC a secas no alcanza: Supabase le da a anon/authenticated un grant
-- DIRECTO sobre funciones nuevas (default privileges), que revocar PUBLIC no toca -- ya
-- causó un endpoint abierto real una vez (ver comentario de 00-shim-auth.sql). REVOKE
-- explícito de anon también, antes de conceder solo a authenticated/service_role.
REVOKE ALL ON FUNCTION public.personal_overview(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personal_overview(date, date) TO authenticated, service_role;

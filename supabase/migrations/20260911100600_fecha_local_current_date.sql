--
-- FIX: CURRENT_DATE se evaluaba en UTC y adelantaba el dia a partir de las 20:00 en Bolivia.
--
-- NO es una migracion de notificaciones, igual que 20260911100500 (el numerador de solicitudes).
-- Se encontro revisando los recordatorios de timesheet, que consumen get_week_statuses(). Vive en
-- su propio archivo para que revertir las notificaciones no arrastre este arreglo.
--
-- =====================================================================
-- EL PROBLEMA
-- =====================================================================
--
-- CURRENT_DATE devuelve la fecha segun el GUC `TimeZone` de la sesion, y Supabase deja la base en
-- UTC (ninguna migracion del repositorio lo cambia). La Paz es UTC-4, asi que entre las 20:00 y
-- la medianoche CURRENT_DATE ya es el dia siguiente. Las dos funciones que lo usan deciden con
-- eso que semana es "la actual" y hasta que dia acumular horas esperadas y feriados:
--
--   * get_week_statuses()    -> v_is_current, y el tope de los dias habiles y feriados contados
--   * get_my_pending_hours() -> el corte de la semana en curso, que se excluye del pendiente
--
-- El corte feo es el domingo a las 20:00 hora local: la semana "actual" salta a la siguiente
-- cuatro horas antes de tiempo, y con ella el calculo de horas pendientes. Los recordatorios de
-- timesheet que agrega esta rama consumen get_week_statuses(), asi que heredaban el corrimiento.
--
-- =====================================================================
-- POR QUE UNA MIGRACION ADELANTE Y NO EDITAR cero_02
-- =====================================================================
--
-- Las dos funciones NACEN en 20251204000002_cero_02_functions_tables_views.sql, y arreglarlas
-- ahi parece lo natural: una sola definicion, y una base nueva sale correcta de entrada. Se
-- probo, y esta mal, porque hay DOS poblaciones de proyectos (docs/operations.md, Deployment):
--
--   * los poblados con `supabase db push` llevan ledger en supabase_migrations.schema_migrations,
--     asi que un push posterior SALTEA cero_02 y se quedan con CURRENT_DATE para siempre;
--   * los poblados pegando SQL en el editor de Studio no tienen ledger y re-corren todo.
--
-- Editar cero_02 solo alcanza a los segundos. Y hay precedente en este mismo repositorio:
-- 20260825000100_authz_restore_legacy_app_role_mapping.sql arregla un bug DENTRO de la
-- consolidacion con una migracion incremental adelante, razonando sobre estas mismas dos
-- poblaciones. Ademas el set cero_* esta verificado contra el fingerprint del historial previo
-- (docs/operations.md), y editarlo invalida esa verificacion.
--
-- Costo aceptado: los cuerpos quedan repetidos entre cero_02 y este archivo. Es el costo normal
-- del historial de migraciones — cero_02 pasa a ser el registro de como se aplico, y ESTE es la
-- definicion vigente. Quien cambie estas funciones toca este archivo, no aquel.
--
-- =====================================================================
-- POR QUE NO SE CAMBIA EL TIMEZONE DE LA BASE
-- =====================================================================
--
--     ALTER DATABASE postgres SET timezone = 'America/La_Paz';
--
-- arregla estas dos funciones y de paso cambia now(), CURRENT_DATE y como PostgREST serializa
-- TODO timestamptz de la aplicacion. Es un cambio global para un problema de cuatro expresiones,
-- y ademas invisible: no queda rastro en el repositorio de por que la base se comporta asi.
--
-- Se hace explicito en el codigo, que es lo que ya hacen las migraciones de notificaciones
-- (6 usos de AT TIME ZONE 'America/La_Paz' en el archivo de disparadores) y el propio cero_02 en
-- otros cuatro lugares. El raro era CURRENT_DATE, no esta expresion.
--
-- Lo verifica supabase/tests/rpc-fecha-local.sql, que mira la funcion VIVA: da igual de que
-- archivo salga la definicion, lo que se afirma es el estado final.
--

-- =====================================================================
-- A) get_my_pending_hours
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_my_pending_hours(p_staff_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_hire_date date;
  v_end_date date;
  v_capacity numeric;
  v_staff_city text;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_gap numeric;
  v_result jsonb := '[]'::jsonb;
  -- Se calcula UNA vez, igual que get_week_statuses con su v_today: repetir la expresion en cada
  -- uso abre la puerta a que queden dos fechas distintas en la misma llamada.
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
BEGIN
  SELECT s.hire_date, s.weekly_capacity_hours, s.termination_date, s.city
  INTO v_hire_date, v_capacity, v_end_date, v_staff_city
  FROM public.staff s WHERE s.staff_id = p_staff_id;

  IF v_hire_date IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_end_date := LEAST(COALESCE(v_end_date, v_today), v_today);
  v_daily := COALESCE(v_capacity, 40) / 5.0;

  -- Start from Monday of hire_date's week
  v_cursor := v_hire_date - (EXTRACT(ISODOW FROM v_hire_date)::int - 1);

  WHILE v_cursor <= v_end_date LOOP
    v_week_end := v_cursor + 4;  -- Friday

    -- Skip current/incomplete week (ascending order, so EXIT is safe)
    IF v_week_end >= v_today THEN
      EXIT;
    END IF;

    v_eff_start := GREATEST(v_cursor, v_hire_date);
    v_eff_end := LEAST(v_week_end, v_end_date);

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
    FROM public.holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
      AND (
        h.oficina = 0
        OR (h.oficina = 1 AND v_staff_city = 'La Paz')
        OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
      );

    v_working_days := v_working_days - v_holiday_count;

    IF v_working_days > 0 THEN
      v_expected := v_working_days * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM public.time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_gap := v_expected - v_actual;

      IF v_gap > 0 THEN
        v_result := v_result || jsonb_build_object(
          'week_start', v_cursor,
          'expected_hours', v_expected,
          'actual_hours', v_actual,
          'gap', v_gap
        );
      END IF;
    END IF;

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_my_pending_hours(uuid) IS
  'Semanas cerradas con horas faltantes. La fecha de corte se calcula en America/La_Paz: con CURRENT_DATE (UTC) la semana en curso se excluia un dia antes a partir de las 20:00 hora local.';

-- =====================================================================
-- B) get_week_statuses
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_week_statuses(p_staff_id uuid, p_start_date date, p_end_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_hire_date date;
  v_term_date date;
  v_capacity numeric;
  v_staff_city text;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_missing numeric;
  v_period_id uuid;
  v_submitted_at timestamptz;
  v_status text;
  v_is_current boolean;
  v_approval_total integer;
  v_approval_approved integer;
  v_approval_rejected integer;
  v_result jsonb := '[]'::jsonb;
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
BEGIN
  -- Get staff info
  SELECT s.hire_date, s.termination_date, s.weekly_capacity_hours, s.city
  INTO v_hire_date, v_term_date, v_capacity, v_staff_city
  FROM public.staff s WHERE s.staff_id = p_staff_id;

  v_daily := COALESCE(v_capacity, 40) / 5.0;

  -- Start from Monday of p_start_date's week
  v_cursor := p_start_date - (EXTRACT(ISODOW FROM p_start_date)::int - 1);

  WHILE v_cursor <= p_end_date LOOP
    v_week_end := v_cursor + 4;  -- Friday

    -- Clamp to hire/termination boundaries
    v_eff_start := v_cursor;
    v_eff_end := v_week_end;

    IF v_hire_date IS NOT NULL AND v_eff_start < v_hire_date THEN
      v_eff_start := v_hire_date;
    END IF;
    IF v_term_date IS NOT NULL AND v_eff_end > v_term_date THEN
      v_eff_end := v_term_date;
    END IF;

    -- Skip weeks entirely outside employment
    IF v_hire_date IS NOT NULL AND v_week_end < v_hire_date THEN
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;
    IF v_term_date IS NOT NULL AND v_cursor > v_term_date THEN
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;

    -- Determine if current week
    v_is_current := (v_cursor <= v_today AND v_week_end >= v_today);

    -- CURRENT week (Amendment A2: return it, don't exit)
    IF v_is_current THEN
      -- Still compute hours for informational purposes
      SELECT COUNT(*) INTO v_working_days
      FROM generate_series(v_eff_start, LEAST(v_eff_end, v_today), '1 day'::interval) d
      WHERE EXTRACT(ISODOW FROM d) <= 5;

      SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
      FROM public.holidays h
      WHERE h.holiday_date BETWEEN v_eff_start AND LEAST(v_eff_end, v_today)
        AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
        AND (
          h.oficina = 0
          OR (h.oficina = 1 AND v_staff_city = 'La Paz')
          OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
        );

      v_working_days := v_working_days - v_holiday_count;
      v_expected := GREATEST(v_working_days, 0) * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM public.time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_result := v_result || jsonb_build_object(
        'week_start', v_cursor,
        'week_end', v_week_end,
        'status', 'CURRENT',
        'total_logged_hours', v_actual,
        'expected_hours', v_expected,
        'missing_hours', GREATEST(v_expected - v_actual, 0),
        'is_submitted', false,
        'is_current_week', true
      );
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;

    -- FUTURE weeks
    IF v_cursor > v_today THEN
      v_result := v_result || jsonb_build_object(
        'week_start', v_cursor,
        'week_end', v_week_end,
        'status', 'FUTURE',
        'total_logged_hours', 0,
        'expected_hours', 0,
        'missing_hours', 0,
        'is_submitted', false,
        'is_current_week', false
      );
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;

    -- Past weeks: compute expected hours (holiday-aware)
    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
    FROM public.holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
      AND (
        h.oficina = 0
        OR (h.oficina = 1 AND v_staff_city = 'La Paz')
        OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
      );

    v_working_days := v_working_days - v_holiday_count;
    v_expected := GREATEST(v_working_days, 0) * v_daily;

    -- Sum actual logged hours
    SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
    FROM public.time_entries te
    WHERE te.staff_id = p_staff_id
      AND te.date_worked BETWEEN v_eff_start AND v_eff_end
      AND te.is_forecast = false;

    v_missing := GREATEST(v_expected - v_actual, 0);

    -- Look up timesheet_period
    SELECT tp.period_id, tp.submitted_at
    INTO v_period_id, v_submitted_at
    FROM public.timesheet_periods tp
    WHERE tp.staff_id = p_staff_id
      AND tp.week_start_date = v_cursor;

    -- Determine status
    IF v_period_id IS NULL THEN
      -- No period row
      IF v_actual > 0 THEN
        v_status := 'NOT_SUBMITTED';  -- Amendment A3
      ELSE
        v_status := 'NOT_LOGGED';
      END IF;
    ELSIF v_submitted_at IS NULL THEN
      v_status := 'DRAFT';
    ELSE
      -- Period submitted: check line approvals
      SELECT COUNT(*),
             COUNT(*) FILTER (WHERE tla.status = 'approved'),
             COUNT(*) FILTER (WHERE tla.status = 'rejected')
      INTO v_approval_total, v_approval_approved, v_approval_rejected
      FROM public.timesheet_line_approvals tla
      WHERE tla.period_id = v_period_id;

      IF v_approval_total = 0 THEN
        v_status := 'PENDING_APPROVAL';  -- Amendment A6
      ELSIF v_approval_approved = v_approval_total THEN
        v_status := 'APPROVED';
      ELSIF v_approval_rejected > 0 THEN
        v_status := 'REJECTED';
      ELSE
        v_status := 'PENDING_APPROVAL';
      END IF;
    END IF;

    v_result := v_result || jsonb_build_object(
      'week_start', v_cursor,
      'week_end', v_week_end,
      'status', v_status,
      'total_logged_hours', v_actual,
      'expected_hours', v_expected,
      'missing_hours', v_missing,
      'is_submitted', (v_submitted_at IS NOT NULL),
      'is_current_week', false
    );

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_week_statuses(uuid, date, date) IS
  'Estado semana a semana de la hoja de tiempo. El dia de hoy se calcula en America/La_Paz: con CURRENT_DATE (UTC) la semana marcada como actual saltaba a la siguiente el domingo a las 20:00 hora local.';

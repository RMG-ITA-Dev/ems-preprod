-- =====================================================================
-- get_week_statuses() / get_my_pending_hours() — la fecha de hoy es la de Bolivia
-- =====================================================================
--
-- Las dos funciones decidian que dia es hoy con CURRENT_DATE, que se evalua segun el GUC
-- `TimeZone` de la sesion. Supabase deja la base en UTC y La Paz es UTC-4, asi que de 20:00 a
-- medianoche hora local ya era el dia siguiente: la semana marcada como actual saltaba a la
-- siguiente el domingo a las 20:00, y con ella el calculo de horas pendientes.
--
-- Lo arregla 20260911100600_fecha_local_current_date.sql, que recrea las dos funciones con
-- CREATE OR REPLACE. NO se edita cero_02, donde nacen: los proyectos poblados con `supabase db
-- push` llevan ledger y saltean ese archivo para siempre, asi que el arreglo no les llegaria
-- (mismo razonamiento y mismo precedente que 20260825000100_authz_restore_legacy_app_role_mapping).
--
-- Por eso la asercion de convergencia mira la funcion VIVA con pg_get_functiondef() y no el texto
-- de ningun archivo: lo que importa es el estado final de la base, venga de donde venga la
-- definicion. Si alguien vuelve a poner CURRENT_DATE en cualquiera de los dos lados, salta igual.
--
-- Se fija America/La_Paz en el codigo y no con ALTER DATABASE ... SET timezone, que ademas moveria
-- now(), CURRENT_DATE y como PostgREST serializa todo timestamptz de la aplicacion. El propio
-- cero_02 ya usa (now() AT TIME ZONE 'America/La_Paz')::date en otros cuatro lugares: el raro era
-- CURRENT_DATE, no esta expresion.
--
-- Se prueba de dos formas, porque cada una atrapa una falla distinta:
--
--   1. CONVERGENCIA. El cuerpo de las dos funciones no puede volver a contener CURRENT_DATE. Esta
--      es la asercion que importa a largo plazo: las dos nacen en cero_02, y re-pegar esa
--      migracion —cosa que se hace— pisa la redefinicion posterior sin que nadie se entere. Es
--      determinista y no depende de la hora a la que corra la suite.
--
--   2. COMPORTAMIENTO. Con la sesion en un huso cualquiera, la semana que la funcion marca como
--      actual tiene que ser la que contiene la fecha de LA PAZ, no la del huso de la sesion.
--
-- Sobre los husos del punto 2: se prueba con Etc/GMT-14 (UTC+14) y Etc/GMT+12 (UTC-12), y con los
-- DOS a proposito. Ninguno solo alcanza — cada uno coincide con la fecha de La Paz durante parte
-- del dia, y la suite correria en esa franja sin detectar nada. UTC+14 va 18 horas adelante de La
-- Paz (difiere cuando la hora local es >= 06:00) y UTC-12 va 8 horas atras (difiere cuando es <
-- 08:00): entre los dos cubren las 24 horas, asi que a cualquier hora que corra la suite al menos
-- uno esta en otro dia que La Paz.
--
-- Nota de lectura: el nombre de los husos Etc/GMT tiene el signo invertido (POSIX), asi que
-- Etc/GMT-14 es UTC+14 y Etc/GMT+12 es UTC-12. No es un error de tipeo.
--
-- Marcador final: 'FECHA LOCAL: ALL CHECKS PASSED'

BEGIN;

DO $$
DECLARE
  c_staff constant uuid := '5f000000-0000-4000-8000-0000000000f1';
  c_auth  constant uuid := 'af000000-0000-4000-8000-0000000000f1';
  v_def       text;
  v_hoy       date;
  v_zona      text;
  v_semanas   jsonb;
  v_actual    date;
  v_cuantas   integer;
BEGIN
  -- ── 1. Convergencia: el cuerpo ya no consulta CURRENT_DATE ──
  --
  -- Los comentarios se sacan ANTES de buscar. pg_get_functiondef() devuelve el cuerpo entero,
  -- comentarios incluidos, y los de estas dos funciones explican por que NO se usa CURRENT_DATE:
  -- sin este recorte la asercion se disparaba con su propia explicacion. Alcanza con borrar de
  -- `--` a fin de linea (bandera `n`, que deja a `.` sin cruzar el salto) porque ninguna de las
  -- dos tiene un literal que contenga `--`.
  FOREACH v_def IN ARRAY ARRAY[
    regexp_replace(pg_get_functiondef('public.get_week_statuses(uuid, date, date)'::regprocedure),
                   '--.*', '', 'gn'),
    regexp_replace(pg_get_functiondef('public.get_my_pending_hours(uuid)'::regprocedure),
                   '--.*', '', 'gn')
  ] LOOP
    IF v_def ~ 'CURRENT_DATE' THEN
      RAISE EXCEPTION 'TEST FAIL - una de las funciones volvio a usar CURRENT_DATE: %',
        substring(v_def from 1 for 90);
    END IF;
    IF v_def !~ 'America/La_Paz' THEN
      RAISE EXCEPTION 'TEST FAIL - una de las funciones perdio el AT TIME ZONE America/La_Paz: %',
        substring(v_def from 1 for 90);
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS - ninguna de las dos funciones decide el dia con CURRENT_DATE';

  -- ── 2. Comportamiento: la semana actual es la de La Paz, no la de la sesion ──
  -- `staff.auth_user_id` tiene FK a auth.users, que en el harness la provee el shim.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES (c_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'tz-probe@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                            practica_id, society_id, weekly_capacity_hours, hire_date, city)
  VALUES (c_staff, c_auth, 'TZ', 'Probe', true,
          (SELECT practica_id FROM public.practicas WHERE code = 1),
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz');

  v_hoy := (now() AT TIME ZONE 'America/La_Paz')::date;

  FOREACH v_zona IN ARRAY ARRAY['Etc/GMT-14', 'Etc/GMT+12'] LOOP
    EXECUTE format('SET LOCAL TimeZone = %L', v_zona);

    -- La ventana abarca hoy para que la semana actual entre en el resultado.
    v_semanas := public.get_week_statuses(c_staff, v_hoy - 7, v_hoy + 7);

    SELECT COUNT(*) INTO v_cuantas
      FROM jsonb_array_elements(v_semanas) w
     WHERE (w->>'is_current_week')::boolean;
    IF v_cuantas <> 1 THEN
      RAISE EXCEPTION 'TEST FAIL - con la sesion en % hubo % semanas marcadas como actual, se esperaba 1',
        v_zona, v_cuantas;
    END IF;

    SELECT (w->>'week_start')::date INTO v_actual
      FROM jsonb_array_elements(v_semanas) w
     WHERE (w->>'is_current_week')::boolean;

    -- La semana corre de lunes a domingo; `week_start` es el lunes.
    IF v_hoy < v_actual OR v_hoy > v_actual + 6 THEN
      RAISE EXCEPTION 'TEST FAIL - con la sesion en % la semana actual arranca el % y hoy en La Paz es %',
        v_zona, v_actual, v_hoy;
    END IF;
  END LOOP;

  RESET TimeZone;
  RAISE NOTICE 'PASS - la semana actual la fija la fecha de La Paz y no el huso de la sesion';

  -- ── 3. get_my_pending_hours corta por la misma fecha ──
  -- Sin horas cargadas, la ultima semana reclamada tiene que ser la ANTERIOR a la de hoy en La
  -- Paz: la semana en curso se excluye por incompleta. Con CURRENT_DATE en un huso adelantado,
  -- el corte se movia y llegaba a reclamar la semana que todavia esta corriendo.
  FOREACH v_zona IN ARRAY ARRAY['Etc/GMT-14', 'Etc/GMT+12'] LOOP
    EXECUTE format('SET LOCAL TimeZone = %L', v_zona);

    SELECT max((w->>'week_start')::date) INTO v_actual
      FROM jsonb_array_elements(public.get_my_pending_hours(c_staff)) w;

    IF v_actual IS NULL THEN
      RAISE EXCEPTION 'TEST FAIL - con la sesion en % no se reclamo ninguna semana pendiente', v_zona;
    END IF;
    IF v_actual >= v_hoy - (EXTRACT(ISODOW FROM v_hoy)::int - 1) THEN
      RAISE EXCEPTION 'TEST FAIL - con la sesion en % se reclamo la semana en curso (arranca el %, hoy en La Paz es %)',
        v_zona, v_actual, v_hoy;
    END IF;
  END LOOP;

  RESET TimeZone;
  RAISE NOTICE 'PASS - las horas pendientes cortan en la semana en curso de La Paz';

  RAISE NOTICE 'FECHA LOCAL: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;

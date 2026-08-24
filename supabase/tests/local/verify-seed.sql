-- Verificación de datos del seed de Fase 4 (bugs/migracion_cero/plan_v2.md §4.3).
-- Corre contra un stack con el set consolidado renombrado + los 7 archivos de seed
-- (cero_10..cero_16) ya replayados desde volumen limpio, SIN intervención manual.
--
-- Uso: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/local/verify-seed.sql
--
-- Puramente de lectura — no abre transacción propia ni modifica datos. Cada chequeo
-- que falla aborta con RAISE EXCEPTION (psql sale con código != 0, ON_ERROR_STOP lo
-- propaga); cada chequeo que pasa imprime una NOTICE 'PASS — ...'. Marcador final:
-- 'VERIFY-SEED: ALL CHECKS PASSED'.

DO $$
DECLARE
  n            int;
  v_staff_id   uuid;
  v_auth_id    uuid;
  v_adm_id     uuid;
  v_setting    text;
  v_null_roles int;
BEGIN
  -- 1. Conteos por catálogo (plan §4.2).
  SELECT count(*) INTO n FROM public.society;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL — society: esperado 2, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — society: 2 filas';

  SELECT count(*) INTO n FROM public.industries;
  IF n <> 10 THEN RAISE EXCEPTION 'FAIL — industries: esperado 10, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — industries: 10 filas';

  SELECT count(*) INTO n FROM public.expense_types;
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL — expense_types: esperado 5, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — expense_types: 5 filas';

  SELECT count(*) INTO n FROM public.practicas;
  IF n <> 8 THEN RAISE EXCEPTION 'FAIL — practicas: esperado 8, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — practicas: 8 filas';

  SELECT count(*) INTO n FROM public.categories;
  IF n <> 61 THEN RAISE EXCEPTION 'FAIL — categories: esperado 61, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — categories: 61 filas';

  SELECT count(*) INTO n FROM public.activity_codes;
  IF n <> 25 THEN RAISE EXCEPTION 'FAIL — activity_codes: esperado 25 (24 + ADM), encontrado %', n; END IF;
  RAISE NOTICE 'PASS — activity_codes: 25 filas (24 + ADM)';

  SELECT count(*) INTO n FROM public.servicios;
  IF n <> 29 THEN RAISE EXCEPTION 'FAIL — servicios: esperado 29, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — servicios: 29 filas';

  SELECT count(*) INTO n FROM public.holidays;
  IF n <> 28 THEN RAISE EXCEPTION 'FAIL — holidays: esperado 28 (13x2 generador + 2 puentes), encontrado %', n; END IF;
  RAISE NOTICE 'PASS — holidays: 28 filas';

  SELECT count(*) INTO n FROM public.authorization_roles;
  IF n <> 23 THEN RAISE EXCEPTION 'FAIL — authorization_roles: esperado 23, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.authorization_permissions;
  IF n <> 84 THEN RAISE EXCEPTION 'FAIL — authorization_permissions: esperado 84, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.authorization_role_permissions;
  IF n <> 737 THEN RAISE EXCEPTION 'FAIL — authorization_role_permissions: esperado 737, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — catálogo RBAC: 23 roles / 84 permisos / 737 concesiones';

  -- 2. ADM como actividad de sistema (informe §5, plan §2.2.1).
  SELECT activity_id INTO v_adm_id FROM public.activity_codes
   WHERE activity_code = 'ADM' AND is_system = true AND practica_id IS NULL;
  IF v_adm_id IS NULL THEN
    RAISE EXCEPTION 'FAIL — no existe una fila ADM con is_system=true y practica_id NULL';
  END IF;
  RAISE NOTICE 'PASS — ADM es actividad de sistema (is_system=true, practica_id NULL)';

  -- 3. ADM_ACTIVITY_ID resuelve a esa fila.
  SELECT setting_value INTO v_setting FROM public.global_settings WHERE setting_key = 'ADM_ACTIVITY_ID';
  IF v_setting IS NULL OR v_setting::uuid <> v_adm_id THEN
    RAISE EXCEPTION 'FAIL — ADM_ACTIVITY_ID (%) no resuelve a la fila ADM (%)', v_setting, v_adm_id;
  END IF;
  RAISE NOTICE 'PASS — global_settings.ADM_ACTIVITY_ID resuelve a la fila ADM';

  SELECT count(*) INTO n FROM public.global_settings;
  IF n <> 17 THEN RAISE EXCEPTION 'FAIL — global_settings: esperado 17 claves, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — global_settings: 17 claves';

  IF NOT EXISTS (SELECT 1 FROM public.global_settings WHERE setting_key = 'HOLIDAY_ENGAGEMENT_ID' AND setting_value = '') THEN
    RAISE EXCEPTION 'FAIL — HOLIDAY_ENGAGEMENT_ID debe existir y estar vacío por diseño';
  END IF;
  RAISE NOTICE 'PASS — HOLIDAY_ENGAGEMENT_ID vacío por diseño';

  -- 4. default_app_role: 61/61 con rol asignado, cero NULL (autoria/default_app_role.md).
  SELECT count(*) INTO v_null_roles FROM public.categories WHERE default_app_role IS NULL;
  IF v_null_roles <> 0 THEN
    RAISE EXCEPTION 'FAIL — % categorías con default_app_role NULL (esperado 0)', v_null_roles;
  END IF;
  RAISE NOTICE 'PASS — 61/61 categorías con default_app_role asignado, cero NULL';

  -- 5. Cero datos demo/operativos (plan §4, prohibición explícita).
  SELECT count(*) INTO n FROM public.clients;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — clients: esperado 0, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.work_orders;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — work_orders: esperado 0, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.time_entries;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — time_entries: esperado 0, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.skills;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — skills: esperado 0, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — clients/work_orders/time_entries/skills: 0 filas';

  -- 6. Bootstrap del admin (plan §4.2.1/§4.3.3) — guardado con to_regclass porque este
  -- script también podría correr contra un stack sin auth.* real (no es el caso esperado
  -- de Fase 4, pero mantiene el patrón usado en el resto de la suite de tests).
  IF to_regclass('auth.users') IS NOT NULL THEN
    SELECT count(*) INTO n FROM auth.users WHERE email = 'neilgraneros@ruizmier.com';
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL — auth.users: esperado 1 fila para el bootstrap, encontrado %', n; END IF;

    SELECT count(*) INTO n FROM auth.identities i
      JOIN auth.users u ON u.id = i.user_id
     WHERE u.email = 'neilgraneros@ruizmier.com' AND i.provider = 'email';
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL — auth.identities: esperado 1 fila provider=email, encontrado %', n; END IF;
    RAISE NOTICE 'PASS — auth.users (1) + auth.identities (1) para el bootstrap';
  ELSE
    RAISE NOTICE 'SKIP — auth.users/auth.identities no existen en este stack (no es un replay completo)';
  END IF;

  SELECT staff_id, auth_user_id INTO v_staff_id, v_auth_id
    FROM public.staff WHERE lower(trim(email)) = 'neilgraneros@ruizmier.com';
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'FAIL — no existe la ficha staff del bootstrap (neilgraneros@ruizmier.com)';
  END IF;
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'FAIL — staff.auth_user_id del bootstrap es NULL (debía vincularse explícitamente)';
  END IF;

  SELECT count(*) INTO n FROM public.staff;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL — staff: esperado exactamente 1 fila (solo el bootstrap), encontrado %', n; END IF;

  PERFORM 1 FROM public.staff s
    JOIN public.practicas p ON p.practica_id = s.practica_id
    JOIN public.categories c ON c.category_id = s.category_id
   WHERE s.staff_id = v_staff_id
     AND s.is_active = true
     AND s.is_schedulable = true
     AND s.weekly_capacity_hours = 40
     AND s.target_utilization_percent = 85
     AND p.abbreviation = 'AUD'
     AND c.category_name = 'Socio';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL — la ficha staff del bootstrap no cumple los atributos exactos de §4.2.1 (Auditoría/Socio, activa, schedulable, capacidad 40, utilización 85)';
  END IF;
  RAISE NOTICE 'PASS — staff: 1 fila (bootstrap), Auditoría/Socio, activa, schedulable, capacidad 40, utilización 85';

  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = v_auth_id AND role_key = 'admin';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL — user_roles: esperada exactamente 1 fila role_key=admin para el bootstrap (insertada por handle_new_user), encontrado %', n;
  END IF;
  SELECT count(*) INTO n FROM public.user_roles;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL — user_roles: esperada exactamente 1 fila en total (el seed no siembra ninguna), encontrado %', n;
  END IF;
  RAISE NOTICE 'PASS — user_roles: exactamente 1 fila, role_key=admin, insertada por el trigger';

  -- 7. holidays.created_by apunta siempre al staff del bootstrap.
  SELECT count(*) INTO n FROM public.holidays WHERE created_by <> v_staff_id;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL — % filas de holidays con created_by distinto del staff del bootstrap', n;
  END IF;
  RAISE NOTICE 'PASS — holidays.created_by: todas las filas apuntan al staff del bootstrap';

  -- 8. Feriados vs generador (decisión §0.1, plan §4.3.4bis): cada fila 2026/2027 con nombre
  -- NACIONAL ocupa exactamente el slot (fecha, oficina) de getBoliviaNationalHolidays(año).
  -- Lista transcrita del resultado real del generador (src/lib/boliviaHolidays.ts) — no se
  -- re-deriva la fórmula de Pascua en SQL, se verifica la salida ya conocida.
  DECLARE
    expected CONSTANT text[] := ARRAY[
      '2026-01-01|0|Año Nuevo', '2026-01-22|0|Día del Estado Plurinacional',
      '2026-02-16|0|Lunes de Carnaval', '2026-02-17|0|Martes de Carnaval',
      '2026-04-03|0|Viernes Santo', '2026-05-01|0|Día del Trabajo',
      '2026-06-04|0|Corpus Christi', '2026-06-22|0|Año Nuevo Andino Amazónico',
      '2026-07-16|1|Aniversario del Departamento de La Paz',
      '2026-08-06|0|Día de la Independencia',
      '2026-09-24|2|Aniversario del Departamento de Santa Cruz',
      '2026-11-02|0|Día de los Difuntos', '2026-12-25|0|Navidad',
      '2027-01-01|0|Año Nuevo', '2027-01-22|0|Día del Estado Plurinacional',
      '2027-02-08|0|Lunes de Carnaval', '2027-02-09|0|Martes de Carnaval',
      '2027-03-26|0|Viernes Santo', '2027-05-01|0|Día del Trabajo',
      '2027-05-27|0|Corpus Christi', '2027-06-21|0|Año Nuevo Andino Amazónico',
      '2027-07-16|1|Aniversario del Departamento de La Paz',
      '2027-08-06|0|Día de la Independencia',
      '2027-09-24|2|Aniversario del Departamento de Santa Cruz',
      '2027-11-02|0|Día de los Difuntos', '2027-12-25|0|Navidad'
    ];
    row_text text;
    missing  int := 0;
  BEGIN
    FOREACH row_text IN ARRAY expected LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.holidays
         WHERE holiday_date = split_part(row_text, '|', 1)::date
           AND oficina = split_part(row_text, '|', 2)::smallint
           AND holiday_name = split_part(row_text, '|', 3)
      ) THEN
        RAISE WARNING 'FAIL slot — % no está sembrado exactamente como el generador lo produce', row_text;
        missing := missing + 1;
      END IF;
    END LOOP;
    IF missing > 0 THEN
      RAISE EXCEPTION 'FAIL — % de los 26 slots nacionales/departamentales del generador no coinciden exactamente', missing;
    END IF;
    RAISE NOTICE 'PASS — los 26 feriados 2026-2027 ocupan exactamente el slot (fecha, oficina) que produce getBoliviaNationalHolidays()';
  END;

  IF NOT EXISTS (SELECT 1 FROM public.holidays WHERE holiday_date = '2026-06-05' AND oficina = 0 AND holiday_name = 'Puente (Adicional)') THEN
    RAISE EXCEPTION 'FAIL — falta el puente 2026-06-05 (Puente (Adicional))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.holidays WHERE holiday_date = '2026-08-07' AND oficina = 0 AND holiday_name = 'Puente (Adicional)') THEN
    RAISE EXCEPTION 'FAIL — falta el puente 2026-08-07 (Puente (Adicional))';
  END IF;
  RAISE NOTICE 'PASS — 2 puentes extra sembrados con el sufijo protegido "(Adicional)"';

  RAISE NOTICE 'VERIFY-SEED: ALL CHECKS PASSED';
END $$;

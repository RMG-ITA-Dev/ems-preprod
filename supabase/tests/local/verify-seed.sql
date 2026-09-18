-- Verificación de datos del seed de Fase 4 (bugs/migracion_cero/plan_v2.md §4.3).
-- Corre contra un stack con el set consolidado renombrado + los 7 archivos de seed
-- (cero_10..cero_16, orden real: 10,11,12,13-rbac,14-bootstrap,15-holidays,16-global_settings) ya replayados desde volumen limpio, SIN intervención manual.
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
  -- +1 de 20260915130000_dash_socio_partner_overview.sql (dashboard.partner.read).
  IF n <> 85 THEN RAISE EXCEPTION 'FAIL — authorization_permissions: esperado 85, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.authorization_role_permissions;
  -- 737 del seed histórico (20260724010000_authz_fase2_seed.sql) + 16 de
  -- 20260826221706_0817-180_grant_hr_engagement_work_order.sql (13 hr_manager + 3 hr_analyst:
  -- solo engagement.create/read/update — el resto quedaría inutilizable, ver comentario de
  -- esa migración sobre is_assigned_to_engagement()) - 2 de
  -- 20251204001004_cero_13_seed_authorization_rbac.sql (0722-156b review iteración 15: se
  -- quitó work_order.create de senior_partner/partner — un socio nunca debió poder crear una
  -- OT; ver plan_v2.md Amendment 2026-09-10 punto 1 y review.md Iteración 15) + 6 de
  -- 20260915130000_dash_socio_partner_overview.sql (dashboard.partner.read para
  -- senior_partner/admin/partner/director/sqr/risk_partner — admin y risk_partner
  -- corregidos a incluidos el 2026-09-16; risk_partner con scope 'assigned_engagements'
  -- igual que director/sqr, NO firm-wide, ver bugs/dashboard/socio/decisiones.md §7).
  IF n <> 757 THEN RAISE EXCEPTION 'FAIL — authorization_role_permissions: esperado 757, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — catálogo RBAC: 23 roles / 85 permisos / 757 concesiones';

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
  -- +1 de 20260915130000_dash_socio_partner_overview.sql (default_exchange_rate).
  IF n <> 21 THEN RAISE EXCEPTION 'FAIL — global_settings: esperado 21 claves, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — global_settings: 21 claves';

  -- EXCHANGE_RATE_API_URL (0722-156 Fase 1, 20260905070913_0722-156_add_exchange_rate_history.sql):
  -- endpoint del microservicio TC Ruizmier, seedeado en global_settings (no env var) para que sea
  -- editable desde Configuración sin redeploy.
  IF NOT EXISTS (SELECT 1 FROM public.global_settings WHERE setting_key = 'EXCHANGE_RATE_API_URL') THEN
    RAISE EXCEPTION 'FAIL — falta la clave EXCHANGE_RATE_API_URL (endpoint del microservicio TC Ruizmier)';
  END IF;
  RAISE NOTICE 'PASS — EXCHANGE_RATE_API_URL presente';

  -- default_exchange_rate (dash_socio, 20260915130000_dash_socio_partner_overview.sql):
  -- TC de respaldo para latest_exchange_rate() / wo_payment_plan.exchange_rate DEFAULT
  -- cuando exchange_rate_history está vacía. Sin esta fila, latest_exchange_rate() puede
  -- devolver NULL y cualquier INSERT/UPDATE que dependa del DEFAULT falla con NOT NULL.
  IF NOT EXISTS (SELECT 1 FROM public.global_settings WHERE setting_key = 'default_exchange_rate') THEN
    RAISE EXCEPTION 'FAIL — falta la clave default_exchange_rate (respaldo de latest_exchange_rate())';
  END IF;
  RAISE NOTICE 'PASS — default_exchange_rate presente';

  -- LANGUAGE/ALLOW_WEEKEND_TRACKING (hallazgo de review de PR #310): Settings.handleSaveSettings
  -- las escribe siempre vía una mutación update-only — sin estas 2 filas, cualquier guardado de
  -- Configuración fallaba en cuanto llegaba a la primera de las dos.
  IF NOT EXISTS (SELECT 1 FROM public.global_settings WHERE setting_key = 'LANGUAGE') THEN
    RAISE EXCEPTION 'FAIL — falta la clave LANGUAGE (rompe Settings.handleSaveSettings)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.global_settings WHERE setting_key = 'ALLOW_WEEKEND_TRACKING') THEN
    RAISE EXCEPTION 'FAIL — falta la clave ALLOW_WEEKEND_TRACKING (rompe Settings.handleSaveSettings)';
  END IF;
  RAISE NOTICE 'PASS — LANGUAGE y ALLOW_WEEKEND_TRACKING presentes';

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

  -- 9. Cron jobs finalize-* (plan §2.1/§2.2; hallazgo de review de PR #310: cron.job es dato,
  -- invisible al fingerprint schema-only, así que su ausencia había pasado todos los gates en
  -- verde). Guardado con to_regclass porque pg_cron puede no estar instalado en este stack
  -- (mismo patrón que el guard de auth.* más arriba).
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM 1 FROM cron.job
     WHERE jobname = 'finalize-stale-timers'
       AND schedule = '*/15 * * * *'
       AND command = 'SELECT finalize_all_stale_timers()'
       AND active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FAIL — cron.job: falta (o difiere) el job finalize-stale-timers';
    END IF;

    PERFORM 1 FROM cron.job
     WHERE jobname = 'finalize-engagements'
       AND schedule = '30 4 * * *'
       AND command = 'SELECT public.finalize_due_engagements();'
       AND active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FAIL — cron.job: falta (o difiere) el job finalize-engagements';
    END IF;
    RAISE NOTICE 'PASS — cron.job: finalize-stale-timers (*/15 * * * *) y finalize-engagements (30 4 * * *) activos';
  ELSE
    RAISE NOTICE 'SKIP — extensión pg_cron no instalada en este stack (cron.job no existe)';
  END IF;

  RAISE NOTICE 'VERIFY-SEED: ALL CHECKS PASSED';
END $$;

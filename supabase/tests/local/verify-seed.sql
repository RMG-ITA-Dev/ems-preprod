-- Verificación de datos del seed (bugs/migracion_cero/plan_v2.md §4.3; ETL fase 1,
-- bugs/ETL/carga/fase1/plan_v2.md §9 «Verificación de instalación», F1-CA03/04/07/15/17/18/20).
-- Corre contra un stack con el set consolidado renombrado + los archivos de seed
-- (cero_10..cero_16: 10,11,12,13-rbac,14-no-op,15-función de feriados,16-global_settings) ya replayados
-- desde volumen limpio, SIN intervención manual.
--
-- Dos modos, por la variable psql etl_f1_mode (por defecto preinit):
--   preinit      migraciones completas, ANTES de inicializar: catálogos/configuración definitivos;
--                CERO clientes, staff, cuentas de usuario de aplicación (auth.users/user_roles) y feriados.
--   initialized  después de scripts/etl/fase1.mjs initialize: un administrador genérico (variable
--                etl_f1_admin_email, por defecto admin@ruizmier.com) con enlace y rol admin/admin y los
--                28 feriados exactos con su autoría; sigue habiendo cero clientes y operaciones.
--
-- Uso:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -v etl_f1_mode=preinit \
--        -f supabase/tests/local/verify-seed.sql
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -v etl_f1_mode=initialized -v etl_f1_admin_email=admin@ruizmier.com \
--        -f supabase/tests/local/verify-seed.sql
--
-- Los parámetros llegan al bloque DO por configuración de sesión (set_config): psql NO interpola
-- variables dentro de un cuerpo $$...$$.
--
-- Puramente de lectura — no abre transacción propia ni modifica datos. Cada chequeo
-- que falla aborta con RAISE EXCEPTION (psql sale con código != 0, ON_ERROR_STOP lo
-- propaga); cada chequeo que pasa imprime una NOTICE 'PASS — ...'. Marcador final:
-- 'VERIFY-SEED: ALL CHECKS PASSED'.

\if :{?etl_f1_mode}
\else
  \set etl_f1_mode preinit
\endif
\if :{?etl_f1_admin_email}
\else
  \set etl_f1_admin_email admin@ruizmier.com
\endif

SELECT set_config('etl_f1.mode', :'etl_f1_mode', false) AS etl_f1_mode,
       set_config('etl_f1.admin_email', :'etl_f1_admin_email', false) AS etl_f1_admin_email
\gset

DO $$
DECLARE
  v_mode       constant text := current_setting('etl_f1.mode');
  v_admin_mail constant text := lower(btrim(current_setting('etl_f1.admin_email')));
  n            int;
  v_staff_id   uuid;
  v_auth_id    uuid;
  v_adm_id     uuid;
  v_setting    text;
  v_null_roles int;
  v_txt        text;
  v_rows       text[];
  r            text;
BEGIN
  IF v_mode NOT IN ('preinit', 'initialized') THEN
    RAISE EXCEPTION 'FAIL — etl_f1_mode debe ser preinit o initialized (recibido: %)', v_mode;
  END IF;
  RAISE NOTICE 'VERIFY-SEED modo: %', v_mode;

  -- 1. Conteos por catálogo (plan §4.2) y contenido exacto de los definitivos de ETL fase 1.
  SELECT count(*) INTO n FROM public.society;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL — society: esperado 2, encontrado %', n; END IF;
  IF (SELECT count(*) FROM public.society WHERE name IN ('Ruizmier Pelaez S.R.L.', 'Ruizmier Jauregui S.R.L.') AND is_active) <> 2 THEN
    RAISE EXCEPTION 'FAIL — society: deben ser exactamente las dos sociedades canónicas, activas';
  END IF;
  RAISE NOTICE 'PASS — society: 2 filas canónicas (Pelaez y Jauregui)';

  -- Industrias: las 32 de ETL 01 (nombre | cierre fiscal | estado), conjunto exacto. 26 activas / 6 inactivas.
  SELECT count(*) INTO n FROM public.industries;
  IF n <> 32 THEN RAISE EXCEPTION 'FAIL — industries: esperado 32, encontrado %', n; END IF;
  v_rows := ARRAY[
    'Administrativo|December 31|active', '/RETIRADO) Not currently assigned|December 31|inactive',
    'Financial Services-Insurance|December 31|active', 'Industrial Markets-Automotive|March 31|active',
    'Energy & Natural Resources-Energy & Natural Resour|December 31|active',
    'Industrial Markets-Industrial Manufacturing|March 31|active',
    '(RETIRADO) Consumer & Retail-Food & Drink|December 31|inactive', 'Consumer & Retail-Retail|December 31|active',
    'Technology, Media & Telecommunications-Telecommuni|December 31|active',
    'Technology, Media & Telecommunications-Media|December 31|active',
    'Technology, Media & Telecommunications-Technology|December 31|active',
    'Infrastructure, Government & Healthcare-Profession|December 31|active',
    'Infrastructure, Government & Healthcare-Healthcare|December 31|active',
    'Life Sciences-Life Sciences|December 31|active', 'Infrastructure, Government & Healthcare-Government|December 31|active',
    'Financial Services-Capital Markets|December 31|active',
    '(RETIRADO) Financial Services-Investment Managemen|December 31|inactive',
    'Financial Services-Banking|December 31|active', 'Consumer & Retail-Consumer Goods|December 31|active',
    'Infrastructure, Government & Healthcare-Building &|December 31|active',
    'Infrastructure, Government & Healthcare-Transport|December 31|active', 'Misceláneo|December 31|active',
    'Memorandum Reporting-Pension Funds|December 31|active', 'Memorandum Reporting-Real Estate|December 31|active',
    'Memorandum Reporting-Private Equity|December 31|active', 'Memorandum Reporting-Enterprise|December 31|active',
    'Infrastructure, Government & Healthcare-Internatio|December 31|active',
    'Memorandum Reporting-Sovereign Wealth Funds|December 31|active',
    '(RETIRADO) Financial Services|December 31|inactive',
    '(RETIRADO) Non-Governmental Organization - NGO|December 31|inactive',
    '(RETIRADO) Chemicals & Pharmaceuticals|March 31|inactive', 'Financial Services-Asset Management|December 31|active'
  ];
  IF cardinality(v_rows) <> 32 THEN RAISE EXCEPTION 'FAIL — verificador: lista esperada de industrias con % filas', cardinality(v_rows); END IF;
  SELECT count(*) INTO n FROM public.industries i WHERE (i.industry_name || '|' || i.fiscal_year_end || '|' || i.status) = ANY (v_rows);
  IF n <> 32 THEN RAISE EXCEPTION 'FAIL — industries: el conjunto (nombre, cierre fiscal, estado) no coincide con ETL 01 (coinciden % de 32)', n; END IF;
  SELECT count(*) INTO n FROM public.industries WHERE status = 'active';
  IF n <> 26 THEN RAISE EXCEPTION 'FAIL — industries activas: esperado 26, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.industries WHERE status = 'inactive';
  IF n <> 6 THEN RAISE EXCEPTION 'FAIL — industries inactivas: esperado 6, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.industries WHERE fiscal_year_end = 'March 31';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL — industries con cierre March 31: esperado 3 (legacy 10, 12, 37), encontrado %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.industries WHERE fiscal_year_end NOT IN ('December 31', 'March 31')) THEN
    RAISE EXCEPTION 'FAIL — industries: el cierre fiscal debe guardarse en el formato inglés estándar de la app (December 31 / March 31)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.industries WHERE industry_name = 'Misceláneo' AND status = 'active')
     OR EXISTS (SELECT 1 FROM public.industries WHERE industry_name LIKE 'Miscellaneous%') THEN
    RAISE EXCEPTION 'FAIL — industries: Miscellaneous debe quedar normalizada como «Misceláneo» activa';
  END IF;
  RAISE NOTICE 'PASS — industries: las 32 de ETL 01 (26 activas / 6 inactivas, 3 con cierre March 31, Misceláneo)';

  -- Tipos de gasto: los 9 de ETL 05; Viáticos 90, el resto 0.
  SELECT count(*) INTO n FROM public.expense_types;
  IF n <> 9 THEN RAISE EXCEPTION 'FAIL — expense_types: esperado 9, encontrado %', n; END IF;
  v_rows := ARRAY['Viaje|0.00', 'Pasajes|0.00', 'Hotel|0.00', 'Viáticos|90.00', 'Comunicaciones|0.00',
                  'Reproducción|0.00', 'Movilidad|0.00', 'Circularización|0.00', 'Otros|0.00'];
  SELECT count(*) INTO n FROM public.expense_types e WHERE (e.expense_name || '|' || e.default_unit_cost::numeric(10,2)::text) = ANY (v_rows);
  IF n <> 9 THEN RAISE EXCEPTION 'FAIL — expense_types: el conjunto (nombre, costo) no coincide con ETL 05 (coinciden % de 9)', n; END IF;
  RAISE NOTICE 'PASS — expense_types: los 9 de ETL 05 (Viáticos 90, resto 0)';

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

  -- 1b. Categorías: Supervisor manager/manager, ITA sin variante IT, rates de Auditoría (ETL 04) y
  --     filas fuera de Auditoría sin alteración respecto de la base.
  SELECT count(*) INTO n FROM public.categories c JOIN public.practicas p ON p.practica_id = c.practica_id
   WHERE c.category_name = 'Supervisor' AND c.default_app_role = 'manager' AND c.default_role_key = 'manager';
  IF n <> 6 THEN RAISE EXCEPTION 'FAIL — Supervisor manager/manager: esperado en 6 prácticas, encontrado en %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.categories WHERE category_name = 'Supervisor' AND (default_app_role IS DISTINCT FROM 'manager' OR default_role_key IS DISTINCT FROM 'manager')) THEN
    RAISE EXCEPTION 'FAIL — algún Supervisor no tiene default_app_role y default_role_key = manager';
  END IF;
  RAISE NOTICE 'PASS — 6 Supervisores con default_app_role = default_role_key = manager';

  SELECT count(*) INTO n FROM public.categories
   WHERE category_name IN ('Gerente - Especialista ITA', 'Senior - Especialista ITA', 'Asistente - Especialista ITA');
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL — categorías ITA: esperadas 3, encontradas %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.categories WHERE category_name ~ 'Especialista IT($|[^A])') THEN
    RAISE EXCEPTION 'FAIL — existe una variante «Especialista IT» paralela a ITA';
  END IF;
  RAISE NOTICE 'PASS — 3 categorías ITA y ninguna identidad «IT» paralela';

  -- Las 15 filas de Auditoría con sus cuatro rates (Alta = Baja; BOB = USD x 12), ETL 04.
  v_rows := ARRAY[
    'Socio|2400.00|2400.00|200.00|200.00', 'SQR|2160.00|2160.00|180.00|180.00', 'Director|960.00|960.00|80.00|80.00',
    'Gerente|960.00|960.00|80.00|80.00', 'Supervisor|360.00|360.00|30.00|30.00', 'Senior|360.00|360.00|30.00|30.00',
    'Semi-Senior|216.00|216.00|18.00|18.00', 'Asistente|120.00|120.00|10.00|10.00', 'Pasante|120.00|120.00|10.00|10.00',
    'Gerente - Especialista ITA|960.00|960.00|80.00|80.00', 'Senior - Especialista ITA|960.00|960.00|80.00|80.00',
    'Asistente - Especialista ITA|216.00|216.00|18.00|18.00', 'Gerente - Especialista Tax|960.00|960.00|80.00|80.00',
    'Senior - Especialista Tax|960.00|960.00|80.00|80.00', 'Asistente - Especialista Tax|216.00|216.00|18.00|18.00'
  ];
  SELECT count(*) INTO n FROM public.categories c JOIN public.practicas p ON p.practica_id = c.practica_id AND p.abbreviation = 'AUD'
   WHERE (c.category_name || '|' || c.rate_high_bob || '|' || c.rate_low_bob || '|' || c.rate_high_usd || '|' || c.rate_low_usd) = ANY (v_rows);
  IF n <> 15 THEN RAISE EXCEPTION 'FAIL — rates de Auditoría: el conjunto (categoría + 4 rates) no coincide con ETL 04 (coinciden % de 15)', n; END IF;
  IF (SELECT count(*) FROM public.categories c JOIN public.practicas p ON p.practica_id = c.practica_id AND p.abbreviation = 'AUD') <> 15 THEN
    RAISE EXCEPTION 'FAIL — Auditoría debe tener exactamente 15 categorías';
  END IF;
  RAISE NOTICE 'PASS — 15 categorías de Auditoría con los 4 rates de ETL 04 (Alta=Baja, BOB = USD x 12)';

  -- Fuera de Auditoría: sin alteración respecto de la base (huella del contenido de cero_11 previo a
  -- ETL fase 1; solo cambia default_app_role de los 5 Supervisores, que no entra en la huella).
  SELECT md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s', p.abbreviation, c.category_name, c.display_order,
                               c.can_approve_wo::text, c.can_approve_timesheets::text,
                               c.rate_high_bob, c.rate_low_bob, c.rate_high_usd, c.rate_low_usd),
                      E'\n' ORDER BY p.abbreviation, c.display_order))
    INTO v_txt
    FROM public.categories c JOIN public.practicas p ON p.practica_id = c.practica_id
   WHERE p.abbreviation <> 'AUD';
  IF v_txt IS DISTINCT FROM '9b7cf5075459a9036cbf8f6ba86480fa' THEN
    RAISE EXCEPTION 'FAIL — las 46 categorías fuera de Auditoría cambiaron respecto de la base (huella %)', v_txt;
  END IF;
  RAISE NOTICE 'PASS — 46 categorías fuera de Auditoría sin alteración (huella de la base)';

  -- 4. default_app_role y default_role_key: 61/61, cero NULL, ninguna sugiere admin.
  SELECT count(*) INTO v_null_roles FROM public.categories WHERE default_app_role IS NULL;
  IF v_null_roles <> 0 THEN
    RAISE EXCEPTION 'FAIL — % categorías con default_app_role NULL (esperado 0)', v_null_roles;
  END IF;
  SELECT count(*) INTO n FROM public.categories WHERE default_role_key IS NOT NULL;
  IF n <> 61 THEN RAISE EXCEPTION 'FAIL — sugerencias default_role_key no NULL: esperadas 61, encontradas %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.categories WHERE default_role_key = 'admin') THEN
    RAISE EXCEPTION 'FAIL — alguna categoría sugiere el rol admin';
  END IF;
  RAISE NOTICE 'PASS — 61/61 categorías con default_app_role y default_role_key asignados, ninguna sugiere admin';

  -- 1c. Catálogo RBAC.
  SELECT count(*) INTO n FROM public.authorization_roles;
  IF n <> 23 THEN RAISE EXCEPTION 'FAIL — authorization_roles: esperado 23, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.authorization_permissions;
  -- +1 de 20260915130000_dash_socio_partner_overview.sql (dashboard.partner.read) + 1 de
  -- 20261009120000_rls_carril_b.sql (timesheet.self_approve, que is_auto_approved_category()
  -- consultaba sin que existiera en el catálogo) + 2 de 20261009120000_rls_carril_b.sql (1028-213:
  -- work_order.risk.read y work_order.risk.emergency_sign, módulo /risks).
  IF n <> 88 THEN RAISE EXCEPTION 'FAIL — authorization_permissions: esperado 88, encontrado %', n; END IF;
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
  -- igual que director/sqr, NO firm-wide, ver bugs/dashboard/socio/decisiones.md §7) + 1 de
  -- 20260918120000_dash_encargo_engagement_overview.sql (dashboard.engagement.read para
  -- semisenior — decisiones.md §3 de bugs/dashboard/encargo/) + 2 de
  -- 20251204001004_cero_13_seed_authorization_rbac.sql (fund_disbursement.read/update para
  -- accounting_analyst, paridad contable — docs/plan-contabilidad-gastos.md Fase 1.2) - 3 de
  -- 20251204001004_cero_13_seed_authorization_rbac.sql (1028-213, D-23: work_order.risk.approve de
  -- manager/ita_manager/tax_manager) - 1 de 20260826221706_0817-180_grant_hr_engagement_work_order.sql
  -- (1028-213, D-23: work_order.risk.approve de hr_manager; quedan 12 hr_manager + 3 hr_analyst) + 10 de
  -- 20261009120000_rls_carril_b.sql (Carril B / B1.2: +12 — 5 de timesheet.self_approve, 5 de
  -- risk_partner (activity_code.read, work_order.read/submit/payment_plan.approve, client.create)
  -- y 2 de risk_supervisor (work_order.read, engagement.read) — y -2: worksheet.create/update
  -- de risk_partner; 1028-213 quita work_order.read de risk_supervisor (-1) y suma 5 concesiones de
  -- work_order.risk.read (admin/risk_partner/risk_supervisor) y work_order.risk.emergency_sign
  -- (admin/risk_partner) (+5), neto +4 sobre el total de B1.2) + 7 de 20261012140000_rls_carril_b3p_permisos_cobranza_contabilidad.sql
  -- (Carril B / B3p, decisión del operador: lectura con alcance department de work_order, engagement
  -- y client para collections_analyst, y de work_order y engagement para accounting_manager y
  -- accounting_analyst; contabilidad sin client.read).
  IF n <> 777 THEN RAISE EXCEPTION 'FAIL — authorization_role_permissions: esperado 777, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — catálogo RBAC: 23 roles / 88 permisos / 777 concesiones';

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

  -- 20 claves vigentes antes de notificaciones/correo y dash_*, mas 5 que notificaciones/correo
  -- requieren (TS_ALERT_WINDOW_WEEKS, TS_TRACKING_START_DATE, las dos retenciones y el tope
  -- global auth) y 2 de dash_socio/dash_encargo (default_exchange_rate,
  -- DASH_ENGAGEMENT_PENDING_ALERT_WEEKS) + AUTH_MODE (login con Microsoft) = 28.
  SELECT count(*) INTO n FROM public.global_settings;
  IF n <> 28 THEN RAISE EXCEPTION 'FAIL — global_settings: esperado 28 claves, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — global_settings: 28 claves';

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

  -- 5. Cero clientes y cero operaciones residuales, en AMBOS modos (plan §4, prohibición de datos
  -- demo). ETL fase 1: 0722-160 ya no siembra los clientes internos; los 268 clientes de ETL 02
  -- (incluidos NEW-RP / NEW-RJ) los carga la fase 2.
  SELECT count(*) INTO n FROM public.clients;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — clients: esperado 0 (los carga la fase 2), encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.client_contacts;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — client_contacts: esperado 0, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.engagements;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — engagements: esperado 0, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.work_orders;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — work_orders: esperado 0, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.time_entries;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — time_entries: esperado 0, encontrado %', n; END IF;
  SELECT count(*) INTO n FROM public.skills;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL — skills: esperado 0, encontrado %', n; END IF;
  RAISE NOTICE 'PASS — clients, client_contacts, engagements, work_orders, time_entries y skills: 0 filas';

  IF v_mode = 'preinit' THEN
    -- 6a. PREINIT: instalación sin administrador, sin staff, sin cuentas y sin calendario.
    IF to_regclass('auth.users') IS NOT NULL THEN
      SELECT count(*) INTO n FROM auth.users;
      IF n <> 0 THEN RAISE EXCEPTION 'FAIL — preinit: auth.users debe estar vacía, encontradas %', n; END IF;
      IF to_regclass('auth.identities') IS NOT NULL THEN
        SELECT count(*) INTO n FROM auth.identities;
        IF n <> 0 THEN RAISE EXCEPTION 'FAIL — preinit: auth.identities debe estar vacía, encontradas %', n; END IF;
      END IF;
    ELSE
      RAISE NOTICE 'SKIP — auth.users/auth.identities no existen en este stack (no es un replay completo)';
    END IF;
    SELECT count(*) INTO n FROM public.staff;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL — preinit: staff debe estar vacío, encontradas %', n; END IF;
    SELECT count(*) INTO n FROM public.user_roles;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL — preinit: user_roles debe estar vacío, encontradas %', n; END IF;
    SELECT count(*) INTO n FROM public.holidays;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL — preinit: holidays debe estar vacío (los materializa la consola), encontradas %', n; END IF;
    IF to_regprocedure('public.seed_initial_holidays(uuid)') IS NULL THEN
      RAISE EXCEPTION 'FAIL — preinit: falta public.seed_initial_holidays(uuid)';
    END IF;
    RAISE NOTICE 'PASS — preinit: cero cuentas de Auth, staff, user_roles y feriados; función de feriados declarada';
  ELSE
    -- 6b. INITIALIZED: un administrador genérico con enlace y rol, y el calendario completo.
    IF to_regclass('auth.users') IS NOT NULL THEN
      SELECT count(*) INTO n FROM auth.users;
      IF n <> 1 THEN RAISE EXCEPTION 'FAIL — initialized: auth.users esperada con 1 fila, encontradas %', n; END IF;
      SELECT count(*) INTO n FROM auth.users WHERE lower(email) = v_admin_mail;
      IF n <> 1 THEN RAISE EXCEPTION 'FAIL — initialized: esperada 1 cuenta de Auth para %, encontradas %', v_admin_mail, n; END IF;
      IF to_regclass('auth.identities') IS NOT NULL THEN
        SELECT count(*) INTO n FROM auth.identities i JOIN auth.users u ON u.id = i.user_id
         WHERE lower(u.email) = v_admin_mail AND i.provider = 'email';
        IF n <> 1 THEN RAISE EXCEPTION 'FAIL — initialized: auth.identities esperada 1 fila provider=email, encontrada %', n; END IF;
      END IF;
      RAISE NOTICE 'PASS — auth.users (1) + auth.identities (1) para el administrador';
    ELSE
      RAISE NOTICE 'SKIP — auth.users/auth.identities no existen en este stack (no es un replay completo)';
    END IF;

    SELECT count(*) INTO n FROM public.staff;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL — initialized: staff esperado con exactamente 1 fila, encontrado %', n; END IF;
    SELECT staff_id, auth_user_id INTO v_staff_id, v_auth_id FROM public.staff WHERE lower(trim(email)) = v_admin_mail;
    IF v_staff_id IS NULL THEN RAISE EXCEPTION 'FAIL — initialized: no existe la ficha staff de %', v_admin_mail; END IF;
    IF v_auth_id IS NULL THEN RAISE EXCEPTION 'FAIL — initialized: staff.auth_user_id del administrador es NULL (el enlace no se resolvió)'; END IF;

    PERFORM 1 FROM public.staff s
      JOIN public.practicas p ON p.practica_id = s.practica_id
      JOIN public.categories c ON c.category_id = s.category_id
      JOIN public.society so ON so.society_id = s.society_id
     WHERE s.staff_id = v_staff_id
       AND s.is_active = true AND s.deleted_at IS NULL
       AND s.is_schedulable = false
       AND s.weekly_capacity_hours = 40 AND s.target_utilization_percent = 85
       AND p.abbreviation = 'AUD' AND c.category_name = 'Socio'
       AND so.name = 'Ruizmier Pelaez S.R.L.';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FAIL — la ficha del administrador no cumple los atributos acordados (AUD/Socio/Ruizmier Pelaez, activa, NO programable, capacidad 40, utilización 85)';
    END IF;
    RAISE NOTICE 'PASS — staff: 1 fila (administrador genérico), AUD/Socio, activa, no programable, capacidad 40, utilización 85';

    SELECT count(*) INTO n FROM public.user_roles WHERE user_id = v_auth_id AND role = 'admin' AND role_key = 'admin';
    IF n <> 1 THEN
      RAISE EXCEPTION 'FAIL — user_roles: esperada exactamente 1 fila admin/admin para el administrador (handle_new_user), encontrada %', n;
    END IF;
    SELECT count(*) INTO n FROM public.user_roles;
    IF n <> 1 THEN
      RAISE EXCEPTION 'FAIL — user_roles: esperada exactamente 1 fila en total, encontrada %', n;
    END IF;
    RAISE NOTICE 'PASS — user_roles: exactamente 1 fila, admin/admin, insertada por el trigger';

    -- 7. holidays: 28 filas con autoría del administrador.
    SELECT count(*) INTO n FROM public.holidays;
    IF n <> 28 THEN RAISE EXCEPTION 'FAIL — holidays: esperado 28 (13x2 generador + 2 puentes), encontrado %', n; END IF;
    SELECT count(*) INTO n FROM public.holidays WHERE created_by <> v_staff_id;
    IF n <> 0 THEN
      RAISE EXCEPTION 'FAIL — % filas de holidays con created_by distinto del staff del administrador', n;
    END IF;
    RAISE NOTICE 'PASS — holidays: 28 filas, todas con created_by = ficha del administrador';

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
  END IF;

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

  RAISE NOTICE 'VERIFY-SEED: ALL CHECKS PASSED (modo %)', v_mode;
END $$;

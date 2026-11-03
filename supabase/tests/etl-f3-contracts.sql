-- ETL F3: contratos del destino. La suite se ejecuta sólo contra el stack local del harness.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.create_engagement_with_code(text,uuid,uuid,uuid,date,date,text,smallint,smallint,smallint,integer,boolean,boolean,boolean,boolean,date,boolean,uuid,uuid,uuid,uuid,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'ETL F3: create_engagement_with_code ausente';
  END IF;
  IF to_regprocedure('public.sync_worksheet_to_wo_budget(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'ETL F3: sync_worksheet_to_wo_budget ausente';
  END IF;
  IF to_regprocedure('public.add_installment_note(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'ETL F3: add_installment_note ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='time_entries' AND column_name='period_id' AND is_nullable='YES') THEN
    RAISE EXCEPTION 'ETL F3: time_entries.period_id debe admitir NULL';
  END IF;

  -- S05 (F3-Q10): la partición técnica de celdas > 99,99 h vive en cero_02/cero_03, sin migración aparte.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='time_entries' AND column_name='etl_split_index' AND data_type='smallint' AND is_nullable='NO' AND column_default='1') THEN
    RAISE EXCEPTION 'ETL F3: time_entries.etl_split_index debe ser smallint NOT NULL DEFAULT 1';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.time_entries'::regclass AND conname='time_entries_etl_split_index_check' AND pg_get_constraintdef(oid) LIKE '%etl_split_index > 0%') THEN
    RAISE EXCEPTION 'ETL F3: falta CHECK etl_split_index > 0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_time_entries_unique_entry' AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%(staff_id, engagement_id, activity_id, date_worked, is_forecast, etl_split_index)%') THEN
    RAISE EXCEPTION 'ETL F3: la unicidad de time_entries debe incluir etl_split_index';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='time_entries' AND column_name='hours_logged' AND numeric_precision=4 AND numeric_scale=2) THEN
    RAISE EXCEPTION 'ETL F3: hours_logged debe seguir siendo numeric(4,2): las celdas > 99,99 h se parten, no ensanchan la columna';
  END IF;

  -- S08 (P-02): el TC del plan es contrato de dash_socio (NOT NULL, > 0, DEFAULT latest_exchange_rate()); BOB lo toma del DEFAULT.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wo_payment_plan' AND column_name='exchange_rate' AND is_nullable='NO' AND column_default LIKE '%latest_exchange_rate()%') THEN
    RAISE EXCEPTION 'ETL F3: wo_payment_plan.exchange_rate debe conservar NOT NULL DEFAULT latest_exchange_rate() (P-02, sin migración que lo relaje)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wo_payment_plan' AND column_name='exchange_rate_mode' AND is_nullable='NO' AND column_default LIKE '''fijo''%') THEN
    RAISE EXCEPTION 'ETL F3: wo_payment_plan.exchange_rate_mode debe conservar NOT NULL DEFAULT fijo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.wo_payment_plan'::regclass AND conname='wo_payment_plan_exchange_rate_positive') THEN
    RAISE EXCEPTION 'ETL F3: falta CHECK exchange_rate > 0 del plan';
  END IF;
  IF public.latest_exchange_rate() IS NULL OR public.latest_exchange_rate() <= 0 THEN
    RAISE EXCEPTION 'ETL F3: latest_exchange_rate() no devuelve un TC positivo; un plan BOB no podría tomar el DEFAULT';
  END IF;
END $$;


-- ===================================================================================================
-- Contratos de COMPORTAMIENTO (fase3/plan_v2 §9 S01–S10). Todo dentro de la misma transacción, con ROLLBACK.
-- Reproducen lo que la consola F3 hace de verdad: el actor técnico (administrador bootstrap) entra con
-- request.jwt.claims y SET LOCAL ROLE authenticated; las horas se prueban como dueño (los triggers BEFORE de
-- time_entries no dependen de RLS). S02 (firma del socio y riesgo) y S07 (administrativos) las cubren
-- rpc-0722-160-administrative-engagements.sql y las suites de OT existentes; aquí no se duplican.
-- Fixture: ids con prefijo f3c.
-- ===================================================================================================
INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES
  ('f3c00000-0000-4000-8000-0000000000c1', 'Cliente contratos F3', 'NIT-F3C-1');

INSERT INTO auth.users (id) VALUES
  ('f3c00000-0000-4000-8000-0000000000a1'),   -- administrador técnico
  ('f3c00000-0000-4000-8000-0000000000a2'),   -- persona de La Paz
  ('f3c00000-0000-4000-8000-0000000000a3');   -- persona con baja

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id, city, hire_date, termination_date) VALUES
  ('f3c00000-0000-4000-8000-0000000000b1', 'f3c00000-0000-4000-8000-0000000000a1', 'Admin', 'F3C', (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 'La Paz', '2026-01-01', NULL),
  ('f3c00000-0000-4000-8000-0000000000b2', 'f3c00000-0000-4000-8000-0000000000a2', 'Persona', 'LaPaz',  (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 'La Paz', '2026-01-01', NULL),
  ('f3c00000-0000-4000-8000-0000000000b3', 'f3c00000-0000-4000-8000-0000000000a3', 'Persona', 'ConBaja', (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 'La Paz', '2026-01-01', '2026-03-31');

-- Con los triggers de Auth activos (stack real) el usuario ya nace con rol; en el arnés no: vale para ambos.
INSERT INTO public.user_roles (user_id, role, role_key) VALUES ('f3c00000-0000-4000-8000-0000000000a1', 'admin', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, role_key = EXCLUDED.role_key;

-- Tres encargos de cliente con OT exigida: E1 con OT en Draft (BOB), E2 con OT aprobada, E3 con OT en Draft (USD).
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, status, work_order_required, start_date, end_date, fecha_cierre, society_id, manager_id) VALUES
  ('f3c00000-0000-4000-8000-0000000000e1', 'f3c00000-0000-4000-8000-0000000000c1', 'F3C OT Draft BOB', 'F3C-01', 'active', true, '2026-01-01', '2026-12-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 'f3c00000-0000-4000-8000-0000000000b1'),
  ('f3c00000-0000-4000-8000-0000000000e2', 'f3c00000-0000-4000-8000-0000000000c1', 'F3C OT aprobada',  'F3C-02', 'active', true, '2026-01-01', '2026-12-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 'f3c00000-0000-4000-8000-0000000000b1'),
  ('f3c00000-0000-4000-8000-0000000000e3', 'f3c00000-0000-4000-8000-0000000000c1', 'F3C OT Draft USD', 'F3C-03', 'active', true, '2026-01-01', '2026-12-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 'f3c00000-0000-4000-8000-0000000000b1');

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status, risk_status) VALUES
  ('f3c00000-0000-4000-8000-0000000000d1', 'f3c00000-0000-4000-8000-0000000000e1', 'BOB', 'High', 'Draft',    'Pending'),
  ('f3c00000-0000-4000-8000-0000000000d2', 'f3c00000-0000-4000-8000-0000000000e2', 'BOB', 'High', 'Approved', 'Approved'),
  ('f3c00000-0000-4000-8000-0000000000d3', 'f3c00000-0000-4000-8000-0000000000e3', 'USD', 'High', 'Draft',    'Pending');

INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id)
VALUES ('F3C-ACT', 'Actividad contratos F3', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;

-- Intenta una hora con period_id NULL (como el ETL); devuelve NULL si entró o el mensaje del trigger que la rechazó.
CREATE FUNCTION pg_temp.try_hour(p_staff uuid, p_engagement uuid, p_date date) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, period_id, is_forecast)
  VALUES (p_staff, p_engagement, (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'F3C-ACT' AND is_active), p_date, 1, NULL, false);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

DO $$
DECLARE
  v_admin_uid  constant uuid := 'f3c00000-0000-4000-8000-0000000000a1';
  v_worker     constant uuid := 'f3c00000-0000-4000-8000-0000000000b2';
  v_baja       constant uuid := 'f3c00000-0000-4000-8000-0000000000b3';
  v_err text;
  v_hol_lp date;
  v_hol_sc date;
BEGIN
  -- S03 — una hora histórica (período NULL, no forecast) entra sobre una OT habilitada y se rechaza sobre una en Draft.
  v_err := pg_temp.try_hour(v_worker, 'f3c00000-0000-4000-8000-0000000000e2', DATE '2026-03-10');
  IF v_err IS NOT NULL THEN RAISE EXCEPTION 'ETL F3 S03: la hora con período NULL debía entrar sobre la OT aprobada (%)', v_err; END IF;
  v_err := pg_temp.try_hour(v_worker, 'f3c00000-0000-4000-8000-0000000000e1', DATE '2026-03-10');
  IF v_err IS NULL OR v_err NOT LIKE '%Work Order is not approved%' THEN RAISE EXCEPTION 'ETL F3 S03: la hora sobre una OT en Draft debía rechazarse (%)', v_err; END IF;

  -- Feriados del fixture en días hábiles SIN ningún feriado previo (el stack real ya trae el calendario sembrado):
  -- uno de La Paz (oficina 1) y otro de Santa Cruz (oficina 2).
  SELECT d::date INTO v_hol_lp FROM generate_series(DATE '2026-05-04', DATE '2026-06-30', interval '1 day') d
   WHERE EXTRACT(isodow FROM d) BETWEEN 1 AND 5 AND NOT EXISTS (SELECT 1 FROM public.holidays h WHERE h.holiday_date = d::date) ORDER BY d LIMIT 1;
  SELECT d::date INTO v_hol_sc FROM generate_series(DATE '2026-07-06', DATE '2026-08-28', interval '1 day') d
   WHERE EXTRACT(isodow FROM d) BETWEEN 1 AND 5 AND NOT EXISTS (SELECT 1 FROM public.holidays h WHERE h.holiday_date = d::date) ORDER BY d LIMIT 1;
  INSERT INTO public.holidays (holiday_date, holiday_name, oficina, created_by) VALUES
    (v_hol_lp, 'Feriado F3C La Paz', 1, 'f3c00000-0000-4000-8000-0000000000b1'),
    (v_hol_sc, 'Feriado F3C Santa Cruz', 2, 'f3c00000-0000-4000-8000-0000000000b1');

  -- S04 — fechas fuera del rango del encargo, posteriores a la baja y feriado de la oficina de la persona.
  v_err := pg_temp.try_hour(v_worker, 'f3c00000-0000-4000-8000-0000000000e2', DATE '2025-12-31');
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_DATE_RANGE%' THEN RAISE EXCEPTION 'ETL F3 S04: una hora anterior al inicio del encargo debía rechazarse (%)', v_err; END IF;
  v_err := pg_temp.try_hour(v_worker, 'f3c00000-0000-4000-8000-0000000000e2', DATE '2027-01-04');
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_DATE_RANGE%' THEN RAISE EXCEPTION 'ETL F3 S04: una hora posterior al fin del encargo debía rechazarse (%)', v_err; END IF;
  v_err := pg_temp.try_hour(v_baja, 'f3c00000-0000-4000-8000-0000000000e2', DATE '2026-03-10');
  IF v_err IS NOT NULL THEN RAISE EXCEPTION 'ETL F3 S04: una hora anterior a la baja debía entrar (%)', v_err; END IF;
  v_err := pg_temp.try_hour(v_baja, 'f3c00000-0000-4000-8000-0000000000e2', DATE '2026-04-15');
  IF v_err IS NULL OR v_err NOT LIKE 'TERMINATION_DATE_BLOCKED%' THEN RAISE EXCEPTION 'ETL F3 S04: una hora posterior a la baja debía rechazarse (%)', v_err; END IF;
  v_err := pg_temp.try_hour(v_worker, 'f3c00000-0000-4000-8000-0000000000e2', v_hol_lp);
  IF v_err IS NULL OR v_err NOT LIKE 'HOLIDAY_%' THEN RAISE EXCEPTION 'ETL F3 S04: una hora en el feriado de La Paz debía rechazarse para una persona de La Paz (%)', v_err; END IF;
  v_err := pg_temp.try_hour(v_worker, 'f3c00000-0000-4000-8000-0000000000e2', v_hol_sc);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION 'ETL F3 S04: el feriado de Santa Cruz no debía bloquear a una persona de La Paz (%)', v_err; END IF;

  -- S04b — carga histórica en feriado (decisión del operador, 03/11/2026): el legacy permitía trabajar esos días. Solo el
  -- INSERT de la transacción de carga (marca etl.f3_historical_hours) desde la sesión propietaria; UPDATE y carga manual siguen bloqueados.
  PERFORM set_config('etl.f3_historical_hours', 'on', true);
  v_err := pg_temp.try_hour(v_worker, 'f3c00000-0000-4000-8000-0000000000e2', v_hol_lp);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION 'ETL F3 S04b: con la marca de carga histórica una hora en feriado debía entrar (%)', v_err; END IF;
  BEGIN
    UPDATE public.time_entries SET hours_logged = 2 WHERE staff_id = v_worker AND engagement_id = 'f3c00000-0000-4000-8000-0000000000e2' AND date_worked = v_hol_lp;
    RAISE EXCEPTION 'ETL F3 S04b: el UPDATE de una hora en feriado debía rechazarse aun con la marca';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'HOLIDAY_%' THEN RAISE; END IF;
  END;
  -- Una sesión que no es la propietaria no puede usar la marca (los clientes de la API entran como otro rol de sesión).
  -- Con un superusuario (arnés de CI) se prueba el comportamiento; con la conexión postgres de Supabase local, que no puede
  -- cambiar de sesión, se comprueba que la excepción exige session_user = postgres en la definición del trigger.
  BEGIN
    SET LOCAL SESSION AUTHORIZATION service_role;
    v_err := pg_temp.try_hour(v_worker, 'f3c00000-0000-4000-8000-0000000000e2', v_hol_lp);
    RESET SESSION AUTHORIZATION;
    IF v_err IS NULL OR v_err NOT LIKE 'HOLIDAY_%' THEN RAISE EXCEPTION 'ETL F3 S04b: una sesión que no es la propietaria no debía poder cargar en feriado (%)', v_err; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    IF position('session_user = ''postgres''' IN pg_get_functiondef('public.enforce_holiday_blocking()'::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'ETL F3 S04b: la excepción de feriados debía exigir session_user = postgres';
    END IF;
  END;
  PERFORM set_config('etl.f3_historical_hours', 'off', true);
  v_err := pg_temp.try_hour(v_worker, 'f3c00000-0000-4000-8000-0000000000e2', v_hol_lp);
  IF v_err IS NULL OR v_err NOT LIKE 'HOLIDAY_%' THEN RAISE EXCEPTION 'ETL F3 S04b: sin la marca la carga manual en feriado debía rechazarse (%)', v_err; END IF;

  -- S09 — un correo contenido (failed / ETL_F3_NO_DELIVERY) no es reclamable y uno ajeno conserva su estado.
  INSERT INTO public.notification_emails (email_id, dedupe_key, recipient_staff_id, to_email, type_key, entity_id, status, attempts, last_error) VALUES
    ('f3c00000-0000-4000-8000-0000000000f1', 'f3c-contenido', v_worker, 'f3c-contenido@example.test', (SELECT type_key FROM public.notification_types ORDER BY type_key LIMIT 1), 'f3c-entidad', 'failed', 0, 'ETL_F3_NO_DELIVERY'),
    ('f3c00000-0000-4000-8000-0000000000f2', 'f3c-ajeno',    v_worker, 'f3c-ajeno@example.test',    (SELECT type_key FROM public.notification_types ORDER BY type_key LIMIT 1), 'f3c-ajena',   'pending', 0, NULL);
  IF EXISTS (SELECT 1 FROM public.claim_notification_emails(1000) c WHERE c.email_id = 'f3c00000-0000-4000-8000-0000000000f1') THEN
    RAISE EXCEPTION 'ETL F3 S09: claim_notification_emails reclamó un correo contenido';
  END IF;
  IF (SELECT status FROM public.notification_emails WHERE email_id = 'f3c00000-0000-4000-8000-0000000000f1') <> 'failed'
     OR (SELECT last_error FROM public.notification_emails WHERE email_id = 'f3c00000-0000-4000-8000-0000000000f1') <> 'ETL_F3_NO_DELIVERY' THEN
    RAISE EXCEPTION 'ETL F3 S09: el correo contenido cambió de estado o de motivo';
  END IF;
  IF (SELECT status FROM public.notification_emails WHERE email_id = 'f3c00000-0000-4000-8000-0000000000f2') <> 'sending' THEN
    RAISE EXCEPTION 'ETL F3 S09: el correo ajeno pendiente debía seguir siendo reclamable por el drenaje';
  END IF;
  IF public.begin_notification_email_attempt('f3c00000-0000-4000-8000-0000000000f1') IS NOT NULL THEN
    RAISE EXCEPTION 'ETL F3 S09: begin_notification_email_attempt registró un intento sobre un correo contenido';
  END IF;
END $$;

-- S01 / S06 / S08 / S10 — como el actor técnico (administrador) o como una persona sin permisos, con el mismo
-- mecanismo de la consola: claims en la transacción y SET LOCAL ROLE authenticated.
DO $$
DECLARE
  v_admin_uid constant uuid := 'f3c00000-0000-4000-8000-0000000000a1';
  v_worker_uid constant uuid := 'f3c00000-0000-4000-8000-0000000000a2';
  v_note public.wo_installment_notes;
  v_after public.wo_installment_notes;
  v_rate numeric; v_mode text; v_err text;
  v_body constant text := E'COT: F3C\nCuota legacy: 13\nPorcentaje legacy: 4%\n[INICIO TEXTO LEGACY]\n  NO FACTURA  \n[FIN TEXTO LEGACY]';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- S08 — plan BOB sin TC: toma el DEFAULT efectivo (> 0) y el modo fijo; USD conserva su TC fijo.
  INSERT INTO public.wo_payment_plan (plan_id, wo_id, payment_days) VALUES ('f3c00000-0000-4000-8000-0000000000a9', 'f3c00000-0000-4000-8000-0000000000d1', 30);
  SELECT exchange_rate, exchange_rate_mode INTO v_rate, v_mode FROM public.wo_payment_plan WHERE plan_id = 'f3c00000-0000-4000-8000-0000000000a9';
  IF v_rate IS NULL OR v_rate <= 0 OR v_mode IS DISTINCT FROM 'fijo' THEN
    RAISE EXCEPTION 'ETL F3 S08: el plan BOB debía tomar un TC positivo por DEFAULT y el modo fijo (tc=%, modo=%)', v_rate, v_mode;
  END IF;
  INSERT INTO public.wo_payment_plan (plan_id, wo_id, exchange_rate, payment_days, exchange_rate_mode) VALUES ('f3c00000-0000-4000-8000-0000000000aa', 'f3c00000-0000-4000-8000-0000000000d3', 6.96, 30, 'fijo');
  IF (SELECT exchange_rate FROM public.wo_payment_plan WHERE plan_id = 'f3c00000-0000-4000-8000-0000000000aa') <> 6.96 THEN
    RAISE EXCEPTION 'ETL F3 S08: el plan USD debía conservar su TC legacy';
  END IF;

  -- S08 — en modo fijo, una cuota nueva sin el TC del plan se rechaza (por eso las cuotas BOB heredan el TC del plan) y con él entra.
  BEGIN
    INSERT INTO public.wo_payment_installments (installment_id, plan_id, wo_id, installment_number, agreed_invoice_date, agreed_payment_date, percentage, amount, status, installment_type, currency, invoice_exchange_rate, payment_exchange_rate)
    VALUES ('f3c00000-0000-4000-8000-0000000000c9', 'f3c00000-0000-4000-8000-0000000000a9', 'f3c00000-0000-4000-8000-0000000000d1', 1, '2026-03-10', '2026-04-21', 100, 1000, 'Pending', 'fee', 'BOB', NULL, NULL);
    RAISE EXCEPTION 'ETL F3 S08: una cuota BOB con TC NULL en modo fijo debía rechazarse';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'EXCHANGE_RATE_LOCKED%' THEN RAISE; END IF;
  END;
  INSERT INTO public.wo_payment_installments (installment_id, plan_id, wo_id, installment_number, agreed_invoice_date, agreed_payment_date, percentage, amount, status, installment_type, currency, invoice_exchange_rate, payment_exchange_rate)
  VALUES ('f3c00000-0000-4000-8000-0000000000c9', 'f3c00000-0000-4000-8000-0000000000a9', 'f3c00000-0000-4000-8000-0000000000d1', 1, '2026-03-10', '2026-04-21', 100, 1000, 'Pending', 'fee', 'BOB', v_rate, v_rate);

  -- S01 — un plan se acepta sobre una OT en Draft y se rechaza sobre una OT aprobada.
  BEGIN
    INSERT INTO public.wo_payment_plan (plan_id, wo_id, payment_days) VALUES ('f3c00000-0000-4000-8000-0000000000ab', 'f3c00000-0000-4000-8000-0000000000d2', 30);
    RAISE EXCEPTION 'ETL F3 S01: un plan sobre una OT aprobada debía rechazarse';
  EXCEPTION WHEN OTHERS THEN
    -- Debe ser la guarda del plan, no un rechazo cualquiera (permisos, FK…).
    IF SQLERRM NOT LIKE 'EXCHANGE_RATE_LOCKED%' THEN RAISE; END IF;
  END;

  -- S06 — nota de plan con cuota NULL por el actor técnico: autor técnico, texto con delimitadores intacto, borrado lógico.
  v_note := public.add_installment_note('f3c00000-0000-4000-8000-0000000000d1', NULL, v_body);
  IF v_note.installment_id IS NOT NULL OR v_note.author_staff_id IS DISTINCT FROM 'f3c00000-0000-4000-8000-0000000000b1'::uuid OR v_note.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'ETL F3 S06: la nota de plan debía quedar con cuota NULL, autor técnico y sin borrar';
  END IF;
  IF v_note.body <> v_body THEN RAISE EXCEPTION 'ETL F3 S06: la nota perdió texto o delimitadores (btrim de la RPC)'; END IF;
  v_after := public.edit_installment_note(v_note.note_id, v_body || E'\n(ajuste)');
  IF v_after.note_id <> v_note.note_id OR v_after.body NOT LIKE '%(ajuste)' THEN RAISE EXCEPTION 'ETL F3 S06: editar debía conservar la nota y cambiar su texto'; END IF;
  v_after := public.delete_installment_note(v_note.note_id);
  IF v_after.deleted_at IS NULL THEN RAISE EXCEPTION 'ETL F3 S06: borrar debía ser lógico (deleted_at)'; END IF;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.wo_installment_notes WHERE note_id = v_note.note_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'ETL F3 S06: la nota borrada debía seguir existiendo como fila (borrado lógico)';
  END IF;

  -- S10 — una persona sin permisos no puede crear la nota ni el plan por las mismas vías.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_worker_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.add_installment_note('f3c00000-0000-4000-8000-0000000000d1', NULL, 'sin permiso');
    RAISE EXCEPTION 'ETL F3 S10: una persona sin permisos pudo crear una nota de plan';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ETL F3 S10%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'NOTE_FORBIDDEN%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.wo_payment_plan (plan_id, wo_id, payment_days) VALUES ('f3c00000-0000-4000-8000-0000000000ac', 'f3c00000-0000-4000-8000-0000000000d3', 30);
    RAISE EXCEPTION 'ETL F3 S10: una persona sin permisos pudo crear un plan de pagos';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'EXCHANGE_RATE_FORBIDDEN%' THEN RAISE; END IF;
  END;
  RESET ROLE;
END $$;

ROLLBACK;
SELECT 'ETL F3 CONTRACTS: ALL CHECKS PASSED' AS result;

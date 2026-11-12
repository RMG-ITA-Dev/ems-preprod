-- 1110-220 — Solo Talento Humano y Sistemas crean lo administrativo (bugs/1110-220/plan_v3.md N1-N19, plan_v5.md).
--   · Encargos no-Cliente (funcion 0/2/3) y sus OTs: solo admin, hr_manager y hr_analyst los crean.
--   · plan_v5: en un no-Cliente manager_id es el "Aprobador de horas": obligatorio, elegido entre 14 roles por admin o TH
--     (sin autoasignación). Aprueba horas y mira; no edita aunque sea de TH. TH escribe lo que creó.
--   · Contabilidad (accounting_manager), Riesgos (risk_supervisor) y Secretaría (secretariat_head) no crean ni editan.
--   · Secretaría ve solo lo que gerencia.
--   · TH elige al crear si el no-Cliente lleva OT y si sus horas requieren aprobación.
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, al final (estado definitivo: B5/D1 aplicados). Transacción única,
-- SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo y "1110-220 ROLES: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba ES la base real: alta por create_engagement_with_code como `authenticated` con el claim JWT del
-- usuario (triggers de perfil, autoasignación y reglas administrativas encendidos), RLS de engagements/work_orders
-- (permisivas + RESTRICTIVE "administrative write *") y las funciones de aprobación. Los encargos "ajenos" se siembran
-- como dueño con los triggers de réplica apagados.
--
-- Fixture (prefijo 1102): A accounting_manager · R risk_supervisor · S secretariat_head · M manager (Gerente normal) ·
-- X assistant (carga horas) · H hr_manager · Y hr_analyst · P partner. Todos con ficha Ruizmier Pelaez S.R.L. /
-- práctica code 1 / La Paz (oficina 1).
--   EM administrativo (funcion 0) de M, creado por M, Socio P · EC encargo de Cliente (funcion 1) de M, creado por M.
--   WM OT de EM (sembrada como dueño).
-- Cliente interno de Pelaez: el que siembra run-rls-tests.sh (c1000000-...-160, NIT 1006979026).

BEGIN;

INSERT INTO auth.users (id) VALUES
  ('a1102000-0000-4000-8000-000000000001'), ('a1102000-0000-4000-8000-000000000002'),
  ('a1102000-0000-4000-8000-000000000003'), ('a1102000-0000-4000-8000-000000000004'),
  ('a1102000-0000-4000-8000-000000000005'), ('a1102000-0000-4000-8000-000000000006'),
  ('a1102000-0000-4000-8000-000000000007'), ('a1102000-0000-4000-8000-000000000008');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a1102000-0000-4000-8000-000000000001', 'manager', 'accounting_manager'),
  ('a1102000-0000-4000-8000-000000000002', 'manager', 'risk_supervisor'),
  ('a1102000-0000-4000-8000-000000000003', 'manager', 'secretariat_head'),
  ('a1102000-0000-4000-8000-000000000004', 'manager', 'manager'),
  ('a1102000-0000-4000-8000-000000000005', 'staff',   'assistant'),
  ('a1102000-0000-4000-8000-000000000006', 'manager', 'hr_manager'),
  ('a1102000-0000-4000-8000-000000000007', 'staff',   'hr_analyst'),
  ('a1102000-0000-4000-8000-000000000008', 'partner', 'partner')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active, practica_id, society_id, city)
SELECT ('51102000-0000-4000-8000-00000000000' || n)::uuid, ('a1102000-0000-4000-8000-00000000000' || n)::uuid,
       'U' || n, 'R1102', true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
       'La Paz'
FROM (VALUES ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7'), ('8')) AS v(n);

INSERT INTO public.clients (client_id, client_legal_name, tax_id, is_active) VALUES
  ('c1102000-0000-4000-8000-000000000001', 'R1102 Cliente externo', 'R1102-TAX-001', true);

INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id)
VALUES ('R1102-ACT', 'Harness Activity 1110-220', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;

SET LOCAL session_replication_role = replica;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, funcion, oficina, practica,
                                fecha_cierre, start_date, end_date, work_order_required, approval_required, is_internal,
                                society_id, manager_id, partner_id, created_by_staff_id)
VALUES
  ('e1102000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000160', 'R1102 EM', 'R1102-EM', 0, 1, 1,
   '2027-12-31', '2026-01-05', '2099-06-30', false, true, true,
   (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
   '51102000-0000-4000-8000-000000000004', '51102000-0000-4000-8000-000000000008', '51102000-0000-4000-8000-000000000004'),
  ('e1102000-0000-4000-8000-000000000002', 'c1102000-0000-4000-8000-000000000001', 'R1102 EC', 'R1102-EC', 1, 1, 1,
   '2027-12-31', '2026-01-05', '2099-06-30', true, true, false,
   (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
   '51102000-0000-4000-8000-000000000004', NULL, '51102000-0000-4000-8000-000000000004');
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, tax_rate, approval_status)
VALUES ('f1102000-0000-4000-8000-000000000001', 'e1102000-0000-4000-8000-000000000001', 'BOB', 'High', 0.13, 'Draft');
SET LOCAL session_replication_role = origin;

CREATE FUNCTION pg_temp.u(n integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'a1102000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;

CREATE FUNCTION pg_temp.s(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT ('51102000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

-- Alta administrativa por el RPC real, con el Gerente y la funcion que mande el llamador y work_order_required=false
-- en el payload (el trigger debe forzarlo a true para Talento Humano).
CREATE FUNCTION pg_temp.create_eng(p_name text, p_manager uuid, p_funcion smallint DEFAULT 0) RETURNS public.engagements
LANGUAGE sql AS $$
  SELECT public.create_engagement_with_code(
    p_engagement_name      := p_name,
    p_client_id            := CASE WHEN p_funcion = 1 THEN 'c1102000-0000-4000-8000-000000000001'::uuid
                                   ELSE 'c1000000-0000-4000-8000-000000000160'::uuid END,
    p_partner_id           := NULL,
    p_manager_id           := p_manager,
    p_start_date           := (now() AT TIME ZONE 'America/La_Paz')::date,
    p_end_date             := '2099-12-31'::date,
    p_status               := 'active',
    p_oficina              := 1::smallint,
    p_practica             := 1::smallint,
    p_funcion              := p_funcion,
    p_anio_fiscal          := 2026,
    p_work_order_required  := false,
    p_activity_required    := false,
    p_is_internal          := false,
    p_approval_required    := true,
    p_fecha_cierre         := '2026-03-31'::date,
    p_anio_fiscal_override := false,
    p_society_id           := (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.')
  );
$$;

-- Alta como el usuario: NULL si la base la rechazó.
CREATE FUNCTION pg_temp.try_create_as(p_n integer, p_name text, p_manager uuid, p_funcion smallint DEFAULT 0)
RETURNS public.engagements
LANGUAGE plpgsql AS $$
DECLARE v public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(p_n));
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := pg_temp.create_eng(p_name, p_manager, p_funcion);
  EXECUTE 'RESET ROLE';
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  RETURN NULL;
END $$;

-- Filas que alcanza una escritura como el usuario (la RLS de USING oculta filas; la de WITH CHECK da error). -1 si falló.
CREATE FUNCTION pg_temp.rows_as(p_sub text, p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM pg_temp.impersonate(p_sub);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  RETURN -1;
END $$;

CREATE FUNCTION pg_temp.count_as(p_sub text, p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM pg_temp.impersonate(p_sub);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql INTO n;
  EXECUTE 'RESET ROLE';
  RETURN n;
END $$;

-- ── 1. Catálogo ────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_diff text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.authorization_roles
                  WHERE role_key = 'secretariat_head' AND is_active AND legacy_app_role = 'manager'
                    AND label_key = 'authz.role.secretariat_head') THEN
    RAISE EXCEPTION '1110-220 FAIL — falta secretariat_head activo con legacy_app_role manager';
  END IF;

  -- Alcances exactos: lo que cada uno TIENE y, con NULL, lo que NO debe tener.
  SELECT string_agg(role_key || ':' || permission_key || ' esperado ' || coalesce(esperado, 'NADA') || ' tiene ' || coalesce(tiene, 'NADA'), ', ')
    INTO v_diff
    FROM (
      SELECT e.role_key, e.permission_key, e.esperado, rp.scope_key AS tiene
        FROM (VALUES
          ('accounting_manager', 'engagement.read',                'department'),
          ('accounting_manager', 'work_order.read',                'department'),
          ('accounting_manager', 'work_order.payment_plan.approve','department'),
          ('accounting_manager', 'worksheet.read',                 'assigned_engagements'),
          ('accounting_manager', 'timesheet_approval.read',        'assigned_engagements'),
          ('accounting_manager', 'timesheet_approval.approve',     'assigned_engagements'),
          ('accounting_manager', 'timesheet_approval.reject',      'assigned_engagements'),
          ('accounting_manager', 'engagement.create',              NULL),
          ('accounting_manager', 'engagement.update',              NULL),
          ('accounting_manager', 'work_order.create',              NULL),
          ('accounting_manager', 'work_order.update',              NULL),
          ('accounting_manager', 'worksheet.create',               NULL),
          ('risk_supervisor',    'engagement.read',                'department'),
          ('risk_supervisor',    'work_order.risk.read',           'department'),
          ('risk_supervisor',    'work_order.risk.approve',        'department'),
          ('risk_supervisor',    'work_order.read',                'assigned_engagements'),
          ('risk_supervisor',    'worksheet.read',                 'assigned_engagements'),
          ('risk_supervisor',    'timesheet_approval.read',        'assigned_engagements'),
          ('risk_supervisor',    'timesheet_approval.approve',     'assigned_engagements'),
          ('risk_supervisor',    'timesheet_approval.reject',      'assigned_engagements'),
          ('risk_supervisor',    'engagement.create',              NULL),
          ('risk_supervisor',    'engagement.update',              NULL),
          ('risk_supervisor',    'work_order.create',              NULL),
          ('risk_supervisor',    'work_order.update',              NULL),
          ('risk_supervisor',    'worksheet.create',               NULL),
          ('secretariat_head',   'engagement.read',                'assigned_engagements'),
          ('secretariat_head',   'work_order.read',                'assigned_engagements'),
          ('secretariat_head',   'worksheet.read',                 'assigned_engagements'),
          ('secretariat_head',   'timesheet_approval.approve',     'assigned_engagements'),
          ('secretariat_head',   'fund_request.create',            'own'),
          ('secretariat_head',   'engagement.create',              NULL),
          ('secretariat_head',   'engagement.update',              NULL),
          ('secretariat_head',   'work_order.create',              NULL),
          ('secretariat_head',   'work_order.update',              NULL),
          ('secretariat_head',   'worksheet.create',               NULL),
          ('secretariat_head',   'work_order.payment_plan.approve',NULL),
          ('hr_analyst',         'engagement.create',              'assigned_engagements'),
          ('hr_analyst',         'work_order.read',                'assigned_engagements'),
          ('hr_analyst',         'work_order.create',              'assigned_engagements'),
          ('hr_analyst',         'work_order.update',              'assigned_engagements'),
          ('hr_analyst',         'timesheet_approval.approve',     NULL),
          ('hr_analyst',         'worksheet.create',               NULL),
          ('hr_analyst',         'work_order.payment_plan.approve',NULL)
        ) AS e(role_key, permission_key, esperado)
        LEFT JOIN public.authorization_role_permissions rp
          ON rp.role_key = e.role_key AND rp.permission_key = e.permission_key
    ) x
   WHERE tiene IS DISTINCT FROM esperado;
  IF v_diff IS NOT NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — alcances inesperados: %', v_diff;
  END IF;
  IF (SELECT count(*) FROM public.authorization_role_permissions WHERE role_key = 'secretariat_head') <> 18 THEN
    RAISE EXCEPTION '1110-220 FAIL — secretariat_head debía tener 18 permisos';
  END IF;
  IF EXISTS (SELECT 1 FROM public.authorization_role_permissions
              WHERE role_key = 'secretariat_head'
                AND (permission_key LIKE 'competency.%' OR permission_key LIKE 'holiday.%'
                     OR permission_key = 'timesheet_admin_training_approval.manage')) THEN
    RAISE EXCEPTION '1110-220 FAIL — secretariat_head sin competencias, feriados ni capacitación';
  END IF;
  IF EXISTS (SELECT 1 FROM public.authorization_role_permissions
              WHERE role_key IN ('accounting_manager', 'risk_supervisor', 'secretariat_head')
                AND permission_key IN ('work_order.submit', 'engagement.delete')) THEN
    RAISE EXCEPTION '1110-220 FAIL — ninguno de los tres roles firma OT ni borra encargos';
  END IF;
  RAISE NOTICE 'PASS — catálogo: los tres roles solo miran y aprueban; hr_analyst gestiona OTs sin aprobar horas';
END $$;

-- ── 2. Alta: solo admin y Talento Humano crean no-Cliente ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n   integer;
  v_eng public.engagements;
BEGIN
  -- Gerente normal y los tres roles: rechazados aunque manden funcion 0.
  FOREACH v_n IN ARRAY ARRAY[1, 2, 3, 4] LOOP
    v_eng := pg_temp.try_create_as(v_n, 'R1102 rechazo ' || v_n, pg_temp.s(v_n));
    IF v_eng.engagement_id IS NOT NULL THEN
      RAISE EXCEPTION '1110-220 FAIL — el sujeto % creó un encargo administrativo', v_n;
    END IF;
  END LOOP;

  -- No-vacuidad: el Gerente normal SÍ tiene engagement.create; lo frena la regla nueva del trigger, no un permiso.
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM pg_temp.create_eng('R1102 rechazo M', pg_temp.s(4));
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — el Gerente normal creó un encargo administrativo';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    -- N1 (solo TH/Sistemas crean) o N12 (el Gerente normal no es Gerente de un administrativo): las dos rechazan.
    IF SQLERRM NOT LIKE '%solo Talento Humano y Sistemas%' AND SQLERRM NOT LIKE '%Gerente no valido%' THEN
      RAISE EXCEPTION '1110-220 FAIL — el rechazo del Gerente normal salió de otra regla: %', SQLERRM;
    END IF;
  END;

  -- hr_manager (plan_v5): ya no se autoasigna; queda el Aprobador que eligió y él como creador.
  v_eng := pg_temp.try_create_as(6, 'R1102 alta H', pg_temp.s(4));
  IF v_eng.engagement_id IS NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_manager debía poder crear un encargo administrativo';
  END IF;
  -- N16/Q3: TH elige si el administrativo lleva OT y si sus horas requieren aprobación (el payload se respeta).
  IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(4) OR v_eng.created_by_staff_id IS DISTINCT FROM pg_temp.s(6)
     OR v_eng.work_order_required IS NOT FALSE OR v_eng.approval_required IS NOT TRUE THEN
    RAISE EXCEPTION '1110-220 FAIL — alta de hr_manager: Aprobador % (esperado el elegido), creador %, OT obligatoria % (esperado false, la elige TH), aprobación %',
      v_eng.manager_id, v_eng.created_by_staff_id, v_eng.work_order_required, v_eng.approval_required;
  END IF;

  -- hr_analyst: elige al Aprobador entre los 14 roles; él queda como creador.
  v_eng := pg_temp.try_create_as(7, 'R1102 alta Y', pg_temp.s(6));
  IF v_eng.engagement_id IS NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst debía poder crear un encargo administrativo con Gerente de TH';
  END IF;
  IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(6) OR v_eng.created_by_staff_id IS DISTINCT FROM pg_temp.s(7)
     OR v_eng.work_order_required IS NOT FALSE OR v_eng.funcion <> 0 OR v_eng.is_internal IS NOT TRUE THEN
    RAISE EXCEPTION '1110-220 FAIL — alta de hr_analyst: Gerente %, creador %, OT obligatoria %, funcion %, interno %',
      v_eng.manager_id, v_eng.created_by_staff_id, v_eng.work_order_required, v_eng.funcion, v_eng.is_internal;
  END IF;

  -- plan_v5: el Analista de TH elige cualquiera de los 14 roles (Gerente normal, Contabilidad de su sociedad, Socio,
  -- Riesgos, Secretaría, otro de TH o él mismo).
  FOREACH v_n IN ARRAY ARRAY[4, 1, 8, 2, 3, 7] LOOP
    IF (pg_temp.try_create_as(7, 'R1102 Y con aprobador ' || v_n, pg_temp.s(v_n))).engagement_id IS NULL THEN
      RAISE EXCEPTION '1110-220 FAIL — hr_analyst debía poder elegir como Aprobador al sujeto %', v_n;
    END IF;
  END LOOP;

  -- plan_v5: fuera de la lista (asistente) o vacío, se rechaza.
  PERFORM pg_temp.impersonate(pg_temp.u(7));
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM pg_temp.create_eng('R1102 Y con asistente', pg_temp.s(5));
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst puso como Aprobador de horas a un asistente';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    IF SQLERRM NOT LIKE '%Aprobador de horas no valido%' THEN
      RAISE EXCEPTION '1110-220 FAIL — el rechazo del asistente salió de otra regla: %', SQLERRM;
    END IF;
  END;
  PERFORM pg_temp.impersonate(pg_temp.u(7));
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM pg_temp.create_eng('R1102 Y sin aprobador', NULL);
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst creó un administrativo sin Aprobador de horas';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    IF SQLERRM NOT LIKE '%Aprobador de horas es obligatorio%' THEN
      RAISE EXCEPTION '1110-220 FAIL — el rechazo del Aprobador vacío salió de otra regla: %', SQLERRM;
    END IF;
  END;

  -- plan_v5: el Gerente de Contabilidad solo es Aprobador de encargos de su sociedad.
  UPDATE public.staff SET society_id = (SELECT society_id FROM public.society WHERE name = 'Ruizmier Jauregui S.R.L.')
   WHERE staff_id = pg_temp.s(1);
  IF (pg_temp.try_create_as(7, 'R1102 Y con contabilidad ajena', pg_temp.s(1))).engagement_id IS NOT NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst eligió como Aprobador a Contabilidad de otra sociedad';
  END IF;
  UPDATE public.staff SET society_id = (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.')
   WHERE staff_id = pg_temp.s(1);
  -- Operador 2026-11-12: lo mismo para cualquiera de los 14 roles (aquí el Gerente normal de otra sociedad).
  UPDATE public.staff SET society_id = (SELECT society_id FROM public.society WHERE name = 'Ruizmier Jauregui S.R.L.')
   WHERE staff_id = pg_temp.s(4);
  PERFORM pg_temp.impersonate(pg_temp.u(7));
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM pg_temp.create_eng('R1102 Y con gerente ajeno', pg_temp.s(4));
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst eligió como Aprobador a alguien de otra sociedad';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    IF SQLERRM NOT LIKE '%sociedad del encargo%' THEN
      RAISE EXCEPTION '1110-220 FAIL — el rechazo por sociedad salió de otra regla: %', SQLERRM;
    END IF;
  END;
  UPDATE public.staff SET society_id = (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.')
   WHERE staff_id = pg_temp.s(4);

  -- Admin elige a Contabilidad como Gerente de "alta Y" (admin no está en el fixture: se simula como dueño, que es
  -- lo que deja la regla de admin). Desde aquí Contabilidad es la Gerente elegida de ese encargo.
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET manager_id = pg_temp.s(1) WHERE engagement_name = 'R1102 alta Y';
  PERFORM set_config('session_replication_role', 'origin', true);

  -- N13: Talento Humano no crea Control de Calidad (funcion 3); sí Capacitación (2).
  IF (pg_temp.try_create_as(6, 'R1102 calidad H', pg_temp.s(6), 3::smallint)).engagement_id IS NOT NULL
     OR (pg_temp.try_create_as(7, 'R1102 calidad Y', pg_temp.s(6), 3::smallint)).engagement_id IS NOT NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — Talento Humano creó un encargo de Control de Calidad';
  END IF;
  IF (pg_temp.try_create_as(7, 'R1102 capacitacion Y', pg_temp.s(6), 2::smallint)).engagement_id IS NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst debía poder crear Capacitación';
  END IF;

  -- N14: la Política de Planilla es solo de admin; el Gerente normal crea Cliente con OT y aprobación forzadas
  -- aunque el payload mande work_order_required=false.
  v_eng := pg_temp.try_create_as(4, 'R1102 cliente M', pg_temp.s(4), 1::smallint);
  IF v_eng.engagement_id IS NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente normal debía poder crear un encargo de Cliente';
  END IF;
  IF v_eng.work_order_required IS NOT TRUE OR v_eng.approval_required IS NOT TRUE THEN
    RAISE EXCEPTION '1110-220 FAIL — Cliente de un no-admin: OT obligatoria % y aprobación % debían ser true',
      v_eng.work_order_required, v_eng.approval_required;
  END IF;

  -- Talento Humano no crea Cliente (hr_analyst desde 0817-180; hr_manager desde plan_v3, N9).
  IF (pg_temp.try_create_as(7, 'R1102 cliente Y', pg_temp.s(4), 1::smallint)).engagement_id IS NOT NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst creó un encargo de Cliente';
  END IF;
  IF (pg_temp.try_create_as(6, 'R1102 cliente H', pg_temp.s(6), 1::smallint)).engagement_id IS NOT NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_manager creó un encargo de Cliente';
  END IF;
  RAISE NOTICE 'PASS — alta: solo Talento Humano crea no-Cliente; TH elige al Aprobador entre los 14 roles (obligatorio), la OT y la aprobación';
END $$;

-- ── 3. Candidatos a Aprobador de horas (los ve quien elige: admin y TH) ────────────────────────────────────────────────
DO $$
DECLARE v_ids uuid[];
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(7));
  SET LOCAL ROLE authenticated;
  SELECT array_agg(c.staff_id ORDER BY c.staff_id) INTO v_ids
    FROM public.get_hours_approver_candidates() c WHERE c.staff_id::text LIKE '51102000-%';
  RESET ROLE;
  -- plan_v5: los 14 roles; del fixture, todos menos el asistente (5).
  IF v_ids IS DISTINCT FROM ARRAY[pg_temp.s(1), pg_temp.s(2), pg_temp.s(3), pg_temp.s(4), pg_temp.s(6), pg_temp.s(7), pg_temp.s(8)] THEN
    RAISE EXCEPTION '1110-220 FAIL — candidatos a Aprobador para hr_analyst: % (esperado 1,2,3,4,6,7,8)', v_ids;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc pr CROSS JOIN LATERAL unnest(pr.proargnames) a(n)
              WHERE pr.oid = 'public.get_hours_approver_candidates()'::regprocedure AND a.n IN ('email', 'auth_user_id')) THEN
    RAISE EXCEPTION '1110-220 FAIL — get_hours_approver_candidates expone email o auth_user_id';
  END IF;

  -- Quien no elige (Gerente normal, Socio) no ve la lista aunque tenga engagement.create/.update.
  IF pg_temp.count_as(pg_temp.u(4), 'SELECT count(*) FROM public.get_hours_approver_candidates()') <> 0
     OR pg_temp.count_as(pg_temp.u(8), 'SELECT count(*) FROM public.get_hours_approver_candidates()') <> 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — un rol que no elige Aprobador vio candidatos';
  END IF;
  IF has_function_privilege('anon', 'public.get_hours_approver_candidates()', 'EXECUTE') THEN
    RAISE EXCEPTION '1110-220 FAIL — anon puede ejecutar get_hours_approver_candidates';
  END IF;

  -- Los grupos del Equipo ya no traen a TH, Contabilidad, Riesgos ni Secretaría; el Gerente normal sigue en manager.
  PERFORM pg_temp.impersonate(pg_temp.u(7));
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.get_engagement_team_candidates() c
              WHERE c.staff_id IN (pg_temp.s(1), pg_temp.s(2), pg_temp.s(3), pg_temp.s(6), pg_temp.s(7)))
     OR NOT EXISTS (SELECT 1 FROM public.get_engagement_team_candidates() c
                     WHERE c.candidate_group = 'manager' AND c.staff_id = pg_temp.s(4)) THEN
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — el Equipo debía ofrecer al Gerente normal y a ninguno de TH/Contabilidad/Riesgos/Secretaría';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — candidatos a Aprobador: 14 roles, solo para admin/TH, sin PII; el Equipo de Cliente sigue con sus gerentes';
END $$;

-- ── 4. Aprobación de horas: el Gerente elegido aprueba; el Analista que creó, no ──────────────────────────────────────
SET LOCAL session_replication_role = replica;
INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, is_forecast)
SELECT pg_temp.s(5), e.engagement_id, (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'R1102-ACT'),
       '2026-03-03', 2, false
  FROM public.engagements e
 WHERE e.engagement_name IN ('R1102 alta Y', 'R1102 EM');
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_ey uuid := (SELECT engagement_id FROM public.engagements WHERE engagement_name = 'R1102 alta Y');
  v_em uuid := 'e1102000-0000-4000-8000-000000000001';
  v_p  uuid := gen_random_uuid();
BEGIN
  IF NOT public.can_approve_timesheet_line(pg_temp.u(1)::uuid, v_p, v_ey) THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager debía aprobar las líneas del encargo donde lo eligieron Gerente';
  END IF;
  IF public.can_approve_timesheet_line(pg_temp.u(1)::uuid, v_p, v_em) THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager aprobó una línea de un encargo que no gerencia (boleta mixta)';
  END IF;
  IF public.can_approve_timesheet_line(pg_temp.u(7)::uuid, v_p, v_ey) THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst aprobó horas del encargo que creó';
  END IF;
  IF NOT public.can_approve_timesheet_line(pg_temp.u(4)::uuid, v_p, v_em) THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente normal de un administrativo debía seguir aprobando sus horas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_timesheet_approvers(pg_temp.s(5), '2026-03-02') a
                  WHERE a.approver_staff_id = pg_temp.s(1)) THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager no aparece como aprobador de la semana';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_timesheet_approvers(pg_temp.s(5), '2026-03-02') a
              WHERE a.approver_staff_id IN (pg_temp.s(2), pg_temp.s(3), pg_temp.s(7))) THEN
    RAISE EXCEPTION '1110-220 FAIL — Riesgos, Secretaría o el Analista de TH aparecen como aprobadores sin gerenciar';
  END IF;
  RAISE NOTICE 'PASS — aprobación: aprueba el Gerente elegido (también el normal), no el Analista creador';
END $$;

-- ── 4b. plan_v5: el Aprobador de horas decide sin el permiso global; solo en su no-Cliente ─────────────────────────────
-- Sujeto 9: senior (no tiene timesheet_approval.approve). EV: no-Cliente con Aprobador 9 y Socio P, sembrado como dueño.
INSERT INTO auth.users (id) VALUES ('a1102000-0000-4000-8000-000000000009');
INSERT INTO public.user_roles (user_id, role, role_key) VALUES ('a1102000-0000-4000-8000-000000000009', 'staff', 'senior')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active, practica_id, society_id, city)
VALUES ('51102000-0000-4000-8000-000000000009', 'a1102000-0000-4000-8000-000000000009', 'U9', 'R1102', true,
        (SELECT practica_id FROM public.practicas WHERE code = 1),
        (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'), 'La Paz');
SET LOCAL session_replication_role = replica;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, funcion, oficina, practica,
                                fecha_cierre, start_date, end_date, work_order_required, approval_required, is_internal,
                                society_id, manager_id, partner_id, created_by_staff_id)
VALUES ('e1102000-0000-4000-8000-000000000009', 'c1000000-0000-4000-8000-000000000160', 'R1102 EV', 'R1102-EV', 0, 1, 1,
        '2027-12-31', '2026-01-05', '2099-06-30', true, true, true,
        (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
        '51102000-0000-4000-8000-000000000009', '51102000-0000-4000-8000-000000000008', '51102000-0000-4000-8000-000000000006');
-- El senior también figura como Socio de EC (Cliente) para probar que ser Aprobador de un no-Cliente no abre Cliente.
UPDATE public.engagements SET partner_id = '51102000-0000-4000-8000-000000000009' WHERE engagement_id = 'e1102000-0000-4000-8000-000000000002';
INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, is_forecast)
VALUES ('51102000-0000-4000-8000-000000000005', 'e1102000-0000-4000-8000-000000000009',
        (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'R1102-ACT'), '2026-03-04', 3, false),
       ('51102000-0000-4000-8000-000000000005', 'e1102000-0000-4000-8000-000000000002',
        (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'R1102-ACT'), '2026-03-04', 1, false);
INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year, submitted_at)
VALUES ('d1102000-0000-4000-8000-000000000009', '51102000-0000-4000-8000-000000000005', '2026-03-02', 10, 2026, now())
ON CONFLICT DO NOTHING;
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_ev uuid := 'e1102000-0000-4000-8000-000000000009';
  v_ec uuid := 'e1102000-0000-4000-8000-000000000002';
  v_em uuid := 'e1102000-0000-4000-8000-000000000001';
  v_p  uuid := (SELECT period_id FROM public.timesheet_periods
                 WHERE staff_id = pg_temp.s(5) AND week_start_date = '2026-03-02' LIMIT 1);
BEGIN
  IF EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'senior' AND permission_key = 'timesheet_approval.approve') THEN
    RAISE EXCEPTION '1110-220 FAIL (fixture) — senior no debía tener timesheet_approval.approve';
  END IF;
  IF NOT public.can_approve_timesheet_line(pg_temp.u(9)::uuid, v_p, v_ev) THEN
    RAISE EXCEPTION '1110-220 FAIL — el senior Aprobador de horas debía aprobar las líneas de su no-Cliente';
  END IF;
  IF public.can_approve_timesheet_line(pg_temp.u(9)::uuid, v_p, v_ec) THEN
    RAISE EXCEPTION '1110-220 FAIL — ser Aprobador de un no-Cliente le abrió aprobar Cliente (Socio sin permiso)';
  END IF;
  -- El Socio de un no-Cliente aprueba el encargo, no las horas.
  IF public.can_approve_timesheet_line(pg_temp.u(8)::uuid, v_p, v_ev) THEN
    RAISE EXCEPTION '1110-220 FAIL — el Socio de un no-Cliente decidió horas sin ser su Aprobador';
  END IF;
  -- Período mixto: el senior entra a la boleta por EV y solo ve como aprobables las líneas de EV.
  IF NOT public.can_approve_timesheet(pg_temp.u(9)::uuid, v_p) THEN
    RAISE EXCEPTION '1110-220 FAIL — el senior debía poder abrir la boleta que tiene líneas de su no-Cliente';
  END IF;
  IF pg_temp.count_as(pg_temp.u(9), format('SELECT count(*) FROM public.my_approvable_engagement_ids() id WHERE id IN (%L, %L, %L)', v_ev, v_ec, v_em)) <> 1
     OR pg_temp.count_as(pg_temp.u(9), format('SELECT count(*) FROM public.my_approvable_engagement_ids() id WHERE id = %L', v_ev)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — my_approvable_engagement_ids del senior debía ser solo EV';
  END IF;
  IF pg_temp.count_as(pg_temp.u(9), format('SELECT count(*) FROM public.my_approvable_period_ids() id WHERE id = %L', v_p)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — my_approvable_period_ids del senior no trae la boleta (espejo de can_approve_timesheet)';
  END IF;
  IF pg_temp.count_as(pg_temp.u(9), format('SELECT count(*) FROM public.get_approvable_pairs(ARRAY[%L, %L]::uuid[], ARRAY[%L, %L]::uuid[])', v_p, v_p, v_ev, v_ec)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — get_approvable_pairs del senior debía devolver solo el par de EV';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_timesheet_approvers(pg_temp.s(5), '2026-03-02') a WHERE a.approver_staff_id = pg_temp.s(9)) THEN
    RAISE EXCEPTION '1110-220 FAIL — el senior Aprobador no aparece en get_timesheet_approvers';
  END IF;

  -- Switch de horas apagado: sus líneas se autoaprueban, el Aprobador deja de figurar como destinatario por ellas.
  UPDATE public.engagements SET approval_required = false WHERE engagement_id = v_ev;
  IF EXISTS (SELECT 1 FROM public.get_timesheet_approvers(pg_temp.s(5), '2026-03-02') a WHERE a.approver_staff_id = pg_temp.s(9)) THEN
    RAISE EXCEPTION '1110-220 FAIL — con la aprobación de horas apagada el Aprobador seguía como destinatario';
  END IF;
  UPDATE public.engagements SET approval_required = true WHERE engagement_id = v_ev;

  -- Baja o cambio de rol: la asignación guardada deja de dar el privilegio.
  UPDATE public.staff SET is_active = false WHERE staff_id = pg_temp.s(9);
  IF public.can_approve_timesheet_line(pg_temp.u(9)::uuid, v_p, v_ev) THEN
    RAISE EXCEPTION '1110-220 FAIL — un Aprobador dado de baja siguió decidiendo horas';
  END IF;
  UPDATE public.staff SET is_active = true WHERE staff_id = pg_temp.s(9);
  UPDATE public.user_roles SET role_key = 'semisenior' WHERE user_id = pg_temp.u(9)::uuid;
  IF public.can_approve_timesheet_line(pg_temp.u(9)::uuid, v_p, v_ev) THEN
    RAISE EXCEPTION '1110-220 FAIL — un Aprobador que pasó a un rol fuera de la lista siguió decidiendo horas';
  END IF;
  UPDATE public.user_roles SET role_key = 'senior' WHERE user_id = pg_temp.u(9)::uuid;

  -- Cliente intacto: el Gerente normal de EC aprueba; el permiso global sigue mandando ahí.
  IF NOT public.can_approve_timesheet_line(pg_temp.u(4)::uuid, v_p, v_ec) THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente de un encargo de Cliente dejó de aprobar sus horas';
  END IF;
  RAISE NOTICE 'PASS — Aprobador de horas: decide su no-Cliente sin permiso global, no Cliente; el Socio no decide horas; baja/rol lo cortan; switch apagado no avisa';
END $$;
SET LOCAL session_replication_role = replica;
UPDATE public.engagements SET partner_id = NULL WHERE engagement_id = 'e1102000-0000-4000-8000-000000000002';
SET LOCAL session_replication_role = origin;

-- ── 5. OTs: solo Talento Humano, admin y el Socio escriben las de un no-Cliente ───────────────────────────────────────
DO $$
DECLARE
  ins constant text := 'INSERT INTO public.work_orders (engagement_id, currency, season_mode, tax_rate) VALUES (%L, ''BOB'', ''High'', 0.13)';
  upd constant text := 'UPDATE public.work_orders SET adjustment_amount = 0 WHERE wo_id = %L';
  v_ey uuid := (SELECT engagement_id FROM public.engagements WHERE engagement_name = 'R1102 alta Y');
  v_wm uuid := 'f1102000-0000-4000-8000-000000000001';
  v_wy uuid;
BEGIN
  -- Gerente normal de EM: tiene work_order.create y es manager_id, pero la RESTRICTIVE lo frena.
  IF pg_temp.rows_as(pg_temp.u(4), format(ins, 'e1102000-0000-4000-8000-000000000001')) <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente normal creó una OT en un encargo administrativo';
  END IF;
  -- Contabilidad, Gerente elegido de alta Y: no crea.
  IF pg_temp.rows_as(pg_temp.u(1), format(ins, v_ey)) <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager creó una OT';
  END IF;
  -- plan_v5: con "Requiere OT" apagado (así se crearon alta Y y alta H) no se le crea OT, ni su creador.
  IF pg_temp.rows_as(pg_temp.u(7), format(ins, v_ey)) <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — se creó una OT en un administrativo sin OT';
  END IF;
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET work_order_required = true WHERE engagement_name IN ('R1102 alta Y', 'R1102 alta H');
  PERFORM set_config('session_replication_role', 'origin', true);
  -- Analista de TH, creador de alta Y: crea.
  IF pg_temp.rows_as(pg_temp.u(7), format(ins, v_ey)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst debía crear la OT del encargo que creó';
  END IF;
  -- plan_v5: el Gerente de TH crea la OT del encargo que creó aunque el Aprobador sea otro.
  IF pg_temp.rows_as(pg_temp.u(6), format(ins, (SELECT engagement_id FROM public.engagements WHERE engagement_name = 'R1102 alta H'))) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_manager debía crear la OT del encargo que creó (Aprobador: el Gerente normal)';
  END IF;
  -- ...y el Gerente normal, Aprobador de ese encargo, no.
  IF pg_temp.rows_as(pg_temp.u(4), format(ins, (SELECT engagement_id FROM public.engagements WHERE engagement_name = 'R1102 alta H'))) <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Aprobador de horas creó una OT';
  END IF;
  -- Control: el Gerente normal sí crea en Cliente.
  IF pg_temp.rows_as(pg_temp.u(4), format(ins, 'e1102000-0000-4000-8000-000000000002')) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente normal debía seguir creando OTs de Cliente';
  END IF;

  SELECT wo_id INTO v_wy FROM public.work_orders WHERE engagement_id = v_ey;
  IF pg_temp.rows_as(pg_temp.u(7), format(upd, v_wy)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst debía editar la OT del encargo que creó (filas %, OTs del encargo %)',
      pg_temp.rows_as(pg_temp.u(7), format(upd, v_wy)), (SELECT count(*) FROM public.work_orders WHERE engagement_id = v_ey);
  END IF;
  IF pg_temp.rows_as(pg_temp.u(1), format(upd, v_wy)) > 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager (Gerente elegido) editó la OT';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(4), format(upd, v_wm)) > 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente normal editó la OT de su encargo administrativo';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(8), format(upd, v_wm)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Socio del encargo administrativo debía poder escribir la OT (firma)';
  END IF;

  -- Lectura: el Gerente normal y el elegido siguen viendo la OT.
  IF pg_temp.count_as(pg_temp.u(4), format('SELECT count(*) FROM public.work_orders WHERE wo_id = %L', v_wm)) <> 1
     OR pg_temp.count_as(pg_temp.u(1), format('SELECT count(*) FROM public.work_orders WHERE wo_id = %L', v_wy)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente debía seguir viendo la OT que no puede editar';
  END IF;
  RAISE NOTICE 'PASS — OTs no-Cliente: crea y edita Talento Humano; el Socio firma; el Gerente que no es TH solo mira';
END $$;

-- ── 6. Edición del encargo no-Cliente ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  upd_name constant text := 'UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_name = %L';
BEGIN
  IF pg_temp.rows_as(pg_temp.u(4), format(upd_name, 'R1102 EM')) > 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente normal editó su encargo administrativo';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(4), format(upd_name, 'R1102 EC')) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente normal debía seguir editando su encargo de Cliente';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(1), format(upd_name, 'R1102 alta Y')) > 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager (Gerente elegido) editó el encargo';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(7), format(upd_name, 'R1102 alta Y')) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst debía editar el encargo que creó';
  END IF;
  -- N10 ("cada uno lo suyo"): Talento Humano ve todos los administrativos pero edita solo lo que creó o gerencia.
  IF pg_temp.rows_as(pg_temp.u(6), format(upd_name, 'R1102 EM')) > 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_manager editó un administrativo ajeno';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(6), format(upd_name, 'R1102 alta Y')) > 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_manager editó el administrativo que creó el Analista';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(6), format(upd_name, 'R1102 alta H')) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_manager debía editar el administrativo que creó';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(7), format(upd_name, 'R1102 alta H')) > 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst editó el administrativo que creó el Gerente de TH';
  END IF;
  IF pg_temp.count_as(pg_temp.u(7), 'SELECT count(*) FROM public.engagements WHERE engagement_name = ''R1102 alta H''') <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst debía VER el administrativo del Gerente de TH (solo lectura)';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(3), format(upd_name, 'R1102 EM')) > 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — secretariat_head editó un administrativo';
  END IF;
  -- plan_v5: TH Aprobador de un administrativo ajeno no lo edita (ser Aprobador no da edición).
  IF pg_temp.rows_as(pg_temp.u(6), format(upd_name, 'R1102 capacitacion Y')) > 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_manager editó el administrativo donde solo es Aprobador de horas';
  END IF;
  -- plan_v5 (reemplaza N15): en un no-Cliente la aprobación de horas se puede apagar.
  PERFORM pg_temp.rows_as(pg_temp.u(6), 'UPDATE public.engagements SET approval_required = false WHERE engagement_name = ''R1102 alta H''');
  IF (SELECT approval_required FROM public.engagements WHERE engagement_name = 'R1102 alta H') IS NOT FALSE THEN
    RAISE EXCEPTION '1110-220 FAIL — el creador TH no pudo apagar la aprobación de horas de su no-Cliente';
  END IF;
  RAISE NOTICE 'PASS — edición no-Cliente: cada uno de TH edita lo que creó y ve lo demás; el Aprobador no edita; la aprobación de horas se elige';
END $$;

-- ── 6b. Control de Calidad (N19): solo admin lo edita; TH lo ve solo si es su Gerente ─────────────────────────────
-- Lo crea admin; admin no está en el fixture, así que se siembra como dueño: EQ con Gerente de TH (H) y Socio P.
SET LOCAL session_replication_role = replica;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, funcion, oficina, practica,
                                fecha_cierre, start_date, end_date, work_order_required, approval_required, is_internal,
                                society_id, manager_id, partner_id, created_by_staff_id)
VALUES ('e1102000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000160', 'R1102 EQ', 'R1102-EQ', 3, 1, 1,
        '2027-12-31', '2026-01-05', '2099-06-30', false, true, true,
        (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
        '51102000-0000-4000-8000-000000000006', '51102000-0000-4000-8000-000000000008', '51102000-0000-4000-8000-000000000004');
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  upd constant text := 'UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_name = ''R1102 EQ''';
  rd  constant text := 'SELECT count(*) FROM public.engagements WHERE engagement_name = ''R1102 EQ''';
  por constant text := 'SELECT count(*) FROM (SELECT jsonb_array_elements(public.list_portfolio_engagements()) e) x WHERE x.e ->> ''engagement_name'' = ''R1102 EQ''';
  adm constant text := 'SELECT count(*) FROM (SELECT jsonb_array_elements(public.list_administrative_engagements()) e) x WHERE x.e ->> ''engagement_name'' = ''R1102 EQ''';
BEGIN
  IF pg_temp.rows_as(pg_temp.u(6), upd) > 0 OR pg_temp.rows_as(pg_temp.u(8), upd) > 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — Control de Calidad: su Gerente de TH o su Socio editaron el encargo (solo admin)';
  END IF;
  IF pg_temp.count_as(pg_temp.u(6), por) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente de TH del encargo de Calidad debía verlo';
  END IF;
  -- El detalle (RLS y portafolio) sigue cerrado; la lista "Todos" de Encargos Administrativos sí lo muestra
  -- (operador 2026-11-12: es consulta sin detalle).
  IF pg_temp.count_as(pg_temp.u(7), rd) <> 0 OR pg_temp.count_as(pg_temp.u(7), por) <> 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Analista de TH abrió un encargo de Calidad ajeno (RLS %, portafolio %)',
      pg_temp.count_as(pg_temp.u(7), rd), pg_temp.count_as(pg_temp.u(7), por);
  END IF;
  -- (Solo el Analista: el fixture no tiene año fiscal y quien no crea encargos solo ve el año vigente.)
  IF pg_temp.count_as(pg_temp.u(7), adm) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el encargo de Calidad debía salir en la lista "Todos" de Encargos Administrativos';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(6), 'INSERT INTO public.work_orders (engagement_id, currency, season_mode, tax_rate) VALUES (''e1102000-0000-4000-8000-000000000003'', ''BOB'', ''High'', 0.13)') <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente de TH creó la OT de un encargo de Calidad';
  END IF;
  RAISE NOTICE 'PASS — Control de Calidad: solo admin lo edita; el detalle lo abre quien figura en él; la lista "Todos" lo muestra';
END $$;

-- ── 7. RPC definer: equipo del encargo ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_denied boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.save_engagement_assignments('e1102000-0000-4000-8000-000000000001'::uuid, '[]'::jsonb, ARRAY[]::uuid[]);
  EXCEPTION WHEN OTHERS THEN
    v_denied := SQLERRM = 'EAS_DENIED';
  END;
  RESET ROLE;
  IF NOT v_denied THEN
    RAISE EXCEPTION '1110-220 FAIL — save_engagement_assignments dejó al Gerente normal escribir el equipo de un administrativo';
  END IF;
  IF NOT public.can_write_administrative_work('e1102000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION '1110-220 FAIL — can_write_administrative_work sin sesión debía ser true';
  END IF;
  RAISE NOTICE 'PASS — RPC de equipo: el Gerente que no es TH no escribe el equipo de un administrativo';
END $$;

-- ── 8. Lectura: Secretaría ve solo lo que gerencia; Contabilidad por sociedad ─────────────────────────────────────────
DO $$
DECLARE
  rd  constant text := 'SELECT count(*) FROM public.engagements WHERE engagement_id IN (''e1102000-0000-4000-8000-000000000001'', ''e1102000-0000-4000-8000-000000000002'')';
  por constant text := 'SELECT count(*) FROM (SELECT jsonb_array_elements(public.list_portfolio_engagements()) e) x WHERE x.e ->> ''engagement_name'' IN (''R1102 EM'', ''R1102 EC'')';
  vis constant text := 'SELECT count(*) FROM public.my_visible_engagement_ids() id WHERE id IN (''e1102000-0000-4000-8000-000000000001'', ''e1102000-0000-4000-8000-000000000002'')';
BEGIN
  IF pg_temp.count_as(pg_temp.u(3), rd) <> 0 OR pg_temp.count_as(pg_temp.u(3), por) <> 0 OR pg_temp.count_as(pg_temp.u(3), vis) <> 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — secretariat_head vio un administrativo que no gerencia (RLS %, portafolio %, conjunto %)',
      pg_temp.count_as(pg_temp.u(3), rd), pg_temp.count_as(pg_temp.u(3), por), pg_temp.count_as(pg_temp.u(3), vis);
  END IF;
  UPDATE public.engagements SET manager_id = pg_temp.s(3) WHERE engagement_id = 'e1102000-0000-4000-8000-000000000001';
  IF pg_temp.count_as(pg_temp.u(3), rd) <> 1 OR pg_temp.count_as(pg_temp.u(3), por) <> 1 OR pg_temp.count_as(pg_temp.u(3), vis) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — secretariat_head debía ver el administrativo que gerencia (RLS %, portafolio %, conjunto %)',
      pg_temp.count_as(pg_temp.u(3), rd), pg_temp.count_as(pg_temp.u(3), por), pg_temp.count_as(pg_temp.u(3), vis);
  END IF;
  -- Vuelve al Gerente normal del fixture como dueño y sin triggers (EM es un fixture histórico: hoy N12 no lo dejaría).
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET manager_id = pg_temp.s(4) WHERE engagement_id = 'e1102000-0000-4000-8000-000000000001';
  PERFORM set_config('session_replication_role', 'origin', true);
  RAISE NOTICE 'PASS — Secretaría ve solo los administrativos que gerencia';

  -- Contabilidad: la ficha (portafolio) abre el administrativo ajeno de su sociedad que ya lee por RLS; el de Cliente no.
  IF pg_temp.count_as(pg_temp.u(1), por) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager debía ver EM en el portafolio y no EC (ve %)', pg_temp.count_as(pg_temp.u(1), por);
  END IF;
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET society_id = (SELECT society_id FROM public.society WHERE society_id IS DISTINCT FROM
         (SELECT society_id FROM public.staff WHERE staff_id = pg_temp.s(1)) ORDER BY name LIMIT 1)
   WHERE engagement_id = 'e1102000-0000-4000-8000-000000000001';
  IF pg_temp.count_as(pg_temp.u(1), por) <> 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager vio en el portafolio un administrativo de otra sociedad';
  END IF;
  UPDATE public.engagements SET society_id = (SELECT society_id FROM public.staff WHERE staff_id = pg_temp.s(1))
   WHERE engagement_id = 'e1102000-0000-4000-8000-000000000001';
  PERFORM set_config('session_replication_role', 'origin', true);
  RAISE NOTICE 'PASS — Contabilidad abre los administrativos ajenos de su sociedad (portafolio), no los de otra ni los de Cliente';
END $$;

-- ── 9. Avisos (D9, sin cambios en plan_v3) ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_got text;
BEGIN
  -- Alcance 'assigned' = avisos de Gerente: 22 del set (accounting_manager 20: sin los 2 de fondos que ya tiene con
  -- department) + approval.reminder.weekly + approval.reversal_executed. Les llegan como Gerente elegido.
  SELECT string_agg(role_key || '=' || n, ', ' ORDER BY role_key) INTO v_got FROM (
    SELECT role_key, count(*) AS n FROM public.notification_role_types
     WHERE role_key IN ('accounting_manager', 'risk_supervisor', 'secretariat_head') AND scope_key = 'assigned'
     GROUP BY role_key) x;
  IF v_got IS DISTINCT FROM 'accounting_manager=22, risk_supervisor=24, secretariat_head=24' THEN
    RAISE EXCEPTION '1110-220 FAIL — conteo de avisos de Gerente inesperado: %', v_got;
  END IF;
  IF (SELECT count(*) FROM public.notification_role_types
       WHERE role_key IN ('accounting_manager', 'risk_supervisor', 'secretariat_head')
         AND type_key = 'approval.reversal_rejected' AND scope_key = 'own') <> 3 THEN
    RAISE EXCEPTION '1110-220 FAIL — los tres roles reciben el rechazo de sus reversiones';
  END IF;
  IF (SELECT count(*) FROM public.notification_role_types
       WHERE role_key = 'secretariat_head' AND scope_key = 'own'
         AND type_key IN ('auth.account.email', 'auth.role.changed')) <> 2 THEN
    RAISE EXCEPTION '1110-220 FAIL — secretariat_head recibe sus avisos de cuenta';
  END IF;
  IF (SELECT count(*) FROM public.notification_role_types
       WHERE role_key = 'accounting_manager' AND scope_key = 'department'
         AND type_key IN ('fund.expense.manager_auto_approved', 'fund.expense.review_auto_approved')) <> 2 THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager perdió el alcance department de sus avisos de fondos';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notification_role_types
              WHERE role_key IN ('accounting_manager', 'risk_supervisor', 'secretariat_head')
                AND (type_key LIKE 'staff.%' OR type_key IN ('approval.training_pending', 'timesheet.pending_approval'))) THEN
    RAISE EXCEPTION '1110-220 FAIL — los tres roles no reciben alta/baja de personal, capacitación ni semanas propias';
  END IF;
  IF (SELECT count(*) FROM public.notification_role_types
       WHERE role_key IN ('accounting_manager', 'risk_supervisor', 'secretariat_head')
         AND type_key = 'approval.reminder.weekly' AND scope_key = 'assigned') <> 3 THEN
    RAISE EXCEPTION '1110-220 FAIL — los tres roles reciben el recordatorio semanal de aprobaciones';
  END IF;
  RAISE NOTICE 'PASS — avisos: set de gerente para los tres, sin personal/capacitación, con recordatorio semanal';
END $$;

-- ── 10. plan_v5: firma del Socio sin OT, sin horas sin OT, candado después de la firma ──────────────────────────────
DO $$
DECLARE
  v_eng  public.engagements;
  v_id   uuid;
  v_wo   uuid;
  v_ok   boolean;
  v_n    bigint;
  -- Cambio real (un UPDATE sin cambios no lo frena el candado: no modifica nada).
  upd    constant text := 'UPDATE public.engagements SET engagement_name = engagement_name || ''.'' WHERE engagement_id = %L';
BEGIN
  -- Alta de TH sin OT: nace pendiente de la firma del Socio.
  v_eng := pg_temp.try_create_as(6, 'R1102 sin OT H', pg_temp.s(4));
  v_id := v_eng.engagement_id;
  IF v_id IS NULL OR v_eng.work_order_required IS NOT FALSE OR v_eng.partner_approval_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION '1110-220 FAIL — un no-Cliente sin OT debía nacer pendiente de la firma (id %, OT %, firma %)',
      v_id, v_eng.work_order_required, v_eng.partner_approval_status;
  END IF;
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET partner_id = pg_temp.s(8) WHERE engagement_id = v_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  -- Sin OT no hay horas (Q2), ni en la lista de carga ni por API.
  v_ok := false;
  BEGIN
    INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, is_forecast)
    VALUES (pg_temp.s(5), v_id, (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'R1102-ACT'),
            (now() AT TIME ZONE 'America/La_Paz')::date, 1, false);
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE '%sin OT no admite horas%';
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION '1110-220 FAIL — se cargaron horas en un no-Cliente sin OT';
  END IF;
  IF public.engagement_allows_hours_or_requests(v_id) THEN
    RAISE EXCEPTION '1110-220 FAIL — engagement_allows_hours_or_requests dejó pasar un no-Cliente sin OT';
  END IF;
  IF pg_temp.count_as(pg_temp.u(5), format('SELECT count(*) FROM public.list_loggable_engagements() l WHERE l.engagement_id = %L', v_id)) <> 0 THEN
    RAISE EXCEPTION '1110-220 FAIL — list_loggable_engagements ofrece un no-Cliente sin OT';
  END IF;

  -- La firma no se fabrica por UPDATE directo.
  IF pg_temp.rows_as(pg_temp.u(6), format('UPDATE public.engagements SET partner_approval_status = ''approved'' WHERE engagement_id = %L', v_id)) <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el creador TH aprobó el encargo con un UPDATE directo';
  END IF;

  -- Solo el Socio decide; rechazar exige motivo.
  IF pg_temp.rows_as(pg_temp.u(6), format('SELECT public.decide_engagement_partner_approval(%L, true)', v_id)) <> -1
     OR pg_temp.rows_as(pg_temp.u(4), format('SELECT public.decide_engagement_partner_approval(%L, true)', v_id)) <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — alguien que no es el Socio aprobó el encargo';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(8), format('SELECT public.decide_engagement_partner_approval(%L, false, ''  '')', v_id)) <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Socio rechazó sin motivo';
  END IF;
  -- La llamada va en su propia sentencia: Postgres no garantiza el orden de evaluación de un OR.
  v_n := pg_temp.rows_as(pg_temp.u(8), format('SELECT public.decide_engagement_partner_approval(%L, false, ''falta el detalle'')', v_id));
  IF v_n <> 1 OR (SELECT partner_approval_status FROM public.engagements WHERE engagement_id = v_id) IS DISTINCT FROM 'rejected' THEN
    RAISE EXCEPTION '1110-220 FAIL — el Socio debía poder rechazar con motivo';
  END IF;
  -- Rechazado: el creador TH sigue editando y lo reenvía; el Socio aprueba.
  IF pg_temp.rows_as(pg_temp.u(6), format(upd, v_id)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el creador TH no pudo editar un encargo rechazado';
  END IF;
  IF pg_temp.rows_as(pg_temp.u(7), format('SELECT public.resubmit_engagement_partner_approval(%L)', v_id)) <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — un TH que no lo creó reenvió el encargo';
  END IF;
  v_n := pg_temp.rows_as(pg_temp.u(6), format('SELECT public.resubmit_engagement_partner_approval(%L)', v_id));
  IF v_n <> 1 OR (SELECT partner_approval_status FROM public.engagements WHERE engagement_id = v_id) IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION '1110-220 FAIL — el creador TH debía poder reenviar el encargo rechazado';
  END IF;
  -- Aviso al Socio: el reenvío (rechazado -> pendiente) le pide la aprobación.
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'engagement.partner_approval_requested'
                    AND recipient_staff_id = pg_temp.s(8) AND entity_id = v_id::text) THEN
    RAISE EXCEPTION '1110-220 FAIL — el Socio no recibió el pedido de aprobación del encargo sin OT';
  END IF;
  -- Contador del creador TH: el encargo sin OT figura como "esperando al Socio".
  IF (public.engagement_approval_bucket(pg_temp.s(6), 'Pending_Approval') ->> 'count')::int < 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el contador del creador no incluye el no-Cliente sin OT pendiente';
  END IF;
  IF public.engagement_is_approved_state(v_id, NULL, false) THEN
    RAISE EXCEPTION '1110-220 FAIL — un no-Cliente sin OT pendiente contó como Aprobado';
  END IF;
  v_n := pg_temp.rows_as(pg_temp.u(8), format('SELECT public.decide_engagement_partner_approval(%L, true)', v_id));
  IF v_n <> 1 OR (SELECT partner_approval_status FROM public.engagements WHERE engagement_id = v_id) IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION '1110-220 FAIL — el Socio debía poder aprobar el encargo sin OT';
  END IF;
  IF NOT public.engagement_is_approved_state(v_id, NULL, false) THEN
    RAISE EXCEPTION '1110-220 FAIL — un no-Cliente sin OT firmado debía contar como Aprobado';
  END IF;
  -- El creador TH recibe la decisión del Socio (rechazo y aprobación).
  IF (SELECT count(*) FROM public.notifications
       WHERE type_key = 'engagement.partner_approval_decided' AND recipient_staff_id = pg_temp.s(6)
         AND entity_id = v_id::text) <> 2 THEN
    RAISE EXCEPTION '1110-220 FAIL — el creador TH debía recibir el rechazo y la aprobación del Socio';
  END IF;

  -- Candado (Q4): firmado, ni el creador TH ni el Socio lo modifican. Sigue sin aceptar horas (Q2).
  IF pg_temp.rows_as(pg_temp.u(6), format(upd, v_id)) <> -1
     OR pg_temp.rows_as(pg_temp.u(6), format('UPDATE public.engagements SET work_order_required = true WHERE engagement_id = %L', v_id)) <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el creador TH modificó un no-Cliente ya aprobado por el Socio';
  END IF;
  IF public.engagement_allows_hours_or_requests(v_id) THEN
    RAISE EXCEPTION '1110-220 FAIL — un no-Cliente sin OT firmado admitió horas';
  END IF;

  -- Con OT: mientras la OT no está aprobada se edita; aprobada, candado.
  v_eng := pg_temp.try_create_as(6, 'R1102 con OT H', pg_temp.s(4));
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET work_order_required = true, partner_id = pg_temp.s(8) WHERE engagement_id = v_eng.engagement_id;
  INSERT INTO public.work_orders (engagement_id, currency, season_mode, tax_rate, approval_status)
  VALUES (v_eng.engagement_id, 'BOB', 'High', 0.13, 'Draft') RETURNING wo_id INTO v_wo;
  PERFORM set_config('session_replication_role', 'origin', true);
  IF (SELECT partner_approval_status FROM public.engagements WHERE engagement_id = v_eng.engagement_id) IS NOT NULL THEN
    NULL;  -- columnas escritas como dueño sin triggers: no aplica
  END IF;
  IF pg_temp.rows_as(pg_temp.u(6), format(upd, v_eng.engagement_id)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el creador TH no pudo editar su no-Cliente con OT sin aprobar';
  END IF;
  -- La firma la pone el Socio, aunque sea de OTRA sociedad que el encargo (TH de Jauregui, Socio de Pelaez).
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET society_id = (SELECT society_id FROM public.society WHERE name = 'Ruizmier Jauregui S.R.L.')
   WHERE engagement_id = v_eng.engagement_id;
  UPDATE public.work_orders SET approval_status = 'Pending_Approval' WHERE wo_id = v_wo;
  PERFORM set_config('session_replication_role', 'origin', true);
  v_n := pg_temp.rows_as(pg_temp.u(8), format(
    'UPDATE public.work_orders SET approved_by = %L, approved_at = now(), approval_status = ''Approved'' WHERE wo_id = %L',
    pg_temp.s(8), v_wo));
  IF v_n <> 1 OR (SELECT approval_status FROM public.work_orders WHERE wo_id = v_wo) IS DISTINCT FROM 'Approved' THEN
    RAISE EXCEPTION '1110-220 FAIL — el Socio de otra sociedad no pudo firmar la OT del no-Cliente (filas %)', v_n;
  END IF;
  IF pg_temp.rows_as(pg_temp.u(6), format(upd, v_eng.engagement_id)) <> -1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el creador TH modificó un no-Cliente con la OT ya aprobada';
  END IF;
  -- Cliente no tiene candado: el Gerente normal sigue editando EC aunque tenga OT aprobada.
  PERFORM set_config('session_replication_role', 'replica', true);
  INSERT INTO public.work_orders (engagement_id, currency, season_mode, tax_rate, approval_status, approved_at)
  VALUES ('e1102000-0000-4000-8000-000000000002', 'BOB', 'High', 0.13, 'Approved', now())
  ON CONFLICT DO NOTHING;
  PERFORM set_config('session_replication_role', 'origin', true);
  IF pg_temp.rows_as(pg_temp.u(4), format(upd, 'e1102000-0000-4000-8000-000000000002')) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el candado alcanzó a un encargo de Cliente';
  END IF;

  -- Control de Calidad sin OT (EQ): el Socio lo firma sin engagement.update.
  IF pg_temp.rows_as(pg_temp.u(8), 'SELECT public.decide_engagement_partner_approval(''e1102000-0000-4000-8000-000000000003'', true)') <> -1 THEN
    NULL;  -- EQ se sembró sin triggers: su firma vale NULL, no 'pending'; se pone pendiente para probar la firma.
  END IF;
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET partner_approval_status = 'pending' WHERE engagement_id = 'e1102000-0000-4000-8000-000000000003';
  PERFORM set_config('session_replication_role', 'origin', true);
  IF pg_temp.rows_as(pg_temp.u(8), 'SELECT public.decide_engagement_partner_approval(''e1102000-0000-4000-8000-000000000003'', true)') <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Socio de Control de Calidad no pudo firmar su encargo sin OT';
  END IF;

  -- Estado efectivo (SQL, espejo de engagementStatus.ts).
  IF public.effective_engagement_state(NULL, false, NULL, NULL, NULL, NULL, 0::smallint, 'pending') <> 1
     OR public.effective_engagement_state(NULL, false, NULL, NULL, NULL, NULL, 2::smallint, 'approved') <> 4
     OR public.effective_engagement_state(NULL, false, NULL, NULL, NULL, NULL, 3::smallint, 'rejected') <> 8
     OR public.effective_engagement_state(NULL, false, NULL, NULL, NULL, NULL, 1::smallint, NULL) <> 4
     OR public.effective_engagement_state(NULL, false, NULL, NULL, NULL, NULL) <> 4 THEN
    RAISE EXCEPTION '1110-220 FAIL — effective_engagement_state no refleja la firma del Socio sin OT';
  END IF;
  IF has_function_privilege('anon', 'public.decide_engagement_partner_approval(uuid, boolean, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.resubmit_engagement_partner_approval(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '1110-220 FAIL — anon puede ejecutar las RPC de firma';
  END IF;
  -- El Socio de un no-Cliente de OTRA sociedad lo ve en el portafolio (para abrirlo y aprobarlo).
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET society_id = (SELECT society_id FROM public.society WHERE name = 'Ruizmier Jauregui S.R.L.')
   WHERE engagement_id = v_id;
  PERFORM set_config('session_replication_role', 'origin', true);
  IF pg_temp.count_as(pg_temp.u(8), format('SELECT count(*) FROM (SELECT jsonb_array_elements(public.list_portfolio_engagements()) e) x WHERE x.e ->> ''engagement_id'' = %L', v_id)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Socio no ve en el portafolio el no-Cliente de otra sociedad del que es Socio';
  END IF;

  -- El alta sin OT con Socio ya elegido le avisa al Socio en ese momento (no solo al reenviar).
  PERFORM pg_temp.impersonate(pg_temp.u(6));
  SET LOCAL ROLE authenticated;
  v_eng := public.create_engagement_with_code(
    p_engagement_name := 'R1102 sin OT con socio', p_client_id := 'c1000000-0000-4000-8000-000000000160'::uuid,
    p_partner_id := pg_temp.s(8), p_manager_id := pg_temp.s(4),
    p_start_date := (now() AT TIME ZONE 'America/La_Paz')::date, p_end_date := '2099-12-31'::date, p_status := 'active',
    p_oficina := 1::smallint, p_practica := 1::smallint, p_funcion := 0::smallint, p_anio_fiscal := 2026,
    p_work_order_required := false, p_activity_required := false, p_is_internal := false, p_approval_required := true,
    p_fecha_cierre := '2026-03-31'::date, p_anio_fiscal_override := false,
    p_society_id := (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'));
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'engagement.partner_approval_requested'
                    AND recipient_staff_id = pg_temp.s(8) AND entity_id = v_eng.engagement_id::text) THEN
    RAISE EXCEPTION '1110-220 FAIL — el Socio no recibió el aviso al crear el no-Cliente sin OT (firma %)', v_eng.partner_approval_status;
  END IF;

  -- Creado CON OT y después apagado el switch: pasa a pendiente y el Socio recibe el aviso.
  v_eng := pg_temp.try_create_as(6, 'R1102 OT apagada despues', pg_temp.s(4));
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET work_order_required = true, partner_id = pg_temp.s(8), partner_approval_status = NULL
   WHERE engagement_id = v_eng.engagement_id;
  PERFORM set_config('session_replication_role', 'origin', true);
  v_n := pg_temp.rows_as(pg_temp.u(6), format('UPDATE public.engagements SET work_order_required = false WHERE engagement_id = %L', v_eng.engagement_id));
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'engagement.partner_approval_requested'
                    AND recipient_staff_id = pg_temp.s(8) AND entity_id = v_eng.engagement_id::text) THEN
    RAISE EXCEPTION '1110-220 FAIL — apagar el switch de OT no le pidió la aprobación al Socio (filas %)', v_n;
  END IF;

  -- Avisos gerenciales de un no-Cliente van al TH creador, no al Aprobador de horas.
  IF NOT EXISTS (SELECT 1 FROM public.notif_engagement_managers(v_id) m WHERE m.staff_id = pg_temp.s(6))
     OR EXISTS (SELECT 1 FROM public.notif_engagement_managers(v_id) m WHERE m.staff_id = pg_temp.s(4)) THEN
    RAISE EXCEPTION '1110-220 FAIL — notif_engagement_managers de un no-Cliente debía ser el creador TH y no el Aprobador';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notif_engagement_managers('e1102000-0000-4000-8000-000000000002') m WHERE m.staff_id = pg_temp.s(4)) THEN
    RAISE EXCEPTION '1110-220 FAIL — en Cliente el Gerente sigue recibiendo los avisos gerenciales';
  END IF;
  RAISE NOTICE 'PASS — firma del Socio sin OT (pendiente/rechazo con motivo/reenvío/aprobación), sin horas sin OT, candado tras la firma (con y sin OT), Cliente sin candado';
END $$;

-- ── 11. Review de Codex: cambiar solo la sociedad de un no-Cliente revalida al Aprobador de horas ─────────────────────
-- Sujeto 10: admin (Pelaez). Sujeto 11: manager de Jauregui. ES: no-Cliente de Pelaez con Aprobador M (4), sembrado como
-- dueño. Admin lo pasa a Jauregui (sociedad + cliente interno, como lo exige 0722-160) sin tocar manager_id.
INSERT INTO auth.users (id) VALUES ('a1102000-0000-4000-8000-000000000010'), ('a1102000-0000-4000-8000-000000000011');
INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a1102000-0000-4000-8000-000000000010', 'admin',   'admin'),
  ('a1102000-0000-4000-8000-000000000011', 'manager', 'manager')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active, practica_id, society_id, city) VALUES
  ('51102000-0000-4000-8000-000000000010', 'a1102000-0000-4000-8000-000000000010', 'U10', 'R1102', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'), 'La Paz'),
  ('51102000-0000-4000-8000-000000000011', 'a1102000-0000-4000-8000-000000000011', 'U11', 'R1102', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society WHERE name = 'Ruizmier Jauregui S.R.L.'), 'La Paz');
SET LOCAL session_replication_role = replica;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, funcion, oficina, practica,
                                fecha_cierre, start_date, end_date, work_order_required, approval_required, is_internal,
                                society_id, manager_id, partner_id, created_by_staff_id)
VALUES ('e1102000-0000-4000-8000-000000000011', 'c1000000-0000-4000-8000-000000000160', 'R1102 ES', 'R1102-ES', 0, 1, 1,
        '2027-12-31', '2026-01-05', '2099-06-30', false, true, true,
        (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
        '51102000-0000-4000-8000-000000000004', NULL, '51102000-0000-4000-8000-000000000006');
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_es  uuid := 'e1102000-0000-4000-8000-000000000011';
  v_jau uuid := (SELECT society_id FROM public.society WHERE name = 'Ruizmier Jauregui S.R.L.');
  v_err text;
BEGIN
  -- Solo sociedad (y su cliente interno): el Aprobador de Pelaez ya no vale.
  BEGIN
    PERFORM pg_temp.impersonate(pg_temp.u(10));
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.engagements SET society_id = v_jau, client_id = 'c1000000-0000-4000-8000-000000000161'
     WHERE engagement_id = v_es;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    v_err := SQLERRM;
  END;
  IF v_err IS NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — admin cambió la sociedad de un no-Cliente y quedó el Aprobador de la sociedad vieja';
  END IF;
  IF v_err NOT LIKE '%Aprobador de horas debe ser de la sociedad%' THEN
    RAISE EXCEPTION '1110-220 FAIL — el rechazo del cambio de sociedad salió de otra regla: %', v_err;
  END IF;
  IF (SELECT society_id FROM public.engagements WHERE engagement_id = v_es)
     IS DISTINCT FROM (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.') THEN
    RAISE EXCEPTION '1110-220 FAIL — el cambio de sociedad rechazado igual se guardó';
  END IF;

  -- Sociedad + Aprobador de la sociedad nueva: pasa.
  IF pg_temp.rows_as(pg_temp.u(10), format(
       'UPDATE public.engagements SET society_id = %L, client_id = %L, manager_id = %L WHERE engagement_id = %L',
       v_jau, 'c1000000-0000-4000-8000-000000000161', pg_temp.s(11), v_es)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — admin no pudo cambiar la sociedad junto con un Aprobador de la sociedad nueva';
  END IF;

  -- Cliente: la sociedad no restringe al Gerente, cambiarla no revalida. EC lleva como Gerente a alguien que hoy no
  -- sería elegible (Contabilidad), sembrado como dueño: el cambio de sociedad igual pasa.
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.engagements SET manager_id = pg_temp.s(1) WHERE engagement_id = 'e1102000-0000-4000-8000-000000000002';
  PERFORM set_config('session_replication_role', 'origin', true);
  IF pg_temp.rows_as(pg_temp.u(10), format('UPDATE public.engagements SET society_id = %L WHERE engagement_id = %L',
       v_jau, 'e1102000-0000-4000-8000-000000000002')) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — cambiar la sociedad de un encargo de Cliente quedó atado al Gerente';
  END IF;
  RAISE NOTICE 'PASS — cambiar la sociedad de un no-Cliente revalida al Aprobador de horas; en Cliente no';
END $$;

DO $$ BEGIN RAISE NOTICE '1110-220 ROLES: ALL CHECKS PASSED (rolled back)'; END $$;

ROLLBACK;

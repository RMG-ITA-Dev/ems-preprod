-- 1110-220 — Solo Talento Humano y Sistemas crean lo administrativo (bugs/1110-220/plan_v3.md, decisiones N1-N7).
--   · Encargos no-Cliente (funcion 0/2/3) y sus OTs: solo admin, hr_manager y hr_analyst los crean.
--   · hr_manager queda como Gerente de lo que crea; hr_analyst elige al Gerente y crea las OTs como creador.
--   · Contabilidad (accounting_manager), Riesgos (risk_supervisor) y Secretaría (secretariat_head): candidatos a Gerente,
--     aprueban horas y miran. No crean ni editan.
--   · Un Gerente que no es TH (normal, ITA/Tax o los tres de arriba) en un no-Cliente: solo aprueba y mira.
--   · Secretaría ve solo lo que gerencia.
--   · Lo que crea Talento Humano siempre exige OT (work_order_required = true).
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
    IF SQLERRM NOT LIKE '%solo Talento Humano y Sistemas%' AND SQLERRM NOT LIKE '%debe ser Gerente de Talento Humano%' THEN
      RAISE EXCEPTION '1110-220 FAIL — el rechazo del Gerente normal salió de otra regla: %', SQLERRM;
    END IF;
  END;

  -- hr_manager: queda como Gerente aunque el payload traiga a otro, y exige OT.
  v_eng := pg_temp.try_create_as(6, 'R1102 alta H', pg_temp.s(4));
  IF v_eng.engagement_id IS NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_manager debía poder crear un encargo administrativo';
  END IF;
  IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(6) OR v_eng.work_order_required IS NOT TRUE OR v_eng.approval_required IS NOT TRUE THEN
    RAISE EXCEPTION '1110-220 FAIL — alta de hr_manager: Gerente % (esperado él), OT obligatoria %, aprobación %',
      v_eng.manager_id, v_eng.work_order_required, v_eng.approval_required;
  END IF;

  -- hr_analyst: elige a Contabilidad como Gerente; él queda como creador, y exige OT.
  v_eng := pg_temp.try_create_as(7, 'R1102 alta Y', pg_temp.s(1));
  IF v_eng.engagement_id IS NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst debía poder crear un encargo administrativo';
  END IF;
  IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(1) OR v_eng.created_by_staff_id IS DISTINCT FROM pg_temp.s(7)
     OR v_eng.work_order_required IS NOT TRUE OR v_eng.funcion <> 0 OR v_eng.is_internal IS NOT TRUE THEN
    RAISE EXCEPTION '1110-220 FAIL — alta de hr_analyst: Gerente %, creador %, OT obligatoria %, funcion %, interno %',
      v_eng.manager_id, v_eng.created_by_staff_id, v_eng.work_order_required, v_eng.funcion, v_eng.is_internal;
  END IF;

  -- N12: un Gerente normal no puede ser Gerente de un administrativo.
  PERFORM pg_temp.impersonate(pg_temp.u(7));
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM pg_temp.create_eng('R1102 Y con gerente normal', pg_temp.s(4));
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst puso a un Gerente normal en un administrativo';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    IF SQLERRM NOT LIKE '%debe ser Gerente de Talento Humano, Contabilidad, Riesgos o Secretaria%' THEN
      RAISE EXCEPTION '1110-220 FAIL — el rechazo del Gerente normal salió de otra regla: %', SQLERRM;
    END IF;
  END;

  -- Talento Humano no crea Cliente (hr_analyst desde 0817-180; hr_manager desde plan_v3, N9).
  IF (pg_temp.try_create_as(7, 'R1102 cliente Y', pg_temp.s(4), 1::smallint)).engagement_id IS NOT NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst creó un encargo de Cliente';
  END IF;
  IF (pg_temp.try_create_as(6, 'R1102 cliente H', pg_temp.s(6), 1::smallint)).engagement_id IS NOT NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_manager creó un encargo de Cliente';
  END IF;
  RAISE NOTICE 'PASS — alta: solo Talento Humano crea no-Cliente; hr_manager queda Gerente, hr_analyst elige; OT obligatoria';
END $$;

-- ── 3. Candidatos a Gerente (los ve quien crea: hr_analyst) ──────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(7));
  SET LOCAL ROLE authenticated;
  -- N12: Gerente de un no-Cliente = grupo propio (TH, Contabilidad, Riesgos, Secretaría); el normal queda en manager.
  IF (SELECT count(*) FROM public.get_engagement_team_candidates() c
       WHERE c.candidate_group = 'manager_administrative' AND c.staff_id IN (pg_temp.s(1), pg_temp.s(2), pg_temp.s(3), pg_temp.s(6))) <> 4 THEN
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — Gerente de TH, Contabilidad, Riesgos y Secretaría debían salir en manager_administrative';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_engagement_team_candidates() c
              WHERE c.candidate_group = 'manager' AND c.staff_id IN (pg_temp.s(1), pg_temp.s(2), pg_temp.s(3), pg_temp.s(6)))
     OR NOT EXISTS (SELECT 1 FROM public.get_engagement_team_candidates() c
                     WHERE c.candidate_group = 'manager' AND c.staff_id = pg_temp.s(4))
     OR EXISTS (SELECT 1 FROM public.get_engagement_team_candidates() c
                 WHERE c.candidate_group = 'manager_administrative' AND c.staff_id = pg_temp.s(4)) THEN
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — el grupo manager debía tener al Gerente normal y no a los cuatro administrativos';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_engagement_team_candidates() c WHERE c.staff_id = pg_temp.s(7)) THEN
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst no es candidato a Gerente';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — candidatos: administrativos = TH/Contabilidad/Riesgos/Secretaría; Cliente = gerentes; el Analista no es candidato';
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
  -- Analista de TH, creador de alta Y: crea.
  IF pg_temp.rows_as(pg_temp.u(7), format(ins, v_ey)) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — hr_analyst debía crear la OT del encargo que creó';
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
  RAISE NOTICE 'PASS — edición no-Cliente: cada uno de TH edita lo suyo y ve lo demás; Gerente normal, Contabilidad y Secretaría no';
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

DO $$ BEGIN RAISE NOTICE '1110-220 ROLES: ALL CHECKS PASSED (rolled back)'; END $$;

ROLLBACK;

-- 1110-220 — Gerente de Contabilidad y Supervisor de Riesgos crean encargos administrativos, son Gerentes y aprueban
-- horas; rol nuevo Jefe de Secretaría (secretariat_head) = Talento Humano sin competencias, feriados ni capacitación,
-- sin encargos de Cliente (bugs/1110-220/plan_v2.md, decisiones D1-D12).
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, al final (estado definitivo: B5/D1 aplicados). Transacción única,
-- SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo y "1110-220 ROLES: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba ES la base real: alta por create_engagement_with_code como `authenticated` con el claim JWT del
-- usuario (triggers de perfil, autoasignación y reglas administrativas encendidos), RLS de engagements y las funciones
-- de aprobación. Los encargos "ajenos" se siembran como dueño con los triggers de réplica apagados.
--
-- Fixture (prefijo 1102): A accounting_manager · R risk_supervisor · S secretariat_head · M manager (control/ajeno) ·
-- X assistant (carga horas). Todos con ficha Ruizmier Pelaez S.R.L. / práctica code 1 / La Paz (oficina 1).
--   EM administrativo (funcion 0) de M, creado por M · EC encargo de Cliente (funcion 1) de M, creado por M.
-- Cliente interno de Pelaez: el que siembra run-rls-tests.sh (c1000000-...-160, NIT 1006979026).

BEGIN;

INSERT INTO auth.users (id) VALUES
  ('a1102000-0000-4000-8000-000000000001'), ('a1102000-0000-4000-8000-000000000002'),
  ('a1102000-0000-4000-8000-000000000003'), ('a1102000-0000-4000-8000-000000000004'),
  ('a1102000-0000-4000-8000-000000000005');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a1102000-0000-4000-8000-000000000001', 'manager', 'accounting_manager'),
  ('a1102000-0000-4000-8000-000000000002', 'manager', 'risk_supervisor'),
  ('a1102000-0000-4000-8000-000000000003', 'manager', 'secretariat_head'),
  ('a1102000-0000-4000-8000-000000000004', 'manager', 'manager'),
  ('a1102000-0000-4000-8000-000000000005', 'staff',   'assistant')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active, practica_id, society_id, city)
SELECT ('51102000-0000-4000-8000-00000000000' || n)::uuid, ('a1102000-0000-4000-8000-00000000000' || n)::uuid,
       'U' || n, 'R1102', true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
       'La Paz'
FROM (VALUES ('1'), ('2'), ('3'), ('4'), ('5')) AS v(n);

INSERT INTO public.clients (client_id, client_legal_name, tax_id, is_active) VALUES
  ('c1102000-0000-4000-8000-000000000001', 'R1102 Cliente externo', 'R1102-TAX-001', true);

INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id)
VALUES ('R1102-ACT', 'Harness Activity 1110-220', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;

SET LOCAL session_replication_role = replica;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, funcion, oficina, practica,
                                fecha_cierre, start_date, end_date, work_order_required, approval_required, is_internal,
                                society_id, manager_id, created_by_staff_id)
VALUES
  ('e1102000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000160', 'R1102 EM', 'R1102-EM', 0, 1, 1,
   '2027-12-31', '2026-01-05', '2099-06-30', false, true, true,
   (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
   '51102000-0000-4000-8000-000000000004', '51102000-0000-4000-8000-000000000004'),
  ('e1102000-0000-4000-8000-000000000002', 'c1102000-0000-4000-8000-000000000001', 'R1102 EC', 'R1102-EC', 1, 1, 1,
   '2027-12-31', '2026-01-05', '2099-06-30', true, true, false,
   (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
   '51102000-0000-4000-8000-000000000004', '51102000-0000-4000-8000-000000000004');
SET LOCAL session_replication_role = origin;

CREATE FUNCTION pg_temp.u(n integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'a1102000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;

CREATE FUNCTION pg_temp.s(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT ('51102000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

-- Alta administrativa por el RPC real, mandando a M como Gerente: la autoasignación debe reescribirlo.
CREATE FUNCTION pg_temp.create_admin_eng(p_name text) RETURNS public.engagements
LANGUAGE sql AS $$
  SELECT public.create_engagement_with_code(
    p_engagement_name      := p_name,
    p_client_id            := 'c1000000-0000-4000-8000-000000000160'::uuid,
    p_partner_id           := NULL,
    p_manager_id           := '51102000-0000-4000-8000-000000000004'::uuid,
    p_start_date           := (now() AT TIME ZONE 'America/La_Paz')::date,
    p_end_date             := '2099-12-31'::date,
    p_status               := 'active',
    p_oficina              := 1::smallint,
    p_practica             := 1::smallint,
    p_funcion              := 0::smallint,
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

-- Filas que alcanza un UPDATE como el usuario (la RLS no da error: oculta las filas). -1 si falló.
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

  -- Secretaría = exactamente hr_manager menos competency.*, holiday.* y la aprobación de capacitación (D3).
  SELECT string_agg(x, ', ') INTO v_diff FROM (
    (SELECT 'falta ' || permission_key || ':' || scope_key AS x FROM public.authorization_role_permissions
      WHERE role_key = 'hr_manager'
        AND permission_key NOT LIKE 'competency.%' AND permission_key NOT LIKE 'holiday.%'
        AND permission_key <> 'timesheet_admin_training_approval.manage'
     EXCEPT
     SELECT 'falta ' || permission_key || ':' || scope_key FROM public.authorization_role_permissions
      WHERE role_key = 'secretariat_head')
    UNION ALL
    (SELECT 'sobra ' || permission_key || ':' || scope_key FROM public.authorization_role_permissions
      WHERE role_key = 'secretariat_head'
     EXCEPT
     SELECT 'sobra ' || permission_key || ':' || scope_key FROM public.authorization_role_permissions
      WHERE role_key = 'hr_manager'
        AND permission_key NOT LIKE 'competency.%' AND permission_key NOT LIKE 'holiday.%'
        AND permission_key <> 'timesheet_admin_training_approval.manage')
  ) d;
  IF v_diff IS NOT NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — secretariat_head no es hr_manager menos competencias/feriados/capacitación: %', v_diff;
  END IF;
  IF (SELECT count(*) FROM public.authorization_role_permissions WHERE role_key = 'secretariat_head') <> 24 THEN
    RAISE EXCEPTION '1110-220 FAIL — secretariat_head debía tener 24 permisos';
  END IF;
  RAISE NOTICE 'PASS — secretariat_head: 24 permisos = hr_manager sin competencias, feriados ni capacitación';

  -- Contabilidad y Riesgos: delta exacto y alcances amplios intactos (el DO UPDATE no los degradó).
  SELECT string_agg(role_key || ':' || permission_key || ' esperado ' || esperado || ' tiene ' || coalesce(tiene, 'NADA'), ', ')
    INTO v_diff
    FROM (
      SELECT e.role_key, e.permission_key, e.esperado, rp.scope_key AS tiene
        FROM (VALUES
          ('accounting_manager', 'engagement.read',                'department'),
          ('accounting_manager', 'work_order.read',                'department'),
          ('accounting_manager', 'work_order.payment_plan.approve','department'),
          ('accounting_manager', 'engagement.create',              'assigned_engagements'),
          ('accounting_manager', 'engagement.update',              'assigned_engagements'),
          ('accounting_manager', 'work_order.create',              'assigned_engagements'),
          ('accounting_manager', 'work_order.update',              'assigned_engagements'),
          ('accounting_manager', 'worksheet.read',                 'assigned_engagements'),
          ('accounting_manager', 'worksheet.create',               'assigned_engagements'),
          ('accounting_manager', 'timesheet_approval.read',        'assigned_engagements'),
          ('accounting_manager', 'timesheet_approval.approve',     'assigned_engagements'),
          ('accounting_manager', 'timesheet_approval.reject',      'assigned_engagements'),
          ('risk_supervisor',    'engagement.read',                'department'),
          ('risk_supervisor',    'work_order.risk.read',           'department'),
          ('risk_supervisor',    'work_order.risk.approve',        'department'),
          ('risk_supervisor',    'engagement.create',              'assigned_engagements'),
          ('risk_supervisor',    'engagement.update',              'assigned_engagements'),
          ('risk_supervisor',    'work_order.read',                'assigned_engagements'),
          ('risk_supervisor',    'work_order.create',              'assigned_engagements'),
          ('risk_supervisor',    'work_order.update',              'assigned_engagements'),
          ('risk_supervisor',    'worksheet.read',                 'assigned_engagements'),
          ('risk_supervisor',    'worksheet.create',               'assigned_engagements'),
          ('risk_supervisor',    'timesheet_approval.read',        'assigned_engagements'),
          ('risk_supervisor',    'timesheet_approval.approve',     'assigned_engagements'),
          ('risk_supervisor',    'timesheet_approval.reject',      'assigned_engagements')
        ) AS e(role_key, permission_key, esperado)
        LEFT JOIN public.authorization_role_permissions rp
          ON rp.role_key = e.role_key AND rp.permission_key = e.permission_key
    ) x
   WHERE tiene IS DISTINCT FROM esperado;
  IF v_diff IS NOT NULL THEN
    RAISE EXCEPTION '1110-220 FAIL — alcances inesperados: %', v_diff;
  END IF;
  IF EXISTS (SELECT 1 FROM public.authorization_role_permissions
              WHERE role_key IN ('accounting_manager', 'risk_supervisor', 'secretariat_head')
                AND permission_key IN ('work_order.submit', 'engagement.delete')) THEN
    RAISE EXCEPTION '1110-220 FAIL — ninguno de los tres roles firma OT ni borra encargos';
  END IF;
  IF EXISTS (SELECT 1 FROM public.authorization_role_permissions
              WHERE role_key = 'risk_supervisor' AND permission_key = 'work_order.payment_plan.approve') THEN
    RAISE EXCEPTION '1110-220 FAIL — risk_supervisor no aprueba planes de pago (las OT administrativas no facturan)';
  END IF;
  RAISE NOTICE 'PASS — Contabilidad y Riesgos: delta exacto, alcances department intactos, sin firma de OT ni borrado';
END $$;

-- ── 2. Alta administrativa por el RPC real: autoasignación como Gerente ─────────────────────────────────────────────
DO $$
DECLARE
  v_n   integer;
  v_eng public.engagements;
BEGIN
  FOREACH v_n IN ARRAY ARRAY[1, 2, 3] LOOP
    PERFORM pg_temp.impersonate(pg_temp.u(v_n));
    SET LOCAL ROLE authenticated;
    v_eng := pg_temp.create_admin_eng('R1102 alta ' || v_n);
    RESET ROLE;
    IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(v_n) THEN
      RAISE EXCEPTION '1110-220 FAIL — el sujeto % debía quedar como Gerente de su encargo (manager_id %)', v_n, v_eng.manager_id;
    END IF;
    IF v_eng.created_by_staff_id IS DISTINCT FROM pg_temp.s(v_n) OR v_eng.funcion <> 0 OR v_eng.is_internal IS NOT TRUE THEN
      RAISE EXCEPTION '1110-220 FAIL — alta del sujeto % mal registrada (creador %, funcion %, interno %)',
        v_n, v_eng.created_by_staff_id, v_eng.funcion, v_eng.is_internal;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — alta administrativa: los tres roles crean por el RPC y quedan como Gerente aunque el payload traiga a otro';
END $$;

-- ── 3. Candidatos a Gerente ──────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.get_engagement_team_candidates() c
       WHERE c.candidate_group = 'manager' AND c.staff_id IN (pg_temp.s(1), pg_temp.s(2), pg_temp.s(3))) <> 3 THEN
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager, risk_supervisor y secretariat_head debían salir en el grupo manager';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_engagement_team_candidates() c
              WHERE c.staff_id IN (pg_temp.s(1), pg_temp.s(2), pg_temp.s(3)) AND c.candidate_group <> 'manager') THEN
    RESET ROLE;
    RAISE EXCEPTION '1110-220 FAIL — los tres roles solo caen en el grupo manager';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — candidatos: los tres roles salen solo en el grupo manager';
END $$;

-- ── 4. Aprobación de horas: por asignación, no por rol ───────────────────────────────────────────────────────────────
-- X carga horas en el encargo que creó A y en EM (de M) la misma semana: una boleta mixta. Como dueño y con los triggers
-- de réplica apagados: el rango de fechas del encargo y el estado de la OT no son lo que se prueba aquí.
SET LOCAL session_replication_role = replica;
INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, is_forecast)
SELECT pg_temp.s(5), e.engagement_id, (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'R1102-ACT'),
       '2026-03-03', 2, false
  FROM public.engagements e
 WHERE e.engagement_name IN ('R1102 alta 1', 'R1102 EM');
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_ea uuid := (SELECT engagement_id FROM public.engagements WHERE engagement_name = 'R1102 alta 1');
  v_em uuid := 'e1102000-0000-4000-8000-000000000001';
  v_p  uuid := gen_random_uuid();
BEGIN
  IF NOT public.can_approve_timesheet_line(pg_temp.u(1)::uuid, v_p, v_ea) THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager debía poder aprobar las líneas del encargo que gerencia';
  END IF;
  IF public.can_approve_timesheet_line(pg_temp.u(1)::uuid, v_p, v_em) THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager aprobó una línea de un encargo que no gerencia (boleta mixta)';
  END IF;
  IF public.can_approve_timesheet_line(pg_temp.u(2)::uuid, v_p, v_ea) THEN
    RAISE EXCEPTION '1110-220 FAIL — risk_supervisor aprobó una línea de un encargo ajeno';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_timesheet_approvers(pg_temp.s(5), '2026-03-02') a
                  WHERE a.approver_staff_id = pg_temp.s(1)) THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager no aparece como aprobador de la semana';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_timesheet_approvers(pg_temp.s(5), '2026-03-02') a
              WHERE a.approver_staff_id IN (pg_temp.s(2), pg_temp.s(3))) THEN
    RAISE EXCEPTION '1110-220 FAIL — risk_supervisor/secretariat_head aparecen como aprobadores sin gerenciar los encargos';
  END IF;
  RAISE NOTICE 'PASS — aprobación: el Gerente aprueba su encargo y no el ajeno de la misma boleta; aprobadores por asignación';
END $$;

-- ── 5. Edición: creador / Gerente asignado; nadie edita un administrativo ajeno (Secretaría tampoco) ─────────────────
DO $$
DECLARE
  upd_own constant text := 'UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_name = ''R1102 alta %s''';
  upd_em  constant text := 'UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_id = ''e1102000-0000-4000-8000-000000000001''';
  upd_ec  constant text := 'UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_id = ''e1102000-0000-4000-8000-000000000002''';
  v_n integer;
BEGIN
  FOREACH v_n IN ARRAY ARRAY[1, 2, 3] LOOP
    IF pg_temp.rows_as(pg_temp.u(v_n), format(upd_own, v_n)) <> 1 THEN
      RAISE EXCEPTION '1110-220 FAIL — el sujeto % debía poder editar el encargo que creó', v_n;
    END IF;
    IF pg_temp.rows_as(pg_temp.u(v_n), upd_ec) <> 0 THEN
      RAISE EXCEPTION '1110-220 FAIL — el sujeto % editó un encargo de Cliente ajeno', v_n;
    END IF;
  END LOOP;
  -- Contabilidad y Riesgos LEEN EM (department) y Secretaría lo ve (hr administrative read), pero ninguno lo edita:
  -- no son creador ni Gerente. Secretaría NO hereda "hr administrative update" de Talento Humano.
  FOREACH v_n IN ARRAY ARRAY[1, 2, 3] LOOP
    IF pg_temp.rows_as(pg_temp.u(v_n), upd_em) <> 0 THEN
      RAISE EXCEPTION '1110-220 FAIL — el sujeto % editó un administrativo ajeno', v_n;
    END IF;
  END LOOP;
  -- Gerente asignado (no creador): A pasa a Gerente de EC y ahora sí lo edita.
  UPDATE public.engagements SET manager_id = pg_temp.s(1) WHERE engagement_id = 'e1102000-0000-4000-8000-000000000002';
  IF pg_temp.rows_as(pg_temp.u(1), upd_ec) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — el Gerente asignado (accounting_manager) debía poder editar el encargo';
  END IF;
  UPDATE public.engagements SET manager_id = pg_temp.s(4) WHERE engagement_id = 'e1102000-0000-4000-8000-000000000002';
  RAISE NOTICE 'PASS — edición: creador y Gerente asignado editan; nadie un administrativo ni un Cliente ajeno';
END $$;

-- ── 6. Lectura de Secretaría: administrativos de la firma sí, Cliente ajeno no ───────────────────────────────────────
DO $$
DECLARE
  rd  constant text := 'SELECT count(*) FROM public.engagements WHERE engagement_id IN (''e1102000-0000-4000-8000-000000000001'', ''e1102000-0000-4000-8000-000000000002'')';
  por constant text := 'SELECT count(*) FROM (SELECT jsonb_array_elements(public.list_portfolio_engagements()) e) x WHERE x.e ->> ''engagement_name'' IN (''R1102 EM'', ''R1102 EC'')';
  vis constant text := 'SELECT count(*) FROM public.my_visible_engagement_ids() id WHERE id IN (''e1102000-0000-4000-8000-000000000001'', ''e1102000-0000-4000-8000-000000000002'')';
BEGIN
  IF pg_temp.count_as(pg_temp.u(3), rd) <> 1 OR pg_temp.count_as(pg_temp.u(3), por) <> 1 OR pg_temp.count_as(pg_temp.u(3), vis) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — secretariat_head debía ver solo EM (RLS %, portafolio %, conjunto %)',
      pg_temp.count_as(pg_temp.u(3), rd), pg_temp.count_as(pg_temp.u(3), por), pg_temp.count_as(pg_temp.u(3), vis);
  END IF;
  RAISE NOTICE 'PASS — Secretaría ve los administrativos ajenos (RLS, portafolio y conjunto) y no los de Cliente';

  -- Contabilidad: la ficha (portafolio) abre el administrativo ajeno de su sociedad que ya lee por RLS; el de Cliente no.
  IF pg_temp.count_as(pg_temp.u(1), por) <> 1 THEN
    RAISE EXCEPTION '1110-220 FAIL — accounting_manager debía ver EM en el portafolio y no EC (ve %)', pg_temp.count_as(pg_temp.u(1), por);
  END IF;
  -- Otra sociedad: no lo ve (espejo de la política restrictiva "society scope"). Triggers apagados: solo se mueve
  -- la sociedad del fixture.
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

-- ── 7. Avisos (D9) ───────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_got text;
BEGIN
  -- Alcance 'assigned' = avisos de Gerente: 22 del set (accounting_manager 20: sin los 2 de fondos que ya tiene con
  -- department) + approval.reminder.weekly + approval.reversal_executed. Ninguno de los tres tenía avisos 'assigned' antes.
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

-- Carril B / B3p — permisos de lectura de cobranza y contabilidad
-- (20261012140000_rls_carril_b3p_permisos_cobranza_contabilidad.sql)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de aplicar la migración de B3p.
-- Transacción única, SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo, terminando
-- en "B3p PERMISOS: ALL CHECKS PASSED (rolled back)".
--
-- Qué se prueba: (1) las siete filas de la matriz con su alcance; (2) que esos tres roles NO ganaron
-- ningún permiso de escritura ni client.read de más; (3) el efecto real de la política
-- `work_orders firm read` con `SET LOCAL ROLE authenticated` de verdad, con su contraparte de
-- no-vacuidad (al quitar work_order.read el rol deja de ver la OT y al devolverlo vuelve a verla).
-- engagements y clients todavía no tienen RLS en esta etapa (B3c), así que de ellos solo se prueba
-- la fila de la matriz.
--
-- Fixture world (ids con prefijo b3b):
--   U1 collections_analyst  U2 accounting_manager  U3 accounting_analyst  — los tres roles del delta
--   U4 assistant            — control: sin work_order.read, no es del equipo del encargo
--   U5 manager              — gerente del encargo E1 (para tener un encargo válido)
--   E1 encargo de U5 con una OT en borrador

BEGIN;

-- ── Fixtures (como owner) ─────────────────────────────────────────────────────────────────────

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c1b3b000-0000-4000-8000-000000000001', 'B3p Test Client', 'B3P-TAX-001');

INSERT INTO auth.users (id) VALUES
  ('a0b3b000-0000-4000-8000-000000000001'),
  ('a0b3b000-0000-4000-8000-000000000002'),
  ('a0b3b000-0000-4000-8000-000000000003'),
  ('a0b3b000-0000-4000-8000-000000000004'),
  ('a0b3b000-0000-4000-8000-000000000005');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b3b000-0000-4000-8000-000000000001', 'staff',   'collections_analyst'),
  ('a0b3b000-0000-4000-8000-000000000002', 'staff',   'accounting_manager'),
  ('a0b3b000-0000-4000-8000-000000000003', 'staff',   'accounting_analyst'),
  ('a0b3b000-0000-4000-8000-000000000004', 'staff',   'assistant'),
  ('a0b3b000-0000-4000-8000-000000000005', 'manager', 'manager');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
VALUES ('50b3b000-0000-4000-8000-000000000005', 'a0b3b000-0000-4000-8000-000000000005', 'Manager', 'B3p',
        (SELECT practica_id FROM public.practicas WHERE code = 1),
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, practica, fecha_cierre,
                                work_order_required, approval_required, society_id)
VALUES ('e0b3b000-0000-4000-8000-000000000001', 'c1b3b000-0000-4000-8000-000000000001', 'B3p E1',
        '50b3b000-0000-4000-8000-000000000005', 1, '2027-12-31', false, true,
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status)
VALUES ('40b3b000-0000-4000-8000-000000000001', 'e0b3b000-0000-4000-8000-000000000001', 'BOB', 'High', 'Draft');

-- ── Helper (temp) ─────────────────────────────────────────────────────────────────────────────

-- Filas de work_orders que ve `p_sub` con el rol authenticated real.
CREATE FUNCTION pg_temp.wo_seen(p_sub text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.work_orders;
  EXECUTE 'RESET ROLE';
  RETURN n;
END $$;

DO $$
DECLARE
  u1 constant text := 'a0b3b000-0000-4000-8000-000000000001';
  u2 constant text := 'a0b3b000-0000-4000-8000-000000000002';
  u3 constant text := 'a0b3b000-0000-4000-8000-000000000003';
  u4 constant text := 'a0b3b000-0000-4000-8000-000000000004';
  v_n   bigint;
  v_bad text;
BEGIN
  -- 1. Las siete filas de la matriz, todas con alcance department ────────────────────────────────
  SELECT count(*) INTO v_n FROM public.authorization_role_permissions
   WHERE scope_key = 'department' AND (role_key, permission_key) IN (
     ('collections_analyst', 'work_order.read'), ('collections_analyst', 'engagement.read'),
     ('collections_analyst', 'client.read'),
     ('accounting_manager',  'work_order.read'), ('accounting_manager',  'engagement.read'),
     ('accounting_analyst',  'work_order.read'), ('accounting_analyst',  'engagement.read'));
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'B3p PERMISOS FAIL — se esperaban 7 filas de lectura con alcance department y hay %', v_n;
  END IF;
  RAISE NOTICE 'PASS — las 7 filas de lectura (alcance department) existen';

  -- 2. Sin permisos de más: contabilidad no recibe client.read; nadie gana escritura ───────────────
  IF EXISTS (SELECT 1 FROM public.authorization_role_permissions
              WHERE role_key IN ('accounting_manager', 'accounting_analyst') AND permission_key = 'client.read') THEN
    RAISE EXCEPTION 'B3p PERMISOS FAIL — contabilidad no debe tener client.read (solo nombre, vía directorio de B4)';
  END IF;
  SELECT string_agg(role_key || ':' || permission_key, ', ') INTO v_bad
    FROM public.authorization_role_permissions
   WHERE role_key IN ('collections_analyst', 'accounting_manager', 'accounting_analyst')
     AND permission_key IN ('work_order.create', 'work_order.update', 'work_order.submit',
                            'engagement.create', 'engagement.update',
                            'client.create', 'client.update', 'client.delete');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'B3p PERMISOS FAIL — estos roles no debían ganar escritura: %', v_bad;
  END IF;
  RAISE NOTICE 'PASS — contabilidad sin client.read; los tres roles sin permisos de crear, editar ni enviar';

  -- 3. Efecto real de la política work_orders firm read ───────────────────────────────────────────
  IF pg_temp.wo_seen(u1) <> 1 OR pg_temp.wo_seen(u2) <> 1 OR pg_temp.wo_seen(u3) <> 1 THEN
    RAISE EXCEPTION 'B3p PERMISOS FAIL — cobranza y contabilidad debían ver la OT (cobranza %, contab. gerente %, contab. analista %)',
      pg_temp.wo_seen(u1), pg_temp.wo_seen(u2), pg_temp.wo_seen(u3);
  END IF;
  -- Control: el asistente (sin work_order.read, fuera del equipo) no la ve.
  IF pg_temp.wo_seen(u4) <> 0 THEN
    RAISE EXCEPTION 'B3p PERMISOS FAIL — el asistente sin work_order.read no debía ver la OT';
  END IF;
  RAISE NOTICE 'PASS — cobranza y los dos roles de contabilidad ven la OT; el asistente de control, no';

  -- 4. No-vacuidad: la visibilidad sale del permiso ─────────────────────────────────────────────
  DELETE FROM public.authorization_role_permissions
   WHERE role_key = 'collections_analyst' AND permission_key = 'work_order.read';
  IF pg_temp.wo_seen(u1) <> 0 THEN
    RAISE EXCEPTION 'B3p PERMISOS FAIL — sin work_order.read cobranza debía dejar de ver la OT';
  END IF;
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('collections_analyst', 'work_order.read', 'department')
  ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
  IF pg_temp.wo_seen(u1) <> 1 THEN
    RAISE EXCEPTION 'B3p PERMISOS FAIL — al devolver work_order.read cobranza debía volver a ver la OT';
  END IF;
  RAISE NOTICE 'PASS — la visibilidad de cobranza depende de work_order.read (se retira y se devuelve)';

  RAISE NOTICE 'B3p PERMISOS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;

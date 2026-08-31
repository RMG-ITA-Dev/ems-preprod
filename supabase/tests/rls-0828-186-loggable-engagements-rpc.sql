-- Transactional tests for public.list_loggable_engagements() — BUG 0828-186
-- (bugs/0828-186/plan_v2.md).
--
-- Cubre el núcleo del fix: el RPC de selectores de carga de horas (Hoja de Tiempo, Tracker,
-- Carga Manual) debe listar los encargos elegibles SIN filtrar por asignación -- decisión
-- del operador (2026-08-30). El caller de todos los checks (a)-(d) NO es partner/manager/
-- sqr/encargado de ningún encargo del fixture, ni tiene fila en engagement_assignments: si
-- apareciera algún encargo, es porque el RPC no filtra por asignación (correcto). El check
-- (e) prueba el gate por permiso: sin time_entry.create, la lista es vacía aunque existan
-- encargos elegibles.
--
-- DÓNDE CORRE: supabase/tests/local/run-rls-tests.sh, después de aplicar el set consolidado
-- + la migración 20260831013000_0828-186_list_loggable_engagements_rpc.sql sobre la base
-- scratch.
--
-- A MANO: se puede pegar tal cual en el SQL Editor de un proyecto Supabase con el esquema al
-- día (transacción que SIEMPRE termina en ROLLBACK). Misma convención que
-- rpc-engagement-team-candidates.sql: un NOTICE por chequeo que pasa, y al final
-- "LOGGABLE ENGAGEMENTS RPC: ALL CHECKS PASSED (rolled back)".
--
-- Fixture: ids con el prefijo reconocible 0828186.

BEGIN;

-- Guard: igual que rpc-engagement-team-candidates.sql -- practica/sociedad deben existir
-- (staff.practica_id/society_id son NOT NULL reales). El harness los siembra una vez antes de
-- correr las suites; en un ambiente real ya existen.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.society) THEN
    RAISE EXCEPTION 'FIXTURE: no hay filas en public.society y staff.society_id es NOT NULL.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.practicas WHERE code = 1) THEN
    RAISE EXCEPTION 'FIXTURE: falta el servicio code = 1 y staff.practica_id es NOT NULL.';
  END IF;
END $$;

-- ── Fixture: dos callers -- uno con time_entry.create (rol senior), otro sin (hr_analyst) ──
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    VALUES
      ('a0828186-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'le-0828186-senior@ruizmier.com', 'x',
       now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
      ('a0828186-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'le-0828186-hranalyst@ruizmier.com', 'x',
       now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id)
VALUES
  ('50828186-0000-4000-8000-000000000001', 'a0828186-0000-4000-8000-000000000001',
   'LE', 'Senior0828186', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('50828186-0000-4000-8000-000000000002', 'a0828186-0000-4000-8000-000000000002',
   'LE', 'HrAnalyst0828186', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1))
ON CONFLICT (staff_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('a0828186-0000-4000-8000-000000000001', 'senior'),      -- tiene time_entry.create
  ('a0828186-0000-4000-8000-000000000002', 'hr_analyst')   -- NO tiene time_entry.create
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('60828186-0000-4000-8000-000000000001', 'Cliente 0828-186', 'NIT-0828186')
ON CONFLICT (client_id) DO NOTHING;

-- Encargos del fixture. Ninguno tiene partner_id/manager_id/sqr_id/encargado_id -- el caller
-- 'senior' NUNCA está asignado a ninguno, así que cualquier resultado prueba que el RPC no
-- filtra por asignación.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                 status, work_order_required, engagement_state_override,
                                 fecha_cierre) VALUES
  -- (a) OT Aprobada, sin override -- debe aparecer aunque el caller no esté asignado.
  ('70828186-0000-4000-8000-000000000001', '60828186-0000-4000-8000-000000000001',
   'OT Aprobada 0828186', 'LE-01', 'active', true, NULL, '2026-12-31'),
  -- (b1) Administrativo (sin OT requerida) -- debe aparecer.
  ('70828186-0000-4000-8000-000000000002', '60828186-0000-4000-8000-000000000001',
   'Administrativo 0828186', 'LE-02', 'active', false, NULL, '2026-12-31'),
  -- (b2) Override manual Aprobado (4), OT no aprobada -- debe aparecer.
  ('70828186-0000-4000-8000-000000000003', '60828186-0000-4000-8000-000000000001',
   'Override Aprobado 0828186', 'LE-03', 'active', true, 4, '2026-12-31'),
  -- (c) OT Pendiente de aprobación, sin override -- NO debe aparecer.
  ('70828186-0000-4000-8000-000000000004', '60828186-0000-4000-8000-000000000001',
   'OT Pendiente 0828186', 'LE-04', 'active', true, NULL, '2026-12-31'),
  -- (d) Overrides terminales/no-cargables sobre un encargo admin (que de otro modo
  -- calificaría por Group B) -- ninguno debe aparecer: el override manda sobre todo lo demás.
  ('70828186-0000-4000-8000-000000000005', '60828186-0000-4000-8000-000000000001',
   'Override Cancelado 0828186', 'LE-05', 'active', false, 6, '2026-12-31'),
  ('70828186-0000-4000-8000-000000000006', '60828186-0000-4000-8000-000000000001',
   'Override Finalizado 0828186', 'LE-06', 'active', false, 7, '2026-12-31'),
  ('70828186-0000-4000-8000-000000000007', '60828186-0000-4000-8000-000000000001',
   'Override Rechazado 0828186', 'LE-07', 'active', false, 8, '2026-12-31'),
  ('70828186-0000-4000-8000-000000000008', '60828186-0000-4000-8000-000000000001',
   'Override Congelado 0828186', 'LE-08', 'active', false, 9, '2026-12-31')
ON CONFLICT (engagement_id) DO NOTHING;

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode,
                                approval_status, risk_status) VALUES
  ('80828186-0000-4000-8000-000000000001', '70828186-0000-4000-8000-000000000001',
   'BOB', 'High', 'Approved', 'Approved'),
  ('80828186-0000-4000-8000-000000000002', '70828186-0000-4000-8000-000000000004',
   'BOB', 'High', 'Pending_Approval', 'Pending')
ON CONFLICT (wo_id) DO NOTHING;

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
  v_override int;
BEGIN
  PERFORM pg_temp.impersonate('a0828186-0000-4000-8000-000000000001');  -- senior, time_entry.create

  -- ── (a) OT Aprobada visible aunque el caller no esté asignado ────────────────────────────
  PERFORM 1 FROM public.list_loggable_engagements() e
   WHERE e.engagement_id = '70828186-0000-4000-8000-000000000001';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL (a): encargo con OT Aprobada no apareció para un caller no asignado';
  END IF;
  RAISE NOTICE 'OK (a): OT Aprobada visible sin asignación';

  -- ── (b) Administrativo y override Aprobado (4/5) visibles ────────────────────────────────
  PERFORM 1 FROM public.list_loggable_engagements() e
   WHERE e.engagement_id = '70828186-0000-4000-8000-000000000002';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL (b): encargo administrativo (work_order_required=false) no apareció';
  END IF;
  PERFORM 1 FROM public.list_loggable_engagements() e
   WHERE e.engagement_id = '70828186-0000-4000-8000-000000000003';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL (b): encargo con override Aprobado (4) no apareció';
  END IF;
  RAISE NOTICE 'OK (b): administrativo y override 4/5 visibles';

  -- ── (c) OT pendiente / sin override -- excluido ──────────────────────────────────────────
  PERFORM 1 FROM public.list_loggable_engagements() e
   WHERE e.engagement_id = '70828186-0000-4000-8000-000000000004';
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL (c): encargo con OT Pendiente (no Aprobada) apareció y no debía';
  END IF;
  RAISE NOTICE 'OK (c): OT no aprobada / sin override queda excluida';

  -- ── (d) Overrides 6/7/8/9 -- excluidos aunque califiquen por Group B ─────────────────────
  FOR v_override IN SELECT unnest(ARRAY[6, 7, 8, 9])
  LOOP
    PERFORM 1 FROM public.list_loggable_engagements() e
     WHERE e.engagement_id = ('70828186-0000-4000-8000-00000000000' ||
                               CASE v_override WHEN 6 THEN '5' WHEN 7 THEN '6'
                                                WHEN 8 THEN '7' WHEN 9 THEN '8' END)::uuid;
    IF FOUND THEN
      RAISE EXCEPTION 'FAIL (d): encargo con override % apareció y no debía', v_override;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK (d): overrides 6/7/8/9 quedan excluidos';

  -- ── (e) Sin time_entry.create -- lista vacía aunque existan encargos elegibles ───────────
  PERFORM pg_temp.impersonate('a0828186-0000-4000-8000-000000000002');  -- hr_analyst, SIN time_entry.create
  SELECT count(*) INTO v_count FROM public.list_loggable_engagements();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL (e): un caller sin time_entry.create debía ver 0 filas, vio %', v_count;
  END IF;
  RAISE NOTICE 'OK (e): sin time_entry.create, la lista es vacía (fail-closed)';

  RAISE NOTICE 'LOGGABLE ENGAGEMENTS RPC: ALL CHECKS PASSED (rolled back)';
END $$;

RESET ROLE;

ROLLBACK;

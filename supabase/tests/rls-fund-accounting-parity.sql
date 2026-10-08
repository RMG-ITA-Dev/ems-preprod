-- RLS assertions: paridad de permisos de Contabilidad en Solicitud de Fondos
-- (docs/plan-contabilidad-gastos.md, Fase 1.1/1.2). Run via supabase/tests/local/run-rls-tests.sh
-- against the disposable scratch database. Single transaction, ALWAYS rolls back.
--
-- Decisión de negocio (Q2/Q3): `accounting_manager` y `accounting_analyst` tienen los MISMOS
-- permisos en el módulo: desembolsar, liquidar y cerrar. Antes de la Fase 1 el analista tenía
-- solo `expense_settlement.*`: la UI le ofrecía "Liquidar", pero el WITH CHECK de
-- `fr_update_accounting` rechazaba el destino `en_liquidacion`, y `fr_select_accounting` le
-- ocultaba la solicitud en `en_liquidacion`/`cerrado`.
--
-- Under test, por cada rol contable sobre su propia solicitud:
--   aprobado_gerente → fondos_entregados (desembolso) → en_liquidacion (liquidación) → cerrado,
--   con SELECT visible en cada estado. Y un Senior ajeno al flujo no ve ni actualiza nada.
--
-- Success output ends with "FUND ACCOUNTING PARITY RLS: ALL CHECKS PASSED (rolled back)".

BEGIN;

-- ── Fixtures (como dueño, sin sesión: así los escribe el seed) ─────────────
SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a7c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'fund-acct-' || n || '@ruizmier.com', 'x', now(), now(), now(),
           '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 4) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a7c00000-0000-4000-8000-000000000001', 'staff',   'assistant'),
  ('a7c00000-0000-4000-8000-000000000002', 'manager', 'accounting_manager'),
  ('a7c00000-0000-4000-8000-000000000003', 'senior',  'accounting_analyst'),
  ('a7c00000-0000-4000-8000-000000000004', 'senior',  'senior')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, weekly_capacity_hours, hire_date, city)
SELECT ('57c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a7c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'FACCT', 'Staff' || n, true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'
  FROM generate_series(1, 4) n;

-- Una solicitud por rol contable (cada una recorre el flujo completo) y una tercera en
-- fondos_entregados para el Senior ajeno. Se insertan directo en su estado inicial: no hay
-- trigger de transición sobre fund_requests y la RLS no se evalúa para el dueño.
INSERT INTO public.fund_requests (fund_request_id, requester_staff_id,
                                  total_requested_amount, currency, status)
VALUES
  ('f7c00000-0000-4000-8000-000000000002', '57c00000-0000-4000-8000-000000000001',
   500, 'BOB', 'aprobado_gerente'),
  ('f7c00000-0000-4000-8000-000000000003', '57c00000-0000-4000-8000-000000000001',
   500, 'BOB', 'aprobado_gerente'),
  ('f7c00000-0000-4000-8000-000000000004', '57c00000-0000-4000-8000-000000000001',
   500, 'BOB', 'fondos_entregados');

-- ── Impersonation helper (temp; vanishes with the session) ────────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  )
$$;

-- Recorre el flujo contable completo como el usuario dado, sobre su solicitud.
CREATE FUNCTION pg_temp.assert_full_flow(p_label text, p_sub text, p_staff uuid, p_fr uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  PERFORM pg_temp.impersonate(p_sub);

  -- Ve la solicitud por desembolsar.
  SELECT count(*) INTO n FROM public.fund_requests WHERE fund_request_id = p_fr;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no ve la solicitud en aprobado_gerente', p_label;
  END IF;

  -- Desembolsa.
  BEGIN
    UPDATE public.fund_requests
       SET status = 'fondos_entregados', total_disbursed_amount = 500,
           disbursed_at = now(), disbursed_by_staff_id = p_staff
     WHERE fund_request_id = p_fr;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no puede desembolsar (%)', p_label, SQLERRM;
  END;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: desembolsar afectó % filas', p_label, n;
  END IF;
  RAISE NOTICE 'PASS — % desembolsa', p_label;

  -- Liquida (era el bug: WITH CHECK rechazaba en_liquidacion para el analista).
  BEGIN
    UPDATE public.fund_requests
       SET status = 'en_liquidacion', settlement_total_spent = 500, settlement_balance = 0,
           settlement_iva_total = 0, settlement_resolution = 'sin_saldo', settlement_amount = 0,
           settled_at = now(), settled_by_staff_id = p_staff
     WHERE fund_request_id = p_fr;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no puede liquidar (%)', p_label, SQLERRM;
  END;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: liquidar afectó % filas', p_label, n;
  END IF;
  RAISE NOTICE 'PASS — % liquida', p_label;

  -- Sigue viéndola en en_liquidacion.
  SELECT count(*) INTO n FROM public.fund_requests WHERE fund_request_id = p_fr;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no ve la solicitud en en_liquidacion', p_label;
  END IF;
  RAISE NOTICE 'PASS — % ve la solicitud en en_liquidacion', p_label;

  -- Cierra.
  BEGIN
    UPDATE public.fund_requests
       SET status = 'cerrado', closed_at = now()
     WHERE fund_request_id = p_fr;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no puede cerrar (%)', p_label, SQLERRM;
  END;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: cerrar afectó % filas', p_label, n;
  END IF;

  SELECT count(*) INTO n FROM public.fund_requests WHERE fund_request_id = p_fr;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no ve la solicitud cerrada', p_label;
  END IF;
  RAISE NOTICE 'PASS — % cierra y ve la solicitud cerrada', p_label;
END $$;

-- ── Todo lo que sigue corre como `authenticated` (RLS evaluada) ───────────
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
BEGIN
  PERFORM pg_temp.assert_full_flow('Gerente de Contabilidad',
    'a7c00000-0000-4000-8000-000000000002', '57c00000-0000-4000-8000-000000000002',
    'f7c00000-0000-4000-8000-000000000002');

  PERFORM pg_temp.assert_full_flow('Analista de Contabilidad',
    'a7c00000-0000-4000-8000-000000000003', '57c00000-0000-4000-8000-000000000003',
    'f7c00000-0000-4000-8000-000000000003');

  -- Senior ajeno al flujo (ni solicitante, ni gerente de OT, ni Contabilidad).
  PERFORM pg_temp.impersonate('a7c00000-0000-4000-8000-000000000004');
  SELECT count(*) INTO n FROM public.fund_requests
   WHERE fund_request_id = 'f7c00000-0000-4000-8000-000000000004';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — un Senior ajeno ve una solicitud en fondos_entregados';
  END IF;
  UPDATE public.fund_requests SET status = 'en_liquidacion'
   WHERE fund_request_id = 'f7c00000-0000-4000-8000-000000000004';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — un Senior ajeno pudo liquidar (% filas)', n;
  END IF;
  RAISE NOTICE 'PASS — un Senior ajeno no ve ni liquida';

  RAISE NOTICE 'FUND ACCOUNTING PARITY RLS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;

-- Fixture de negocio, persistente y totalmente sintético, para probar RLS por Data API en
-- xcdcxtduotwgwmhxvsiz. Crea 3 clientes, 3 encargos, 3 OT y 4 asignaciones; no contiene PII
-- ni datos operativos. Los UUID y nombres tienen prefijo RLS-XCDC para una limpieza trazable.
--
-- Precondiciones: 17 fichas/cuentas sintéticas creadas y alineadas a práctica 1.
-- Ejecutar con: psql -X -v ON_ERROR_STOP=1 -f scripts/rls-target-xcdc-fixture-business.sql

BEGIN;

-- Clientes externos ficticios: nunca se reutilizan los dos clientes internos del seed.
INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id, is_active) VALUES
  ('c0c0dc00-0000-4000-8000-000000000001', 'RLS-XCDC Cliente Alfa', 'RLS-XCDC-TAX-001', true),
  ('c0c0dc00-0000-4000-8000-000000000002', 'RLS-XCDC Cliente Beta', 'RLS-XCDC-TAX-002', true),
  ('c0c0dc00-0000-4000-8000-000000000003', 'RLS-XCDC Cliente Administrativo', 'RLS-XCDC-TAX-003', true)
ON CONFLICT DO NOTHING;

-- Dos encargos de cliente con responsables distintos y uno administrativo para HR.
INSERT INTO public.engagements (
  engagement_id, client_id, engagement_name, manager_id, partner_id, sqr_id, encargado_id,
  practica, funcion, fecha_cierre, work_order_required, approval_required, society_id
) VALUES
(
  'e0c0dc00-0000-4000-8000-000000000001',
  'c0c0dc00-0000-4000-8000-000000000001',
  'RLS-XCDC Encargo Alfa',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-manager@ruizmier.com'),
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-partner@ruizmier.com'),
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-sqr@ruizmier.com'),
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-assistant@ruizmier.com'),
  1, 1, '2027-12-31', false, true,
  (SELECT society_id FROM public.staff WHERE email = 'rls-xcdc-20261016-manager@ruizmier.com')
),
(
  'e0c0dc00-0000-4000-8000-000000000002',
  'c0c0dc00-0000-4000-8000-000000000002',
  'RLS-XCDC Encargo Beta',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-accounting-manager@ruizmier.com'),
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-risk-partner@ruizmier.com'),
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-director@ruizmier.com'),
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-senior@ruizmier.com'),
  1, 1, '2027-12-31', false, true,
  (SELECT society_id FROM public.staff WHERE email = 'rls-xcdc-20261016-accounting-manager@ruizmier.com')
),
(
  'e0c0dc00-0000-4000-8000-000000000003',
  (
    SELECT c.client_id
      FROM public.clients c
      JOIN public.society s
        ON s.society_id = (SELECT society_id FROM public.staff WHERE email = 'rls-xcdc-20261016-hr-manager@ruizmier.com')
     WHERE lower(trim(c.client_legal_name)) = lower(trim(s.name))
       AND ((s.name = 'Ruizmier Pelaez S.R.L.' AND c.unique_tax_id = '1006979026')
         OR (s.name = 'Ruizmier Jauregui S.R.L.' AND c.unique_tax_id = '184046021'))
  ),
  'RLS-XCDC Encargo Administrativo',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-hr-manager@ruizmier.com'),
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-admin@ruizmier.com'),
  NULL,
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-hr-analyst@ruizmier.com'),
  1, 2, '2027-12-31', false, true,
  (SELECT society_id FROM public.staff WHERE email = 'rls-xcdc-20261016-hr-manager@ruizmier.com')
)
ON CONFLICT DO NOTHING;

-- Una OT por encargo; las dos primeras aprobadas permiten comprobar las vistas de OT.
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40c0dc00-0000-4000-8000-000000000001', 'e0c0dc00-0000-4000-8000-000000000001', 'BOB', 'High', 'Approved'),
  ('40c0dc00-0000-4000-8000-000000000002', 'e0c0dc00-0000-4000-8000-000000000002', 'BOB', 'High', 'Approved'),
  ('40c0dc00-0000-4000-8000-000000000003', 'e0c0dc00-0000-4000-8000-000000000003', 'BOB', 'Low', 'Draft')
ON CONFLICT DO NOTHING;

-- Asignaciones explícitas: hacen no vacía la política de pertenencia además de los cuatro
-- responsables del encabezado del encargo. category_id se toma de la propia ficha, ya práctica 1.
INSERT INTO public.engagement_assignments (
  assignment_id, engagement_id, staff_id, category_id, start_date, end_date,
  hours_per_week, allocation_percent, status
)
SELECT v.assignment_id, v.engagement_id, s.staff_id, s.category_id,
       DATE '2026-10-01', DATE '2027-12-31', 20, 50, 'CONFIRMED'
  FROM (VALUES
    ('60c0dc00-0000-4000-8000-000000000001'::uuid, 'e0c0dc00-0000-4000-8000-000000000001'::uuid, 'rls-xcdc-20261016-assistant@ruizmier.com'),
    ('60c0dc00-0000-4000-8000-000000000002'::uuid, 'e0c0dc00-0000-4000-8000-000000000001'::uuid, 'rls-xcdc-20261016-semisenior@ruizmier.com'),
    ('60c0dc00-0000-4000-8000-000000000003'::uuid, 'e0c0dc00-0000-4000-8000-000000000002'::uuid, 'rls-xcdc-20261016-senior@ruizmier.com'),
    ('60c0dc00-0000-4000-8000-000000000004'::uuid, 'e0c0dc00-0000-4000-8000-000000000003'::uuid, 'rls-xcdc-20261016-hr-analyst@ruizmier.com')
  ) AS v(assignment_id, engagement_id, email)
  JOIN public.staff s ON s.email = v.email
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_clients int;
  v_engagements int;
  v_work_orders int;
  v_assignments int;
  v_bad_practice int;
BEGIN
  SELECT count(*) INTO v_clients FROM public.clients WHERE unique_tax_id LIKE 'RLS-XCDC-TAX-%';
  SELECT count(*) INTO v_engagements FROM public.engagements WHERE engagement_name LIKE 'RLS-XCDC Encargo %';
  SELECT count(*) INTO v_work_orders FROM public.work_orders WHERE wo_id::text LIKE '40c0dc00-%';
  SELECT count(*) INTO v_assignments FROM public.engagement_assignments WHERE assignment_id::text LIKE '60c0dc00-%';
  SELECT count(*) INTO v_bad_practice
    FROM public.engagement_assignments ea
    JOIN public.engagements e ON e.engagement_id = ea.engagement_id
    JOIN public.categories c ON c.category_id = ea.category_id
    JOIN public.practicas p ON p.practica_id = c.practica_id
   WHERE ea.assignment_id::text LIKE '60c0dc00-%'
     AND p.code IS DISTINCT FROM e.practica;

  IF v_clients <> 3 OR v_engagements <> 3 OR v_work_orders <> 3 OR v_assignments <> 4 OR v_bad_practice <> 0 THEN
    RAISE EXCEPTION 'RLS business fixture FAIL: clients %, engagements %, OT %, assignments %, cruces práctica inválidos %',
      v_clients, v_engagements, v_work_orders, v_assignments, v_bad_practice;
  END IF;
  RAISE NOTICE 'RLS business fixture PASS: 3 clientes, 3 encargos, 3 OT y 4 asignaciones sintéticas; práctica consistente';
END $$;

COMMIT;

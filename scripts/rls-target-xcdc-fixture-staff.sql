-- Fixture persistente y sintético para la regresión RLS del proyecto xcdcxtduotwgwmhxvsiz.
--
-- Crea exclusivamente fichas staff de prueba, aún sin usuarios de Auth. Al crear luego los
-- usuarios con el mismo correo, `link_auth_user_to_staff` realiza el enlace real. No contiene
-- personas, correos ni datos de negocio reales. Es idempotente; aborta si falta alguna categoría
-- compatible, en lugar de fabricar un perfil inválido.
--
-- Ejecutar una sola vez, con destino explícito y psql ya conectado al proyecto objetivo:
--   psql -X -v ON_ERROR_STOP=1 -f scripts/rls-target-xcdc-fixture-staff.sql

BEGIN;

WITH fixture(label, email, category_role) AS (
  VALUES
    ('ADMIN',            'rls-xcdc-20261016-admin@ruizmier.com',              'partner'::public.app_role),
    ('ASISTENTE',        'rls-xcdc-20261016-assistant@ruizmier.com',          'staff'::public.app_role),
    ('SEMISENIOR',       'rls-xcdc-20261016-semisenior@ruizmier.com',         'semisenior'::public.app_role),
    ('SENIOR',           'rls-xcdc-20261016-senior@ruizmier.com',             'senior'::public.app_role),
    ('GERENTE',          'rls-xcdc-20261016-manager@ruizmier.com',            'manager'::public.app_role),
    ('GERENTE_CONTA',    'rls-xcdc-20261016-accounting-manager@ruizmier.com', 'manager'::public.app_role),
    ('SOCIO',            'rls-xcdc-20261016-partner@ruizmier.com',            'partner'::public.app_role),
    ('ANALISTA_COB',     'rls-xcdc-20261016-collections@ruizmier.com',        'senior'::public.app_role),
    ('ANALISTA_CONT',    'rls-xcdc-20261016-accounting@ruizmier.com',         'senior'::public.app_role),
    ('ANALISTA_RIESGOS', 'rls-xcdc-20261016-risk-supervisor@ruizmier.com',    'manager'::public.app_role),
    ('SOCIO_RIESGOS',    'rls-xcdc-20261016-risk-partner@ruizmier.com',       'partner'::public.app_role),
    ('SENIOR_PARTNER',   'rls-xcdc-20261016-senior-partner@ruizmier.com',     'partner'::public.app_role),
    ('DIRECTOR',         'rls-xcdc-20261016-director@ruizmier.com',           'director'::public.app_role),
    ('SQR',              'rls-xcdc-20261016-sqr@ruizmier.com',                'sqr'::public.app_role),
    ('HR_MANAGER',       'rls-xcdc-20261016-hr-manager@ruizmier.com',         'manager'::public.app_role),
    ('HR_ANALYST',       'rls-xcdc-20261016-hr-analyst@ruizmier.com',         'senior'::public.app_role),
    ('IT_SECURITY',      'rls-xcdc-20261016-it-security@ruizmier.com',        'manager'::public.app_role)
), resolved AS (
  SELECT f.*, c.category_id, c.practica_id
  FROM fixture f
  CROSS JOIN LATERAL (
    SELECT category_id, practica_id
      FROM public.categories
     WHERE default_app_role = f.category_role
     ORDER BY display_order, category_id
     LIMIT 1
  ) c
), inserted AS (
  INSERT INTO public.staff (
    first_name, last_name, short_name, initials, email, category_id, practica_id,
    society_id, city, hire_date, is_active, is_schedulable, weekly_capacity_hours,
    target_utilization_percent
  )
  SELECT
    'RLS', r.label, 'RLS ' || r.label, left(regexp_replace(r.label, '[^A-Z]', '', 'g'), 4),
    r.email, r.category_id, r.practica_id,
    (SELECT society_id FROM public.society ORDER BY name, society_id LIMIT 1),
    'La Paz', CURRENT_DATE, true, true, 40, 85
  FROM resolved r
  ON CONFLICT DO NOTHING
  RETURNING staff_id
)
SELECT count(*) AS staff_insertado_esta_ejecucion FROM inserted;

DO $$
DECLARE
  v_expected constant text[] := ARRAY[
    'rls-xcdc-20261016-admin@ruizmier.com',
    'rls-xcdc-20261016-assistant@ruizmier.com',
    'rls-xcdc-20261016-semisenior@ruizmier.com',
    'rls-xcdc-20261016-senior@ruizmier.com',
    'rls-xcdc-20261016-manager@ruizmier.com',
    'rls-xcdc-20261016-accounting-manager@ruizmier.com',
    'rls-xcdc-20261016-partner@ruizmier.com',
    'rls-xcdc-20261016-collections@ruizmier.com',
    'rls-xcdc-20261016-accounting@ruizmier.com',
    'rls-xcdc-20261016-risk-supervisor@ruizmier.com',
    'rls-xcdc-20261016-risk-partner@ruizmier.com',
    'rls-xcdc-20261016-senior-partner@ruizmier.com',
    'rls-xcdc-20261016-director@ruizmier.com',
    'rls-xcdc-20261016-sqr@ruizmier.com',
    'rls-xcdc-20261016-hr-manager@ruizmier.com',
    'rls-xcdc-20261016-hr-analyst@ruizmier.com',
    'rls-xcdc-20261016-it-security@ruizmier.com'
  ];
  v_count int;
  v_linked int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE auth_user_id IS NOT NULL)
    INTO v_count, v_linked
    FROM public.staff
   WHERE lower(trim(email)) = ANY(v_expected);

  IF v_count <> cardinality(v_expected) THEN
    RAISE EXCEPTION 'RLS fixture FAIL: esperadas % fichas sintéticas, hay %', cardinality(v_expected), v_count;
  END IF;
  IF v_linked <> 0 THEN
    RAISE EXCEPTION 'RLS fixture FAIL: % fichas ya tienen auth_user_id; no se recrean ni se reasignan usuarios', v_linked;
  END IF;
  RAISE NOTICE 'RLS fixture PASS: % fichas sintéticas, sin auth_user_id, listas para el enlace real de Auth', v_count;
END $$;

COMMIT;

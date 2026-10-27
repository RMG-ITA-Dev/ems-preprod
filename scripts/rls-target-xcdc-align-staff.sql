-- Alinea las 17 fichas sintéticas RLS con la práctica 1, que posee todas las categorías
-- requeridas para un equipo de encargo completo. Conserva auth_user_id, roles y cualquier
-- otra ficha de la base. Ejecutar solo contra xcdcxtduotwgwmhxvsiz.

BEGIN;

WITH fixture(email, category_role) AS (
  VALUES
    ('rls-xcdc-20261016-admin@ruizmier.com',              'partner'::public.app_role),
    ('rls-xcdc-20261016-assistant@ruizmier.com',          'staff'::public.app_role),
    ('rls-xcdc-20261016-semisenior@ruizmier.com',         'semisenior'::public.app_role),
    ('rls-xcdc-20261016-senior@ruizmier.com',             'senior'::public.app_role),
    ('rls-xcdc-20261016-manager@ruizmier.com',            'manager'::public.app_role),
    ('rls-xcdc-20261016-accounting-manager@ruizmier.com', 'manager'::public.app_role),
    ('rls-xcdc-20261016-partner@ruizmier.com',            'partner'::public.app_role),
    ('rls-xcdc-20261016-collections@ruizmier.com',        'senior'::public.app_role),
    ('rls-xcdc-20261016-accounting@ruizmier.com',         'senior'::public.app_role),
    ('rls-xcdc-20261016-risk-supervisor@ruizmier.com',    'manager'::public.app_role),
    ('rls-xcdc-20261016-risk-partner@ruizmier.com',       'partner'::public.app_role),
    ('rls-xcdc-20261016-senior-partner@ruizmier.com',     'partner'::public.app_role),
    ('rls-xcdc-20261016-director@ruizmier.com',           'director'::public.app_role),
    ('rls-xcdc-20261016-sqr@ruizmier.com',                'sqr'::public.app_role),
    ('rls-xcdc-20261016-hr-manager@ruizmier.com',         'manager'::public.app_role),
    ('rls-xcdc-20261016-hr-analyst@ruizmier.com',         'senior'::public.app_role),
    ('rls-xcdc-20261016-it-security@ruizmier.com',        'manager'::public.app_role)
), target AS (
  SELECT f.email, c.category_id, c.practica_id
    FROM fixture f
    JOIN public.practicas p ON p.code = 1
    JOIN LATERAL (
      SELECT category_id, practica_id
        FROM public.categories
       WHERE practica_id = p.practica_id
         AND default_app_role = f.category_role
       ORDER BY display_order, category_id
       LIMIT 1
    ) c ON true
)
UPDATE public.staff s
   SET category_id = t.category_id,
       practica_id = t.practica_id,
       updated_at = now()
  FROM target t
 WHERE lower(trim(s.email)) = t.email;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.staff s
    JOIN public.practicas p ON p.practica_id = s.practica_id
   WHERE s.email LIKE 'rls-xcdc-20261016-%@ruizmier.com'
     AND p.code = 1;
  IF v_count <> 17 THEN
    RAISE EXCEPTION 'RLS fixture FAIL: esperadas 17 fichas en práctica 1, hay %', v_count;
  END IF;
  RAISE NOTICE 'RLS fixture PASS: 17 fichas sintéticas alineadas a práctica 1';
END $$;

COMMIT;

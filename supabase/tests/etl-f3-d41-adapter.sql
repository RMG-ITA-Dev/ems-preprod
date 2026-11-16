-- ETL F3 · D41 Parte I: prueba de humo del adaptador SQL de la consola (scripts/etl/fase3-db.mjs) contra el esquema real de la base scratch.
-- A diferencia de los demás suites, este SÍ confirma (COMMIT) su fixture: el adaptador de Node abre otra conexión y necesita verlo. Por eso va el ÚLTIMO del harness y solo corre
-- sobre la base scratch `ems_rls_test_*`, que el harness elimina al terminar. El script de Node (supabase/tests/local/etl-f3-d41-adapter-smoke.mjs) lo lanza psql con `\!`.
-- Salida de éxito: "ETL F3 D41 ADAPTER: ALL CHECKS PASSED" (solo si el código de salida de Node es 0).
BEGIN;
INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES ('6e410000-0000-4000-8000-000000000001', 'Cliente D41 adaptador', 'NIT-D41-AD');
INSERT INTO auth.users (id) VALUES ('ae410000-0000-4000-8000-000000000001'), ('ae410000-0000-4000-8000-000000000002');
-- La huella L9 identifica a cada persona por el md5 de su correo (clave natural del legacy): el fixture le da uno.
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, email, practica_id, society_id) VALUES
  ('5e410000-0000-4000-8000-000000000001', 'ae410000-0000-4000-8000-000000000001', 'D41', 'AdaptadorTrabaja', 'd41.trabaja@example.test', (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('5e410000-0000-4000-8000-000000000002', 'ae410000-0000-4000-8000-000000000002', 'D41', 'AdaptadorAprueba', 'd41.aprueba@example.test', (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1));
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, status, work_order_required, engagement_state_override, start_date, end_date, fecha_cierre, society_id) VALUES
  ('7e410000-0000-4000-8000-000000000001', '6e410000-0000-4000-8000-000000000001', 'Encargo D41 adaptador', 'D41-AD-01', 'active', false, NULL, '2026-01-01', '2099-12-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1));
INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id) VALUES ('D41-A', 'Actividad D41 A (adaptador)', true, NULL), ('D41-B', 'Actividad D41 B (adaptador)', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;
-- Aprobación administrativa importada: fichas técnicas ficticias, misma sociedad y roles válidos.
INSERT INTO public.practicas(practica_id,name,code,abbreviation,allows_rates_activities)
VALUES('5e410000-0000-4000-8000-000000000000','Firmwide',0,'FWD',false)
ON CONFLICT(code) DO NOTHING;
INSERT INTO auth.users(id) VALUES
  ('ae410000-0000-4000-8000-000000000003'),('ae410000-0000-4000-8000-000000000004'),('ae410000-0000-4000-8000-000000000005');
INSERT INTO public.user_roles(user_id,role,role_key) VALUES
  ('ae410000-0000-4000-8000-000000000003','manager','manager'),
  ('ae410000-0000-4000-8000-000000000004','partner','partner'),
  ('ae410000-0000-4000-8000-000000000005','admin','admin');
INSERT INTO public.staff(staff_id,auth_user_id,first_name,last_name,email,practica_id,society_id,city)
SELECT ('5e410000-0000-4000-8000-00000000000'||n)::uuid,('ae410000-0000-4000-8000-00000000000'||n)::uuid,
  'AdminAdapter',n,'admin.adapter.'||n||'@example.test',
  (SELECT practica_id FROM public.practicas WHERE code=1),
  (SELECT society_id FROM public.society WHERE name='Ruizmier Pelaez S.R.L.'),'La Paz'
FROM (VALUES('3'),('4'),('5')) s(n);
COMMIT;

-- El adaptador usa las variables PG* del harness (host, puerto, usuario y contraseña ya exportados) y la base actual.
\setenv PGDATABASE :DBNAME
\! node supabase/tests/local/etl-f3-d41-adapter-smoke.mjs
SELECT 'ETL F3 D41 ADAPTER: ALL CHECKS PASSED' AS resultado WHERE :SHELL_EXIT_CODE = 0;

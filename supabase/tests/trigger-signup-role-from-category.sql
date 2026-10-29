-- handle_new_user(): la cuenta nace con el rol que sugiere la categoría de la ficha que el
-- admin creó antes del primer ingreso (categories.default_role_key). Sin ficha, sin
-- sugerencia o con la ficha dada de baja: `assistant`, como antes.
--
-- Corre desde supabase/tests/local/run-rls-tests.sh. Transaccion unica, SIEMPRE hace ROLLBACK.
-- Salida de exito: una NOTICE por chequeo, terminando en "SIGNUP ROLE FROM CATEGORY: ALL CHECKS PASSED (rolled back)".
--
-- Los triggers de auth.users los crea cero_07, que el harness local NO aplica. Se instalan aca dentro de la
-- transaccion con la definicion exacta de cero_07 si faltan (igual que rls-carril-b-b6-staff-unique.sql).
--
-- Fixture (prefijos a51c0 = auth.users, 551c0 = staff, c51c0 = categories). Correos @ruizmier.com:
-- validate_email_domain rechaza otros dominios.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgname = 'validate_email_domain_trigger') THEN
    CREATE TRIGGER validate_email_domain_trigger BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.validate_email_domain();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created_link_staff') THEN
    CREATE TRIGGER on_auth_user_created_link_staff AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.link_auth_user_to_staff();
  END IF;
END $$;

CREATE FUNCTION pg_temp.must(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF NOT coalesce(p_ok, false) THEN RAISE EXCEPTION 'SIGNUP ROLE FAIL — %', p_msg; END IF;
  RAISE NOTICE 'PASS — %', p_msg;
END $f$;

CREATE FUNCTION pg_temp.uid(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $f$ SELECT ('a51c0000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0'))::uuid $f$;
CREATE FUNCTION pg_temp.sid(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $f$ SELECT ('551c0000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0'))::uuid $f$;

CREATE FUNCTION pg_temp.mk_staff(p_n int, p_email text, p_category uuid) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO public.staff (staff_id, first_name, last_name, email, is_active, category_id, practica_id, society_id)
  VALUES (pg_temp.sid(p_n), 'F' || p_n, 'SIGNUP', p_email, false, p_category,
          (SELECT practica_id FROM public.practicas WHERE code = 1),
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1));
$f$;

CREATE FUNCTION pg_temp.role_of(p_n int) RETURNS text LANGUAGE sql AS
  $f$ SELECT role::text || '/' || role_key FROM public.user_roles WHERE user_id = pg_temp.uid(p_n) $f$;

-- Bootstrap fuera del caso: con user_roles vacia el primer usuario seria admin.
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(99), 'signup-bootstrap@ruizmier.com');

INSERT INTO public.categories (category_id, practica_id, category_name, display_order, default_role_key) VALUES
  ('c51c0000-0000-4000-8000-000000000001', (SELECT practica_id FROM public.practicas WHERE code = 1), 'SIGNUP Sugiere', 950, 'ita_manager'),
  ('c51c0000-0000-4000-8000-000000000002', (SELECT practica_id FROM public.practicas WHERE code = 1), 'SIGNUP Sin rol', 951, NULL);

-- 1) ficha previa con categoria que sugiere: la cuenta nace con ese rol y su espejo legacy
SELECT pg_temp.mk_staff(1, 'signup-sugiere@ruizmier.com', 'c51c0000-0000-4000-8000-000000000001');
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(1), 'signup-sugiere@ruizmier.com');
SELECT pg_temp.must(pg_temp.role_of(1) = 'manager/ita_manager', '1 ficha con categoria que sugiere ita_manager -> manager/ita_manager');
SELECT pg_temp.must((SELECT auth_user_id = pg_temp.uid(1) AND is_active FROM public.staff WHERE staff_id = pg_temp.sid(1)),
                    '1b la ficha queda vinculada y activa (link_auth_user_to_staff intacto)');

-- 2) el correo de la ficha difiere en mayusculas y espacios: matchea igual que el enlace
SELECT pg_temp.mk_staff(2, '  Signup-Mayus@RuizMier.com ', 'c51c0000-0000-4000-8000-000000000001');
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(2), 'signup-mayus@ruizmier.com');
SELECT pg_temp.must(pg_temp.role_of(2) = 'manager/ita_manager', '2 correo con mayusculas/espacios -> rol de la categoria');

-- 3) categoria sin sugerencia: assistant
SELECT pg_temp.mk_staff(3, 'signup-sinrol@ruizmier.com', 'c51c0000-0000-4000-8000-000000000002');
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(3), 'signup-sinrol@ruizmier.com');
SELECT pg_temp.must(pg_temp.role_of(3) = 'staff/assistant', '3 categoria sin default_role_key -> staff/assistant');

-- 4) sin ficha: assistant
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(4), 'signup-sinficha@ruizmier.com');
SELECT pg_temp.must(pg_temp.role_of(4) = 'staff/assistant', '4 sin ficha -> staff/assistant');

-- 5) ficha dada de baja: no cuenta, assistant
SELECT pg_temp.mk_staff(5, 'signup-baja@ruizmier.com', 'c51c0000-0000-4000-8000-000000000001');
UPDATE public.staff SET deleted_at = now() WHERE staff_id = pg_temp.sid(5);
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(5), 'signup-baja@ruizmier.com');
SELECT pg_temp.must(pg_temp.role_of(5) = 'staff/assistant', '5 ficha con deleted_at -> staff/assistant');

-- 6) una categoria nunca puede sugerir admin (CHECK), asi que esta via no escala privilegios
DO $$
BEGIN
  BEGIN
    UPDATE public.categories SET default_role_key = 'admin' WHERE category_id = 'c51c0000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'SIGNUP ROLE FAIL — 6 una categoria acepto default_role_key = admin';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS — 6 default_role_key = admin rechazado por CHECK';
  END;
END $$;

-- ── apply_category_role_on_staff_link(): la ficha se crea DESPUÉS de la cuenta (huérfano) ──
UPDATE public.categories SET default_role_key = 'ita_manager' WHERE category_id = 'c51c0000-0000-4000-8000-000000000001';

-- 7) huérfano con assistant: al crearle la ficha toma el rol de la categoría
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(7), 'signup-huerfano@ruizmier.com');
SELECT pg_temp.must(pg_temp.role_of(7) = 'staff/assistant', '7a huérfano nace staff/assistant');
SELECT pg_temp.mk_staff(7, 'signup-huerfano@ruizmier.com', 'c51c0000-0000-4000-8000-000000000001');
SELECT pg_temp.must(pg_temp.role_of(7) = 'manager/ita_manager', '7b ficha nueva para el huérfano -> manager/ita_manager');
SELECT pg_temp.must((SELECT auth_user_id = pg_temp.uid(7) AND is_active FROM public.staff WHERE staff_id = pg_temp.sid(7)),
                    '7c la ficha queda vinculada y activa');

-- 8) huérfano con un rol puesto a mano: no se toca
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(8), 'signup-manual@ruizmier.com');
UPDATE public.user_roles SET role = 'senior', role_key = 'tax_senior' WHERE user_id = pg_temp.uid(8);
SELECT pg_temp.mk_staff(8, 'signup-manual@ruizmier.com', 'c51c0000-0000-4000-8000-000000000001');
SELECT pg_temp.must(pg_temp.role_of(8) = 'senior/tax_senior', '8 rol puesto a mano antes de la ficha -> se conserva');

-- 9) huérfano admin: nunca se degrada
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(9), 'signup-admin@ruizmier.com');
UPDATE public.user_roles SET role = 'admin', role_key = 'admin' WHERE user_id = pg_temp.uid(9);
SELECT pg_temp.mk_staff(9, 'signup-admin@ruizmier.com', 'c51c0000-0000-4000-8000-000000000001');
SELECT pg_temp.must(pg_temp.role_of(9) = 'admin/admin', '9 admin huérfano -> sigue admin');

-- 10) huérfano y categoría sin sugerencia: sigue assistant
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(10), 'signup-huerfano-sinrol@ruizmier.com');
SELECT pg_temp.mk_staff(10, 'signup-huerfano-sinrol@ruizmier.com', 'c51c0000-0000-4000-8000-000000000002');
SELECT pg_temp.must(pg_temp.role_of(10) = 'staff/assistant', '10 huérfano con categoría sin rol -> staff/assistant');

-- ── trg_apply_category_role_on_staff_relink: una ficha que YA existía se vincula después ──

-- 11) ficha con otro correo + huérfano; al corregir el correo de la ficha se vincula (UPDATE)
--     y toma el rol de la categoría
SELECT pg_temp.mk_staff(11, 'signup-alias@ruizmier.com', 'c51c0000-0000-4000-8000-000000000001');
INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(11), 'signup-real@ruizmier.com');
SELECT pg_temp.must(pg_temp.role_of(11) = 'staff/assistant', '11a la cuenta nace sin ficha que coincida -> staff/assistant');
UPDATE public.staff SET email = 'signup-real@ruizmier.com' WHERE staff_id = pg_temp.sid(11);
SELECT pg_temp.must((SELECT auth_user_id = pg_temp.uid(11) FROM public.staff WHERE staff_id = pg_temp.sid(11)),
                    '11b corregir el correo vincula la ficha existente');
SELECT pg_temp.must(pg_temp.role_of(11) = 'manager/ita_manager', '11c ficha vinculada por UPDATE -> manager/ita_manager');

-- 12) un UPDATE cualquiera sobre una ficha ya vinculada no vuelve a aplicar el rol: el admin la
--     dejó en assistant a mano y editar la ficha no se lo pisa
UPDATE public.user_roles SET role = 'staff', role_key = 'assistant' WHERE user_id = pg_temp.uid(11);
UPDATE public.staff SET first_name = 'F11b' WHERE staff_id = pg_temp.sid(11);
SELECT pg_temp.must(pg_temp.role_of(11) = 'staff/assistant', '12 UPDATE sin cambio de vínculo -> no reaplica el rol');

DO $$ BEGIN RAISE NOTICE 'SIGNUP ROLE FROM CATEGORY: ALL CHECKS PASSED (rolled back)'; END $$;

ROLLBACK;

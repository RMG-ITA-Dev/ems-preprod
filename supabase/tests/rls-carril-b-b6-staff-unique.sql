-- Carril B / B6 — un auth_user_id no puede estar en dos fichas de staff activas
-- (20261013170000_rls_carril_b6_staff_auth_user_unique.sql)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, despues de B5. Transaccion unica, SIEMPRE hace ROLLBACK.
-- Salida de exito: una NOTICE por chequeo, terminando en "B6 STAFF UNIQUE: ALL CHECKS PASSED (rolled back)".
--
-- Se prueba el indice Y su convivencia con los dos triggers de enlace (link_staff_to_auth_user, BEFORE INSERT/UPDATE en staff;
-- link_auth_user_to_staff, AFTER INSERT en auth.users), que corren de verdad: ninguna escritura apaga triggers. El caso 9
-- (reingreso tras una baja) es el que rompe un indice sin `deleted_at IS NULL`: el borrado logico conserva auth_user_id y el
-- trigger ignora a las fichas borradas al decidir si un usuario esta libre.
--
-- Los triggers de auth.users los crea cero_07, que el harness local NO aplica (auth.users es una tabla lisa de 00-shim-auth.sql). Aqui se
-- instalan, dentro de la transaccion, con la definicion exacta de cero_07 si faltan; en un Supabase real ya existen y no se tocan. Asi los
-- casos 6 a 9 prueban lo mismo en el harness, en un proyecto reconstruido y en Dev 2.0.
--
-- Fixture (prefijos a0b60 = auth.users, 50b60 = staff). Correos @ruizmier.com: validate_email_domain rechaza otros dominios.

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
  IF NOT coalesce(p_ok, false) THEN RAISE EXCEPTION 'B6 FAIL — %', p_msg; END IF;
END $f$;

-- Ejecuta una sentencia y devuelve 'ok' o 'SQLSTATE:constraint' (la subtransaccion deshace solo ese intento).
CREATE FUNCTION pg_temp.try(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_state text; v_constraint text;
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME;
  RETURN v_state || ':' || coalesce(v_constraint, '-');
END $f$;

CREATE FUNCTION pg_temp.mk_staff(p_n int, p_auth uuid, p_email text DEFAULT NULL) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, email, practica_id, society_id)
  VALUES (('50b60000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0'))::uuid, p_auth, 'F' || p_n, 'B6', p_email,
          (SELECT practica_id FROM public.practicas WHERE code = 1),
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1));
$f$;

CREATE FUNCTION pg_temp.uid(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $f$ SELECT ('a0b60000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0'))::uuid $f$;
CREATE FUNCTION pg_temp.sid(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $f$ SELECT ('50b60000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0'))::uuid $f$;

-- Base: tres usuarios sin correo (no disparan el enlace por correo); F1 enlazada a U1, F2 libre
INSERT INTO auth.users (id) VALUES (pg_temp.uid(1)), (pg_temp.uid(2)), (pg_temp.uid(3));
SELECT pg_temp.mk_staff(1, pg_temp.uid(1));
SELECT pg_temp.mk_staff(2, NULL);

-- 1. El indice existe, es unico sobre (auth_user_id) SIN excluir fichas borradas, y el trigger de baja existe y esta habilitado
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_indexdef(i.indexrelid) INTO v_def
    FROM pg_index i
   WHERE i.indexrelid = to_regclass('public.idx_staff_auth_user_id_unique') AND i.indisunique;
  PERFORM pg_temp.must(v_def IS NOT NULL, '1. falta idx_staff_auth_user_id_unique o no es UNIQUE');
  PERFORM pg_temp.must(v_def LIKE '%(auth_user_id)%' AND v_def LIKE '%auth_user_id IS NOT NULL%' AND v_def NOT LIKE '%deleted_at%',
                       '1. el indice debe ser UNIQUE (auth_user_id) WHERE auth_user_id IS NOT NULL, sin excluir borradas: ' || v_def);
  PERFORM pg_temp.must(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.staff'::regclass
                                  AND tgname = 'trg_staff_release_auth_user_on_delete' AND tgenabled = 'O' AND NOT tgisinternal),
                       '1. falta el trigger trg_staff_release_auth_user_on_delete (o esta deshabilitado)');
  RAISE NOTICE 'PASS — 1. idx_staff_auth_user_id_unique: UNIQUE sobre auth_user_id (borradas incluidas) y trigger de baja habilitado';
END $$;

-- 2. Un INSERT con el auth_user_id de otra ficha activa se rechaza con 23505 por ESTE indice
DO $$
BEGIN
  PERFORM pg_temp.must(pg_temp.try(format('SELECT pg_temp.mk_staff(3, %L)', pg_temp.uid(1))) = '23505:idx_staff_auth_user_id_unique',
                       '2. el INSERT duplicado no fue rechazado con 23505 por idx_staff_auth_user_id_unique');
  PERFORM pg_temp.must(NOT EXISTS (SELECT 1 FROM public.staff WHERE staff_id = pg_temp.sid(3)), '2. la ficha duplicada quedo insertada');
  RAISE NOTICE 'PASS — 2. INSERT con un auth_user_id ya usado por una ficha activa: 23505';
END $$;

-- 3. Un UPDATE que copia el auth_user_id de otra ficha activa tambien (el secuestro de identidad de B3e, ahora sin salida ni para el dueño)
DO $$
BEGIN
  PERFORM pg_temp.must(pg_temp.try(format('UPDATE public.staff SET auth_user_id = %L WHERE staff_id = %L', pg_temp.uid(1), pg_temp.sid(2)))
                       = '23505:idx_staff_auth_user_id_unique', '3. el UPDATE duplicado no fue rechazado con 23505');
  PERFORM pg_temp.must((SELECT auth_user_id IS NULL FROM public.staff WHERE staff_id = pg_temp.sid(2)), '3. F2 quedo enlazada pese al rechazo');
  RAISE NOTICE 'PASS — 3. UPDATE que copia el auth_user_id de otra ficha activa: 23505';
END $$;

-- 4. Enlace normal: una ficha libre toma un usuario libre
DO $$
BEGIN
  PERFORM pg_temp.must(pg_temp.try(format('UPDATE public.staff SET auth_user_id = %L WHERE staff_id = %L', pg_temp.uid(2), pg_temp.sid(2))) = 'ok',
                       '4. el enlace normal fallo');
  PERFORM pg_temp.must((SELECT auth_user_id = pg_temp.uid(2) FROM public.staff WHERE staff_id = pg_temp.sid(2)), '4. F2 no quedo enlazada a U2');
  RAISE NOTICE 'PASS — 4. enlace normal (ficha libre + usuario libre)';
END $$;

-- 5. Desenlace y reenlace: soltar libera el usuario para otra ficha; recuperarlo mientras otra lo tiene se rechaza
DO $$
BEGIN
  PERFORM pg_temp.must(pg_temp.try(format('UPDATE public.staff SET auth_user_id = NULL WHERE staff_id = %L', pg_temp.sid(1))) = 'ok', '5. el desenlace fallo');
  PERFORM pg_temp.must(pg_temp.try(format('SELECT pg_temp.mk_staff(3, %L)', pg_temp.uid(1))) = 'ok', '5. el usuario liberado no pudo tomarlo otra ficha');
  PERFORM pg_temp.must(pg_temp.try(format('UPDATE public.staff SET auth_user_id = %L WHERE staff_id = %L', pg_temp.uid(1), pg_temp.sid(1)))
                       = '23505:idx_staff_auth_user_id_unique', '5. recuperar un usuario tomado por otra ficha debia dar 23505');
  PERFORM pg_temp.must(pg_temp.try(format('UPDATE public.staff SET auth_user_id = %L WHERE staff_id = %L', pg_temp.uid(3), pg_temp.sid(1))) = 'ok',
                       '5. el reenlace de F1 a un usuario libre fallo');
  RAISE NOTICE 'PASS — 5. desenlace libera el usuario, reenlace a un usuario libre ok, recuperar uno tomado: 23505';
END $$;

-- 6. Alta de usuario CON ficha (por correo): link_auth_user_to_staff enlaza la ficha libre
DO $$
BEGIN
  PERFORM pg_temp.mk_staff(4, NULL, 'b6u-alta@ruizmier.com');
  PERFORM pg_temp.must((SELECT auth_user_id IS NULL FROM public.staff WHERE staff_id = pg_temp.sid(4)), '6. F4 nacio enlazada sin usuario');
  INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(4), 'b6u-alta@ruizmier.com');
  PERFORM pg_temp.must((SELECT auth_user_id = pg_temp.uid(4) AND is_active FROM public.staff WHERE staff_id = pg_temp.sid(4)),
                       '6. el alta del usuario no enlazo la ficha por correo');
  RAISE NOTICE 'PASS — 6. alta de usuario con ficha: enlazada por correo';
END $$;

-- 7. Alta de usuario SIN ficha: no falla y no enlaza a nadie
DO $$
BEGIN
  PERFORM pg_temp.must(pg_temp.try(format('INSERT INTO auth.users (id, email) VALUES (%L, %L)', pg_temp.uid(5), 'b6u-sinficha@ruizmier.com')) = 'ok',
                       '7. el alta de un usuario sin ficha fallo');
  PERFORM pg_temp.must(NOT EXISTS (SELECT 1 FROM public.staff WHERE auth_user_id = pg_temp.uid(5)), '7. el alta sin ficha enlazo a alguien');
  PERFORM pg_temp.must(EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = pg_temp.uid(5)), '7. handle_new_user no creo el rol');
  RAISE NOTICE 'PASS — 7. alta de usuario sin ficha: ok, sin enlace, con rol';
END $$;

-- 8. Alta de un usuario cuyo correo ya tiene una ficha ENLAZADA a otro usuario: no rompe el alta y no la secuestra
DO $$
BEGIN
  INSERT INTO auth.users (id) VALUES (pg_temp.uid(8));
  PERFORM pg_temp.mk_staff(6, pg_temp.uid(8), 'b6u-ya@ruizmier.com');
  PERFORM pg_temp.must(pg_temp.try(format('INSERT INTO auth.users (id, email) VALUES (%L, %L)', pg_temp.uid(9), 'b6u-ya@ruizmier.com')) = 'ok',
                       '8. el alta con el correo de una ficha ya enlazada fallo');
  PERFORM pg_temp.must((SELECT auth_user_id = pg_temp.uid(8) FROM public.staff WHERE staff_id = pg_temp.sid(6)), '8. la ficha ya enlazada perdio su usuario');
  PERFORM pg_temp.must(NOT EXISTS (SELECT 1 FROM public.staff WHERE auth_user_id = pg_temp.uid(9)), '8. el usuario nuevo quedo enlazado a una ficha ajena');
  RAISE NOTICE 'PASS — 8. alta con el correo de una ficha ya enlazada a otro usuario: ok y sin secuestro';
END $$;

-- 9. REINGRESO tras una baja: la baja SUELTA el usuario, la ficha nueva con el mismo correo lo retoma y la identidad se resuelve a la
--    ficha ACTIVA. (Sin el trigger de baja la ficha borrada conservaba el usuario y get_my_staff_id() devolvia la borrada: revision
--    del PR, Codex P1; la consulta del frontend con .maybeSingle() veia 2 filas.)
DO $$
DECLARE v_me uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (pg_temp.uid(10), 'b6u-baja@ruizmier.com');
  PERFORM pg_temp.mk_staff(7, NULL, 'b6u-baja@ruizmier.com');
  PERFORM pg_temp.must((SELECT auth_user_id = pg_temp.uid(10) FROM public.staff WHERE staff_id = pg_temp.sid(7)),
                       '9. link_staff_to_auth_user no enlazo la ficha nueva con un usuario ya existente');
  UPDATE public.staff SET deleted_at = now(), is_active = false WHERE staff_id = pg_temp.sid(7);
  PERFORM pg_temp.must((SELECT auth_user_id IS NULL FROM public.staff WHERE staff_id = pg_temp.sid(7)),
                       '9. la baja logica debia soltar el auth_user_id de la ficha borrada');
  PERFORM pg_temp.must(pg_temp.try('SELECT pg_temp.mk_staff(8, NULL, ''b6u-baja@ruizmier.com'')') = 'ok',
                       '9. el reingreso (ficha nueva con el correo de una borrada) fallo');
  PERFORM pg_temp.must((SELECT auth_user_id = pg_temp.uid(10) FROM public.staff WHERE staff_id = pg_temp.sid(8)),
                       '9. la ficha del reingreso no retomo el usuario');
  PERFORM pg_temp.must((SELECT count(*) = 1 FROM public.staff WHERE auth_user_id = pg_temp.uid(10)),
                       '9. el usuario debe tener UNA sola ficha (la consulta .eq(auth_user_id) + maybeSingle del frontend)');
  -- identidad como la ve la sesion de ese usuario; el claim se limpia al terminar
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(10), 'role', 'authenticated')::text, true);
  v_me := public.get_my_staff_id();
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.must(v_me = pg_temp.sid(8), '9. get_my_staff_id() debia devolver la ficha activa del reingreso, no la borrada (' || coalesce(v_me::text, 'NULL') || ')');
  RAISE NOTICE 'PASS — 9. reingreso: la baja suelta el usuario, la ficha nueva lo retoma y get_my_staff_id() da la ficha activa';
END $$;

-- 10. Una ficha borrada no vuelve a ser activa (trigger DELETED_AT_IMMUTABLE, ya existente): el enlace soltado en la baja nunca hay que
--     recuperarlo. Y el usuario liberado puede tomarlo otra ficha.
DO $$
DECLARE v_res text;
BEGIN
  INSERT INTO auth.users (id) VALUES (pg_temp.uid(11));
  PERFORM pg_temp.mk_staff(9, pg_temp.uid(11));
  UPDATE public.staff SET deleted_at = now(), is_active = false WHERE staff_id = pg_temp.sid(9);
  PERFORM pg_temp.must((SELECT auth_user_id IS NULL FROM public.staff WHERE staff_id = pg_temp.sid(9)), '10. la baja no solto el usuario');
  PERFORM pg_temp.must(pg_temp.try(format('SELECT pg_temp.mk_staff(10, %L)', pg_temp.uid(11))) = 'ok',
                       '10. un usuario cuya ficha fue dada de baja deberia poder enlazarse a otra ficha');
  v_res := pg_temp.try(format('UPDATE public.staff SET deleted_at = NULL WHERE staff_id = %L', pg_temp.sid(9)));
  PERFORM pg_temp.must(v_res <> 'ok', '10. restaurar una ficha borrada deberia estar prohibido o rechazado (' || v_res || ')');
  PERFORM pg_temp.must((SELECT deleted_at IS NOT NULL FROM public.staff WHERE staff_id = pg_temp.sid(9)), '10. la ficha quedo restaurada');
  PERFORM pg_temp.must((SELECT count(*) = 1 FROM public.staff WHERE auth_user_id = pg_temp.uid(11)), '10. el usuario debe tener exactamente una ficha');
  RAISE NOTICE 'PASS — 10. la baja libera el usuario; una ficha borrada no se puede restaurar (%)', split_part(v_res, ':', 1);
END $$;

-- 11. Tampoco una ficha YA borrada puede volver a tomar un usuario que tiene otra ficha (el indice no excluye borradas)
DO $$
BEGIN
  PERFORM pg_temp.must(pg_temp.try(format('UPDATE public.staff SET auth_user_id = %L WHERE staff_id = %L', pg_temp.uid(11), pg_temp.sid(9)))
                       = '23505:idx_staff_auth_user_id_unique', '11. una ficha borrada no deberia poder tomar el usuario de otra ficha (23505)');
  RAISE NOTICE 'PASS — 11. una ficha borrada tampoco puede duplicar el usuario de otra: 23505';
END $$;

-- 12. La baja suelta el usuario aunque el UPDATE cambie otras columnas, y una baja sobre una ficha sin usuario no falla
DO $$
BEGIN
  INSERT INTO auth.users (id) VALUES (pg_temp.uid(12));
  PERFORM pg_temp.mk_staff(11, pg_temp.uid(12));
  PERFORM pg_temp.mk_staff(12, NULL);
  PERFORM pg_temp.must(pg_temp.try(format('UPDATE public.staff SET deleted_at = now(), is_active = false, city = %L, termination_date = current_date WHERE staff_id = %L',
                                          'La Paz', pg_temp.sid(11))) = 'ok', '12. la baja con varias columnas fallo');
  PERFORM pg_temp.must((SELECT auth_user_id IS NULL AND city = 'La Paz' FROM public.staff WHERE staff_id = pg_temp.sid(11)),
                       '12. la baja con varias columnas no solto el usuario o perdio el otro cambio');
  PERFORM pg_temp.must(pg_temp.try(format('UPDATE public.staff SET deleted_at = now(), is_active = false WHERE staff_id = %L', pg_temp.sid(12))) = 'ok',
                       '12. la baja de una ficha sin usuario fallo');
  RAISE NOTICE 'PASS — 12. la baja suelta el usuario con otros cambios en el mismo UPDATE, y una ficha sin usuario se da de baja sin problema';
END $$;

-- 13. Invariante global: ningun auth_user_id repetido en NINGUNA ficha, borrada o no
DO $$
BEGIN
  PERFORM pg_temp.must(NOT EXISTS (SELECT 1 FROM public.staff WHERE auth_user_id IS NOT NULL
                                    GROUP BY auth_user_id HAVING count(*) > 1), '13. hay un auth_user_id repetido entre fichas');
  PERFORM pg_temp.must(NOT EXISTS (SELECT 1 FROM public.staff WHERE deleted_at IS NOT NULL AND auth_user_id IS NOT NULL),
                       '13. hay una ficha borrada que conserva su auth_user_id');
  RAISE NOTICE 'PASS — 13. ningun auth_user_id repetido y ninguna ficha borrada con usuario';
END $$;

DO $$ BEGIN RAISE NOTICE 'B6 STAFF UNIQUE: ALL CHECKS PASSED (rolled back)'; END $$;

ROLLBACK;

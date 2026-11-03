-- BUG 0923-198 — engagements_guard_start_date_floor() / trg_engagements_guard_start_date_floor
-- (bugs/0923-198/plan_v2.md + decisión del operador: el piso también se hace cumplir en backend).
--
-- Regla: un editor que no es admin no puede CAMBIAR la fecha de inicio de un encargo de cliente a un día
-- anterior a la creación del encargo, ni darlo de alta con inicio anterior a hoy. Una fecha histórica que fijó
-- un admin y que no cambia no bloquea: el editor guarda el resto del encargo. Admin, internos y el sistema sin
-- sesión quedan fuera. Review fix (Codex): como la exención de internos se apoya en is_internal, clasificar un
-- encargo de Cliente como interno (o desmarcarlo) queda solo para el admin.
--
-- DÓNDE CORRE: supabase/tests/local/run-rls-tests.sh. Transacción única, SIEMPRE hace ROLLBACK. Corre como
-- dueño (el trigger no depende de RLS); la identidad se simula con request.jwt.claims. Salida de éxito: una
-- NOTICE por chequeo, terminando en "START DATE FLOOR 0923-198: ALL CHECKS PASSED (rolled back)".
--
-- Fixture: ids con prefijo 0923198. Encargo creado el 10/09/2026 (hora de Bolivia) con inicio histórico 02/09.

BEGIN;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('60923198-0000-4000-8000-000000000001', 'Cliente 0923-198', 'NIT-0923198');

INSERT INTO auth.users (id) VALUES
  ('a0923198-0000-4000-8000-000000000001'),  -- manager (editor restringido)
  ('a0923198-0000-4000-8000-000000000002');  -- admin

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id) VALUES
  ('50923198-0000-4000-8000-000000000001', 'a0923198-0000-4000-8000-000000000001', 'SD', 'Manager0923198',
   (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('50923198-0000-4000-8000-000000000002', 'a0923198-0000-4000-8000-000000000002', 'SD', 'Admin0923198',
   (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('a0923198-0000-4000-8000-000000000001', 'manager'),
  ('a0923198-0000-4000-8000-000000000002', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

-- E1 de cliente con inicio histórico (lo fijó un admin). E2 interno con la misma fecha. Ambos se insertan sin
-- sesión (dueño), que el trigger deja pasar. created_at 15:00 UTC = 11:00 del 10/09 en La Paz. Fin en el
-- futuro para que recompute_engagement_finalization() no los pase a Finalizado.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, status,
                                work_order_required, is_internal, start_date, end_date, fecha_cierre,
                                society_id, created_at) VALUES
  ('70923198-0000-4000-8000-000000000001', '60923198-0000-4000-8000-000000000001', 'Cliente 0923198', 'SD-01', 'active',
   true, false, '2026-09-02', '2099-12-31', '2026-12-31',
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), '2026-09-10 15:00:00+00'),
  ('70923198-0000-4000-8000-000000000002', '60923198-0000-4000-8000-000000000001', 'Interno 0923198', 'SD-02', 'active',
   false, true, '2026-09-02', '2099-12-31', '2026-12-31',
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), '2026-09-10 15:00:00+00');

CREATE FUNCTION pg_temp.as_user(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    CASE WHEN p_sub IS NULL THEN '' ELSE json_build_object('sub', p_sub, 'role', 'authenticated')::text END,
                    true)
$$;

-- Actualiza nombre e inicio; devuelve NULL si entró o el mensaje de error si un trigger lo rechazó.
CREATE FUNCTION pg_temp.try_update(p_engagement uuid, p_start date, p_name text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.engagements SET start_date = p_start, engagement_name = p_name WHERE engagement_id = p_engagement;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- Cambia is_internal (y opcionalmente el inicio) en un solo UPDATE; devuelve NULL o el mensaje de error.
CREATE FUNCTION pg_temp.try_set_internal(p_engagement uuid, p_internal boolean, p_start date) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.engagements SET is_internal = p_internal, start_date = COALESCE(p_start, start_date)
   WHERE engagement_id = p_engagement;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- Intenta un alta directa; devuelve NULL o el mensaje de error.
CREATE FUNCTION pg_temp.try_insert(p_id uuid, p_start date, p_internal boolean) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, status,
                                  work_order_required, is_internal, start_date, end_date, fecha_cierre, society_id)
  VALUES (p_id, '60923198-0000-4000-8000-000000000001', 'Alta 0923198 ' || p_id, 'SD-' || right(p_id::text, 4), 'active',
          NOT p_internal, p_internal, p_start, '2099-12-31', '2026-12-31',
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

DO $$
DECLARE
  c_e1 constant uuid := '70923198-0000-4000-8000-000000000001';
  c_e2 constant uuid := '70923198-0000-4000-8000-000000000002';
  c_manager constant text := 'a0923198-0000-4000-8000-000000000001';
  c_admin constant text := 'a0923198-0000-4000-8000-000000000002';
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
  v_err text;
  v_start date;
BEGIN
  -- 1. El caso del bug: el editor cambia solo el nombre; el inicio histórico viaja igual en el UPDATE.
  PERFORM pg_temp.as_user(c_manager);
  v_err := pg_temp.try_update(c_e1, '2026-09-02', 'Cliente 0923198 renombrado');
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (1): el editor no pudo guardar con la fecha histórica sin cambios: %', v_err;
  END IF;
  RAISE NOTICE 'OK (1): editor no-admin guarda otros campos con la fecha histórica sin cambios';

  -- 2. Cambiar el inicio a un día anterior a la histórica: rechazado.
  v_err := pg_temp.try_update(c_e1, '2026-08-25', 'x');
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_START_DATE_FLOOR%' THEN
    RAISE EXCEPTION 'FAIL (2): mover el inicio antes de la histórica debía fallar con ENGAGEMENT_START_DATE_FLOOR, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (2): editor no-admin no puede retroceder la fecha';

  -- 3. Cambiarlo a un día posterior a la histórica pero aún anterior a la creación: rechazado.
  v_err := pg_temp.try_update(c_e1, '2026-09-09', 'x');
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_START_DATE_FLOOR%' THEN
    RAISE EXCEPTION 'FAIL (3): un inicio anterior a la creación debía fallar con ENGAGEMENT_START_DATE_FLOOR, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (3): editor no-admin no puede cambiarla a otro día anterior a la creación';

  -- 4. Cambiarlo al día de la creación (en hora de Bolivia): entra.
  v_err := pg_temp.try_update(c_e1, '2026-09-10', 'x');
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (4): inicio = día de creación debía entrar: %', v_err;
  END IF;
  RAISE NOTICE 'OK (4): editor no-admin puede mover el inicio al día de la creación';

  -- 5. Admin: puede fijar cualquier fecha histórica, como hoy.
  PERFORM pg_temp.as_user(c_admin);
  v_err := pg_temp.try_update(c_e1, '2026-08-01', 'x');
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (5): el admin debía poder fijar una fecha anterior a la creación: %', v_err;
  END IF;
  SELECT start_date INTO v_start FROM public.engagements WHERE engagement_id = c_e1;
  IF v_start <> '2026-08-01' THEN
    RAISE EXCEPTION 'FAIL (5): el inicio quedó en % en vez de 2026-08-01', v_start;
  END IF;
  RAISE NOTICE 'OK (5): admin fija una fecha anterior a la creación';

  -- 6. Después del admin, el editor vuelve a guardar otros campos sin tocar esa fecha.
  PERFORM pg_temp.as_user(c_manager);
  v_err := pg_temp.try_update(c_e1, '2026-08-01', 'Cliente 0923198 otra vez');
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (6): el editor no pudo guardar tras el cambio del admin: %', v_err;
  END IF;
  RAISE NOTICE 'OK (6): editor no-admin sigue editando tras el cambio histórico del admin';

  -- 7. Interno: sin piso, también para el editor.
  v_err := pg_temp.try_update(c_e2, '2026-07-01', 'x');
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (7): un encargo interno no tiene piso de fecha: %', v_err;
  END IF;
  RAISE NOTICE 'OK (7): encargo interno sin piso';

  -- 8. Alta de cliente por el editor con inicio anterior a hoy: rechazada por este trigger.
  v_err := pg_temp.try_insert('70923198-0000-4000-8000-000000000011', v_today - 1, false);
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_START_DATE_FLOOR%' THEN
    RAISE EXCEPTION 'FAIL (8): alta no-admin con inicio pasado debía fallar con ENGAGEMENT_START_DATE_FLOOR, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (8): alta no-admin con inicio anterior a hoy rechazada';

  -- 9. Alta de cliente por el editor con inicio hoy: este trigger no la rechaza (otros guards pueden).
  v_err := pg_temp.try_insert('70923198-0000-4000-8000-000000000012', v_today, false);
  IF v_err LIKE 'ENGAGEMENT_START_DATE_FLOOR%' THEN
    RAISE EXCEPTION 'FAIL (9): alta no-admin con inicio hoy no debía chocar con el piso: %', v_err;
  END IF;
  RAISE NOTICE 'OK (9): alta no-admin con inicio hoy pasa el piso';

  -- 10. Alta de cliente por el admin con inicio pasado: el piso no aplica.
  PERFORM pg_temp.as_user(c_admin);
  v_err := pg_temp.try_insert('70923198-0000-4000-8000-000000000013', '2026-01-01', false);
  IF v_err LIKE 'ENGAGEMENT_START_DATE_FLOOR%' THEN
    RAISE EXCEPTION 'FAIL (10): el admin no tiene piso en el alta: %', v_err;
  END IF;
  RAISE NOTICE 'OK (10): admin sin piso en el alta';

  -- 11. Sin sesión (cron, service_role, seeds): sin piso.
  PERFORM pg_temp.as_user(NULL);
  v_err := pg_temp.try_update(c_e1, '2026-01-15', 'x');
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (11): sin auth.uid() no debía haber piso: %', v_err;
  END IF;
  RAISE NOTICE 'OK (11): sistema sin sesión sin piso';

  -- 12. Review fix (Codex): el editor no puede marcar un encargo de Cliente como interno.
  PERFORM pg_temp.as_user(c_manager);
  v_err := pg_temp.try_set_internal(c_e1, true, NULL);
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_INTERNAL_ADMIN_ONLY%' THEN
    RAISE EXCEPTION 'FAIL (12): marcar un Cliente como interno debía fallar con ENGAGEMENT_INTERNAL_ADMIN_ONLY, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (12): editor no-admin no puede marcar un Cliente como interno';

  -- 13. El bypass del review: marcar interno y mover la fecha antes de la creación en el mismo UPDATE.
  v_err := pg_temp.try_set_internal(c_e1, true, '2026-08-01');
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_INTERNAL_ADMIN_ONLY%' THEN
    RAISE EXCEPTION 'FAIL (13): interno + fecha histórica en un UPDATE debía fallar, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (13): no se puede saltar el piso marcando el encargo como interno';

  -- 14. Tampoco puede desmarcar uno que el admin dejó interno (E2, funcion NULL = Cliente).
  v_err := pg_temp.try_set_internal(c_e2, false, NULL);
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_INTERNAL_ADMIN_ONLY%' THEN
    RAISE EXCEPTION 'FAIL (14): desmarcar un interno debía fallar con ENGAGEMENT_INTERNAL_ADMIN_ONLY, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (14): editor no-admin no puede desmarcar un interno';

  -- 15. Alta de Cliente como interno por el editor (con fecha pasada): rechazada por la clasificación.
  v_err := pg_temp.try_insert('70923198-0000-4000-8000-000000000014', '2026-01-01', true);
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_INTERNAL_ADMIN_ONLY%' THEN
    RAISE EXCEPTION 'FAIL (15): alta no-admin de Cliente interno debía fallar con ENGAGEMENT_INTERNAL_ADMIN_ONLY, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (15): alta no-admin de Cliente interno rechazada';

  -- 16. El admin sí clasifica un Cliente como interno.
  PERFORM pg_temp.as_user(c_admin);
  v_err := pg_temp.try_set_internal(c_e1, true, NULL);
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (16): el admin debía poder marcar el Cliente como interno: %', v_err;
  END IF;
  RAISE NOTICE 'OK (16): admin clasifica un Cliente como interno';

  RAISE NOTICE 'START DATE FLOOR 0923-198: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;

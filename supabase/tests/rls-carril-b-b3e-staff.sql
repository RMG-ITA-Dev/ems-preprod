-- Carril B / B3e y B3e-2 — RLS en public.staff y firma del socio en work_orders
-- (20261013120000_rls_carril_b3e_staff.sql y 20261013130000_rls_carril_b3e2_firma_ot.sql)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de B3d. Transacción única, SIEMPRE hace ROLLBACK.
-- Salida de éxito: una NOTICE por chequeo, terminando en "B3e STAFF Y FIRMA DE OT: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba ES la RLS y el trigger: todo corre con `SET LOCAL ROLE authenticated` real más el claim JWT del
-- usuario, y los helpers LIMPIAN el claim al terminar (el trigger de firma mira auth.uid(): un claim olvidado haría
-- que las escrituras del dueño entre intentos se evaluaran como ese usuario).
--
-- Fixture world (ids con prefijo b3e): A admin, M gerente del encargo, P socio del encargo, S asistente, Q gerente
--   que es SQR del encargo (cierra la pista de Riesgos), X gerente sin relación. Ficha sin enlazar (U).
--   E1 encargo de cliente (M gerente, P socio, Q sqr) con OT1; E2 encargo administrativo (funcion 0) con OT2.

BEGIN;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1b3e000-0000-4000-8000-000000000001', 'B3e Cliente', 'B3E-TAX-001');

INSERT INTO auth.users (id) VALUES
  ('a0b3e000-0000-4000-8000-000000000001'), ('a0b3e000-0000-4000-8000-000000000002'), ('a0b3e000-0000-4000-8000-000000000003'),
  ('a0b3e000-0000-4000-8000-000000000004'), ('a0b3e000-0000-4000-8000-000000000005'), ('a0b3e000-0000-4000-8000-000000000006');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b3e000-0000-4000-8000-000000000001', 'admin',   'admin'),
  ('a0b3e000-0000-4000-8000-000000000002', 'manager', 'manager'),
  ('a0b3e000-0000-4000-8000-000000000003', 'partner', 'partner'),
  ('a0b3e000-0000-4000-8000-000000000004', 'staff',   'assistant'),
  ('a0b3e000-0000-4000-8000-000000000005', 'manager', 'manager'),
  ('a0b3e000-0000-4000-8000-000000000006', 'manager', 'manager')
-- handle_new_user puede haber creado ya la fila del usuario (según el ambiente): se pisa con el rol del fixture.
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, role_key = EXCLUDED.role_key;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
SELECT ('50b3e000-0000-4000-8000-00000000000' || n)::uuid, ('a0b3e000-0000-4000-8000-00000000000' || n)::uuid,
       'U' || n, 'B3e',
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1)
FROM (VALUES ('1'), ('2'), ('3'), ('4'), ('5'), ('6')) AS v(n);

-- Ficha sin enlazar y sin email (no dispara el enlace por correo): el blanco del auto-enlace y del DELETE.
INSERT INTO public.staff (staff_id, first_name, last_name, practica_id, society_id)
VALUES ('50b3e000-0000-4000-8000-000000000009', 'U9', 'B3e',
        (SELECT practica_id FROM public.practicas WHERE code = 1),
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

SET LOCAL session_replication_role = replica;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, funcion, practica, fecha_cierre,
                                work_order_required, approval_required, society_id, manager_id, partner_id, sqr_id)
SELECT ('e0b3e000-0000-4000-8000-00000000000' || n)::uuid, 'c1b3e000-0000-4000-8000-000000000001', 'B3e ' || n, f, 1, '2027-12-31',
       false, false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
       '50b3e000-0000-4000-8000-000000000002', '50b3e000-0000-4000-8000-000000000003', sq
FROM (VALUES ('1', 1, '50b3e000-0000-4000-8000-000000000005'::uuid),   -- E1 (cliente; Q es SQR)
             ('2', 0, NULL::uuid),                                     -- E2 (administrativo)
             ('3', 1, NULL::uuid),                                     -- E3 (cliente, sin OT: blanco de los INSERT)
             ('4', 1, NULL::uuid))                                     -- E4 (cliente, OT firmada con Riesgos pendiente)
     AS v(n, f, sq);
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40b3e000-0000-4000-8000-000000000001', 'e0b3e000-0000-4000-8000-000000000001', 'BOB', 'High', 'Pending_Approval'),
  ('40b3e000-0000-4000-8000-000000000002', 'e0b3e000-0000-4000-8000-000000000002', 'BOB', 'High', 'Pending_Approval');
-- OT4: el socio ya firmó y la pista de Riesgos sigue pendiente (risk_status por defecto): todavía NO puede cerrarse.
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status, approved_by, approved_at) VALUES
  ('40b3e000-0000-4000-8000-000000000004', 'e0b3e000-0000-4000-8000-000000000004', 'BOB', 'High', 'Pending_Approval',
   '50b3e000-0000-4000-8000-000000000003', now());
SET LOCAL session_replication_role = origin;

-- Intento como `authenticated`: devuelve las filas alcanzadas o 'ERR <sqlstate>'. Los cambios que prosperan se conservan
-- (dentro de la transacción) y el claim se limpia siempre.
CREATE FUNCTION pg_temp.try_as(p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'ERR ' || SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n::text;
END $$;

CREATE FUNCTION pg_temp.count_as(p_sub text, p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql INTO n;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n;
END $$;

DO $$
DECLARE
  a  constant text := 'a0b3e000-0000-4000-8000-000000000001';  -- admin
  m  constant text := 'a0b3e000-0000-4000-8000-000000000002';  -- gerente del encargo
  p  constant text := 'a0b3e000-0000-4000-8000-000000000003';  -- socio del encargo
  s  constant text := 'a0b3e000-0000-4000-8000-000000000004';  -- asistente
  q  constant text := 'a0b3e000-0000-4000-8000-000000000005';  -- SQR del encargo
  x  constant text := 'a0b3e000-0000-4000-8000-000000000006';  -- gerente sin relación
  wo1 constant uuid := '40b3e000-0000-4000-8000-000000000001';
  wo2 constant uuid := '40b3e000-0000-4000-8000-000000000002';
  u9  constant uuid := '50b3e000-0000-4000-8000-000000000009';
  v_total bigint; v_who text; v_r text; v_st text; v_me uuid; v_wo3 uuid;
BEGIN
  -- 0. Premisas de los permisos (si cambian, la suite pierde sentido: que falle aquí y no en silencio) ───────────────
  IF NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'admin' AND permission_key = 'staff.update')
     OR NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'admin' AND permission_key = 'staff.create')
     OR NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'admin' AND permission_key = 'staff.delete')
     OR EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key IN ('manager', 'assistant') AND permission_key IN ('staff.update', 'staff.create', 'staff.delete'))
     OR NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'partner' AND permission_key = 'work_order.submit')
     OR EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'manager' AND permission_key = 'work_order.submit') THEN
    RAISE EXCEPTION 'B3e FAIL — premisa de permisos: admin con staff.*, partner con work_order.submit, manager sin ninguno de los dos';
  END IF;
  RAISE NOTICE 'PASS — premisas de permisos (staff.* solo admin; work_order.submit para partner y no para manager)';

  -- 1. Estructura de staff ────────────────────────────────────────────────────────────────────────────────────────
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staff'::regclass) THEN
    RAISE EXCEPTION 'B3e FAIL — staff sin RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff'
              AND policyname = 'Users can update their linked staff record') THEN
    RAISE EXCEPTION 'B3e FAIL — sigue la política de "mi propia fila" en staff';
  END IF;
  FOREACH v_st IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff' AND cmd = v_st) THEN
      RAISE EXCEPTION 'B3e FAIL — staff sin política de %', v_st;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — staff: RLS activo, sin la política de mi propia fila, con políticas de SELECT/INSERT/UPDATE/DELETE';

  -- 2. Lectura: no cambia, todos ven todas las fichas (y el directorio) ──────────────────────────────────────────
  SELECT count(*) INTO v_total FROM public.staff;
  FOREACH v_who IN ARRAY ARRAY[a, m, p, s, q, x] LOOP
    IF pg_temp.count_as(v_who, 'SELECT count(*) FROM public.staff') <> v_total THEN
      RAISE EXCEPTION 'B3e FAIL — % debía leer las % fichas y lee %', v_who, v_total, pg_temp.count_as(v_who, 'SELECT count(*) FROM public.staff');
    END IF;
    IF pg_temp.count_as(v_who, 'SELECT count(*) FROM public.staff_directory') <> (SELECT count(*) FROM public.staff WHERE deleted_at IS NULL) THEN
      RAISE EXCEPTION 'B3e FAIL — % debía leer el directorio completo', v_who;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — lectura: los 6 roles leen las % fichas y el directorio, como antes de B3e', v_total;

  -- 3. Escritura: solo quien tiene staff.* ─────────────────────────────────────────────────────────────────────────
  FOREACH v_who IN ARRAY ARRAY[m, p, s, q, x] LOOP
    IF pg_temp.try_as(v_who, 'UPDATE public.staff SET first_name = first_name') <> '0' THEN
      RAISE EXCEPTION 'B3e FAIL — % alcanzó fichas con un UPDATE (propias o ajenas)', v_who;
    END IF;
    IF pg_temp.try_as(v_who, format('UPDATE public.staff SET society_id = society_id, category_id = category_id, is_active = is_active WHERE auth_user_id = %L', v_who)) <> '0' THEN
      RAISE EXCEPTION 'B3e FAIL — % modificó su propia ficha', v_who;
    END IF;
    IF pg_temp.try_as(v_who, format('DELETE FROM public.staff WHERE staff_id = %L', u9)) <> '0' THEN
      RAISE EXCEPTION 'B3e FAIL — % borró una ficha', v_who;
    END IF;
    IF pg_temp.try_as(v_who, 'INSERT INTO public.staff (first_name, last_name, society_id, practica_id) SELECT ''zz'', ''zz'', society_id, practica_id FROM public.staff LIMIT 1') <> 'ERR 42501' THEN
      RAISE EXCEPTION 'B3e FAIL — % pudo insertar una ficha (esperado 42501)', v_who;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — escritura: gerente, socio, asistente, SQR y gerente ajeno no actualizan, no borran y no insertan fichas';

  -- 4. Identidad: ni auto-enlace por UPDATE ni secuestro de la ficha de otro ───────────────────────────────────────
  IF pg_temp.try_as(s, format('UPDATE public.staff SET auth_user_id = %L WHERE staff_id = %L AND auth_user_id IS NULL', s, u9)) <> '0' THEN
    RAISE EXCEPTION 'B3e FAIL — el asistente se enlazó a una ficha sin enlazar (reclamo de identidad)';
  END IF;
  IF pg_temp.try_as(s, format('UPDATE public.staff SET auth_user_id = NULL WHERE auth_user_id = %L', s)) <> '0'
     OR pg_temp.try_as(s, format('UPDATE public.staff SET auth_user_id = %L WHERE staff_id = %L', s, '50b3e000-0000-4000-8000-000000000003')) <> '0' THEN
    RAISE EXCEPTION 'B3e FAIL — el asistente soltó su ficha o tomó la del socio';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.get_my_staff_id() INTO v_me;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_me IS DISTINCT FROM '50b3e000-0000-4000-8000-000000000004'::uuid THEN
    RAISE EXCEPTION 'B3e FAIL — get_my_staff_id() del asistente devolvió otra ficha (%)', v_me;
  END IF;
  RAISE NOTICE 'PASS — identidad: sin auto-enlace, sin secuestro; get_my_staff_id() sigue siendo la propia';

  -- 5. Control positivo y no-vacuidad: la escritura sale del permiso staff.* ──────────────────────────────────────
  IF pg_temp.try_as(a, 'UPDATE public.staff SET first_name = first_name') <> (SELECT count(*)::text FROM public.staff)
     OR pg_temp.try_as(a, 'INSERT INTO public.staff (first_name, last_name, society_id, practica_id) SELECT ''zz'', ''zz'', society_id, practica_id FROM public.staff LIMIT 1') <> '1'
     OR pg_temp.try_as(a, format('DELETE FROM public.staff WHERE staff_id = %L', u9)) <> '1' THEN
    RAISE EXCEPTION 'B3e FAIL — admin debía actualizar todas las fichas, insertar y borrar (control positivo)';
  END IF;
  INSERT INTO public.staff (staff_id, first_name, last_name, practica_id, society_id)
  VALUES (u9, 'U9', 'B3e', (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1));
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key) VALUES ('manager', 'staff.update', 'none');
  IF pg_temp.try_as(m, 'UPDATE public.staff SET first_name = first_name') = '0' THEN
    RAISE EXCEPTION 'B3e FAIL — con staff.update el gerente debía poder actualizar fichas (la escritura sale del permiso)';
  END IF;
  DELETE FROM public.authorization_role_permissions WHERE role_key = 'manager' AND permission_key = 'staff.update';
  IF pg_temp.try_as(m, 'UPDATE public.staff SET first_name = first_name') <> '0' THEN
    RAISE EXCEPTION 'B3e FAIL — al quitar staff.update el gerente debía perder la escritura';
  END IF;
  RAISE NOTICE 'PASS — admin escribe (control); la escritura sale del permiso staff.update (no-vacuidad)';

  -- 6. Trigger de firma: estructura y privilegios ─────────────────────────────────────────────────────────────────
  -- BEFORE (bit 2), INSERT (bit 4) y UPDATE (bit 16); y DESPUÉS del trigger administrativo en el orden de disparo
  -- (alfabético, byte a byte): si corriera antes, un UPDATE que solo cambia el estado a Draft borraría la firma sin que la
  -- guarda lo viera (la limpia enforce_administrative_work_order_rules).
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.work_orders'::regclass AND tgname = 'trg_wo_partner_signature_guard'
                  AND NOT tgisinternal AND (tgtype & 2) = 2 AND (tgtype & 4) = 4 AND (tgtype & 16) = 16) THEN
    RAISE EXCEPTION 'B3e-2 FAIL — falta trg_wo_partner_signature_guard (BEFORE INSERT OR UPDATE) en work_orders';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.work_orders'::regclass AND tgname = 'tr_wo_guard_partner_signature') THEN
    RAISE EXCEPTION 'B3e-2 FAIL — sigue el trigger con el nombre anterior (solo UPDATE)';
  END IF;
  IF NOT ('trg_wo_partner_signature_guard' COLLATE "C" > 'trg_enforce_administrative_work_order_rules' COLLATE "C") THEN
    RAISE EXCEPTION 'B3e-2 FAIL — la guarda de firma debe dispararse después de enforce_administrative_work_order_rules';
  END IF;
  IF has_function_privilege('anon', 'public.wo_guard_partner_signature()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.wo_guard_partner_signature()', 'EXECUTE')
     OR has_function_privilege('public', 'public.wo_guard_partner_signature()', 'EXECUTE') THEN
    RAISE EXCEPTION 'B3e-2 FAIL — wo_guard_partner_signature es ejecutable por anon, authenticated o PUBLIC';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.wo_guard_partner_signature()'::regprocedure
                  AND prosecdef AND 'search_path=public, pg_temp' = ANY (proconfig)) THEN
    RAISE EXCEPTION 'B3e-2 FAIL — wo_guard_partner_signature debe ser SECURITY DEFINER con search_path fijo';
  END IF;
  RAISE NOTICE 'PASS — trigger de firma presente, DEFINER con search_path fijo y sin EXECUTE para roles de API';

  -- 7. El gerente y los demás NO firman por el socio ───────────────────────────────────────────────────────────────
  FOREACH v_who IN ARRAY ARRAY[m, q] LOOP
    IF pg_temp.try_as(v_who, format('UPDATE public.work_orders SET approved_by = %L, approved_at = now() WHERE wo_id = %L', '50b3e000-0000-4000-8000-000000000002', wo1)) <> 'ERR 42501' THEN
      RAISE EXCEPTION 'B3e-2 FAIL — % fijó la firma del socio por UPDATE directo', v_who;
    END IF;
    IF pg_temp.try_as(v_who, format('UPDATE public.work_orders SET approval_status = ''Approved'' WHERE wo_id = %L', wo1)) <> 'ERR 42501' THEN
      RAISE EXCEPTION 'B3e-2 FAIL — % cerró una OT como Aprobada sin la firma del socio', v_who;
    END IF;
  END LOOP;
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET approved_by = %L, approved_at = now() WHERE wo_id = %L', '50b3e000-0000-4000-8000-000000000002', wo2)) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente firmó una OT administrativa';
  END IF;
  -- Lo demás de la OT sigue editable por el gerente (la guarda solo cubre la firma).
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET notes = ''x'' WHERE wo_id = %L', wo1)) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente debía seguir editando las notas de la OT';
  END IF;
  -- Un UPDATE que no cambia la firma (reenvío del formulario) no cae en la guarda.
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET approved_by = approved_by, approved_at = approved_at WHERE wo_id = %L', wo1)) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — un UPDATE que no cambia la firma debía pasar';
  END IF;
  RAISE NOTICE 'PASS — gerente y SQR no firman ni cierran sin firma; el gerente sigue editando lo demás';

  -- 8. El socio firma, Riesgos cierra, el socio retira ─────────────────────────────────────────────────────────────
  IF pg_temp.try_as(p, format('UPDATE public.work_orders SET approved_by = %L, approved_at = now(), notes = NULL WHERE wo_id = %L', '50b3e000-0000-4000-8000-000000000003', wo1)) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el socio del encargo debía poder firmar';
  END IF;
  -- useApproveRisk: primero Riesgos aprueba su pista (se escribe como dueño y con triggers en réplica: lo que se prueba es el
  -- cierre) y después el aprobador (aquí el SQR) cierra con filtro approved_at no nulo.
  EXECUTE 'SET LOCAL session_replication_role = replica';
  UPDATE public.work_orders SET risk_status = 'Approved' WHERE wo_id = wo1;
  EXECUTE 'SET LOCAL session_replication_role = origin';
  IF pg_temp.try_as(q, format('UPDATE public.work_orders SET approval_status = ''Approved'' WHERE wo_id = %L AND approved_at IS NOT NULL', wo1)) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — Riesgos debía poder cerrar la OT ya firmada por el socio';
  END IF;
  IF (SELECT approval_status FROM public.work_orders WHERE wo_id = wo1) <> 'Approved' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — la OT debía quedar Aprobada';
  END IF;
  -- Revisión del PR (Codex): la firma es un invariante de «Aprobada». Limpiar la firma dejando la OT Aprobada (o cambiarla por
  -- otra firma incompleta) rompe ese estado aunque quien lo haga sea un socio autorizado: el retiro baja el estado en la
  -- MISMA sentencia (la pantalla lo hace así para el rol admin, que queda fuera de la guarda).
  v_r := pg_temp.try_as(p, format('UPDATE public.work_orders SET approved_by = NULL, approved_at = NULL WHERE wo_id = %L', wo1));
  IF v_r <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el socio dejó la OT Aprobada sin firma (resultado %)', v_r;
  END IF;
  IF (SELECT approved_at FROM public.work_orders WHERE wo_id = wo1) IS NULL THEN
    RAISE EXCEPTION 'B3e-2 FAIL — la OT Aprobada debía conservar su firma tras el intento';
  END IF;
  -- Retiro de la firma por el socio y reapertura, atómicos.
  v_r := pg_temp.try_as(p, format('UPDATE public.work_orders SET approved_by = NULL, approved_at = NULL, approval_status = ''Pending_Approval'' WHERE wo_id = %L', wo1));
  IF v_r <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el socio debía poder retirar su firma y reabrir la OT en una sola sentencia (resultado %)', v_r;
  END IF;
  IF (SELECT approved_at FROM public.work_orders WHERE wo_id = wo1) IS NOT NULL
     OR (SELECT approval_status FROM public.work_orders WHERE wo_id = wo1) <> 'Pending_Approval' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el retiro debía dejar la OT en Pending_Approval y sin firma';
  END IF;
  -- Y el gerente no puede retirarla (clear = cambio de la firma).
  PERFORM pg_temp.try_as(p, format('UPDATE public.work_orders SET approved_by = %L, approved_at = now() WHERE wo_id = %L', '50b3e000-0000-4000-8000-000000000003', wo1));
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET approved_by = NULL, approved_at = NULL WHERE wo_id = %L', wo1)) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente retiró la firma del socio';
  END IF;
  RAISE NOTICE 'PASS — el socio firma y retira; Riesgos cierra con la firma ya puesta; el gerente no la retira';

  -- 9. OT administrativa: la firma del socio cierra la OT (lo hace enforce_administrative_work_order_rules después) ──
  IF pg_temp.try_as(p, format('UPDATE public.work_orders SET approved_by = %L, approved_at = now() WHERE wo_id = %L', '50b3e000-0000-4000-8000-000000000003', wo2)) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el socio debía poder firmar la OT administrativa';
  END IF;
  IF (SELECT approval_status FROM public.work_orders WHERE wo_id = wo2) <> 'Approved' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — la firma del socio debía cerrar la OT administrativa (quedó %)', (SELECT approval_status FROM public.work_orders WHERE wo_id = wo2);
  END IF;
  RAISE NOTICE 'PASS — OT administrativa: la firma del socio la cierra';

  -- 9b. Revisión del PR (Greptile): el gerente no borra la firma de una OT administrativa por el ESTADO. Cambiar solo
  --     approval_status a Draft no toca approved_by/approved_at, pero enforce_administrative_work_order_rules las limpia
  --     DESPUÉS: la guarda tiene que mirar la fila ya normalizada (por eso su trigger corre al final).
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET approval_status = ''Draft'' WHERE wo_id = %L', wo2)) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente retiró a Draft una OT administrativa firmada (borró la firma del socio)';
  END IF;
  IF (SELECT approved_at FROM public.work_orders WHERE wo_id = wo2) IS NULL
     OR (SELECT approval_status FROM public.work_orders WHERE wo_id = wo2) <> 'Approved' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — la OT administrativa firmada debía conservar su firma y su estado tras el intento del gerente';
  END IF;
  -- El socio sí puede retirarla (y eso limpia su firma), y el gerente retira una OT administrativa SIN firma (flujo normal).
  v_r := pg_temp.try_as(p, format('UPDATE public.work_orders SET approval_status = ''Draft'' WHERE wo_id = %L', wo2));
  IF v_r <> '1' OR (SELECT approved_at FROM public.work_orders WHERE wo_id = wo2) IS NOT NULL THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el socio debía poder retirar la OT administrativa y limpiar su firma (resultado %, estado %, firma %)',
      v_r, (SELECT approval_status FROM public.work_orders WHERE wo_id = wo2), (SELECT approved_at IS NOT NULL FROM public.work_orders WHERE wo_id = wo2);
  END IF;
  UPDATE public.work_orders SET approval_status = 'Pending_Approval' WHERE wo_id = wo2;
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET approval_status = ''Draft'' WHERE wo_id = %L', wo2)) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente debía poder retirar una OT administrativa sin firma';
  END IF;
  RAISE NOTICE 'PASS — el gerente no borra la firma por el estado; el socio retira; el gerente retira una OT sin firma';

  -- 9c. Revisión del PR (Codex): el INSERT también pasa por la guarda. wo_create_by_permission deja crear la OT al gerente
  --     asignado y las tres columnas de firma tienen INSERT para authenticated: sin guarda en el INSERT, el gerente creaba
  --     la OT ya firmada y Aprobada.
  IF pg_temp.try_as(m, format('INSERT INTO public.work_orders (engagement_id, currency, season_mode, approval_status, approved_by, approved_at) VALUES (%L, ''BOB'', ''High'', ''Approved'', %L, now())', 'e0b3e000-0000-4000-8000-000000000003', '50b3e000-0000-4000-8000-000000000003')) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente creó una OT ya firmada y Aprobada por INSERT';
  END IF;
  IF pg_temp.try_as(m, format('INSERT INTO public.work_orders (engagement_id, currency, season_mode, approved_by, approved_at) VALUES (%L, ''BOB'', ''High'', %L, now())', 'e0b3e000-0000-4000-8000-000000000003', '50b3e000-0000-4000-8000-000000000003')) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente creó una OT con la firma del socio por INSERT';
  END IF;
  IF pg_temp.try_as(m, format('INSERT INTO public.work_orders (engagement_id, currency, season_mode, approval_status) VALUES (%L, ''BOB'', ''High'', ''Approved'')', 'e0b3e000-0000-4000-8000-000000000003')) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente creó una OT Aprobada sin firma por INSERT';
  END IF;
  -- La creación normal (Draft, sin firma) sigue funcionando.
  IF pg_temp.try_as(m, format('INSERT INTO public.work_orders (engagement_id, currency, season_mode, approval_status) VALUES (%L, ''BOB'', ''High'', ''Draft'')', 'e0b3e000-0000-4000-8000-000000000003')) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente debía poder crear una OT en Draft sin firma';
  END IF;
  RAISE NOTICE 'PASS — INSERT: el gerente no crea una OT firmada ni Aprobada; la creación en Draft sigue funcionando';

  -- 9d. Revisión del PR (Codex): «Aprobada» exige también la pista de Riesgos. Con la firma del socio puesta y Riesgos pendiente
  --     (o rechazado), cerrar la OT a mano saltaría el visto bueno de Riesgos, y check_wo_approved, el selector de
  --     solicitudes de fondos y otras funciones tratan «Aprobada» como utilizable. Excepción: las OT administrativas.
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET approval_status = ''Approved'' WHERE wo_id = %L', '40b3e000-0000-4000-8000-000000000004')) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente cerró como Aprobada una OT firmada con Riesgos pendiente';
  END IF;
  -- Revisión del PR (Greptile): risk_status admite NULL y `NULL NOT IN (...)` es NULL, no verdadero: poner risk_status = NULL en la
  -- misma sentencia saltaba la exigencia de Riesgos (check_wo_approved solo excluye 'Rejected', así que aceptaba la OT). La
  -- comprobación tiene que ser nula-segura: sin una pista de Riesgos aprobada explícita no se cierra.
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET risk_status = NULL, approval_status = ''Approved'' WHERE wo_id = %L', '40b3e000-0000-4000-8000-000000000004')) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente cerró como Aprobada una OT firmada poniendo risk_status en NULL';
  END IF;
  IF (SELECT approval_status FROM public.work_orders WHERE wo_id = '40b3e000-0000-4000-8000-000000000004') = 'Approved' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — la OT con risk_status NULL no debía quedar Aprobada';
  END IF;
  EXECUTE 'SET LOCAL session_replication_role = replica';
  UPDATE public.work_orders SET risk_status = 'Rejected' WHERE wo_id = '40b3e000-0000-4000-8000-000000000004';
  EXECUTE 'SET LOCAL session_replication_role = origin';
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET approval_status = ''Approved'' WHERE wo_id = %L', '40b3e000-0000-4000-8000-000000000004')) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el gerente cerró como Aprobada una OT con Riesgos rechazado';
  END IF;
  EXECUTE 'SET LOCAL session_replication_role = replica';
  UPDATE public.work_orders SET risk_status = 'Approved' WHERE wo_id = '40b3e000-0000-4000-8000-000000000004';
  EXECUTE 'SET LOCAL session_replication_role = origin';
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET approval_status = ''Approved'' WHERE wo_id = %L', '40b3e000-0000-4000-8000-000000000004')) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — con la firma del socio y Riesgos aprobado la OT debía poder cerrarse';
  END IF;
  -- Una OT ya Aprobada puede tener después la pista de Riesgos rechazada (useRejectRisk deja approval_status intacto a propósito:
  -- pistas independientes): la exigencia de Riesgos rige solo al ENTRAR a «Aprobada», y editar la OT sigue funcionando.
  EXECUTE 'SET LOCAL session_replication_role = replica';
  UPDATE public.work_orders SET risk_status = 'Rejected' WHERE wo_id = '40b3e000-0000-4000-8000-000000000004';
  EXECUTE 'SET LOCAL session_replication_role = origin';
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET notes = ''corregir'' WHERE wo_id = %L', '40b3e000-0000-4000-8000-000000000004')) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — una OT ya Aprobada con Riesgos rechazado debía seguir editable (la regla de Riesgos es de transición)';
  END IF;
  RAISE NOTICE 'PASS — «Aprobada» exige firma y Riesgos aprobado al entrar; después, Riesgos puede rechazarse sin bloquear la edición (la OT administrativa, ya probada arriba, queda exceptuada)';

  -- 9e. Revisión del PR (Codex): quien firma queda registrado como quien es. approved_by debe ser la ficha de quien escribe, y
  --     approved_by y approved_at van juntos (el socio con work_order.submit podía anotar a otra persona como firmante).
  SELECT wo_id INTO v_wo3 FROM public.work_orders WHERE engagement_id = 'e0b3e000-0000-4000-8000-000000000003';
  IF pg_temp.try_as(p, format('UPDATE public.work_orders SET approved_by = %L, approved_at = now() WHERE wo_id = %L', '50b3e000-0000-4000-8000-000000000002', v_wo3)) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el socio registró a otra persona como firmante';
  END IF;
  IF pg_temp.try_as(p, format('UPDATE public.work_orders SET approved_by = %L WHERE wo_id = %L', '50b3e000-0000-4000-8000-000000000003', v_wo3)) <> 'ERR 42501'
     OR pg_temp.try_as(p, format('UPDATE public.work_orders SET approved_at = now() WHERE wo_id = %L', v_wo3)) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — la firma debía fijarse completa (approved_by y approved_at juntos)';
  END IF;
  IF pg_temp.try_as(p, format('UPDATE public.work_orders SET approved_by = %L, approved_at = now() WHERE wo_id = %L', '50b3e000-0000-4000-8000-000000000003', v_wo3)) <> '1'
     OR pg_temp.try_as(p, format('UPDATE public.work_orders SET approved_by = NULL, approved_at = NULL WHERE wo_id = %L', v_wo3)) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — el socio debía poder firmar con su propia ficha y retirar su firma';
  END IF;
  RAISE NOTICE 'PASS — el firmante registrado es quien escribe; la firma va completa; el socio firma y retira con su ficha';

  -- 10. No-vacuidad y excepciones ────────────────────────────────────────────────────────────────────────────────
  -- (a) el permiso decide: con work_order.submit el gerente del encargo SÍ puede firmar (regla = canApprove de la UI).
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key) VALUES ('manager', 'work_order.submit', 'assigned_engagements');
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET approved_by = %L, approved_at = now() WHERE wo_id = %L', '50b3e000-0000-4000-8000-000000000002', wo1)) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — con work_order.submit el gerente del encargo debía poder firmar (la guarda sale del permiso)';
  END IF;
  -- (b) pero ser del equipo también cuenta: el gerente sin relación con el encargo no firma aunque tenga el permiso.
  --     (la RLS de UPDATE ya lo deja en 0 filas; se comprueba que no cambia nada)
  IF pg_temp.try_as(x, format('UPDATE public.work_orders SET approved_by = %L, approved_at = now() WHERE wo_id = %L', '50b3e000-0000-4000-8000-000000000006', wo2)) NOT IN ('0', 'ERR 42501') THEN
    RAISE EXCEPTION 'B3e-2 FAIL — un gerente ajeno al encargo firmó una OT';
  END IF;
  DELETE FROM public.authorization_role_permissions WHERE role_key = 'manager' AND permission_key = 'work_order.submit';
  IF pg_temp.try_as(m, format('UPDATE public.work_orders SET approved_by = NULL, approved_at = NULL WHERE wo_id = %L', wo1)) <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — al quitar work_order.submit el gerente debía perder la firma';
  END IF;
  -- (c) admin firma y retira (control); (d) sin sesión (migraciones, service_role, SQL Editor) se permite.
  IF pg_temp.try_as(a, format('UPDATE public.work_orders SET approved_by = NULL, approved_at = NULL WHERE wo_id = %L', wo1)) <> '1' THEN
    RAISE EXCEPTION 'B3e-2 FAIL — admin debía poder retirar la firma';
  END IF;
  UPDATE public.work_orders SET approved_by = '50b3e000-0000-4000-8000-000000000003', approved_at = now() WHERE wo_id = wo1;
  IF (SELECT approved_at FROM public.work_orders WHERE wo_id = wo1) IS NULL THEN
    RAISE EXCEPTION 'B3e-2 FAIL — sin sesión (claim vacío) el UPDATE debía permitirse';
  END IF;
  RAISE NOTICE 'PASS — la guarda sale del permiso y del equipo; admin y la ejecución sin sesión no quedan bloqueados';

  RAISE NOTICE 'B3e STAFF Y FIRMA DE OT: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;

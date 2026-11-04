-- ETL fase 1 (bugs/ETL/carga/fase1/plan_v2.md, T03 / T04 / T08): suite contractual SQL/RLS.
--
-- Corre desde supabase/tests/local/run-rls-tests.sh DESPUÉS de todas las migraciones (incluida B5/B6/D1) y de
-- que cero_02/cero_06 declaren public.seed_initial_holidays(uuid) y cierren sus permisos (antes de B5). Transacción única, SIEMPRE
-- hace ROLLBACK. Salida de éxito: una NOTICE por chequeo y, al final, "ETL F1 CONTRACTS: ALL CHECKS PASSED".
--
--   T03  clientes: NIT y razón social repetidos; atributos nuevos nullable sin default; dominios inválidos; padre
--        inexistente, par incompleto, autorreferencia y fideicomiso/sucursal; borrado de padre rechazado.
--   T04  carga inicial con cero o un contacto general; el guardado operativo sin cobranza falla y revierte ficha y
--        contactos; contactos ajenos protegidos; el UPDATE operativo conserva los atributos nuevos.
--   T08  seed_initial_holidays inaccesible a anon/authenticated/service_role y a PUBLIC (después de B5); comportamiento
--        (28 filas, repetición sin modificar, solo faltantes, contradicción aborta todo); directorio de clientes con
--        exactamente 3 columnas; B6 impide dos fichas activas para un mismo Auth.
--
-- Las identidades de los fixtures llevan el prefijo f1c1. El harness ya trae clientes que no son de esta suite
-- (los dos internos ficticios) y una práctica/sociedad base: los conteos propios se calculan por prefijo.

BEGIN;

-- ── Helpers (temp) ────────────────────────────────────────────────────────────────────────────

-- «SQLSTATE: mensaje» con que falló la sentencia, como owner y sin claims (NULL si tuvo éxito). Cada llamada es
-- un subbloque: una falla no aborta la transacción de la suite.
CREATE FUNCTION pg_temp.try_owner(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;

-- Igual, con el rol authenticated real y el claim de `p_sub`.
CREATE FUNCTION pg_temp.try_as(p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql;
  EXECUTE 'RESET ROLE';
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;

-- ── Fixtures (como owner) ─────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id) VALUES
  ('a0f1c100-0000-4000-8000-000000000001'),   -- admin con ficha
  ('a0f1c100-0000-4000-8000-000000000002'),   -- asistente con ficha
  ('a0f1c100-0000-4000-8000-000000000003'),   -- admin sin ficha activa (ficha inactiva)
  ('a0f1c100-0000-4000-8000-000000000004'),   -- admin con ficha borrada
  ('a0f1c100-0000-4000-8000-000000000005');   -- usuario B6

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0f1c100-0000-4000-8000-000000000001', 'admin', 'admin'),
  ('a0f1c100-0000-4000-8000-000000000002', 'staff', 'assistant'),
  ('a0f1c100-0000-4000-8000-000000000003', 'admin', 'admin'),
  ('a0f1c100-0000-4000-8000-000000000004', 'admin', 'admin'),
  ('a0f1c100-0000-4000-8000-000000000005', 'staff', 'assistant');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id, is_active, deleted_at)
SELECT v.staff_id::uuid, v.auth_user_id::uuid, v.first_name, 'F1C1',
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
       v.is_active, v.deleted_at
  FROM (VALUES
    ('50f1c100-0000-4000-8000-000000000001', 'a0f1c100-0000-4000-8000-000000000001', 'Admin',     true,  NULL::timestamptz),
    ('50f1c100-0000-4000-8000-000000000002', 'a0f1c100-0000-4000-8000-000000000002', 'Asistente', true,  NULL),
    ('50f1c100-0000-4000-8000-000000000003', 'a0f1c100-0000-4000-8000-000000000003', 'Inactivo',  false, NULL),
    ('50f1c100-0000-4000-8000-000000000004', 'a0f1c100-0000-4000-8000-000000000004', 'Borrado',   true,  now()),
    ('50f1c100-0000-4000-8000-000000000005', 'a0f1c100-0000-4000-8000-000000000005', 'B6',        true,  NULL)
  ) AS v(staff_id, auth_user_id, first_name, is_active, deleted_at);

-- Un staff sin enlace a Auth (auth_user_id NULL) para el caso «no enlazado».
INSERT INTO public.staff (staff_id, first_name, last_name, practica_id, society_id)
VALUES ('50f1c100-0000-4000-8000-000000000006', 'SinAuth', 'F1C1',
        (SELECT practica_id FROM public.practicas WHERE code = 1),
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

DO $$
DECLARE
  adm  constant text := 'a0f1c100-0000-4000-8000-000000000001';
  ast  constant text := 'a0f1c100-0000-4000-8000-000000000002';
  v_err text;
  v_n bigint;
  v_cols text;
  v_before text;
  v_after text;
  v_hol integer;
  v_ids_before uuid[];
  v_ids_after uuid[];
  c_parent  constant uuid := 'c1f1c100-0000-4000-8000-0000000000a1';
  c_child   constant uuid := 'c1f1c100-0000-4000-8000-0000000000a2';
BEGIN
  -- ═════════════ T03 — modelo de clientes ═════════════════════════════════════════════════════

  -- NIT y razón social repetidos: ya no hay unicidad.
  INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES
    (c_parent, 'F1C1 Cliente Repetido', '99001'),
    ('c1f1c100-0000-4000-8000-0000000000b1', 'F1C1 Cliente Repetido', '99001'),
    ('c1f1c100-0000-4000-8000-0000000000b2', 'f1c1 cliente repetido  ', '99001');
  SELECT count(*) INTO v_n FROM public.clients WHERE tax_id = '99001' AND lower(btrim(client_legal_name)) = 'f1c1 cliente repetido';
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL T03: se esperaban 3 clientes con NIT y razón social repetidos (hay %)', v_n; END IF;
  RAISE NOTICE 'PASS T03: NIT y razón social repetidos (incluida variante de mayúsculas/espacios) se insertan';

  -- Atributos nuevos: NULL sin default.
  SELECT count(*) INTO v_n FROM public.clients
   WHERE client_id = c_parent AND operating_name IS NULL AND client_type IS NULL AND parent_client_id IS NULL
     AND parent_relationship IS NULL AND client_origin IS NULL AND billing_tax_treatment IS NULL AND industry_id IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL T03: un INSERT mínimo debe dejar los atributos nuevos e industry_id en NULL'; END IF;
  RAISE NOTICE 'PASS T03: atributos nuevos e industry_id quedan NULL en un INSERT mínimo';

  -- Dominios inválidos.
  FOR v_err IN SELECT pg_temp.try_owner(format($f$INSERT INTO public.clients (client_id, client_legal_name, tax_id, %s) VALUES (gen_random_uuid(), 'F1C1 dominio', 'D1', %L)$f$, col, val))
                 FROM (VALUES ('client_type', 'otro'), ('client_origin', 'marciano'), ('billing_tax_treatment', 'quizas')) AS t(col, val)
  LOOP
    IF v_err IS NULL OR v_err NOT LIKE '23514:%' THEN RAISE EXCEPTION 'FAIL T03: un dominio inválido debía dar 23514 (dio %)', v_err; END IF;
  END LOOP;
  RAISE NOTICE 'PASS T03: dominios inválidos de tipo, origen y tratamiento fiscal rechazados (23514)';

  v_err := pg_temp.try_owner($f$INSERT INTO public.clients (client_id, client_legal_name, tax_id, parent_client_id, parent_relationship)
                                VALUES (gen_random_uuid(), 'F1C1 rel inválida', 'D2', 'c1f1c100-0000-4000-8000-0000000000a1', 'hermano_de')$f$);
  IF v_err IS NULL OR v_err NOT LIKE '23514:%' THEN RAISE EXCEPTION 'FAIL T03: parent_relationship inválida debía dar 23514 (dio %)', v_err; END IF;
  RAISE NOTICE 'PASS T03: parent_relationship fuera de dominio rechazada';

  -- Padre inexistente (FK).
  v_err := pg_temp.try_owner($f$INSERT INTO public.clients (client_id, client_legal_name, tax_id, parent_client_id, parent_relationship)
                                VALUES (gen_random_uuid(), 'F1C1 huérfano', 'D3', gen_random_uuid(), 'proyecto_de')$f$);
  IF v_err IS NULL OR v_err NOT LIKE '23503:%' THEN RAISE EXCEPTION 'FAIL T03: padre inexistente debía dar 23503 (dio %)', v_err; END IF;
  RAISE NOTICE 'PASS T03: padre inexistente rechazado por la FK (23503)';

  -- Par incompleto, en las dos direcciones.
  v_err := pg_temp.try_owner($f$INSERT INTO public.clients (client_id, client_legal_name, tax_id, parent_client_id)
                                VALUES (gen_random_uuid(), 'F1C1 solo padre', 'D4', 'c1f1c100-0000-4000-8000-0000000000a1')$f$);
  IF v_err IS NULL OR v_err NOT LIKE '23514:%' THEN RAISE EXCEPTION 'FAIL T03: padre sin relación debía dar 23514 (dio %)', v_err; END IF;
  v_err := pg_temp.try_owner($f$INSERT INTO public.clients (client_id, client_legal_name, tax_id, parent_relationship)
                                VALUES (gen_random_uuid(), 'F1C1 solo relación', 'D5', 'proyecto_de')$f$);
  IF v_err IS NULL OR v_err NOT LIKE '23514:%' THEN RAISE EXCEPTION 'FAIL T03: relación sin padre debía dar 23514 (dio %)', v_err; END IF;
  RAISE NOTICE 'PASS T03: par padre/relación incompleto rechazado en ambas direcciones';

  -- Autorreferencia.
  v_err := pg_temp.try_owner($f$UPDATE public.clients SET parent_client_id = client_id, parent_relationship = 'proyecto_de'
                                WHERE client_id = 'c1f1c100-0000-4000-8000-0000000000a1'$f$);
  IF v_err IS NULL OR v_err NOT LIKE '23514:%' THEN RAISE EXCEPTION 'FAIL T03: autorreferencia debía dar 23514 (dio %)', v_err; END IF;
  RAISE NOTICE 'PASS T03: autorreferencia rechazada';

  -- Fideicomiso incompatible con sucursal_de; con otra relación sí se admite.
  v_err := pg_temp.try_owner($f$INSERT INTO public.clients (client_id, client_legal_name, tax_id, client_type, parent_client_id, parent_relationship)
                                VALUES (gen_random_uuid(), 'F1C1 fideicomiso', 'D6', 'fideicomiso', 'c1f1c100-0000-4000-8000-0000000000a1', 'sucursal_de')$f$);
  IF v_err IS NULL OR v_err NOT LIKE '23514:%' THEN RAISE EXCEPTION 'FAIL T03: fideicomiso + sucursal_de debía dar 23514 (dio %)', v_err; END IF;
  INSERT INTO public.clients (client_id, client_legal_name, tax_id, client_type, client_origin, billing_tax_treatment, operating_name, parent_client_id, parent_relationship)
  VALUES (c_child, 'F1C1 Fideicomiso Admin', '99001', 'fideicomiso', 'nacional', 'pendiente', 'F1C1 FID', c_parent, 'administrado_por');
  RAISE NOTICE 'PASS T03: fideicomiso + sucursal_de rechazado; fideicomiso administrado_por válido';

  -- Borrado de un padre referenciado.
  v_err := pg_temp.try_owner($f$DELETE FROM public.clients WHERE client_id = 'c1f1c100-0000-4000-8000-0000000000a1'$f$);
  -- ON DELETE RESTRICT: PostgreSQL 17 responde 23503 (foreign_key_violation) y PostgreSQL 18 responde
  -- 23001 (restrict_violation). Ambos son el rechazo esperado; la fila del padre debe seguir ahí.
  IF v_err IS NULL OR (v_err NOT LIKE '23503:%' AND v_err NOT LIKE '23001:%') THEN
    RAISE EXCEPTION 'FAIL T03: borrar un padre referenciado debía dar 23503 o 23001 (dio %)', v_err;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE client_id = 'c1f1c100-0000-4000-8000-0000000000a1') THEN
    RAISE EXCEPTION 'FAIL T03: el padre referenciado no debía borrarse';
  END IF;
  RAISE NOTICE 'PASS T03: borrado de un padre referenciado rechazado (RESTRICT)';

  -- ═════════════ T04 — carga inicial y guardado operativo ═════════════════════════════════════

  -- Carga inicial (INSERT privilegiado): un general, sin cobranza; y un cliente sin contactos.
  INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES
    ('c1f1c100-0000-4000-8000-0000000000c1', 'F1C1 Carga Con General', '5000001'),
    ('c1f1c100-0000-4000-8000-0000000000c2', 'F1C1 Carga Sin Contacto', '5000002');
  INSERT INTO public.client_contacts (contact_id, client_id, contact_type, full_name, email, phone) VALUES
    ('c0f1c100-0000-4000-8000-0000000000c1', 'c1f1c100-0000-4000-8000-0000000000c1', 'general', 'Contacto General', 'general@example.test', '70000001');
  SELECT count(*) INTO v_n FROM public.client_contacts WHERE client_id IN
    ('c1f1c100-0000-4000-8000-0000000000c1', 'c1f1c100-0000-4000-8000-0000000000c2');
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL T04: la carga inicial debía dejar exactamente 1 contacto (hay %)', v_n; END IF;
  IF public.client_has_required_contacts('c1f1c100-0000-4000-8000-0000000000c1')
     OR public.client_has_required_contacts('c1f1c100-0000-4000-8000-0000000000c2') THEN
    RAISE EXCEPTION 'FAIL T04: client_has_required_contacts debe seguir en falso para una carga inicial incompleta';
  END IF;
  RAISE NOTICE 'PASS T04: carga inicial con cero o un general; el requisito operativo (general + cobranza) no se relaja';

  -- Guardado operativo sin cobranza: falla y revierte ficha y contactos.
  v_err := pg_temp.try_as(adm, $f$SELECT public.save_client_with_contacts(
      'c1f1c100-0000-4000-8000-0000000000d1'::uuid, true,
      '{"client_legal_name": "F1C1 Operativo Sin Cobranza", "tax_id": "5000003"}'::jsonb,
      '[{"contact_type": "general", "full_name": "Solo General", "email": "g@example.test"}]'::jsonb)$f$);
  IF v_err IS NULL OR v_err NOT LIKE '%CONTACT_COBRANZA_REQUIRED%' THEN
    RAISE EXCEPTION 'FAIL T04: el guardado sin cobranza debía fallar con CONTACT_COBRANZA_REQUIRED (dio %)', v_err;
  END IF;
  SELECT count(*) INTO v_n FROM public.clients WHERE client_id = 'c1f1c100-0000-4000-8000-0000000000d1';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T04: la ficha del cliente debía revertirse junto con los contactos'; END IF;
  SELECT count(*) INTO v_n FROM public.client_contacts WHERE client_id = 'c1f1c100-0000-4000-8000-0000000000d1';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T04: no debían quedar contactos de un guardado fallido'; END IF;
  RAISE NOTICE 'PASS T04: guardado operativo sin cobranza falla y revierte ficha y contactos';

  -- Guardado operativo completo: los atributos nuevos quedan NULL en el INSERT.
  v_err := pg_temp.try_as(adm, $f$SELECT public.save_client_with_contacts(
      'c1f1c100-0000-4000-8000-0000000000d2'::uuid, true,
      '{"client_legal_name": "F1C1 Operativo Completo", "tax_id": "5000004"}'::jsonb,
      '[{"contact_type": "general", "full_name": "General", "email": "g@example.test"},
        {"contact_type": "cobranza", "full_name": "Cobranza", "email": "c@example.test"}]'::jsonb)$f$);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION 'FAIL T04: el guardado operativo completo falló: %', v_err; END IF;
  SELECT count(*) INTO v_n FROM public.clients
   WHERE client_id = 'c1f1c100-0000-4000-8000-0000000000d2' AND tax_id = '5000004'
     AND operating_name IS NULL AND client_type IS NULL AND parent_client_id IS NULL
     AND parent_relationship IS NULL AND client_origin IS NULL AND billing_tax_treatment IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL T04: el INSERT operativo debía dejar los atributos nuevos en NULL y guardar tax_id'; END IF;
  RAISE NOTICE 'PASS T04: guardado operativo completo; INSERT deja los atributos nuevos en NULL';

  -- UPDATE operativo: conserva los atributos nuevos que la UI no envía.
  UPDATE public.clients
     SET operating_name = 'F1C1 Operativo', client_type = 'entidad', client_origin = 'nacional',
         billing_tax_treatment = 'nit_propio', parent_client_id = c_parent, parent_relationship = 'proyecto_de'
   WHERE client_id = 'c1f1c100-0000-4000-8000-0000000000d2';
  v_err := pg_temp.try_as(adm, $f$SELECT public.save_client_with_contacts(
      'c1f1c100-0000-4000-8000-0000000000d2'::uuid, false,
      '{"client_legal_name": "F1C1 Operativo Editado", "tax_id": "5000005"}'::jsonb,
      '[{"contact_type": "general", "full_name": "General", "email": "g@example.test"},
        {"contact_type": "cobranza", "full_name": "Cobranza", "email": "c@example.test"}]'::jsonb)$f$);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION 'FAIL T04: el UPDATE operativo falló: %', v_err; END IF;
  SELECT count(*) INTO v_n FROM public.clients
   WHERE client_id = 'c1f1c100-0000-4000-8000-0000000000d2'
     AND client_legal_name = 'F1C1 Operativo Editado' AND tax_id = '5000005'
     AND operating_name = 'F1C1 Operativo' AND client_type = 'entidad' AND client_origin = 'nacional'
     AND billing_tax_treatment = 'nit_propio' AND parent_client_id = c_parent AND parent_relationship = 'proyecto_de';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL T04: el UPDATE operativo debía conservar los 6 atributos nuevos'; END IF;
  RAISE NOTICE 'PASS T04: UPDATE operativo conserva los atributos nuevos (y actualiza nombre y tax_id)';

  -- Contactos ajenos protegidos: un contact_id de otro cliente en el payload se rechaza y no se toca.
  v_err := pg_temp.try_as(adm, $f$SELECT public.save_client_contacts(
      'c1f1c100-0000-4000-8000-0000000000d2'::uuid,
      '[{"contact_id": "c0f1c100-0000-4000-8000-0000000000c1", "contact_type": "general", "full_name": "Secuestrado", "email": "x@example.test"},
        {"contact_type": "cobranza", "full_name": "Cobranza", "email": "c@example.test"}]'::jsonb)$f$);
  IF v_err IS NULL OR v_err NOT LIKE '%CONTACT_PAYLOAD_INVALID%' THEN
    RAISE EXCEPTION 'FAIL T04: un contacto ajeno en el payload debía rechazarse (dio %)', v_err;
  END IF;
  SELECT count(*) INTO v_n FROM public.client_contacts
   WHERE contact_id = 'c0f1c100-0000-4000-8000-0000000000c1'
     AND client_id = 'c1f1c100-0000-4000-8000-0000000000c1' AND full_name = 'Contacto General' AND is_active;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL T04: el contacto del otro cliente no debía modificarse'; END IF;
  RAISE NOTICE 'PASS T04: contactos de otro cliente protegidos';

  -- Un asistente sin permiso no puede usar la RPC operativa.
  v_err := pg_temp.try_as(ast, $f$SELECT public.save_client_with_contacts(
      'c1f1c100-0000-4000-8000-0000000000d3'::uuid, true,
      '{"client_legal_name": "F1C1 Sin Permiso", "tax_id": "5000006"}'::jsonb, '[]'::jsonb)$f$);
  IF v_err IS NULL OR v_err NOT LIKE '%CLIENT_FORBIDDEN%' THEN
    RAISE EXCEPTION 'FAIL T04: un asistente no debía poder crear clientes (dio %)', v_err;
  END IF;
  RAISE NOTICE 'PASS T04: el permiso client.create sigue exigiéndose en el guardado operativo';

  -- ═════════════ T08 — calendario, privilegios y directorio ═══════════════════════════════════

  -- Privilegios de la función de feriados, DESPUÉS de B5.
  FOR v_err IN SELECT r FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS t(r)
                WHERE has_function_privilege(r, 'public.seed_initial_holidays(uuid)', 'EXECUTE')
  LOOP
    RAISE EXCEPTION 'FAIL T08: el rol % no debe poder ejecutar seed_initial_holidays', v_err;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
              WHERE p.oid = 'public.seed_initial_holidays(uuid)'::regprocedure AND a.grantee = 0) THEN
    RAISE EXCEPTION 'FAIL T08: PUBLIC no debe tener EXECUTE sobre seed_initial_holidays';
  END IF;
  IF NOT has_function_privilege('postgres', 'public.seed_initial_holidays(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL T08: el propietario debe poder ejecutar seed_initial_holidays';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.seed_initial_holidays(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'FAIL T08: seed_initial_holidays debe ser SECURITY INVOKER';
  END IF;
  v_err := pg_temp.try_as(adm, $f$SELECT public.seed_initial_holidays('50f1c100-0000-4000-8000-000000000001'::uuid)$f$);
  IF v_err IS NULL OR v_err NOT LIKE '42501:%' THEN
    RAISE EXCEPTION 'FAIL T08: un admin autenticado no debía poder llamar a la función (dio %)', v_err;
  END IF;
  RAISE NOTICE 'PASS T08: seed_initial_holidays solo ejecutable por el propietario (anon/authenticated/service_role/PUBLIC sin EXECUTE)';

  -- Actor inválido.
  FOR v_err IN SELECT pg_temp.try_owner(format('SELECT public.seed_initial_holidays(%L)', a))
                 FROM (VALUES ('50f1c100-0000-4000-8000-000000000002'),   -- asistente (rol no admin)
                              ('50f1c100-0000-4000-8000-000000000003'),   -- ficha inactiva
                              ('50f1c100-0000-4000-8000-000000000004'),   -- ficha borrada
                              ('50f1c100-0000-4000-8000-000000000006'),   -- sin enlace a Auth
                              ('50f1c100-0000-4000-8000-0000000000ff')) AS t(a)  -- inexistente
  LOOP
    IF v_err IS NULL OR v_err NOT LIKE '%HOLIDAYS_ACTOR_INVALID%' THEN
      RAISE EXCEPTION 'FAIL T08: un actor inválido debía dar HOLIDAYS_ACTOR_INVALID (dio %)', v_err;
    END IF;
  END LOOP;
  v_err := pg_temp.try_owner('SELECT public.seed_initial_holidays(NULL)');
  IF v_err IS NULL OR v_err NOT LIKE '%HOLIDAYS_ACTOR_INVALID%' THEN RAISE EXCEPTION 'FAIL T08: actor NULL debía rechazarse (dio %)', v_err; END IF;
  SELECT count(*) INTO v_n FROM public.holidays;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T08: un actor inválido no debía dejar feriados (hay %)', v_n; END IF;
  RAISE NOTICE 'PASS T08: actor NULL, inexistente, inactivo, borrado, sin Auth o sin rol admin rechazado sin escribir';

  -- Primera llamada: 28 filas con autoría correcta.
  v_hol := public.seed_initial_holidays('50f1c100-0000-4000-8000-000000000001');
  IF v_hol <> 28 THEN RAISE EXCEPTION 'FAIL T08: la función debía devolver 28 (devolvió %)', v_hol; END IF;
  SELECT count(*) INTO v_n FROM public.holidays WHERE created_by = '50f1c100-0000-4000-8000-000000000001';
  IF v_n <> 28 THEN RAISE EXCEPTION 'FAIL T08: debían existir 28 feriados del administrador (hay %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.holidays
   WHERE (holiday_date, oficina, holiday_name) IN (
     (DATE '2026-01-01', 0::smallint, 'Año Nuevo'), (DATE '2026-07-16', 1::smallint, 'Aniversario del Departamento de La Paz'),
     (DATE '2026-09-24', 2::smallint, 'Aniversario del Departamento de Santa Cruz'), (DATE '2027-12-25', 0::smallint, 'Navidad'));
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL T08: faltan feriados de muestra del catálogo (hay %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.holidays WHERE holiday_name = 'Puente (Adicional)';
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL T08: debían existir los 2 "Puente (Adicional)" (hay %)', v_n; END IF;
  RAISE NOTICE 'PASS T08: primera llamada devuelve 28 feriados con autoría correcta';

  -- Repetición correcta: ninguna fila modificada.
  SELECT md5(string_agg(h::text, '|' ORDER BY h.holiday_date, h.oficina)) INTO v_before FROM public.holidays h;
  v_hol := public.seed_initial_holidays('50f1c100-0000-4000-8000-000000000001');
  SELECT md5(string_agg(h::text, '|' ORDER BY h.holiday_date, h.oficina)) INTO v_after FROM public.holidays h;
  IF v_hol <> 28 OR v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'FAIL T08: la repetición debía devolver 28 sin modificar ninguna fila (devolvió %)', v_hol;
  END IF;
  RAISE NOTICE 'PASS T08: repetición devuelve 28 y no modifica filas (ids, nombres, autoría y sellos intactos)';

  -- Reanudación parcial: solo se insertan los faltantes.
  SELECT array_agg(holiday_id ORDER BY holiday_id) INTO v_ids_before FROM public.holidays
   WHERE holiday_date NOT IN (DATE '2026-01-01', DATE '2026-05-01', DATE '2027-12-25');
  DELETE FROM public.holidays WHERE holiday_date IN (DATE '2026-01-01', DATE '2026-05-01', DATE '2027-12-25');
  v_hol := public.seed_initial_holidays('50f1c100-0000-4000-8000-000000000001');
  SELECT array_agg(holiday_id ORDER BY holiday_id) INTO v_ids_after FROM public.holidays
   WHERE holiday_date NOT IN (DATE '2026-01-01', DATE '2026-05-01', DATE '2027-12-25');
  SELECT count(*) INTO v_n FROM public.holidays;
  IF v_hol <> 28 OR v_n <> 28 OR v_ids_before IS DISTINCT FROM v_ids_after THEN
    RAISE EXCEPTION 'FAIL T08: la reanudación debía reponer solo los faltantes sin tocar los demás (devolvió %, filas %)', v_hol, v_n;
  END IF;
  RAISE NOTICE 'PASS T08: calendario parcial se completa insertando únicamente los faltantes';

  -- Contradicción de nombre: aborta toda la llamada sin sobrescribir ni reponer nada.
  UPDATE public.holidays SET holiday_name = 'Nombre contradictorio' WHERE holiday_date = DATE '2026-11-02' AND oficina = 0;
  DELETE FROM public.holidays WHERE holiday_date = DATE '2026-01-22';
  v_err := pg_temp.try_owner($f$SELECT public.seed_initial_holidays('50f1c100-0000-4000-8000-000000000001')$f$);
  IF v_err IS NULL OR v_err NOT LIKE '%HOLIDAYS_CONFLICT%' THEN RAISE EXCEPTION 'FAIL T08: un nombre contradictorio debía abortar (dio %)', v_err; END IF;
  SELECT count(*) INTO v_n FROM public.holidays WHERE holiday_date = DATE '2026-01-22';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T08: un conflicto no debía reponer ninguna fila faltante'; END IF;
  SELECT count(*) INTO v_n FROM public.holidays WHERE holiday_date = DATE '2026-11-02' AND oficina = 0 AND holiday_name = 'Nombre contradictorio';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL T08: un conflicto no debía sobrescribir la fila contradictoria'; END IF;
  RAISE NOTICE 'PASS T08: nombre contradictorio aborta toda la llamada sin sobrescribir ni reponer';

  -- Contradicción de autor.
  UPDATE public.holidays SET holiday_name = 'Día de los Difuntos' WHERE holiday_date = DATE '2026-11-02' AND oficina = 0;
  UPDATE public.holidays SET created_by = '50f1c100-0000-4000-8000-000000000002' WHERE holiday_date = DATE '2026-12-25';
  v_err := pg_temp.try_owner($f$SELECT public.seed_initial_holidays('50f1c100-0000-4000-8000-000000000001')$f$);
  IF v_err IS NULL OR v_err NOT LIKE '%HOLIDAYS_CONFLICT%' THEN RAISE EXCEPTION 'FAIL T08: un autor contradictorio debía abortar (dio %)', v_err; END IF;
  RAISE NOTICE 'PASS T08: autor contradictorio aborta la llamada';

  -- Directorio de clientes: exactamente 3 columnas.
  SELECT string_agg(column_name::text, ',' ORDER BY column_name) INTO v_cols
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients_directory';
  IF v_cols IS DISTINCT FROM 'client_id,client_legal_name,is_active' THEN
    RAISE EXCEPTION 'FAIL T08: clients_directory debe exponer solo client_id, client_legal_name, is_active (expone %)', v_cols;
  END IF;
  RAISE NOTICE 'PASS T08: clients_directory no expone NIT, industria, atributos nuevos ni contactos';

  -- B6: una ficha ACTIVA por usuario de Auth.
  v_err := pg_temp.try_owner($f$INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
      VALUES ('50f1c100-0000-4000-8000-0000000000b6', 'a0f1c100-0000-4000-8000-000000000005', 'B6bis', 'F1C1',
              (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1))$f$);
  IF v_err IS NULL OR v_err NOT LIKE '23505:%' THEN RAISE EXCEPTION 'FAIL T08: B6 debía impedir dos fichas activas para un Auth (dio %)', v_err; END IF;
  RAISE NOTICE 'PASS T08: B6 impide dos fichas activas para un mismo Auth';

  RAISE NOTICE 'ETL F1 CONTRACTS: ALL CHECKS PASSED (rolled back)';
END
$$;

ROLLBACK;

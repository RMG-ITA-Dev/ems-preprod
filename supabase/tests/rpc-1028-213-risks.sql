-- 1028-213 — módulo /risks: funciones SECURITY DEFINER de lectura y escritura de la pista de Riesgos
-- (20260922120000_0722_160_administrative_engagements.sql: list_risk_work_orders, get_risk_work_order,
--  approve_wo_risk, reject_wo_risk, approve_wo_emergency_review, approve_wo_emergency_partner; los
--  permisos work_order.risk.read / work_order.risk.emergency_sign salen de 20261009120000_rls_carril_b.sql).
-- Decisiones: bugs/1028-213/decisiones.md (D-18, D-35, D-37, D-38, H-5, H-6), plan_v2.md §3.
--
-- Corre desde supabase/tests/local/run-rls-tests.sh. Transacción única, SIEMPRE hace ROLLBACK. Salida de
-- éxito: una NOTICE por chequeo, terminando en "RISKS RPC 1028-213: ALL CHECKS PASSED (rolled back)".
--
-- Las funciones son SECURITY DEFINER y auth.uid() lee el GUC request.jwt.claims (00-shim-auth.sql), así que
-- el llamador se simula con el claim (pg_temp.impersonate / as_anon / no_session). Solo la sección de ACL
-- cambia de rol de verdad. Cada denegación tiene su contraparte de no-vacuidad: la MISMA llamada por un
-- llamador legítimo tiene éxito, de modo que quitar una guarda hace fallar la suite en vez de pasar en falso.
--
-- Fixture world (ids con prefijo 2130):
--   U1 admin  U2 risk_partner (RP)  U3 risk_supervisor (RS)  U4 manager (gerente de E1/E2)
--   U5 director que es SQR de E1  U6 ita_manager  U7 assistant
--   E1 sociedad A (OT1 completa, firma de socio pendiente) · E2 sociedad B (OT2 completa, el socio ya firmó)
--   E3 administrativo (OT3, excluido) · E4 cancelado, override 6 (OT4, excluido) · E5 OT en Draft (OT5, excluida)
--   E6 emergencia con el socio ya firmado (OT6) · E7 emergencia sin firma del socio (OT7)

BEGIN;

-- ── Fixtures (como owner) ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.society (society_id, name) VALUES ('52130000-0000-4000-8000-0000000000b0', 'Zeta 1028-213 Sociedad B');

INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES
  ('c2130000-0000-4000-8000-000000000001', 'Cliente 1028-213 A', 'NIT-2130-A'),
  ('c2130000-0000-4000-8000-000000000002', 'Cliente 1028-213 B', 'NIT-2130-B');

INSERT INTO auth.users (id) VALUES
  ('a2130000-0000-4000-8000-000000000001'), ('a2130000-0000-4000-8000-000000000002'),
  ('a2130000-0000-4000-8000-000000000003'), ('a2130000-0000-4000-8000-000000000004'),
  ('a2130000-0000-4000-8000-000000000005'), ('a2130000-0000-4000-8000-000000000006'),
  ('a2130000-0000-4000-8000-000000000007');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a2130000-0000-4000-8000-000000000001', 'admin',    'admin'),
  ('a2130000-0000-4000-8000-000000000002', 'partner',  'risk_partner'),
  ('a2130000-0000-4000-8000-000000000003', 'staff',    'risk_supervisor'),
  ('a2130000-0000-4000-8000-000000000004', 'manager',  'manager'),
  ('a2130000-0000-4000-8000-000000000005', 'director', 'director'),
  ('a2130000-0000-4000-8000-000000000006', 'manager',  'ita_manager'),
  ('a2130000-0000-4000-8000-000000000007', 'staff',    'assistant')
-- handle_new_user puede haber creado ya la fila del usuario (según el ambiente): se pisa con el rol del fixture.
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, role_key = EXCLUDED.role_key;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id, short_name)
SELECT ('52130000-0000-4000-8000-00000000000' || n)::uuid, ('a2130000-0000-4000-8000-00000000000' || n)::uuid,
       'U' || n, 'Staff2130',
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
       CASE WHEN n = '2' THEN 'rp.2130' ELSE NULL END
FROM (VALUES ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7')) AS v(n);

-- Encargos y OT con triggers apagados: el fixture fija estados de Riesgos que el flujo normal solo alcanza paso a paso.
SET LOCAL session_replication_role = replica;

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, funcion, practica,
                                fecha_cierre, work_order_required, approval_required, society_id,
                                manager_id, partner_id, sqr_id, engagement_state_override)
SELECT ('e2130000-0000-4000-8000-00000000000' || n)::uuid,
       CASE WHEN n = '2' THEN 'c2130000-0000-4000-8000-000000000002' ELSE 'c2130000-0000-4000-8000-000000000001' END::uuid,
       'Riesgos 2130 ' || n, '2130-E' || n, f, 1, '2027-12-31', true, false,
       CASE WHEN n = '2' THEN '52130000-0000-4000-8000-0000000000b0'::uuid
            ELSE (SELECT society_id FROM public.society ORDER BY name LIMIT 1) END,
       '52130000-0000-4000-8000-000000000004',
       CASE WHEN n = '1' THEN '52130000-0000-4000-8000-000000000002'::uuid ELSE NULL END,
       CASE WHEN n = '1' THEN '52130000-0000-4000-8000-000000000005'::uuid ELSE NULL END,
       ov
FROM (VALUES ('1', 1::smallint, NULL::smallint), ('2', 1::smallint, NULL::smallint),
             ('3', 0::smallint, NULL::smallint), ('4', 1::smallint, 6::smallint),
             ('5', 1::smallint, NULL::smallint), ('6', 1::smallint, NULL::smallint),
             ('7', 1::smallint, NULL::smallint)) AS v(n, f, ov);

-- OT1/OT2: datos de Riesgos completos (camino normal). OT2 con la firma del socio puesta.
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status, risk_status,
                                san_completed_at, san_approval_id, ceac_completed_at, ceac_number, risk_level,
                                approved_by, approved_at, notes)
VALUES
  ('42130000-0000-4000-8000-000000000001', 'e2130000-0000-4000-8000-000000000001', 'BOB', 'High', 'Pending_Approval', 'Pending',
   '2026-10-01', 'SAN-ÑÜ_1/x', '2026-10-02', 'CEAC #1!', 'Bajo', NULL, NULL, 'nota OT1'),
  ('42130000-0000-4000-8000-000000000002', 'e2130000-0000-4000-8000-000000000002', 'BOB', 'High', 'Pending_Approval', 'Pending',
   '2026-10-03', 'S2', '2026-10-04', 'C2', 'Alto', '52130000-0000-4000-8000-000000000004', now(), 'nota OT2');
-- OT3 administrativa, OT4 de un encargo cancelado, OT5 en Draft: no deben aparecer en /risks.
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status, risk_status,
                                san_completed_at, san_approval_id, ceac_completed_at, ceac_number, risk_level)
VALUES
  ('42130000-0000-4000-8000-000000000003', 'e2130000-0000-4000-8000-000000000003', 'BOB', 'High', 'Pending_Approval', 'Pending', NULL, NULL, NULL, NULL, NULL),
  ('42130000-0000-4000-8000-000000000004', 'e2130000-0000-4000-8000-000000000004', 'BOB', 'High', 'Pending_Approval', 'Pending',
   '2026-10-05', 'S4', '2026-10-05', 'C4', 'Bajo'),
  ('42130000-0000-4000-8000-000000000005', 'e2130000-0000-4000-8000-000000000005', 'BOB', 'High', 'Draft', 'Pending',
   '2026-10-06', 'S5', '2026-10-06', 'C5', 'Bajo');
-- OT6/OT7: emergencia (los cinco campos vacíos) con motivo; OT6 con la firma del socio puesta, OT7 sin ella.
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status, risk_status,
                                emergency_justification, approved_by, approved_at)
VALUES
  ('42130000-0000-4000-8000-000000000006', 'e2130000-0000-4000-8000-000000000006', 'BOB', 'High', 'Pending_Approval', 'Pending',
   'Urgencia 6', '52130000-0000-4000-8000-000000000004', now()),
  ('42130000-0000-4000-8000-000000000007', 'e2130000-0000-4000-8000-000000000007', 'BOB', 'High', 'Pending_Approval', 'Pending',
   'Urgencia 7', NULL, NULL);
SET LOCAL session_replication_role = origin;

-- ── Helpers (temp; se van con la sesión) ──────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.impersonate(p_n int) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', 'a2130000-0000-4000-8000-00000000000' || p_n, 'role', 'authenticated')::text, true)
$$;

CREATE FUNCTION pg_temp.as_anon() RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true)
$$;

CREATE FUNCTION pg_temp.no_session() RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true)
$$;

-- Ejecuta una sentencia y devuelve el SQLERRM con que falló (NULL si tuvo éxito). El sub-bloque EXCEPTION deshace
-- cualquier efecto parcial de la llamada rechazada.
CREATE FUNCTION pg_temp.try(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

CREATE FUNCTION pg_temp.wo(p_n int) RETURNS uuid
LANGUAGE sql AS $$ SELECT ('42130000-0000-4000-8000-00000000000' || p_n)::uuid $$;

-- Hash de TODO lo que no es de Riesgos de la OT (AC-21): si una función escribe otra columna, cambia.
CREATE FUNCTION pg_temp.non_risk_hash(p_wo uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT md5((to_jsonb(w)
        - 'risk_status' - 'risk_approved_by' - 'risk_approved_at' - 'risk_notes'
        - 'emergency_review_by' - 'emergency_review_at' - 'emergency_partner_by' - 'emergency_partner_at'
        - 'emergency_deadline_at' - 'emergency_justification' - 'approval_status' - 'updated_at')::text)
    FROM public.work_orders w WHERE w.wo_id = p_wo
$$;

DO $$
DECLARE
  err     text;
  n       int;
  v_cols  text;
  v_h     text;
  v_row   record;
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
BEGIN
  -- ═════════════════════════════════════════════════════════════════
  -- Lectura: list_risk_work_orders / get_risk_work_order
  -- ═════════════════════════════════════════════════════════════════

  -- L1 (AC-19): admin, risk_partner y risk_supervisor reciben las OT de las DOS sociedades. Las excluidas (administrativa,
  -- encargo cancelado, Draft) no aparecen; las demás (OT1, OT2, OT6, OT7) sí, ordenadas por código de encargo (D-39).
  FOREACH n IN ARRAY ARRAY[1, 2, 3] LOOP
    PERFORM pg_temp.impersonate(n);
    SELECT string_agg(engagement_code, ',' ORDER BY engagement_code) INTO v_cols
      FROM public.list_risk_work_orders() WHERE engagement_code LIKE '2130-E%';
    IF v_cols IS DISTINCT FROM '2130-E1,2130-E2,2130-E6,2130-E7' THEN
      RAISE EXCEPTION 'RISKS FAIL — L1: el usuario U% debía ver E1,E2,E6,E7 (dos sociedades; sin E3 admin, E4 cancelado ni E5 Draft) y vio %', n, v_cols;
    END IF;
  END LOOP;
  PERFORM pg_temp.impersonate(3);
  SELECT string_agg(engagement_code, ',') INTO v_cols FROM public.list_risk_work_orders() WHERE engagement_code LIKE '2130-E%';   -- orden devuelto por la función, sin ORDER BY
  IF v_cols IS DISTINCT FROM '2130-E1,2130-E2,2130-E6,2130-E7' THEN
    RAISE EXCEPTION 'RISKS FAIL — L1: la lista no sale ordenada por código de encargo (%)', v_cols;
  END IF;
  RAISE NOTICE 'PASS — L1: admin, RP y RS ven las OT de 2 sociedades, sin administrativa/cancelada/Draft, ordenadas por código de encargo';

  -- L2 (AC-19): quien no tiene work_order.risk.read recibe FORBIDDEN en lista y detalle: gerente, SQR, ITA, asistente, anon y sin sesión.
  FOREACH n IN ARRAY ARRAY[4, 5, 6, 7] LOOP
    PERFORM pg_temp.impersonate(n);
    err := pg_temp.try('SELECT * FROM public.list_risk_work_orders()');
    IF err IS DISTINCT FROM 'FORBIDDEN' THEN
      RAISE EXCEPTION 'RISKS FAIL — L2: list_risk_work_orders no dio FORBIDDEN a U% (err=%)', n, err;
    END IF;
    err := pg_temp.try(format('SELECT * FROM public.get_risk_work_order(%L)', pg_temp.wo(1)));
    IF err IS DISTINCT FROM 'FORBIDDEN' THEN
      RAISE EXCEPTION 'RISKS FAIL — L2: get_risk_work_order no dio FORBIDDEN a U% (err=%)', n, err;
    END IF;
  END LOOP;
  PERFORM pg_temp.as_anon();
  err := pg_temp.try('SELECT * FROM public.list_risk_work_orders()');
  IF err IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'RISKS FAIL — L2: anon no dio FORBIDDEN en la lista (err=%)', err; END IF;
  PERFORM pg_temp.no_session();
  err := pg_temp.try('SELECT * FROM public.list_risk_work_orders()');
  IF err IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'RISKS FAIL — L2: sin sesión no dio FORBIDDEN en la lista (err=%)', err; END IF;
  RAISE NOTICE 'PASS — L2: gerente, SQR, ITA, asistente, anon y sin sesión reciben FORBIDDEN en lista y detalle (contraparte: L1)';

  -- L3: el detalle devuelve la OT de otra sociedad y NOT_FOUND para la administrativa, la del encargo cancelado y el Draft.
  PERFORM pg_temp.impersonate(3);
  SELECT * INTO v_row FROM public.get_risk_work_order(pg_temp.wo(2));
  IF v_row.engagement_code IS DISTINCT FROM '2130-E2' OR v_row.client_name IS DISTINCT FROM 'Cliente 1028-213 B'
     OR v_row.approval_status IS DISTINCT FROM 'Pending_Approval' OR v_row.approved_at IS NULL THEN
    RAISE EXCEPTION 'RISKS FAIL — L3: el detalle de OT2 no trae encargo, cliente, estado del socio y firma (%)', to_jsonb(v_row);
  END IF;
  FOREACH n IN ARRAY ARRAY[3, 4, 5] LOOP
    err := pg_temp.try(format('SELECT * FROM public.get_risk_work_order(%L)', pg_temp.wo(n)));
    IF err IS DISTINCT FROM 'NOT_FOUND' THEN
      RAISE EXCEPTION 'RISKS FAIL — L3: get_risk_work_order(OT%) debía dar NOT_FOUND (administrativa/cancelada/Draft) y dio %', n, err;
    END IF;
  END LOOP;
  err := pg_temp.try('SELECT * FROM public.get_risk_work_order(''00000000-0000-4000-8000-000000000000'')');
  IF err IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'RISKS FAIL — L3: un wo_id inexistente debía dar NOT_FOUND (%)', err; END IF;
  RAISE NOTICE 'PASS — L3: detalle de otra sociedad con estado del socio; NOT_FOUND para administrativa, cancelada, Draft e inexistente';

  -- L4 (AC-08, AC-15): el conjunto de columnas es exactamente el de Riesgos; sin montos, presupuesto, plan de pagos ni horas.
  SELECT string_agg(a.name, ',' ORDER BY a.ord) INTO v_cols
    FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(name, mode, ord)
   WHERE p.oid = 'public.list_risk_work_orders()'::regprocedure AND a.mode = 't';
  IF v_cols IS DISTINCT FROM 'wo_id,engagement_id,engagement_code,engagement_name,client_name,partner_name,manager_name,san_approval_id,san_completed_at,ceac_number,ceac_completed_at,risk_level,risk_status,emergency_review_at,emergency_partner_at,emergency_deadline_at,has_emergency_justification,engagement_state_override' THEN
    RAISE EXCEPTION 'RISKS FAIL — L4: columnas de list_risk_work_orders inesperadas (%)', v_cols;
  END IF;
  SELECT string_agg(a.name, ',' ORDER BY a.ord) INTO v_cols
    FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(name, mode, ord)
   WHERE p.oid = 'public.get_risk_work_order(uuid)'::regprocedure AND a.mode = 't';
  IF v_cols IS DISTINCT FROM 'wo_id,engagement_id,engagement_code,engagement_name,client_name,partner_name,manager_name,san_approval_id,san_completed_at,ceac_number,ceac_completed_at,risk_level,risk_status,emergency_review_at,emergency_partner_at,emergency_deadline_at,has_emergency_justification,engagement_state_override,approval_status,approved_at,risk_notes,emergency_justification,risk_approved_at,risk_approved_by,emergency_review_by,emergency_partner_by' THEN
    RAISE EXCEPTION 'RISKS FAIL — L4: columnas de get_risk_work_order inesperadas (%)', v_cols;
  END IF;
  -- Y los valores libres de SAN/CEAC (letras, símbolos, espacios internos) llegan tal cual (D-01).
  SELECT * INTO v_row FROM public.list_risk_work_orders() WHERE wo_id = pg_temp.wo(1);
  IF v_row.san_approval_id IS DISTINCT FROM 'SAN-ÑÜ_1/x' OR v_row.ceac_number IS DISTINCT FROM 'CEAC #1!' THEN
    RAISE EXCEPTION 'RISKS FAIL — L4: SAN/CEAC en texto libre no llegaron intactos (% / %)', v_row.san_approval_id, v_row.ceac_number;
  END IF;
  -- Socio y gerente llegan como etiquetas (short_name, o nombre + apellido si no hay): E1 tiene socio con short_name y gerente sin él;
  -- E2 no tiene socio (NULL, no cadena vacía). Son solo etiquetas: ninguna otra columna personal ni de montos/horas.
  IF v_row.partner_name IS DISTINCT FROM 'rp.2130' OR v_row.manager_name IS DISTINCT FROM 'U4 Staff2130' THEN
    RAISE EXCEPTION 'RISKS FAIL — L4: la lista no trae socio y gerente de E1 (% / %)', v_row.partner_name, v_row.manager_name;
  END IF;
  SELECT * INTO v_row FROM public.list_risk_work_orders() WHERE wo_id = pg_temp.wo(2);
  IF v_row.partner_name IS NOT NULL OR v_row.manager_name IS DISTINCT FROM 'U4 Staff2130' THEN
    RAISE EXCEPTION 'RISKS FAIL — L4: E2 debía venir sin socio y con gerente en la lista (% / %)', v_row.partner_name, v_row.manager_name;
  END IF;
  SELECT * INTO v_row FROM public.get_risk_work_order(pg_temp.wo(1));
  IF v_row.partner_name IS DISTINCT FROM 'rp.2130' OR v_row.manager_name IS DISTINCT FROM 'U4 Staff2130' THEN
    RAISE EXCEPTION 'RISKS FAIL — L4: el detalle no trae socio y gerente de E1 (% / %)', v_row.partner_name, v_row.manager_name;
  END IF;
  -- Ninguna columna de montos, presupuesto, plan de pagos u horas, en ninguna de las dos formas.
  SELECT string_agg(a.name, ',') INTO v_cols
    FROM pg_proc p, unnest(p.proargnames, p.proargmodes) AS a(name, mode)
   WHERE p.oid IN ('public.list_risk_work_orders()'::regprocedure, 'public.get_risk_work_order(uuid)'::regprocedure)
     AND a.mode = 't' AND a.name ~* '(amount|fee|budget|hours|honorari|monto|rate|currency|payment|installment)';
  IF v_cols IS NOT NULL THEN
    RAISE EXCEPTION 'RISKS FAIL — L4: columnas de montos u horas expuestas (%)', v_cols;
  END IF;
  RAISE NOTICE 'PASS — L4: columnas exactas de lista y detalle (sin montos ni horas) con socio y gerente como etiquetas; SAN/CEAC de texto libre intactos';

  -- ═════════════════════════════════════════════════════════════════
  -- Escritura: approve_wo_risk / reject_wo_risk
  -- ═════════════════════════════════════════════════════════════════

  -- W1 (AC-17, AC-21): el risk_supervisor aprueba la OT1 de un encargo donde no es socio ni gerente. Solo cambian columnas de Riesgos.
  PERFORM pg_temp.impersonate(3);
  v_h := pg_temp.non_risk_hash(pg_temp.wo(1));
  err := pg_temp.try(format('SELECT public.approve_wo_risk(%L)', pg_temp.wo(1)));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'RISKS FAIL — W1: RS no pudo aprobar la OT1 (err=%)', err; END IF;
  SELECT * INTO v_row FROM public.work_orders WHERE wo_id = pg_temp.wo(1);
  IF v_row.risk_status <> 'Approved' OR v_row.risk_approved_at IS NULL
     OR v_row.risk_approved_by IS DISTINCT FROM '52130000-0000-4000-8000-000000000003'::uuid THEN
    RAISE EXCEPTION 'RISKS FAIL — W1: la aprobación no dejó risk_status/risk_approved_by/at del actor (%)', to_jsonb(v_row);
  END IF;
  IF v_row.approval_status <> 'Pending_Approval' THEN
    RAISE EXCEPTION 'RISKS FAIL — W1: el socio no había firmado y approval_status no debía cambiar (%)', v_row.approval_status;
  END IF;
  IF pg_temp.non_risk_hash(pg_temp.wo(1)) IS DISTINCT FROM v_h THEN
    RAISE EXCEPTION 'RISKS FAIL — W1: approve_wo_risk modificó columnas que no son de Riesgos';
  END IF;
  -- Una segunda aprobación ya no pasa la precondición.
  err := pg_temp.try(format('SELECT public.approve_wo_risk(%L)', pg_temp.wo(1)));
  IF err IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'RISKS FAIL — W1: aprobar dos veces debía dar CONFLICT (err=%)', err; END IF;
  RAISE NOTICE 'PASS — W1: RS aprueba en un encargo ajeno, solo cambian columnas de Riesgos y la segunda aprobación da CONFLICT';

  -- W2 (AC-17, AC-16): el risk_partner rechaza la OT2 (socio ya firmado): approval_status y approved_* no cambian; notas guardadas.
  PERFORM pg_temp.impersonate(2);
  v_h := pg_temp.non_risk_hash(pg_temp.wo(2));
  err := pg_temp.try(format('SELECT public.reject_wo_risk(%L, %L)', pg_temp.wo(2), 'faltan anexos'));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'RISKS FAIL — W2: RP no pudo rechazar la OT2 (err=%)', err; END IF;
  SELECT * INTO v_row FROM public.work_orders WHERE wo_id = pg_temp.wo(2);
  IF v_row.risk_status <> 'Rejected' OR v_row.risk_notes IS DISTINCT FROM 'faltan anexos' THEN
    RAISE EXCEPTION 'RISKS FAIL — W2: el rechazo no dejó risk_status = Rejected y risk_notes (%)', to_jsonb(v_row);
  END IF;
  IF v_row.approval_status <> 'Pending_Approval' OR v_row.approved_at IS NULL
     OR v_row.approved_by IS DISTINCT FROM '52130000-0000-4000-8000-000000000004'::uuid THEN
    RAISE EXCEPTION 'RISKS FAIL — W2: el rechazo tocó approval_status o la firma del socio (%)', to_jsonb(v_row);
  END IF;
  IF pg_temp.non_risk_hash(pg_temp.wo(2)) IS DISTINCT FROM v_h THEN
    RAISE EXCEPTION 'RISKS FAIL — W2: reject_wo_risk modificó columnas que no son de Riesgos';
  END IF;
  err := pg_temp.try(format('SELECT public.reject_wo_risk(%L, %L)', pg_temp.wo(2), 'otra vez'));
  IF err IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'RISKS FAIL — W2: rechazar una pista ya rechazada debía dar CONFLICT (err=%)', err; END IF;
  RAISE NOTICE 'PASS — W2: RP rechaza sin tocar approval_status ni la firma del socio; risk_notes guardadas; el segundo rechazo da CONFLICT';

  -- W3: precondiciones — OT en Draft y campos incompletos dan CONFLICT (con admin, para que la causa no sea el permiso).
  PERFORM pg_temp.impersonate(1);
  err := pg_temp.try(format('SELECT public.approve_wo_risk(%L)', pg_temp.wo(5)));
  IF err IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'RISKS FAIL — W3: aprobar una OT en Draft debía dar CONFLICT (err=%)', err; END IF;
  err := pg_temp.try(format('SELECT public.reject_wo_risk(%L)', pg_temp.wo(5)));
  IF err IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'RISKS FAIL — W3: rechazar una OT en Draft debía dar CONFLICT (err=%)', err; END IF;
  err := pg_temp.try(format('SELECT public.approve_wo_risk(%L)', pg_temp.wo(7)));
  IF err IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'RISKS FAIL — W3: aprobar una OT de emergencia (campos vacíos) por la vía normal debía dar CONFLICT (err=%)', err; END IF;
  err := pg_temp.try(format('SELECT public.approve_wo_risk(%L)', '00000000-0000-4000-8000-000000000000'));
  IF err IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'RISKS FAIL — W3: aprobar un wo_id inexistente debía dar NOT_FOUND (err=%)', err; END IF;
  RAISE NOTICE 'PASS — W3: Draft, emergencia por la vía normal e inexistente dan CONFLICT / NOT_FOUND';

  -- W4 (AC-19, AC-28): gerente, SQR, ITA, asistente, anon y sin sesión no aprueban, no rechazan y no firman emergencia.
  FOREACH n IN ARRAY ARRAY[4, 5, 6, 7] LOOP
    PERFORM pg_temp.impersonate(n);
    err := pg_temp.try(format('SELECT public.approve_wo_risk(%L)', pg_temp.wo(7)));
    IF err IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'RISKS FAIL — W4: approve_wo_risk no dio FORBIDDEN a U% (err=%)', n, err; END IF;
    err := pg_temp.try(format('SELECT public.reject_wo_risk(%L, %L)', pg_temp.wo(7), 'x'));
    IF err IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'RISKS FAIL — W4: reject_wo_risk no dio FORBIDDEN a U% (err=%)', n, err; END IF;
    err := pg_temp.try(format('SELECT public.approve_wo_emergency_review(%L)', pg_temp.wo(7)));
    IF err IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'RISKS FAIL — W4: approve_wo_emergency_review no dio FORBIDDEN a U% (err=%)', n, err; END IF;
    err := pg_temp.try(format('SELECT public.approve_wo_emergency_partner(%L)', pg_temp.wo(7)));
    IF err IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'RISKS FAIL — W4: approve_wo_emergency_partner no dio FORBIDDEN a U% (err=%)', n, err; END IF;
  END LOOP;
  PERFORM pg_temp.as_anon();
  err := pg_temp.try(format('SELECT public.approve_wo_risk(%L)', pg_temp.wo(7)));
  IF err IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'RISKS FAIL — W4: anon no dio FORBIDDEN (err=%)', err; END IF;
  PERFORM pg_temp.no_session();
  err := pg_temp.try(format('SELECT public.approve_wo_risk(%L)', pg_temp.wo(7)));
  IF err IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'RISKS FAIL — W4: sin sesión no dio FORBIDDEN (err=%)', err; END IF;
  -- Estado intacto tras los rechazos: la OT7 sigue sin ninguna firma de Riesgos.
  IF EXISTS (SELECT 1 FROM public.work_orders WHERE wo_id = pg_temp.wo(7)
              AND (risk_status <> 'Pending' OR emergency_review_at IS NOT NULL OR emergency_partner_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'RISKS FAIL — W4: una llamada rechazada dejó rastro en la OT7';
  END IF;
  RAISE NOTICE 'PASS — W4: gerente, SQR, ITA, asistente, anon y sin sesión reciben FORBIDDEN en las cuatro escrituras y no dejan rastro (contraparte: W1/W2)';

  -- ═════════════════════════════════════════════════════════════════
  -- Emergencia: paso 1 (revisión) y paso 2 (firma del Socio de Riesgos)
  -- ═════════════════════════════════════════════════════════════════

  -- E1 (AC-20, H-6): el paso 2 exige el paso 1. Con el paso 1 pendiente, ni siquiera el risk_partner puede firmar.
  PERFORM pg_temp.impersonate(2);
  err := pg_temp.try(format('SELECT public.approve_wo_emergency_partner(%L)', pg_temp.wo(6)));
  IF err IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'RISKS FAIL — E1: el paso 2 sin paso 1 debía dar CONFLICT (err=%)', err; END IF;

  -- E2: el risk_supervisor hace el paso 1 (D-38) y se registra a su nombre; el paso 1 repetido da CONFLICT ("el primero gana").
  PERFORM pg_temp.impersonate(3);
  err := pg_temp.try(format('SELECT public.approve_wo_emergency_review(%L)', pg_temp.wo(6)));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'RISKS FAIL — E2: RS no pudo hacer el paso 1 (err=%)', err; END IF;
  SELECT * INTO v_row FROM public.work_orders WHERE wo_id = pg_temp.wo(6);
  IF v_row.emergency_review_at IS NULL OR v_row.emergency_review_by IS DISTINCT FROM '52130000-0000-4000-8000-000000000003'::uuid
     OR v_row.emergency_partner_at IS NOT NULL OR v_row.risk_status <> 'Pending' OR v_row.emergency_deadline_at IS NOT NULL THEN
    RAISE EXCEPTION 'RISKS FAIL — E2: el paso 1 solo debía registrar emergency_review_by/at (sin fecha límite ni cierre) (%)', to_jsonb(v_row);
  END IF;
  err := pg_temp.try(format('SELECT public.approve_wo_emergency_review(%L)', pg_temp.wo(6)));
  IF err IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'RISKS FAIL — E2: el paso 1 repetido debía dar CONFLICT (err=%)', err; END IF;

  -- E3 (AC-20, H-6): el risk_supervisor NO puede firmar el paso 2 (FORBIDDEN, y la OT no cambia); contraparte: el risk_partner sí.
  err := pg_temp.try(format('SELECT public.approve_wo_emergency_partner(%L)', pg_temp.wo(6)));
  IF err IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'RISKS FAIL — E3: RS firmó o no recibió FORBIDDEN en el paso 2 (err=%)', err; END IF;
  IF EXISTS (SELECT 1 FROM public.work_orders WHERE wo_id = pg_temp.wo(6) AND emergency_partner_at IS NOT NULL) THEN
    RAISE EXCEPTION 'RISKS FAIL — E3: el paso 2 rechazado dejó emergency_partner_at';
  END IF;

  -- E4 (AC-18, AC-20): el risk_partner firma el paso 2 sobre la OT6 (el socio ya firmó): Emergency_Approved, fecha límite = fecha de La Paz + 7,
  -- approval_status = Approved. Solo cambian columnas de Riesgos y approval_status.
  PERFORM pg_temp.impersonate(2);
  v_h := pg_temp.non_risk_hash(pg_temp.wo(6));
  err := pg_temp.try(format('SELECT public.approve_wo_emergency_partner(%L)', pg_temp.wo(6)));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'RISKS FAIL — E4: RP no pudo firmar el paso 2 (err=%)', err; END IF;
  SELECT * INTO v_row FROM public.work_orders WHERE wo_id = pg_temp.wo(6);
  IF v_row.risk_status <> 'Emergency_Approved' OR v_row.emergency_partner_at IS NULL
     OR v_row.emergency_partner_by IS DISTINCT FROM '52130000-0000-4000-8000-000000000002'::uuid THEN
    RAISE EXCEPTION 'RISKS FAIL — E4: el paso 2 no dejó Emergency_Approved con el firmante (%)', to_jsonb(v_row);
  END IF;
  IF v_row.emergency_deadline_at IS DISTINCT FROM v_today + 7 THEN
    RAISE EXCEPTION 'RISKS FAIL — E4: la fecha límite debía ser la fecha de La Paz + 7 (%), es %', v_today + 7, v_row.emergency_deadline_at;
  END IF;
  IF v_row.approval_status <> 'Approved' THEN
    RAISE EXCEPTION 'RISKS FAIL — E4: con el socio ya firmado el paso 2 debía cerrar approval_status = Approved (%)', v_row.approval_status;
  END IF;
  IF pg_temp.non_risk_hash(pg_temp.wo(6)) IS DISTINCT FROM v_h THEN
    RAISE EXCEPTION 'RISKS FAIL — E4: approve_wo_emergency_partner modificó columnas que no son de Riesgos';
  END IF;
  -- La segunda firma da CONFLICT ("el primero gana") y no mueve la fecha.
  err := pg_temp.try(format('SELECT public.approve_wo_emergency_partner(%L)', pg_temp.wo(6)));
  IF err IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'RISKS FAIL — E4: la segunda firma debía dar CONFLICT (err=%)', err; END IF;
  -- Y una emergencia firmada aparece en la lista con su fecha límite (AC-13) y no se puede aprobar por la vía normal ni rechazar con datos vacíos.
  PERFORM pg_temp.impersonate(1);
  SELECT * INTO v_row FROM public.list_risk_work_orders() WHERE wo_id = pg_temp.wo(6);
  IF v_row.risk_status <> 'Emergency_Approved' OR v_row.emergency_deadline_at IS DISTINCT FROM v_today + 7
     OR v_row.has_emergency_justification IS NOT TRUE THEN
    RAISE EXCEPTION 'RISKS FAIL — E4: la lista no muestra la emergencia firmada con su fecha límite y motivo (%)', to_jsonb(v_row);
  END IF;
  RAISE NOTICE 'PASS — E1-E4: paso 2 exige el paso 1; RS hace el paso 1 y no el 2 (FORBIDDEN); RP firma: Emergency_Approved, La Paz+7, cierra approval_status; la segunda firma da CONFLICT';

  -- E5 (AC-18, H-6): el admin también firma el paso 2; con el socio SIN firmar approval_status no se cierra.
  PERFORM pg_temp.impersonate(1);
  err := pg_temp.try(format('SELECT public.approve_wo_emergency_review(%L)', pg_temp.wo(7)));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'RISKS FAIL — E5: el admin no pudo hacer el paso 1 (err=%)', err; END IF;
  err := pg_temp.try(format('SELECT public.approve_wo_emergency_partner(%L)', pg_temp.wo(7)));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'RISKS FAIL — E5: el admin no pudo firmar el paso 2 (err=%)', err; END IF;
  SELECT * INTO v_row FROM public.work_orders WHERE wo_id = pg_temp.wo(7);
  IF v_row.risk_status <> 'Emergency_Approved' OR v_row.approval_status <> 'Pending_Approval'
     OR v_row.emergency_deadline_at IS DISTINCT FROM v_today + 7 THEN
    RAISE EXCEPTION 'RISKS FAIL — E5: el paso 2 del admin debía dejar Emergency_Approved, fecha La Paz+7 y approval_status sin cerrar (%)', to_jsonb(v_row);
  END IF;
  RAISE NOTICE 'PASS — E5: el admin firma el paso 2; sin firma del socio la OT no se cierra';

  -- E6: rechazar una emergencia limpia las marcas emergency_* (el reenvío reinicia el flujo desde el paso 1). OT7 sigue en Emergency_Approved
  -- (rechazable: showRiskActions solo excluye Approved y Rejected).
  err := pg_temp.try(format('SELECT public.reject_wo_risk(%L, %L)', pg_temp.wo(7), 'regularizar'));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'RISKS FAIL — E6: no se pudo rechazar la emergencia firmada (err=%)', err; END IF;
  SELECT * INTO v_row FROM public.work_orders WHERE wo_id = pg_temp.wo(7);
  IF v_row.risk_status <> 'Rejected' OR v_row.emergency_review_at IS NOT NULL OR v_row.emergency_partner_at IS NOT NULL
     OR v_row.emergency_deadline_at IS NOT NULL OR v_row.emergency_justification IS NOT NULL
     OR v_row.emergency_review_by IS NOT NULL OR v_row.emergency_partner_by IS NOT NULL THEN
    RAISE EXCEPTION 'RISKS FAIL — E6: el rechazo debía limpiar todas las columnas emergency_* (%)', to_jsonb(v_row);
  END IF;
  RAISE NOTICE 'PASS — E6: el rechazo limpia emergency_review/partner/deadline/justification';

  -- ═════════════════════════════════════════════════════════════════
  -- Estructura
  -- ═════════════════════════════════════════════════════════════════

  -- S1 (AC-21, D-37): ninguna política de UPDATE (ni ALL) sobre work_orders menciona sqr_id.
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'work_orders' AND cmd IN ('UPDATE', 'ALL')
     AND (coalesce(qual, '') || coalesce(with_check, '')) ~* 'sqr_id';
  IF n <> 0 THEN
    RAISE EXCEPTION 'RISKS FAIL — S1: % política(s) de UPDATE sobre work_orders todavía consultan sqr_id', n;
  END IF;
  RAISE NOTICE 'PASS — S1: ninguna política de UPDATE sobre work_orders referencia sqr_id';

  -- S2: las seis funciones son SECURITY DEFINER con search_path fijo.
  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('list_risk_work_orders', 'get_risk_work_order', 'approve_wo_risk', 'reject_wo_risk',
                       'approve_wo_emergency_review', 'approve_wo_emergency_partner')
     AND p.prosecdef AND 'search_path=public' = ANY (p.proconfig);
  IF n <> 6 THEN RAISE EXCEPTION 'RISKS FAIL — S2: se esperaban 6 funciones DEFINER con search_path fijo y hay %', n; END IF;
  RAISE NOTICE 'PASS — S2: las seis funciones son SECURITY DEFINER con search_path = public';

  PERFORM pg_temp.no_session();
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- ACL — EXECUTE se evalúa contra el rol de la sesión, así que esta sección sí cambia de rol.
-- ════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  f      text;
  denied boolean;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.list_risk_work_orders()',
    'public.get_risk_work_order(uuid)',
    'public.approve_wo_risk(uuid)',
    'public.reject_wo_risk(uuid,text)',
    'public.approve_wo_emergency_review(uuid)',
    'public.approve_wo_emergency_partner(uuid)'
  ] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'RISKS FAIL — ACL: anon tiene EXECUTE sobre %', f;
    END IF;
    IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'RISKS FAIL — ACL: authenticated perdió EXECUTE sobre % (la app lo necesita)', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — ACL estática: anon sin EXECUTE y authenticated con EXECUTE en las seis funciones';

  -- Runtime: anon real recibe insufficient_privilege antes de llegar a la función.
  EXECUTE 'SET LOCAL ROLE anon';
  denied := false;
  BEGIN
    PERFORM public.list_risk_work_orders();
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT denied THEN
    RAISE EXCEPTION 'RISKS FAIL — ACL: anon pudo invocar list_risk_work_orders';
  END IF;
  RAISE NOTICE 'PASS — ACL runtime: anon recibe permission denied';

  RAISE NOTICE 'RISKS RPC 1028-213: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;

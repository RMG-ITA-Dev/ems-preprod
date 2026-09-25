-- Tests transaccionales de public.enforce_engagement_creator_team() / trg_engagements_creator_team
-- — BUG 0810-172 (bugs/0810-172/plan_v2.md, sección "Tests to Add or Update" §4).
--
-- DÓNDE CORRE: a mano, pegándolo tal cual en el SQL Editor de un proyecto Supabase con el esquema al
-- día (incluida la migración 20260817130000). Es UNA sola transacción que SIEMPRE termina en
-- ROLLBACK, así que no deja rastro. En el SQL Editor los NOTICE no siempre se muestran, así que el
-- criterio es: si no hay error, pasó — cada chequeo fallido levanta un RAISE EXCEPTION con su
-- motivo.
--
-- NO está cableado en ningún workflow de CI, igual que supabase/tests/rpc-engagement-team-
-- candidates.sql (0722-162). Cablear ambos es una tarea aparte (plan_v2 §Open Questions #7).
--
-- Misma convención que rpc-engagement-team-candidates.sql: un NOTICE por chequeo que pasa y al
-- final "TRIGGER ENGAGEMENT CREATOR TEAM: ALL CHECKS PASSED (rolled back)".
--
-- Qué se cubre:
--   1. Gerente que manda el manager_id de otro por el RPC ⇒ persiste el propio; partner_id intacto.
--   1c. hr_manager se comporta igual que Gerente en manager_id (BUG 0817-180, decisión del
--       operador 2026-08-27: "no hagamos casos especiales" — Talento Humano ya tiene
--       engagement.create real, sin necesidad de grant temporal dentro de esta transacción).
--   2. Socio que manda el partner_id de otro ⇒ persiste el propio; manager_id intacto.
--   3. Director se comporta como Socio (mismo campo).
--   4. La misma canonización en un INSERT DIRECTO a la tabla, no solo por el RPC.
--   5. admin (role_key) ⇒ los valores enviados se preservan, sin reescritura.
--   6. ita_manager / tax_manager ⇒ se canonizan en manager_id, igual que Gerente
--      (BUG 0828-185, decisión del operador: se agregan al campo Gerente/Supervisor).
--   7. Llamante sin staff vinculado ⇒ payload intacto, sin error.
--   8. UPDATE ⇒ la regla NO aplica (el trigger es solo de creación).
--   9. trg_engagements_created_by sigue registrando created_by_staff_id.
--  10. El trigger es BEFORE INSERT ROW, y el RPC sigue teniendo exactamente 1 firma.
--  11. manager_id = specialist_it_id/specialist_tax_id ⇒ rechazado por
--      chk_engagements_manager_not_specialist (BUG 0828-185, plan_v0 §5b).
--
-- Fixture: todos los ids llevan el prefijo ect- reconocible (ect = engagement creator team).
--
-- ACTUALIZADO por BUG 0817-180 (trigger `enforce_engagement_profile_scope`, misma tabla, mismo
-- evento INSERT): el nuevo guard exige (a) `engagement.create` para cualquier INSERT autenticado
-- — antes el RPC SECURITY DEFINER lo saltaba — y (b) para role_key fuera de admin/senior_partner,
-- que society_id/practica/oficina coincidan con la ficha del creador. Consecuencias sobre este
-- fixture:
--   - Los 7 sujetos con ficha ahora necesitan `city` (antes ausente): `create_eng()` siempre manda
--     p_oficina=1, así que se fija 'La Paz' (-> oficina 1) para los 7.
--   - `partner`/`director` no tienen `engagement.create` en el seed real (solo admin/manager/
--     ita_manager/tax_manager) — antes invisible porque el RPC saltaba la RLS. Se les concede acá,
--     DENTRO de esta transacción que siempre hace ROLLBACK, para seguir ejercitando la canonización
--     de Socio/Director sin tocar la matriz de permisos real (decisión del operador en 0817-180,
--     OQ2/OQ6: no tocar el seed de producción).
--   - CHECK 7 (Gerente sin ficha) cambia de "pasa igual, sin canonizar" a "se rechaza": 0817-180 es
--     fail-closed para un creador restringido sin ficha vinculada.
--   - CHECK 4 (INSERT directo) ahora manda también society_id/oficina/practica coincidentes con la
--     ficha del sujeto 1, o el guard nuevo lo rechazaría antes de llegar a la canonización que este
--     check en realidad prueba.

BEGIN;

-- ── Guardas de fixture: dependencias de catálogo que este test reutiliza en vez de inventar ────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.society WHERE is_active) THEN
    RAISE EXCEPTION 'FIXTURE: no hay sociedad activa; el RPC la exige y staff.society_id es NOT NULL.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.practicas WHERE code = 1 AND is_active) THEN
    RAISE EXCEPTION 'FIXTURE: falta el servicio activo code = 1; el RPC valida la práctica contra él.';
  END IF;
END $$;

-- ── auth.users para los llamantes y los objetivos ──────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('ec700000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'ect-test-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      -- 9: hr_manager llamante (BUG 0817-180, CHECK 1c).
      -- 10: tax_manager llamante (BUG 0828-185, CHECK 6b).
      FROM generate_series(1, 10) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ── Personal ───────────────────────────────────────────────────────────────────────────────────
-- 1 Gerente llamante · 2 Socio llamante · 3 Director llamante · 4 admin llamante
-- 5 ita_manager llamante · 6 otro Gerente (objetivo) · 7 otro Socio (objetivo)
-- 8: a propósito SIN ficha de personal (llamante `manager` sin staff vinculado).
-- 9: hr_manager llamante (BUG 0817-180, CHECK 1c) — necesita ficha completa, igual que 1..7.
-- 10: tax_manager llamante (BUG 0828-185, CHECK 6b) — ídem.
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, city)
SELECT ('5ec00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('ec700000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'ECT', 'Sujeto' || lpad(n::text, 2, '0'),
       true,
       (SELECT practica_id FROM public.practicas WHERE code = 1 AND is_active LIMIT 1),
       (SELECT society_id FROM public.society WHERE is_active ORDER BY name LIMIT 1),
       -- BUG 0817-180: 'La Paz' -> oficina 1, lo que `pg_temp.create_eng()` ya manda como
       -- p_oficina para los sujetos con ficha.
       'La Paz'
  FROM generate_series(1, 7) n
UNION ALL
SELECT ('5ec00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('ec700000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'ECT', 'Sujeto' || lpad(n::text, 2, '0'),
       true,
       (SELECT practica_id FROM public.practicas WHERE code = 1 AND is_active LIMIT 1),
       (SELECT society_id FROM public.society WHERE is_active ORDER BY name LIMIT 1),
       'La Paz'
  FROM generate_series(9, 10) n;

-- BUG 0817-180: partner/director no tienen `engagement.create` en el seed real (solo admin/
-- manager/ita_manager/tax_manager) — el nuevo trigger lo exige incluso para el RPC (antes lo
-- saltaba via SECURITY DEFINER). Se concede acá, solo dentro de esta transacción (ROLLBACK al
-- final), para seguir probando la canonización de Socio/Director sin tocar la matriz real.
INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
VALUES ('partner', 'engagement.create', 'assigned_engagements'),
       ('director', 'engagement.create', 'assigned_engagements')
ON CONFLICT (role_key, permission_key) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('ec700000-0000-4000-8000-000000000001', 'manager'),
  ('ec700000-0000-4000-8000-000000000002', 'partner'),
  ('ec700000-0000-4000-8000-000000000003', 'director'),
  ('ec700000-0000-4000-8000-000000000004', 'admin'),
  ('ec700000-0000-4000-8000-000000000005', 'ita_manager'),
  ('ec700000-0000-4000-8000-000000000006', 'manager'),
  ('ec700000-0000-4000-8000-000000000007', 'partner'),
  -- 8: rol Gerente pero sin ficha de personal ⇒ get_my_staff_id() devuelve NULL.
  ('ec700000-0000-4000-8000-000000000008', 'manager'),
  -- 9: hr_manager llamante (BUG 0817-180, CHECK 1c) — ya tiene engagement.create real, sin
  -- necesidad del grant temporal que sí hace falta para partner/director más abajo.
  ('ec700000-0000-4000-8000-000000000009', 'hr_manager'),
  -- 10: tax_manager llamante (BUG 0828-185, CHECK 6b) — ya tiene engagement.create real
  -- (20260724010000), igual que ita_manager (5).
  ('ec700000-0000-4000-8000-000000000010', 'tax_manager')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

-- ── Cliente del fixture ────────────────────────────────────────────────────────────────────────
INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id, is_active)
VALUES ('c1c00000-0000-4000-8000-000000000001', 'ECT Cliente de Prueba', 'ECT-TAX-0810172', true);

-- ── Helpers ────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

-- Crea un encargo por el RPC variando SOLO partner/manager; el resto son valores fijos válidos.
-- fecha_cierre 2026-03-31 ⇒ año fiscal derivado 2026, así que no hace falta el override de admin.
CREATE FUNCTION pg_temp.create_eng(p_name text, p_partner uuid, p_manager uuid)
RETURNS public.engagements
LANGUAGE sql AS $$
  SELECT public.create_engagement_with_code(
    p_engagement_name      := p_name,
    p_client_id            := 'c1c00000-0000-4000-8000-000000000001'::uuid,
    p_partner_id           := p_partner,
    p_manager_id           := p_manager,
    p_start_date           := '2025-10-01'::date,
    p_end_date             := '2026-09-30'::date,
    p_status               := 'active',
    p_oficina              := 1::smallint,
    p_practica             := 1::smallint,
    -- 0722-160: funcion 1 (Cliente). Esta suite solo verifica la canonizacion de
    -- created_by_staff_id/manager_id/partner_id, pero el 0 que traia antes ahora activa
    -- enforce_administrative_engagement_rules(), que exige el cliente interno de la
    -- sociedad y rechazaba TODA creacion de este fixture con
    -- '0722-160: el cliente interno debe corresponder a la sociedad del encargo'.
    p_funcion              := 1::smallint,
    p_anio_fiscal          := 2026,
    p_work_order_required  := true,
    p_activity_required    := true,
    p_is_internal          := true,
    p_approval_required    := true,
    p_fecha_cierre         := '2026-03-31'::date,
    p_anio_fiscal_override := false,
    p_society_id           := (SELECT society_id FROM public.society WHERE is_active ORDER BY name LIMIT 1)
  );
$$;

-- Ids cortos para leer las aserciones.
CREATE FUNCTION pg_temp.s(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('5ec00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'ec700000-0000-4000-8000-' || lpad(n::text, 12, '0')
$$;

-- ── #10a: forma del trigger (antes de cualquier escritura) ─────────────────────────────────────
DO $$
DECLARE v_tgtype smallint;
BEGIN
  SELECT tgtype INTO v_tgtype
    FROM pg_trigger
   WHERE tgrelid = 'public.engagements'::regclass
     AND tgname  = 'trg_engagements_creator_team'
     AND NOT tgisinternal;

  IF v_tgtype IS NULL THEN
    RAISE EXCEPTION 'CHECK 10a: no existe el trigger trg_engagements_creator_team — ¿se aplicó 20260817130000?';
  END IF;
  -- ROW(1) | BEFORE(2) | INSERT(4) = 7. Si trajera UPDATE(16) o DELETE(8) sería otro valor.
  IF v_tgtype <> 7 THEN
    RAISE EXCEPTION 'CHECK 10a: el trigger debe ser BEFORE INSERT FOR EACH ROW (tgtype 7), es %', v_tgtype;
  END IF;
  RAISE NOTICE 'CHECK 10a OK: trg_engagements_creator_team es BEFORE INSERT FOR EACH ROW.';
END $$;

-- ── #10b: la migración NO tocó el RPC ──────────────────────────────────────────────────────────
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc
   WHERE proname = 'create_engagement_with_code'
     AND pronamespace = 'public'::regnamespace;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CHECK 10b: se esperaba 1 firma de create_engagement_with_code, hay %', v_count;
  END IF;
  RAISE NOTICE 'CHECK 10b OK: create_engagement_with_code sigue con una sola firma.';
END $$;

SET LOCAL ROLE authenticated;

-- ── #1: Gerente ⇒ se canoniza manager_id; partner_id intacto ───────────────────────────────────
DO $$
DECLARE v_eng public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  -- Manda deliberadamente al OTRO Gerente (6) y a un Socio cualquiera (7).
  v_eng := pg_temp.create_eng('ECT Gerente manda a otro', pg_temp.s(7), pg_temp.s(6));

  IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(1) THEN
    RAISE EXCEPTION 'CHECK 1: manager_id debía canonizarse al llamante (%), es %',
      pg_temp.s(1), v_eng.manager_id;
  END IF;
  IF v_eng.partner_id IS DISTINCT FROM pg_temp.s(7) THEN
    RAISE EXCEPTION 'CHECK 1: partner_id NO debía tocarse, esperaba % y es %',
      pg_temp.s(7), v_eng.partner_id;
  END IF;
  RAISE NOTICE 'CHECK 1 OK: Gerente canonizado en manager_id, partner_id intacto.';
END $$;

-- ── #1c: hr_manager ⇒ se canoniza manager_id, igual que Gerente ───────────────────────────────
-- BUG 0817-180 (2026-08-27): decisión del operador de no tratar a Talento Humano como caso
-- especial. hr_manager ya tiene engagement.create en la matriz real (grant previo de 0817-180),
-- así que a diferencia de partner/director más abajo no necesita ningún grant temporal acá.
DO $$
DECLARE v_eng public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(9));
  -- Manda deliberadamente al OTRO Gerente (6) y a un Socio cualquiera (7).
  v_eng := pg_temp.create_eng('ECT hr_manager manda a otro', pg_temp.s(7), pg_temp.s(6));

  IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(9) THEN
    RAISE EXCEPTION 'CHECK 1c: manager_id debía canonizarse al llamante (%), es %',
      pg_temp.s(9), v_eng.manager_id;
  END IF;
  IF v_eng.partner_id IS DISTINCT FROM pg_temp.s(7) THEN
    RAISE EXCEPTION 'CHECK 1c: partner_id NO debía tocarse, esperaba % y es %',
      pg_temp.s(7), v_eng.partner_id;
  END IF;
  RAISE NOTICE 'CHECK 1c OK: hr_manager canonizado en manager_id igual que Gerente, partner_id intacto.';
END $$;

-- ── #2: Socio ⇒ se canoniza partner_id; manager_id intacto ─────────────────────────────────────
DO $$
DECLARE v_eng public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));
  v_eng := pg_temp.create_eng('ECT Socio manda a otro', pg_temp.s(7), pg_temp.s(6));

  IF v_eng.partner_id IS DISTINCT FROM pg_temp.s(2) THEN
    RAISE EXCEPTION 'CHECK 2: partner_id debía canonizarse al llamante (%), es %',
      pg_temp.s(2), v_eng.partner_id;
  END IF;
  IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(6) THEN
    RAISE EXCEPTION 'CHECK 2: manager_id NO debía tocarse, esperaba % y es %',
      pg_temp.s(6), v_eng.manager_id;
  END IF;
  RAISE NOTICE 'CHECK 2 OK: Socio canonizado en partner_id, manager_id intacto.';
END $$;

-- ── #3: Director se comporta como Socio ────────────────────────────────────────────────────────
DO $$
DECLARE v_eng public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v_eng := pg_temp.create_eng('ECT Director manda a otro', pg_temp.s(7), pg_temp.s(6));

  IF v_eng.partner_id IS DISTINCT FROM pg_temp.s(3) THEN
    RAISE EXCEPTION 'CHECK 3: el Director debía canonizarse en partner_id (%), es %',
      pg_temp.s(3), v_eng.partner_id;
  END IF;
  RAISE NOTICE 'CHECK 3 OK: Director canonizado en partner_id, igual que el Socio.';
END $$;

-- ── #1b: mandar NULL tampoco evade la regla ────────────────────────────────────────────────────
DO $$
DECLARE v_eng public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v_eng := pg_temp.create_eng('ECT Gerente manda NULL', pg_temp.s(7), NULL);

  IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(1) THEN
    RAISE EXCEPTION 'CHECK 1b: con manager_id NULL igual debía canonizarse a %, es %',
      pg_temp.s(1), v_eng.manager_id;
  END IF;
  RAISE NOTICE 'CHECK 1b OK: un manager_id NULL no evade la canonización.';
END $$;

-- ── #5: admin conserva control total ──────────────────────────────────────────────────────────
DO $$
DECLARE v_eng public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  v_eng := pg_temp.create_eng('ECT Admin manda a quien quiere', pg_temp.s(7), pg_temp.s(6));

  IF v_eng.partner_id IS DISTINCT FROM pg_temp.s(7) OR v_eng.manager_id IS DISTINCT FROM pg_temp.s(6) THEN
    RAISE EXCEPTION 'CHECK 5: al admin no se le reescribe nada; esperaba %/% y quedó %/%',
      pg_temp.s(7), pg_temp.s(6), v_eng.partner_id, v_eng.manager_id;
  END IF;
  RAISE NOTICE 'CHECK 5 OK: el admin conserva los valores enviados.';
END $$;

-- ── #6: ita_manager ⇒ se canoniza manager_id (BUG 0828-185: ampliación de autoasignación) ──────
DO $$
DECLARE v_eng public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(5));
  v_eng := pg_temp.create_eng('ECT ita_manager manda a otro', pg_temp.s(7), pg_temp.s(6));

  IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(5) THEN
    RAISE EXCEPTION 'CHECK 6: manager_id debía canonizarse al llamante ita_manager (%), es %',
      pg_temp.s(5), v_eng.manager_id;
  END IF;
  IF v_eng.partner_id IS DISTINCT FROM pg_temp.s(7) THEN
    RAISE EXCEPTION 'CHECK 6: partner_id NO debía tocarse, esperaba % y es %',
      pg_temp.s(7), v_eng.partner_id;
  END IF;
  RAISE NOTICE 'CHECK 6 OK: ita_manager canonizado en manager_id (BUG 0828-185), partner_id intacto.';
END $$;

-- ── #6b: tax_manager ⇒ se canoniza manager_id, igual que ita_manager (BUG 0828-185) ────────────
DO $$
DECLARE v_eng public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(10));
  v_eng := pg_temp.create_eng('ECT tax_manager manda a otro', pg_temp.s(7), pg_temp.s(6));

  IF v_eng.manager_id IS DISTINCT FROM pg_temp.s(10) THEN
    RAISE EXCEPTION 'CHECK 6b: manager_id debía canonizarse al llamante tax_manager (%), es %',
      pg_temp.s(10), v_eng.manager_id;
  END IF;
  IF v_eng.partner_id IS DISTINCT FROM pg_temp.s(7) THEN
    RAISE EXCEPTION 'CHECK 6b: partner_id NO debía tocarse, esperaba % y es %',
      pg_temp.s(7), v_eng.partner_id;
  END IF;
  RAISE NOTICE 'CHECK 6b OK: tax_manager canonizado en manager_id (BUG 0828-185), partner_id intacto.';
END $$;

-- ── #7: llamante con rol Gerente pero SIN staff vinculado ─────────────────────────────────────
-- BUG 0817-180: antes esto pasaba intacto (fail-open de enforce_engagement_creator_team, que solo
-- canoniza y no bloquea). El trigger nuevo es fail-closed: un creador restringido sin ficha
-- vinculada no puede resolver sociedad/practica/oficina, así que la creación se rechaza.
DO $$
DECLARE v_eng public.engagements;
    v_raised boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(8));
  IF public.get_my_staff_id() IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE 7: el sujeto 8 no debía tener ficha de personal.';
  END IF;

  BEGIN
    v_eng := pg_temp.create_eng('ECT Gerente sin ficha', pg_temp.s(7), pg_temp.s(6));
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 7: sin staff vinculado 0817-180 debe rechazar la creación (fail-closed), pero no se levantó ninguna excepción.';
  END IF;
  RAISE NOTICE 'CHECK 7 OK: sin staff vinculado la creación se rechaza (BUG 0817-180, fail-closed).';
END $$;

-- ── #4: INSERT DIRECTO por REST, no solo por el RPC ───────────────────────────────────────────
DO $$
DECLARE v_manager uuid;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  -- `manager` tiene engagement.create, así que la policy "engagements write insert" lo permite.
  -- fecha_cierre NOT NULL sin default (20260702000000): el RPC de los demás checks lo resuelve
  -- solo; este INSERT directo lo pasa a mano igual que el resto del fixture (2026-03-31).
  -- BUG 0817-180: society_id/oficina/practica ahora deben coincidir con la ficha del sujeto 1
  -- (society_id del fixture, code=1, oficina=1 por 'La Paz') o el nuevo trigger de perfil los
  -- rechazaría antes de llegar a la canonización que este check en realidad prueba.
  INSERT INTO public.engagements (client_id, engagement_name, partner_id, manager_id, fecha_cierre, society_id, oficina, practica)
  VALUES (
    'c1c00000-0000-4000-8000-000000000001', 'ECT Insert directo', pg_temp.s(7), pg_temp.s(6), '2026-03-31',
    (SELECT society_id FROM public.society WHERE is_active ORDER BY name LIMIT 1),
    1,
    1
  )
  RETURNING manager_id INTO v_manager;

  IF v_manager IS DISTINCT FROM pg_temp.s(1) THEN
    RAISE EXCEPTION 'CHECK 4: el INSERT directo también debe canonizarse a %, quedó %',
      pg_temp.s(1), v_manager;
  END IF;
  RAISE NOTICE 'CHECK 4 OK: el INSERT directo por tabla también se canoniza.';
END $$;

-- ── #9: created_by_staff_id sigue registrándose ───────────────────────────────────────────────
DO $$
DECLARE v_created_by uuid;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  SELECT created_by_staff_id INTO v_created_by
    FROM public.engagements
   WHERE engagement_name = 'ECT Insert directo';

  IF v_created_by IS DISTINCT FROM pg_temp.s(1) THEN
    RAISE EXCEPTION 'CHECK 9: trg_engagements_created_by debía registrar % y registró %',
      pg_temp.s(1), v_created_by;
  END IF;
  RAISE NOTICE 'CHECK 9 OK: el trigger de created_by_staff_id sigue funcionando junto al nuevo.';
END $$;

-- ── #11: manager_id = specialist_it_id ⇒ rechazado por el CHECK (BUG 0828-185, plan_v0 §5b) ─────
-- manager_id se manda NULL a propósito: el trigger de arriba lo canoniza al llamante (Gerente,
-- sujeto 1) ANTES de que se valide la declarative CHECK constraint sobre la fila final -- así se
-- prueba la interacción real trigger+constraint, no solo el constraint aislado.
DO $$
DECLARE v_raised boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  BEGIN
    INSERT INTO public.engagements (client_id, engagement_name, manager_id, specialist_it_id, fecha_cierre, society_id, oficina, practica)
    VALUES (
      'c1c00000-0000-4000-8000-000000000001', 'ECT Manager=Especialista IT', NULL, pg_temp.s(1), '2026-03-31',
      (SELECT society_id FROM public.society WHERE is_active ORDER BY name LIMIT 1),
      1,
      1
    );
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 11: manager_id canonizado (%) igual a specialist_it_id debía rechazarse por chk_engagements_manager_not_specialist.',
      pg_temp.s(1);
  END IF;
  RAISE NOTICE 'CHECK 11 OK: manager_id = specialist_it_id se rechaza (chk_engagements_manager_not_specialist, BUG 0828-185).';
END $$;

RESET ROLE;

-- ── #8: el UPDATE NO aplica la regla ──────────────────────────────────────────────────────────
-- Se corre con RESET ROLE (dueño de la tabla) a propósito: el objetivo es aislar la pregunta "¿el
-- trigger dispara en UPDATE?" de las policies de RLS del update, que son otra cosa. El claim JWT
-- sigue seteado, así que auth.uid() continúa siendo el Gerente — si el trigger fuera también de
-- UPDATE, reescribiría el valor.
DO $$
DECLARE v_manager uuid;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  UPDATE public.engagements
     SET manager_id = pg_temp.s(6)
   WHERE engagement_name = 'ECT Gerente manda a otro'
  RETURNING manager_id INTO v_manager;

  IF v_manager IS DISTINCT FROM pg_temp.s(6) THEN
    RAISE EXCEPTION 'CHECK 8: el trigger es solo de creación; el UPDATE debía dejar % y quedó %',
      pg_temp.s(6), v_manager;
  END IF;
  RAISE NOTICE 'CHECK 8 OK: el UPDATE no aplica la regla (trigger solo de INSERT).';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'TRIGGER ENGAGEMENT CREATOR TEAM: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;

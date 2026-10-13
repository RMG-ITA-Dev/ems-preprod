-- Carril B, etapa B4 del barrido RLS: lectura de las vistas que corren con permisos del dueño. BAR-010 (lectura).
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Idempotente (CREATE OR REPLACE, DROP VIEW IF EXISTS + CREATE,
-- ALTER VIEW y REVOKE/GRANT repetibles): se aplica primero a mano en Dev 2.0 para probar y después con `db push`.
--
-- Contexto: una vista normal de PostgreSQL lee con los permisos de su DUEÑO (`postgres`, BYPASSRLS), no con los de quien la
-- consulta, así que anula la RLS de las tablas base. La ESCRITURA por esas vistas la cerró B3c; aquí se revisa la LECTURA.
-- Estado medido en Dev 2.0 el 13/10/2026 con las 11 cuentas de prueba:
--   · engagement_wo_state: entregaba el estado de aprobación y de riesgo de TODAS las OT a cualquier empleado, aunque no viera
--     el encargo (exceso de 6 filas para asistente y gerente y de 10 para senior y semisenior).
--   · staff_directory: sin consumidores en el repo ni en la base; da lo mismo que leer `staff` (política `true` y SELECT por
--     columna), pero corría como el dueño y el Security Advisor la marcaba.
--   · clients_directory y fund_request_selectable_work_orders: del dueño A PROPÓSITO (decisiones del operador, 12-13/10); no cambian.
--   · Las 4 vistas vw_*_hours_by_category* tenían todos los privilegios de tabla para authenticated (incluido TRUNCATE). Ninguna
--     admite escritura (no son auto-actualizables: PostgreSQL responde 55000 antes de mirar los privilegios), así que era higiene.
--   · PostgreSQL 17 concede además MAINTAIN por defecto a anon y authenticated sobre toda vista nueva.
--
-- Qué cambia:
--   1. engagement_wo_state sigue siendo del dueño (work_orders solo lo lee el equipo del encargo, y el badge de la lista de
--      encargos necesita el estado de OT de todo encargo que el usuario ya ve), pero ahora solo devuelve los encargos que el
--      llamador PUEDE VER. La visibilidad sale de my_visible_engagement_ids(), el predicado de las cuatro políticas SELECT de
--      engagements expresado como CONJUNTO calculado una vez por consulta (con dos helpers DEFINER por fila, reutilizar la RLS de
--      engagements costaba de 250 a 1.060 ms con 2.010 encargos; el conjunto, de 4 a 12 ms). Si alguien cambia esas políticas, la
--      suite del harness (rls-carril-b-b4-vistas.sql) compara ambos conjuntos para los roles de prueba y falla. security_barrier:
--      el filtro de visibilidad es el mecanismo de seguridad de la vista; sin la barrera, un predicado del usuario con una
--      función que no es leakproof podría evaluarse antes y filtrar filas ocultas por mensajes de error.
--      Sin sesión (migraciones, service_role, SQL Editor) pasa todo: las Edge Functions scheduler-data y scheduler-gaps la leen
--      con service_role. anon, nunca (y no tiene SELECT).
--   2. staff_directory pasa a security_invoker: obedece la RLS y el SELECT por columna de staff. Resultado idéntico hoy (32 de 32
--      filas para los 11 roles, antes y después).
--   3. Privilegios de las vistas de public: authenticated solo SELECT; anon nada (incluido MAINTAIN).
--   4. Comentario en fund_request_selectable_work_orders: sigue del dueño y global a propósito (cualquier empleado puede pedir
--      fondos contra cualquier OT aprobada: fr_wo_insert no mira alcance y el gerente de la OT aprueba).

-- 0. Guardas ────────────────────────────────────────────────────────────────────────────────────────────────────────
-- El conjunto de visibilidad copia las cuatro políticas SELECT de engagements; si faltan, copiaría algo que ya no existe.
DO $$
DECLARE
  p text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.engagements'::regclass) THEN
    RAISE EXCEPTION 'B4: public.engagements no tiene RLS activa (B3c); la visibilidad de engagement_wo_state no tendría contra qué compararse';
  END IF;
  FOREACH p IN ARRAY ARRAY['engagements read', 'engagements creator read', 'engagements hr administrative read',
                           'Staff can view fund request engagements'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'engagements' AND policyname = p AND cmd = 'SELECT') THEN
      RAISE EXCEPTION 'B4: falta la política SELECT "%" en engagements; my_visible_engagement_ids() la replica y debe revisarse', p;
    END IF;
  END LOOP;
END $$;

-- 1. Conjunto de encargos visibles ──────────────────────────────────────────────────────────────────────────────────
-- Las cuatro políticas SELECT de engagements (cero_05 y B3c-3), en el mismo orden:
--   a) engagement.read y (alcance distinto de 'assigned_engagements' o el llamador es socio/gerente/SQR/encargado);
--   b) engagement.read y el llamador creó el encargo;
--   c) engagement.read, encargo administrativo (funcion <> 1) y rol hr_manager/hr_analyst;
--   d) el encargo figura en una solicitud de fondos YA ENVIADA del llamador (como solicitante, gerente de la OT o contabilidad):
--      solicitante y gerente de la OT por conjuntos; contabilidad la decide la propia engagement_in_my_fund_request (la de la
--      política), no una copia de su cuerpo.
-- `v_scope IS NOT NULL AND ...` replica la semántica de `permission_scope(...) <> '...'` con NULL (no visible).
CREATE OR REPLACE FUNCTION public.my_visible_engagement_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me    uuid    := public.get_my_staff_id();
  v_read  boolean := public.has_permission('engagement.read');
  v_scope text    := public.permission_scope('engagement.read');
  v_role  text    := public.current_role_key();
  v_acct  boolean := public.has_permission('fund_disbursement.read') OR public.has_permission('expense_settlement.read');
BEGIN
  RETURN QUERY
  SELECT e.engagement_id
    FROM public.engagements e
   WHERE (v_read AND ((v_scope IS NOT NULL AND v_scope <> 'assigned_engagements')
                      OR v_me IN (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id)))
      OR (v_read AND e.created_by_staff_id IS NOT NULL AND e.created_by_staff_id = v_me)
      OR (v_read AND e.funcion <> 1 AND v_role IN ('hr_manager', 'hr_analyst'))
      -- d) Solicitudes de fondos YA ENVIADAS (status <> 'borrador'), en dos partes:
      --    d1) solicitante o gerente de la OT: por conjuntos. Es idéntico en la versión del repo y en la de Dev 2.0 de
      --        engagement_in_my_fund_request (la que usa la política).
      OR e.engagement_id IN (
           SELECT wo.engagement_id
             FROM public.fund_request_work_orders frwo
             JOIN public.fund_requests fr ON fr.fund_request_id = frwo.fund_request_id
             JOIN public.work_orders wo ON wo.wo_id = frwo.wo_id
            WHERE fr.status <> 'borrador'
              AND (fr.requester_staff_id = v_me OR frwo.manager_staff_id = v_me))
      --    d2) contabilidad: NO se copia su regla. Cambia con el módulo de solicitudes de fondos (en Dev 2.0 ya depende de
      --        fr_accounting_sees y de fund_requests.cancelled_from_status, que NO están en las migraciones de este repo; copiarla
      --        rompió el harness el 13/10/2026). Solo aplica a quien tiene alguno de los dos permisos contables (ambas versiones los
      --        exigen), y entonces se llama a la función real, solo para los encargos con alguna solicitud enviada.
      OR (v_acct AND e.engagement_id IN (
            SELECT wo.engagement_id
              FROM public.fund_request_work_orders frwo
              JOIN public.fund_requests fr ON fr.fund_request_id = frwo.fund_request_id
              JOIN public.work_orders wo ON wo.wo_id = frwo.wo_id
             WHERE fr.status <> 'borrador')
          AND public.engagement_in_my_fund_request(e.engagement_id));
END $$;
COMMENT ON FUNCTION public.my_visible_engagement_ids() IS
  'B4: ids de los encargos que el llamador (auth.uid()) puede ver segun las 4 politicas SELECT de engagements, como conjunto. Solo la usa engagement_wo_state; la suite rls-carril-b-b4-vistas.sql la compara con la RLS real.';
-- PostgreSQL comprueba el EXECUTE de las funciones que llama una vista contra quien la consulta (no contra el dueño), así que
-- authenticated y service_role lo necesitan. Es inocuo: la función solo devuelve los encargos que ese mismo usuario ya ve.
REVOKE ALL ON FUNCTION public.my_visible_engagement_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_visible_engagement_ids() TO authenticated, service_role;

-- 2. engagement_wo_state ────────────────────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.engagement_wo_state;
CREATE VIEW public.engagement_wo_state WITH (security_invoker = false, security_barrier = true) AS
SELECT wo.engagement_id, wo.approval_status, wo.approved_at, wo.risk_status
  FROM public.work_orders wo
 WHERE ((SELECT auth.uid()) IS NULL AND COALESCE((SELECT auth.jwt()) ->> 'role', '') <> 'anon')
    OR wo.engagement_id IN (SELECT public.my_visible_engagement_ids());
COMMENT ON VIEW public.engagement_wo_state IS
  'B4: estado de aprobacion y de riesgo de la OT de cada encargo que el llamador puede ver. SECURITY DEFINER a proposito (work_orders solo lo lee el equipo) con security_barrier; la visibilidad sale de my_visible_engagement_ids(). Sin sesion (service_role, migraciones) ve todo. NUNCA agregar columnas de la OT.';

-- 3. staff_directory ────────────────────────────────────────────────────────────────────────────────────────────────
ALTER VIEW public.staff_directory SET (security_invoker = true);

-- 4. Privilegios de todas las vistas de public ──────────────────────────────────────────────────────────────────────
-- authenticated solo lee; anon nada. service_role conserva los suyos (Edge Functions).
DO $$
DECLARE
  v record;
BEGIN
  FOR v IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v.relname);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v.relname);
  END LOOP;
END $$;
GRANT ALL ON public.engagement_wo_state TO service_role;

-- 5. Documentación en el catálogo de la otra vista del dueño que se conserva ───────────────────────────────────────
COMMENT ON VIEW public.fund_request_selectable_work_orders IS
  'B4: SECURITY DEFINER a proposito. Cualquier empleado puede pedir fondos contra cualquier OT aprobada (fr_wo_insert no mira alcance; el gerente de la OT aprueba), asi que debe verlas todas. Solo columnas minimas: NUNCA agregar cliente, NIT, presupuesto ni notas.';

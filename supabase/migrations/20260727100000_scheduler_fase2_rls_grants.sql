-- Fase 2 del Scheduler — C1: RLS canónica + grants + restauración de vw_staffing_alerts +
-- is_engagement_responsible().
--
-- Referencia: bugs/scheduler/fase_2/plan_v2.md, sección "C1 — RLS y grants canónicos".
-- Cierra: G1 (vw_staffing_alerts revocada/insegura por ruta), G2 (USING(true) en staffing),
-- G7 (responsables sin cobertura de helper).
--
-- Orden dentro de esta migración: la restauración de vw_staffing_alerts y el helper nuevo van
-- primero (solo catálogo, no abortan por datos); las políticas y grants no dependen de datos
-- existentes en wo_staffing_requirements/wo_staffing_requirement_skills/engagement_assignments
-- (nacen vacías en A/B/C) — principio rector del plan: "RLS antes que datos", aunque acá C1
-- completo es solo-catálogo (C2 es la que puede abortar por datos).

-- =====================================================================
-- 1. vw_staffing_alerts (cierra G1)
--
-- Las migraciones históricas #3/#6/#8 del scheduler revocan authenticated de esta vista
-- afirmando que "ninguna de las 3 vistas está referenciada en la app" — falso: existe una
-- vw_staffing_alerts activa en development (20260521000001/20260521000002), consumida por
-- useStaffingAlerts.ts. Restaurar el GRANT no alcanza por sí solo: confirmado corriendo Ruta C
-- (2026-07-30) que, cuando development crea la vista DESPUÉS de que las 8 históricas ya
-- corrieron, el `ALTER VIEW ... SET (security_invoker = true)` de 20260720194555/20260720194653
-- se saltea (la vista no existe todavía en ese punto de la ruta) y la vista queda sin
-- security_invoker — bypass de RLS vía privilegios de owner — y con grants abiertos a `anon`.
-- Reafirmar acá, incondicional y al final del historial, cierra las 3 rutas por igual.
--
-- 🟡 Segundo matiz encontrado en vivo (2026-07-30, recorriendo Ruta C post-C1-C4): no alcanza
-- con revocar PUBLIC/anon. En Ruta C, `authenticated` queda con privilegios de más
-- (DELETE/INSERT/REFERENCES/TRIGGER/TRUNCATE/UPDATE, no solo SELECT) porque la migración
-- histórica que revocaba ese exceso corre ANTES de que la vista exista en esta ruta (mismo
-- mecanismo de G1, ahora sobre `authenticated` en vez de `anon`). Se agrega un REVOKE ALL
-- explícito sobre `authenticated` antes del GRANT SELECT, para que el resultado final sea
-- idéntico sin importar en qué orden se creó la vista en cada ruta.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.vw_staffing_alerts') IS NOT NULL THEN
    -- security_invoker primero: sin esto, cualquier GRANT (incluso solo a authenticated)
    -- ejecuta con privilegios del owner y evade la RLS de las tablas subyacentes.
    ALTER VIEW public.vw_staffing_alerts SET (security_invoker = true);

    -- Limpiar TODO privilegio heredado (de cualquier ruta) antes de conceder el mínimo exacto.
    REVOKE ALL ON public.vw_staffing_alerts FROM authenticated;
    GRANT SELECT ON public.vw_staffing_alerts TO authenticated;

    -- La revocación de anon/PUBLIC de las históricas sí era correcta (el bug era la
    -- referencia a "ninguna vista usada", no la revocación en sí) — se reafirma explícita
    -- por si esta migración es la primera en tocar la vista en alguna de las 3 rutas.
    REVOKE ALL ON public.vw_staffing_alerts FROM PUBLIC;
    IF to_regrole('anon') IS NOT NULL THEN
      REVOKE ALL ON public.vw_staffing_alerts FROM anon;
    END IF;
  END IF;
END $$;

-- =====================================================================
-- 2. is_engagement_responsible(uuid) — cierra G7
--
-- is_engagement_team_member() (20260107032620) cubre solo manager_id/partner_id.
-- development agregó sqr_id/encargado_id/specialist_it_id/specialist_tax_id a engagements
-- (20260625000000_add_engagement_responsible_personnel.sql) con políticas inline separadas,
-- sin extender el helper compartido. Redefinir is_engagement_team_member cambiaría
-- autorización en 9 migraciones/decenas de políticas — se crea un helper nuevo, usado solo
-- por el Scheduler, en vez de tocar el compartido.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_engagement_responsible(p_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagements e
    WHERE e.engagement_id = p_engagement_id
      AND public.get_my_staff_id() IN (e.manager_id, e.partner_id,
                                        e.sqr_id, e.encargado_id,
                                        e.specialist_it_id, e.specialist_tax_id)
  )
$$;

-- Mínimo privilegio en el helper (mismo patrón que los helpers D5 de
-- 20260717233000): revocar de PUBLIC/anon/service_role, conceder solo a authenticated.
REVOKE EXECUTE ON FUNCTION public.is_engagement_responsible(uuid) FROM PUBLIC;
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'service_role'] LOOP
    IF to_regrole(r) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.is_engagement_responsible(uuid) FROM %I', r);
    END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.is_engagement_responsible(uuid) TO authenticated;

-- =====================================================================
-- 3. wo_staffing_requirements / wo_staffing_requirement_skills — cierra G2
--
-- Las históricas #1/#5 dejan wo_staffing_req_select / wo_staffing_req_skills_select como
-- FOR SELECT TO authenticated USING (true) — lectura firmwide para cualquier autenticado,
-- violando el issue §9 ("no existe una política final de lectura global"). Se reemplazan por
-- la matriz canónica (docs: Matriz RLS canónica de plan_v2.md), resuelta vía el join a
-- work_orders (1 salto para wo_staffing_requirements, 2 saltos —
-- wo_staffing_requirement_skills → wo_staffing_requirements → work_orders — para las skills).
--
-- Las políticas de escritura FOR ALL históricas (#1/#5) se dividen en INSERT/UPDATE/DELETE
-- explícitas (issue §9: un FOR ALL concede también SELECT, ocultando el alcance real de
-- lectura detrás de un permiso de escritura) y se les agrega OR is_engagement_responsible(...),
-- que las FOR ALL originales no contemplaban (development nunca las tocó).
-- =====================================================================

-- --- wo_staffing_requirements -------------------------------------------------------------

DROP POLICY IF EXISTS wo_staffing_req_select ON public.wo_staffing_requirements;
CREATE POLICY wo_staffing_req_select
  ON public.wo_staffing_requirements
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.has_firmwide_assignment_visibility()
    OR public.is_engagement_team_member(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
    OR public.is_engagement_responsible(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
    OR public.has_assignment_on_engagement(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
  );

DROP POLICY IF EXISTS wo_staffing_req_write ON public.wo_staffing_requirements;

DROP POLICY IF EXISTS wo_staffing_req_insert ON public.wo_staffing_requirements;
CREATE POLICY wo_staffing_req_insert
  ON public.wo_staffing_requirements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_engagement_team_member(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
    OR public.is_engagement_responsible(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
  );

DROP POLICY IF EXISTS wo_staffing_req_update ON public.wo_staffing_requirements;
CREATE POLICY wo_staffing_req_update
  ON public.wo_staffing_requirements
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.is_engagement_team_member(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
    OR public.is_engagement_responsible(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_engagement_team_member(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
    OR public.is_engagement_responsible(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
  );

DROP POLICY IF EXISTS wo_staffing_req_delete ON public.wo_staffing_requirements;
CREATE POLICY wo_staffing_req_delete
  ON public.wo_staffing_requirements
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.is_engagement_team_member(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
    OR public.is_engagement_responsible(
         (SELECT wo.engagement_id FROM public.work_orders wo
           WHERE wo.wo_id = wo_staffing_requirements.wo_id))
  );

-- --- wo_staffing_requirement_skills (2 saltos: requirement_id → wo_staffing_requirements
--     → work_orders → engagement_id) ------------------------------------------------------

DROP POLICY IF EXISTS wo_staffing_req_skills_select ON public.wo_staffing_requirement_skills;
CREATE POLICY wo_staffing_req_skills_select
  ON public.wo_staffing_requirement_skills
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.has_firmwide_assignment_visibility()
    OR public.is_engagement_team_member(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
    OR public.is_engagement_responsible(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
    OR public.has_assignment_on_engagement(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
  );

DROP POLICY IF EXISTS wo_staffing_req_skills_write ON public.wo_staffing_requirement_skills;

DROP POLICY IF EXISTS wo_staffing_req_skills_insert ON public.wo_staffing_requirement_skills;
CREATE POLICY wo_staffing_req_skills_insert
  ON public.wo_staffing_requirement_skills
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_engagement_team_member(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
    OR public.is_engagement_responsible(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
  );

DROP POLICY IF EXISTS wo_staffing_req_skills_update ON public.wo_staffing_requirement_skills;
CREATE POLICY wo_staffing_req_skills_update
  ON public.wo_staffing_requirement_skills
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.is_engagement_team_member(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
    OR public.is_engagement_responsible(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_engagement_team_member(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
    OR public.is_engagement_responsible(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
  );

DROP POLICY IF EXISTS wo_staffing_req_skills_delete ON public.wo_staffing_requirement_skills;
CREATE POLICY wo_staffing_req_skills_delete
  ON public.wo_staffing_requirement_skills
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.is_engagement_team_member(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
    OR public.is_engagement_responsible(
         (SELECT wo.engagement_id
            FROM public.wo_staffing_requirements r
            JOIN public.work_orders wo ON wo.wo_id = r.wo_id
           WHERE r.id = wo_staffing_requirement_skills.requirement_id))
  );

-- =====================================================================
-- 3b. engagement_assignments — extender el gate de escritura D5 con is_engagement_responsible
--
-- No estaba en el alcance textual de C1 en plan_v2.md, pero la Matriz RLS canónica del mismo
-- plan es explícita: sqr/specialist_it/specialist_tax escriben "si responsable" (vía
-- is_engagement_responsible, recién creado en esta migración). Las políticas D5 actuales
-- (ea_team_insert/update/delete, 20260717233000) solo permiten is_engagement_team_member()
-- (manager_id/partner_id) — sqr/encargado/specialist_it/specialist_tax quedarían sin poder
-- escribir sus propias asignaciones pese a ser "responsables" en el modelo nuevo. Se extiende
-- con OR is_engagement_responsible(...) para cerrar ese hueco; SELECT (ea_select_firmwide/
-- lead/assigned) no se toca — ya cubre correctamente el resto de la matriz.
-- =====================================================================

DROP POLICY IF EXISTS ea_team_insert ON public.engagement_assignments;
CREATE POLICY ea_team_insert ON public.engagement_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id))
    AND public.can_read_engagement_assignments(engagement_id)
  );

DROP POLICY IF EXISTS ea_team_update ON public.engagement_assignments;
CREATE POLICY ea_team_update ON public.engagement_assignments
  FOR UPDATE TO authenticated
  USING (
    (public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id))
    AND public.can_read_engagement_assignments(engagement_id)
  )
  WITH CHECK (
    (public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id))
    AND public.can_read_engagement_assignments(engagement_id)
  );

DROP POLICY IF EXISTS ea_team_delete ON public.engagement_assignments;
CREATE POLICY ea_team_delete ON public.engagement_assignments
  FOR DELETE TO authenticated
  USING (
    (public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id))
    AND public.can_read_engagement_assignments(engagement_id)
  );

-- =====================================================================
-- 4. Grants de mínimo privilegio en las 3 tablas (la RLS filtra filas, no tablas)
--
-- wo_staffing_requirements/wo_staffing_requirement_skills ya tienen este GRANT desde
-- 20260719044642 (histórica #7) — se reafirma acá por idempotencia/documentación, no por
-- necesidad. engagement_assignments no tiene un GRANT explícito en ninguna migración
-- committeada (la tabla es de la era scheduler-v2, creada fuera de migraciones) — se agrega
-- explícito para que el estado quede reproducible por CLI, no dependiente de defaults de
-- Studio/Lovable. Se mantiene DML directo (no se revoca) para que la matriz de escritura del
-- issue §8 sea probable; la revocación RPC-only queda como Q3 (fase posterior).
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wo_staffing_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wo_staffing_requirement_skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_assignments TO authenticated;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON public.wo_staffing_requirements FROM anon;
    REVOKE ALL ON public.wo_staffing_requirement_skills FROM anon;
    REVOKE ALL ON public.engagement_assignments FROM anon;
  END IF;
END $$;

-- Convergencia dev-scheduler + feat/roles-permisos — corrige has_firmwide_assignment_visibility()
-- (creada en 20260717233000, redefinida en 20260720120000 y 20260720194653) para leer role_key en
-- vez del enum legacy user_roles.role.
--
-- Por qué: 20260729000000_authz_fase8_ui_role_key.sql espeja el role_key 'risk_partner' al enum
-- legacy 'partner' (nivel de negocio "socio"). risk_partner es uno de los 12 role_key que H3/G3b
-- excluyó explícitamente del Scheduler (docs: bugs/scheduler/plan_merge_sche_rolper.md §3 H3, §G3b).
-- G3b migró la fuente del rol a role_key en las 4 capas de aplicación (sidebar, drawer,
-- scheduler-data, scheduler-gaps), pero esta función SQL —consumida directamente por las políticas
-- RLS de `engagement_assignments`, `wo_staffing_requirements` y `wo_staffing_requirement_skills`
-- (20260727100000_scheduler_fase2_rls_grants.sql:176,228)— seguía leyendo el enum legacy, así que
-- un usuario risk_partner obtenía visibilidad firmwide real vía PostgREST directo, sin pasar por
-- ninguna de las Edge Functions ya corregidas.
--
-- Fix: mismo criterio que las 4 capas de aplicación — role_key exacto en vez del enum. senior_partner
-- se incluye a propósito (hereda el nivel de partner, decisión ya tomada en G3b); risk_partner queda
-- fuera. Aditiva/CREATE OR REPLACE, no toca ninguna migración existente ni las políticas que la
-- consumen (referencian la función por nombre, no su cuerpo).

CREATE OR REPLACE FUNCTION public.has_firmwide_assignment_visibility()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role_key IN ('admin', 'senior_partner', 'partner', 'director')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_firmwide_assignment_visibility() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_firmwide_assignment_visibility() TO authenticated;

-- Validación (impersonando, contra Postgres aislado — no ejecutar desde R-APP):
--   risk_partner: false (antes: true por el mirror a 'partner')
--   admin/senior_partner/partner/director: true (sin cambio de comportamiento)
--   el resto de los 23 role_key: false (sin cambio de comportamiento)

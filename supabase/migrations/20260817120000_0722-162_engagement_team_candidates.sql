-- BUG 0722-162 — candidatos elegibles por campo del bloque "Equipo" del encargo.
--
-- Problema: en /engagements/new los seis selectores de personal no filtran por rol. Cuatro de
-- ellos (SQR, Encargado, Especialista TI, Especialista Impuestos) reciben la nómina completa, y
-- los otros dos filtran por rangos de `categories.display_order`, que dejó de significar
-- jerarquía dos veces: 20260130231039 insertó SQR en display_order = 2 (corriendo Gerente al 3),
-- y 20260702000002 renormalizó el orden a 1..N POR SERVICIO con UNIQUE (service_id,
-- display_order). Consecuencia visible: "Socio/Director" ofrece gente SQR y omite a los
-- Director; "Gerente/Supervisor" lista Seniors.
--
-- Autoridad correcta: `user_roles.role_key` (catálogo de 23 roles de authorization_roles). La
-- categoría ya NO dicta el rol — FASE 3c quitó `default_app_role` del CategoryForm justamente
-- por eso. Y NO se usa el espejo `legacy_app_role`, que guarda el NIVEL jerárquico y no la
-- especialidad (20260729000000: siete role_key colapsan en `manager` y seis en `senior`, así que
-- filtrar por ahí metería ita_manager/tax_manager en el campo Gerente).
--
-- Por qué un RPC y no una consulta del cliente: el cruce exige `staff.auth_user_id`, que el
-- cliente no puede leer (`useStaff()` excluye PII a propósito). Y `get_all_user_roles()` no es
-- reutilizable: está gateada por `user_role.read` — permiso que un Gerente con
-- `engagement.create` no necesariamente tiene — y devuelve email + user_id, PII innecesaria acá.
--
-- Superficie mínima a propósito: devuelve un GRUPO neutro de candidatura, no el `role_key` crudo.
-- Quien crea un encargo no necesita conocer el rol exacto de sus colegas.
--
-- Aditiva y de cola: no toca el contenido de ninguna migración existente. Idempotente
-- (CREATE OR REPLACE + REVOKE/GRANT repetibles), así que se puede re-pegar en el SQL Editor
-- tras un apply parcial sin fallar.

CREATE OR REPLACE FUNCTION public.get_engagement_team_candidates()
RETURNS TABLE (
  staff_id        uuid,
  display_name    text,
  candidate_group text,
  service_id      uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.staff_id,
         (s.first_name || ' ' || s.last_name)::text AS display_name,
         -- Solo el ROL BASE de cada nivel (decisión de negocio 2026-08-17). Fuera:
         -- senior_partner, risk_partner, risk_supervisor, it_security_manager,
         -- accounting_*, hr_*, collections_analyst, sqr, assistant, viewer y admin.
         -- Este CASE está espejado en src/lib/engagementTeamCandidates.ts
         -- (ROLE_KEY_TO_GROUP); si se toca uno, tocar el otro.
         CASE ur.role_key
           WHEN 'partner'       THEN 'partner_director'
           WHEN 'director'      THEN 'partner_director'
           WHEN 'manager'       THEN 'manager'
           WHEN 'senior'        THEN 'encargado'
           WHEN 'semisenior'    THEN 'encargado'
           WHEN 'ita_manager'   THEN 'specialist_it'
           WHEN 'ita_senior'    THEN 'specialist_it'
           WHEN 'ita_assistant' THEN 'specialist_it'
           WHEN 'tax_manager'   THEN 'specialist_tax'
           WHEN 'tax_senior'    THEN 'specialist_tax'
           WHEN 'tax_assistant' THEN 'specialist_tax'
         END AS candidate_group,
         -- El cliente refina por el servicio del encargo sin volver a pedir datos.
         s.service_id
    FROM public.staff s
    -- INNER JOIN: excluye al personal sin cuenta vinculada (staff.auth_user_id es nullable
    -- por diseño — se vincula por email vía trigger) y, con el IN de abajo, a quien tenga
    -- role_key NULL. Es el comportamiento decidido: sin rol asignado no hay elegibilidad.
    JOIN public.user_roles ur          ON ur.user_id  = s.auth_user_id
    JOIN public.authorization_roles ar ON ar.role_key = ur.role_key
   WHERE (public.has_permission('engagement.create')
          OR public.has_permission('engagement.update'))
     AND s.is_active
     AND s.deleted_at IS NULL
     AND ar.is_active
     AND ur.role_key IN ('partner','director','manager','senior','semisenior',
                         'ita_manager','ita_senior','ita_assistant',
                         'tax_manager','tax_senior','tax_assistant')
   ORDER BY s.last_name, s.first_name;
$$;

-- Least privilege: nadie anónimo, y solo `authenticated` puede invocarla. El gate real de
-- autorización está en el WHERE (fail-closed: sin permiso devuelve 0 filas, no error).
REVOKE ALL ON FUNCTION public.get_engagement_team_candidates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_engagement_team_candidates() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_engagement_team_candidates() TO authenticated;

COMMENT ON FUNCTION public.get_engagement_team_candidates() IS
  'BUG 0722-162: candidatos elegibles por campo del bloque Equipo del encargo. Agrupa role_key '
  'en 5 grupos de candidatura (partner_director, manager, encargado, specialist_it, '
  'specialist_tax) y NO expone email, auth_user_id ni el role_key crudo. Gateada por '
  'engagement.create OR engagement.update, así que cubre creación y edición con un solo RPC.';

-- Validación (contra Postgres aislado — no ejecutar desde R-APP):
--   select candidate_group, count(*) from get_engagement_team_candidates() group by 1 order by 1;
--   -- impersonando un rol sin engagement.create ni engagement.update: 0 filas (fail-closed)
--   -- ningún resultado debe traer email, auth_user_id ni role_key

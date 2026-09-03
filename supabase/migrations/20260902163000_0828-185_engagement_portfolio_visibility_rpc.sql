--
-- BUG 0828-185 (Plan v2 §c.1): "Encargos" muestra además los encargos donde el usuario figura
-- como partner/manager/sqr/encargado aunque NO los haya creado -- excede lo definido como
-- comportamiento esperado por ahora (solo lo que el usuario creó, salvo los roles firm-wide).
--
-- Root cause (plan_v2 §b): la policy "engagements read" (cero_05:886) ORea
-- has_permission('engagement.read') con is_assigned_to_engagement() para el scope
-- 'assigned_engagements' -- esa función (cero_02:3468) resuelve "asignado" como
-- partner_id/manager_id/sqr_id/encargado_id, no como creador. Esa policy NO puede re-escoparse
-- in place: is_assigned_to_engagement()/is_assigned_to_client() y la propia policy las
-- necesitan sin cambios otras pantallas (aprobación de OT, Hoja de Tiempo, worksheets,
-- Encargos.tsx no es la única consumidora de RLS de `engagements`). Por eso este fix es un RPC
-- dedicado, SECURITY DEFINER, con los 4 buckets del operador HARDCODEADOS por role_key (mismo
-- patrón que has_firmwide_assignment_visibility(), cero_02:3378) -- SIN nuevo permission_key,
-- SIN nuevo scope_key, SIN tocar authorization_role_permissions ni la policy "engagements read".
--
-- Buckets (plan_v0 §3, decisión del operador):
--   1. firm         -- admin, it_security_manager, senior_partner, risk_partner -> todos.
--   2. own_society  -- partner, sqr, director -> engagement.society_id = sociedad del llamante.
--   3. own_management -- manager, ita_manager, tax_manager, hr_manager -> manager_id = llamante.
--   4. creator      -- cualquier rol -> created_by_staff_id = llamante.
--
-- Consumida por SOLO 3 pantallas (Encargos.tsx, EngagementEdit.tsx, ClientEngagementsTable.tsx)
-- vía el nuevo hook usePortfolioEngagements(). Las demás pantallas (Nueva OT, Nueva Hoja de
-- Trabajo, Configuración->Feriados, Tracker, SchedulerL2, Clientes/Personal "Encargos") siguen
-- en useEngagements()/RLS directa -- fuera de alcance de este issue (plan_v2 §h).
--
-- RETURNS jsonb (no SETOF/RETURNS TABLE): el payload se arma server-side con exactamente los
-- campos que useEngagements() ya embebe hoy (useEmsData.ts:106-159 / :734-742), incluido el
-- allowlist NO-PII de `staff` (staff_id/first_name/last_name/short_name/initials/category_id/
-- city/is_active -- nunca email/id_number/aud_reg_number/auth_user_id/role_key) y el estado de
-- Orden de Trabajo inlineado (SECURITY DEFINER puede leer work_orders directo, sin necesidad de
-- la vista engagement_wo_state ni de una segunda query desde el cliente).
--

CREATE FUNCTION public.list_portfolio_engagements() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH caller AS (
    SELECT public.get_my_staff_id() AS staff_id,
           public.current_role_key() AS role_key
  ),
  caller_staff AS (
    SELECT s.society_id
      FROM public.staff s, caller c
     WHERE s.staff_id = c.staff_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'engagement_id',              e.engagement_id,
        'client_id',                  e.client_id,
        'engagement_name',            e.engagement_name,
        'engagement_code',            e.engagement_code,
        'partner_id',                 e.partner_id,
        'manager_id',                 e.manager_id,
        'status',                     e.status,
        'start_date',                 e.start_date,
        'end_date',                   e.end_date,
        'created_at',                 e.created_at,
        'work_order_required',        e.work_order_required,
        'activity_required',          e.activity_required,
        'is_internal',                e.is_internal,
        'approval_required',          e.approval_required,
        'oficina',                    e.oficina,
        'practica',                   e.practica,
        'anio_fiscal',                e.anio_fiscal,
        'funcion',                    e.funcion,
        'fecha_cierre',               e.fecha_cierre,
        'anio_fiscal_override',       e.anio_fiscal_override,
        'sqr_id',                     e.sqr_id,
        'encargado_id',               e.encargado_id,
        'specialist_it_id',           e.specialist_it_id,
        'specialist_tax_id',          e.specialist_tax_id,
        'contract_file_path',         e.contract_file_path,
        'created_by_staff_id',        e.created_by_staff_id,
        'engagement_state_override',  e.engagement_state_override,
        'taxonomy_id',                e.taxonomy_id,
        'society_id',                 e.society_id,
        'client', jsonb_build_object(
          'client_id',          c.client_id,
          'client_legal_name',  c.client_legal_name
        ),
        'partner',        CASE WHEN sp.staff_id   IS NULL THEN NULL ELSE to_jsonb(sp)   END,
        'manager',        CASE WHEN sm.staff_id   IS NULL THEN NULL ELSE to_jsonb(sm)   END,
        'sqr',            CASE WHEN sq.staff_id   IS NULL THEN NULL ELSE to_jsonb(sq)   END,
        'encargado',      CASE WHEN se.staff_id   IS NULL THEN NULL ELSE to_jsonb(se)   END,
        'specialist_it',  CASE WHEN sit.staff_id  IS NULL THEN NULL ELSE to_jsonb(sit)  END,
        'specialist_tax', CASE WHEN stax.staff_id IS NULL THEN NULL ELSE to_jsonb(stax) END,
        'society',        CASE WHEN soc.society_id IS NULL THEN NULL ELSE jsonb_build_object(
          'society_id',  soc.society_id,
          'name',        soc.name,
          'is_active',   soc.is_active,
          'created_at',  soc.created_at
        ) END,
        'work_order',     CASE WHEN wo.engagement_id IS NULL THEN NULL ELSE jsonb_build_object(
          'approval_status', wo.approval_status,
          'approved_at',     wo.approved_at,
          'risk_status',     wo.risk_status
        ) END
      )
      ORDER BY e.created_at DESC NULLS LAST, e.engagement_id
    ),
    '[]'::jsonb
  )
    FROM public.engagements e
    CROSS JOIN caller
    LEFT JOIN caller_staff cs ON true
    JOIN public.clients c ON c.client_id = e.client_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) sp   ON sp.staff_id   = e.partner_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) sm   ON sm.staff_id   = e.manager_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) sq   ON sq.staff_id   = e.sqr_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) se   ON se.staff_id   = e.encargado_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) sit  ON sit.staff_id  = e.specialist_it_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) stax ON stax.staff_id = e.specialist_tax_id
    LEFT JOIN public.society soc ON soc.society_id = e.society_id
    LEFT JOIN public.work_orders wo ON wo.engagement_id = e.engagement_id
   WHERE public.has_permission('engagement.read')
     AND (
       -- 1. firm: ve todos los encargos.
       caller.role_key IN ('admin', 'it_security_manager', 'senior_partner', 'risk_partner')
       -- 2. own_society: mismos encargos de SU sociedad, incluidos los creados por otros.
       OR (caller.role_key IN ('partner', 'sqr', 'director')
           AND e.society_id IS NOT NULL
           AND e.society_id = cs.society_id)
       -- 3. own_management: donde figura como manager_id, incluidos los creados por otros.
       OR (caller.role_key IN ('manager', 'ita_manager', 'tax_manager', 'hr_manager')
           AND caller.staff_id IS NOT NULL
           AND e.manager_id = caller.staff_id)
       -- 4. creator: cualquier rol ve lo que creó (paridad con la policy "engagements creator read").
       OR (caller.staff_id IS NOT NULL AND e.created_by_staff_id = caller.staff_id)
     )
$$;

COMMENT ON FUNCTION public.list_portfolio_engagements() IS 'BUG 0828-185: encargos visibles en Encargos.tsx/EngagementEdit.tsx/ClientEngagementsTable.tsx bajo la regla "por ahora, solo lo que creé", salvo los roles firm-wide (todos) y own_society/own_management (partner/sqr/director por sociedad; manager/ita_manager/tax_manager/hr_manager por manager_id) -- ver plan_v2 bugs/0828-185. Buckets HARDCODEADOS por role_key, sin nuevo permission_key/scope_key. NO reemplaza is_assigned_to_engagement()/is_assigned_to_client() ni la policy "engagements read": nunca debe ampliarse a firm-wide sin pasar por la RLS real.';

REVOKE ALL ON FUNCTION public.list_portfolio_engagements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_portfolio_engagements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_portfolio_engagements() TO service_role;

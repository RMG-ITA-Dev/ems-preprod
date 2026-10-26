-- Carril B, etapa B3c-3 del barrido de seguridad RLS: hr_manager y hr_analyst ven y administran TODOS los encargos
-- Administrativa, Capacitación y Calidad (funcion <> 1). Requisito del operador (12/10/2026), surgido de la revisión del PR.
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Idempotente (DROP POLICY IF EXISTS + CREATE; DROP + CREATE
-- de la función); va DESPUÉS de B3c.
--
-- Por qué hace falta: hr_manager y hr_analyst tienen engagement.create/read/update con alcance `assigned_engagements`
-- (20260826221706, 0817-180) y ninguno es gerente ni socio de estos encargos. Con la RLS de B3c solo leen y editan los que
-- ellos mismos crearon (políticas "creator read/update"), y la pantalla de detalle (EngagementEdit, por
-- list_portfolio_engagements, regla «solo lo que creé», 0828-185) tampoco los abre. Medido en Dev 2.0 con un HR simulado
-- dentro de un ROLLBACK, sobre 3 encargos administrativos: la lista (list_administrative_engagements) devuelve los 3, pero
-- hr_manager lee y edita 1 (el suyo) y hr_analyst 0.
--
-- Qué hace (alcance mínimo, solo funcion <> 1; los encargos de cliente (funcion = 1) NO cambian):
--   1. Política de lectura "engagements hr administrative read" (engagement.read) para hr_manager y hr_analyst.
--   2. Política de edición "engagements hr administrative update" (engagement.update). No hay borrado (engagement.delete
--      sigue siendo de admin) y la creación ya existía (política "engagements write insert" + create_engagement_with_code).
--   3. list_portfolio_engagements gana el bucket «hr_administrative» con la misma condición, para que Encargos y
--      EngagementEdit los abran. Es la ÚNICA modificación de la función: se copia VERBATIM de 20260902163000.
--   4. risk_supervisor (Supervisor de Riesgos) entra al bucket firm de list_portfolio_engagements: ve TODOS los encargos,
--      igual que risk_partner. Decisión del operador (26/10/2026): el área de Riesgos consulta los encargos pero no los
--      edita. Ya tenía engagement.read con alcance department (Carril B, 20261009120000), así que la RLS de engagements
--      ya le dejaba leerlos todos; solo la RPC lo dejaba en «solo lo que creé». Solo lectura porque NO tiene
--      engagement.update: ni "engagements write update" ni "creator update" lo dejan escribir, y EngagementForm queda
--      en readOnly (`!can("engagement.update")`).
--
-- El rol se resuelve con current_role_key() (SECURITY DEFINER), igual que la RPC de portafolio; los role_key van
-- hardcodeados por el mismo motivo que allí (sin nuevo permission_key/scope_key). Se evalúa una vez por consulta
-- ((SELECT ...)), no por fila. Las políticas son permisivas: se suman a las existentes, no las reemplazan.
-- Fuera de alcance: las OT de estos encargos (work_orders) y su equipo de asignaciones siguen con sus reglas.

DROP POLICY IF EXISTS "engagements hr administrative read" ON public.engagements;
CREATE POLICY "engagements hr administrative read" ON public.engagements
  FOR SELECT TO authenticated
  USING (
    funcion <> 1
    AND public.has_permission('engagement.read')
    AND (SELECT public.current_role_key()) IN ('hr_manager', 'hr_analyst')
  );

DROP POLICY IF EXISTS "engagements hr administrative update" ON public.engagements;
CREATE POLICY "engagements hr administrative update" ON public.engagements
  FOR UPDATE TO authenticated
  USING (
    funcion <> 1
    AND public.has_permission('engagement.update')
    AND (SELECT public.current_role_key()) IN ('hr_manager', 'hr_analyst')
  )
  WITH CHECK (
    funcion <> 1
    AND public.has_permission('engagement.update')
    AND (SELECT public.current_role_key()) IN ('hr_manager', 'hr_analyst')
  );

DROP FUNCTION IF EXISTS public.list_portfolio_engagements();

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
       -- 1. firm: ve todos los encargos. risk_supervisor solo lee (sin engagement.update).
       caller.role_key IN ('admin', 'it_security_manager', 'senior_partner', 'risk_partner', 'risk_supervisor')
       -- 2. own_society: mismos encargos de SU sociedad, incluidos los creados por otros.
       OR (caller.role_key IN ('partner', 'sqr', 'director')
           AND e.society_id IS NOT NULL
           AND e.society_id = cs.society_id)
       -- 3. own_management: donde figura como manager_id, incluidos los creados por otros.
       OR (caller.role_key IN ('manager', 'ita_manager', 'tax_manager', 'hr_manager')
           AND caller.staff_id IS NOT NULL
           AND e.manager_id = caller.staff_id)
       -- 3b. hr_administrative (B3c-3): hr_manager y hr_analyst administran TODOS los encargos Administrativa,
       --     Capacitación y Calidad (funcion <> 1), incluidos los creados por otros. Espejo exacto de las políticas
       --     "engagements hr administrative read/update": esta lista nunca debe mostrar lo que la RLS no deja leer.
       OR (caller.role_key IN ('hr_manager', 'hr_analyst') AND e.funcion <> 1)
       -- 4. creator: cualquier rol ve lo que creó (paridad con la policy "engagements creator read").
       OR (caller.staff_id IS NOT NULL AND e.created_by_staff_id = caller.staff_id)
     )
$$;

COMMENT ON FUNCTION public.list_portfolio_engagements() IS 'BUG 0828-185 + B3c-3: encargos visibles en Encargos.tsx/EngagementEdit.tsx/ClientEngagementsTable.tsx bajo la regla "por ahora, solo lo que creé", salvo los roles firm-wide (todos; risk_supervisor incluido, solo lectura), own_society/own_management (partner/sqr/director por sociedad; manager/ita_manager/tax_manager/hr_manager por manager_id) y hr_administrative (hr_manager/hr_analyst: todos los encargos con funcion <> 1, espejo de las politicas "engagements hr administrative read/update"). Buckets HARDCODEADOS por role_key, sin nuevo permission_key/scope_key. NO reemplaza is_assigned_to_engagement()/is_assigned_to_client() ni la policy "engagements read": nunca debe ampliarse a firm-wide sin pasar por la RLS real.';

-- anon: el DROP + CREATE devuelve los privilegios por defecto de Supabase (EXECUTE a anon); la función no tiene uso
-- sin sesión (sin auth.uid() no devuelve filas), así que se retira aquí en vez de esperar a B5.
REVOKE ALL ON FUNCTION public.list_portfolio_engagements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_portfolio_engagements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_portfolio_engagements() TO service_role;

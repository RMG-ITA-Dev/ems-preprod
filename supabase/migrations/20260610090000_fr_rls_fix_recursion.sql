-- Fund Requests — Fix de recursión infinita en RLS
-- ==================================================
-- Las políticas SELECT de fund_requests y fund_request_work_orders se
-- referenciaban mutuamente (cada una hacía un EXISTS sobre la otra), lo que
-- provoca "infinite recursion detected in policy for relation fund_requests".
--
-- Se rompe el ciclo moviendo el chequeo cruzado a funciones SECURITY DEFINER
-- (mismo patrón que is_engagement_team_member): al ejecutarse como owner,
-- evalúan la relación SIN volver a disparar RLS de la otra tabla.
--
-- Idempotente.

-- =====================================================
-- Helpers SECURITY DEFINER
-- =====================================================
-- ¿El usuario actual es gerente de alguna OT de esta solicitud?
CREATE OR REPLACE FUNCTION public.fr_is_ot_manager(p_fr_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders frwo
    WHERE frwo.fund_request_id = p_fr_id
      AND frwo.manager_staff_id = get_my_staff_id()
  );
$$;

-- ¿El usuario actual es el solicitante de esta solicitud?
CREATE OR REPLACE FUNCTION public.fr_is_requester(p_fr_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_requests fr
    WHERE fr.fund_request_id = p_fr_id
      AND fr.requester_staff_id = get_my_staff_id()
  );
$$;

-- Helper SECURITY DEFINER: ¿la solicitud ya salió de 'borrador'? Se usa para
-- que la visibilidad del gerente empiece SOLO tras el envío (sin subconsulta
-- directa a fund_requests en las políticas, evitando recursión).
CREATE OR REPLACE FUNCTION public.fr_is_submitted(p_fr_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_requests fr
    WHERE fr.fund_request_id = p_fr_id
      AND fr.status <> 'borrador'
  );
$$;

-- =====================================================
-- Reescritura de las políticas que causaban el ciclo
-- =====================================================
-- fund_requests: el gerente ve la solicitud si gestiona ≥1 OT (vía función) y
-- SOLO una vez enviada (no debe ver borradores privados del solicitante).
DROP POLICY IF EXISTS "fr_select_manager" ON public.fund_requests;
CREATE POLICY "fr_select_manager" ON public.fund_requests
  FOR SELECT TO authenticated
  USING (
    status <> 'borrador'
    AND public.fr_is_ot_manager(fund_request_id)
  );

-- fund_request_work_orders: SELECT sin subconsulta directa a fund_requests.
-- El gerente solo ve las OTs de solicitudes ya enviadas (no borradores).
DROP POLICY IF EXISTS "fr_wo_select" ON public.fund_request_work_orders;
CREATE POLICY "fr_wo_select" ON public.fund_request_work_orders
  FOR SELECT TO authenticated
  USING (
    (manager_staff_id = get_my_staff_id() AND public.fr_is_submitted(fund_request_id))
    OR public.fr_is_requester(fund_request_id)
    OR is_admin()
  );
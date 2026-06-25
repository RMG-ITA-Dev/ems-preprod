-- Fund Requests — acceso seguro a work_orders (cierra exposición de PII)
-- =====================================================================
-- La policy amplia "Staff can view approved work orders" abría SELECT sobre la
-- tabla base work_orders a cualquier staff, exponiendo (vía useWorkOrders →
-- select *) cliente, NIT, presupuesto y notas de TODAS las OTs aprobadas.
--
-- Se reemplaza por dos accesos acotados:
--   (a) VISTA segura para el dropdown (elegir OTs): solo columnas mínimas de OTs
--       aprobadas. Corre como owner (security_invoker=false) → no expone los
--       campos sensibles de la tabla base.
--   (b) POLICY angosta para el embed: ver una OT por la tabla base solo si estás
--       en una solicitud de fondos que la incluye (solicitante u OT-manager),
--       vía helper SECURITY DEFINER (evita recursión).
--
-- Además, fr_wo_set_manager pasa a SECURITY DEFINER: al insertar una OT, el
-- trigger resuelve el gerente leyendo work_orders/engagements sin depender de
-- que el solicitante tenga visibilidad RLS sobre esa OT (si no, crear una
-- solicitud se rompería para solicitantes que no son del equipo).
-- Idempotente.

-- =====================================================
-- (a) Vista segura para poblar el dropdown de OTs
-- =====================================================
CREATE OR REPLACE VIEW public.fund_request_selectable_work_orders
WITH (security_invoker = false) AS
SELECT
  wo.wo_id,
  wo.currency,
  wo.approval_status,
  e.engagement_id,
  e.engagement_code,
  e.engagement_name,
  e.manager_id,
  s.staff_id   AS manager_staff_id,
  s.short_name AS manager_short_name,
  s.first_name AS manager_first_name,
  s.last_name  AS manager_last_name
FROM public.work_orders wo
JOIN public.engagements e ON e.engagement_id = wo.engagement_id
LEFT JOIN public.staff s ON s.staff_id = e.manager_id
-- Solo OTs aprobadas y solo para cuentas con staff vinculado (replica el guard
-- de la policy vieja: una cuenta auth sin staff no debe enumerar engagements).
WHERE wo.approval_status = 'Approved'
  AND get_my_staff_id() IS NOT NULL;

GRANT SELECT ON public.fund_request_selectable_work_orders TO authenticated;

-- =====================================================
-- (b) Helper + policy angosta para el embed sobre la tabla base
-- =====================================================
-- ¿La OT está en alguna solicitud de fondos donde soy solicitante o gerente?
CREATE OR REPLACE FUNCTION public.wo_in_my_fund_request(p_wo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fund_request_work_orders frwo
    JOIN public.fund_requests fr ON fr.fund_request_id = frwo.fund_request_id
    WHERE frwo.wo_id = p_wo_id
      -- Solo solicitudes YA ENVIADAS: un borrador no debe conceder lectura de la
      -- WO base (si no, cualquiera crea un borrador, agrega una OT aprobada y lee
      -- notas/presupuesto de cualquier OT). En borrador la info viene de la vista.
      AND fr.status <> 'borrador'
      AND (
        fr.requester_staff_id = get_my_staff_id()
        OR frwo.manager_staff_id = get_my_staff_id()
      )
  );
$$;

-- Reemplaza la policy amplia por una acotada a las OTs de MIS solicitudes.
DROP POLICY IF EXISTS "Staff can view approved work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Staff can view fund request work orders" ON public.work_orders;
CREATE POLICY "Staff can view fund request work orders" ON public.work_orders
  FOR SELECT TO authenticated
  USING (public.wo_in_my_fund_request(wo_id));

-- =====================================================
-- Triggers que leen work_orders en el INSERT de la OT → SECURITY DEFINER
-- =====================================================
-- Ambos corren BEFORE INSERT y leen work_orders; con la policy angosta el
-- solicitante (no del equipo) no vería la OT por RLS, así que deben resolverla
-- como owner (sin RLS), o crear/editar una solicitud se rompería.

-- (1) Asignar el gerente desde el engagement de la OT.
CREATE OR REPLACE FUNCTION public.fr_wo_set_manager()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_mgr uuid;
BEGIN
  SELECT e.manager_id INTO v_mgr
  FROM public.work_orders wo
  JOIN public.engagements e ON e.engagement_id = wo.engagement_id
  WHERE wo.wo_id = NEW.wo_id;

  IF v_mgr IS NULL THEN
    RAISE EXCEPTION 'La OT % no tiene gerente asignado en su engagement; no puede usarse en una solicitud de fondos', NEW.wo_id;
  END IF;

  NEW.manager_staff_id := v_mgr;
  RETURN NEW;
END;
$$;

-- (2) Validar que la OT exista, esté Approved y su moneda coincida con la de la
--     solicitud (el form filtra por moneda, pero por API directa podría pegarse
--     una OT en otra moneda y mezclar monedas en aprobación/liquidación).
CREATE OR REPLACE FUNCTION public.fr_wo_validate_approved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text;
  v_wo_currency text;
  v_fr_currency text;
BEGIN
  SELECT approval_status, currency INTO v_status, v_wo_currency
  FROM public.work_orders WHERE wo_id = NEW.wo_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Work order % does not exist', NEW.wo_id;
  END IF;
  IF v_status <> 'Approved' THEN
    RAISE EXCEPTION 'Work order % must be Approved to be allocated (current: %)', NEW.wo_id, v_status;
  END IF;

  SELECT currency INTO v_fr_currency
  FROM public.fund_requests WHERE fund_request_id = NEW.fund_request_id;
  IF v_wo_currency IS DISTINCT FROM v_fr_currency THEN
    RAISE EXCEPTION 'La moneda de la OT (%) no coincide con la de la solicitud (%)', v_wo_currency, v_fr_currency;
  END IF;

  RETURN NEW;
END;
$$;

-- BUG 0722-164 — Solicitudes de fondos con OTs en dólares
-- =====================================================================
-- Síntoma: en /fund-requests/new solo se listaban OTs aprobadas en BOB, así que
-- un solicitante cuyo encargo está en dólares no podía crear ninguna solicitud.
--
-- El bloqueo tenía dos capas: el filtro del editor de distribución (cliente) y
-- este trigger, que exigía `work_orders.currency = fund_requests.currency`.
--
-- Premisa NUEVA (la que este archivo consolida): la moneda de la OT es la del
-- CONTRATO CON EL CLIENTE; la moneda de la solicitud es la del EFECTIVO que se
-- entrega al solicitante y que se rinde con facturas bolivianas (IVA 13 %). Son
-- dos cosas distintas, así que una OT en USD puede recibir una asignación en BOB
-- sin conversión alguna. La solicitud sigue siendo siempre BOB (el formulario no
-- tiene selector de moneda) y `fre_validate_wo_in_request` sigue exigiendo que la
-- moneda del GASTO coincida con la de la solicitud — la liquidación no cambia.
--
-- Por eso la igualdad de monedas se reemplaza por un chequeo de pertenencia: la
-- OT debe estar en una moneda que el módulo de fondos modela (BOB o USD). USDT
-- queda fuera a propósito: `work_orders.currency` lo admite desde
-- 20260626000001, pero fondos no lo soporta y el ticket no lo pide. El mismo
-- criterio está en el cliente (FUND_REQUEST_WO_CURRENCIES en
-- WorkOrderAllocationEditor.tsx), y esta es la capa que lo hace cumplir también
-- por API directa.
--
-- ⚠ NO reintroducir la igualdad de monedas sin antes decidir la moneda contable
-- de gastos y liquidación: si algún día la solicitud vuelve a poder ser USD, el
-- chequeo debe ir sobre la SOLICITUD, no sobre la OT.
--
-- Se reproduce la definición vigente de 20260714000000 (FEAT 0602-135) y se
-- conserva TODO lo demás: existencia de la OT, `approval_status = 'Approved'`,
-- el gate de estado efectivo del encargo (4 Aprobado / 5 Emergencia),
-- SECURITY DEFINER y search_path. No se toca el trigger
-- `tr_fr_wo_validate_approved` (sigue apuntando a esta función).
-- Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.fr_wo_validate_approved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text;
  v_wo_currency text;
  v_engagement_id uuid;
BEGIN
  SELECT approval_status, currency, engagement_id
    INTO v_status, v_wo_currency, v_engagement_id
  FROM public.work_orders WHERE wo_id = NEW.wo_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Work order % does not exist', NEW.wo_id;
  END IF;
  IF v_status <> 'Approved' THEN
    RAISE EXCEPTION 'Work order % must be Approved to be allocated (current: %)', NEW.wo_id, v_status;
  END IF;

  -- FEAT 0602-135: el estado efectivo del encargo debe admitir solicitudes (4/5). Bloquea
  -- Congelado(9)/Finalizado(7)/Cancelado(6)/Rechazado(8) y overrides no-cargables.
  IF NOT public.engagement_allows_hours_or_requests(v_engagement_id) THEN
    RAISE EXCEPTION 'El encargo no admite solicitudes de fondos en su estado actual';
  END IF;

  -- BUG 0722-164: la moneda de la OT ya no tiene que coincidir con la de la
  -- solicitud (el monto asignado va en la moneda de la solicitud), pero sí debe
  -- ser una que el módulo de fondos modela.
  IF v_wo_currency NOT IN ('BOB', 'USD') THEN
    RAISE EXCEPTION 'La moneda de la OT (%) no está habilitada para solicitudes de fondos', v_wo_currency;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

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
-- sin conversión alguna. `fre_validate_wo_in_request` sigue exigiendo que la
-- moneda del GASTO coincida con la de la solicitud — la liquidación no cambia.
--
-- Por eso la igualdad de monedas se reemplaza por DOS chequeos que expresan el
-- modelo de forma explícita, en la capa que le corresponde a cada uno:
--
--   (1) La OT debe estar en una moneda que el módulo de fondos modela (BOB o
--       USD). USDT queda fuera a propósito: `work_orders.currency` lo admite
--       desde 20260626000001, pero fondos no lo soporta y el ticket no lo pide.
--       El mismo criterio está en el cliente (FUND_REQUEST_WO_CURRENCIES en
--       WorkOrderAllocationEditor.tsx); esta es la capa que lo hace cumplir
--       también por API directa.
--
--   (2) La SOLICITUD debe estar en BOB. Hasta ahora esa invariante solo existía
--       en el formulario (sin selector de moneda) y el chequeo de igualdad la
--       sostenía de rebote: una solicitud USD no podía recibir OTs BOB y, como
--       `fund_request_submit` exige al menos una OT, quedaba muerta en borrador.
--       Al quitar la igualdad ese freno accidental desaparecía, así que la
--       invariante se declara acá — donde de verdad corresponde.
--
--   (3) La misma invariante sobre `fund_requests` (al final del archivo). (2)
--       valida el momento de ASIGNAR una OT, pero la invariante es
--       sobre una columna que puede mutar después: el trigger es
--       `BEFORE INSERT OR UPDATE OF wo_id` sobre la tabla hija, así que cambiar
--       `fund_requests.currency` a USD cuando las asignaciones YA existen no lo
--       dispara — y `fund_request_save_edit` acepta `currency` en su `p_fields`,
--       de modo que ni siquiera hace falta API cruda (basta `p_allocations` NULL).
--       `fund_request_submit` tampoco revisa la moneda (valida dueño, estado, ≥1
--       OT, cuadre de la suma, OTs Approved y estado del encargo). Este trigger
--       es la única capa que cubre los tres caminos: INSERT, UPDATE y la RPC.
--
-- ⚠ NO reintroducir la igualdad de monedas OT=solicitud. Si algún día la
-- solicitud debe poder ser USD, lo que se relaja es (2)+(3), y antes hay que
-- decidir la moneda contable de gastos, IVA y liquidación.
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
  v_fr_currency text;
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

  -- BUG 0722-164 (1): la moneda de la OT ya no tiene que coincidir con la de la
  -- solicitud (el monto asignado va en la moneda de la solicitud), pero sí debe
  -- ser una que el módulo de fondos modela.
  IF v_wo_currency NOT IN ('BOB', 'USD') THEN
    RAISE EXCEPTION 'La moneda de la OT (%) no está habilitada para solicitudes de fondos', v_wo_currency;
  END IF;

  -- BUG 0722-164 (2): la solicitud es el EFECTIVO entregado y se rinde con
  -- facturas bolivianas + IVA 13 %, así que debe estar en BOB. Reemplaza el freno
  -- accidental que daba la igualdad de monedas (ver cabecera).
  SELECT currency INTO v_fr_currency
  FROM public.fund_requests WHERE fund_request_id = NEW.fund_request_id;
  -- IS DISTINCT FROM y no <>: con NULL, `<>` devuelve NULL y el IF no dispararía.
  IF v_fr_currency IS DISTINCT FROM 'BOB' THEN
    RAISE EXCEPTION 'La solicitud debe estar en BOB para asignarle OTs (actual: %)', v_fr_currency;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- (3) La invariante BOB, sobre la columna misma
-- =====================================================================
-- Cubre los tres caminos de una sola vez — INSERT, UPDATE directo por API y la
-- RPC `fund_request_save_edit` (que acepta `currency` en su jsonb) — porque el
-- chequeo del trigger de la tabla hija solo corre al asignar OTs y no ve un
-- cambio de moneda posterior a la asignación.
--
-- Se hace con TRIGGER y no con CHECK. Un `CHECK (currency = 'BOB')`, incluso
-- declarado NOT VALID, se evalúa en CADA update de la fila: NOT VALID solo se
-- salta el escaneo inicial de la tabla. En un entorno con una solicitud USD
-- histórica (el formulario llegó a tener selector de moneda antes de que se
-- quitara), eso NO la deja como estaba: la deja VARADA — aprobar, desembolsar,
-- liquidar y cerrar hacen UPDATE sobre `fund_requests` y todos fallarían con un
-- 23514, aunque no toquen la moneda. Cambiar un deploy ruidoso por un flujo de
-- negocio que revienta semanas después es peor.
--
-- La invariante real no es "toda fila es BOB" sino "nadie CREA una solicitud que
-- no sea BOB ni CAMBIA la moneda de una existente". Eso es justo lo que valida
-- este trigger, así que una fila legacy en USD sigue procesándose con normalidad
-- (sus updates no tocan `currency`) pero ya no puede aparecer ninguna nueva.
-- Tampoco se reescriben filas históricas a BOB: falsearía datos contables — si
-- existe alguna, es el negocio quien decide qué hacer con ella.
--
-- Para habilitar solicitudes en USD hay que DROPear este trigger — y antes
-- resolver la moneda contable de gastos, IVA y liquidación.
-- Idempotente.

-- Revierte el CHECK de la primera versión de esta migración (ya aplicado en el
-- mirror): habría varado cualquier solicitud USD histórica.
ALTER TABLE public.fund_requests
  DROP CONSTRAINT IF EXISTS fund_requests_currency_bob_only;

CREATE OR REPLACE FUNCTION public.fund_requests_enforce_bob()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.currency IS DISTINCT FROM 'BOB' THEN
      RAISE EXCEPTION 'Las solicitudes de fondos se registran en BOB (recibido: %)', NEW.currency;
    END IF;
  -- En UPDATE solo se valida cuando la moneda CAMBIA: así una fila legacy en USD
  -- puede seguir aprobándose, desembolsándose, liquidándose y cerrándose.
  ELSIF NEW.currency IS DISTINCT FROM OLD.currency
        AND NEW.currency IS DISTINCT FROM 'BOB' THEN
    RAISE EXCEPTION 'No se puede cambiar la moneda de la solicitud a % (solo BOB)', NEW.currency;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fund_requests_enforce_bob ON public.fund_requests;
CREATE TRIGGER tr_fund_requests_enforce_bob
  BEFORE INSERT OR UPDATE ON public.fund_requests
  FOR EACH ROW EXECUTE FUNCTION public.fund_requests_enforce_bob();

NOTIFY pgrst, 'reload schema';

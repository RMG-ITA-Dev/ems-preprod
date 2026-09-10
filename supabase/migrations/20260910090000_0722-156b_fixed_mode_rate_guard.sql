-- Bug 0722-156b (Fase 2) — review iteracion 12 (codex), hallazgo #1. No se reescribe la
-- migracion existente 20260905172820_0722-156b_add_payment_exchange_rates.sql (convencion
-- del proyecto: esa migracion ya se confirmo aplicada contra el Supabase de Test el
-- 2026-09-08 -- ver bugs/0722-156/review.md) -- esta migracion nueva reemplaza la funcion
-- del trigger via CREATE OR REPLACE, valido entre migraciones.
--
-- Hallazgo: el chequeo de aprobacion (v_exchange_rate_mode = 'variable' AND
-- v_approval_status IS DISTINCT FROM 'Approved') solo se evaluaba en modo variable. En
-- modo fijo, mientras la cuota siguiera 'Pending', no habia NINGUN chequeo de valor -- un
-- UPDATE directo (mismo rol de equipo que ya autoriza la policy RLS, sin chequear
-- approval_status) podia poner cualquier numero en invoice_exchange_rate/
-- payment_exchange_rate, rompiendo la garantia central de "Fijo": todas las cuotas deben
-- reflejar siempre el mismo TC congelado del plan. La UI nunca permite esto (en modo Fijo
-- las celdas de TC por cuota son de solo lectura, ver WorkOrderPaymentPlanSection.tsx) --
-- alcanzable solo via un UPDATE directo/malformado -- defensa en profundidad, no una
-- regresion de UI.
--
-- Fix: ademas del chequeo ya existente para modo variable, exigir en modo fijo que el
-- valor nuevo coincida exactamente con el TC vigente del plan (wo_payment_plan.
-- exchange_rate) -- en Fijo nunca existe una captura independiente por cuota.

CREATE OR REPLACE FUNCTION public.wo_payment_installments_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
  v_exchange_rate_mode text;
  v_plan_exchange_rate numeric;
  v_legal_transition boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.wo_payment_installments WHERE installment_id = NEW.installment_id) THEN
      -- No es una insercion real -- resolvera como UPDATE por conflicto; el BEFORE
      -- UPDATE real que Postgres dispara a continuacion para esta misma fila aplica
      -- el resto de este guard con el OLD correcto.
      RETURN NEW;
    END IF;
    IF NEW.status <> 'Pending' THEN
      RAISE EXCEPTION 'INSTALLMENT_LOCKED: una cuota nueva debe crearse en estado Pending';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_legal_transition := CASE OLD.status
      WHEN 'Pending'   THEN NEW.status = 'Invoiced'
      WHEN 'Overdue'   THEN NEW.status = 'Invoiced'
      WHEN 'Invoiced'  THEN NEW.status IN ('Completed', 'Overdue')
      ELSE false
    END;
    IF NOT v_legal_transition THEN
      RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: % -> % no es una transicion de estado permitida', OLD.status, NEW.status;
    END IF;
  END IF;

  -- MUST FIX review iteracion 2 #1/#3 (decision del operador 2026-09-07: "si una cuota
  -- ya esta facturada, no se puede modificar o eliminar de ninguna manera"): una vez
  -- que status sale de 'Pending', percentage/amount/installment_number tambien quedan
  -- congelados -- no solo las 2 columnas de TC. Sin esto, agregar/quitar cuotas del
  -- plan podia redistribuir el porcentaje de una cuota ya facturada, desalineandolo
  -- del TC ya congelado (que se calculo sobre el porcentaje original).
  IF OLD.status <> 'Pending' AND (
    NEW.percentage IS DISTINCT FROM OLD.percentage
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
  ) THEN
    RAISE EXCEPTION 'INSTALLMENT_LOCKED: esta cuota ya fue facturada y no puede modificarse (porcentaje/monto/numero)';
  END IF;

  IF NEW.invoice_exchange_rate IS DISTINCT FROM OLD.invoice_exchange_rate
     OR NEW.payment_exchange_rate IS DISTINCT FROM OLD.payment_exchange_rate THEN
    SELECT wo.approval_status, p.exchange_rate_mode, p.exchange_rate
    INTO v_approval_status, v_exchange_rate_mode, v_plan_exchange_rate
    FROM public.work_orders wo
    JOIN public.wo_payment_plan p ON p.wo_id = wo.wo_id
    WHERE wo.wo_id = NEW.wo_id;
  END IF;

  IF NEW.invoice_exchange_rate IS DISTINCT FROM OLD.invoice_exchange_rate THEN
    IF OLD.status <> 'Pending' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de facturacion de esta cuota ya esta congelado';
    END IF;
    IF v_exchange_rate_mode = 'variable' AND v_approval_status IS DISTINCT FROM 'Approved' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de facturacion solo puede capturarse una vez que la orden de trabajo fue aprobada';
    END IF;
    IF v_exchange_rate_mode = 'fijo' AND NEW.invoice_exchange_rate IS DISTINCT FROM v_plan_exchange_rate THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: en modo fijo, el tipo de cambio de facturacion de la cuota debe coincidir con el del plan';
    END IF;
  END IF;

  IF NEW.payment_exchange_rate IS DISTINCT FROM OLD.payment_exchange_rate THEN
    IF OLD.status = 'Completed' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago de esta cuota ya esta congelado';
    END IF;
    IF v_exchange_rate_mode = 'variable' THEN
      IF OLD.status = 'Pending' THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago solo puede capturarse una vez facturada la cuota';
      END IF;
      IF v_approval_status IS DISTINCT FROM 'Approved' THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago solo puede capturarse una vez que la orden de trabajo fue aprobada';
      END IF;
    END IF;
    IF v_exchange_rate_mode = 'fijo' AND NEW.payment_exchange_rate IS DISTINCT FROM v_plan_exchange_rate THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: en modo fijo, el tipo de cambio de pago de la cuota debe coincidir con el del plan';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

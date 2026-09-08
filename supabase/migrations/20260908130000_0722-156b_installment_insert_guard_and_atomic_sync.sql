-- Bug 0722-156b (Fase 2) — review iteracion 4, hallazgos #3 y #4. No se reescribe la
-- migracion existente 20260905172820_0722-156b_add_payment_exchange_rates.sql (convencion
-- del proyecto, plan_v2.md Out of Scope "Reescribir migraciones existentes") -- esta
-- migracion nueva reemplaza la funcion del trigger (CREATE OR REPLACE, valido entre
-- migraciones) y agrega una funcion nueva.

--
-- #3: trg_wo_payment_installments_guard_exchange_rate solo corria BEFORE UPDATE -- un
-- INSERT directo (mismo rol de team/admin que ya puede escribir la tabla via las
-- policies "Team can manage payment installments"/"Admins can manage payment
-- installments") podia crear una cuota ya Invoiced/Completed con un TC "congelado"
-- arbitrario, sin pasar por ninguna transicion validada. La app siempre inserta cuotas
-- nuevas en 'Pending' (handleNumInstallmentsChange, WorkOrderPaymentPlanSection.tsx) --
-- nunca en otro estado -- asi que exigir 'Pending' en el INSERT cierra el bypass sin
-- romper el comportamiento legitimo existente: prellenar el TC de una cuota nueva en
-- modo Variable sigue permitido, porque la fila sigue Pending y totalmente editable
-- hasta que se factura (la propia UPDATE que la factura ya pasa por el resto del guard).
--
-- CORREGIDO tras correr el harness local (2026-09-08): sync_wo_payment_installments()
-- envia TODAS las cuotas (nuevas Y existentes) por un unico
-- `INSERT ... ON CONFLICT (installment_id) DO UPDATE`. Postgres dispara el trigger
-- BEFORE INSERT para CADA fila propuesta -- incluidas las que van a resolver como
-- UPDATE por conflicto, ANTES de que el conflicto se detecte -- y si de verdad resuelven
-- como UPDATE, dispara ADEMAS, para esa misma fila, el trigger BEFORE UPDATE real (con
-- el OLD correcto) antes de aplicar el SET. La primera version de este fix exigia
-- 'Pending' incondicionalmente en el branch de INSERT, así que rechazaba (con
-- INSTALLMENT_LOCKED) cualquier cuota YA FACTURADA que el batch reenviara sin cambios --
-- rompiendo el guardado normal del plan completo apenas habia una sola cuota Invoiced.
-- Fix: si `NEW.installment_id` ya existe en la tabla, esta fila NO es una insercion real
-- -- dejarla pasar en el branch de INSERT (RETURN NEW sin chequear status) y confiar en
-- que el BEFORE UPDATE real, que Postgres dispara despues para esa misma fila, es quien
-- aplica todas las reglas de freeze/transicion de mas abajo. Solo una fila que
-- efectivamente NO existe todavia (insercion real, sin BEFORE UPDATE posterior) exige
-- 'Pending' aca.
--

CREATE OR REPLACE FUNCTION public.wo_payment_installments_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
  v_exchange_rate_mode text;
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

  IF OLD.status <> 'Pending' AND (
    NEW.percentage IS DISTINCT FROM OLD.percentage
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
  ) THEN
    RAISE EXCEPTION 'INSTALLMENT_LOCKED: esta cuota ya fue facturada y no puede modificarse (porcentaje/monto/numero)';
  END IF;

  IF NEW.invoice_exchange_rate IS DISTINCT FROM OLD.invoice_exchange_rate
     OR NEW.payment_exchange_rate IS DISTINCT FROM OLD.payment_exchange_rate THEN
    SELECT wo.approval_status, p.exchange_rate_mode
    INTO v_approval_status, v_exchange_rate_mode
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wo_payment_installments_guard_exchange_rate ON public.wo_payment_installments;
CREATE TRIGGER trg_wo_payment_installments_guard_exchange_rate BEFORE INSERT OR UPDATE ON public.wo_payment_installments
  FOR EACH ROW EXECUTE FUNCTION public.wo_payment_installments_guard_exchange_rate();

--
-- #4: useBatchUpsertInstallments (frontend) borraba las cuotas huerfanas y despues
-- hacia el upsert de las cuotas mantenidas/nuevas en 2 llamadas HTTP separadas a
-- PostgREST -- cada una es su propia transaccion, asi que si el DELETE tenia exito y el
-- upsert posterior fallaba (ej. INSTALLMENT_LOCKED por un feeWithTax que recalculaba el
-- amount de una cuota ya facturada), el DELETE quedaba committeado igual. Esta funcion
-- hace ambos pasos dentro de la misma invocacion -- una funcion es una sola transaccion
-- Postgres, asi que un error en cualquier paso revierte todo, incluido el DELETE.
--
-- SECURITY INVOKER (default, sin declarar SECURITY DEFINER): corre con el rol de quien
-- llama, asi que las RLS policies existentes ("Team can manage payment installments" /
-- "Admins can manage payment installments") se aplican exactamente igual que con las 2
-- llamadas directas que reemplaza -- no se duplica ni se reinterpreta la logica de
-- autorizacion a mano.
--

CREATE OR REPLACE FUNCTION public.sync_wo_payment_installments(
  p_plan_id uuid,
  p_wo_id uuid,
  p_installments jsonb
) RETURNS SETOF public.wo_payment_installments
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_kept_ids uuid[];
BEGIN
  SELECT array_agg((row_data->>'installment_id')::uuid)
  INTO v_kept_ids
  FROM jsonb_array_elements(p_installments) AS row_data
  WHERE row_data->>'installment_id' IS NOT NULL;

  -- Borra huerfanos PRIMERO, para que una fila renumerada no choque contra el UNIQUE
  -- (plan_id, installment_number) de una fila vieja que todavia no se borro -- mismo
  -- orden que ya usaba useBatchUpsertInstallments, ahora atomico con el paso de abajo.
  IF v_kept_ids IS NOT NULL AND array_length(v_kept_ids, 1) > 0 THEN
    DELETE FROM public.wo_payment_installments
    WHERE plan_id = p_plan_id AND installment_id <> ALL (v_kept_ids);
  ELSE
    DELETE FROM public.wo_payment_installments
    WHERE plan_id = p_plan_id;
  END IF;

  RETURN QUERY
  INSERT INTO public.wo_payment_installments AS w (
    installment_id, plan_id, wo_id, installment_number,
    agreed_invoice_date, agreed_payment_date,
    collection_invoice_date, collection_payment_date, payment_date_actual,
    percentage, amount, status, invoice_exchange_rate, payment_exchange_rate
  )
  SELECT
    COALESCE((row_data->>'installment_id')::uuid, gen_random_uuid()),
    p_plan_id,
    p_wo_id,
    (row_data->>'installment_number')::integer,
    (row_data->>'agreed_invoice_date')::date,
    (row_data->>'agreed_payment_date')::date,
    (row_data->>'collection_invoice_date')::date,
    (row_data->>'collection_payment_date')::date,
    (row_data->>'payment_date_actual')::date,
    (row_data->>'percentage')::numeric,
    (row_data->>'amount')::numeric,
    row_data->>'status',
    (row_data->>'invoice_exchange_rate')::numeric,
    (row_data->>'payment_exchange_rate')::numeric
  FROM jsonb_array_elements(p_installments) AS row_data
  ON CONFLICT (installment_id) DO UPDATE SET
    installment_number = EXCLUDED.installment_number,
    agreed_invoice_date = EXCLUDED.agreed_invoice_date,
    agreed_payment_date = EXCLUDED.agreed_payment_date,
    collection_invoice_date = EXCLUDED.collection_invoice_date,
    collection_payment_date = EXCLUDED.collection_payment_date,
    payment_date_actual = EXCLUDED.payment_date_actual,
    percentage = EXCLUDED.percentage,
    amount = EXCLUDED.amount,
    status = EXCLUDED.status,
    invoice_exchange_rate = EXCLUDED.invoice_exchange_rate,
    payment_exchange_rate = EXCLUDED.payment_exchange_rate
  RETURNING w.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_wo_payment_installments(uuid, uuid, jsonb) TO authenticated;

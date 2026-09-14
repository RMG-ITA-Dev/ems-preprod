-- Bug 0722-156b (Fase 2 de 2): tipo de cambio fijo/variable por cuota en el plan de
-- pagos de las ordenes de trabajo. Ver bugs/0722-156/plan_v2.md para el detalle
-- completo (Proposed Fix §1). Depende de exchange_rate_history (Fase 1, migracion
-- 20260905070913) para el autocompletado en el frontend; esta migracion en si no la
-- referencia.

ALTER TABLE public.wo_payment_plan
  ADD COLUMN IF NOT EXISTS exchange_rate_mode text NOT NULL DEFAULT 'fijo'
    CHECK (exchange_rate_mode IN ('fijo', 'variable'));

ALTER TABLE public.wo_payment_installments
  ADD COLUMN IF NOT EXISTS invoice_exchange_rate numeric CHECK (invoice_exchange_rate IS NULL OR invoice_exchange_rate > 0),
  ADD COLUMN IF NOT EXISTS payment_exchange_rate numeric CHECK (payment_exchange_rate IS NULL OR payment_exchange_rate > 0);

-- Backfill: todo plan existente ya se comportaba como "fijo" (un solo TC para toda la
-- OT) -- copiar ese TC a las 2 columnas nuevas de cada cuota existente, preservando
-- NULL cuando el plan no tenia TC capturado (nunca inventar un valor).
--
-- Solo rellena columnas que TODAVIA estan en NULL -- nunca sobrescribe un valor ya
-- presente. Sin este guard, reejecutar el backfill (ej. porque un ambiente ya tenia una
-- version anterior de esta migracion aplicada a mano) intenta reescribir el TC de una
-- cuota ya facturada con el exchange_rate ACTUAL del plan, y el trigger de freeze de mas
-- abajo (correctamente) lo rechaza con EXCHANGE_RATE_LOCKED si ese TC actual diverge del
-- que quedo congelado en su momento (posible en datos historicos, ya que antes de este
-- ticket no existia ningun freeze a nivel de cuota).
UPDATE public.wo_payment_installments i
SET invoice_exchange_rate = COALESCE(i.invoice_exchange_rate, p.exchange_rate),
    payment_exchange_rate = COALESCE(i.payment_exchange_rate, p.exchange_rate)
FROM public.wo_payment_plan p
WHERE i.plan_id = p.plan_id
  AND (i.invoice_exchange_rate IS NULL OR i.payment_exchange_rate IS NULL);

--
-- Freeze de wo_payment_plan.exchange_rate / exchange_rate_mode: una vez que la orden
-- de trabajo dueña del plan llega a approval_status = 'Approved', ninguno de los dos
-- campos puede volver a cambiar. Sin excepcion para is_admin(): es un snapshot de
-- auditoria (que TC se pacto al cerrar con el cliente), no una regla de permisos --
-- mismo criterio que protect_approved_time_entries/prevent_imported_timer_delete.
--
-- MUST FIX review iteracion 2 #4 (decision del operador: bloquear): ademas del freeze
-- por aprobacion, si el plan ya tiene alguna cuota que dejo de estar 'Pending' (su
-- invoice_exchange_rate ya quedo congelado), tampoco se puede tocar -- ni siquiera si
-- la OT volvio a Draft (revertir aprobacion + cambiar de modo/TC dejaria el TC
-- "oficial" del plan desalineado del TC realmente aplicado a esa cuota ya facturada).
--

CREATE OR REPLACE FUNCTION public.wo_payment_plan_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
  v_has_locked_installment boolean;
BEGIN
  IF NEW.exchange_rate IS NOT DISTINCT FROM OLD.exchange_rate
     AND NEW.exchange_rate_mode IS NOT DISTINCT FROM OLD.exchange_rate_mode THEN
    RETURN NEW;
  END IF;

  SELECT approval_status INTO v_approval_status
  FROM public.work_orders
  WHERE wo_id = NEW.wo_id;

  IF v_approval_status = 'Approved' THEN
    RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio del plan de pagos no puede modificarse: la orden de trabajo ya fue aprobada';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.wo_payment_installments
    WHERE plan_id = NEW.plan_id AND status <> 'Pending'
  ) INTO v_has_locked_installment;

  IF v_has_locked_installment THEN
    RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio del plan de pagos no puede modificarse: ya existe una cuota facturada con un tipo de cambio congelado';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wo_payment_plan_guard_exchange_rate ON public.wo_payment_plan;
CREATE TRIGGER trg_wo_payment_plan_guard_exchange_rate BEFORE UPDATE ON public.wo_payment_plan
  FOR EACH ROW EXECUTE FUNCTION public.wo_payment_plan_guard_exchange_rate();

--
-- Freeze de wo_payment_installments.invoice_exchange_rate / payment_exchange_rate:
-- se basa SIEMPRE en la columna status persistida de la propia fila, nunca en el
-- estado efectivo de pantalla (getEffectiveInstallmentStatus vive solo en el
-- frontend y jamas escribe la columna status real). Un status persistido 'Overdue'
-- solo se alcanza revirtiendo manualmente desde 'Invoiced' -- nunca directo desde
-- 'Pending' -- asi que "status salio de Pending" y "ya fue Invoiced" son
-- equivalentes aca. Compara columna por columna (IS DISTINCT FROM) para no
-- rechazar el UPDATE completo por otros campos de la misma fila (ej. una
-- correccion de collection_invoice_date), y para que un batch upsert que reenvia
-- el mismo TC ya congelado sea un no-op.
--
-- Amendment 2026-09-07 (decision del operador, refinada en review iteracion 1): ninguna
-- de las 2 columnas puede capturarse mientras la OT dueña siga sin Aprobar -- el plan
-- de pagos define el "contrato" (TC de creacion, modo, dias, cuotas, fecha/porcentaje
-- acordados) mientras esta en Draft; TC Facturacion/Pago y Cobranza son el registro de
-- lo que efectivamente ocurre, y eso arranca recien post-aprobacion.
--
-- ESA regla de aprobacion aplica UNICAMENTE en modo 'variable': ahi cada cuota captura
-- su propio TC de forma independiente, y es eso lo que no puede ocurrir antes de
-- aprobar. En modo 'fijo' las 2 columnas nunca son una captura independiente -- son un
-- espejo automatico del TC de creacion del plan (que ya es editable en Draft desde
-- antes de este ticket, y se congela junto con el resto del plan al aprobar via
-- wo_payment_plan_guard_exchange_rate) -- exigir aprobacion ahi rompia el re-sync de
-- Fijo descrito en plan_v2.md Proposed Fix §2 (editar el TC de creacion en Draft debe
-- re-sincronizar las cuotas en el mismo guardado). Ver plan_v2.md Amendment 2026-09-07.
--
-- payment_exchange_rate ademas exige, solo en modo 'variable', que la cuota haya sido
-- facturada (status <> 'Pending') antes de poder capturarse -- MUST FIX review
-- iteracion 1 #1: antes de esta correccion, el campo de pago quedaba editable en
-- pantalla incluso con la cuota todavia Pending, sin haberse facturado nunca.
--
-- Tambien valida que NEW.status solo pueda tomar una transicion permitida del state
-- machine (mismo mapa que STATUS_TRANSITIONS en WorkOrderPaymentPlanSection.tsx) --
-- MUST FIX review iteracion 1 #4: sin esto, un UPDATE directo podia revertir una cuota
-- Invoiced a Pending (dejando su invoice_exchange_rate otra vez "editable" segun el
-- chequeo de status de mas abajo) y asi burlar el freeze en 2 pasos.
--
-- MUST FIX review iteracion 4 #3: el trigger de arriba solo corria BEFORE UPDATE -- un
-- INSERT directo (mismo rol de team/admin que ya puede escribir la tabla) podia crear
-- una cuota ya Invoiced/Completed con un TC "congelado" arbitrario, sin pasar por
-- ninguna transicion validada. Ahora corre BEFORE INSERT OR UPDATE. La app siempre
-- inserta cuotas nuevas en 'Pending' (handleNumInstallmentsChange,
-- WorkOrderPaymentPlanSection.tsx) -- nunca en otro estado -- asi que exigir 'Pending'
-- en el INSERT cierra el bypass sin romper el prellenado legitimo del TC de una cuota
-- nueva en modo Variable (la fila sigue Pending y totalmente editable hasta que se
-- factura, momento en el que la propia UPDATE ya pasa por el resto de este guard).
--
-- CORREGIDO tras correr el harness local (2026-09-08): sync_wo_payment_installments()
-- (mas abajo) envia TODAS las cuotas (nuevas Y existentes) por un unico
-- `INSERT ... ON CONFLICT (installment_id) DO UPDATE`. Postgres dispara el trigger
-- BEFORE INSERT para CADA fila propuesta -- incluidas las que van a resolver como
-- UPDATE por conflicto, ANTES de que el conflicto se detecte -- y si de verdad
-- resuelven como UPDATE, dispara ADEMAS, para esa misma fila, el trigger BEFORE UPDATE
-- real (con el OLD correcto) antes de aplicar el SET. Exigir 'Pending'
-- incondicionalmente en el branch de INSERT rechazaba (con INSTALLMENT_LOCKED)
-- cualquier cuota YA FACTURADA que el batch reenviara sin cambios -- rompiendo el
-- guardado normal del plan completo apenas habia una sola cuota Invoiced. Fix: si
-- `NEW.installment_id` ya existe en la tabla, esta fila NO es una insercion real --
-- dejarla pasar en el branch de INSERT (RETURN NEW sin chequear status) y confiar en
-- que el BEFORE UPDATE real, que Postgres dispara despues para esa misma fila, aplica
-- todas las reglas de freeze/transicion de mas abajo. Solo una fila que efectivamente
-- NO existe todavia (insercion real, sin BEFORE UPDATE posterior) exige 'Pending' aca.
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
-- MUST FIX review iteracion 2 #1 (decision del operador 2026-09-07: "si una cuota ya
-- esta facturada, no se puede modificar o eliminar de ninguna manera"): el UPDATE
-- trigger de arriba no cubre un DELETE -- useBatchUpsertInstallments (frontend) borra
-- toda fila "huerfana" (no presente en el array actual) al guardar el plan, y sin este
-- trigger ese DELETE nunca pasaba por ninguna validacion, perdiendo para siempre el
-- snapshot de auditoria de una cuota ya facturada/pagada.
--

CREATE OR REPLACE FUNCTION public.wo_payment_installments_guard_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status <> 'Pending' THEN
    RAISE EXCEPTION 'INSTALLMENT_LOCKED: esta cuota ya fue facturada y no puede eliminarse';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_wo_payment_installments_guard_delete ON public.wo_payment_installments;
CREATE TRIGGER trg_wo_payment_installments_guard_delete BEFORE DELETE ON public.wo_payment_installments
  FOR EACH ROW EXECUTE FUNCTION public.wo_payment_installments_guard_delete();

--
-- MUST FIX review iteracion 4 #4: useBatchUpsertInstallments (frontend) borraba las
-- cuotas huerfanas y despues hacia el upsert de las cuotas mantenidas/nuevas en 2
-- llamadas HTTP separadas a PostgREST -- cada una es su propia transaccion, asi que si
-- el DELETE tenia exito y el upsert posterior fallaba (ej. INSTALLMENT_LOCKED por un
-- feeWithTax que recalculaba el amount de una cuota ya facturada), el DELETE quedaba
-- committeado igual. Esta funcion hace ambos pasos dentro de la misma invocacion -- una
-- funcion es una sola transaccion Postgres, asi que un error en cualquier paso revierte
-- todo, incluido el DELETE.
--
-- SECURITY INVOKER (default, sin declarar SECURITY DEFINER): corre con el rol de quien
-- llama, asi que las RLS policies existentes ("Team can manage payment installments" /
-- "Admins can manage payment installments") se aplican exactamente igual que con las 2
-- llamadas directas que reemplaza -- no se duplica ni se reinterpreta la logica de
-- autorizacion a mano.
--
-- MUST FIX review iteracion 5 #1: el INSERT ... ON CONFLICT (installment_id) DO UPDATE
-- de abajo no validaba que las filas que resuelven por conflicto (installment_id ya
-- existente) pertenecieran al plan_id declarado en p_plan_id -- su SET no incluye
-- plan_id/wo_id, asi que un installment_id de OTRO plan incluido en p_installments
-- actualizaba esa fila ajena (percentage/amount/status/TCs/fechas) sin ninguna
-- verificacion de ownership. El guard de freeze de arriba tampoco lo cubre -- solo
-- valida transicion de estado y freeze por status, nunca a que plan pertenece la fila.
-- Mitigado parcialmente por RLS (SECURITY INVOKER) pero rompia el aislamiento por
-- plan/OT que la firma del RPC promete, alcanzable via una llamada RPC directa/
-- malformada (la UI normal nunca arma un payload con installment_id de otro plan). Fix:
-- antes del DELETE/INSERT, rechazar explicitamente si algun installment_id recibido que
-- ya existe en la tabla pertenece a un plan_id distinto de p_plan_id.
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

  IF v_kept_ids IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.wo_payment_installments existing
    WHERE existing.installment_id = ANY (v_kept_ids)
      AND existing.plan_id <> p_plan_id
  ) THEN
    RAISE EXCEPTION 'INSTALLMENT_PLAN_MISMATCH: una o mas cuotas del payload no pertenecen al plan de pagos indicado';
  END IF;

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

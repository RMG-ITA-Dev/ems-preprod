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
UPDATE public.wo_payment_installments i
SET invoice_exchange_rate = p.exchange_rate,
    payment_exchange_rate = p.exchange_rate
FROM public.wo_payment_plan p
WHERE i.plan_id = p.plan_id;

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

CREATE OR REPLACE FUNCTION public.wo_payment_installments_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
  v_exchange_rate_mode text;
  v_legal_transition boolean;
BEGIN
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
CREATE TRIGGER trg_wo_payment_installments_guard_exchange_rate BEFORE UPDATE ON public.wo_payment_installments
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

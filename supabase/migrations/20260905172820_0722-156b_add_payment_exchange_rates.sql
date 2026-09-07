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

CREATE OR REPLACE FUNCTION public.wo_payment_plan_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
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
-- Amendment 2026-09-07 (decision del operador): ademas del freeze por status, ninguna
-- de las 2 columnas puede capturarse mientras la OT dueña siga sin Aprobar -- el plan
-- de pagos define el "contrato" (TC de creacion, modo, dias, cuotas, fecha/porcentaje
-- acordados) mientras esta en Draft; TC Facturacion/Pago y Cobranza son el registro de
-- lo que efectivamente ocurre, y eso arranca recien post-aprobacion. Sin este chequeo,
-- una transicion de estado prematura (ej. un admin marcando "Facturado" en una OT
-- todavia en Draft, algo que la UI ya bloquea via isStatusEditable pero que esta
-- funcion no dependia de eso) congelaria el TC en NULL/vacio para siempre, sin forma
-- de corregirlo despues -- el mismo criterio que ya aplica wo_payment_plan_guard_
-- exchange_rate sobre exchange_rate/exchange_rate_mode.
--

CREATE OR REPLACE FUNCTION public.wo_payment_installments_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
BEGIN
  IF NEW.invoice_exchange_rate IS DISTINCT FROM OLD.invoice_exchange_rate
     OR NEW.payment_exchange_rate IS DISTINCT FROM OLD.payment_exchange_rate THEN
    SELECT approval_status INTO v_approval_status
    FROM public.work_orders
    WHERE wo_id = NEW.wo_id;
  END IF;

  IF NEW.invoice_exchange_rate IS DISTINCT FROM OLD.invoice_exchange_rate THEN
    IF OLD.status <> 'Pending' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de facturacion de esta cuota ya esta congelado';
    END IF;
    IF v_approval_status IS DISTINCT FROM 'Approved' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de facturacion solo puede capturarse una vez que la orden de trabajo fue aprobada';
    END IF;
  END IF;

  IF NEW.payment_exchange_rate IS DISTINCT FROM OLD.payment_exchange_rate THEN
    IF OLD.status = 'Completed' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago de esta cuota ya esta congelado';
    END IF;
    IF v_approval_status IS DISTINCT FROM 'Approved' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago solo puede capturarse una vez que la orden de trabajo fue aprobada';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wo_payment_installments_guard_exchange_rate ON public.wo_payment_installments;
CREATE TRIGGER trg_wo_payment_installments_guard_exchange_rate BEFORE UPDATE ON public.wo_payment_installments
  FOR EACH ROW EXECUTE FUNCTION public.wo_payment_installments_guard_exchange_rate();

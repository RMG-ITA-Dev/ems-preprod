-- Fund Request Expenses — endurecer el trigger de transición (column-level)
-- =========================================================================
-- RLS es a nivel de FILA, no de columna, así que las políticas de UPDATE no
-- bastan para impedir que un usuario toque columnas que no le corresponden.
-- Se refuerza `fre_validate_transition` con dos guardas (todas para no-admin):
--
--  (P1a) El solicitante NO puede ENCENDER `returned_by_assistant` (false->true).
--        Forjar ese flag y luego pasar a 'aprobado_gerente' brincaría la
--        re-aprobación del gerente (el flag solo lo prende el asistente=admin).
--        Apagarlo en el reenvío (true->false) sigue permitido.
--
--  (P1b) Si quien actúa NO es el solicitante (es decir, el gerente), solo puede
--        tocar columnas de DECISIÓN (status/notas); se bloquea cualquier cambio
--        a los datos del gasto (monto, OT, fechas, factura, etc.), que de otro
--        modo corromperían la liquidación.
--
-- El admin (contabilidad/asistente) queda exento. El trigger pasa de
-- BEFORE UPDATE OF status a BEFORE UPDATE para disparar aunque solo cambien
-- columnas distintas de status. SECURITY DEFINER para resolver el dueño sin
-- depender de RLS dentro del trigger. Idempotente.

CREATE OR REPLACE FUNCTION public.fre_validate_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := get_my_staff_id();
  v_is_requester BOOLEAN;
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- (P1a) Un no-admin no puede ENCENDER el flag de devolución del asistente.
  IF NEW.returned_by_assistant AND NOT OLD.returned_by_assistant THEN
    RAISE EXCEPTION 'No autorizado a marcar el gasto como devuelto por contabilidad';
  END IF;

  -- ¿El que actúa es el solicitante (dueño) de la solicitud?
  SELECT (fr.requester_staff_id = v_me) INTO v_is_requester
  FROM public.fund_requests fr
  WHERE fr.fund_request_id = NEW.fund_request_id;

  -- (P1b) Si NO es el solicitante (=> gerente), solo puede tocar columnas de
  -- decisión; los datos del gasto quedan inmutables para él.
  IF NOT COALESCE(v_is_requester, false) THEN
    IF NEW.amount           IS DISTINCT FROM OLD.amount
       OR NEW.wo_id            IS DISTINCT FROM OLD.wo_id
       OR NEW.expense_type_id  IS DISTINCT FROM OLD.expense_type_id
       OR NEW.expense_date     IS DISTINCT FROM OLD.expense_date
       OR NEW.expense_date_end IS DISTINCT FROM OLD.expense_date_end
       OR NEW.days             IS DISTINCT FROM OLD.days
       OR NEW.description      IS DISTINCT FROM OLD.description
       OR NEW.document_number  IS DISTINCT FROM OLD.document_number
       OR NEW.supplier_name    IS DISTINCT FROM OLD.supplier_name
       OR NEW.supplier_tax_id  IS DISTINCT FROM OLD.supplier_tax_id
       OR NEW.attachment_url   IS DISTINCT FROM OLD.attachment_url
       OR NEW.currency         IS DISTINCT FROM OLD.currency
       -- Campos de revisión contable: tampoco los puede tocar el gerente
       -- (un iva_penalty_amount forjado se colaría en la liquidación).
       OR NEW.reviewed_at              IS DISTINCT FROM OLD.reviewed_at
       OR NEW.reviewed_by_staff_id     IS DISTINCT FROM OLD.reviewed_by_staff_id
       OR NEW.has_invoice_observation  IS DISTINCT FROM OLD.has_invoice_observation
       OR NEW.invoice_observation_notes IS DISTINCT FROM OLD.invoice_observation_notes
       OR NEW.iva_penalty_amount       IS DISTINCT FROM OLD.iva_penalty_amount THEN
      RAISE EXCEPTION 'El gerente no puede modificar los datos ni la revisión del gasto, solo aprobar/observar/rechazar';
    END IF;
  END IF;

  -- ── Validación de transiciones de estado ──
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Reenvío del solicitante hacia el gerente
  IF NEW.status = 'pendiente_aprobacion'
     AND OLD.status IN ('borrador', 'observado', 'rechazado') THEN
    RETURN NEW;
  END IF;

  -- Reenvío del solicitante DIRECTO al asistente (solo si fue devuelto por él)
  IF NEW.status = 'aprobado_gerente'
     AND OLD.status = 'observado'
     AND OLD.returned_by_assistant THEN
    RETURN NEW;
  END IF;

  -- Decisión del gerente sobre un gasto pendiente
  IF OLD.status = 'pendiente_aprobacion'
     AND NEW.status IN ('aprobado_gerente', 'observado', 'rechazado') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transición de estado no permitida para el gasto: % -> %', OLD.status, NEW.status;
END;
$$;

-- Antes era BEFORE UPDATE OF status; ahora cualquier UPDATE para que las guardas
-- de columna corran aunque no cambie el status.
DROP TRIGGER IF EXISTS tr_fre_validate_transition ON public.fund_request_expenses;
CREATE TRIGGER tr_fre_validate_transition
  BEFORE UPDATE ON public.fund_request_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fre_validate_transition();

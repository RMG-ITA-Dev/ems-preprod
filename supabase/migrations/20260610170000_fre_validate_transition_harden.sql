-- Fund Request Expenses — endurecer el trigger de transición (column-level)
-- =========================================================================
-- RLS es a nivel de FILA, no de columna, así que las políticas de UPDATE no
-- bastan para impedir que un usuario toque columnas que no le corresponden.
-- Se refuerza `fre_validate_transition` con tres guardas (todas para no-admin):
--
--  (P1a) El solicitante NO puede ENCENDER `returned_by_assistant` (false->true).
--        Forjar ese flag y luego pasar a 'aprobado_gerente' brincaría la
--        re-aprobación del gerente (el flag solo lo prende el asistente=admin).
--        Apagarlo en el reenvío (true->false) sigue permitido.
--
--  (Revisión) NINGÚN no-admin (ni gerente ni solicitante) puede cambiar los
--        campos de revisión contable (reviewed_at, reviewed_by_staff_id,
--        has_invoice_observation, invoice_observation_notes, iva_penalty_amount);
--        un iva_penalty_amount forjado se colaría en el total de la liquidación.
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

  -- Campos de revisión contable: SOLO el admin (asistente) los toca. Ningún
  -- no-admin —ni gerente ni solicitante— puede cambiarlos (un iva_penalty_amount
  -- forjado se colaría en el total de la liquidación).
  IF NEW.reviewed_at               IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by_staff_id      IS DISTINCT FROM OLD.reviewed_by_staff_id
     OR NEW.has_invoice_observation   IS DISTINCT FROM OLD.has_invoice_observation
     OR NEW.invoice_observation_notes IS DISTINCT FROM OLD.invoice_observation_notes
     OR NEW.iva_penalty_amount        IS DISTINCT FROM OLD.iva_penalty_amount THEN
    RAISE EXCEPTION 'Solo contabilidad puede modificar los campos de revisión del gasto';
  END IF;

  -- El gasto NO se puede mover a otra solicitud por UPDATE (ni el solicitante ni
  -- el gerente): cambiaría conteos/liquidación de ambas. El solicitante sí puede
  -- reasignar el `wo_id` dentro de la MISMA solicitud (se valida aparte).
  IF NEW.fund_request_id IS DISTINCT FROM OLD.fund_request_id THEN
    RAISE EXCEPTION 'No se puede mover el gasto a otra solicitud de fondos';
  END IF;

  -- ¿El que actúa es el solicitante (dueño) de la solicitud?
  SELECT (fr.requester_staff_id = v_me) INTO v_is_requester
  FROM public.fund_requests fr
  WHERE fr.fund_request_id = NEW.fund_request_id;

  -- (P1b) Si NO es el solicitante (=> gerente), solo puede tocar columnas de
  -- decisión; los DATOS del gasto quedan inmutables para él.
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
       OR NEW.currency         IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'El gerente no puede modificar los datos del gasto, solo aprobar/observar/rechazar';
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

  -- Reenvío del solicitante DIRECTO al asistente (solo si fue devuelto por él).
  -- Esta vía SE SALTA la re-aprobación del gerente, así que solo se permite
  -- re-adjuntar el respaldo: cualquier cambio a los datos del gasto exige pasar
  -- de nuevo por el gerente (reenvío normal a 'pendiente_aprobacion').
  IF NEW.status = 'aprobado_gerente'
     AND OLD.status = 'observado'
     AND OLD.returned_by_assistant THEN
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
       OR NEW.currency         IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'Al reenviar a contabilidad solo se puede actualizar el respaldo (adjunto); para cambiar datos reenvíe al gerente';
    END IF;
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

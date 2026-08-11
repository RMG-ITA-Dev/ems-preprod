-- =====================================================================
-- Fondos — declarar las transiciones de estado de Contabilidad
--
-- Síntoma (2026-07-31, tras aplicar 20260731010000): al revisar un gasto, el
-- Gerente de Contabilidad recibe
--   'Transición de estado no permitida para el gasto: aprobado_gerente -> revisado_asistente'
--
-- Es progreso respecto del reporte anterior: el UPDATE ya no muere en RLS —
-- ahora LLEGA al trigger. Lo que falta es que el trigger conozca las transiciones.
--
-- Causa: `fre_validate_transition` valida contra una lista blanca de transiciones,
-- y las dos de Contabilidad nunca estuvieron en ella. No hacía falta: el asistente
-- contable se modelaba como admin, y el `IF is_admin() THEN RETURN NEW` del inicio
-- se saltaba TODA la validación. Al pasar a roles reales del catálogo, esas dos
-- transiciones quedaron sin declarar. Lo mismo con el guard (P1a) del flag
-- `returned_by_assistant`, que bloqueaba a cualquier no-admin.
--
-- Las dos transiciones, tomadas de las mutaciones que las ejecutan:
--   aprobado_gerente -> revisado_asistente   factura correcta
--                                            (useReviewFundRequestExpense)
--   aprobado_gerente -> observado            devuelta por falta de respaldo, con
--                                            returned_by_assistant = true
--                                            (useReturnFundRequestExpense)
--
-- Ambas se habilitan solo con `expense_settlement.update` (admin,
-- accounting_manager, accounting_analyst), que es el permiso de la fase de
-- revisión — dentro del alcance del Analista, así que los dos roles de
-- Contabilidad pueden revisar y devolver. Las acciones de 'en_liquidacion' y
-- 'cerrado' siguen siendo del Gerente por `fund_disbursement.*`, sin cambios.
--
-- Nada más de la función se modifica: el resto de guards (inmutabilidad de datos
-- para el gerente, gasto devuelto solo re-adjunta respaldo, metadata de
-- aprobación, no mover el gasto de solicitud) queda igual.
--
-- Idempotente (create or replace). El trigger que la invoca no se toca.
-- =====================================================================

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

  -- (P1a) Solo Contabilidad puede ENCENDER el flag de devolución.
  -- 2026-07-31: antes bastaba con "no-admin" para bloquear, porque el asistente
  -- contable se modelaba como admin y salía por el RETURN de arriba. Con los roles
  -- reales, devolver un gasto por falta de respaldo lanzaba esta excepción.
  IF NEW.returned_by_assistant AND NOT OLD.returned_by_assistant
     AND NOT public.has_permission('expense_settlement.update') THEN
    RAISE EXCEPTION 'No autorizado a marcar el gasto como devuelto por contabilidad';
  END IF;

  -- Campos de revisión contable: SOLO Contabilidad los toca. Ni gerente ni
  -- solicitante pueden cambiarlos (un iva_penalty_amount forjado se colaría en el
  -- total de la liquidación).
  --
  -- 2026-07-31: antes exigía is_admin(), que se escribió cuando "asistente
  -- contable" se modelaba como admin. Con los roles reales del catálogo, el
  -- Gerente y el Analista de Contabilidad quedaban bloqueados: revisar una factura
  -- lanzaba esta excepción. Ahora se gatea por el permiso de la matriz
  -- (expense_settlement.update = admin, accounting_manager, accounting_analyst).
  IF NOT public.has_permission('expense_settlement.update')
     AND (NEW.reviewed_at          IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by_staff_id      IS DISTINCT FROM OLD.reviewed_by_staff_id
     OR NEW.has_invoice_observation   IS DISTINCT FROM OLD.has_invoice_observation
     OR NEW.invoice_observation_notes IS DISTINCT FROM OLD.invoice_observation_notes
     OR NEW.iva_penalty_amount        IS DISTINCT FROM OLD.iva_penalty_amount) THEN
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

  -- En un gasto devuelto por contabilidad (returned_by_assistant) el solicitante
  -- SOLO puede re-adjuntar el respaldo; cambiar datos exige reenviar al gerente.
  -- Aplica AUNQUE no cambie el status: si no, editaría datos con status observado
  -- y luego reenviaría a aprobado_gerente sin que el guard del reenvío (que
  -- compara contra la fila ya mutada) detecte la diferencia.
  IF OLD.returned_by_assistant AND OLD.status = 'observado' THEN
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
      RAISE EXCEPTION 'En un gasto devuelto por contabilidad solo se puede actualizar el respaldo (adjunto); para cambiar datos reenvíe al gerente';
    END IF;
  END IF;

  -- ── Validación de transiciones de estado ──
  -- En una edición SIN cambio de estado, un no-admin no puede tocar la metadata
  -- de decisión/envío: esos campos solo cambian en transiciones legítimas (la
  -- decisión del gerente o el reenvío, que SÍ cambian el status). Evita que el
  -- solicitante forje o borre el rastro de aprobación por un UPDATE directo.
  IF NEW.status = OLD.status THEN
    IF NEW.manager_notes      IS DISTINCT FROM OLD.manager_notes
       OR NEW.rejection_reason   IS DISTINCT FROM OLD.rejection_reason
       OR NEW.manager_decided_at IS DISTINCT FROM OLD.manager_decided_at
       OR NEW.submitted_at       IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'No autorizado a modificar la metadata de aprobación/envío del gasto';
    END IF;
    RETURN NEW;
  END IF;

  -- Reenvío del solicitante hacia el gerente
  IF NEW.status = 'pendiente_aprobacion'
     AND OLD.status IN ('borrador', 'observado', 'rechazado') THEN
    RETURN NEW;
  END IF;

  -- Reenvío del solicitante DIRECTO al asistente (solo si fue devuelto por él).
  -- La inmutabilidad de datos ya se validó arriba (guard de returned_by_assistant),
  -- así que aquí solo se permite la transición.
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

  -- Decisión de CONTABILIDAD sobre un gasto ya aprobado por el gerente.
  -- 2026-07-31: estas dos transiciones nunca estuvieron en la lista porque solo
  -- las hacía el admin, y el `IF is_admin() THEN RETURN NEW` del inicio se saltaba
  -- toda la validación. Con los roles reales del catálogo hay que declararlas:
  --   revisado_asistente -> factura correcta (useReviewFundRequestExpense)
  --   observado          -> devuelta por falta de respaldo, con returned_by_assistant
  --                         (useReturnFundRequestExpense; el flag lo autoriza P1a)
  IF OLD.status = 'aprobado_gerente'
     AND NEW.status IN ('revisado_asistente', 'observado')
     AND public.has_permission('expense_settlement.update') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transición de estado no permitida para el gasto: % -> %', OLD.status, NEW.status;
END;
$$;
-- =====================================================================
-- VALIDACIÓN (impersonando)
--
--   -- 1) Contabilidad revisa una factura correcta
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID_CONTABILIDAD>"}', true);
--     update public.fund_request_expenses
--        set status = 'revisado_asistente', reviewed_at = now(),
--            reviewed_by_staff_id = public.get_my_staff_id(),
--            has_invoice_observation = false, iva_penalty_amount = 0
--      where fre_id = '<GASTO_APROBADO_GERENTE>'
--     returning fre_id;                              -- 1 fila (antes: excepción)
--   rollback;
--
--   -- 2) Contabilidad devuelve por falta de respaldo
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID_CONTABILIDAD>"}', true);
--     update public.fund_request_expenses
--        set status = 'observado', returned_by_assistant = true,
--            invoice_observation_notes = 'falta factura'
--      where fre_id = '<GASTO_APROBADO_GERENTE>'
--     returning fre_id;                              -- 1 fila
--   rollback;
--
--   -- 3) NEGATIVO: quien no es Contabilidad no puede hacer esas transiciones ni
--   --    encender el flag. Con un gerente de OT:
--   --    update ... set status = 'revisado_asistente' where fre_id = '<...>';
--   --    -> 'Transición de estado no permitida para el gasto: ...'
--   --    update ... set returned_by_assistant = true where fre_id = '<...>';
--   --    -> 'No autorizado a marcar el gasto como devuelto por contabilidad'
--
--   -- En la app: revisar la factura mueve el gasto a "Revisado" y baja el contador
--   -- "por revisar" a 0. Devolverla lo manda a "Observado" con el aviso al
--   -- solicitante de que falta el respaldo.
-- =====================================================================

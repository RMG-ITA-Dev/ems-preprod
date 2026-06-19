-- Fund Request OTs — proteger las columnas de decisión del gerente
-- ===============================================================
-- La política `fr_wo_update` deja al solicitante actualizar sus OTs mientras la
-- solicitud es editable (borrador/observado/rechazado), pero RLS es a nivel de
-- FILA, no de columna: un solicitante podía llamar la API directamente y poner
-- `approval_status = 'aprobado'` en sus OTs. Con la solicitud en observado/
-- rechazado, el trigger de rollup la promovía a `aprobado_gerente` SIN que
-- ningún gerente interviniera (bypass de aprobación).
--
-- Este trigger BEFORE UPDATE bloquea cambios a las columnas de decisión
-- (approval_status, manager_notes, rejection_reason, manager_decided_at) salvo:
--   - admin, o
--   - el gerente real de la OT (OLD.manager_staff_id = get_my_staff_id())
--     -> preserva la auto-aprobación legítima cuando el solicitante ES el gerente, o
--   - el reset del reenvío: approval_status='pendiente' con las 3 columnas en NULL
--     (exactamente lo que hace la mutación "Enviar").
-- Idempotente.

CREATE OR REPLACE FUNCTION public.fr_wo_guard_approval_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := get_my_staff_id();
  v_decision_changed BOOLEAN;
  v_alloc_changed BOOLEAN;
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- ¿Cambian las columnas de asignación / identidad de la OT?
  v_alloc_changed :=
       NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount
    OR NEW.wo_id            IS DISTINCT FROM OLD.wo_id
    OR NEW.fund_request_id  IS DISTINCT FROM OLD.fund_request_id
    OR NEW.manager_staff_id IS DISTINCT FROM OLD.manager_staff_id;

  -- NINGÚN no-admin puede cambiar la asignación/identidad por UPDATE: las
  -- allocations se editan vía RPC (delete+insert) y manager_staff_id lo fija el
  -- setter. Esto cierra que el solicitante se ponga como gerente de su OT
  -- (manager_staff_id) para luego auto-aprobarse.
  IF v_alloc_changed THEN
    RAISE EXCEPTION 'No se puede modificar la asignación de la OT (monto/OT/gerente) por esta vía';
  END IF;

  -- El gerente real de la OT puede registrar su DECISIÓN libremente.
  IF OLD.manager_staff_id IS NOT DISTINCT FROM v_me THEN
    RETURN NEW;
  END IF;

  v_decision_changed :=
       NEW.approval_status   IS DISTINCT FROM OLD.approval_status
    OR NEW.manager_notes     IS DISTINCT FROM OLD.manager_notes
    OR NEW.rejection_reason  IS DISTINCT FROM OLD.rejection_reason
    OR NEW.manager_decided_at IS DISTINCT FROM OLD.manager_decided_at;

  IF v_decision_changed THEN
    -- Único cambio permitido a un no-gerente: el reset del reenvío.
    IF NOT (
      NEW.approval_status = 'pendiente'
      AND NEW.manager_notes IS NULL
      AND NEW.rejection_reason IS NULL
      AND NEW.manager_decided_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Solo el gerente de la OT puede registrar la decisión de aprobación';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fr_wo_guard_approval ON public.fund_request_work_orders;
CREATE TRIGGER tr_fr_wo_guard_approval
  BEFORE UPDATE ON public.fund_request_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.fr_wo_guard_approval_cols();

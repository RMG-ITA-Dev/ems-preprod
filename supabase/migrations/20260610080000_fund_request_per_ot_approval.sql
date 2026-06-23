-- Fund Requests — Aprobación POR OT (multi-gerente)
-- ==================================================
-- Cambia el modelo de aprobación: en vez de UN gerente por solicitud,
-- cada OT la aprueba el gerente de su engagement. La solicitud avanza
-- cuando TODAS sus OTs están aprobadas; si alguna se observa o rechaza,
-- toda la solicitud vuelve al solicitante.
--
-- Decisiones de negocio (confirmadas):
--   - OT sin gerente en su engagement  -> se bloquea (trigger RAISE).
--   - El solicitante puede ser el gerente de su OT -> auto-aprobación permitida.
--   - Una OT rechazada/observada -> toda la solicitud regresa al solicitante.
--
-- Idempotente.

-- =====================================================
-- ENUM: estado de aprobación por OT
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fr_wo_approval_status') THEN
    CREATE TYPE public.fr_wo_approval_status AS ENUM (
      'pendiente', 'aprobado', 'observado', 'rechazado'
    );
  END IF;
END $$;

-- =====================================================
-- Columnas de aprobación en la tabla de OTs
-- =====================================================
ALTER TABLE public.fund_request_work_orders
  ADD COLUMN IF NOT EXISTS manager_staff_id UUID REFERENCES public.staff(staff_id),
  ADD COLUMN IF NOT EXISTS approval_status public.fr_wo_approval_status NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS manager_notes TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS manager_decided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fr_wo_manager ON public.fund_request_work_orders(manager_staff_id);

-- El gerente único de la solicitud deja de ser obligatorio (modelo per-OT).
ALTER TABLE public.fund_requests ALTER COLUMN approver_manager_staff_id DROP NOT NULL;

-- =====================================================
-- Backfill de datos existentes
-- =====================================================
-- Gerente desde el engagement de la OT
UPDATE public.fund_request_work_orders frwo
SET manager_staff_id = e.manager_id
FROM public.work_orders wo
JOIN public.engagements e ON e.engagement_id = wo.engagement_id
WHERE wo.wo_id = frwo.wo_id
  AND frwo.manager_staff_id IS NULL;

-- Estado de aprobación de cada OT según el estado actual de su solicitud
UPDATE public.fund_request_work_orders frwo
SET approval_status = CASE
  WHEN fr.status IN ('aprobado_gerente','fondos_entregados','en_liquidacion','cerrado')
    THEN 'aprobado'::public.fr_wo_approval_status
  WHEN fr.status = 'observado' THEN 'observado'::public.fr_wo_approval_status
  WHEN fr.status = 'rechazado' THEN 'rechazado'::public.fr_wo_approval_status
  ELSE 'pendiente'::public.fr_wo_approval_status
END
FROM public.fund_requests fr
WHERE fr.fund_request_id = frwo.fund_request_id;

-- =====================================================
-- TRIGGER: asignar gerente desde el engagement (y bloquear si no hay)
-- =====================================================
CREATE OR REPLACE FUNCTION public.fr_wo_set_manager()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_mgr uuid;
BEGIN
  SELECT e.manager_id INTO v_mgr
  FROM public.work_orders wo
  JOIN public.engagements e ON e.engagement_id = wo.engagement_id
  WHERE wo.wo_id = NEW.wo_id;

  IF v_mgr IS NULL THEN
    RAISE EXCEPTION 'La OT % no tiene gerente asignado en su engagement; no puede usarse en una solicitud de fondos', NEW.wo_id;
  END IF;

  NEW.manager_staff_id := v_mgr;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fr_wo_set_manager ON public.fund_request_work_orders;
CREATE TRIGGER tr_fr_wo_set_manager
  BEFORE INSERT OR UPDATE OF wo_id ON public.fund_request_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.fr_wo_set_manager();

-- =====================================================
-- TRIGGER: recalcular el estado de la solicitud (rollup) desde sus OTs
-- =====================================================
-- SECURITY DEFINER para poder actualizar fund_requests sin depender de RLS.
CREATE OR REPLACE FUNCTION public.fr_wo_rollup_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_fr_id uuid;
  v_total int; v_aprobado int; v_observado int; v_rechazado int;
  v_new public.fund_request_status;
  v_current public.fund_request_status;
BEGIN
  v_fr_id := COALESCE(NEW.fund_request_id, OLD.fund_request_id);

  SELECT status INTO v_current FROM public.fund_requests WHERE fund_request_id = v_fr_id;

  -- Solo recalcular durante la fase de aprobación del gerente.
  IF v_current IS NULL OR v_current NOT IN
     ('pendiente_aprobacion','observado','rechazado','aprobado_gerente') THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE approval_status = 'aprobado'),
    count(*) FILTER (WHERE approval_status = 'observado'),
    count(*) FILTER (WHERE approval_status = 'rechazado')
  INTO v_total, v_aprobado, v_observado, v_rechazado
  FROM public.fund_request_work_orders
  WHERE fund_request_id = v_fr_id;

  IF v_rechazado > 0 THEN
    v_new := 'rechazado';
  ELSIF v_observado > 0 THEN
    v_new := 'observado';
  ELSIF v_total > 0 AND v_aprobado = v_total THEN
    v_new := 'aprobado_gerente';
  ELSE
    v_new := 'pendiente_aprobacion';
  END IF;

  IF v_new <> v_current THEN
    UPDATE public.fund_requests
    SET status = v_new,
        manager_decided_at = CASE WHEN v_new = 'aprobado_gerente' THEN now() ELSE manager_decided_at END
    WHERE fund_request_id = v_fr_id;
  END IF;

  RETURN NULL;
END;
$$;

-- Solo dispara cuando cambia approval_status (decisión del gerente o reset en
-- el reenvío). NO dispara en INSERT/DELETE para que editar las allocations de
-- una solicitud observada/rechazada no la reenvíe sola: el cambio de estado a
-- 'pendiente_aprobacion' lo hace explícitamente la mutación de "Enviar".
DROP TRIGGER IF EXISTS tr_fr_wo_rollup ON public.fund_request_work_orders;
CREATE TRIGGER tr_fr_wo_rollup
  AFTER UPDATE OF approval_status ON public.fund_request_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.fr_wo_rollup_status();

-- =====================================================
-- Helpers SECURITY DEFINER (evitan recursión entre políticas RLS)
-- =====================================================
CREATE OR REPLACE FUNCTION public.fr_is_ot_manager(p_fr_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders frwo
    WHERE frwo.fund_request_id = p_fr_id
      AND frwo.manager_staff_id = get_my_staff_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.fr_is_requester(p_fr_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_requests fr
    WHERE fr.fund_request_id = p_fr_id
      AND fr.requester_staff_id = get_my_staff_id()
  );
$$;

-- =====================================================
-- RLS — fund_requests
-- =====================================================
-- El gerente ve una solicitud si gestiona al menos una de sus OTs.
DROP POLICY IF EXISTS "fr_select_manager" ON public.fund_requests;
CREATE POLICY "fr_select_manager" ON public.fund_requests
  FOR SELECT TO authenticated
  USING (public.fr_is_ot_manager(fund_request_id));

-- El gerente ya NO actualiza la solicitud directamente: lo hace el trigger de rollup.
DROP POLICY IF EXISTS "fr_update_manager" ON public.fund_requests;

-- El solicitante puede editar en borrador, observado o rechazado (rechazado
-- vuelve a ser editable, como en el diagrama del PDF). El estado resultante NO
-- puede ser 'pendiente_aprobacion': enviar a aprobación solo se hace vía el RPC
-- `fund_request_submit` (SECURITY DEFINER), que además resetea las OTs y fija
-- submitted_at. Así un UPDATE directo no puede brincarse ese flujo.
DROP POLICY IF EXISTS "fr_update_requester_draft" ON public.fund_requests;
CREATE POLICY "fr_update_requester_draft" ON public.fund_requests
  FOR UPDATE TO authenticated
  USING (
    requester_staff_id = get_my_staff_id()
    AND status IN ('borrador', 'observado', 'rechazado')
  )
  WITH CHECK (
    requester_staff_id = get_my_staff_id()
    AND status IN ('borrador', 'observado', 'rechazado')
  );

-- =====================================================
-- RLS — fund_request_work_orders
-- =====================================================
-- SELECT: solicitante, gerente de la OT, o admin
DROP POLICY IF EXISTS "fr_wo_select" ON public.fund_request_work_orders;
CREATE POLICY "fr_wo_select" ON public.fund_request_work_orders
  FOR SELECT TO authenticated
  USING (
    manager_staff_id = get_my_staff_id()
    OR public.fr_is_requester(fund_request_id)
    OR is_admin()
  );

-- El solicitante administra sus OTs mientras la solicitud sea editable.
DROP POLICY IF EXISTS "fr_wo_insert" ON public.fund_request_work_orders;
CREATE POLICY "fr_wo_insert" ON public.fund_request_work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_work_orders.fund_request_id
        AND fr.status IN ('borrador', 'observado', 'rechazado')
        AND (fr.requester_staff_id = get_my_staff_id() OR is_admin())
    )
  );

DROP POLICY IF EXISTS "fr_wo_delete" ON public.fund_request_work_orders;
CREATE POLICY "fr_wo_delete" ON public.fund_request_work_orders
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_work_orders.fund_request_id
        AND fr.status IN ('borrador', 'observado', 'rechazado')
        AND (fr.requester_staff_id = get_my_staff_id() OR is_admin())
    )
  );

-- UPDATE: dos rutas —
--  (a) solicitante editando allocations cuando la solicitud es editable
--  (b) gerente de la OT decidiendo (aprobar/observar/rechazar) cuando está pendiente
DROP POLICY IF EXISTS "fr_wo_update" ON public.fund_request_work_orders;
CREATE POLICY "fr_wo_update" ON public.fund_request_work_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_work_orders.fund_request_id
        AND fr.status IN ('borrador', 'observado', 'rechazado')
        AND (fr.requester_staff_id = get_my_staff_id() OR is_admin())
    )
  );

DROP POLICY IF EXISTS "fr_wo_manager_decide" ON public.fund_request_work_orders;
CREATE POLICY "fr_wo_manager_decide" ON public.fund_request_work_orders
  FOR UPDATE TO authenticated
  USING (
    manager_staff_id = get_my_staff_id()
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_work_orders.fund_request_id
        AND fr.status = 'pendiente_aprobacion'
    )
  )
  WITH CHECK (manager_staff_id = get_my_staff_id());

-- =====================================================
-- GUARD: proteger columnas contables/de liquidación del UPDATE directo del
-- solicitante. La RLS `fr_update_requester_draft` es row-level y no impide
-- que el solicitante modifique cualquier columna mientras el status sea
-- editable. Este trigger bloquea cambios en campos contables si el usuario
-- no es admin.
-- =====================================================
CREATE OR REPLACE FUNCTION public.fr_guard_accounting_cols()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.total_disbursed_amount IS DISTINCT FROM OLD.total_disbursed_amount OR
    NEW.disbursed_at IS DISTINCT FROM OLD.disbursed_at OR
    NEW.disbursed_by_staff_id IS DISTINCT FROM OLD.disbursed_by_staff_id OR
    NEW.accounting_notes IS DISTINCT FROM OLD.accounting_notes OR
    NEW.closed_at IS DISTINCT FROM OLD.closed_at OR
    NEW.settlement_total_spent IS DISTINCT FROM OLD.settlement_total_spent OR
    NEW.settlement_balance IS DISTINCT FROM OLD.settlement_balance OR
    NEW.settlement_iva_total IS DISTINCT FROM OLD.settlement_iva_total OR
    NEW.settlement_resolution IS DISTINCT FROM OLD.settlement_resolution OR
    NEW.settlement_amount IS DISTINCT FROM OLD.settlement_amount OR
    NEW.settlement_notes IS DISTINCT FROM OLD.settlement_notes OR
    NEW.settled_at IS DISTINCT FROM OLD.settled_at OR
    NEW.settled_by_staff_id IS DISTINCT FROM OLD.settled_by_staff_id
  ) THEN
    RAISE EXCEPTION 'Solo contabilidad puede modificar campos contables o de liquidacion';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fr_guard_accounting_cols ON public.fund_requests;
CREATE TRIGGER tr_fr_guard_accounting_cols
  BEFORE UPDATE ON public.fund_requests
  FOR EACH ROW EXECUTE FUNCTION public.fr_guard_accounting_cols();

-- Admin override (mantener gestión por contabilidad)
DROP POLICY IF EXISTS "fr_wo_admin" ON public.fund_request_work_orders;
CREATE POLICY "fr_wo_admin" ON public.fund_request_work_orders
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =====================================================
-- RLS — fund_request_expenses: el aprobador del gasto es el gerente de SU OT
-- =====================================================
DROP POLICY IF EXISTS "fre_select" ON public.fund_request_expenses;
CREATE POLICY "fre_select" ON public.fund_request_expenses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND (fr.requester_staff_id = get_my_staff_id() OR is_admin())
    )
    OR (
      -- El gerente NO ve borradores de gastos (aún sin enviar); solo enviados o
      -- ya decididos.
      fund_request_expenses.status <> 'borrador'
      AND EXISTS (
        SELECT 1 FROM public.fund_request_work_orders frwo
        WHERE frwo.fund_request_id = fund_request_expenses.fund_request_id
          AND frwo.wo_id = fund_request_expenses.wo_id
          AND frwo.manager_staff_id = get_my_staff_id()
      )
    )
  );

-- El gerente solo decide gastos mientras la solicitud padre sigue en fase activa
-- (fondos_entregados). Si la solicitud se cancela/liquida con gastos pendientes,
-- esos gastos quedan congelados (no se pueden aprobar/observar/rechazar).
DROP POLICY IF EXISTS "fre_update_manager" ON public.fund_request_expenses;
CREATE POLICY "fre_update_manager" ON public.fund_request_expenses
  FOR UPDATE TO authenticated
  USING (
    status = 'pendiente_aprobacion'
    AND EXISTS (
      SELECT 1 FROM public.fund_request_work_orders frwo
      JOIN public.fund_requests fr ON fr.fund_request_id = frwo.fund_request_id
      WHERE frwo.fund_request_id = fund_request_expenses.fund_request_id
        AND frwo.wo_id = fund_request_expenses.wo_id
        AND frwo.manager_staff_id = get_my_staff_id()
        AND fr.status = 'fondos_entregados'
    )
  )
  WITH CHECK (
    status IN ('aprobado_gerente', 'observado', 'rechazado')
    AND EXISTS (
      SELECT 1 FROM public.fund_request_work_orders frwo
      JOIN public.fund_requests fr ON fr.fund_request_id = frwo.fund_request_id
      WHERE frwo.fund_request_id = fund_request_expenses.fund_request_id
        AND frwo.wo_id = fund_request_expenses.wo_id
        AND frwo.manager_staff_id = get_my_staff_id()
        AND fr.status = 'fondos_entregados'
    )
  );
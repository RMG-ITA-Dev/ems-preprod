-- Fund Requests — Fase 4: Ejecución y Registro de Gastos
-- Crea la tabla fund_request_expenses (gastos individuales que el solicitante
-- registra contra una solicitud con fondos ya entregados), su enum de estado,
-- secuencia de numeración, triggers y RLS idempotente.
--
-- NO toca el módulo de Gastos existente (expense_logs / expense_types).
-- Reutiliza expense_types SOLO como tabla de lookup (FK opcional).
--
-- Flujo (del PDF Flujo_Gastos_EMS):
--   borrador -> pendiente_aprobacion -> aprobado_gerente -> revisado_asistente
--   con ramas observado / rechazado que devuelven al solicitante para corregir.
-- El asistente (admin por ahora) puede observar la factura y aplicar 13% IVA.

-- =====================================================
-- ENUM: estado del gasto individual
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fund_request_expense_status') THEN
    CREATE TYPE public.fund_request_expense_status AS ENUM (
      'borrador',
      'pendiente_aprobacion',
      'aprobado_gerente',
      'observado',
      'rechazado',
      'revisado_asistente'
    );
  END IF;
END $$;

-- =====================================================
-- TABLE: fund_request_expenses
-- =====================================================
CREATE TABLE IF NOT EXISTS public.fund_request_expenses (
  fre_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_request_id UUID NOT NULL REFERENCES public.fund_requests(fund_request_id) ON DELETE CASCADE,
  wo_id UUID NOT NULL REFERENCES public.work_orders(wo_id),
  expense_type_id UUID REFERENCES public.expense_types(expense_type_id),
  expense_date DATE NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency VARCHAR NOT NULL CHECK (currency IN ('BOB','USD')),
  description TEXT,
  document_number VARCHAR,
  supplier_name VARCHAR,
  supplier_tax_id VARCHAR,
  attachment_url TEXT,
  status public.fund_request_expense_status NOT NULL DEFAULT 'borrador',
  submitted_at TIMESTAMPTZ,
  manager_decided_at TIMESTAMPTZ,
  manager_notes TEXT,
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_staff_id UUID REFERENCES public.staff(staff_id),
  has_invoice_observation BOOLEAN NOT NULL DEFAULT false,
  invoice_observation_notes TEXT,
  iva_penalty_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fre_fund_request ON public.fund_request_expenses(fund_request_id);
CREATE INDEX IF NOT EXISTS idx_fre_wo ON public.fund_request_expenses(wo_id);
CREATE INDEX IF NOT EXISTS idx_fre_status ON public.fund_request_expenses(status);

-- =====================================================
-- TRIGGER: updated_at on UPDATE
-- =====================================================
CREATE OR REPLACE FUNCTION public.fund_request_expenses_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fre_touch ON public.fund_request_expenses;
CREATE TRIGGER tr_fre_touch
  BEFORE UPDATE ON public.fund_request_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fund_request_expenses_touch_updated_at();

-- =====================================================
-- TRIGGER: validar que la OT pertenezca a la solicitud de fondos
-- =====================================================
CREATE OR REPLACE FUNCTION public.fre_validate_wo_in_request()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders frwo
    WHERE frwo.fund_request_id = NEW.fund_request_id
      AND frwo.wo_id = NEW.wo_id
  ) THEN
    RAISE EXCEPTION 'Work order % is not associated with fund request %', NEW.wo_id, NEW.fund_request_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Dispara también con cambios de fund_request_id: si solo se moviera el gasto a
-- otra solicitud (dejando el wo_id), había que re-validar que la OT pertenezca
-- a la nueva solicitud.
DROP TRIGGER IF EXISTS tr_fre_validate_wo ON public.fund_request_expenses;
CREATE TRIGGER tr_fre_validate_wo
  BEFORE INSERT OR UPDATE OF wo_id, fund_request_id ON public.fund_request_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fre_validate_wo_in_request();

-- =====================================================
-- RLS — fund_request_expenses
-- =====================================================
-- Visibilidad y escritura delegan en la solicitud de fondos padre:
--   - solicitante de la FR (dueño)
--   - gerente aprobador de la FR
--   - admin (juega Contabilidad + Asistente por ahora)
ALTER TABLE public.fund_request_expenses ENABLE ROW LEVEL SECURITY;

-- SELECT: dueño, gerente o admin
DROP POLICY IF EXISTS "fre_select" ON public.fund_request_expenses;
CREATE POLICY "fre_select" ON public.fund_request_expenses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND (
          fr.requester_staff_id = get_my_staff_id()
          OR fr.approver_manager_staff_id = get_my_staff_id()
          OR is_admin()
        )
    )
  );

-- INSERT: solo el solicitante, solo si la FR tiene fondos entregados / en liquidación,
-- y el gasto entra en estado borrador.
DROP POLICY IF EXISTS "fre_insert_requester" ON public.fund_request_expenses;
CREATE POLICY "fre_insert_requester" ON public.fund_request_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'borrador'
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND fr.requester_staff_id = get_my_staff_id()
        AND fr.status IN ('fondos_entregados', 'en_liquidacion')
    )
  );

-- UPDATE (solicitante): editar mientras esté en borrador/observado/rechazado;
-- el estado resultante puede quedarse igual o pasar a pendiente_aprobacion (al enviar).
DROP POLICY IF EXISTS "fre_update_requester" ON public.fund_request_expenses;
CREATE POLICY "fre_update_requester" ON public.fund_request_expenses
  FOR UPDATE TO authenticated
  USING (
    status IN ('borrador', 'observado', 'rechazado')
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND fr.requester_staff_id = get_my_staff_id()
    )
  )
  WITH CHECK (
    status IN ('borrador', 'observado', 'rechazado', 'pendiente_aprobacion')
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND fr.requester_staff_id = get_my_staff_id()
    )
  );

-- UPDATE (gerente): aprobar/observar/rechazar gastos pendientes de SU solicitud.
DROP POLICY IF EXISTS "fre_update_manager" ON public.fund_request_expenses;
CREATE POLICY "fre_update_manager" ON public.fund_request_expenses
  FOR UPDATE TO authenticated
  USING (
    status = 'pendiente_aprobacion'
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND fr.approver_manager_staff_id = get_my_staff_id()
    )
  )
  WITH CHECK (
    status IN ('aprobado_gerente', 'observado', 'rechazado')
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND fr.approver_manager_staff_id = get_my_staff_id()
    )
  );

-- UPDATE (admin): override total (Contabilidad + Asistente por ahora).
DROP POLICY IF EXISTS "fre_update_admin" ON public.fund_request_expenses;
CREATE POLICY "fre_update_admin" ON public.fund_request_expenses
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: solicitante solo en borrador, o admin.
DROP POLICY IF EXISTS "fre_delete_requester" ON public.fund_request_expenses;
CREATE POLICY "fre_delete_requester" ON public.fund_request_expenses
  FOR DELETE TO authenticated
  USING (
    status = 'borrador'
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND fr.requester_staff_id = get_my_staff_id()
    )
  );

DROP POLICY IF EXISTS "fre_delete_admin" ON public.fund_request_expenses;
CREATE POLICY "fre_delete_admin" ON public.fund_request_expenses
  FOR DELETE TO authenticated
  USING (is_admin());

-- Fund Requests (Solicitudes de Fondos) — initial schema
-- Phase 1 of the fund-request module. Creates tables, enum, sequence, trigger,
-- and idempotent RLS policies. Does NOT modify expense_logs yet.

-- =====================================================
-- ENUM: estados de la solicitud de fondos
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fund_request_status') THEN
    CREATE TYPE public.fund_request_status AS ENUM (
      'borrador',
      'pendiente_aprobacion',
      'aprobado_gerente',
      'observado',
      'rechazado',
      'fondos_entregados',
      'en_liquidacion',
      'cerrado',
      'cancelado'
    );
  END IF;
END $$;

-- =====================================================
-- SEQUENCE: numeración anual (FR-2026-0001)
-- =====================================================
CREATE SEQUENCE IF NOT EXISTS public.fund_request_number_seq START WITH 1;

-- =====================================================
-- TABLE: fund_requests
-- =====================================================
CREATE TABLE IF NOT EXISTS public.fund_requests (
  fund_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number VARCHAR UNIQUE,
  requester_staff_id UUID NOT NULL REFERENCES public.staff(staff_id),
  approver_manager_staff_id UUID NOT NULL REFERENCES public.staff(staff_id),
  total_requested_amount NUMERIC NOT NULL CHECK (total_requested_amount > 0),
  currency VARCHAR NOT NULL CHECK (currency IN ('BOB','USD')),
  status public.fund_request_status NOT NULL DEFAULT 'borrador',
  purpose TEXT,
  due_back_date DATE,
  submitted_at TIMESTAMPTZ,
  manager_decided_at TIMESTAMPTZ,
  manager_notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fr_requester_status
  ON public.fund_requests(requester_staff_id, status);
CREATE INDEX IF NOT EXISTS idx_fr_manager_status
  ON public.fund_requests(approver_manager_staff_id, status);
CREATE INDEX IF NOT EXISTS idx_fr_created_at
  ON public.fund_requests(created_at DESC);

-- =====================================================
-- TABLE: fund_request_work_orders (junction con distribución por OT)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.fund_request_work_orders (
  fr_wo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_request_id UUID NOT NULL REFERENCES public.fund_requests(fund_request_id) ON DELETE CASCADE,
  wo_id UUID NOT NULL REFERENCES public.work_orders(wo_id),
  allocated_amount NUMERIC NOT NULL CHECK (allocated_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fund_request_id, wo_id)
);

CREATE INDEX IF NOT EXISTS idx_fr_wo_request ON public.fund_request_work_orders(fund_request_id);
CREATE INDEX IF NOT EXISTS idx_fr_wo_wo ON public.fund_request_work_orders(wo_id);

-- =====================================================
-- TRIGGER: generar request_number con secuencia anual
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_fund_request_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.request_number IS NULL THEN
    NEW.request_number := 'FR-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.fund_request_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fund_requests_set_number ON public.fund_requests;
CREATE TRIGGER tr_fund_requests_set_number
  BEFORE INSERT ON public.fund_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_fund_request_number();

-- =====================================================
-- TRIGGER: updated_at on UPDATE
-- =====================================================
CREATE OR REPLACE FUNCTION public.fund_requests_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fund_requests_touch ON public.fund_requests;
CREATE TRIGGER tr_fund_requests_touch
  BEFORE UPDATE ON public.fund_requests
  FOR EACH ROW EXECUTE FUNCTION public.fund_requests_touch_updated_at();

-- =====================================================
-- TRIGGER: validar que la OT esté en estado Approved al asignarla
-- =====================================================
CREATE OR REPLACE FUNCTION public.fr_wo_validate_approved()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
BEGIN
  SELECT approval_status INTO v_status FROM public.work_orders WHERE wo_id = NEW.wo_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Work order % does not exist', NEW.wo_id;
  END IF;
  IF v_status <> 'Approved' THEN
    RAISE EXCEPTION 'Work order % must be Approved to be allocated (current: %)', NEW.wo_id, v_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fr_wo_validate_approved ON public.fund_request_work_orders;
CREATE TRIGGER tr_fr_wo_validate_approved
  BEFORE INSERT OR UPDATE OF wo_id ON public.fund_request_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.fr_wo_validate_approved();

-- =====================================================
-- RLS — fund_requests
-- =====================================================
ALTER TABLE public.fund_requests ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS "fr_select_requester" ON public.fund_requests;
CREATE POLICY "fr_select_requester" ON public.fund_requests
  FOR SELECT TO authenticated
  USING (requester_staff_id = get_my_staff_id());

DROP POLICY IF EXISTS "fr_select_manager" ON public.fund_requests;
CREATE POLICY "fr_select_manager" ON public.fund_requests
  FOR SELECT TO authenticated
  USING (approver_manager_staff_id = get_my_staff_id());

DROP POLICY IF EXISTS "fr_select_admin" ON public.fund_requests;
CREATE POLICY "fr_select_admin" ON public.fund_requests
  FOR SELECT TO authenticated
  USING (is_admin());

-- INSERT: solicitante crea su propia solicitud en estado borrador
DROP POLICY IF EXISTS "fr_insert_requester" ON public.fund_requests;
CREATE POLICY "fr_insert_requester" ON public.fund_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_staff_id = get_my_staff_id()
    AND status = 'borrador'
  );

-- UPDATE: solicitante puede editar mientras esté en borrador/observado/rechazado
DROP POLICY IF EXISTS "fr_update_requester_draft" ON public.fund_requests;
CREATE POLICY "fr_update_requester_draft" ON public.fund_requests
  FOR UPDATE TO authenticated
  USING (
    requester_staff_id = get_my_staff_id()
    AND status IN ('borrador', 'observado', 'rechazado')
  )
  WITH CHECK (
    requester_staff_id = get_my_staff_id()
    AND status IN ('borrador', 'pendiente_aprobacion')
  );

-- UPDATE: admin override
DROP POLICY IF EXISTS "fr_update_admin" ON public.fund_requests;
CREATE POLICY "fr_update_admin" ON public.fund_requests
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: solo solicitante en borrador, o admin
DROP POLICY IF EXISTS "fr_delete_requester_draft" ON public.fund_requests;
CREATE POLICY "fr_delete_requester_draft" ON public.fund_requests
  FOR DELETE TO authenticated
  USING (
    requester_staff_id = get_my_staff_id()
    AND status = 'borrador'
  );

DROP POLICY IF EXISTS "fr_delete_admin" ON public.fund_requests;
CREATE POLICY "fr_delete_admin" ON public.fund_requests
  FOR DELETE TO authenticated
  USING (is_admin());

-- =====================================================
-- RLS — fund_request_work_orders
-- =====================================================
ALTER TABLE public.fund_request_work_orders ENABLE ROW LEVEL SECURITY;

-- Helper: ¿puedo ver/editar las allocations de esta FR? — delega en fund_requests
DROP POLICY IF EXISTS "fr_wo_select" ON public.fund_request_work_orders;
CREATE POLICY "fr_wo_select" ON public.fund_request_work_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_work_orders.fund_request_id
        AND (
          fr.requester_staff_id = get_my_staff_id()
          OR fr.approver_manager_staff_id = get_my_staff_id()
          OR is_admin()
        )
    )
  );

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

-- Fund Requests — Phase 2: Manager approval RLS
-- Permite al gerente designado (approver_manager_staff_id) cambiar el estado
-- de la solicitud cuando está en pendiente_aprobacion.
-- Idempotente: cada policy se elimina antes de recrearla.

DROP POLICY IF EXISTS "fr_update_manager" ON public.fund_requests;
CREATE POLICY "fr_update_manager" ON public.fund_requests
  FOR UPDATE TO authenticated
  USING (
    approver_manager_staff_id = get_my_staff_id()
    AND status = 'pendiente_aprobacion'
  )
  WITH CHECK (
    approver_manager_staff_id = get_my_staff_id()
    AND status IN ('aprobado_gerente', 'observado', 'rechazado')
  );

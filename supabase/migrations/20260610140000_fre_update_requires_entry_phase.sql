-- Fund Request Expenses — el solicitante solo edita en fase de registro
-- =====================================================================
-- `fre_update_requester` solo miraba el estado del GASTO, no el de la solicitud
-- padre. Como un gasto rechazado no bloquea la liquidación y las solicitudes
-- cerradas se siguen viendo, el solicitante podía abrir un gasto rechazado tras
-- en_liquidacion/cerrado y cambiar monto, OT, fechas o respaldo (ensucia la
-- auditoría post-liquidación).
--
-- Se agrega la condición de que la solicitud padre siga en fase de registro
-- de gastos (status = 'fondos_entregados') tanto en USING como en WITH CHECK.
-- Idempotente.

DROP POLICY IF EXISTS "fre_update_requester" ON public.fund_request_expenses;
CREATE POLICY "fre_update_requester" ON public.fund_request_expenses
  FOR UPDATE TO authenticated
  USING (
    status IN ('borrador', 'observado', 'rechazado')
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND fr.requester_staff_id = get_my_staff_id()
        AND fr.status = 'fondos_entregados'
    )
  )
  WITH CHECK (
    status IN ('borrador', 'observado', 'rechazado', 'pendiente_aprobacion', 'aprobado_gerente')
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND fr.requester_staff_id = get_my_staff_id()
        AND fr.status = 'fondos_entregados'
    )
  );

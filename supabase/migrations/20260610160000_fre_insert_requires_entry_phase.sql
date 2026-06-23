-- Fund Request Expenses — solo insertar gastos en fase de registro
-- ================================================================
-- `fre_insert_requester` permitía crear gastos en borrador cuando la solicitud
-- estaba en 'fondos_entregados' O 'en_liquidacion'. La UI oculta "Nuevo Gasto"
-- tras fondos_entregados y el fix de auditoría (20260610140000) solo apretó el
-- UPDATE; por API directa el solicitante podía insertar gastos durante la
-- liquidación (después de que Contabilidad capturó el snapshot y antes del
-- cierre), cambiando conteos/montos.
--
-- Se limita el INSERT a la fase de registro: status = 'fondos_entregados'.
-- Idempotente.

DROP POLICY IF EXISTS "fre_insert_requester" ON public.fund_request_expenses;
CREATE POLICY "fre_insert_requester" ON public.fund_request_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'borrador'
    -- El flag de devolución del asistente NO puede nacer en true: solo lo
    -- enciende el asistente (admin) al devolver un gasto. Si no, un solicitante
    -- crearía un borrador con el flag y, tras una observación del gerente, lo
    -- reenviaría directo a contabilidad saltándose la re-aprobación.
    AND returned_by_assistant = false
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND fr.requester_staff_id = get_my_staff_id()
        AND fr.status = 'fondos_entregados'
    )
  );

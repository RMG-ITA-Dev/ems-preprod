-- Fund Requests — Corrección de RLS UPDATE para estado 'observado'.
--
-- Bug original: WITH CHECK solo permitía 'borrador' y 'pendiente_aprobacion'.
-- Al guardar cambios sin cambiar el estado (ej. guardar en observado → sigue observado),
-- PostgREST rechazaba el UPDATE porque el valor nuevo 'observado' no estaba en WITH CHECK.
--
-- También se elimina 'rechazado' de los estados editables: rechazado es estado terminal
-- (distinto de observado que sí permite corrección y reenvío).
--
-- Idempotente: DROP IF EXISTS + CREATE en todas las políticas modificadas.

-- ── fund_requests UPDATE ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "fr_update_requester_draft" ON public.fund_requests;
CREATE POLICY "fr_update_requester_draft" ON public.fund_requests
  FOR UPDATE TO authenticated
  USING (
    requester_staff_id = get_my_staff_id()
    AND status IN ('borrador', 'observado')
  )
  WITH CHECK (
    requester_staff_id = get_my_staff_id()
    -- El estado resultante puede ser: sin cambio (borrador/observado) o al enviar (pendiente_aprobacion)
    AND status IN ('borrador', 'observado', 'pendiente_aprobacion')
  );

-- ── fund_request_work_orders (junction) ──────────────────────────────────
-- Elimina 'rechazado' de los estados editables en las tres políticas de escritura.

DROP POLICY IF EXISTS "fr_wo_insert" ON public.fund_request_work_orders;
CREATE POLICY "fr_wo_insert" ON public.fund_request_work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_work_orders.fund_request_id
        AND fr.status IN ('borrador', 'observado')
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
        AND fr.status IN ('borrador', 'observado')
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
        AND fr.status IN ('borrador', 'observado')
        AND (fr.requester_staff_id = get_my_staff_id() OR is_admin())
    )
  );

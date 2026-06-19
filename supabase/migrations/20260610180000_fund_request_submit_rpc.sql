-- Fund Requests — enviar a aprobación (reset OTs + estado) en una transacción
-- ===========================================================================
-- El "Enviar" se hacía en dos llamadas del cliente: (1) reset de OTs a
-- 'pendiente' y (2) update de la solicitud a 'pendiente_aprobacion' + submitted_at.
-- Pero el reset de OTs dispara `tr_fr_wo_rollup`, que (con la solicitud aún en
-- observado/rechazado) ya mueve la solicitud a 'pendiente_aprobacion'. Para la
-- 2ª llamada, la RLS `fr_update_requester_draft` ya no matchea ese estado, así
-- que NO se aplica: submitted_at queda null y rejection_reason/manager_notes
-- viejos no se limpian (reenvío inconsistente).
--
-- Se mueve todo a un RPC SECURITY DEFINER que valida dueño + estado y aplica
-- ambos updates en una transacción, sin que la RLS filtre el segundo.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.fund_request_submit(p_fund_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester UUID;
  v_status public.fund_request_status;
BEGIN
  SELECT requester_staff_id, status
  INTO v_requester, v_status
  FROM public.fund_requests
  WHERE fund_request_id = p_fund_request_id;

  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'Solicitud de fondos % no encontrada', p_fund_request_id;
  END IF;

  -- Solo el solicitante (o admin) puede enviar.
  IF NOT (is_admin() OR v_requester = get_my_staff_id()) THEN
    RAISE EXCEPTION 'No autorizado a enviar esta solicitud';
  END IF;

  -- Solo desde un estado editable (borrador / observado / rechazado).
  IF v_status NOT IN ('borrador', 'observado', 'rechazado') THEN
    RAISE EXCEPTION 'La solicitud no se puede enviar en su estado actual (%)', v_status;
  END IF;

  -- Debe tener al menos una OT; si no, nadie podría aprobarla.
  IF NOT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders
    WHERE fund_request_id = p_fund_request_id
  ) THEN
    RAISE EXCEPTION 'La solicitud no tiene OTs asignadas; no se puede enviar a aprobación';
  END IF;

  -- Reset de las OTs a 'pendiente' (en reenvío todas vuelven a requerir
  -- aprobación). Dispara el rollup, que puede mover la solicitud a
  -- 'pendiente_aprobacion'; el update siguiente fija submitted_at y limpia.
  UPDATE public.fund_request_work_orders
  SET approval_status = 'pendiente',
      manager_notes = NULL,
      rejection_reason = NULL,
      manager_decided_at = NULL
  WHERE fund_request_id = p_fund_request_id;

  UPDATE public.fund_requests
  SET status = 'pendiente_aprobacion',
      submitted_at = now(),
      rejection_reason = NULL,
      manager_notes = NULL
  WHERE fund_request_id = p_fund_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fund_request_submit(UUID) TO authenticated;

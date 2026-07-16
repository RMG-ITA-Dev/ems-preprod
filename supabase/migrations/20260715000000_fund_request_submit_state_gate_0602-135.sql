-- FEAT 0602-135 — Gate de estado del encargo al ENVIAR una solicitud de fondos
-- ===========================================================================
-- `fund_request_submit` (definido en 20260610180000) ya re-valida que todas las
-- OTs asignadas sigan en approval_status='Approved', pero NO revisa el estado
-- efectivo del encargo. El trigger de INSERT sobre fund_request_work_orders
-- (migración 20260714000000) bloquea asignaciones NUEVAS cuando el encargo no
-- admite solicitudes, pero una asignación creada mientras el encargo estaba
-- Aprobado(4)/Emergencia(5) y luego Congelado(9)/Finalizado(7)/Cancelado(6)/
-- Rechazado(8) llegaría hasta el envío sin volver a validarse.
--
-- Se re-crea la función agregando ese gate. Va en una migración NUEVA (posterior
-- a 20260610180000 y a 20260714000000, donde vive engagement_allows_hours_or_requests)
-- para que los entornos que ya aplicaron el RPC original reciban el cambio.
-- Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.fund_request_submit(p_fund_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester UUID;
  v_status public.fund_request_status;
  v_total NUMERIC;
  v_alloc NUMERIC;
BEGIN
  SELECT requester_staff_id, status, total_requested_amount
  INTO v_requester, v_status, v_total
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
  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO v_alloc
  FROM public.fund_request_work_orders
  WHERE fund_request_id = p_fund_request_id;

  IF v_alloc = 0 AND NOT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders
    WHERE fund_request_id = p_fund_request_id
  ) THEN
    RAISE EXCEPTION 'La solicitud no tiene OTs asignadas; no se puede enviar a aprobación';
  END IF;

  -- La suma de las asignaciones por OT debe cuadrar con el monto solicitado.
  -- (El form ya lo valida, pero por API directa podría enviarse descuadrada.)
  IF round(v_alloc, 2) <> round(COALESCE(v_total, 0), 2) THEN
    RAISE EXCEPTION 'La suma de las OTs (%) no coincide con el monto solicitado (%)', v_alloc, v_total;
  END IF;

  -- Todas las OTs asignadas deben estar en estado 'Approved'; si alguna fue
  -- des-aprobada o rechazada después de haber sido asignada, se rechaza el envío.
  IF EXISTS (
    SELECT 1
    FROM public.fund_request_work_orders frwo
    JOIN public.work_orders wo ON wo.wo_id = frwo.wo_id
    WHERE frwo.fund_request_id = p_fund_request_id
      AND wo.approval_status IS DISTINCT FROM 'Approved'
  ) THEN
    RAISE EXCEPTION 'Una o más OTs asignadas ya no estan en estado Approved; no se puede enviar a aprobacion';
  END IF;

  -- FEAT 0602-135: el estado efectivo del encargo debe seguir admitiendo solicitudes
  -- (4 Aprobado / 5 Emergencia) al momento de ENVIAR. El trigger de INSERT ya bloquea
  -- asignaciones nuevas, pero una asignación creada mientras el encargo estaba activo y
  -- luego Congelado(9)/Finalizado(7)/Cancelado(6)/Rechazado(8) llegaría hasta aquí.
  IF EXISTS (
    SELECT 1
    FROM public.fund_request_work_orders frwo
    JOIN public.work_orders wo ON wo.wo_id = frwo.wo_id
    WHERE frwo.fund_request_id = p_fund_request_id
      AND NOT public.engagement_allows_hours_or_requests(wo.engagement_id)
  ) THEN
    RAISE EXCEPTION 'Una o más OTs pertenecen a un encargo que ya no admite solicitudes (congelado/finalizado/cancelado)';
  END IF;

  -- Reset de las OTs a 'pendiente' (en reenvío todas vuelven a requerir
  -- aprobación). Dispara el rollup, que puede mover la solicitud a
  -- 'pendiente_aprobacion'; el update siguiente fija submitted_at y limpia.
  -- Marca transaccional para que el guard `fr_wo_guard_approval_cols` permita
  -- el reset SOLO desde este RPC (un UPDATE directo por API no lleva el flag).
  PERFORM set_config('app.fr_submitting', 'on', true);

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

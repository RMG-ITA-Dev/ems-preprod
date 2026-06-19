-- Fund Requests — reemplazo atómico de asignaciones (OTs)
-- ======================================================
-- Editar las OTs de una solicitud hacía DELETE + INSERT en dos llamadas
-- separadas desde el cliente. Si el INSERT fallaba (OT ya no aprobada, su
-- engagement sin gerente, RLS, error transitorio), la solicitud quedaba SIN
-- ninguna OT. Esta función hace ambos pasos en UNA transacción: si algo falla,
-- se revierte todo y las asignaciones viejas quedan intactas.
--
-- SECURITY INVOKER: corre con la RLS y los triggers del usuario que llama
-- (mismas reglas que hoy: fr_wo_set_manager, políticas de fund_request_work_orders).
-- Idempotente.

CREATE OR REPLACE FUNCTION public.fund_request_replace_allocations(
  p_fund_request_id UUID,
  p_allocations JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.fund_request_work_orders
  WHERE fund_request_id = p_fund_request_id;

  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
    SELECT
      p_fund_request_id,
      (a->>'wo_id')::UUID,
      (a->>'allocated_amount')::NUMERIC
    FROM jsonb_array_elements(p_allocations) AS a;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fund_request_replace_allocations(UUID, JSONB) TO authenticated;

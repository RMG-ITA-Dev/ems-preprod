-- Fund Requests — guardar edición (header + OTs) en una transacción
-- =================================================================
-- Editar una solicitud cambiaba el header (total/propósito/fecha) y las OTs en
-- DOS pasos separados desde el cliente. Si el reemplazo de OTs fallaba (una OT
-- ya no aprobada, su engagement sin gerente, RLS, error transitorio), el header
-- nuevo quedaba guardado con las OTs viejas → totales descuadrados.
--
-- Esta función hace AMBOS en UNA transacción: si algo falla, se revierte todo
-- (header y OTs) y la solicitud queda intacta.
--
-- SECURITY INVOKER: corre con la RLS y los triggers del usuario que llama
-- (fr_update_requester_draft, fr_wo_set_manager, fr_wo_guard_approval_cols, etc.).
-- Idempotente.

-- Reemplaza a la versión anterior (solo allocations).
DROP FUNCTION IF EXISTS public.fund_request_replace_allocations(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.fund_request_save_edit(
  p_fund_request_id UUID,
  p_fields JSONB,        -- campos del header a actualizar (puede ir '{}' = no tocar)
  p_allocations JSONB    -- OTs a reemplazar (NULL = no tocar)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Header: solo las columnas presentes en el jsonb (las demás se conservan).
  IF p_fields IS NOT NULL AND p_fields <> '{}'::jsonb THEN
    UPDATE public.fund_requests SET
      total_requested_amount =
        CASE WHEN p_fields ? 'total_requested_amount'
             THEN (p_fields->>'total_requested_amount')::NUMERIC
             ELSE total_requested_amount END,
      currency =
        CASE WHEN p_fields ? 'currency'
             THEN p_fields->>'currency'
             ELSE currency END,
      purpose =
        CASE WHEN p_fields ? 'purpose'
             THEN p_fields->>'purpose'
             ELSE purpose END,
      due_back_date =
        CASE WHEN p_fields ? 'due_back_date'
             THEN NULLIF(p_fields->>'due_back_date', '')::DATE
             ELSE due_back_date END
    WHERE fund_request_id = p_fund_request_id;
  END IF;

  -- OTs: reemplazo completo (delete + insert) solo si se proveen.
  IF p_allocations IS NOT NULL THEN
    DELETE FROM public.fund_request_work_orders
    WHERE fund_request_id = p_fund_request_id;

    IF jsonb_array_length(p_allocations) > 0 THEN
      INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
      SELECT
        p_fund_request_id,
        (a->>'wo_id')::UUID,
        (a->>'allocated_amount')::NUMERIC
      FROM jsonb_array_elements(p_allocations) AS a;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fund_request_save_edit(UUID, JSONB, JSONB) TO authenticated;

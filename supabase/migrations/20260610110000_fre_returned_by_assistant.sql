-- Fund Request Expenses — devolución del asistente (vuelve directo al asistente)
-- ============================================================================
-- Cuando el Asistente de Contabilidad devuelve un gasto por falta de respaldo,
-- el visto bueno del gerente sigue válido. Al adjuntar el respaldo y reenviar,
-- el gasto debe volver DIRECTO al asistente (aprobado_gerente), no al gerente.
--
-- Se usa un flag `returned_by_assistant` en vez de un nuevo estado:
--   - Devolver       -> status='observado' + returned_by_assistant=true
--   - Reenviar (flag)-> status='aprobado_gerente' + returned_by_assistant=false
--   - Reenviar normal-> status='pendiente_aprobacion'  (va al gerente)
--
-- Un trigger valida las transiciones para que un solicitante NO pueda saltar
-- al asistente (aprobado_gerente) sin que el gasto haya sido devuelto.
-- Idempotente.

ALTER TABLE public.fund_request_expenses
  ADD COLUMN IF NOT EXISTS returned_by_assistant BOOLEAN NOT NULL DEFAULT false;

-- ── RLS: el solicitante puede dejar el gasto en aprobado_gerente al reenviar ──
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
    status IN ('borrador', 'observado', 'rechazado', 'pendiente_aprobacion', 'aprobado_gerente')
    AND EXISTS (
      SELECT 1 FROM public.fund_requests fr
      WHERE fr.fund_request_id = fund_request_expenses.fund_request_id
        AND fr.requester_staff_id = get_my_staff_id()
    )
  );

-- ── Trigger: validar transiciones de estado (no-admin) ──
-- Cierra el hueco que abre el WITH CHECK de arriba: solo se puede llegar a
-- aprobado_gerente desde un gasto que el asistente devolvió (flag), o desde
-- la decisión del gerente sobre un pendiente.
CREATE OR REPLACE FUNCTION public.fre_validate_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  -- Reenvío del solicitante hacia el gerente
  IF NEW.status = 'pendiente_aprobacion'
     AND OLD.status IN ('borrador', 'observado', 'rechazado') THEN
    RETURN NEW;
  END IF;

  -- Reenvío del solicitante DIRECTO al asistente (solo si fue devuelto por él)
  IF NEW.status = 'aprobado_gerente'
     AND OLD.status = 'observado'
     AND OLD.returned_by_assistant THEN
    RETURN NEW;
  END IF;

  -- Decisión del gerente sobre un gasto pendiente
  IF OLD.status = 'pendiente_aprobacion'
     AND NEW.status IN ('aprobado_gerente', 'observado', 'rechazado') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transición de estado no permitida para el gasto: % -> %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS tr_fre_validate_transition ON public.fund_request_expenses;
CREATE TRIGGER tr_fre_validate_transition
  BEFORE UPDATE OF status ON public.fund_request_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fre_validate_transition();
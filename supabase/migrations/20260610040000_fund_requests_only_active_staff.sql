-- Fund Requests — Phase 5 (opción B): solo staff ACTIVO puede crear solicitudes.
-- Reemplaza la policy de INSERT añadiendo el check is_active = true.
-- Las otras policies (SELECT/UPDATE/DELETE) se mantienen tal cual.
-- Idempotente: DROP IF EXISTS + CREATE.

DROP POLICY IF EXISTS "fr_insert_requester" ON public.fund_requests;
CREATE POLICY "fr_insert_requester" ON public.fund_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_staff_id = get_my_staff_id()
    AND status = 'borrador'
    AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff_id = get_my_staff_id()
        AND is_active = true
    )
  );

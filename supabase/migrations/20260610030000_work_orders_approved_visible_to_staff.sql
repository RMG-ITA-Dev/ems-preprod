-- Fund Requests — Phase 4: permitir que cualquier staff vinculado vea
-- las work_orders APROBADAS, para poder asociarlas a una solicitud de fondos.
--
-- Antes de esto, solo team_members del engagement o admins veían las OTs.
-- Eso bloqueaba a los solicitantes que no son partner/manager (rol staff,
-- senior, semisenior, etc.) — que es justamente el caso de uso normal del
-- módulo de Solicitudes de Fondos.
--
-- IMPORTANTE:
-- - Solo abre SELECT, no INSERT/UPDATE/DELETE.
-- - Solo abre OTs en estado 'Approved' (las Draft/Pending/Rejected siguen
--   restringidas a team_members + admin).
-- - Requiere staff vinculado (get_my_staff_id() IS NOT NULL) para evitar
--   exponer datos a cuentas auth sin staff.

DROP POLICY IF EXISTS "Staff can view approved work orders" ON public.work_orders;
CREATE POLICY "Staff can view approved work orders" ON public.work_orders
  FOR SELECT TO authenticated
  USING (
    approval_status = 'Approved'
    AND get_my_staff_id() IS NOT NULL
  );

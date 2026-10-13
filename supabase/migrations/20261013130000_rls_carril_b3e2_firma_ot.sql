-- Carril B, etapa B3e-2 del barrido de seguridad RLS: la firma del socio en work_orders solo la fija quien puede
-- aprobar. BAR-009 (parte). Idempotente (CREATE OR REPLACE, DROP TRIGGER IF EXISTS + CREATE).
--
-- El hueco (VERIFICADO en Dev 2.0, 13/10/2026, con los triggers reales): las políticas de UPDATE de work_orders dejan
-- escribir TODAS las columnas a cualquier gerente, socio o SQR del encargo (y a admin), sin mirar work_order.submit. Un
-- gerente (rol sin work_order.submit) alcanzaba 1 fila al fijar approved_by, approved_at y approval_status = 'Approved'
-- por UPDATE directo: es decir, firmaba por el socio. El único guard de la base (wo_guard_risk_approval) cubre solo las
-- columnas de Riesgos. Las transiciones de aprobación las escribe solo el navegador (useWorkOrderMutations): ninguna
-- función de la base ni Edge Function escribe la firma.
--
-- Regla (decisión del operador, 13/10/2026): la misma que ya aplica la pantalla (canApprove en WorkOrderEdit):
--   · cambiar approved_by o approved_at (fijar la firma o limpiarla, que es la reversión) exige admin, o el permiso
--     work_order.submit y ser del equipo del encargo (is_engagement_team_member: gerente o socio);
--   · pasar a approval_status = 'Approved' exige que la firma ya exista (approved_at no nulo), salvo admin. Así Riesgos
--     sigue cerrando la OT cuando el socio ya firmó (useApproveRisk filtra por approved_at no nulo) y las OT
--     administrativas siguen cerrándose por enforce_administrative_work_order_rules (que corre DESPUÉS de este trigger,
--     por orden alfabético, y parte de una firma ya validada).
--   · sin sesión (auth.uid() nulo: migraciones, service_role, SQL Editor) se permite, como en B1; anon no llega: no tiene
--     UPDATE sobre work_orders.
-- No cambia: quién edita el resto de columnas, las pistas de Riesgos (wo_guard_risk_approval) ni el envío a aprobación.

CREATE OR REPLACE FUNCTION public.wo_guard_partner_signature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at)
     AND NOT (public.has_permission('work_order.submit'::text)
              AND public.is_engagement_team_member(NEW.engagement_id)) THEN
    RAISE EXCEPTION 'Solo quien puede aprobar la OT como socio del encargo puede fijar o retirar la firma'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.approval_status = 'Approved'
     AND OLD.approval_status IS DISTINCT FROM 'Approved'
     AND NEW.approved_at IS NULL THEN
    RAISE EXCEPTION 'Una OT no pasa a Aprobada sin la firma del socio'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.wo_guard_partner_signature() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_wo_guard_partner_signature ON public.work_orders;
CREATE TRIGGER tr_wo_guard_partner_signature
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.wo_guard_partner_signature();

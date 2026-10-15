-- Carril B, etapa B3b del barrido de seguridad RLS: RLS en los presupuestos de OT
-- (wo_budget_lines, wo_expense_budget, activity_worksheet_cells). BAR-002 y BAR-013 (parte).
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Idempotente (ENABLE RLS repetido no
-- cambia nada): se aplica primero a mano en Dev 2.0 para probar y después con `db push`.
--
-- Por qué estaba apagado: ver 20261012130000 (B3a): la migración 20260115000154 del bot de Lovable apagó el
-- RLS «for beta testing» y nunca se revirtió. Las políticas siguen escritas en cero_05.
--
-- Qué cambia al activarlas, medido en Dev 2.0 el 12/10/2026 con las 11 cuentas de prueba (ensayo con
-- ROLLBACK, después de B3p):
--   · wo_budget_lines (66) y wo_expense_budget (4): ven todo admin, partner, risk_partner, risk_supervisor
--     y, por B3p, cobranza y contabilidad (todos con work_order.read de alcance department/firm); el
--     gerente de cada encargo ve las de sus OT (24 y 2); asistente, senior y semisenior pasan de ver todo
--     a ver 0. Decisión del operador (12/10): cobranza y contabilidad SÍ deben ver los presupuestos.
--   · activity_worksheet_cells (157): ven todo admin, partner y risk_partner (worksheet.read); el gerente
--     las de su encargo (28); el resto, 0. Contabilidad, cobranza y risk_supervisor no tienen
--     worksheet.read y dejan de verlas: ningún flujo suyo las usa.
--   · ESCRITURA: pasa de «cualquier empleado» a admin o gerente/socio del encargo (`is_engagement_team_member`).
--     Los roles con worksheet.update / work_order.update son todos de tipo gerente, así que coincide con la
--     regla de que solo el gerente del encargo edita el presupuesto de su OT.
--
-- Vistas con security_invoker que leen estas tablas (sus resultados ahora dependen del usuario):
--   · vw_wo_budget_hours_by_category y _activity salen de activity_worksheet_cells: solo las ve con datos
--     quien tiene worksheet.read. Las consume PracticaTab, que solo muestran los roles con
--     dashboard.practice_financials.read; contabilidad, cobranza, risk_supervisor y asistente solo tienen
--     dashboard.personal.read.
--   · work_order_summary: el asistente, que ve 4 OT por solicitudes de fondos, deja de ver sus honorarios
--     (total_standard_fee) porque ya no lee las líneas de presupuesto: es la reducción buscada.
--
-- No cambia lo que ya funciona fuera de RLS: batch_upsert_worksheet_cells y sync_worksheet_to_wo_budget
-- (las únicas funciones que escriben estas tablas) son SECURITY DEFINER; no hay funciones INVOKER que las
-- escriban; los dos triggers (validate_expense_type_active, enforce_worksheet_cell_practice_scope) son
-- SECURITY DEFINER; las Edge Functions usan service_role; la pantalla de Aprobaciones solo la usan admin y
-- el gerente o socio del encargo (can_approve_timesheet_line), que son quienes ven esas líneas.

-- Guarda: activar RLS sin política de lectura dejaría la tabla ilegible para todos (fallo silencioso).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wo_budget_lines', 'wo_expense_budget', 'activity_worksheet_cells'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT') THEN
      RAISE EXCEPTION 'B3b: public.% no tiene política de lectura; activar RLS la dejaría ilegible para todos', t;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.wo_budget_lines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_expense_budget        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_worksheet_cells ENABLE ROW LEVEL SECURITY;

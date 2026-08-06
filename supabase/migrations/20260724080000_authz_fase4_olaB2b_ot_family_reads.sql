-- =====================================================================
-- Roles & Permisos — FASE 4, OLA B.2b: lectura firm-scope de la familia OT
-- Cierra el hueco de que roles firm/department (Senior Partner, Director,
-- Socio de Riesgos, Contabilidad para plan de pagos) no veían OT/Matriz/Plan
-- porque no son "team". ADITIVO: agrega políticas de lectura firm-scope y
-- conserva las de admin/team/SQR/fondos. No restringe lo existente.
--
-- Escrituras de la familia OT: ya cubiertas por team=manager/partner (que tienen
-- los permisos de la matriz); el gating estricto por permiso de escritura queda
-- como follow-up (requiere verificar los flujos de crear OT / aprobar Matriz).
--
-- Requiere Fase 1 + B.2a. Idempotente. Mirror-del-mirror.
-- =====================================================================

-- 1) Director → firm en lecturas de la familia OT (Opción A: ve todo).
update public.authorization_role_permissions
set scope_key = 'firm'
where role_key = 'director'
  and permission_key in ('worksheet.read', 'work_order.read', 'work_order.payment_plan.approve');

-- 2) MATRIZ (activity_worksheets + cells) — firm/department ve todo (worksheet.read).
drop policy if exists "worksheets firm read" on public.activity_worksheets;
create policy "worksheets firm read" on public.activity_worksheets
  for select to authenticated
  using (public.has_permission('worksheet.read')
         AND public.permission_scope('worksheet.read') in ('firm', 'department'));

drop policy if exists "worksheet cells firm read" on public.activity_worksheet_cells;
create policy "worksheet cells firm read" on public.activity_worksheet_cells
  for select to authenticated
  using (public.has_permission('worksheet.read')
         AND public.permission_scope('worksheet.read') in ('firm', 'department'));

-- 3) ÓRDENES DE TRABAJO + presupuestos — firm ve todo (work_order.read).
drop policy if exists "work_orders firm read" on public.work_orders;
create policy "work_orders firm read" on public.work_orders
  for select to authenticated
  using (public.has_permission('work_order.read')
         AND public.permission_scope('work_order.read') in ('firm', 'department'));

drop policy if exists "budget_lines firm read" on public.wo_budget_lines;
create policy "budget_lines firm read" on public.wo_budget_lines
  for select to authenticated
  using (public.has_permission('work_order.read')
         AND public.permission_scope('work_order.read') in ('firm', 'department'));

drop policy if exists "expense_budget firm read" on public.wo_expense_budget;
create policy "expense_budget firm read" on public.wo_expense_budget
  for select to authenticated
  using (public.has_permission('work_order.read')
         AND public.permission_scope('work_order.read') in ('firm', 'department'));

-- 4) PLAN DE PAGOS (plan + cuotas) — firm/department ve todo
--    (work_order.payment_plan.approve: incl. Contabilidad/Cobranzas por department).
drop policy if exists "payment_plan firm read" on public.wo_payment_plan;
create policy "payment_plan firm read" on public.wo_payment_plan
  for select to authenticated
  using (public.has_permission('work_order.payment_plan.approve')
         AND public.permission_scope('work_order.payment_plan.approve') in ('firm', 'department'));

drop policy if exists "payment_installments firm read" on public.wo_payment_installments;
create policy "payment_installments firm read" on public.wo_payment_installments
  for select to authenticated
  using (public.has_permission('work_order.payment_plan.approve')
         AND public.permission_scope('work_order.payment_plan.approve') in ('firm', 'department'));

-- =====================================================================
-- VALIDACIÓN (impersonando):
--  - senior_partner / director: ahora ven TODAS las OT, matriz y presupuestos.
--  - risk_partner: ve toda la Matriz (worksheet.read=department); NO las OT (no tiene work_order.read).
--  - accounting_manager / collections_analyst: ven todos los planes de pago.
--  - manager/socio: siguen viendo los suyos (por las políticas team existentes).
-- =====================================================================

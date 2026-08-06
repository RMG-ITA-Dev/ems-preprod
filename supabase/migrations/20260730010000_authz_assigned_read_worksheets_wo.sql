-- =====================================================================
-- Roles & Permisos — lectura de Matriz y OT para asignados NO Socio/Gerente
--
-- Decisión del negocio (2026-07-30): SQR y Encargado de un encargo son
-- SOLO LECTURA. Deben ver el encargo, su matriz de trabajo y sus órdenes de
-- trabajo; no deben poder editar nada. Las escrituras siguen reservadas a
-- Socio/Gerente del encargo (is_engagement_team_member) — esta migración NO
-- toca ninguna política de escritura.
--
-- Hallazgo que corrige: hay dos funciones de asignación que no coinciden.
--   is_assigned_to_engagement  -> partner_id, manager_id, sqr_id, encargado_id
--   is_engagement_team_member  -> partner_id, manager_id
-- La Fase 4 migró las lecturas de clientes/encargos a la primera, pero la
-- familia OT quedó a medias: olaB2b (20260724080000) solo agregó políticas para
-- los alcances 'firm' y 'department', y el alcance 'assigned_engagements' siguió
-- resolviéndose con las políticas team legacy, de 2 campos. Resultado reportado
-- en pruebas: un usuario asignado como Encargado veía el encargo pero NO su
-- matriz ni sus OT.
--
-- Estas políticas son PERMISIVAS y aditivas: se suman por OR a las existentes
-- (firm/department de olaB2b y las team legacy). No se elimina ni redefine
-- ninguna política previa, así que nadie pierde acceso.
--
-- Idempotente. Aplicar en Lovable ("Apply pending Supabase migrations") o
-- pegando el archivo en el SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) MATRIZ DE TRABAJO
-- ---------------------------------------------------------------------
drop policy if exists "worksheets assigned read" on public.activity_worksheets;
create policy "worksheets assigned read" on public.activity_worksheets
  for select to authenticated
  using (
    public.has_permission('worksheet.read')
    and public.permission_scope('worksheet.read') = 'assigned_engagements'
    and public.is_assigned_to_engagement(engagement_id)
  );

-- Las celdas no tienen engagement_id: se resuelve por su worksheet.
drop policy if exists "worksheet cells assigned read" on public.activity_worksheet_cells;
create policy "worksheet cells assigned read" on public.activity_worksheet_cells
  for select to authenticated
  using (
    public.has_permission('worksheet.read')
    and public.permission_scope('worksheet.read') = 'assigned_engagements'
    and exists (
      select 1 from public.activity_worksheets w
      where w.id = activity_worksheet_cells.worksheet_id
        and public.is_assigned_to_engagement(w.engagement_id)
    )
  );

-- ---------------------------------------------------------------------
-- 2) ÓRDENES DE TRABAJO + presupuestos
-- ---------------------------------------------------------------------
drop policy if exists "work_orders assigned read" on public.work_orders;
create policy "work_orders assigned read" on public.work_orders
  for select to authenticated
  using (
    public.has_permission('work_order.read')
    and public.permission_scope('work_order.read') = 'assigned_engagements'
    and public.is_assigned_to_engagement(engagement_id)
  );

-- Presupuestos: cuelgan de wo_id, se resuelven por su OT.
drop policy if exists "budget_lines assigned read" on public.wo_budget_lines;
create policy "budget_lines assigned read" on public.wo_budget_lines
  for select to authenticated
  using (
    public.has_permission('work_order.read')
    and public.permission_scope('work_order.read') = 'assigned_engagements'
    and exists (
      select 1 from public.work_orders wo
      where wo.wo_id = wo_budget_lines.wo_id
        and public.is_assigned_to_engagement(wo.engagement_id)
    )
  );

drop policy if exists "expense_budget assigned read" on public.wo_expense_budget;
create policy "expense_budget assigned read" on public.wo_expense_budget
  for select to authenticated
  using (
    public.has_permission('work_order.read')
    and public.permission_scope('work_order.read') = 'assigned_engagements'
    and exists (
      select 1 from public.work_orders wo
      where wo.wo_id = wo_expense_budget.wo_id
        and public.is_assigned_to_engagement(wo.engagement_id)
    )
  );

-- NOTA — plan de pagos: NO se incluye a propósito. Se gobierna por
-- work_order.payment_plan.approve, que es un permiso de aprobación con datos de
-- cobranza, no parte de "ver la OT". Si el negocio quiere que SQR/Encargado
-- también lo vean, se agrega en una migración aparte con esa decisión explícita.

-- =====================================================================
-- VALIDACIÓN (impersonando a un usuario asignado como Encargado o SQR,
-- que NO sea partner_id ni manager_id del encargo):
--
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID>"}', true);
--     select public.get_my_staff_id();                       -- no debe ser null
--     select count(*) from public.activity_worksheets;       -- > 0 (antes: 0)
--     select count(*) from public.work_orders;               -- > 0 (antes: 0)
--     -- Escritura: debe seguir FALLANDO (solo lectura)
--     -- update public.activity_worksheets set updated_at = now() where ...;
--   commit;
--
--   -- Las 4 políticas nuevas deben existir
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' and policyname like '%assigned read%'
--   order by tablename;
-- =====================================================================

-- =====================================================================
-- Roles & Permisos — FASE 4 (Ola F): escrituras de la familia OT (modelo HÍBRIDO)
-- Plan: docs/plan-escrituras-ot.md · decisión del usuario = HÍBRIDO
--
-- Modelo (confirmado por el usuario):
--   - CREAR (INSERT): por permiso de la matriz (work_order.create / worksheet.create)
--                     + scope (firm/department = cualquiera; assigned = asignado al encargo).
--   - EDITAR (UPDATE): SIN cambios → el equipo asignado sigue editando (como hoy).
--   - ELIMINAR (DELETE): admin-only (no está en la matriz; además la app no borra OTs
--                        y useDeleteWorksheet no se usa en ninguna pantalla → sin regresión).
--
-- Implementación: se reemplaza la policy FOR ALL "Team can manage …" (que hoy daba al
-- equipo INSERT+UPDATE+DELETE) por una FOR UPDATE (conserva la edición del equipo) y se
-- añade una FOR INSERT gateada por permiso. Al quitar el FOR ALL, el equipo pierde
-- INSERT/DELETE; el INSERT vuelve por permiso y el DELETE queda solo para admin
-- (policy "Admins can manage …", que NO se toca).
--
-- NO se tocan: "Admins can manage …" (FOR ALL is_admin), las policies SELECT, ni
-- "Assigned SQR can update work orders". wo_budget_lines y activity_worksheet_cells
-- siguen por equipo (son datos del flujo de edición).
--
-- Idempotente. Requiere helpers de Ola B2a (is_assigned_to_engagement) + motor Fase 2.
-- =====================================================================

alter table public.work_orders          enable row level security;
alter table public.activity_worksheets  enable row level security;

-- ---------------------------------------------------------------------
-- WORK_ORDERS
-- ---------------------------------------------------------------------
-- Quitar el FOR ALL del equipo (daba INSERT+UPDATE+DELETE).
drop policy if exists "Team can manage engagement work orders" on public.work_orders;

-- UPDATE del equipo: se conserva tal cual (modelo híbrido).
drop policy if exists "wo_team_update" on public.work_orders;
create policy "wo_team_update" on public.work_orders
  for update to authenticated
  using (public.is_engagement_team_member(engagement_id))
  with check (public.is_engagement_team_member(engagement_id));

-- INSERT por permiso work_order.create (+ scope). admin entra por "Admins can manage".
drop policy if exists "wo_create_by_permission" on public.work_orders;
create policy "wo_create_by_permission" on public.work_orders
  for insert to authenticated
  with check (
    public.has_permission('work_order.create')
    and (
      public.permission_scope('work_order.create') is distinct from 'assigned_engagements'
      or public.is_assigned_to_engagement(engagement_id)
    )
  );

-- DELETE: sin policy de equipo → solo admin (vía "Admins can manage work orders").

-- ---------------------------------------------------------------------
-- ACTIVITY_WORKSHEETS
-- ---------------------------------------------------------------------
drop policy if exists "Team can manage worksheets" on public.activity_worksheets;

drop policy if exists "worksheet_team_update" on public.activity_worksheets;
create policy "worksheet_team_update" on public.activity_worksheets
  for update to authenticated
  using (public.is_engagement_team_member(engagement_id))
  with check (public.is_engagement_team_member(engagement_id));

drop policy if exists "worksheet_create_by_permission" on public.activity_worksheets;
create policy "worksheet_create_by_permission" on public.activity_worksheets
  for insert to authenticated
  with check (
    public.has_permission('worksheet.create')
    and (
      public.permission_scope('worksheet.create') is distinct from 'assigned_engagements'
      or public.is_assigned_to_engagement(engagement_id)
    )
  );

-- DELETE: sin policy de equipo → solo admin (vía "Admins can manage worksheets").

-- =====================================================================
-- VALIDACIÓN (SQL Editor)
-- 1) Policies resultantes (deben aparecer wo_team_update / wo_create_by_permission /
--    worksheet_team_update / worksheet_create_by_permission; y NO las FOR ALL de equipo):
--   select tablename, policyname, cmd from pg_policies
--     where schemaname='public' and tablename in ('work_orders','activity_worksheets')
--     order by tablename, cmd, policyname;
--
-- 2) Impersonando (reemplaza UUIDs):
--   select set_config('request.jwt.claims', '{"sub":"<UUID_MANAGER_ASIGNADO>"}', false);
--   -- manager asignado: has_permission true + is_assigned true → puede INSERT
--   select public.has_permission('work_order.create'),
--          public.is_assigned_to_engagement('<ENGAGEMENT_ID>');
--   -- un senior del equipo (sin work_order.create) ya NO puede INSERT, pero SÍ UPDATE.
-- =====================================================================

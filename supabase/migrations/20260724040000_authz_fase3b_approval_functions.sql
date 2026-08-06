-- =====================================================================
-- Roles & Permisos — FASE 3b: aprobación de tiempo SIN categoría
-- Reescribe las funciones y RLS de aprobación para usar PERMISO + ASIGNACIÓN,
-- eliminando display_order / can_approve_wo / can_approve_timesheets / categorías.
--
-- Requiere: Fase 1 (catálogo + role_key) y el parche de Aprobaciones
--   (20260724030000, que crea timesheet.self_approve y fija los grants).
--
-- Modelo:
--  - Auto-aprueban sus horas (self_approve): admin, senior_partner, director, socio.
--  - Aprueban a otros: admin (todo) y el Gerente/Socio ASIGNADO al encargo con
--    permiso timesheet_approval.approve (hoy = admin, manager). Sin antigüedad.
--  - El Gerente aprueba también sus propias horas vía el flujo (no auto).
--
-- IMPORTANTE: verificar que las firmas de función coincidan con el mirror antes
-- de aplicar (docs/database-schema.sql está fechado Jul-17):
--   select pg_get_functiondef(oid) from pg_proc where proname in
--   ('is_auto_approved_category','get_line_approver','get_timesheet_approvers',
--    'can_approve_timesheet','can_approve_timesheet_line','get_approvable_pairs');
-- Idempotente (CREATE OR REPLACE / DROP POLICY IF EXISTS). Mirror-del-mirror.
-- =====================================================================

-- 1) ¿El staff auto-aprueba sus propias horas? (antes: display_order <= 2)
--    Se conserva el nombre para no romper llamadores (submit_timesheet_safe, TimeSheet.tsx).
create or replace function public.is_auto_approved_category(p_staff_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from staff s
    join user_roles ur on ur.user_id = s.auth_user_id
    join authorization_role_permissions rp on rp.role_key = ur.role_key
    where s.staff_id = p_staff_id
      and rp.permission_key = 'timesheet.self_approve'
  )
$$;

-- 2) Aprobador esperado de una línea: self_approve => NULL; si no, el Gerente
--    del encargo (o el Socio si no hay gerente). (antes: ruteo por display_order)
create or replace function public.get_line_approver(p_staff_id uuid, p_engagement_id uuid)
returns uuid
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_engagement record;
begin
  if public.is_auto_approved_category(p_staff_id) then
    return null;
  end if;

  select manager_id, partner_id into v_engagement
  from engagements
  where engagement_id = p_engagement_id;

  return coalesce(v_engagement.manager_id, v_engagement.partner_id);
end;
$$;

-- 3) Aprobadores válidos de la semana: manager/partner de los encargos trabajados
--    que tengan el permiso de aprobar. (antes: display_order + can_approve_timesheets)
--    Nota: SIN excluir al propio staff (el Gerente aprueba sus horas vía el flujo).
create or replace function public.get_timesheet_approvers(p_staff_id uuid, p_week_start date)
returns table(approver_staff_id uuid)
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  if public.is_auto_approved_category(p_staff_id) then
    return;
  end if;

  return query
  select distinct app.staff_id
  from (
    select e.manager_id as staff_id
    from time_entries te
    join engagements e on te.engagement_id = e.engagement_id
    where te.staff_id = p_staff_id
      and te.date_worked >= p_week_start
      and te.date_worked < p_week_start + interval '7 days'
      and e.manager_id is not null
    union
    select e.partner_id
    from time_entries te
    join engagements e on te.engagement_id = e.engagement_id
    where te.staff_id = p_staff_id
      and te.date_worked >= p_week_start
      and te.date_worked < p_week_start + interval '7 days'
      and e.partner_id is not null
  ) app
  join staff app_s on app_s.staff_id = app.staff_id
  join user_roles ur on ur.user_id = app_s.auth_user_id
  join authorization_role_permissions rp on rp.role_key = ur.role_key
  where rp.permission_key = 'timesheet_approval.approve';
end;
$$;

-- 4) ¿Puede aprobar el periodo? admin (todo) o estar entre los aprobadores.
create or replace function public.can_approve_timesheet(p_approver_auth_id uuid, p_period_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_approver_staff uuid;
  v_period record;
begin
  select staff_id into v_approver_staff from staff where auth_user_id = p_approver_auth_id;
  if v_approver_staff is null then
    return false;
  end if;

  -- admin aprueba cualquier periodo
  if exists (select 1 from user_roles where user_id = p_approver_auth_id and role_key = 'admin') then
    return true;
  end if;

  select tp.staff_id, tp.week_start_date into v_period
  from timesheet_periods tp where tp.period_id = p_period_id;
  if v_period is null then
    return false;
  end if;

  return exists (
    select 1 from get_timesheet_approvers(v_period.staff_id, v_period.week_start_date) g
    where g.approver_staff_id = v_approver_staff
  );
end;
$$;

-- 5) ¿Puede aprobar la línea? admin, o tener permiso de aprobar Y ser el
--    manager/partner asignado del encargo. (antes: display_order + get_line_approver)
create or replace function public.can_approve_timesheet_line(
  p_approver_auth_id uuid,
  p_period_id uuid,
  p_engagement_id uuid
)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_approver_staff uuid;
begin
  select staff_id into v_approver_staff from staff where auth_user_id = p_approver_auth_id;
  if v_approver_staff is null then
    return false;
  end if;

  -- admin aprueba todo
  if exists (select 1 from user_roles where user_id = p_approver_auth_id and role_key = 'admin') then
    return true;
  end if;

  -- debe tener el permiso de aprobar
  if not exists (
    select 1 from user_roles ur
    join authorization_role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = p_approver_auth_id
      and rp.permission_key = 'timesheet_approval.approve'
  ) then
    return false;
  end if;

  -- y ser el Gerente o Socio asignado del encargo (aprueba cualquier línea, incl. la propia)
  return exists (
    select 1 from engagements e
    where e.engagement_id = p_engagement_id
      and (e.manager_id = v_approver_staff or e.partner_id = v_approver_staff)
  );
end;
$$;

-- 6) Pares (periodo, encargo) aprobables por el usuario actual. Delega en la
--    función de línea para no duplicar lógica. (antes: display_order)
create or replace function public.get_approvable_pairs(p_period_ids uuid[], p_engagement_ids uuid[])
returns table(period_id uuid, engagement_id uuid)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_count integer;
  i integer;
begin
  v_count := array_length(p_period_ids, 1);
  if v_count is null or v_count <> coalesce(array_length(p_engagement_ids, 1), 0) then
    return;
  end if;

  for i in 1..v_count loop
    if public.can_approve_timesheet_line(auth.uid(), p_period_ids[i], p_engagement_ids[i]) then
      period_id := p_period_ids[i];
      engagement_id := p_engagement_ids[i];
      return next;
    end if;
  end loop;
end;
$$;

-- 7) RLS: reemplazar las políticas basadas en categoría por permiso.
--    (Las políticas "assigned" siguen llamando a can_approve_timesheet(_line),
--     que ya son role/permiso-based tras esta migración.)

-- Lectura firm-wide de aprobaciones = permiso timesheet_approval.read con scope 'firm'
-- (hoy = admin, senior_partner). Reemplaza "Leadership ... display_order <= 2".
drop policy if exists "Leadership can view all line approvals" on public.timesheet_line_approvals;
drop policy if exists "Firm-wide read line approvals" on public.timesheet_line_approvals;
create policy "Firm-wide read line approvals" on public.timesheet_line_approvals
  for select to public
  using (exists (
    select 1 from user_roles ur
    join authorization_role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = auth.uid()
      and rp.permission_key = 'timesheet_approval.read'
      and rp.scope_key = 'firm'
  ));

-- Ver todos los periodos = mismo permiso firm. Reemplaza can_approve_wo.
drop policy if exists "Approvers can view all periods" on public.timesheet_periods;
drop policy if exists "Firm-wide read periods" on public.timesheet_periods;
create policy "Firm-wide read periods" on public.timesheet_periods
  for select to public
  using (exists (
    select 1 from user_roles ur
    join authorization_role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = auth.uid()
      and rp.permission_key = 'timesheet_approval.read'
      and rp.scope_key = 'firm'
  ));

-- Actualizar todos los periodos = solo admin (senior_partner solo ve).
-- Reemplaza can_approve_wo. La ruta "assigned" (can_approve_timesheet) se conserva.
drop policy if exists "Approvers can update all periods" on public.timesheet_periods;
drop policy if exists "Admin can update all periods" on public.timesheet_periods;
create policy "Admin can update all periods" on public.timesheet_periods
  for update to public
  using (exists (
    select 1 from user_roles where user_id = auth.uid() and role_key = 'admin'
  ));

-- =====================================================================
-- VALIDACIÓN sugerida (impersonando usuarios, ver Fase 2A):
--   select public.is_auto_approved_category('<staff_socio>');    -- true
--   select public.is_auto_approved_category('<staff_gerente>');  -- false
--   select public.can_approve_timesheet_line('<auth_gerente>', '<period>', '<engagement_suyo>'); -- true
--   select public.can_approve_timesheet_line('<auth_senior>',  '<period>', '<engagement>');      -- false
-- Búsqueda global: no debe quedar display_order / can_approve_wo / can_approve_timesheets
-- usados para AUTORIZAR (siguen válidos para orden visual/negocio).
-- =====================================================================

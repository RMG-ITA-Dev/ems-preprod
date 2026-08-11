-- =====================================================================
-- Roles & Permisos — FASE 4, OLA B.2a: read-scoping de Clientes y Encargos
-- Enforca "Solo de Clientes Asignados" (Q7 = derivado de encargos activos).
-- Opción A: "asignado" = partner_id ∨ manager_id ∨ sqr_id ∨ encargado_id;
--           Director pasa a alcance 'firm' (ve todo).
-- Requiere Fase 1 + B.1. Idempotente. Mirror-del-mirror.
-- =====================================================================

-- 1) Helpers de asignación (SECURITY DEFINER, fail-closed).
--    Regla: si el scope del permiso es 'assigned_*', se exige asignación;
--    si es 'firm'/'department'/'none', se permite (se resuelve en la política).

create or replace function public.is_assigned_to_engagement(p_engagement_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from engagements e
    where e.engagement_id = p_engagement_id
      and get_my_staff_id() in (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id)
  )
$$;

create or replace function public.is_assigned_to_client(p_client_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  -- Cliente asignado = tiene ≥1 encargo ACTIVO donde soy partner/manager/sqr/encargado.
  select exists (
    select 1 from engagements e
    where e.client_id = p_client_id
      and e.status = 'active'
      and get_my_staff_id() in (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id)
  )
$$;

revoke execute on function public.is_assigned_to_engagement(uuid) from public;
revoke execute on function public.is_assigned_to_client(uuid) from public;
grant execute on function public.is_assigned_to_engagement(uuid) to authenticated;
grant execute on function public.is_assigned_to_client(uuid) to authenticated;

-- 2) Director → alcance 'firm' en lecturas de cliente/encargo (Opción A: ve todo).
update public.authorization_role_permissions
set scope_key = 'firm'
where role_key = 'director'
  and permission_key in ('client.read', 'engagement.read');

-- 3) Lectura de CLIENTES por permiso + alcance.
drop policy if exists "Authenticated users can read clients" on public.clients;
drop policy if exists "clients read" on public.clients;
create policy "clients read" on public.clients
  for select to authenticated
  using (
    public.has_permission('client.read')
    AND (
      public.permission_scope('client.read') <> 'assigned_clients'
      OR public.is_assigned_to_client(client_id)
    )
  );

-- 4) Lectura de ENCARGOS por permiso + alcance.
drop policy if exists "Authenticated users can read engagements" on public.engagements;
drop policy if exists "engagements read" on public.engagements;
create policy "engagements read" on public.engagements
  for select to authenticated
  using (
    public.has_permission('engagement.read')
    AND (
      public.permission_scope('engagement.read') <> 'assigned_engagements'
      OR public.is_assigned_to_engagement(engagement_id)
    )
  );

-- =====================================================================
-- VALIDACIÓN (impersonando):
--  - admin / senior_partner / director: ven TODOS los clientes y encargos (scope firm).
--  - socio / gerente / sqr: ven solo clientes/encargos donde están asignados.
--  - un senior (sin engagement.read): no ve encargos por esta vía.
--  - risk_partner (department): ve todos (scope <> assigned_*).
-- select scope_key from authorization_role_permissions where role_key='director'
--   and permission_key in ('client.read','engagement.read');  -- firm, firm
-- =====================================================================

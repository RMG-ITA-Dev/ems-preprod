-- =====================================================================
-- Roles & Permisos — FASE 1 (tanda 1): estructura del catálogo de autorización
-- Plan: "plan V2 roles permisos.md" §5.1
--
-- Crea SOLO la estructura (3 tablas + RLS + grants). NO siembra datos y NO
-- toca user_roles todavía: eso es la tanda 2.
--
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS) y de cola (trailing).
-- No se aplica hasta correr en Lovable:
--   LOVABLE PROMPT: "Apply pending Supabase migrations"
-- =====================================================================

-- 1) Trigger de updated_at (dedicado, para no colisionar con otros del esquema)
create or replace function public.set_authz_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 2) authorization_roles — catálogo de los 23 roles de negocio.
--    Reemplaza gradualmente al enum app_role; role_key es el identificador técnico.
create table if not exists public.authorization_roles (
  role_key      text primary key,
  label_key     text not null,            -- clave i18n para mostrar el nombre
  description   text,
  is_active     boolean not null default true,
  is_system     boolean not null default false,  -- true para roles no eliminables (p.ej. admin)
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.authorization_roles is
  'Catálogo de roles de negocio (reemplaza el enum app_role). role_key = identificador técnico.';

drop trigger if exists trg_authz_roles_updated_at on public.authorization_roles;
create trigger trg_authz_roles_updated_at
  before update on public.authorization_roles
  for each row execute function public.set_authz_updated_at();

-- 3) authorization_permissions — catálogo de los 84 permisos atómicos (modulo.accion).
create table if not exists public.authorization_permissions (
  permission_key text primary key,        -- "<modulo>.<accion>" p.ej. client.read
  module_key     text not null,           -- p.ej. clients
  action_key     text not null,           -- p.ej. read
  label_key      text not null,           -- clave i18n
  description    text,
  is_sensitive   boolean not null default false,  -- expone datos sensibles (tarifas, económicos, etc.)
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.authorization_permissions is
  'Catálogo de permisos atómicos. permission_key = "<modulo>.<accion>" (p.ej. client.read).';
create index if not exists idx_authz_perms_module on public.authorization_permissions(module_key);

drop trigger if exists trg_authz_perms_updated_at on public.authorization_permissions;
create trigger trg_authz_perms_updated_at
  before update on public.authorization_permissions
  for each row execute function public.set_authz_updated_at();

-- 4) authorization_role_permissions — la matriz (concesiones) con alcance ABAC.
--    Una fila = una concesión "sí" de la tabla del negocio. Objetivo del seed: 737 filas.
create table if not exists public.authorization_role_permissions (
  role_key       text not null references public.authorization_roles(role_key) on delete cascade,
  permission_key text not null references public.authorization_permissions(permission_key) on delete cascade,
  scope_key      text not null default 'none',
  created_at     timestamptz not null default now(),
  primary key (role_key, permission_key),
  constraint authz_rp_scope_chk check (scope_key in
    ('firm','assigned_clients','assigned_engagements','own','department','none'))
);
comment on table public.authorization_role_permissions is
  'Matriz rol x permiso con scope_key (ABAC). Una fila = una concesión. Objetivo: 737 filas.';
comment on column public.authorization_role_permissions.scope_key is
  'Alcance del dato: firm | assigned_clients | assigned_engagements | own | department | none.';
create index if not exists idx_authz_rp_permission on public.authorization_role_permissions(permission_key);

-- 5) RLS: lectura del catálogo; escritura SOLO por migración (deny-by-default).
alter table public.authorization_roles            enable row level security;
alter table public.authorization_permissions      enable row level security;
alter table public.authorization_role_permissions enable row level security;

-- Roles y permisos: definiciones no sensibles, legibles por cualquier autenticado
-- (las usa la UI de administración y los selects de rol).
drop policy if exists authz_roles_select on public.authorization_roles;
create policy authz_roles_select on public.authorization_roles
  for select to authenticated using (true);

drop policy if exists authz_perms_select on public.authorization_permissions;
create policy authz_perms_select on public.authorization_permissions
  for select to authenticated using (true);

-- La matriz de concesiones es más sensible (revela quién puede hacer qué):
-- solo admin la lee directo. El acceso "mis permisos" del usuario irá por RPC
-- SECURITY DEFINER en Fase 2 (get_my_authorization_context), sin leer esta tabla directo.
drop policy if exists authz_rp_select_admin on public.authorization_role_permissions;
create policy authz_rp_select_admin on public.authorization_role_permissions
  for select to authenticated using (public.is_admin());

-- Sin políticas de INSERT/UPDATE/DELETE => escritura denegada salvo owner/migración.
-- (Las concesiones cambian por migración revisada, no por editor libre — ver plan §5.1.)

-- 6) Grants (RLS sigue siendo la puerta real; anon queda sin acceso).
grant select on public.authorization_roles            to authenticated;
grant select on public.authorization_permissions      to authenticated;
grant select on public.authorization_role_permissions to authenticated;

-- =====================================================================
-- VALIDACIÓN — correr manualmente TRAS la tanda 2 (seed). Con solo esta
-- migración los conteos son 0 (estructura vacía).
--
--   select count(*) from public.authorization_roles;            -- esperado 23
--   select count(*) from public.authorization_permissions;      -- esperado 84
--   select count(*) from public.authorization_role_permissions; -- esperado 737
--   select role_key, count(*) from public.authorization_role_permissions
--     group by role_key order by count(*) desc;                 -- admin=84, senior_partner=41, ...
--   select distinct scope_key from public.authorization_role_permissions;  -- solo valores del CHECK
-- =====================================================================

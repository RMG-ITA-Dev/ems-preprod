-- =====================================================================
-- Roles & Permisos — FASE 2 (tanda A): motor de autorización (backend)
-- Plan: "plan V2 roles permisos.md" §5.3
--
-- Funciones que consumen el catálogo de Fase 1. NO cambian el acceso
-- productivo todavía: el RLS que las usa se reescribe en Fase 4.
-- Requiere Fase 1 (tandas 1 y 2) aplicada.
--
-- Idempotente (create or replace). SECURITY DEFINER con search_path fijo.
-- Fail-closed: sin rol o sin concesión => false / null.
--
-- Nota de diseño: se colocan en el esquema public por consistencia con las
-- ayudantes existentes (is_admin, has_role, get_my_staff_id). El plan §5.3
-- sugería un esquema `private`; se puede mover luego sin cambiar el contrato.
-- =====================================================================

-- current_role_key(): role_key del usuario actual (o null => fail-closed)
create or replace function public.current_role_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role_key from public.user_roles where user_id = auth.uid() limit 1;
$$;

-- has_permission(key): ¿el usuario actual tiene ese permiso? (fail-closed)
create or replace function public.has_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.authorization_role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = auth.uid()
      and rp.permission_key = p_permission_key
  );
$$;

-- permission_scope(key): scope_key de ese permiso para el usuario actual (o null).
-- Lo consumirá el RLS en Fase 4 para decidir el filtro de filas.
create or replace function public.permission_scope(p_permission_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rp.scope_key
  from public.user_roles ur
  join public.authorization_role_permissions rp on rp.role_key = ur.role_key
  where ur.user_id = auth.uid()
    and rp.permission_key = p_permission_key
  limit 1;
$$;

-- get_my_authorization_context(): rol + mapa {permiso: scope} del usuario actual.
-- No acepta user_id del cliente. El frontend lo llama una vez y cachea.
create or replace function public.get_my_authorization_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role_key', (select role_key from public.user_roles where user_id = auth.uid() limit 1),
    'permissions', coalesce((
      select jsonb_object_agg(rp.permission_key, rp.scope_key)
      from public.user_roles ur
      join public.authorization_role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = auth.uid()
    ), '{}'::jsonb)
  );
$$;

-- Grants: solo authenticated ejecuta (para RLS y PostgREST). anon queda fuera.
revoke execute on function public.current_role_key()             from public;
revoke execute on function public.has_permission(text)           from public;
revoke execute on function public.permission_scope(text)         from public;
revoke execute on function public.get_my_authorization_context() from public;
grant execute on function public.current_role_key()              to authenticated;
grant execute on function public.has_permission(text)            to authenticated;
grant execute on function public.permission_scope(text)          to authenticated;
grant execute on function public.get_my_authorization_context()  to authenticated;

-- =====================================================================
-- VALIDACIÓN
-- OJO: en el SQL Editor auth.uid() suele ser null (sin sesión), así que estas
-- funciones devolverán null/false ahí. Dos formas de probar:
--
-- (a) Impersonando un usuario (reemplaza el UUID por uno real de user_roles):
--   select set_config('request.jwt.claims', '{"sub":"<UUID_DEL_USUARIO>"}', false);
--   select public.current_role_key();                 -- su role_key
--   select public.has_permission('client.read');       -- true/false según su rol
--   select public.get_my_authorization_context();      -- {role_key, permissions:{...}}
--
-- (b) Humo sin sesión (verifica el cableado al catálogo):
--   select count(*) from public.authorization_role_permissions
--     where role_key = 'admin' and permission_key = 'client.read';   -- 1
-- =====================================================================

-- =====================================================================
-- Roles & Permisos — FASE 8: la UI de administración pasa a role_key
--
-- Problema que resuelve:
--   Settings -> Roles solo ofrecía los 11 valores del enum `app_role` y su RPC
--   (`admin_set_user_role`) hacía `UPDATE user_roles SET role = ...` sin tocar
--   `role_key`. Como el motor de autorización (Fase 2) lee `role_key`, cambiar
--   el rol desde la UI actualizaba la insignia pero NO los permisos efectivos,
--   y los 16 roles especializados del catálogo eran inasignables por UI.
--
-- Qué hace:
--   1) authorization_roles.legacy_app_role — mapeo explícito y revisable de cada
--      role_key al enum legacy (lo siguen leyendo políticas RLS vía has_role()).
--   2) user_lifecycle_audit_log gana old_role_key / new_role_key.
--   3) get_all_user_roles() devuelve también role_key.
--   4) admin_set_user_role_key() — asigna cualquiera de los 23 roles del
--      catálogo escribiendo role_key y espejando el enum legacy.
--
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS) y de cola.
-- No se aplica hasta correr en Lovable:
--   LOVABLE PROMPT: "Apply pending Supabase migrations"
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Mapeo role_key -> enum legacy, como DATO revisable (no lógica oculta)
-- ---------------------------------------------------------------------
alter table public.authorization_roles
  add column if not exists legacy_app_role app_role;

comment on column public.authorization_roles.legacy_app_role is
  'Valor del enum app_role con el que se espeja este rol para las políticas RLS '
  'legacy que aún usan has_role(). Es el NIVEL jerárquico equivalente, no el rol '
  'de negocio: varios role_key comparten el mismo legacy_app_role.';

-- Los 7 roles con contraparte exacta en el enum se mapean a sí mismos.
-- `assistant` -> `staff` es la equivalencia que ya usó el backfill de Fase 1.
-- Los 15 especializados se mapean a su NIVEL jerárquico: revisar esta tabla si
-- alguna política legacy debe tratarlos distinto.
update public.authorization_roles ar
set legacy_app_role = m.legacy::app_role
from (values
  -- role_key,                legacy_app_role,  nota
  ('admin',                   'admin'),      -- exacto
  ('senior_partner',          'partner'),    -- nivel: socio
  ('partner',                 'partner'),    -- exacto
  ('risk_partner',            'partner'),    -- nivel: socio
  ('director',                'director'),   -- exacto
  ('sqr',                     'sqr'),        -- exacto
  ('manager',                 'manager'),    -- exacto
  ('it_security_manager',     'manager'),    -- nivel: gerente
  ('ita_manager',             'manager'),    -- nivel: gerente
  ('tax_manager',             'manager'),    -- nivel: gerente
  ('accounting_manager',      'manager'),    -- nivel: gerente
  ('hr_manager',              'manager'),    -- nivel: gerente
  ('risk_supervisor',         'manager'),    -- nivel: gerente (supervisa)
  ('senior',                  'senior'),     -- exacto
  ('ita_senior',              'senior'),     -- nivel: senior
  ('tax_senior',              'senior'),     -- nivel: senior
  ('accounting_analyst',      'senior'),     -- nivel: senior (analista)
  ('collections_analyst',     'senior'),     -- nivel: senior (analista)
  ('hr_analyst',              'senior'),     -- nivel: senior (analista)
  ('semisenior',              'semisenior'), -- exacto
  ('assistant',               'staff'),      -- equivalencia Fase 1
  ('ita_assistant',           'staff'),      -- nivel: asistente
  ('tax_assistant',           'staff')       -- nivel: asistente
) as m(role_key, legacy)
where ar.role_key = m.role_key;

-- Cualquier rol futuro debe declarar su mapeo antes de ser asignable por UI.
-- (No se fuerza NOT NULL para no romper la migración si el catálogo crece antes.)

-- ---------------------------------------------------------------------
-- 2) Auditoría: registrar el cambio en términos de role_key
-- ---------------------------------------------------------------------
alter table public.user_lifecycle_audit_log
  add column if not exists old_role_key text;
alter table public.user_lifecycle_audit_log
  add column if not exists new_role_key text;

comment on column public.user_lifecycle_audit_log.old_role_key is
  'role_key previo. Las columnas old_role/new_role (enum) quedan como espejo legacy.';

-- ---------------------------------------------------------------------
-- 3) get_all_user_roles(): exponer role_key a la UI de administración
--    (DROP necesario: CREATE OR REPLACE no puede cambiar la firma de retorno)
-- ---------------------------------------------------------------------
drop function if exists public.get_all_user_roles();

create function public.get_all_user_roles()
returns table (
  role_id    uuid,
  user_id    uuid,
  email      text,
  role       app_role,
  role_key   text,
  staff_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ur.id as role_id,
    ur.user_id,
    au.email::text,
    ur.role,
    ur.role_key,
    coalesce(s.first_name || ' ' || s.last_name, null) as staff_name,
    ur.created_at
  from user_roles ur
  join auth.users au on ur.user_id = au.id
  left join staff s on s.auth_user_id = au.id
  -- Admin por role_key (autoridad actual) o por el enum legacy: si el espejo
  -- quedara desalineado, el admin no debe perder acceso a esta pantalla.
  where exists (
    select 1 from user_roles caller
    where caller.user_id = auth.uid()
      and (caller.role_key = 'admin' or caller.role = 'admin')
  )
  order by ur.created_at desc;
$$;

grant execute on function public.get_all_user_roles() to authenticated;

-- ---------------------------------------------------------------------
-- 4) admin_set_user_role_key(): asignar cualquiera de los 23 roles
-- ---------------------------------------------------------------------
create or replace function public.admin_set_user_role_key(
  p_target_user_id uuid,
  p_new_role_key   text,
  p_reason         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_id      uuid := auth.uid();
  v_is_admin       boolean;
  v_old_role       app_role;
  v_old_role_key   text;
  v_new_legacy     app_role;
  v_admin_count    integer;
begin
  -- Serializa con admin_set_user_role (mismo lock) para que el guard de
  -- "último admin" no pueda ser sorteado por dos cambios concurrentes.
  perform pg_advisory_xact_lock(67890);

  -- Admin por role_key (autoridad actual) o por el enum legacy, para no
  -- quedar bloqueados si algún admin aún no tiene role_key.
  select exists (
    select 1 from user_roles
    where user_id = v_caller_id
      and (role_key = 'admin' or role = 'admin')
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('success', false, 'code', 'NOT_ADMIN',
      'message', 'Only admins can change roles');
  end if;

  if v_caller_id = p_target_user_id then
    return jsonb_build_object('success', false, 'code', 'SELF_CHANGE',
      'message', 'Cannot change own role');
  end if;

  -- El rol destino debe existir en el catálogo, estar activo y declarar su
  -- espejo legacy (si no, no sabríamos qué poner en user_roles.role).
  select legacy_app_role into v_new_legacy
  from authorization_roles
  where role_key = p_new_role_key and is_active;

  if not found then
    return jsonb_build_object('success', false, 'code', 'INVALID_ROLE',
      'message', format('Unknown or inactive role_key: %s', p_new_role_key));
  end if;

  if v_new_legacy is null then
    return jsonb_build_object('success', false, 'code', 'ROLE_NOT_MAPPED',
      'message', format('role_key %s has no legacy_app_role mapping', p_new_role_key));
  end if;

  select role, role_key into v_old_role, v_old_role_key
  from user_roles
  where user_id = p_target_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'USER_NOT_FOUND',
      'message', 'User role not found');
  end if;

  if v_old_role_key = p_new_role_key then
    return jsonb_build_object('success', true, 'code', 'ALREADY_SET',
      'message', 'Role already set',
      'old_role_key', v_old_role_key, 'new_role_key', p_new_role_key);
  end if;

  -- Guard de último admin, ahora sobre role_key (la autoridad del motor).
  if v_old_role_key = 'admin' and p_new_role_key <> 'admin' then
    select count(*) into v_admin_count from user_roles where role_key = 'admin';
    if v_admin_count <= 1 then
      return jsonb_build_object('success', false, 'code', 'LAST_ADMIN',
        'message', 'Cannot remove the last admin');
    end if;
  end if;

  update user_roles
  set role_key = p_new_role_key,
      role     = v_new_legacy
  where user_id = p_target_user_id;

  insert into user_lifecycle_audit_log
    (actor_user_id, target_user_id, action, old_role, new_role,
     old_role_key, new_role_key, reason)
  values
    (v_caller_id, p_target_user_id, 'role_key_change', v_old_role, v_new_legacy,
     v_old_role_key, p_new_role_key, p_reason);

  return jsonb_build_object('success', true, 'code', 'UPDATED',
    'message', 'Role updated',
    'old_role_key', v_old_role_key, 'new_role_key', p_new_role_key,
    'legacy_role', v_new_legacy::text);
end;
$$;

grant execute on function public.admin_set_user_role_key(uuid, text, text) to authenticated;

comment on function public.admin_set_user_role_key(uuid, text, text) is
  'Asigna un role_key del catálogo (23 roles) y espeja el enum legacy. '
  'Reemplaza a admin_set_user_role, que solo escribía el enum.';

-- =====================================================================
-- VALIDACIÓN — correr manualmente tras aplicar:
--
--   -- Los 23 roles deben tener espejo legacy (esperado: 0 filas)
--   select role_key from public.authorization_roles where legacy_app_role is null;
--
--   -- Distribución del mapeo
--   select legacy_app_role, count(*), string_agg(role_key, ', ' order by role_key)
--   from public.authorization_roles group by legacy_app_role order by 2 desc;
--
--   -- La UI ahora recibe role_key
--   select email, role, role_key from public.get_all_user_roles() limit 5;
--
--   -- Rol inexistente => INVALID_ROLE (no debe escribir nada)
--   select public.admin_set_user_role_key(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'no_existe');
-- =====================================================================

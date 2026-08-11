-- =====================================================================
-- Roles & Permisos — FASE 6 (complemento): alta de usuarios setea role_key
-- Plan V2 · Fase 6 (migración de usuarios). Paso #3/#12 (endurecer RPC).
--
-- Problema: assign_user_role_atomic (invocada por la edge function assign-user-role
-- en el alta) solo setea user_roles.role (enum viejo), NO role_key. Como el motor
-- de autorización lee role_key, un usuario NUEVO quedaba con role_key NULL =
-- fail-closed (sin permisos) hasta asignación manual.
--
-- Fix: setear también role_key con el default mapeado (admin→admin, staff→assistant),
-- coherente con el backfill de Fase 1. Sigue siendo un default SEGURO y bajo
-- (assistant); admin solo para el primer usuario (bootstrap).
--
-- Idempotente (create or replace). SECURITY DEFINER + search_path fijo (se conserva).
-- =====================================================================

create or replace function public.assign_user_role_atomic(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_count integer;
  v_assigned_role text;
  v_assigned_role_key text;
  v_existing_role text;
begin
  -- Lock para evitar carrera en el chequeo de primer-usuario.
  perform pg_advisory_xact_lock(12345);

  select role::text into v_existing_role
  from user_roles
  where user_id = p_user_id;

  if v_existing_role is not null then
    return jsonb_build_object(
      'role', v_existing_role,
      'isFirstUser', false,
      'message', 'Role already assigned'
    );
  end if;

  select count(*) into v_role_count from user_roles;

  -- Primer usuario = admin (bootstrap); el resto = staff/assistant.
  if v_role_count = 0 then
    v_assigned_role     := 'admin';
    v_assigned_role_key := 'admin';
  else
    v_assigned_role     := 'staff';
    v_assigned_role_key := 'assistant';   -- role_key equivalente (Fase 1 backfill)
  end if;

  -- Ahora setea AMBOS: role (enum legacy) y role_key (motor de autorización).
  insert into user_roles (user_id, role, role_key)
  values (p_user_id, v_assigned_role::app_role, v_assigned_role_key);

  return jsonb_build_object(
    'role', v_assigned_role,
    'role_key', v_assigned_role_key,
    'isFirstUser', v_role_count = 0
  );
end;
$$;

grant execute on function public.assign_user_role_atomic(uuid) to service_role;

-- =====================================================================
-- VALIDACIÓN
--   select pg_get_functiondef('public.assign_user_role_atomic(uuid)'::regprocedure);
--   -- (debe incluir role_key en el INSERT)
-- =====================================================================

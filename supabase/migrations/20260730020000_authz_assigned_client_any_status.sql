-- =====================================================================
-- Roles & Permisos — ver el cliente de un encargo sin importar su estado
--
-- Decisión del negocio (2026-07-30): si estoy asignado a un encargo, debo ver
-- a su cliente. Un encargo en estado 'pending' también da visibilidad del
-- cliente ("si no, cómo lo veo").
--
-- Problema que corrige: is_assigned_to_client exigía `e.status = 'active'`,
-- mientras is_assigned_to_engagement no pide ningún estado. Esa asimetría
-- producía un resultado incoherente y difícil de diagnosticar: el usuario veía
-- el ENCARGO en su listado pero el CLIENTE de ese mismo encargo no aparecía en
-- Clientes, ni en el selector de cliente al crear otro encargo.
--
-- Se elimina el filtro de estado en lugar de agregar 'pending' a una lista
-- blanca, para que las dos funciones queden simétricas: la regla pasa a ser
-- "si podés ver el encargo, podés ver su cliente", sin estados que mantener en
-- dos lugares. Esto incluye encargos 'completed' y 'cancelled' — quien estuvo
-- asignado conserva la visibilidad del cliente, que es lo razonable para
-- consultar histórico. Si el negocio quiere excluirlos, es agregar
-- `and e.status <> 'cancelled'` aquí y solo aquí.
--
-- No cambia QUIÉN está asignado (los mismos 4 campos) ni ninguna escritura.
-- Idempotente (create or replace).
-- =====================================================================

create or replace function public.is_assigned_to_client(p_client_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  -- Cliente asignado = tengo >=1 encargo (en cualquier estado) donde soy
  -- partner/manager/sqr/encargado. Simétrico con is_assigned_to_engagement.
  select exists (
    select 1 from engagements e
    where e.client_id = p_client_id
      and get_my_staff_id() in (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id)
  )
$$;

-- Se reafirman los grants: `create or replace` los conserva, pero dejarlo
-- explícito evita sorpresas si la función se recrea a mano en el SQL Editor.
revoke execute on function public.is_assigned_to_client(uuid) from public;
grant  execute on function public.is_assigned_to_client(uuid) to authenticated;

comment on function public.is_assigned_to_client(uuid) is
  'True si el usuario actual está asignado (partner/manager/sqr/encargado) a algún '
  'encargo de este cliente, sin importar el estado del encargo. Simétrica con '
  'is_assigned_to_engagement: si ves el encargo, ves su cliente.';

-- =====================================================================
-- VALIDACIÓN (impersonando a alguien asignado SOLO a encargos no activos):
--
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID>"}', true);
--     select public.get_my_staff_id();          -- no debe ser null
--     -- Antes: 0 si todos sus encargos estaban en 'pending'. Ahora: > 0.
--     select count(*) from public.clients;
--     -- Coherencia: cada encargo visible debe traer su cliente visible
--     select e.engagement_code, e.status,
--            public.is_assigned_to_client(e.client_id) as ve_al_cliente
--     from public.engagements e
--     where public.is_assigned_to_engagement(e.engagement_id);
--     -- ^ la columna ve_al_cliente debe ser true en TODAS las filas
--   commit;
-- =====================================================================

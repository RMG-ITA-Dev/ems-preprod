-- =====================================================================
-- Roles & Permisos — quien crea un cliente puede verlo después
--
-- Decisión del negocio (2026-07-30): los roles que pueden Crear Clientes deben
-- ver los clientes que crearon, para poder asignarse al crear el encargo.
--
-- Problema que corrige (callejón sin salida): "cliente asignado" se DERIVA de
-- tener un encargo con ese cliente. Un cliente recién creado no tiene ninguno,
-- así que para los roles con alcance 'assigned_clients' (partner, sqr, director,
-- manager, ita_manager, tax_manager) el cliente quedaba invisible al instante
-- de crearlo:
--   1. crea el cliente X  -> el insert pasa
--   2. X no aparece en su listado de Clientes
--   3. X tampoco aparece en el selector de cliente de EngagementForm (usa la
--      misma lectura con RLS), así que no puede crear el encargo que lo
--      convertiría en asignado
--   4. queda un cliente que su creador no puede usar
--
-- Solución: registrar quién creó cada cliente y darle lectura sobre esos.
-- No se toca el alcance 'assigned_clients' ni ninguna escritura: editar clientes
-- sigue siendo solo de admin, según la matriz.
--
-- Idempotente. Tras aplicar hay que regenerar types.ts (columna nueva).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columna de autoría
-- ---------------------------------------------------------------------
alter table public.clients
  add column if not exists created_by_staff_id uuid references public.staff(staff_id);

comment on column public.clients.created_by_staff_id is
  'Staff que creó el cliente. La puebla un trigger desde get_my_staff_id(); no la '
  'envía el cliente HTTP. Habilita que el creador vea el cliente antes de tener '
  'un encargo que lo haga "asignado". NULL en las filas previas a esta migración.';

-- Índice: lo usa la policy de abajo en cada lectura de clients.
create index if not exists idx_clients_created_by_staff
  on public.clients(created_by_staff_id)
  where created_by_staff_id is not null;

-- ---------------------------------------------------------------------
-- 2) Trigger: la autoría la fija el servidor, no el cliente HTTP
-- ---------------------------------------------------------------------
-- Si se dejara al frontend, cualquiera podría mandar el staff_id de otra persona
-- y regalarle visibilidad de un cliente. En INSERT se sobrescribe siempre con el
-- staff del usuario autenticado (queda NULL si no hay ficha: p.ej. una carga por
-- service role). En UPDATE se preserva el valor original: la autoría no se
-- reasigna, ni siquiera por admin.
create or replace function public.set_client_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_staff_id := get_my_staff_id();
  else
    new.created_by_staff_id := old.created_by_staff_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_created_by on public.clients;
create trigger trg_clients_created_by
  before insert or update on public.clients
  for each row execute function public.set_client_created_by();

-- ---------------------------------------------------------------------
-- 3) Lectura para el creador
-- ---------------------------------------------------------------------
-- Policy PERMISIVA y aditiva: se suma por OR a "clients read" (que resuelve
-- firm / assigned_clients). Nadie pierde acceso; el creador gana el suyo.
-- Se exige client.read para no dar lectura a un rol que no la tiene: hoy los 8
-- roles con client.create también tienen client.read, así que no excluye a nadie.
drop policy if exists "clients creator read" on public.clients;
create policy "clients creator read" on public.clients
  for select to authenticated
  using (
    public.has_permission('client.read')
    and created_by_staff_id is not null
    and created_by_staff_id = public.get_my_staff_id()
  );

-- =====================================================================
-- VALIDACIÓN
--
--   -- La columna y el trigger existen
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='clients'
--     and column_name='created_by_staff_id';
--   select tgname from pg_trigger where tgname='trg_clients_created_by';
--
--   -- Flujo completo, impersonando a un ita_manager / manager:
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID>"}', true);
--     select public.get_my_staff_id();                      -- no debe ser null
--     insert into public.clients (client_legal_name, unique_tax_id)
--     values ('Cliente Prueba Autoría', '99999999');        -- debe pasar
--     -- El creador lo ve aunque no tenga ningún encargo todavía:
--     select client_legal_name, created_by_staff_id
--     from public.clients where unique_tax_id = '99999999';  -- 1 fila
--   rollback;   -- rollback: no deja basura
--
--   -- La autoría no se puede falsear (el trigger la sobrescribe):
--   -- insert ... (client_legal_name, unique_tax_id, created_by_staff_id)
--   --   values ('X','1','<staff_id_de_otro>');
--   -- select created_by_staff_id from clients where unique_tax_id='1';
--   -- ^ debe traer TU staff_id, no el que mandaste
-- =====================================================================

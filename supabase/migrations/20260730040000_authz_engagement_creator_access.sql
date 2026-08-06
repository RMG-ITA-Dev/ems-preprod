-- =====================================================================
-- Roles & Permisos — quien crea un encargo puede verlo y editarlo
--
-- Decisión del negocio (2026-07-30): figurar en los campos "Especialista TI" o
-- "Especialista TAX" NO da acceso al encargo. Pero si el usuario CREÓ el encargo
-- y se asignó a sí mismo, sí debe poder verlo y editarlo.
--
-- O sea: el discriminador es la AUTORÍA del encargo, no el campo de asignación.
-- Por eso esta migración no toca is_assigned_to_engagement (sigue en sus 4
-- campos: partner, manager, sqr, encargado) y los especialistas siguen sin
-- obtener acceso por ocupar ese campo.
--
-- Caso reportado: un Gerente Especialista ITA crea un encargo, se asigna como
-- Especialista TI, y el encargo desaparece de su vista — no podía verlo ni
-- editarlo, quedando huérfano para su propio autor.
--
-- Mismo patrón que 20260730030000 para clients: columna de autoría poblada por
-- trigger del servidor + policies permisivas para el autor.
--
-- Idempotente. Tras aplicar hay que regenerar types.ts (columna nueva).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columna de autoría
-- ---------------------------------------------------------------------
alter table public.engagements
  add column if not exists created_by_staff_id uuid references public.staff(staff_id);

comment on column public.engagements.created_by_staff_id is
  'Staff que creó el encargo. La puebla un trigger desde get_my_staff_id(); no la '
  'envía el cliente HTTP. Da a su autor lectura y edición aunque no figure entre '
  'los 4 campos de asignación. NULL en las filas previas a esta migración.';

create index if not exists idx_engagements_created_by_staff
  on public.engagements(created_by_staff_id)
  where created_by_staff_id is not null;

-- ---------------------------------------------------------------------
-- 2) Trigger: la autoría la fija el servidor
-- ---------------------------------------------------------------------
-- Se resuelve en la tabla, no en el RPC, para cubrir CUALQUIER vía de inserción
-- (hoy `create_engagement_with_code`, mañana otra). auth.uid() sigue siendo el
-- del usuario que llama aunque el RPC sea SECURITY DEFINER, así que la autoría
-- queda correcta. En UPDATE se preserva: no se reasigna.
create or replace function public.set_engagement_created_by()
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

drop trigger if exists trg_engagements_created_by on public.engagements;
create trigger trg_engagements_created_by
  before insert or update on public.engagements
  for each row execute function public.set_engagement_created_by();

-- ---------------------------------------------------------------------
-- 3) Lectura y edición para el autor
-- ---------------------------------------------------------------------
-- Policies PERMISIVAS: se suman por OR a "engagements read" y
-- "engagements write update". Nadie pierde acceso.
--
-- Se sigue exigiendo el permiso de rol, así que esto no convierte a cualquiera
-- en editor: engagement.update lo tienen admin, manager, ita_manager y
-- tax_manager según la matriz. La autoría solo reemplaza al requisito de
-- asignación, no al de permiso.
drop policy if exists "engagements creator read" on public.engagements;
create policy "engagements creator read" on public.engagements
  for select to authenticated
  using (
    public.has_permission('engagement.read')
    and created_by_staff_id is not null
    and created_by_staff_id = public.get_my_staff_id()
  );

drop policy if exists "engagements creator update" on public.engagements;
create policy "engagements creator update" on public.engagements
  for update to authenticated
  using (
    public.has_permission('engagement.update')
    and created_by_staff_id is not null
    and created_by_staff_id = public.get_my_staff_id()
  )
  with check (
    public.has_permission('engagement.update')
    and created_by_staff_id is not null
    and created_by_staff_id = public.get_my_staff_id()
  );

-- NOTA — matriz de trabajo y OT del encargo: NO se incluyen. Crearlas sigue
-- exigiendo ser Socio o Gerente del encargo (is_engagement_team_member), que es
-- la decisión vigente sobre escrituras. A diferencia del caso de clientes, acá
-- no queda un callejón sin salida: el Gerente del encargo existe y puede
-- armarlas. Si el negocio quiere que el autor también las gestione, es una
-- migración aparte con esa decisión explícita.

-- =====================================================================
-- VALIDACIÓN
--
--   -- Columna y trigger
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='engagements'
--     and column_name='created_by_staff_id';
--   select tgname from pg_trigger where tgname='trg_engagements_created_by';
--
--   -- Reproducir el caso reportado, impersonando al Gerente Especialista ITA:
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID>"}', true);
--     select public.get_my_staff_id();                     -- no debe ser null
--     -- El encargo que creó y donde solo figura como Especialista TI:
--     select engagement_code, created_by_staff_id, specialist_it_id
--     from public.engagements
--     where created_by_staff_id = public.get_my_staff_id();   -- antes: 0 filas
--     -- Y debe poder editarlo:
--     update public.engagements set updated_at = now()
--     where created_by_staff_id = public.get_my_staff_id();   -- antes: 0 filas
--   rollback;
--
--   -- Las filas viejas quedan en NULL y siguen resolviéndose por asignación:
--   select count(*) from public.engagements where created_by_staff_id is null;
-- =====================================================================

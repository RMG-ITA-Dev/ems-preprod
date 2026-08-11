-- =====================================================================
-- FIX: restaurar los 3 triggers de auth.users perdidos en el mirror
--
-- Hallazgo (auditoría 2026-07-30, docs/db-object-audit.sql): de los 58 triggers
-- que definen las migraciones, faltan estos 3 — todos sobre `auth.users`. Sus
-- FUNCIONES sí existen (`public.handle_new_user`, `public.link_auth_user_to_staff`,
-- `public.validate_email_domain`): lo que se perdió son únicamente los triggers.
--
-- Es el patrón conocido de este proyecto: un pg_dump/restore trae el esquema
-- `public` completo pero no los objetos de los esquemas gestionados (`auth`,
-- `storage`), y el rol del restore no puede recrearlos. Ya pasó con las policies
-- de storage.objects (20260729010000) y con supabase_migrations, que en esta base
-- no existe.
--
-- IMPACTO mientras faltan (por orden de gravedad):
--   1. on_auth_user_created — no se crea la fila en user_roles al registrarse. Con
--      role_key como autoridad y política fail-closed, un usuario NUEVO queda sin
--      ningún acceso y hay que asignarle el rol a mano.
--   2. on_auth_user_created_link_staff — la cuenta no se vincula a su ficha de
--      personal, así que get_my_staff_id() devuelve null y TODA pantalla con
--      alcance assigned_* o own le sale vacía.
--   3. validate_email_domain_trigger — no se valida el dominio del correo al
--      registrarse; la restricción de dominio queda sin efecto.
--
-- Idempotente: DROP TRIGGER IF EXISTS antes de cada CREATE. Los originales no lo
-- eran, así que re-ejecutar los archivos viejos fallaría con 42710.
--
-- NOTA: el esquema `auth` es de solo lectura desde el UI de Studio; esto se
-- aplica por SQL Editor (o Lovable), no por la interfaz.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) PRE-REQUISITO: handle_new_user debe setear role_key, no solo el enum
-- ---------------------------------------------------------------------
-- Su versión vigente (20260104042826) inserta solo `role`, nunca `role_key`.
-- Como el motor de autorización lee role_key, un usuario nuevo quedaría con
-- role_key NULL = fail-closed = sin acceso. Es el mismo bug que la Fase 6
-- (20260724130000) corrigió en assign_user_role_atomic sin tocar esta función.
--
-- Y hay un efecto peor si no se arregla ANTES de restaurar el trigger: el alta
-- por Edge Function llama a assign_user_role_atomic, que sale temprano con
-- "Role already assigned" si la fila ya existe. Con el trigger restaurado, el
-- trigger insertaría primero (role_key NULL) y el RPC ya no lo corregiría — o
-- sea que restaurar el trigger a secas ROMPERÍA el alta de usuarios, que hoy
-- funciona precisamente porque el trigger falta.
--
-- Con esta versión las dos vías producen el mismo resultado y el early-return
-- del RPC es inofensivo. La lógica de bootstrap (primer usuario = admin) y la
-- equivalencia staff -> assistant son idénticas a las de Fase 6.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role_count integer;
begin
  -- Guard de reentrada: si otra vía ya asignó el rol, no se toca.
  if exists (select 1 from public.user_roles where user_id = new.id) then
    return new;
  end if;

  select count(*) into v_role_count from public.user_roles;

  if v_role_count = 0 then
    -- Primer usuario = admin (bootstrap)
    insert into public.user_roles (user_id, role, role_key)
    values (new.id, 'admin', 'admin');
  else
    insert into public.user_roles (user_id, role, role_key)
    values (new.id, 'staff', 'assistant');
  end if;

  return new;
end;
$$;

-- 1) Rol al registrarse (origen: 20251204051043)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Vínculo con la ficha de personal (origen: 20251204051620)
drop trigger if exists on_auth_user_created_link_staff on auth.users;
create trigger on_auth_user_created_link_staff
  after insert on auth.users
  for each row execute function public.link_auth_user_to_staff();

-- 3) Validación de dominio del correo (origen: 20260104034700)
drop trigger if exists validate_email_domain_trigger on auth.users;
create trigger validate_email_domain_trigger
  before insert on auth.users
  for each row execute function public.validate_email_domain();

-- =====================================================================
-- VALIDACIÓN
--
--   -- Esperado: 3 filas, tgenabled = 'O'
--   select t.tgname, t.tgenabled
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal
--   order by t.tgname;
--
--   -- handle_new_user ahora debe setear role_key. Verificar el cuerpo:
--   select prosrc like '%role_key%' as setea_role_key
--   from pg_proc
--   where pronamespace = 'public'::regnamespace and proname = 'handle_new_user';
--   -- ^ debe devolver true
--
--   -- Usuarios existentes que quedaron sin rol o sin ficha por la ausencia de
--   -- los triggers (hay que arreglarlos a mano: el trigger solo actúa en el
--   -- INSERT, no retroactivamente):
--   select u.email,
--          ur.role_key,
--          s.staff_id
--   from auth.users u
--   left join public.user_roles ur on ur.user_id = u.id
--   left join public.staff s      on s.auth_user_id = u.id
--   where ur.user_id is null or s.staff_id is null
--   order by u.created_at desc;
-- =====================================================================

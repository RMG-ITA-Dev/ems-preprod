-- =====================================================================
-- Endurecer PII de staff: privilegios a nivel de COLUMNA
--
-- Hallazgo (auditoría 2026-07-30): desde 20260610050000 la policy
-- "Authenticated staff can view active staff directory" deja a cualquier usuario
-- con ficha leer las FILAS de todo el personal activo. RLS filtra filas, no
-- columnas, así que un `select *` devolvía también los identificadores
-- personales. El comentario de useStaffFull() que decía "will fail for non-admin
-- users due to RLS" quedó desactualizado desde entonces.
--
-- POR QUÉ NO SE ACOTA LA POLICY DE FILAS: hay 35 joins anidados de `staff` desde
-- otras tablas (manager:staff x10, partner:staff x9, requester, sqr, encargado,
-- disbursed_by, ...). Restringirla a quienes tienen staff.read dejaría en NULL
-- los nombres de personas en encargos, OT y fondos para 10 de los 23 roles. La
-- policy de directorio existe justamente para que esos embeds funcionen.
--
-- QUÉ SE REVOCA: `id_number` (documento de identidad) y `aud_reg_number`
-- (registro de auditor). Son identificadores personales y su superficie de uso
-- es mínima.
--
-- QUÉ NO SE REVOCA, y por qué (decisión, no omisión):
--   - `email`: es dato de directorio corporativo, de baja sensibilidad, y
--     `useCurrentStaff` lo usa para el fallback de AUTO-VINCULACIÓN
--     (`.eq('email', userEmail).is('auth_user_id', null)`). Ese fallback es el
--     que rescata a los usuarios que quedaron sin `auth_user_id` — justo los
--     afectados por el trigger ausente que restauró 20260730060000. Revocarlo
--     exigiría mover la auto-vinculación a un RPC, o sea tocar el camino de
--     login, a cambio de proteger un correo derivable del nombre. Si el negocio
--     lo pide, es agregar 'email' al revoke + un RPC `link_my_staff_by_email`.
--   - `auth_user_id`: los privilegios de columna aplican TAMBIÉN al WHERE, y
--     `useCurrentStaff` + `useAuth.tsx:123` filtran por ella. Revocarla rompe el
--     inicio de sesión de todos.
--   - `weekly_capacity_hours`: la usa planificación de recursos.
--   - `is_blocked`, `hire_date`, `termination_date`: los usan los guards de
--     cuenta y la vista de Personal.
--
-- NO AFECTA reintentos/lockout, cuenta bloqueada, activación/inactivación ni
-- recuperación: esas vías corren por Edge Function con `service_role` (execute
-- revocado a `authenticated` en 20260527000000) o por funciones SECURITY
-- DEFINER, que corren con los privilegios de su dueño e ignoran los privilegios
-- de columna del invocador.
--
-- ⚠️ INCOMPATIBLE CON `select=*` SOBRE staff — ORDEN DE DESPLIEGUE OBLIGATORIO
--
-- Revocar el SELECT de tabla rompe CUALQUIER consulta que pida `*` de staff,
-- incluidos los embeds anidados: `partner:staff!engagements_partner_id_fkey(*)`
-- expande a las 19 columnas, toca las dos revocadas y PostgREST devuelve **403**
-- sobre la consulta COMPLETA. No degrada: falla entera.
--
-- Pasó en pruebas (2026-08-04): un admin abría /engagements y recibía 403. Había
-- 21 embeds con `(*)` en useEmsData.ts, useApprovedEngagements.ts y
-- useManualEntryEngagements.ts. Ya están corregidos a columnas explícitas en el
-- mismo commit, pero el orden importa:
--
--   1) Desplegar PRIMERO el frontend sin `select=*` sobre staff.
--   2) Aplicar DESPUÉS esta migración.
--
-- Al revés, la app queda con 403 en Encargos, Registros de Tiempo y todo lo que
-- embeba staff, hasta que el frontend llegue.
--
-- Si aparece un 403 nuevo tras aplicar, la causa es siempre la misma: alguien
-- agregó un `*` sobre staff. Para localizarlo:
--   grep -rn ':staff!\?\w*(\*)' src/
-- Y para desbloquear en caliente mientras se corrige:
--   grant select on public.staff to authenticated;   -- deshace el hardening
--
-- Idempotente. Tras aplicar hay que regenerar types.ts (2 RPC nuevos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Privilegios de columna
-- ---------------------------------------------------------------------
-- IMPORTANTE: hay que revocar el SELECT de TABLA primero. Un privilegio de tabla
-- implica todas las columnas, así que un `revoke select (col)` suelto no tiene
-- ningún efecto mientras el privilegio de tabla siga vigente.
revoke select on public.staff from authenticated;

-- Todas las columnas MENOS id_number y aud_reg_number.
grant select (
  staff_id,
  auth_user_id,
  first_name,
  last_name,
  email,
  category_id,
  is_active,
  created_at,
  updated_at,
  short_name,
  initials,
  city,
  weekly_capacity_hours,
  hire_date,
  termination_date,
  deleted_at,
  is_blocked
) on public.staff to authenticated;

-- INSERT/UPDATE/DELETE quedan intactos: son privilegios independientes del
-- SELECT, así que admin sigue pudiendo escribir los campos revocados.

comment on column public.staff.id_number is
  'Documento de identidad. SELECT revocado a `authenticated`: se lee solo por '
  'get_staff_full() / staff_id_number_conflict() (SECURITY DEFINER, gated por permiso).';
comment on column public.staff.aud_reg_number is
  'Registro de auditor. SELECT revocado a `authenticated` — ver id_number.';

-- ---------------------------------------------------------------------
-- 2) get_staff_full(): la vista de Personal y el formulario, por permiso
-- ---------------------------------------------------------------------
-- Devuelve jsonb para conservar EXACTAMENTE la forma que ya consumía
-- useStaffFull() (fila de staff + category + staff_skills con su skill anidado),
-- sin tener que declarar un RETURNS TABLE gigante ni perder los embeds.
create or replace function public.get_staff_full()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(fila order by fila->>'last_name'), '[]'::jsonb)
  from (
    select to_jsonb(s) || jsonb_build_object(
      'category',
        (select to_jsonb(c) from categories c where c.category_id = s.category_id),
      'staff_skills',
        (select coalesce(jsonb_agg(jsonb_build_object(
            'staff_skill_id',       ss.staff_skill_id,
            'skill_id',             ss.skill_id,
            'proficiency_level',    ss.proficiency_level,
            'last_evaluated_date',  ss.last_evaluated_date,
            'skill', (select jsonb_build_object(
                        'skill_id',  sk.skill_id,
                        'name',      sk.name,
                        'category',  sk.category,
                        'is_active', sk.is_active)
                      from skills sk where sk.skill_id = ss.skill_id)
          )), '[]'::jsonb)
         from staff_skills ss where ss.staff_id = s.staff_id)
    ) as fila
    from staff s
    -- El gate: sin staff.read no devuelve nada. Antes de esta migración,
    -- CUALQUIER usuario con ficha obtenía PII del personal activo por `select *`.
    where public.has_permission('staff.read')
  ) t;
$$;

revoke execute on function public.get_staff_full() from public, anon;
grant  execute on function public.get_staff_full() to authenticated;

comment on function public.get_staff_full() is
  'Personal con PII (documento, registro de auditor) para la pantalla de Personal '
  'y StaffForm. Gated por has_permission(''staff.read''). Reemplaza el select * '
  'directo, que exponía PII a cualquier usuario con ficha.';

-- ---------------------------------------------------------------------
-- 3) staff_id_number_conflict(): chequeo de documento duplicado
-- ---------------------------------------------------------------------
-- StaffForm valida documento duplicado con `.eq('id_number', ...)`. Los
-- privilegios de columna aplican al WHERE, así que esa consulta ya no puede
-- correr desde el cliente. Se resuelve acá, devolviendo SOLO si hay conflicto y
-- de quién — nunca el documento de otra persona.
create or replace function public.staff_id_number_conflict(
  p_id_number       text,
  p_exclude_staff_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first text;
  v_last  text;
begin
  if not (public.has_permission('staff.create') or public.has_permission('staff.update')) then
    raise exception 'Permission denied: staff.create or staff.update required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_id_number is null or btrim(p_id_number) = '' then
    return jsonb_build_object('conflict', false);
  end if;

  select first_name, last_name into v_first, v_last
  from staff
  where id_number = btrim(p_id_number)
    and deleted_at is null
    and (p_exclude_staff_id is null or staff_id <> p_exclude_staff_id)
  limit 1;

  if v_first is null then
    return jsonb_build_object('conflict', false);
  end if;

  return jsonb_build_object('conflict', true, 'first_name', v_first, 'last_name', v_last);
end;
$$;

revoke execute on function public.staff_id_number_conflict(text, uuid) from public, anon;
grant  execute on function public.staff_id_number_conflict(text, uuid) to authenticated;

-- =====================================================================
-- VALIDACIÓN
--
--   -- 1) Los privilegios de columna quedaron aplicados (esperado: 17 filas,
--   --    sin id_number ni aud_reg_number)
--   select column_name
--   from information_schema.column_privileges
--   where table_schema='public' and table_name='staff'
--     and grantee='authenticated' and privilege_type='SELECT'
--   order by column_name;
--
--   -- 2) Impersonando a un usuario NO admin con ficha:
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID_NO_ADMIN>"}', true);
--     -- Los embeds de nombres siguen funcionando:
--     select first_name, last_name from public.staff limit 3;      -- OK
--     -- El PII ya no:
--     -- select id_number from public.staff limit 1;               -- debe dar 42501
--     -- Y sin staff.read el RPC no devuelve nada:
--     select jsonb_array_length(public.get_staff_full());          -- 0
--   rollback;
--
--   -- 3) Impersonando a admin: el RPC trae todo con PII
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID_ADMIN>"}', true);
--     select jsonb_array_length(public.get_staff_full());           -- > 0
--     select public.get_staff_full() -> 0 -> 'id_number';           -- presente
--     select public.staff_id_number_conflict('no-existe-99999');    -- conflict:false
--   rollback;
--
--   -- 4) En la app: Personal lista y abre el detalle; crear/editar personal
--   --    valida documento duplicado; encargos/OT/fondos siguen mostrando nombres.
-- =====================================================================

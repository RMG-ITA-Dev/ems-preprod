-- =====================================================================
-- FEAT 0602-135 — congelar/descongelar: por permiso + ASIGNACIÓN, no por enum
--
-- Decisión del negocio (2026-07-30): además del Administrador, puede congelar y
-- descongelar un encargo aprobado **el Gerente DE ESE encargo**. No cualquier
-- usuario con rol Gerente.
--
-- Estado anterior: el trigger `authorize_engagement_state_override`
-- (20260714000000:381) permitía la transición null<->9 a
-- `has_role(auth.uid(), 'manager')` SIN verificar asignación. Dos problemas:
--
--   1. Sin asignación: cualquier portador del enum `manager` podía congelar
--      CUALQUIER encargo aprobado, no solo los suyos.
--   2. Por enum legacy: con el espejo de Fase 8 (20260729000000) son SIETE los
--      role_key que mapean a `manager` — manager, ita_manager, tax_manager,
--      it_security_manager, accounting_manager, hr_manager y risk_supervisor.
--      Los cuatro últimos no tienen nada que ver con encargos.
--
-- No era explotable: `engagements write update` (Ola B1) exige
-- has_permission('engagement.update'), que solo tienen admin, manager,
-- ita_manager y tax_manager, así que los otros tres nunca llegaban al trigger.
-- Pero la defensa quedaba apoyada en una capa distinta de la que expresaba la
-- intención, y el frontend sí les mostraba el toggle.
--
-- Ahora el trigger exige las DOS cosas, en línea con el resto del modelo:
--   has_permission('engagement.update')  +  NEW.manager_id = get_my_staff_id()
--
-- Se usa `engagement.update` en lugar de crear una clave nueva porque la regla
-- del negocio es relacional ("el gerente de ese encargo"), y ese permiso con
-- alcance assigned_engagements es exactamente "puedo editar los encargos donde
-- estoy asignado". Congelar es una edición del encargo, no una capacidad aparte.
--
-- El frontend quedó alineado en el mismo commit (EngagementForm:
-- `canFreezeAsManager = can('engagement.update') && staffRecord === manager_id`).
--
-- Idempotente (create or replace). El trigger que la invoca no se toca.
-- =====================================================================

create or replace function public.authorize_engagement_state_override()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  -- Sistema (cron/service_role/definer sin sesión): sin auth.uid() → permitir.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.engagement_state_override is not null and not public.is_admin() then
      raise exception 'No autorizado a fijar el estado del encargo';
    end if;
    return new;
  end if;

  -- Decisión A: bloqueo server-side de edición de fechas por no-admin cuando el
  -- estado actual es terminal (override 6/7/9). Se evalúa aunque el override no
  -- cambie.
  if not public.is_admin()
     and old.engagement_state_override in (6, 7, 9)
     and (
       new.start_date    is distinct from old.start_date
       or new.end_date   is distinct from old.end_date
       or new.fecha_cierre is distinct from old.fecha_cierre
     )
  then
    raise exception 'No autorizado a editar fechas de un encargo Cancelado/Finalizado/Congelado';
  end if;

  -- UPDATE: validación del override solo si cambia.
  if new.engagement_state_override is not distinct from old.engagement_state_override then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  -- Gerente DEL ENCARGO: congelar (null→9) o descongelar (9→null), solo con
  -- estado derivado Aprobado. Antes: has_role(..., 'manager') sin asignación.
  if public.has_permission('engagement.update')
     and new.manager_id = public.get_my_staff_id()
     and public.engagement_is_approved_state(new.engagement_id, null, new.work_order_required)
     and (
       (old.engagement_state_override is null and new.engagement_state_override = 9)
       or (old.engagement_state_override = 9 and new.engagement_state_override is null)
     )
  then
    return new;
  end if;

  raise exception 'No autorizado a cambiar el estado del encargo (override)';
end;
$function$;

comment on function public.authorize_engagement_state_override() is
  'Guard del estado del encargo. Admin: control total. Gerente DEL encargo '
  '(has_permission(''engagement.update'') + manager_id = get_my_staff_id()): solo '
  'congelar/descongelar (null<->9) y solo si el estado derivado es Aprobado.';

-- =====================================================================
-- VALIDACIÓN (impersonando)
--
--   -- 1) El gerente DEL encargo congela: debe pasar
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID_GERENTE_DEL_ENCARGO>"}', true);
--     update public.engagements set engagement_state_override = 9
--     where engagement_id = '<ENCARGO_APROBADO_SUYO>';        -- 1 fila
--   rollback;
--
--   -- 2) Un Gerente que NO es el del encargo: debe fallar
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID_OTRO_GERENTE>"}', true);
--     -- update ... set engagement_state_override = 9 where engagement_id = '<AJENO>';
--     -- ^ esperado: "No autorizado a cambiar el estado del encargo (override)"
--     --   (o 0 filas si RLS ya lo filtró por no estar asignado)
--   rollback;
--
--   -- 3) Contabilidad / TH / Seguridad TI (mapean a `manager` en el enum pero no
--   --    tienen engagement.update): 0 filas por RLS, nunca llegan al trigger.
--
--   -- 4) El cuerpo ya no menciona has_role: esperado true
--   select prosrc not like '%has_role%' as sin_enum_legacy
--   from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname = 'authorize_engagement_state_override';
-- =====================================================================

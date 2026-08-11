-- =====================================================================
-- Fondos — el encargo de una OT de MI solicitud debe ser legible
--
-- Síntoma reportado (2026-07-31): al agregar un gasto, el desplegable "Orden de
-- Trabajo" muestra una opción cuya etiqueta es solo "—". El SelectItem arma la
-- etiqueta así (FundRequestExpenseForm):
--     {frwo.work_order?.engagement?.engagement_code} — {…engagement_name}
-- Con `engagement` en null solo queda el separador literal. No es un bug de
-- layout ni de permisos para crear el gasto: es la relación anidada volviendo
-- vacía.
--
-- Causa: 20260610190000 resolvió el acceso a `work_orders` en contexto de fondos
-- con dos piezas —una VISTA segura para el desplegable de creación y la policy
-- angosta "Staff can view fund request work orders" (helper
-- `wo_in_my_fund_request`) para el EMBED— pero no hizo lo equivalente para
-- `engagements`. El select de useFundRequests anida:
--     fund_request_work_orders → work_order:work_orders → engagement:engagements
-- así que la OT sí se ve y su encargo no.
--
-- A quién le pasa: al solicitante (o gerente de OT) que NO está asignado al
-- encargo de esa OT. `engagement.read` tiene alcance `assigned_engagements` para
-- partner, manager, sqr, ita_manager y tax_manager, así que salvo admin,
-- senior_partner y director (alcance firm) cualquiera puede caer acá. Y crear
-- solicitudes de fondos lo puede hacer cualquier rol: `fund_request.create` está
-- concedido a los 23 con alcance `own`.
--
-- Es el mismo patrón que ya corregimos en 20260730010000 (matriz/OT),
-- 20260730020000 (cliente por estado del encargo) y 20260730070000 (OT de la
-- solicitud para Contabilidad): la tabla padre obtuvo su vía de acceso y la hija
-- quedó con la policy vieja.
--
-- Idempotente. Aplicar en Lovable o por SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Helper SECURITY DEFINER (evita recursión de RLS)
-- ---------------------------------------------------------------------
-- Se resuelve con un helper y no con un EXISTS dentro de la policy porque el
-- camino pasa por work_orders y fund_request_work_orders, que tienen sus propias
-- policies: un EXISTS en línea las evaluaría y volvería a caer en engagements.
-- Es el mismo motivo por el que 20260610190000 usó `wo_in_my_fund_request`.
--
-- Mismas condiciones que ese helper, para no abrir una puerta más ancha:
--   - la solicitud NO puede estar en 'borrador' (si no, cualquiera crea un
--     borrador, le agrega una OT aprobada y lee el encargo de cualquiera);
--   - solo el solicitante o el gerente de esa OT dentro de la solicitud.
create or replace function public.engagement_in_my_fund_request(p_engagement_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.fund_request_work_orders frwo
    join public.fund_requests fr on fr.fund_request_id = frwo.fund_request_id
    join public.work_orders  wo on wo.wo_id = frwo.wo_id
    where wo.engagement_id = p_engagement_id
      and fr.status <> 'borrador'
      and (
        fr.requester_staff_id = get_my_staff_id()
        or frwo.manager_staff_id = get_my_staff_id()
      )
  );
$$;

revoke execute on function public.engagement_in_my_fund_request(uuid) from public, anon;
grant  execute on function public.engagement_in_my_fund_request(uuid) to authenticated;

comment on function public.engagement_in_my_fund_request(uuid) is
  'True si el encargo pertenece a una OT incluida en una solicitud de fondos '
  'ENVIADA donde el usuario es solicitante o gerente de esa OT. Espejo de '
  'wo_in_my_fund_request para el nivel encargo (embed anidado del select de fondos).';

-- ---------------------------------------------------------------------
-- 2) Policy angosta para el embed
-- ---------------------------------------------------------------------
-- PERMISIVA y aditiva: se suma por OR a "engagements read" (firm /
-- assigned_engagements) y a "engagements creator read". Nadie pierde acceso.
-- No habilita escrituras: solo SELECT.
drop policy if exists "Staff can view fund request engagements" on public.engagements;
create policy "Staff can view fund request engagements" on public.engagements
  for select to authenticated
  using (public.engagement_in_my_fund_request(engagement_id));

-- =====================================================================
-- VALIDACIÓN
--
--   -- La policy existe
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='engagements'
--     and policyname = 'Staff can view fund request engagements';
--
--   -- Reproducir el caso: solicitante NO asignado al encargo de la OT.
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID_SOLICITANTE>"}', true);
--     select public.get_my_staff_id();                      -- no debe ser null
--     -- Antes: 0 filas. Ahora: 1 por cada encargo de las OT de sus solicitudes.
--     select e.engagement_code, e.engagement_name
--     from public.engagements e
--     where public.engagement_in_my_fund_request(e.engagement_id);
--   rollback;
--
--   -- Un borrador NO debe conceder lectura (misma regla que wo_in_my_fund_request):
--   -- con la solicitud en 'borrador' la consulta anterior debe volver vacía.
--
--   -- En la app: como solicitante no asignado al encargo, abrir "Nuevo Gasto":
--   -- el desplegable de OT debe mostrar "CODIGO — Nombre del encargo", no "—".
-- =====================================================================

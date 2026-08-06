-- =====================================================================
-- Roles & Permisos — Contabilidad ve las OT de las solicitudes de fondos
--
-- Síntoma reportado (2026-07-30): en Desembolsos de Fondos, el Gerente de
-- Contabilidad ve la columna "Gerente(s)" siempre en "-", aunque las
-- solicitudes sí se listan y "Solicitante" sí resuelve.
--
-- Causa: la columna se arma desde `fund_request_work_orders[].manager`, y la
-- policy vigente de esa tabla (fr_wo_select, de 20260610080000) solo admite:
--     manager_staff_id = get_my_staff_id()
--     OR fr_is_requester(fund_request_id)
--     OR is_admin()
-- Contabilidad no entra por ninguna de las tres, así que la relación anidada
-- vuelve vacía y el render cae al "-".
--
-- Es una omisión de la Fase 4 ola D (20260724100000): esa migración le dio a
-- Contabilidad acceso a `fund_requests` (fr_select_accounting) y a
-- `fund_request_expenses` (fre_select_accounting), pero no a la tabla hija que
-- guarda la asignación de gerente por OT. La pantalla de Desembolsos es de
-- admin + accounting_manager según la matriz, y saber qué gerente aprobó cada
-- OT es parte de esa pantalla — sin eso no se puede desembolsar con criterio.
--
-- Alcance: SOLO lectura, y solo de las solicitudes que Contabilidad ya puede
-- ver por fr_select_accounting. Se replican los mismos estados y la misma forma
-- (has_permission + EXISTS sobre fund_requests) que usa fre_select_accounting,
-- para no introducir un patrón nuevo. NO se toca fr_wo_select ni ninguna
-- escritura: insertar/actualizar/borrar OT de una solicitud sigue siendo del
-- solicitante y del gerente.
--
-- Policy PERMISIVA y aditiva: se suma por OR a fr_wo_select. Nadie pierde acceso.
-- Idempotente.
-- =====================================================================

drop policy if exists "frwo_select_accounting" on public.fund_request_work_orders;
create policy "frwo_select_accounting" on public.fund_request_work_orders
  for select to authenticated
  using (
    -- Gerente de Contabilidad: toda la fase contable (los 6 tabs de la pantalla).
    (public.has_permission('fund_disbursement.read')
      and exists (
        select 1 from public.fund_requests fr
        where fr.fund_request_id = fund_request_work_orders.fund_request_id
          and fr.status = any (array['aprobado_gerente','fondos_entregados',
                                     'en_liquidacion','cerrado']::fund_request_status[])
      ))
    or
    -- Analista de Contabilidad / Cobranzas: hasta 'fondos_entregados', igual que
    -- su alcance en fr_select_accounting.
    (public.has_permission('expense_settlement.read')
      and exists (
        select 1 from public.fund_requests fr
        where fr.fund_request_id = fund_request_work_orders.fund_request_id
          and fr.status = any (array['aprobado_gerente','fondos_entregados']::fund_request_status[])
      ))
  );

-- =====================================================================
-- VALIDACIÓN
--
--   -- La policy existe
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='fund_request_work_orders'
--   order by policyname;
--   -- esperado: fr_wo_select, fr_wo_insert, fr_wo_update, fr_wo_delete,
--   --           frwo_select_accounting
--
--   -- Impersonando al Gerente de Contabilidad: antes 0 filas, ahora > 0
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID>"}', true);
--     select public.current_role_key();          -- accounting_manager
--     select count(*) from public.fund_request_work_orders;
--   commit;
--
--   -- En la app: Desembolsos de Fondos -> la columna "Gerente(s)" debe traer
--   -- nombres en las solicitudes que tengan OT con gerente asignado.
-- =====================================================================

-- =====================================================================
-- Roles & Permisos — FASE 4, OLA D: Contabilidad en Desembolso y Liquidación
-- El flujo de fondos (requester/manager/admin + estado) YA coincide con la matriz
-- para Solicitud/Gastos/Aprobación. El gap es que hoy SOLO admin desembolsa/liquida.
-- Se agrega:
--   - Desembolso  -> admin + fund_disbursement.update  (Gerente de Contabilidad)
--   - Liquidación -> admin + expense_settlement.update (Gerente + Analista de Contab.)
-- vía (a) split del guard de columnas contables y (b) políticas RLS para Contabilidad.
--
-- Requiere Fase 1. Idempotente. Mirror-del-mirror.
-- NOTA: si el desembolso/liquidación se ejecuta por alguna RPC SECURITY DEFINER con
-- is_admin() interno, esa RPC también debe abrirse a los permisos de arriba (verificar).
-- =====================================================================

-- 1) Guard de columnas contables: separar desembolso vs liquidación por permiso.
create or replace function public.fr_guard_accounting_cols()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if is_admin() then
    return new;
  end if;

  -- Columnas de DESEMBOLSO / cierre: requieren fund_disbursement.update.
  if (
    new.total_disbursed_amount is distinct from old.total_disbursed_amount or
    new.disbursed_at is distinct from old.disbursed_at or
    new.disbursed_by_staff_id is distinct from old.disbursed_by_staff_id or
    new.accounting_notes is distinct from old.accounting_notes or
    new.closed_at is distinct from old.closed_at
  ) and not public.has_permission('fund_disbursement.update') then
    raise exception 'Solo contabilidad (desembolso) puede modificar estos campos';
  end if;

  -- Columnas de LIQUIDACIÓN: requieren expense_settlement.update.
  if (
    new.settlement_total_spent is distinct from old.settlement_total_spent or
    new.settlement_balance is distinct from old.settlement_balance or
    new.settlement_iva_total is distinct from old.settlement_iva_total or
    new.settlement_resolution is distinct from old.settlement_resolution or
    new.settlement_amount is distinct from old.settlement_amount or
    new.settlement_notes is distinct from old.settlement_notes or
    new.settled_at is distinct from old.settled_at or
    new.settled_by_staff_id is distinct from old.settled_by_staff_id
  ) and not public.has_permission('expense_settlement.update') then
    raise exception 'Solo contabilidad (liquidacion) puede modificar estos campos';
  end if;

  return new;
end;
$$;
-- (el trigger tr_fr_guard_accounting_cols ya apunta a esta función; no se recrea)

-- 2) RLS de fund_requests para Contabilidad (ver + actualizar en la fase contable).
-- Gerente de Contabilidad (fund_disbursement.read): ve TODA la fase contable (los 6 tabs).
-- Analista de Contabilidad (solo expense_settlement.read): ve todo MENOS 'en_liquidacion'
-- y 'cerrado' (tabs "En Liquidación" y "Cerrados").
drop policy if exists "fr_select_accounting" on public.fund_requests;
create policy "fr_select_accounting" on public.fund_requests
  for select to authenticated
  using (
    (public.has_permission('fund_disbursement.read')
       and status = any (array['aprobado_gerente','fondos_entregados','en_liquidacion','cerrado']::fund_request_status[]))
    or
    (public.has_permission('expense_settlement.read')
       and status = any (array['aprobado_gerente','fondos_entregados']::fund_request_status[]))
  );

-- Gerente de Contabilidad: actualiza en toda la fase contable (desembolso + liquidación).
-- Analista de Contabilidad: solo hasta 'fondos_entregados' (prepara liquidación); no toca
-- 'en_liquidacion'/'cerrado' (eso lo finaliza el Gerente). El guard limita además las columnas.
drop policy if exists "fr_update_accounting" on public.fund_requests;
create policy "fr_update_accounting" on public.fund_requests
  for update to authenticated
  using (
    (public.has_permission('fund_disbursement.update')
       and status = any (array['aprobado_gerente','fondos_entregados','en_liquidacion','cerrado']::fund_request_status[]))
    or
    (public.has_permission('expense_settlement.update')
       and status = any (array['aprobado_gerente','fondos_entregados']::fund_request_status[]))
  )
  with check (
    (public.has_permission('fund_disbursement.update')
       and status = any (array['aprobado_gerente','fondos_entregados','en_liquidacion','cerrado']::fund_request_status[]))
    or
    (public.has_permission('expense_settlement.update')
       and status = any (array['aprobado_gerente','fondos_entregados']::fund_request_status[]))
  );

-- 3) RLS de fund_request_expenses: Contabilidad ve los gastos para revisar/liquidar.
drop policy if exists "fre_select_accounting" on public.fund_request_expenses;
create policy "fre_select_accounting" on public.fund_request_expenses
  for select to authenticated
  using (
    public.has_permission('expense_settlement.read')
    and exists (
      select 1 from fund_requests fr
      where fr.fund_request_id = fund_request_expenses.fund_request_id
        and fr.status = any (array['fondos_entregados','en_liquidacion','cerrado']::fund_request_status[])
    )
  );

-- =====================================================================
-- VALIDACIÓN (impersonando):
--  - accounting_manager: ve/actualiza fund_requests en fase contable; puede tocar
--    columnas de desembolso Y liquidación. accounting_analyst: solo liquidación.
--  - un requester intentando tocar columnas contables: sigue bloqueado por el guard.
--  - El flujo requester/manager/admin (solicitud, gastos, aprobación) queda intacto.
-- Follow-up: si hay RPC de desembolso/liquidación con is_admin() interno, abrirla a
--   fund_disbursement.update / expense_settlement.update.
-- =====================================================================

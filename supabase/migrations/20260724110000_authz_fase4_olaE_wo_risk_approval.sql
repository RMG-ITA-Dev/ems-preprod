-- =====================================================================
-- Roles & Permisos — FASE 4 (Ola E): aprobación de la SECCIÓN DE RIESGOS de la OT
-- Plan: "plan V2 roles permisos.md" · matriz fila "Listar/Aprob. sección de Riesgos"
--
-- Contexto:
--   Las mutaciones de riesgo son UPDATE directo sobre work_orders (no RPC) y
--   dependían de la RLS general del equipo del encargo + is_admin(). El frontend
--   restringía la sección de Riesgos al SQR asignado, pero eso era SOLO UI.
--
-- Objetivo (decisión del usuario):
--   Aprobar/Rechazar la sección de Riesgos requiere el permiso
--   'work_order.risk.approve' de la matriz:
--     - admin                                  -> siempre (is_admin bypass)
--     - manager / ita_manager / tax_manager    -> scope assigned_engagements:
--                                                  SOLO si son el SQR del encargo
--                                                  (engagement.sqr_id), por decisión
--                                                  explícita "solo sqr_id".
--     - risk_partner / risk_supervisor         -> scope department: cualquier encargo
--                                                  (department se resuelve firm-wide,
--                                                  igual que en las olas de lectura).
--
-- Enfoque: guard trigger (BEFORE UPDATE) al estilo de Ola D
--   (fr_guard_accounting_cols). Gatea SOLO las columnas de DECISIÓN de riesgo
--   (aprobar/rechazar/emergencia), NO la captura de datos (ceac/san/risk_level)
--   ni el reseteo a 'Pending' del submit/complete — esos siguen bajo la RLS del
--   equipo, porque no son el acto de aprobación de la matriz.
--
-- Idempotente (create or replace / drop trigger if exists). SECURITY DEFINER
-- con search_path fijo. Fail-closed. Requiere Fases 1–2 + Ola B2a aplicadas.
-- =====================================================================

-- 1) ¿El usuario actual puede aprobar/rechazar la sección de Riesgos de este encargo?
create or replace function public.can_approve_wo_risk(p_engagement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or (
      public.has_permission('work_order.risk.approve')
      and (
        -- department / firm -> cualquier encargo (igual que las olas de lectura).
        public.permission_scope('work_order.risk.approve') is distinct from 'assigned_engagements'
        -- assigned_engagements -> SOLO el SQR asignado del encargo.
        or public.get_my_staff_id() = (
          select e.sqr_id from public.engagements e
          where e.engagement_id = p_engagement_id
        )
      )
    );
$$;

revoke execute on function public.can_approve_wo_risk(uuid) from public;
grant execute on function public.can_approve_wo_risk(uuid) to authenticated;

-- 2) Guard de columnas de DECISIÓN de riesgo en work_orders.
--    Solo dispara cuando cambia una columna de aprobación/rechazo/emergencia.
create or replace function public.wo_guard_risk_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Acto de aprobación / rechazo de Riesgos:
  --   * registrar aprobador (risk_approved_by no nulo)
  --   * transición de risk_status a un veredicto (Approved / Rejected / Emergency_Approved).
  --     'Pending' queda fuera: lo escriben submit/complete/revert (no es aprobación).
  --   * pasos de emergencia (review / partner sign-off).
  if (
    (new.risk_approved_by is distinct from old.risk_approved_by and new.risk_approved_by is not null)
    or (new.risk_status is distinct from old.risk_status
        and new.risk_status in ('Approved', 'Rejected', 'Emergency_Approved'))
    or (new.emergency_review_by is distinct from old.emergency_review_by and new.emergency_review_by is not null)
    or (new.emergency_partner_by is distinct from old.emergency_partner_by and new.emergency_partner_by is not null)
  ) and not public.can_approve_wo_risk(new.engagement_id) then
    raise exception 'Solo un aprobador de Riesgos autorizado puede aprobar o rechazar la seccion de Riesgos de esta OT';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_wo_guard_risk_approval on public.work_orders;
create trigger tr_wo_guard_risk_approval
  before update on public.work_orders
  for each row
  execute function public.wo_guard_risk_approval();

-- =====================================================================
-- VALIDACIÓN (SQL Editor)
-- auth.uid() suele ser null sin sesión; impersonar para probar:
--   select set_config('request.jwt.claims', '{"sub":"<UUID_USUARIO>"}', false);
--   -- risk_partner: debe dar true en cualquier encargo
--   select public.can_approve_wo_risk('<ENGAGEMENT_ID>');
--   -- manager NO-SQR de ese encargo: debe dar false
--   -- manager que ES el sqr_id de ese encargo: debe dar true
--
-- Humo (cableado del permiso al catálogo):
--   select role_key, scope_key from public.authorization_role_permissions
--     where permission_key = 'work_order.risk.approve' order by role_key;
-- =====================================================================

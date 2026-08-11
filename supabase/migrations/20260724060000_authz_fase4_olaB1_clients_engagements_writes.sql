-- =====================================================================
-- Roles & Permisos — FASE 4, OLA B.1: escrituras de Clientes y Encargos por permiso
-- Reemplaza las políticas de ESCRITURA (is_admin / team) por has_permission + asignación.
-- Las LECTURAS de clients/engagements quedan ABIERTAS por ahora (el read-scoping
-- "Solo de Clientes Asignados" se hace en B.2, tras definir cómo se asignan Director
-- y especialistas — ver pregunta al equipo).
-- Requiere Fase 1. Idempotente. Mirror-del-mirror.
-- =====================================================================

-- ---------- CLIENTES ----------
-- Crear: admin, senior_partner, socio, sqr, director, gerente, ita/tax_manager (matriz).
-- Editar: admin (matriz). Eliminar: no está en la matriz -> solo admin (Q4; preferir desactivar).
drop policy if exists "Admins can manage clients" on public.clients;
drop policy if exists "clients write insert" on public.clients;
drop policy if exists "clients write update" on public.clients;
drop policy if exists "clients write delete" on public.clients;
create policy "clients write insert" on public.clients
  for insert to authenticated with check (public.has_permission('client.create'));
create policy "clients write update" on public.clients
  for update to authenticated using (public.has_permission('client.update'))
  with check (public.has_permission('client.update'));
create policy "clients write delete" on public.clients
  for delete to authenticated using (public.is_admin());

-- ---------- ENCARGOS ----------
-- Crear: admin, gerente, ita/tax_manager (matriz). Editar: idem + asignación (team) o firm.
-- Eliminar: admin (matriz "Eliminar Encargos").
drop policy if exists "Admins can manage engagements" on public.engagements;
drop policy if exists "Team can update engagements" on public.engagements;
drop policy if exists "engagements write insert" on public.engagements;
drop policy if exists "engagements write update" on public.engagements;
drop policy if exists "engagements write delete" on public.engagements;
create policy "engagements write insert" on public.engagements
  for insert to authenticated with check (public.has_permission('engagement.create'));
create policy "engagements write update" on public.engagements
  for update to authenticated
  using (
    public.has_permission('engagement.update')
    AND (public.permission_scope('engagement.update') = 'firm'
         OR public.is_engagement_team_member(engagement_id))
  )
  with check (
    public.has_permission('engagement.update')
    AND (public.permission_scope('engagement.update') = 'firm'
         OR public.is_engagement_team_member(engagement_id))
  );
create policy "engagements write delete" on public.engagements
  for delete to authenticated using (public.has_permission('engagement.delete'));

-- Nota: la nueva-generación de código de encargo y el estado usan RPC/triggers
-- SECURITY DEFINER (authorize_engagement_state_override), que se conservan.

-- =====================================================================
-- VALIDACIÓN (impersonando): un gerente puede INSERT encargo y UPDATE los suyos;
-- un senior no; solo admin borra clientes/encargos; client.update solo admin.
-- =====================================================================

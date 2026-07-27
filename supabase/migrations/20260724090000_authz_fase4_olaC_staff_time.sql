-- =====================================================================
-- Roles & Permisos — FASE 4, OLA C: staff + time_entries + timer_entries
-- staff: escrituras por permiso (admin) + limpiar política duplicada; lectura del
--   módulo Personal por staff.read; se conserva el directorio activo (lookup) y el
--   registro propio. time_entries/timer: propio por permiso + team (lectura) + admin.
-- Requiere Fase 1. Idempotente. Mirror-del-mirror.
-- =====================================================================

-- ---------- STAFF ----------
-- Escrituras: admin (matriz "Editar/Crear/Eliminar personal" = solo admin).
drop policy if exists "Admin can manage staff" on public.staff;    -- duplicada
drop policy if exists "Admins can manage staff" on public.staff;   -- duplicada
drop policy if exists "staff write insert" on public.staff;
drop policy if exists "staff write update" on public.staff;
drop policy if exists "staff write delete" on public.staff;
create policy "staff write insert" on public.staff
  for insert to authenticated with check (public.has_permission('staff.create'));
create policy "staff write update" on public.staff
  for update to authenticated using (public.has_permission('staff.update'))
  with check (public.has_permission('staff.update'));
create policy "staff write delete" on public.staff
  for delete to authenticated using (public.has_permission('staff.delete'));

-- Lectura del módulo Personal por permiso (reemplaza can_view_personnel()).
-- Se CONSERVAN: "Authenticated staff can view active staff directory" (lookup de
-- nombres para asignaciones) y "Users can view their linked staff record".
drop policy if exists "Personnel viewers can read all staff" on public.staff;
drop policy if exists "staff read personnel" on public.staff;
create policy "staff read personnel" on public.staff
  for select to authenticated using (public.has_permission('staff.read'));

-- ---------- TIME_ENTRIES ----------
-- Propio (SELF) gateado por permiso + team (lectura para aprobación) + admin.
drop policy if exists "Admins can delete all time entries" on public.time_entries;
drop policy if exists "Staff can delete own time entries" on public.time_entries;
drop policy if exists "Staff can create own time entries" on public.time_entries;
drop policy if exists "Admins can view all time entries" on public.time_entries;
drop policy if exists "Staff can view own time entries" on public.time_entries;
drop policy if exists "Team can view engagement time entries" on public.time_entries;
drop policy if exists "Admins can update all time entries" on public.time_entries;
drop policy if exists "Staff can update own time entries" on public.time_entries;
drop policy if exists "time_entries read" on public.time_entries;
drop policy if exists "time_entries insert" on public.time_entries;
drop policy if exists "time_entries update" on public.time_entries;
drop policy if exists "time_entries delete" on public.time_entries;

create policy "time_entries read" on public.time_entries
  for select to authenticated
  using (
    public.is_admin()
    OR public.is_engagement_team_member(engagement_id)   -- managers ven el tiempo de su equipo (aprobación)
    OR (public.has_permission('time_entry.read') AND staff_id = public.get_my_staff_id())
  );
create policy "time_entries insert" on public.time_entries
  for insert to authenticated
  with check (public.has_permission('time_entry.create') AND staff_id = public.get_my_staff_id());
create policy "time_entries update" on public.time_entries
  for update to authenticated
  using (public.is_admin() OR (public.has_permission('time_entry.update') AND staff_id = public.get_my_staff_id()))
  with check (public.is_admin() OR (public.has_permission('time_entry.update') AND staff_id = public.get_my_staff_id()));
create policy "time_entries delete" on public.time_entries
  for delete to authenticated
  using (public.is_admin() OR (public.has_permission('time_entry.delete') AND staff_id = public.get_my_staff_id()));

-- ---------- TIMER_ENTRIES ----------
-- Cronómetro personal: propio, gateado por timer.use.
drop policy if exists "Staff can delete own timer entries" on public.timer_entries;
drop policy if exists "Staff can create own timer entries" on public.timer_entries;
drop policy if exists "Staff can view own timer entries" on public.timer_entries;
drop policy if exists "Staff can update own timer entries" on public.timer_entries;
drop policy if exists "timer_entries read" on public.timer_entries;
drop policy if exists "timer_entries insert" on public.timer_entries;
drop policy if exists "timer_entries update" on public.timer_entries;
drop policy if exists "timer_entries delete" on public.timer_entries;

create policy "timer_entries read" on public.timer_entries
  for select to authenticated
  using (public.has_permission('timer.use') AND staff_id = public.get_my_staff_id());
create policy "timer_entries insert" on public.timer_entries
  for insert to authenticated
  with check (public.has_permission('timer.use') AND staff_id = public.get_my_staff_id());
create policy "timer_entries update" on public.timer_entries
  for update to authenticated
  using (public.has_permission('timer.use') AND staff_id = public.get_my_staff_id())
  with check (public.has_permission('timer.use') AND staff_id = public.get_my_staff_id());
create policy "timer_entries delete" on public.timer_entries
  for delete to authenticated
  using (public.has_permission('timer.use') AND staff_id = public.get_my_staff_id());

-- =====================================================================
-- VALIDACIÓN (impersonando):
--  - staff/senior/etc.: crean/ven/editan SUS time_entries y timer; un manager ve
--    además el tiempo de su equipo; admin ve todo.
--  - roles sin Registros de Tiempo (Contabilidad/TH/Cobranzas): no crean ni ven time_entries.
--  - Personal: solo roles con staff.read ven el módulo completo; el directorio activo
--    (nombres) sigue visible para lookups; cada quien ve su propio registro.
-- (can_view_personnel/can_manage_* quedan sin uso -> limpiar en Fase 8.)
-- =====================================================================

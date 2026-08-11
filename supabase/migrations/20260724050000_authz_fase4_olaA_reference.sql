-- =====================================================================
-- Roles & Permisos — FASE 4, OLA A: tablas de referencia (escrituras por permiso)
-- Reemplaza las políticas de ESCRITURA (is_admin / can_manage_*) por has_permission
-- según la matriz. Las LECTURAS de baja sensibilidad quedan ABIERTAS a autenticados
-- (lookups; la visibilidad de página se hará en el frontend, Fase 5).
--
-- Requiere Fase 1 (catálogo + seed) aplicada. Idempotente. Mirror-del-mirror.
-- NO incluye: staff (lecturas delicadas), services/taxonomies (no están en la matriz).
-- =====================================================================

-- ---------- INDUSTRIAS (CRUD: admin) ----------
drop policy if exists "Admin can manage industries" on public.industries;
drop policy if exists "industries write insert" on public.industries;
drop policy if exists "industries write update" on public.industries;
drop policy if exists "industries write delete" on public.industries;
create policy "industries write insert" on public.industries
  for insert to authenticated with check (public.has_permission('industry.create'));
create policy "industries write update" on public.industries
  for update to authenticated using (public.has_permission('industry.update'))
  with check (public.has_permission('industry.update'));
create policy "industries write delete" on public.industries
  for delete to authenticated using (public.has_permission('industry.delete'));

-- ---------- CÓDIGOS DE ACTIVIDAD (CRUD: admin) ----------
drop policy if exists "Admins can manage activities" on public.activity_codes;
drop policy if exists "activity_codes write insert" on public.activity_codes;
drop policy if exists "activity_codes write update" on public.activity_codes;
drop policy if exists "activity_codes write delete" on public.activity_codes;
create policy "activity_codes write insert" on public.activity_codes
  for insert to authenticated with check (public.has_permission('activity_code.create'));
create policy "activity_codes write update" on public.activity_codes
  for update to authenticated using (public.has_permission('activity_code.update'))
  with check (public.has_permission('activity_code.update'));
create policy "activity_codes write delete" on public.activity_codes
  for delete to authenticated using (public.has_permission('activity_code.delete'));

-- ---------- TIPOS DE GASTO (CRUD: admin + Contabilidad) ----------
drop policy if exists "Admin can manage expense types" on public.expense_types;
drop policy if exists "expense_types write insert" on public.expense_types;
drop policy if exists "expense_types write update" on public.expense_types;
drop policy if exists "expense_types write delete" on public.expense_types;
create policy "expense_types write insert" on public.expense_types
  for insert to authenticated with check (public.has_permission('expense_type.create'));
create policy "expense_types write update" on public.expense_types
  for update to authenticated using (public.has_permission('expense_type.update'))
  with check (public.has_permission('expense_type.update'));
create policy "expense_types write delete" on public.expense_types
  for delete to authenticated using (public.has_permission('expense_type.delete'));

-- ---------- TARIFAS POR CATEGORÍA (categories) (CRUD: admin) ----------
-- Nota: la app muta categorías vía RPC SECURITY DEFINER (guardan is_admin);
-- esta política gatea las escrituras DIRECTAS a la tabla. La lectura sigue abierta
-- (rates se usan en presupuestos/dropdowns; el ocultamiento de tarifas por rol es
-- field-visibility del frontend, Fase 5).
drop policy if exists "Admin can manage categories" on public.categories;
drop policy if exists "categories write insert" on public.categories;
drop policy if exists "categories write update" on public.categories;
drop policy if exists "categories write delete" on public.categories;
create policy "categories write insert" on public.categories
  for insert to authenticated with check (public.has_permission('category_rate.create'));
create policy "categories write update" on public.categories
  for update to authenticated using (public.has_permission('category_rate.update'))
  with check (public.has_permission('category_rate.update'));
create policy "categories write delete" on public.categories
  for delete to authenticated using (public.has_permission('category_rate.delete'));

-- ---------- CONFIGURACIÓN GLOBAL (solo update: admin) ----------
drop policy if exists "Admin can manage global settings" on public.global_settings;
drop policy if exists "global_settings write" on public.global_settings;
create policy "global_settings write" on public.global_settings
  for all to authenticated
  using (public.has_permission('global_settings.update'))
  with check (public.has_permission('global_settings.update'));

-- ---------- FERIADOS (CRUD: admin + Talento Humano) ----------
drop policy if exists "Holiday managers can manage holidays" on public.holidays;
drop policy if exists "holidays write insert" on public.holidays;
drop policy if exists "holidays write update" on public.holidays;
drop policy if exists "holidays write delete" on public.holidays;
create policy "holidays write insert" on public.holidays
  for insert to authenticated with check (public.has_permission('holiday.create'));
create policy "holidays write update" on public.holidays
  for update to authenticated using (public.has_permission('holiday.update'))
  with check (public.has_permission('holiday.update'));
create policy "holidays write delete" on public.holidays
  for delete to authenticated using (public.has_permission('holiday.delete'));

-- ---------- COMPETENCIAS (skills) (lectura: matriz; CRUD: admin + TH) ----------
-- skills YA tenía lectura gateada (can_view_skills), así que la paso a permiso
-- (no la abro). Escritura: competency.*.
drop policy if exists "Skill viewers can read skills" on public.skills;
drop policy if exists "Skill managers can manage skills" on public.skills;
drop policy if exists "skills read" on public.skills;
drop policy if exists "skills write insert" on public.skills;
drop policy if exists "skills write update" on public.skills;
drop policy if exists "skills write delete" on public.skills;
create policy "skills read" on public.skills
  for select to authenticated using (public.has_permission('competency.read'));
create policy "skills write insert" on public.skills
  for insert to authenticated with check (public.has_permission('competency.create'));
create policy "skills write update" on public.skills
  for update to authenticated using (public.has_permission('competency.update'))
  with check (public.has_permission('competency.update'));
create policy "skills write delete" on public.skills
  for delete to authenticated using (public.has_permission('competency.delete'));

-- ---------- STAFF_SKILLS (asignación de competencias a personas = editar personal: admin) ----------
-- Lectura se mantiene abierta (se usa para mostrar competencias del staff).
drop policy if exists "Admins can manage staff skills" on public.staff_skills;
drop policy if exists "staff_skills write" on public.staff_skills;
create policy "staff_skills write" on public.staff_skills
  for all to authenticated
  using (public.has_permission('staff.update'))
  with check (public.has_permission('staff.update'));

-- =====================================================================
-- VALIDACIÓN (impersonando usuarios, ver Fase 2A):
--  - Un accounting_manager puede INSERT en expense_types; un senior no.
--  - Un hr_manager puede INSERT en holidays/skills; un manager no.
--  - Solo admin escribe industries/activity_codes/categories/global_settings.
--  - Lectura de industrias/códigos/tipos de gasto/feriados/categorías: cualquier autenticado.
--  - Lectura de skills: solo roles con competency.read.
-- Revisar que NO queden políticas viejas permisivas:
--   select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and tablename in
--   ('industries','activity_codes','expense_types','categories','global_settings','holidays','skills','staff_skills')
--   order by tablename, cmd;
-- =====================================================================

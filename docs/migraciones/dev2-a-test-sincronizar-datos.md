# Sincronizar datos de Dev 2.0 hacia Test

> Objetivo: traer a Test (`slkqdcwwvmjtcbakajib`) todo el **dato transaccional/de prueba** que
> hoy vive en Dev 2.0 (`oapgycqovzqsucliwbpu`) — clientes, encargos, work orders, timesheets,
> fund requests, staff de prueba, etc. — sin perder ni duplicar lo que la migración cero ya
> sembró en Test (catálogos + admin bootstrap). Pensado para repetirse en el sentido inverso
> el día que Dev 2.0 también se resetee desde cero (cerrar el ciclo, ver
> `bugs/migracion_cero/plan_v2.md` §7.4).

Ejecutar **siempre** desde `../EMS_Dev_Supabase/`, nunca desde este repo
(`aurora-engage-pro`) — ver `feedback-supabase-repo-split` en memoria del operador. Este
archivo solo documenta/versiona el script; correrlo es responsabilidad manual del operador.

## 0. Qué se trae y qué NO

**Se trae** (datos de prueba, tablas vacías en Test hoy):
`skills`, `staff` (menos el admin semilla), `clients`, `engagements`, `engagement_assignments`,
`work_orders`, `activity_worksheets`, `activity_worksheet_cells`, `fund_requests`,
`fund_request_work_orders`, `fund_request_expenses`, `timesheet_periods`, `time_entries`,
`timer_entries`, `timesheet_line_approvals`, `staff_skills`, `staff_alert_seen`,
`wo_budget_lines`, `wo_expense_budget`, `wo_payment_plan`, `wo_payment_installments`,
`wo_staffing_requirements`, `wo_staffing_requirement_skills`, `parametro`.

**NO se toca** (ya sembrado y verificado en Test por la migración cero — traerlo de nuevo
duplicaría o pisaría el seed curado): `practicas`, `categories`, `activity_codes`, `servicios`,
`industries`, `society`, `expense_types`, `authorization_roles`, `authorization_permissions`,
`authorization_role_permissions`, `global_settings`, `holidays`.

**NO se toca** (logs/artefactos, no son dato de prueba): `auth_login_attempts`,
`migration_run_log`, `user_lifecycle_audit_log`, `user_roles_backup_0220_56_20260224`.

**NO se toca** (auth): `auth.users`, `auth.identities`, `user_roles`. Decisión del operador
2026-08-24: el staff importado queda con `auth_user_id = NULL`; si alguien necesita loguearse
como uno de ellos, se crea el usuario a mano desde el dashboard de Test y se vincula por email
— mismo patrón que el admin semilla (plan §7.3).

## 1. La trampa de los IDs de catálogo

Los catálogos de Test se siembran con `INSERT ... ON CONFLICT (clave_natural) DO NOTHING`
(`cero_10`..`cero_12`) — sin ID explícito. Sus UUID (`practica_id`, `category_id`,
`activity_id`, `taxonomy_id`, `industry_id`, `society_id`, `expense_type_id`) son **frescos**,
generados en el orden del seed, no los mismos que tienen esas filas en Dev 2.0.

Las tablas transaccionales sí tienen sus propios UUID estables (PK `gen_random_uuid()`) — esos
**se preservan tal cual** al copiar (no hace falta remapearlos entre sí). Pero cualquier
columna que apunte a un catálogo (`staff.practica_id/category_id/society_id`,
`engagements.taxonomy_id/society_id`, `activity_worksheet_cells.category_id/activity_id`,
`engagement_assignments.category_id`, `time_entries/timer_entries/timesheet_line_approvals
.activity_id`, `wo_budget_lines/wo_staffing_requirements.category_id`,
`wo_expense_budget.expense_type_id`) necesita traducirse por clave natural (nombre/código),
no copiarse el UUID de origen.

Dev 2.0 todavía usa el vocabulario pre-rename (`services`/`taxonomies`, columna `service_id`)
— la Fase 3 del rename solo se aplicó al set consolidado de Test. El script de abajo importa
las tablas de Dev 2.0 con sus nombres reales (`services`, `taxonomies`) y traduce contra los
catálogos ya renombrados de Test (`practicas`, `servicios`).

## 2. Pre-flight (obligatorio)

1. `cat supabase/.temp/linked-project.json` → debe decir `"ref":"slkqdcwwvmjtcbakajib"` (Test).
   Si no: `supabase link --project-ref slkqdcwwvmjtcbakajib` y reverificar.
2. Cargar variables **solo** de `.env.migracion.local`; confirmar que `SUPABASE_DB_URL`
   contiene `slkqdcwwvmjtcbakajib`. Si contiene otro ref: **DETENERSE**.
3. Conseguir del dashboard de Supabase de **Dev 2.0** (`oapgycqovzqsucliwbpu`, Project Settings
   → Database → Connection string, modo *session* puerto 5432, no el pooler transaction 6543):
   host, usuario, password. No pegarlos en ningún archivo del repo — solo en la sesión de
   `psql` al correr el script (ver placeholders `<HOST_DEV2>` / `<USER_DEV2>` /
   `<PASSWORD_DEV2>` abajo).
4. Confirmación del operador de que el contenido actual de las 23 tablas transaccionales de
   Test (todas vacías salvo por el smoke manual de §7.3 del plan, si ya lo corriste) puede
   convivir con lo que se va a insertar. Si ya creaste a mano el Socio/Gerente de prueba de
   §7.3, este script los deja intactos (no borra nada, solo agrega).

## 3. Diagnóstico (solo lectura, correr antes del `BEGIN`)

Antes de comprometer nada, correr esto para detectar referencias que no van a poder
traducirse (p.ej. `activity_codes` legacy de Dev 2.0 que no sobrevivieron a la consolidación:
`PLN`/`FLD`/`REV`/`DOC`/`MTG`/`TRV`/`TRN`):

```sql
-- (con el puente FDW ya creado, ver bloque 0 abajo, antes del BEGIN de la carga real)
SELECT s.activity_code AS codigo_sin_match
FROM dev2_import.activity_codes s
LEFT JOIN public.activity_codes t ON t.activity_code = s.activity_code
WHERE t.activity_code IS NULL;
```

Si aparece algo, las filas de `time_entries`/`timer_entries`/`timesheet_line_approvals`/
`activity_worksheet_cells` que usan esos códigos van a quedar **excluidas** por los `JOIN`
del script (no fallan, se saltan) — revisar antes si eso es aceptable o si hay que mapear esos
códigos legacy a mano a su equivalente nuevo.

## 4. Script completo

```sql
-- ============================================================================
-- Sincronización de datos Dev 2.0 -> Test (solo tablas transaccionales)
-- Ejecutar conectado a Test, vía psql "$SUPABASE_DB_URL" -f este-archivo.sql
-- (o pegado a mano, bloque por bloque, la primera vez)
-- ============================================================================

-- ------------------------------------------------------------
-- 0. Puente de solo lectura a Dev 2.0 (se destruye al final, bloque 99)
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS dev2_srv
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '<HOST_DEV2>', port '5432', dbname 'postgres', sslmode 'require');

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
  SERVER dev2_srv
  OPTIONS (user '<USER_DEV2>', password '<PASSWORD_DEV2>');

CREATE SCHEMA IF NOT EXISTS dev2_import;

IMPORT FOREIGN SCHEMA public
  LIMIT TO (
    services, taxonomies, categories, activity_codes, industries, society, expense_types,
    skills, staff, clients, engagements, engagement_assignments, work_orders,
    activity_worksheets, activity_worksheet_cells, fund_requests, fund_request_work_orders,
    fund_request_expenses, timesheet_periods, time_entries, timer_entries,
    timesheet_line_approvals, staff_skills, staff_alert_seen, wo_budget_lines,
    wo_expense_budget, wo_payment_plan, wo_payment_installments, wo_staffing_requirements,
    wo_staffing_requirement_skills, parametro
  )
  FROM SERVER dev2_srv INTO dev2_import;

-- Correr acá el diagnóstico de la sección 3 antes de seguir.

-- ------------------------------------------------------------
-- Desde acá, todo en una transacción: si algo falla, no queda nada a medias.
-- ------------------------------------------------------------
BEGIN;

-- 1. skills (sin dependencias de catálogo)
INSERT INTO public.skills (skill_id, name, category, is_active, created_at, updated_at)
SELECT skill_id, name, category, is_active, created_at, updated_at
FROM dev2_import.skills
ON CONFLICT (skill_id) DO NOTHING;

-- 2. staff — traduce society_id/practica_id/category_id por clave natural; auth_user_id
--    siempre NULL. El admin semilla (Neil Graneros) YA existe en Test con otro staff_id
--    (sembrado por cero_14) — en vez de excluir su fila de Dev 2.0 (eso dejaría colgando
--    cualquier engagement/asignación que lo referencie como partner/manager/etc.), se trae
--    igual pero con email/CI modificados para no chocar con los 2 índices únicos parciales
--    (idx_staff_email_unique, idx_staff_id_number_unique). Queda como un segundo registro de
--    prueba de la misma persona, con su staff_id original de Dev 2.0 intacto — todas las FK
--    que ya lo referencian siguen funcionando sin tocar nada más.
INSERT INTO public.staff (
  staff_id, auth_user_id, first_name, last_name, email, category_id, is_active, created_at,
  updated_at, city, id_number, aud_reg_number, short_name, initials, deleted_at, hire_date,
  weekly_capacity_hours, termination_date, is_blocked, is_schedulable, society_id, practica_id,
  target_utilization_percent
)
SELECT
  s.staff_id, NULL, s.first_name, s.last_name,
  CASE WHEN lower(trim(s.email)) = 'neilgraneros@ruizmier.com' THEN 'neilgraneros2@ruizmier.com' ELSE s.email END,
  tc.category_id, s.is_active, s.created_at, s.updated_at, s.city,
  CASE WHEN lower(trim(s.email)) = 'neilgraneros@ruizmier.com' THEN NULL ELSE s.id_number END,
  s.aud_reg_number, s.short_name, s.initials,
  s.deleted_at, s.hire_date, s.weekly_capacity_hours, s.termination_date, s.is_blocked,
  s.is_schedulable, tso.society_id, tp.practica_id, s.target_utilization_percent
FROM dev2_import.staff s
LEFT JOIN dev2_import.society dso ON dso.society_id = s.society_id
LEFT JOIN dev2_import.services dse ON dse.service_id = s.service_id
LEFT JOIN dev2_import.categories dc ON dc.category_id = s.category_id
LEFT JOIN public.society tso ON tso.name = dso.name
LEFT JOIN public.practicas tp ON tp.abbreviation = dse.abbreviation
LEFT JOIN public.categories tc ON tc.practica_id = tp.practica_id AND tc.category_name = dc.category_name
ON CONFLICT (staff_id) DO NOTHING;

-- 3. clients — traduce industry_id
INSERT INTO public.clients (
  client_id, client_legal_name, unique_tax_id, industry_id, contact_name, contact_email,
  contact_phone, address, is_active, created_at, updated_at, created_by_staff_id
)
SELECT
  c.client_id, c.client_legal_name, c.unique_tax_id, ti.industry_id, c.contact_name,
  c.contact_email, c.contact_phone, c.address, c.is_active, c.created_at, c.updated_at,
  c.created_by_staff_id
FROM dev2_import.clients c
LEFT JOIN dev2_import.industries di ON di.industry_id = c.industry_id
LEFT JOIN public.industries ti ON (
  lower(trim(ti.industry_name)) = lower(trim(di.industry_name))
  OR (di.industry_name = 'Hidrocaburos' AND ti.industry_name = 'Hidrocarburos')
  OR (di.industry_name LIKE 'Miner%' AND ti.industry_name LIKE 'Miner%')
)
ON CONFLICT (client_id) DO NOTHING;

-- 4. engagements — traduce society_id y taxonomy_id (servicios); el resto son UUID de staff
--    ya copiados en el paso 2, se preservan tal cual
--
-- BUG 0828-185: engagements.society_id pasa a NOT NULL en el destino. Es dato de PRUEBA (Dev
-- 2.0 y Test, nunca producción), así que se corrige en origen antes del INSERT de abajo, igual
-- que cualquier otro dato de prueba incompleto — sin guarda adicional.
UPDATE dev2_import.engagements
   SET society_id = (SELECT society_id FROM dev2_import.society WHERE name = 'Ruizmier Pelaez S.R.L.')
 WHERE society_id IS NULL;

INSERT INTO public.engagements (
  engagement_id, client_id, engagement_name, engagement_code, partner_id, manager_id,
  start_date, end_date, status, created_at, updated_at, work_order_required,
  activity_required, is_internal, approval_required, oficina, practica, anio_fiscal, funcion,
  sqr_id, encargado_id, specialist_it_id, specialist_tax_id, fecha_cierre,
  anio_fiscal_override, contract_file_path, taxonomy_id, engagement_state_override,
  created_by_staff_id, society_id
)
SELECT
  e.engagement_id, e.client_id, e.engagement_name, e.engagement_code, e.partner_id,
  e.manager_id, e.start_date, e.end_date, e.status, e.created_at, e.updated_at,
  e.work_order_required, e.activity_required, e.is_internal, e.approval_required, e.oficina,
  e.practica, e.anio_fiscal, e.funcion, e.sqr_id, e.encargado_id, e.specialist_it_id,
  e.specialist_tax_id, e.fecha_cierre, e.anio_fiscal_override, e.contract_file_path,
  tt.taxonomy_id, e.engagement_state_override, e.created_by_staff_id, tso.society_id
FROM dev2_import.engagements e
LEFT JOIN dev2_import.society dso ON dso.society_id = e.society_id
LEFT JOIN dev2_import.taxonomies dt ON dt.taxonomy_id = e.taxonomy_id
LEFT JOIN public.society tso ON tso.name = dso.name
LEFT JOIN public.servicios tt ON lower(trim(tt.code)) = lower(trim(dt.code))
ON CONFLICT (engagement_id) DO NOTHING;

-- 5. engagement_assignments — traduce category_id
INSERT INTO public.engagement_assignments (
  assignment_id, engagement_id, staff_id, start_date, end_date, hours_per_week,
  allocation_percent, status, notes, requirement_id, deleted_at, created_at, updated_at,
  created_by, category_id
)
SELECT
  a.assignment_id, a.engagement_id, a.staff_id, a.start_date, a.end_date, a.hours_per_week,
  a.allocation_percent, a.status, a.notes, a.requirement_id, a.deleted_at, a.created_at,
  a.updated_at, a.created_by, tc.category_id
FROM dev2_import.engagement_assignments a
LEFT JOIN dev2_import.categories dc ON dc.category_id = a.category_id
LEFT JOIN dev2_import.services dse ON dse.service_id = dc.service_id
LEFT JOIN public.practicas tp ON tp.abbreviation = dse.abbreviation
LEFT JOIN public.categories tc ON tc.practica_id = tp.practica_id AND tc.category_name = dc.category_name
WHERE tc.category_id IS NOT NULL
ON CONFLICT (assignment_id) DO NOTHING;

-- 6. work_orders — sin catálogo, todo UUID de entidades ya copiadas
INSERT INTO public.work_orders (
  wo_id, engagement_id, currency, season_mode, tax_rate, adjustment_amount, notes,
  created_at, updated_at, approval_status, approved_by, approved_at, ceac_completed_at,
  ceac_notes, san_completed_at, san_notes, ceac_number, san_approval_id, risk_level,
  risk_status, risk_approved_by, risk_approved_at, risk_notes, emergency_deadline_at,
  emergency_justification, emergency_review_by, emergency_review_at, emergency_partner_by,
  emergency_partner_at
)
SELECT
  wo_id, engagement_id, currency, season_mode, tax_rate, adjustment_amount, notes,
  created_at, updated_at, approval_status, approved_by, approved_at, ceac_completed_at,
  ceac_notes, san_completed_at, san_notes, ceac_number, san_approval_id, risk_level,
  risk_status, risk_approved_by, risk_approved_at, risk_notes, emergency_deadline_at,
  emergency_justification, emergency_review_by, emergency_review_at, emergency_partner_by,
  emergency_partner_at
FROM dev2_import.work_orders
ON CONFLICT (wo_id) DO NOTHING;

-- 7. activity_worksheets — sin catálogo
INSERT INTO public.activity_worksheets (
  id, engagement_id, wo_id, version, status, notes, created_by_staff_id, created_at, updated_at
)
SELECT id, engagement_id, wo_id, version, status, notes, created_by_staff_id, created_at, updated_at
FROM dev2_import.activity_worksheets
ON CONFLICT (id) DO NOTHING;

-- 8. activity_worksheet_cells — traduce category_id y activity_id
INSERT INTO public.activity_worksheet_cells (
  id, worksheet_id, category_id, activity_id, budget_hours, created_at, updated_at
)
SELECT
  awc.id, awc.worksheet_id, tc.category_id, tac.activity_id, awc.budget_hours,
  awc.created_at, awc.updated_at
FROM dev2_import.activity_worksheet_cells awc
LEFT JOIN dev2_import.categories dc ON dc.category_id = awc.category_id
LEFT JOIN dev2_import.services dse ON dse.service_id = dc.service_id
LEFT JOIN public.practicas tp ON tp.abbreviation = dse.abbreviation
LEFT JOIN public.categories tc ON tc.practica_id = tp.practica_id AND tc.category_name = dc.category_name
LEFT JOIN dev2_import.activity_codes dac ON dac.activity_id = awc.activity_id
LEFT JOIN public.activity_codes tac ON tac.activity_code = dac.activity_code
WHERE tc.category_id IS NOT NULL AND tac.activity_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 9. fund_requests — sin catálogo
INSERT INTO public.fund_requests (
  fund_request_id, request_number, requester_staff_id, approver_manager_staff_id,
  total_requested_amount, currency, status, purpose, due_back_date, submitted_at,
  manager_decided_at, manager_notes, rejection_reason, created_at, updated_at,
  total_disbursed_amount, disbursed_at, disbursed_by_staff_id, accounting_notes, closed_at,
  settlement_total_spent, settlement_balance, settlement_iva_total, settlement_resolution,
  settlement_amount, settlement_notes, settled_at, settled_by_staff_id
)
SELECT
  fund_request_id, request_number, requester_staff_id, approver_manager_staff_id,
  total_requested_amount, currency, status, purpose, due_back_date, submitted_at,
  manager_decided_at, manager_notes, rejection_reason, created_at, updated_at,
  total_disbursed_amount, disbursed_at, disbursed_by_staff_id, accounting_notes, closed_at,
  settlement_total_spent, settlement_balance, settlement_iva_total, settlement_resolution,
  settlement_amount, settlement_notes, settled_at, settled_by_staff_id
FROM dev2_import.fund_requests
ON CONFLICT (fund_request_id) DO NOTHING;

-- 10. fund_request_work_orders — sin catálogo
INSERT INTO public.fund_request_work_orders (
  fr_wo_id, fund_request_id, wo_id, allocated_amount, created_at, manager_staff_id,
  approval_status, manager_notes, rejection_reason, manager_decided_at
)
SELECT
  fr_wo_id, fund_request_id, wo_id, allocated_amount, created_at, manager_staff_id,
  approval_status, manager_notes, rejection_reason, manager_decided_at
FROM dev2_import.fund_request_work_orders
ON CONFLICT (fr_wo_id) DO NOTHING;

-- 11. fund_request_expenses — traduce expense_type_id
INSERT INTO public.fund_request_expenses (
  fre_id, fund_request_id, wo_id, expense_type_id, expense_date, amount, currency,
  description, document_number, supplier_name, supplier_tax_id, attachment_url, status,
  submitted_at, manager_decided_at, manager_notes, rejection_reason, reviewed_at,
  reviewed_by_staff_id, has_invoice_observation, invoice_observation_notes,
  iva_penalty_amount, created_at, updated_at, expense_date_end, days, returned_by_assistant
)
SELECT
  fre.fre_id, fre.fund_request_id, fre.wo_id, tet.expense_type_id, fre.expense_date,
  fre.amount, fre.currency, fre.description, fre.document_number, fre.supplier_name,
  fre.supplier_tax_id, fre.attachment_url, fre.status, fre.submitted_at,
  fre.manager_decided_at, fre.manager_notes, fre.rejection_reason, fre.reviewed_at,
  fre.reviewed_by_staff_id, fre.has_invoice_observation, fre.invoice_observation_notes,
  fre.iva_penalty_amount, fre.created_at, fre.updated_at, fre.expense_date_end, fre.days,
  fre.returned_by_assistant
FROM dev2_import.fund_request_expenses fre
LEFT JOIN dev2_import.expense_types det ON det.expense_type_id = fre.expense_type_id
LEFT JOIN public.expense_types tet ON lower(trim(tet.expense_name)) = lower(trim(det.expense_name))
ON CONFLICT (fre_id) DO NOTHING;

-- 12. timesheet_periods — sin catálogo
INSERT INTO public.timesheet_periods (
  period_id, staff_id, week_start_date, week_number, year, deadline, is_period_locked,
  total_hours, submitted_at, created_at, updated_at
)
SELECT
  period_id, staff_id, week_start_date, week_number, year, deadline, is_period_locked,
  total_hours, submitted_at, created_at, updated_at
FROM dev2_import.timesheet_periods
ON CONFLICT (period_id) DO NOTHING;

-- 13. time_entries — traduce activity_id
INSERT INTO public.time_entries (
  time_id, date_worked, hours_logged, staff_id, engagement_id, activity_id, description,
  created_at, updated_at, period_id, is_forecast
)
SELECT
  te.time_id, te.date_worked, te.hours_logged, te.staff_id, te.engagement_id, tac.activity_id,
  te.description, te.created_at, te.updated_at, te.period_id, te.is_forecast
FROM dev2_import.time_entries te
LEFT JOIN dev2_import.activity_codes dac ON dac.activity_id = te.activity_id
LEFT JOIN public.activity_codes tac ON tac.activity_code = dac.activity_code
WHERE tac.activity_id IS NOT NULL
ON CONFLICT (time_id) DO NOTHING;

-- 14. timer_entries — traduce activity_id
INSERT INTO public.timer_entries (
  timer_id, staff_id, engagement_id, activity_id, description, started_at, ended_at,
  duration_minutes, is_imported, imported_to_time_id, created_at, has_explicit_times
)
SELECT
  t.timer_id, t.staff_id, t.engagement_id, tac.activity_id, t.description, t.started_at,
  t.ended_at, t.duration_minutes, t.is_imported, t.imported_to_time_id, t.created_at,
  t.has_explicit_times
FROM dev2_import.timer_entries t
LEFT JOIN dev2_import.activity_codes dac ON dac.activity_id = t.activity_id
LEFT JOIN public.activity_codes tac ON tac.activity_code = dac.activity_code
WHERE tac.activity_id IS NOT NULL
ON CONFLICT (timer_id) DO NOTHING;

-- 15. timesheet_line_approvals — traduce activity_id
INSERT INTO public.timesheet_line_approvals (
  approval_id, period_id, engagement_id, status, approved_by, approved_at, review_notes,
  created_at, updated_at, activity_id
)
SELECT
  a.approval_id, a.period_id, a.engagement_id, a.status, a.approved_by, a.approved_at,
  a.review_notes, a.created_at, a.updated_at, tac.activity_id
FROM dev2_import.timesheet_line_approvals a
LEFT JOIN dev2_import.activity_codes dac ON dac.activity_id = a.activity_id
LEFT JOIN public.activity_codes tac ON tac.activity_code = dac.activity_code
WHERE tac.activity_id IS NOT NULL
ON CONFLICT (approval_id) DO NOTHING;

-- 16. staff_skills — sin catálogo (skill_id ya es UUID de entidad, copiado en el paso 1)
INSERT INTO public.staff_skills (
  staff_skill_id, staff_id, skill_id, proficiency_level, last_evaluated_date, created_at, updated_at
)
SELECT staff_skill_id, staff_id, skill_id, proficiency_level, last_evaluated_date, created_at, updated_at
FROM dev2_import.staff_skills
ON CONFLICT (staff_skill_id) DO NOTHING;

-- 17. staff_alert_seen — sin catálogo
INSERT INTO public.staff_alert_seen (id, staff_id, entity_id, alert_type, seen_at)
SELECT id, staff_id, entity_id, alert_type, seen_at
FROM dev2_import.staff_alert_seen
ON CONFLICT (id) DO NOTHING;

-- 18. wo_budget_lines — traduce category_id
INSERT INTO public.wo_budget_lines (wo_line_id, wo_id, category_id, budgeted_hours, standard_rate, created_at)
SELECT wbl.wo_line_id, wbl.wo_id, tc.category_id, wbl.budgeted_hours, wbl.standard_rate, wbl.created_at
FROM dev2_import.wo_budget_lines wbl
LEFT JOIN dev2_import.categories dc ON dc.category_id = wbl.category_id
LEFT JOIN dev2_import.services dse ON dse.service_id = dc.service_id
LEFT JOIN public.practicas tp ON tp.abbreviation = dse.abbreviation
LEFT JOIN public.categories tc ON tc.practica_id = tp.practica_id AND tc.category_name = dc.category_name
WHERE tc.category_id IS NOT NULL
ON CONFLICT (wo_line_id) DO NOTHING;

-- 19. wo_expense_budget — traduce expense_type_id
INSERT INTO public.wo_expense_budget (wo_exp_id, wo_id, expense_type_id, budgeted_amount, created_at)
SELECT web.wo_exp_id, web.wo_id, tet.expense_type_id, web.budgeted_amount, web.created_at
FROM dev2_import.wo_expense_budget web
LEFT JOIN dev2_import.expense_types det ON det.expense_type_id = web.expense_type_id
LEFT JOIN public.expense_types tet ON lower(trim(tet.expense_name)) = lower(trim(det.expense_name))
WHERE tet.expense_type_id IS NOT NULL
ON CONFLICT (wo_exp_id) DO NOTHING;

-- 20. wo_payment_plan — sin catálogo
INSERT INTO public.wo_payment_plan (plan_id, wo_id, exchange_rate, payment_days, created_at, updated_at)
SELECT plan_id, wo_id, exchange_rate, payment_days, created_at, updated_at
FROM dev2_import.wo_payment_plan
ON CONFLICT (plan_id) DO NOTHING;

-- 21. wo_payment_installments — sin catálogo
INSERT INTO public.wo_payment_installments (
  installment_id, plan_id, wo_id, installment_number, agreed_invoice_date,
  agreed_payment_date, collection_invoice_date, collection_payment_date, payment_date_actual,
  percentage, amount, status, created_at, updated_at
)
SELECT
  installment_id, plan_id, wo_id, installment_number, agreed_invoice_date,
  agreed_payment_date, collection_invoice_date, collection_payment_date, payment_date_actual,
  percentage, amount, status, created_at, updated_at
FROM dev2_import.wo_payment_installments
ON CONFLICT (installment_id) DO NOTHING;

-- 22. wo_staffing_requirements — traduce category_id
INSERT INTO public.wo_staffing_requirements (id, wo_id, category_id, staff_count, created_at, updated_at)
SELECT wsr.id, wsr.wo_id, tc.category_id, wsr.staff_count, wsr.created_at, wsr.updated_at
FROM dev2_import.wo_staffing_requirements wsr
LEFT JOIN dev2_import.categories dc ON dc.category_id = wsr.category_id
LEFT JOIN dev2_import.services dse ON dse.service_id = dc.service_id
LEFT JOIN public.practicas tp ON tp.abbreviation = dse.abbreviation
LEFT JOIN public.categories tc ON tc.practica_id = tp.practica_id AND tc.category_name = dc.category_name
WHERE tc.category_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 23. wo_staffing_requirement_skills — sin catálogo (skill_id ya copiado en el paso 1)
INSERT INTO public.wo_staffing_requirement_skills (id, requirement_id, skill_id, min_proficiency_level, created_at)
SELECT id, requirement_id, skill_id, min_proficiency_level, created_at
FROM dev2_import.wo_staffing_requirement_skills
ON CONFLICT (id) DO NOTHING;

-- 24. parametro — tabla suelta, sin FKs entrantes ni salientes
INSERT INTO public.parametro (id, nombre, periodo, date_begin, date_end, valor, descripcion, created_at, tipo)
SELECT id, nombre, periodo, date_begin, date_end, valor, descripcion, created_at, tipo
FROM dev2_import.parametro
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 25. Sequences: fund_request_number_seq es la única sequence que participa
--     (request_number ya viaja con valor, pero el trigger solo lo genera si es
--     NULL — avanzar la sequence evita choques futuros con un FR-2026-XXXX ya usado)
-- ------------------------------------------------------------
SELECT setval(
  'public.fund_request_number_seq',
  GREATEST(
    (SELECT COALESCE(MAX(NULLIF(regexp_replace(request_number, '\D', '', 'g'), '')::int), 0)
     FROM public.fund_requests),
    1
  )
);

COMMIT;

-- ============================================================================
-- 99. Cleanup del puente (siempre, haya salido bien o no la carga)
-- ============================================================================
DROP SERVER dev2_srv CASCADE;
DROP SCHEMA IF EXISTS dev2_import CASCADE;
```

## 5. Verificación post-carga

- `SELECT count(*) FROM public.staff;` — debe ser 1 (admin) + los de Dev 2.0 traídos.
- Revisar filas excluidas por falta de match: repetir el diagnóstico de la sección 3 para
  `categories`/`servicios`/`industries`/`society`/`expense_types` (mismo patrón de `LEFT JOIN
  ... WHERE t.x IS NULL` contra `dev2_import`) **antes** de correr el bloque 99 — una vez
  destruido el puente no se puede re-diagnosticar sin recrearlo.
- Login con el admin semilla, abrir Clientes/Encargos/Timesheets y confirmar que aparece el
  dataset de Dev 2.0.
- Crear usuarios nuevos vinculando por email a los `staff` que necesiten loguearse (dashboard
  de Test → Add user, mismo email que su fila de `staff` — el trigger `handle_new_user` los
  vincula y les asigna `assistant`; reasignar `role_key` real desde administración de usuarios).

## 6. Para cerrar el ciclo (Test → Dev 2.0, después del reset de Dev 2.0)

El día que Dev 2.0 se resetee desde cero con el mismo set consolidado (`docs/migraciones/reset-desde-cero.md`),
Dev 2.0 pasa a tener el mismo vocabulario renombrado (`practicas`/`servicios`) que Test — en
ese momento este script se vuelve casi trivial en el otro sentido: no hace falta traducir
`service_id`→`practica_id` (ya no existe esa columna en ningún lado), solo la traducción por
clave natural sigue siendo necesaria si los dos catálogos se sembraron por separado y sus
UUID no coinciden. Adaptar los nombres de `FROM`/`LIMIT TO` del bloque 0 (origen = Test,
destino = Dev 2.0) y los `JOIN` de catálogo del resto del script.

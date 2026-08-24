# Cerrar el ciclo: resetear Dev 2.0 y repoblarlo con los datos de Test

> Para cuando el equipo decida que Dev 2.0 también pasa al esquema consolidado de la
> migración cero. Dos pasos secuenciales, cada uno con su propio runbook. Este documento es
> el índice/checklist que los encadena — no repite el detalle de cada uno.

**Quién puede ejecutar esto**: cualquier miembro del equipo con acceso al dashboard de
Supabase de Dev 2.0 y de Test. No hace falta haber vivido la migración cero — los dos
runbooks referenciados están escritos para eso.

**Es destructivo sobre Dev 2.0** — el paso 1 borra todo su contenido actual. No lo actives
sin que alguien (el operador/lead del proyecto) lo haya decidido explícitamente para ese
momento — mismo criterio que ya aplica `reset-desde-cero.md`.

## Paso 1 — Reset de Dev 2.0 desde cero

Seguir **[`docs/migraciones/reset-desde-cero.md`](./reset-desde-cero.md)** completo (secciones
1 a 7), apuntando al proyecto de **Dev 2.0**, no a Test:

```bash
supabase/tests/local/reset-desde-cero.sh \
  --project-ref oapgycqovzqsucliwbpu \
  --env-file <ruta-al-.env-con-las-credenciales-públicas-de-Dev-2.0>
```

Al terminar, Dev 2.0 queda con el mismo esquema renombrado (`practicas`/`servicios`,
`practica_id`) y el mismo seed de catálogos + admin bootstrap que tiene Test hoy — pero
**vacío de dato transaccional** (sin clientes, encargos, timesheets, etc.). Ese es justamente
el hueco que llena el paso 2.

No sigas al paso 2 hasta que el checklist post-reset (§7 de `reset-desde-cero.md`) esté
verde y hayas activado al admin del seed con una contraseña real.

## Paso 2 — Sincronizar datos Test → Dev 2.0

Mismo problema que resolvió **[`dev2-a-test-sincronizar-datos.md`](./dev2-a-test-sincronizar-datos.md)**
(léelo primero — ahí está el razonamiento completo: por qué los catálogos no se tocan, por
qué las FK de staff necesitan cuidado, y los 3 hallazgos reales de la primera corrida), pero
en sentido inverso y **más simple**, porque ahora los dos ambientes ya comparten el mismo
vocabulario post-rename (no hace falta traducir `service_id`→`practica_id`: los dos lados ya
se llaman `practica_id`).

### Qué NO cambia respecto al procedimiento original

- Se trae **todo lo transaccional** (mismas 24 tablas), se **excluyen los catálogos**
  (`practicas`, `categories`, `activity_codes`, `servicios`, `industries`, `society`,
  `expense_types`, `authorization_*`, `global_settings`, `holidays` — Dev 2.0 ya los sembró
  frescos en el paso 1) y los logs/artefactos.
- Los catálogos de Dev 2.0 y Test se sembraron **por separado** (`cero_10..16` corrió en cada
  proyecto de forma independiente) → sus UUID **no coinciden** aunque el contenido sea
  idéntico. Sigue haciendo falta traducir por clave natural (código/nombre), igual que antes.
- Dev 2.0 (destino, recién reseteado) tiene su propio admin bootstrap
  (`neilgraneros@ruizmier.com`, otro `staff_id`). Test (origen) tiene, a esta altura, **tres**
  candidatos a chocar por email/CI: su propio admin bootstrap, y el "Neil de prueba"
  (`neilgraneros2@ruizmier.com`) que trajimos de Dev 2.0 la vez pasada — este último se copia
  normal, sin conflicto. El que hay que tratar especial es el admin bootstrap **de Test**: se
  trae igual (para no dejar colgando FK de encargos que lo referencien como partner/manager/
  etc.), pero con el email/CI modificados — mismo patrón que la vez pasada, ver el bloque de
  `staff` más abajo.

### Qué SÍ cambia (más simple)

- No hace falta la tabla intermedia `services`/`taxonomies` con nombre viejo: el origen
  (Test) ya tiene `practicas`/`servicios` con las columnas `practica_id` finales. Los `JOIN`
  de traducción de catálogo se acortan (un salto menos por tabla).
- Revisar antes de correr: si entre esta sincronización y la anterior el esquema cambió
  (nuevas columnas, nuevas tablas), este script adaptado puede haber quedado desactualizado
  — comparar contra `docs/database-schema.sql` vigente en ese momento, no asumir que es
  idéntico a hoy.

### Pre-flight

Igual que la vez pasada, pero invertido:

1. Conectarte por `psql` a **Dev 2.0** (destino) — verificar que `supabase/.temp/linked-project.json`
   diga `oapgycqovzqsucliwbpu` antes de tocar nada.
2. Conseguir el connection string de **Test** (`slkqdcwwvmjtcbakajib`, ahora el origen de
   solo lectura) desde su dashboard → Project Settings → Database → Session pooler.

### Script (adaptado — origen Test, destino Dev 2.0)

```sql
-- ============================================================================
-- Sincronización de datos Test -> Dev 2.0 (cierre del ciclo, post-reset de Dev 2.0)
-- Ejecutar conectado a Dev 2.0, con el puente FDW apuntando a Test.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS test_srv
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '<HOST_TEST>', port '5432', dbname 'postgres', sslmode 'require');

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
  SERVER test_srv
  OPTIONS (user '<USER_TEST>', password '<PASSWORD_TEST>');

CREATE SCHEMA IF NOT EXISTS test_import;

IMPORT FOREIGN SCHEMA public
  LIMIT TO (
    practicas, servicios, categories, activity_codes, industries, society, expense_types,
    skills, staff, clients, engagements, engagement_assignments, work_orders,
    activity_worksheets, activity_worksheet_cells, fund_requests, fund_request_work_orders,
    fund_request_expenses, timesheet_periods, time_entries, timer_entries,
    timesheet_line_approvals, staff_skills, staff_alert_seen, wo_budget_lines,
    wo_expense_budget, wo_payment_plan, wo_payment_installments, wo_staffing_requirements,
    wo_staffing_requirement_skills, parametro
  )
  FROM SERVER test_srv INTO test_import;

-- Diagnóstico previo (repetir el patrón de la sección 3 de dev2-a-test-sincronizar-datos.md
-- para activity_codes/categories/servicios/industries/society/expense_types, ahora
-- comparando test_import.* contra public.* de Dev 2.0). No asumir que sale limpio.

INSERT INTO public.skills (skill_id, name, category, is_active, created_at, updated_at)
SELECT skill_id, name, category, is_active, created_at, updated_at
FROM test_import.skills
ON CONFLICT (skill_id) DO NOTHING;

-- staff — traduce society_id/practica_id/category_id por clave natural; auth_user_id
-- siempre NULL. El admin bootstrap DE TEST se trae igual pero con email/CI modificados
-- (mismo motivo que la vez pasada: no dejar colgando FK de quien lo referencia como
-- partner/manager/created_by/etc.) — ajustá el email de reemplazo si "neilgraneros2" ya
-- está en uso por otro motivo en ese momento.
INSERT INTO public.staff (
  staff_id, auth_user_id, first_name, last_name, email, category_id, is_active, created_at,
  updated_at, city, id_number, aud_reg_number, short_name, initials, deleted_at, hire_date,
  weekly_capacity_hours, termination_date, is_blocked, is_schedulable, society_id, practica_id,
  target_utilization_percent
)
SELECT
  s.staff_id, NULL, s.first_name, s.last_name,
  CASE WHEN lower(trim(s.email)) = 'neilgraneros@ruizmier.com' THEN 'neilgraneros-test@ruizmier.com' ELSE s.email END,
  tc.category_id, s.is_active, s.created_at, s.updated_at, s.city,
  CASE WHEN lower(trim(s.email)) = 'neilgraneros@ruizmier.com' THEN NULL ELSE s.id_number END,
  s.aud_reg_number, s.short_name, s.initials,
  s.deleted_at, s.hire_date, s.weekly_capacity_hours, s.termination_date, s.is_blocked,
  s.is_schedulable, tso.society_id, tp.practica_id, s.target_utilization_percent
FROM test_import.staff s
LEFT JOIN test_import.society dso ON dso.society_id = s.society_id
LEFT JOIN test_import.practicas dpr ON dpr.practica_id = s.practica_id
LEFT JOIN test_import.categories dc ON dc.category_id = s.category_id
LEFT JOIN public.society tso ON tso.name = dso.name
LEFT JOIN public.practicas tp ON tp.abbreviation = dpr.abbreviation
LEFT JOIN public.categories tc ON tc.practica_id = tp.practica_id AND tc.category_name = dc.category_name
ON CONFLICT (staff_id) DO NOTHING;

INSERT INTO public.clients (
  client_id, client_legal_name, unique_tax_id, industry_id, contact_name, contact_email,
  contact_phone, address, is_active, created_at, updated_at, created_by_staff_id
)
SELECT
  c.client_id, c.client_legal_name, c.unique_tax_id, ti.industry_id, c.contact_name,
  c.contact_email, c.contact_phone, c.address, c.is_active, c.created_at, c.updated_at,
  c.created_by_staff_id
FROM test_import.clients c
LEFT JOIN test_import.industries di ON di.industry_id = c.industry_id
LEFT JOIN public.industries ti ON lower(trim(ti.industry_name)) = lower(trim(di.industry_name))
ON CONFLICT (client_id) DO NOTHING;

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
FROM test_import.engagements e
LEFT JOIN test_import.society dso ON dso.society_id = e.society_id
LEFT JOIN test_import.servicios dt ON dt.taxonomy_id = e.taxonomy_id
LEFT JOIN public.society tso ON tso.name = dso.name
LEFT JOIN public.servicios tt ON lower(trim(tt.code)) = lower(trim(dt.code))
ON CONFLICT (engagement_id) DO NOTHING;

INSERT INTO public.engagement_assignments (
  assignment_id, engagement_id, staff_id, start_date, end_date, hours_per_week,
  allocation_percent, status, notes, requirement_id, deleted_at, created_at, updated_at,
  created_by, category_id
)
SELECT
  a.assignment_id, a.engagement_id, a.staff_id, a.start_date, a.end_date, a.hours_per_week,
  a.allocation_percent, a.status, a.notes, a.requirement_id, a.deleted_at, a.created_at,
  a.updated_at, a.created_by, tc.category_id
FROM test_import.engagement_assignments a
LEFT JOIN test_import.categories dc ON dc.category_id = a.category_id
LEFT JOIN test_import.practicas dpr ON dpr.practica_id = dc.practica_id
LEFT JOIN public.practicas tp ON tp.abbreviation = dpr.abbreviation
LEFT JOIN public.categories tc ON tc.practica_id = tp.practica_id AND tc.category_name = dc.category_name
WHERE tc.category_id IS NOT NULL
ON CONFLICT (assignment_id) DO NOTHING;

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
FROM test_import.work_orders
ON CONFLICT (wo_id) DO NOTHING;

INSERT INTO public.activity_worksheets (
  id, engagement_id, wo_id, version, status, notes, created_by_staff_id, created_at, updated_at
)
SELECT id, engagement_id, wo_id, version, status, notes, created_by_staff_id, created_at, updated_at
FROM test_import.activity_worksheets
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.activity_worksheet_cells (
  id, worksheet_id, category_id, activity_id, budget_hours, created_at, updated_at
)
SELECT
  awc.id, awc.worksheet_id, tc.category_id, tac.activity_id, awc.budget_hours,
  awc.created_at, awc.updated_at
FROM test_import.activity_worksheet_cells awc
LEFT JOIN test_import.categories dc ON dc.category_id = awc.category_id
LEFT JOIN test_import.practicas dpr ON dpr.practica_id = dc.practica_id
LEFT JOIN public.practicas tp ON tp.abbreviation = dpr.abbreviation
LEFT JOIN public.categories tc ON tc.practica_id = tp.practica_id AND tc.category_name = dc.category_name
LEFT JOIN test_import.activity_codes dac ON dac.activity_id = awc.activity_id
LEFT JOIN public.activity_codes tac ON tac.activity_code = dac.activity_code
WHERE tc.category_id IS NOT NULL AND tac.activity_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

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
FROM test_import.fund_requests
ON CONFLICT (fund_request_id) DO NOTHING;

INSERT INTO public.fund_request_work_orders (
  fr_wo_id, fund_request_id, wo_id, allocated_amount, created_at, manager_staff_id,
  approval_status, manager_notes, rejection_reason, manager_decided_at
)
SELECT
  fr_wo_id, fund_request_id, wo_id, allocated_amount, created_at, manager_staff_id,
  approval_status, manager_notes, rejection_reason, manager_decided_at
FROM test_import.fund_request_work_orders
ON CONFLICT (fr_wo_id) DO NOTHING;

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
FROM test_import.fund_request_expenses fre
LEFT JOIN test_import.expense_types det ON det.expense_type_id = fre.expense_type_id
LEFT JOIN public.expense_types tet ON lower(trim(tet.expense_name)) = lower(trim(det.expense_name))
ON CONFLICT (fre_id) DO NOTHING;

INSERT INTO public.timesheet_periods (
  period_id, staff_id, week_start_date, week_number, year, deadline, is_period_locked,
  total_hours, submitted_at, created_at, updated_at
)
SELECT
  period_id, staff_id, week_start_date, week_number, year, deadline, is_period_locked,
  total_hours, submitted_at, created_at, updated_at
FROM test_import.timesheet_periods
ON CONFLICT (period_id) DO NOTHING;

INSERT INTO public.time_entries (
  time_id, date_worked, hours_logged, staff_id, engagement_id, activity_id, description,
  created_at, updated_at, period_id, is_forecast
)
SELECT
  te.time_id, te.date_worked, te.hours_logged, te.staff_id, te.engagement_id, tac.activity_id,
  te.description, te.created_at, te.updated_at, te.period_id, te.is_forecast
FROM test_import.time_entries te
LEFT JOIN test_import.activity_codes dac ON dac.activity_id = te.activity_id
LEFT JOIN public.activity_codes tac ON tac.activity_code = dac.activity_code
WHERE tac.activity_id IS NOT NULL
ON CONFLICT (time_id) DO NOTHING;

INSERT INTO public.timer_entries (
  timer_id, staff_id, engagement_id, activity_id, description, started_at, ended_at,
  duration_minutes, is_imported, imported_to_time_id, created_at, has_explicit_times
)
SELECT
  t.timer_id, t.staff_id, t.engagement_id, tac.activity_id, t.description, t.started_at,
  t.ended_at, t.duration_minutes, t.is_imported, t.imported_to_time_id, t.created_at,
  t.has_explicit_times
FROM test_import.timer_entries t
LEFT JOIN test_import.activity_codes dac ON dac.activity_id = t.activity_id
LEFT JOIN public.activity_codes tac ON tac.activity_code = dac.activity_code
WHERE tac.activity_id IS NOT NULL
ON CONFLICT (timer_id) DO NOTHING;

INSERT INTO public.timesheet_line_approvals (
  approval_id, period_id, engagement_id, status, approved_by, approved_at, review_notes,
  created_at, updated_at, activity_id
)
SELECT
  a.approval_id, a.period_id, a.engagement_id, a.status, a.approved_by, a.approved_at,
  a.review_notes, a.created_at, a.updated_at, tac.activity_id
FROM test_import.timesheet_line_approvals a
LEFT JOIN test_import.activity_codes dac ON dac.activity_id = a.activity_id
LEFT JOIN public.activity_codes tac ON tac.activity_code = dac.activity_code
WHERE tac.activity_id IS NOT NULL
ON CONFLICT (approval_id) DO NOTHING;

INSERT INTO public.staff_skills (
  staff_skill_id, staff_id, skill_id, proficiency_level, last_evaluated_date, created_at, updated_at
)
SELECT staff_skill_id, staff_id, skill_id, proficiency_level, last_evaluated_date, created_at, updated_at
FROM test_import.staff_skills
ON CONFLICT (staff_skill_id) DO NOTHING;

INSERT INTO public.staff_alert_seen (id, staff_id, entity_id, alert_type, seen_at)
SELECT id, staff_id, entity_id, alert_type, seen_at
FROM test_import.staff_alert_seen
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.wo_budget_lines (wo_line_id, wo_id, category_id, budgeted_hours, standard_rate, created_at)
SELECT wbl.wo_line_id, wbl.wo_id, tc.category_id, wbl.budgeted_hours, wbl.standard_rate, wbl.created_at
FROM test_import.wo_budget_lines wbl
LEFT JOIN test_import.categories dc ON dc.category_id = wbl.category_id
LEFT JOIN test_import.practicas dpr ON dpr.practica_id = dc.practica_id
LEFT JOIN public.practicas tp ON tp.abbreviation = dpr.abbreviation
LEFT JOIN public.categories tc ON tc.practica_id = tp.practica_id AND tc.category_name = dc.category_name
WHERE tc.category_id IS NOT NULL
ON CONFLICT (wo_line_id) DO NOTHING;

INSERT INTO public.wo_expense_budget (wo_exp_id, wo_id, expense_type_id, budgeted_amount, created_at)
SELECT web.wo_exp_id, web.wo_id, tet.expense_type_id, web.budgeted_amount, web.created_at
FROM test_import.wo_expense_budget web
LEFT JOIN test_import.expense_types det ON det.expense_type_id = web.expense_type_id
LEFT JOIN public.expense_types tet ON lower(trim(tet.expense_name)) = lower(trim(det.expense_name))
WHERE tet.expense_type_id IS NOT NULL
ON CONFLICT (wo_exp_id) DO NOTHING;

INSERT INTO public.wo_payment_plan (plan_id, wo_id, exchange_rate, payment_days, created_at, updated_at)
SELECT plan_id, wo_id, exchange_rate, payment_days, created_at, updated_at
FROM test_import.wo_payment_plan
ON CONFLICT (plan_id) DO NOTHING;

INSERT INTO public.wo_payment_installments (
  installment_id, plan_id, wo_id, installment_number, agreed_invoice_date,
  agreed_payment_date, collection_invoice_date, collection_payment_date, payment_date_actual,
  percentage, amount, status, created_at, updated_at
)
SELECT
  installment_id, plan_id, wo_id, installment_number, agreed_invoice_date,
  agreed_payment_date, collection_invoice_date, collection_payment_date, payment_date_actual,
  percentage, amount, status, created_at, updated_at
FROM test_import.wo_payment_installments
ON CONFLICT (installment_id) DO NOTHING;

INSERT INTO public.wo_staffing_requirements (id, wo_id, category_id, staff_count, created_at, updated_at)
SELECT wsr.id, wsr.wo_id, tc.category_id, wsr.staff_count, wsr.created_at, wsr.updated_at
FROM test_import.wo_staffing_requirements wsr
LEFT JOIN test_import.categories dc ON dc.category_id = wsr.category_id
LEFT JOIN test_import.practicas dpr ON dpr.practica_id = dc.practica_id
LEFT JOIN public.practicas tp ON tp.abbreviation = dpr.abbreviation
LEFT JOIN public.categories tc ON tc.practica_id = tp.practica_id AND tc.category_name = dc.category_name
WHERE tc.category_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.wo_staffing_requirement_skills (id, requirement_id, skill_id, min_proficiency_level, created_at)
SELECT id, requirement_id, skill_id, min_proficiency_level, created_at
FROM test_import.wo_staffing_requirement_skills
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.parametro (id, nombre, periodo, date_begin, date_end, valor, descripcion, created_at, tipo)
SELECT id, nombre, periodo, date_begin, date_end, valor, descripcion, created_at, tipo
FROM test_import.parametro
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  'public.fund_request_number_seq',
  GREATEST(
    (SELECT COALESCE(MAX(NULLIF(regexp_replace(request_number, '\D', '', 'g'), '')::int), 0)
     FROM public.fund_requests),
    1
  )
);

-- Cleanup
DROP SERVER test_srv CASCADE;
DROP SCHEMA IF EXISTS test_import CASCADE;
```

**Nota sobre la transacción**: en la corrida real (Dev 2.0 → Test) el `BEGIN;`/`COMMIT;` que
envolvía todo esto no quedó activo como transacción explícita — cada `INSERT` se confirmó
individualmente vía autocommit, y no fue un problema porque nada falló. Si preferís la
garantía de "todo o nada", envolvé el bloque en `BEGIN;` / `COMMIT;` y confirmá que el prompt
de `psql` muestre `=*>` (transacción abierta) antes de seguir — si sigue mostrando `=>`, no
está activa y un fallo a mitad de camino no se revierte solo.

### Verificación

Mismo patrón que la vez pasada — contar filas clave y loguearte a probar la app:

```sql
SELECT
  (SELECT count(*) FROM public.staff) AS staff,
  (SELECT count(*) FROM public.clients) AS clients,
  (SELECT count(*) FROM public.engagements) AS engagements,
  (SELECT count(*) FROM public.work_orders) AS work_orders,
  (SELECT count(*) FROM public.time_entries) AS time_entries,
  (SELECT count(*) FROM public.fund_requests) AS fund_requests;
```

## Registro de ejecuciones

| Fecha | Dirección | Resultado |
|---|---|---|
| 2026-08-24 | Dev 2.0 → Test | Éxito. 66 staff, 51 clients, 92 engagements, 55 work_orders, 13 time_entries, 41 fund_requests. Ver `dev2-a-test-sincronizar-datos.md`. |
| _(pendiente)_ | Test → Dev 2.0 | — |

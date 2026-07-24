# Changelog — 2026-07-23

This entry is an audit backfill for functional changes already integrated into
development. The audited ref is development@eaf6728. The previous changelog
present on that branch is CHANGELOG-2026-04-30.md (landed by PR #46,
commit fce9b80). Scheduler changelogs dated 2026-05-06 through 2026-07-19
remain on the Scheduler line and are intentionally not copied here.

The entries below are limited to the directed backfill agreed for this audit.
Other functional merges after the April baseline are listed as residual
documentation debt in docs/AUDIT_REPORT_260723.md.

---

## feat/0526-122 — PR #218 — Departmental holidays and office-scoped pending hours

### Summary

Adds office scope to holidays (Todas, La Paz, and Santa Cruz), restores
departmental holiday generation, and makes holiday approval validation depend on
the staff member's city and the actual dates in the timesheet. Pending-hours
queries and copy-to-current-week now apply the same office scope. Settings and
holiday forms expose the office field, while the generator and weekly hint keep
national and departmental holidays distinct.

### Files Changed

Principal files include src/lib/boliviaHolidays.ts,
src/hooks/useHolidays.ts, src/hooks/useTimesheetMutations.ts,
src/hooks/mutations/useHolidayMutations.ts, HolidayForm.tsx,
HolidaysManager.tsx, Settings.tsx, TimeSheet.tsx, the English and Spanish
locales, and supabase/functions/test-resubmission-state/index.ts. The merge
also regenerated the Supabase type surface as part of the migration workflow.

### Migrations / Backend Changes

- supabase/migrations/20260716000000_0526-122_holiday_office_scope.sql
- supabase/migrations/20260717000000_0526-122_scope_pending_hours_by_office.sql
- submit_timesheet_safe and the pending-hours functions now enforce the
  office-aware behavior described above.

### Tests

The PR records coverage in boliviaHolidays.test.ts,
useHolidays.test.tsx, useGenerateNationalHolidays.test.ts,
HolidayForm.test.tsx, HolidaysManager.replicate.test.tsx,
TimeSheet.holiday-hint.test.tsx, useCopyToCurrentWeek.officeScope.test.tsx,
useTimesheetMutations.test.tsx, submitApprovalRequired.test.ts, and
Settings.holidayEngagement.test.tsx. The test-resubmission-state edge test
includes valid holiday auto-approval, mixed-line pending behavior, and
cross-office non-blocking cases. No new audit-time test run is attributed to
this historical PR.

### Integration Status

Integrated into development by merge 24e0dad on 2026-07-21. The current
development head eaf6728 contains the merge.

### Deploy Requirements

Run the Lovable prompt Apply pending Supabase migrations before relying on the
new database behavior. Because test-resubmission-state was edited, deploy it
with Deploy the test-resubmission-state edge function when that function is
used by the target environment. Frontend and locale changes sync normally.

### Traceability

- Branch: feat/0526-122
- Base: development@01f0d39
- Commit: 24e0dad — Merge pull request #218 from sruizmier/feat/0526-122
- PR: #218

---

## fix/0306-78 — direct development hotfix

### Summary

Adds the Limpiar Riesgos action for Draft work orders and the Ninguno risk
level option. The change also keeps the corresponding English and Spanish
labels available to the WorkOrder form.

### Files Changed

- src/components/forms/WorkOrderForm.tsx
- src/locales/en.json
- src/locales/es.json

### Migrations / Backend Changes

None.

### Tests

The direct commit contains no recorded test command or result. A targeted
WorkOrderForm regression check remains the appropriate follow-up if the flow is
changed again.

### Integration Status

Integrated directly into development as commit 94a6b7a on 2026-07-22, after the
01f0d39 integration point.

### Deploy Requirements

Frontend and locale changes sync normally. No Lovable migration or Edge
Function deployment is required.

### Traceability

- Branch: fix/0306-78
- Base: development@01f0d39
- Commit: 94a6b7a — fix(0306-78): :zap: hotfix - mostrar botón Limpiar Riesgos en Draft y agregar opción Ninguno en Nivel de Riesgo
- PR: Direct commit; no PR number

---

## feat/0625-150-plan-pagos — PR #196 — Work-order payment plans

### Summary

Adds payment-plan management to work orders: installment dates, percentages,
calculated amounts, business-day payment dates, collection status transitions,
overdue alerts, and dirty-state protection while editing. The UI supports
multi-currency values and the existing bilingual conventions.

### Files Changed

Principal files include WorkOrderPaymentPlanSection.tsx,
useWorkOrderPaymentPlanMutations.ts, workOrderPaymentPlan.ts,
WorkOrderNew.tsx, WorkOrderEdit.tsx, WorkOrderForm.tsx,
src/types/workOrderPaymentPlan.ts, locales/en.json, locales/es.json, and
docs/database-schema.sql.

### Migrations / Backend Changes

- supabase/migrations/20260626000000_wo_payment_plan.sql
- Adds the wo_payment_plan and wo_payment_installments schema, policies, and
  supporting constraints.

### Tests

The merge includes WorkOrderPaymentPlanSection.test.tsx and
workOrderPaymentPlan.test.ts. The PR metadata does not provide a complete
historical command/result summary, so no current test run is attributed to
PR #196.

### Integration Status

Integrated into development by merge a4d3181 on 2026-07-09.

### Deploy Requirements

Run Apply pending Supabase migrations in Lovable Cloud. No Edge Function was
changed. Frontend and locale changes sync normally.

### Traceability

- Branch: feat/0625-150-plan-pagos
- Base: development@008e767
- Commit: a4d3181 — Merge pull request #196 from sruizmier/feat/0625-150-plan-pagos
- PR: #196

---

## feat/0625-151-contrato-escaneado — PR #204

### Summary

Adds a required scanned contract for external client engagements, limited to a
single private PDF of up to 5 MB. The form uploads before engagement creation,
links the file after creation, and exposes controlled download behavior for
authorized engagement team members.

### Files Changed

Principal files include src/components/forms/EngagementForm.tsx,
src/hooks/mutations/useEngagementMutations.ts,
src/hooks/useEmsData.ts, the English and Spanish locales, and
docs/database-schema.sql.

### Migrations / Backend Changes

- supabase/migrations/20260702000001_add_engagement_contract_file.sql
- supabase/migrations/20260703010000_link_contract_in_create_engagement_rpc.sql
- Adds the private storage bucket, column, and storage policies.

### Tests

The PR records 13 contract-file tests in
EngagementForm.contractFile.test.tsx and locale-key coverage in
i18n.keys.test.ts. The PR also reports tests and build green after integration
with the closing-date feature.

### Integration Status

Integrated into development by merge 176f8fa on 2026-07-09.

### Deploy Requirements

Run Apply pending Supabase migrations in Lovable Cloud before enabling the
storage-backed behavior. Frontend and locale changes sync normally.

### Traceability

- Branch: feat/0625-151-contrato-escaneado
- Base: development@09520a2
- Commit: 176f8fa — Merge pull request #204 from sruizmier/feat/0625-151-contrato-escaneado
- PR: #204

---

## feat/0602-134-fecha-inicio — PR #203

### Summary

Separates the automatic creation date from the editable engagement start date.
New engagements default their start date to today, administrators may select
any valid start date, and the form displays creation date as read-only. The
integrated follow-up hotfix dbed93a removes the obsolete immutable creation-date
field behavior; it is patch-equivalent to branch commit c8cc84a.

### Files Changed

- src/components/forms/EngagementForm.tsx
- src/locales/en.json
- src/locales/es.json
- src/components/forms/__tests__/EngagementForm.test.tsx
- src/components/forms/__tests__/EngagementForm.creationDate.test.tsx
- src/hooks/mutations/useEngagementMutations.ts

### Migrations / Backend Changes

PR #203 updates the shared
supabase/migrations/20260703000000_engagement_fiscal_year_update_guard.sql.
The migration was introduced in the adjacent closing-date work documented
below; this entry records only the delta carried by PR #203.

### Tests

The PR reports tests and build green and includes the creation-date and
EngagementForm suites. The possible unrelated manager edit-loading issue was
recorded in the PR metadata and is not attributed to this feature.

### Integration Status

Integrated by merge 09520a2 on 2026-07-09. Commit dbed93a was applied directly
after PR #204 and is included here because its patch is equivalent to c8cc84a
on the same feature line.

### Deploy Requirements

Apply pending Supabase migrations in Lovable Cloud if the shared guard delta is
not already applied. No Edge Function was changed.

### Traceability

- Branch: feat/0602-134-fecha-inicio
- Base: development@e60967a
- Commit: 09520a2 — Merge pull request #203 from sruizmier/feat/0602-134-fecha-inicio
- Follow-up: dbed93a — hotfix: :ambulance: descartar el campo de fecha de creación inmutable del formulario EngagementForm
- PR: #203

---

## feat/0604-143 — PR #201 — Closing date and fiscal-year override

### Summary

Derives fiscal year from an explicit engagement closing date, adds a controlled
administrator override, and updates the form, table, validation, localized
labels, and RPC payload. The feature replaces ambiguous fixed closing-date
labels with dated upcoming options and protects persisted overrides during
non-admin edits.

### Files Changed

Principal files include src/lib/fiscalCalculations.ts,
src/components/forms/EngagementForm.tsx,
src/hooks/mutations/useEngagementMutations.ts,
src/hooks/useEmsData.ts,
src/components/clients/ClientEngagementsTable.tsx, the English and Spanish
locales, and supabase/functions/test-resubmission-state/index.ts.

### Migrations / Backend Changes

- supabase/migrations/20260702000000_add_closing_date_to_engagements.sql
- supabase/migrations/20260703000000_engagement_fiscal_year_update_guard.sql
- The shared fiscal-year guard is later updated by PR #203; the two entries
  describe their respective effective deltas.

### Tests

The PR specifies targeted Vitest coverage for fiscalCalculations,
EngagementForm.code-generation, useEngagementMutations, locale parity, and
ClientEngagementsTable.closingDate, followed by npm run build. Metadata records
the test plan but not a complete command/result transcript.

### Integration Status

Integrated by merge 9419c5a on 2026-07-09.

### Deploy Requirements

Run Apply pending Supabase migrations and, because
test-resubmission-state was edited, deploy it with Deploy the
test-resubmission-state edge function when applicable.

### Traceability

- Branch: feat/0604-143
- Base: development@008e767
- Commit: 9419c5a — Merge pull request #201 from sruizmier/feat/0604-143
- PR: #201

---

## feat/0702-152 — PR #202 — Service-scoped categories

### Summary

Converts categories from a global catalog to service-scoped categories with
service-specific ordering, category movement, copy-between-services behavior,
and validation of referenced categories. Settings receives service filtering
and administration controls; the worksheet filter remains visual and does not
change persisted cells or work-order totals.

### Files Changed

Principal files include src/hooks/useEmsData.ts,
src/hooks/mutations/useCategoryMutations.ts, CategoryForm.tsx,
Settings.tsx, WorksheetEdit.tsx, the English and Spanish locales, and the
category SQL test.

### Migrations / Backend Changes

- supabase/migrations/20260702000000_service_scoped_categories.sql
- supabase/migrations/20260703000000_service_scoped_categories_fixes.sql
- Adds service-scoped constraints and category create/update/move/copy/delete
  RPCs with the associated security guards.

### Tests

The PR reports all targeted tests green and lists coverage in useEmsData,
useCategoryMutations, CategoryForm.service, Settings.category-rates-form,
serviceScopedCategoriesSql, and WorksheetEdit.service-filter. Manual
post-deploy flows were still listed as pending in the PR.

### Integration Status

Integrated by merge b0c57b8 on 2026-07-09.

### Deploy Requirements

Run Apply pending Supabase migrations. Regenerate the generated Supabase types
through the managed workflow after applying them; do not hand-edit
src/integrations/supabase/types.ts. Frontend and locale changes sync normally.

### Traceability

- Branch: feat/0702-152
- Base: development@008e767
- Commit: b0c57b8 — Merge pull request #202 from sruizmier/feat/0702-152
- PR: #202

---

## feat/0513-114 — PR #199 — Service-linked activity codes

### Summary

Adds service-linked activity codes, service abbreviations, generated code
ordering, activation/deactivation and reactivation controls, and service-aware
activity filtering in Timesheet and Tracker. It also restores the permitted
admin unsubmit path and preserves global activities as a fallback.

### Files Changed

Principal files include ActivityCodeForm.tsx, ServiceForm.tsx,
useActivityCodeMutations.ts, useServiceMutations.ts, useEmsData.ts,
activityFilters.ts, TimesheetGrid.tsx, TrackerBar.tsx, WorksheetGrid.tsx,
Settings.tsx, and the English and Spanish locales.

### Migrations / Backend Changes

- supabase/migrations/20260629000000_0513_114_service_activity_codes.sql
- supabase/migrations/20260630160000_0513_114_reorder_reactivate.sql
- supabase/migrations/20260630170000_cascade_abbreviation_rename.sql
- The adjacent 20260630000000_unsubmit_allow_admin.sql migration is not
  created by this merge; it is referenced as related history and is not counted
  twice here.

### Tests

The merge changes ActivityCodeForm, ServiceForm, useActivityCodeMutations,
useEmsData, activityFilters, and Settings test suites. No complete historical
command/result transcript was recoverable from the PR metadata.

### Integration Status

Integrated by merge d565661 on 2026-07-09.

### Deploy Requirements

Run Apply pending Supabase migrations in Lovable Cloud. Frontend and locale
changes sync normally.

### Traceability

- Branch: feat/0513-114
- Base: development@008e767
- Commit: d565661 — Merge pull request #199 from sruizmier/feat/0513-114
- PR: #199

---

## fix/0625-148 — PR #195 — Role-scoped service selection

### Summary

Restricts the service selector to Auditoría for non-admin users, protects the
selector while the role is loading, and expands engagement creation permission
to Gerente and SQR. The form preserves the correct service when creating
another engagement and avoids falsely dirtying the form.

### Files Changed

- src/components/forms/EngagementForm.tsx
- src/components/clients/ClientEngagementsTable.tsx
- src/pages/EngagementNew.tsx
- src/pages/Engagements.tsx
- src/components/forms/__tests__/EngagementForm.servicesCatalog.test.tsx
- src/pages/__tests__/Engagements.create-permissions.test.tsx

### Migrations / Backend Changes

None.

### Tests

The PR records five new 0625-148 scenarios covering non-admin locking,
Auditoría auto-selection, code preview, admin access, and create-another
behavior. It also records 18/18 passing permission tests.

### Integration Status

Integrated by merge e60967a on 2026-07-09.

### Deploy Requirements

Frontend-only change; no Lovable migration or Edge Function deployment is
required.

### Traceability

- Branch: fix/0625-148
- Base: development@9419c5a
- Commit: e60967a — Merge pull request #195 from sruizmier/fix/0625-148
- PR: #195

---

## feat/0602-135-136 — direct merge without numbered PR

### Summary

Integrates the engagement taxonomies catalog, engagement-status and rejection
resubmission behavior, fund-request submit gating, and the related form,
dashboard, import, work-order, and settings surfaces. Existing tests were
updated for the combined 135/136 taxonomy and engagement-state contracts.

### Files Changed

Principal files include EngagementForm.tsx, TaxonomyCombobox.tsx,
TaxonomyForm.tsx, useEmsData.ts, useEngagementMutations.ts,
useTaxonomyMutations.ts, engagementStatus.ts, Engagements.tsx, Settings.tsx,
WorkOrderEdit.tsx, the English and Spanish locales, and the associated
taxonomy, status, import, and work-order test suites.

### Migrations / Backend Changes

- supabase/migrations/20260707000000_create_taxonomies_catalog.sql
- supabase/migrations/20260714000000_estado_encargo_0602-135.sql
- supabase/migrations/20260715000000_fund_request_submit_state_gate_0602-135.sql
- src/integrations/supabase/types.ts was regenerated as part of the integrated
  schema change and must remain managed/generated.

### Tests

The merge includes TaxonomyForm, taxonomy mutation, engagement-status,
settings-taxonomy, engagement-form, approved-engagements, import/export, and
work-order regression coverage. No standalone command/result transcript was
recorded for this unnumbered merge.

### Integration Status

Integrated into development by merge 01f0d39 on 2026-07-17. The first parent
was development@352dbc4; the second parent was the 0602-135-136 feature line.

### Deploy Requirements

Run Apply pending Supabase migrations in Lovable Cloud and regenerate managed
Supabase types through that workflow. No Edge Function source changed.

### Traceability

- Branch: feat/0602-135-136
- Base: development@352dbc4
- Commit: 01f0d39 — Merge pull request from sruizmier/feat/0602-135-136
- PR: No numbered PR in the merge history

---

## fix/0714-154 — PR #231 — Worksheet service scope and atomic saves

### Summary

Derives the worksheet service from engagement.practica, filters categories and
activities to that service while retaining global activities, and removes the
manual service filter. Save and copy flows defensively discard out-of-scope
cells. The follow-up fixes make worksheet saves atomic, prevent data loss when
services or activities are unavailable, resync only affected work orders, and
block work-order creation when no service is assigned.

### Files Changed

Principal files include src/pages/WorksheetEdit.tsx,
src/hooks/useWorksheetData.ts, src/hooks/useWorksheetMutations.ts,
src/components/worksheet/CopyFromEngagementDialog.tsx, the English and Spanish
locales, WorksheetEdit and copy-flow tests, and the worksheet-list permission
tests.

### Migrations / Backend Changes

- supabase/migrations/20260719000000_0714_154_worksheet_service_scope.sql
- The migration cleans existing out-of-scope cells and adds the
  enforce_worksheet_cell_service_scope trigger. An audit count must be
  performed before applying it because inconsistent cells are deleted.

### Tests

The PR specifies Vitest coverage for WorksheetEdit, worksheet copy behavior,
activity filtering, and activityFilters, followed by npm run build and npm run
lint. The merge metadata does not provide a complete command/result transcript.

### Integration Status

Integrated by merge eaf6728 on 2026-07-22 and present at the audited
development head.

### Deploy Requirements

Before deployment, run the migration's audit count in the target environment,
then run Apply pending Supabase migrations in Lovable Cloud. Frontend and locale
changes sync normally.

### Traceability

- Branch: fix/0714-154
- Base: development@01f0d39
- Commit: eaf6728 — Merge pull request #231 from sruizmier/fix/0714-154
- PR: #231

---

## Backfill scope and evidence note

This file documents the directed set of integrated branches only. It does not
retroactively claim that every functional merge since 2026-04-30 has a
dedicated entry. The remaining undocumented merges, and the Scheduler branches
that are outside development, are enumerated in
docs/AUDIT_REPORT_260723.md for follow-up.

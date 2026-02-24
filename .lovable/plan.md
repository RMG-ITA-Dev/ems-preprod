# Plan: 260222 v3 Debug Session Closure -- Audit Remediation

**Plan Version**: v3 (iterates from v2 baseline)  
**Context**: Closing the 260222 Debug Session. All code changes are documentation + build-fix only. No database migrations. No frontend logic changes.

---

## v3 Delta from v2

1. **Execution order changed**: Schema doc (F2) now runs BEFORE changelog fix (F3), because the changelog references schema completeness claims. This prevents docs contradiction.
2. **Function naming consistency**: Doc references `link_auth_user_to_staff()` (the live DB function name), NOT `link_staff_to_auth_user()` (the trigger on `staff` table). Both exist in the live DB with different purposes. The DoD now checks actual live function names/signatures.
3. **Reconciliation checklist added**: Schema doc rewrite is validated against two authoritative sources -- `supabase-tables` (live DB introspection from useful context) and `src/integrations/supabase/types.ts` (auto-generated types). No manual inference.
4. **Non-regression gate added to DoD**: "No object appears in `types.ts` that is absent from `docs/database-schema.sql` for core public schema entities (tables/functions/enums touched in session)." Gate uses an explicit exclusion list for operational/backup tables to avoid false positives from migration artifacts.
5. **Changelog tail**: Since the canonical uploaded file could not be parsed from the upload, the missing content will be restored from the v13 plan's changelog section (which was the authoritative source used to write the entry). Lines 2600-2603 will be replaced: remove `</initial_code>` artifact and the empty lines.

---

## 1) PROBLEMS TO FIX


| ID  | Priority | Problem                                                                                            | Evidence                                   |
| --- | -------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| F1  | P0       | Build error: `error` is `unknown` in catch block                                                   | `manage-auth-user/index.ts:123` -- TS18046 |
| F2  | P0       | `docs/database-schema.sql` severely outdated (Generated: 2026-01-27) -- missing 15+ schema objects | Audit Report; live DB vs doc comparison    |
| F3  | P1       | Stale `</initial_code>` tag at line 2603 of changelog                                              | `docs/CHANGELOG-2026-02-22.md` line 2603   |


---

## 2) TASK 1: Fix Edge Function Build Error (F1)

**File**: `supabase/functions/manage-auth-user/index.ts`  
**Lines**: 121-125

**Current code** (line 121-125):

```typescript
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, code: "INTERNAL_ERROR", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

```

**Fix** (type guard, not blind cast):

```typescript
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, code: "INTERNAL_ERROR", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

```

---

## 3) TASK 2: Regenerate `docs/database-schema.sql` (F2)

Full rewrite of the file, validated against two authoritative sources.

### Reconciliation Checklist

Each item below was confirmed present in the live DB (via `supabase-tables` context) AND/OR `src/integrations/supabase/types.ts`. Items marked [MISSING] are absent from current doc.

#### 3.1 Enums


| Enum Value       | In Live DB | In types.ts | In Current Doc | Action |
| ---------------- | ---------- | ----------- | -------------- | ------ |
| `sqr`            | Yes        | Yes         | [MISSING]      | ADD    |
| `specialist_it`  | Yes        | Yes         | [MISSING]      | ADD    |
| `specialist_tax` | Yes        | Yes         | [MISSING]      | ADD    |


#### 3.2 Tables


| Table                      | In Live DB | In types.ts | In Current Doc | Action |
| -------------------------- | ---------- | ----------- | -------------- | ------ |
| `holidays`                 | Yes        | Yes         | [MISSING]      | ADD    |
| `user_lifecycle_audit_log` | Yes        | Yes         | [MISSING]      | ADD    |
| `migration_run_log`        | Yes        | Yes         | [MISSING]      | ADD    |


Note: Backup tables (`_backup_orphan_*`, `user_roles_backup_*`) are intentionally excluded as operational artifacts.

#### 3.3 Missing/Changed Columns


| Table           | Column                                              | In Live DB | In Doc    | Action |
| --------------- | --------------------------------------------------- | ---------- | --------- | ------ |
| `categories`    | `default_app_role app_role`                         | Yes        | [MISSING] | ADD    |
| `staff`         | `hire_date DATE`                                    | Yes        | [MISSING] | ADD    |
| `staff`         | `termination_date DATE`                             | Yes        | [MISSING] | ADD    |
| `staff`         | `deleted_at TIMESTAMPTZ`                            | Yes        | [MISSING] | ADD    |
| `timer_entries` | `has_explicit_times BOOLEAN NOT NULL DEFAULT true`  | Yes        | [MISSING] | ADD    |
| `engagements`   | `work_order_required BOOLEAN NOT NULL DEFAULT true` | Yes        | [MISSING] | ADD    |
| `engagements`   | `activity_required BOOLEAN NOT NULL DEFAULT true`   | Yes        | [MISSING] | ADD    |
| `engagements`   | `is_internal BOOLEAN NOT NULL DEFAULT false`        | Yes        | [MISSING] | ADD    |
| `expense_logs`  | `created_by_staff_id UUID`                          | Yes        | [MISSING] | ADD    |
| `work_orders`   | `ceac_completed_at DATE`                            | Yes        | [MISSING] | ADD    |
| `work_orders`   | `san_completed_at DATE`                             | Yes        | [MISSING] | ADD    |
| `work_orders`   | `ceac_notes TEXT`                                   | Yes        | [MISSING] | ADD    |
| `work_orders`   | `san_notes TEXT`                                    | Yes        | [MISSING] | ADD    |


#### 3.4 Constraint Changes


| Object                                 | Current Doc                                             | Live DB              | Action                           |
| -------------------------------------- | ------------------------------------------------------- | -------------------- | -------------------------------- |
| `user_roles` unique                    | `UNIQUE(user_id, role)` (implicit, no constraint shown) | `UNIQUE(user_id)`    | UPDATE to show `UNIQUE(user_id)` |
| `timer_entries.imported_to_time_id` FK | Default ON DELETE                                       | `ON DELETE SET NULL` | UPDATE                           |


#### 3.5 Missing Functions/RPCs

All confirmed present in live DB via `db-functions` context:


| Function                                             | Live Name (exact)                        | In Current Doc | Action |
| ---------------------------------------------------- | ---------------------------------------- | -------------- | ------ |
| `admin_set_user_role(uuid, app_role, text)`          | `admin_set_user_role`                    | [MISSING]      | ADD    |
| `submit_timesheet_safe(uuid, uuid, uuid[], boolean)` | `submit_timesheet_safe`                  | [MISSING]      | ADD    |
| `get_week_statuses(uuid, date, date)`                | `get_week_statuses`                      | [MISSING]      | ADD    |
| `get_my_pending_hours(uuid)`                         | `get_my_pending_hours`                   | [MISSING]      | ADD    |
| `check_pending_hours_before_termination(uuid, date)` | `check_pending_hours_before_termination` | [MISSING]      | ADD    |
| `get_approvable_pairs(uuid[], uuid[])`               | `get_approvable_pairs`                   | [MISSING]      | ADD    |
| `reset_timer_import_on_unlink()`                     | `reset_timer_import_on_unlink`           | [MISSING]      | ADD    |
| `enforce_termination_date()`                         | `enforce_termination_date`               | [MISSING]      | ADD    |
| `prevent_staff_reactivation()`                       | `prevent_staff_reactivation`             | [MISSING]      | ADD    |
| `validate_submission_has_entries()`                  | `validate_submission_has_entries`        | [MISSING]      | ADD    |
| `enforce_activity_default()`                         | `enforce_activity_default`               | [MISSING]      | ADD    |
| `enforce_holiday_blocking()`                         | `enforce_holiday_blocking`               | [MISSING]      | ADD    |
| `start_timer_entry(uuid, uuid, text)`                | `start_timer_entry`                      | [MISSING]      | ADD    |
| `stop_timer_entry(uuid, timestamptz)`                | `stop_timer_entry`                       | [MISSING]      | ADD    |
| `finalize_my_stale_timers()`                         | `finalize_my_stale_timers`               | [MISSING]      | ADD    |
| `finalize_all_stale_timers()`                        | `finalize_all_stale_timers`              | [MISSING]      | ADD    |
| `validate_timer_entry_duration()`                    | `validate_timer_entry_duration`          | [MISSING]      | ADD    |
| `prevent_imported_timer_delete()`                    | `prevent_imported_timer_delete`          | [MISSING]      | ADD    |
| `link_staff_to_auth_user()`                          | `link_staff_to_auth_user`                | [MISSING]      | ADD    |
| `protect_approved_time_entries()`                    | `protect_approved_time_entries`          | [MISSING]      | ADD    |
| `handle_new_user()`                                  | `handle_new_user`                        | [MISSING]      | ADD    |


#### 3.6 Stale Functions to UPDATE


| Function                    | Doc Version (lines) | Issue                                                                    | Live Version               |
| --------------------------- | ------------------- | ------------------------------------------------------------------------ | -------------------------- |
| `link_auth_user_to_staff()` | Lines 860-876       | Missing `is_active = true`, `deleted_at` guard, `lower(trim())` matching | Updated version in live DB |
| `check_wo_approved()`       | Lines 891-907       | Missing `work_order_required` bypass                                     | Updated version in live DB |


#### 3.7 Missing RLS / Grants


| Object                     | What to Add                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `holidays`                 | RLS enabled + 4 policies (admin INSERT/UPDATE/DELETE, authenticated SELECT)        |
| `user_lifecycle_audit_log` | RLS enabled + admin SELECT policy                                                  |
| `user_lifecycle_audit_log` | REVOKE INSERT/UPDATE/DELETE from anon, authenticated; GRANT INSERT to service_role |


#### 3.8 Header

- Change `Generated: 2026-01-27` to `Generated: 2026-02-24`

---

## 4) TASK 3: Fix Changelog (F3)

**File**: `docs/CHANGELOG-2026-02-22.md`

**Action**: Remove lines 2601-2603 (two empty lines + `</initial_code>` artifact). The v13 changelog entry content at lines 2570-2600 is complete and matches the v13 plan's changelog section. No content reconstruction needed -- only artifact removal.

---

## 5) EXECUTION ORDER

1. **Task 1** (F1) -- Fix `manage-auth-user` catch typing (unblocks deployment, 2 lines)
2. **Task 2** (F2) -- Regenerate `docs/database-schema.sql` (schema before changelog per CODEX amendment)
3. **Task 3** (F3) -- Fix changelog artifact (remove `</initial_code>`)

---

## 6) OUT OF SCOPE

- No database migrations (schema is already correct in the live DB)
- No frontend logic changes
- No new features
- No RLS policy changes (all correct in live DB already)
- Backup tables (`_backup_*`, `user_roles_backup_*`) excluded from schema doc intentionally

---

## 7) DEFINITION OF DONE

### Build

- `manage-auth-user/index.ts` compiles without TS18046 (type guard pattern, not blind cast)

### Schema Doc Completeness (reconciled against live DB + types.ts)

- Header reads `Generated: 2026-02-24`
- `app_role` enum includes all 11 values: admin, staff, viewer, partner, director, manager, senior, semisenior, sqr, specialist_it, specialist_tax
- Tables `holidays`, `user_lifecycle_audit_log`, `migration_run_log` present
- `categories.default_app_role` column present
- `staff.hire_date`, `staff.termination_date`, `staff.deleted_at` columns present
- `timer_entries.has_explicit_times` column present
- `engagements.work_order_required`, `engagements.activity_required`, `engagements.is_internal` columns present
- `expense_logs.created_by_staff_id` column present
- `work_orders.ceac_completed_at`, `san_completed_at`, `ceac_notes`, `san_notes` columns present
- `user_roles` shows `UNIQUE(user_id)` constraint (not `UNIQUE(user_id, role)`)
- `timer_entries.imported_to_time_id` shows `ON DELETE SET NULL`
- All 21 missing functions added with exact live DB names/signatures
- `link_auth_user_to_staff()` updated to match live version (with `deleted_at` guard, `lower(trim())`, `is_active = true`)
- `check_wo_approved()` updated to match live version (with `work_order_required` bypass)
- `holidays` RLS policies present (4 policies)
- `user_lifecycle_audit_log` RLS + REVOKE/GRANT present

### Function Naming Consistency

- Doc uses `link_auth_user_to_staff()` for the auth.users trigger function (exact live name)
- Doc uses `link_staff_to_auth_user()` for the staff table trigger function (exact live name)
- No function name in doc that does not match its live DB name

### Non-Regression Gate

- Every table in `types.ts` Database.public.Tables has a corresponding CREATE TABLE in `docs/database-schema.sql`, **excluding** tables matching the explicit exclusion list below.
- Every function in `types.ts` Database.public.Functions has a corresponding CREATE FUNCTION in `docs/database-schema.sql`
- Every enum value in `types.ts` Database.public.Enums.app_role appears in the CREATE TYPE statement

#### Exclusion List (operational/backup tables)

The following table name patterns are excluded from the non-regression gate to avoid false positives from migration artifacts. This list is the single source of truth and must stay aligned with the "Out of Scope" section (§6).


| Pattern               | Reason                             |
| --------------------- | ---------------------------------- |
| `_backup_orphan_*`    | Orphan-cleanup migration artifacts |
| `user_roles_backup_*` | Role-migration snapshots           |


**False-positive guard**: If a new table matching `_backup_*` or `user_roles_backup_*` appears in `types.ts` between plan authoring and execution, it is added to this exclusion list rather than treated as a gate failure.

### Changelog

- `docs/CHANGELOG-2026-02-22.md` has no `</initial_code>` tag
- No build artifacts or stale XML tags remain
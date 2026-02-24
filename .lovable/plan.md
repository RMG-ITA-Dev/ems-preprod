

# Plan: User Management Integration (Bug 0220-56) -- v13

---

## VERDICT: APPROVED

**Plan Version**: v13 (iterates from v12 baseline)
**Bug ID**: 0220-56
**Area**: Administration > Settings
**Confidence**: High

---

## v13 Delta from v12

- M2 no longer creates a temporary permissive "Trusted insert lifecycle audit" INSERT policy. The audit table is created with RLS enabled but no INSERT policy for anon/authenticated from the start.
- New migration M2b (`_bug_0220_56_02b_audit_policy_hardening_atomic.sql`) atomically enforces least-privilege INSERT controls: REVOKE from anon/authenticated, GRANT INSERT to service_role only -- all in one migration with no interim permissive window.
- M4 from v12 is replaced by M2b (same content, but runs immediately after M2 to eliminate any window of permissive access).
- New test file `supabase/tests/bug_0220_56_restore_hash_parity.sql` computes deterministic MD5 row hashes (ordered by `id`) for backup vs restored user_roles and fails on mismatch.
- New test file `supabase/tests/bug_0220_56_schema_equivalence_strict.sql` asserts strict schema equivalence (column name, data_type, ordinal_position) between backup snapshot and target table.
- Gate G3 now bound to three explicit commands: rollback script + schema equivalence test + hash parity test.
- Rollback script includes mandatory strict schema equivalence validation AND hash parity check before restore proceeds.
- Definition of Done requires explicit PASS for strict schema equivalence (G3a) and hash parity (G3b) as sub-gates.

---

## 1) SCOPE

### Must Cover
- P1: Replace direct role UPDATE with RPC
- P2: Orphan user actionability (badge, create staff, delete account)
- P3: Category interface/payload completeness
- P4: Server-side auth user deletion
- P5: Deterministic dedup + UNIQUE(user_id)
- P6: Exact-key rollback + tamper-resistant audit + strict schema/hash validation

### Must NOT Do
- Manual-only validation gates
- Frontend-only integrity enforcement
- Static snapshot naming
- LIKE-based rollback selection
- Permissive audit write policies (not even temporarily)

---

## 2) ROOT CAUSE

| ID | Symptom | Mechanism | Evidence |
|---|---|---|---|
| P1 | Role changes unguarded | Direct `.from("user_roles").update(...)` | `src/hooks/useUserRoles.ts` lines 36-39 |
| P2 | Orphan users non-actionable | Em-dash for null staff_name | `src/components/settings/UserRolesManager.tsx` lines 122-125 |
| P3 | Category interface incomplete | `can_approve_timesheets`, `default_app_role` absent | `src/hooks/useEmsData.ts` lines 4-13 (8 fields); `useCategoryMutations.ts` lines 10-17, 42-51 |
| P4 | No auth deletion | No Edge Function | `supabase/functions/manage-auth-user/` absent |
| P5 | Multiple roles possible | `UNIQUE(user_id, role)` not `UNIQUE(user_id)` | DB constraint `user_roles_user_id_role_key` |
| P6 | No audit/rollback infra | Tables absent; no permissions hardening | DB queries confirmed |

---

## 3) BEHAVIORAL CONTRACT

### Invariants

| # | Invariant | Enforcement |
|---|---|---|
| I1 | One role row per user_id | UNIQUE(user_id) after dedup |
| I2 | Admin count >= 1 | RPC: LAST_ADMIN with advisory lock 67890 |
| I3 | No self-role-change | RPC: SELF_CHANGE |
| I4 | No self-account-delete | Edge Function: SELF_DELETE |
| I5 | Auth deletion orphan-only | Edge Function: LINKED_USER |
| I6 | Sync never auto-downgrades admin | StaffForm: skip dialog, info toast |
| I7 | Audit tamper-resistant | No permissive INSERT policy; REVOKE from anon/authenticated; service_role + SECURITY DEFINER only |

### Dialog Semantics

| Dialog | Choice | Calls |
|---|---|---|
| Sync Role | Confirm | Exactly 1 RPC |
| Sync Role | Skip | 0 RPC |
| Sync Role | Close/Escape | 0 RPC (= Skip) |
| Delete Orphan | Confirm | Exactly 1 function call |
| Delete Orphan | Cancel | 0 calls |

---

## 4) STATE TRANSITION MATRIX

| From State | Action | Allowed | Code |
|---|---|---|---|
| Admin | Change to non-admin | Conditional (last admin blocked) | LAST_ADMIN |
| Any user | Change own role | Never | SELF_CHANGE |
| Auth-linked staff | Category change | Yes (optional sync; admin protected) | Dialog |
| Orphan auth user | Delete account | Yes (admin-only, self-block, orphan-only) | DELETED |
| Linked auth user | Delete account | Never | LINKED_USER |
| Same role set | Role change | Idempotent (no audit) | ALREADY_SET |

---

## 5) IMPLEMENTATION DELTA

### 5.1 ADD

#### M1: `<ts>_bug_0220_56_01_role_dedup_deterministic.sql`

```sql
CREATE TABLE IF NOT EXISTS public.migration_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_key text NOT NULL UNIQUE,
  backup_table_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_by text DEFAULT current_user
);

DO $$
DECLARE
  v_key text := '0220-56-role-dedup-<ts>';
  v_backup text := 'user_roles_backup_0220_56_<ts>';
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_run_log
             WHERE migration_key = v_key) THEN
    RAISE EXCEPTION 'Migration key % already executed.', v_key;
  END IF;
  EXECUTE format('CREATE TABLE public.%I AS SELECT * FROM public.user_roles', v_backup);
  INSERT INTO public.migration_run_log (migration_key, backup_table_name)
  VALUES (v_key, v_backup);
END $$;

DELETE FROM user_roles WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (
      PARTITION BY user_id ORDER BY
        CASE role
          WHEN 'admin' THEN 1 WHEN 'partner' THEN 2 WHEN 'director' THEN 3
          WHEN 'manager' THEN 4 WHEN 'senior' THEN 5 WHEN 'semisenior' THEN 6
          WHEN 'sqr' THEN 7 WHEN 'specialist_tax' THEN 8 WHEN 'specialist_it' THEN 9
          WHEN 'staff' THEN 10 WHEN 'viewer' THEN 11
        END ASC, created_at ASC NULLS LAST, id ASC
    ) AS rn FROM user_roles
  ) ranked WHERE rn > 1
);

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
```

#### M2: `<ts>_bug_0220_56_02_schema_rpc_audit.sql`

```sql
ALTER TABLE categories ADD COLUMN IF NOT EXISTS default_app_role app_role;

DO $$
DECLARE
  v_expected text[] := ARRAY['Socio','SQR','Director','Gerente','Supervisor',
    'Senior','Semi-Senior','Asistente','Especialista IT','Especialista TAX'];
  v_name text; v_found integer;
BEGIN
  FOREACH v_name IN ARRAY v_expected LOOP
    SELECT count(*) INTO v_found FROM categories WHERE category_name = v_name;
    IF v_found = 0 THEN RAISE EXCEPTION 'Expected category "%" not found', v_name; END IF;
  END LOOP;
END $$;

UPDATE categories SET default_app_role = 'partner' WHERE category_name = 'Socio';
UPDATE categories SET default_app_role = 'sqr' WHERE category_name = 'SQR';
UPDATE categories SET default_app_role = 'director' WHERE category_name = 'Director';
UPDATE categories SET default_app_role = 'manager' WHERE category_name = 'Gerente';
UPDATE categories SET default_app_role = 'senior' WHERE category_name IN ('Supervisor','Senior');
UPDATE categories SET default_app_role = 'semisenior' WHERE category_name = 'Semi-Senior';
UPDATE categories SET default_app_role = 'staff' WHERE category_name = 'Asistente';
UPDATE categories SET default_app_role = 'specialist_it' WHERE category_name = 'Especialista IT';
UPDATE categories SET default_app_role = 'specialist_tax' WHERE category_name = 'Especialista TAX';

-- Create audit log with RLS but NO permissive INSERT policy (v13: no interim exposure)
CREATE TABLE IF NOT EXISTS public.user_lifecycle_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  action text NOT NULL,
  old_role app_role,
  new_role app_role,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_lifecycle_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT only for admins
CREATE POLICY "Admins can view lifecycle audit"
  ON public.user_lifecycle_audit_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- NO INSERT/UPDATE/DELETE policies for anon or authenticated.
-- Writes happen only via SECURITY DEFINER (admin_set_user_role) and
-- service_role (manage-auth-user edge function). Grants handled in M2b.

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_target_user_id uuid, p_new_role app_role, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_old_role app_role; v_admin_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(67890);
  IF NOT has_role(v_caller_id, 'admin') THEN
    RETURN jsonb_build_object('success',false,'code','NOT_ADMIN','message','Only admins can change roles');
  END IF;
  IF v_caller_id = p_target_user_id THEN
    RETURN jsonb_build_object('success',false,'code','SELF_CHANGE','message','Cannot change own role');
  END IF;
  SELECT role INTO v_old_role FROM user_roles WHERE user_id = p_target_user_id FOR UPDATE;
  IF v_old_role IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','USER_NOT_FOUND','message','User role not found');
  END IF;
  IF v_old_role = p_new_role THEN
    RETURN jsonb_build_object('success',true,'code','ALREADY_SET','message','Role already set',
      'old_role',v_old_role::text,'new_role',p_new_role::text);
  END IF;
  IF v_old_role = 'admin' AND p_new_role != 'admin' THEN
    SELECT count(*) INTO v_admin_count FROM user_roles WHERE role = 'admin';
    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object('success',false,'code','LAST_ADMIN','message','Cannot remove the last admin');
    END IF;
  END IF;
  UPDATE user_roles SET role = p_new_role WHERE user_id = p_target_user_id;
  INSERT INTO user_lifecycle_audit_log (actor_user_id, target_user_id, action, old_role, new_role, reason)
  VALUES (v_caller_id, p_target_user_id, 'role_change', v_old_role, p_new_role, p_reason);
  RETURN jsonb_build_object('success',true,'code','UPDATED','message','Role updated',
    'old_role',v_old_role::text,'new_role',p_new_role::text);
END; $$;
```

#### M2b: `<ts>_bug_0220_56_02b_audit_policy_hardening_atomic.sql` (NEW in v13)

Runs immediately after M2. No interim permissive window exists because M2 never created an INSERT policy.

```sql
-- Explicit REVOKE to ensure no inherited or default grants allow DML
REVOKE INSERT, UPDATE, DELETE ON public.user_lifecycle_audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_lifecycle_audit_log FROM authenticated;

-- Only service_role (edge functions) can INSERT directly
GRANT INSERT ON public.user_lifecycle_audit_log TO service_role;

-- Authenticated users can SELECT (governed by RLS admin-only policy)
GRANT SELECT ON public.user_lifecycle_audit_log TO authenticated;

-- SECURITY DEFINER functions (admin_set_user_role) bypass RLS and role
-- grants, so they can INSERT without explicit GRANT to authenticated.
```

#### M3: `<ts>_bug_0220_56_03_post_migration_assertions.sql`

```sql
DO $$
DECLARE v_count integer;
  v_exact_key text := '0220-56-role-dedup-<ts>';
BEGIN
  SELECT count(*) INTO v_count FROM (SELECT user_id FROM user_roles GROUP BY user_id HAVING count(*) > 1) d;
  IF v_count > 0 THEN RAISE EXCEPTION 'ASSERTION: % users have duplicate roles', v_count; END IF;
  SELECT count(*) INTO v_count FROM user_roles WHERE role = 'admin';
  IF v_count < 1 THEN RAISE EXCEPTION 'ASSERTION: No admin users'; END IF;
  SELECT count(*) INTO v_count FROM categories WHERE default_app_role IS NULL;
  IF v_count > 0 THEN RAISE EXCEPTION 'ASSERTION: % categories NULL default_app_role', v_count; END IF;
  SELECT count(*) INTO v_count FROM migration_run_log WHERE migration_key = v_exact_key;
  IF v_count < 1 THEN RAISE EXCEPTION 'ASSERTION: No run_log entry for %', v_exact_key; END IF;
END $$;
```

#### E1: `supabase/functions/manage-auth-user/index.ts`

- CORS + OPTIONS handler.
- Extract Authorization header -> UNAUTHORIZED 401 if missing.
- Service_role client from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
- Resolve caller via `supabaseAdmin.auth.getUser(token)` -> UNAUTHORIZED 401.
- Admin check: SELECT role FROM user_roles -> NOT_ADMIN 403.
- Parse body `{ action: "delete", userId }` -> INVALID_REQUEST 400.
- Self-delete guard -> SELF_DELETE 400.
- Orphan guard (staff with auth_user_id and deleted_at IS NULL) -> LINKED_USER 400.
- Execute `auth.admin.deleteUser(userId)`. Not found -> audit `account_delete_idempotent`, return ALREADY_DELETED.
- Audit via service_role INSERT into user_lifecycle_audit_log.
- Return DELETED 200.

#### E2: `supabase/config.toml` change

```text
[functions.manage-auth-user]
verify_jwt = true
```

#### DB Test Files

| File | Gate | Command |
|---|---|---|
| `supabase/tests/bug_0220_56_dedup_correctness.sql` | G1 | `psql -v ON_ERROR_STOP=1 -f supabase/tests/bug_0220_56_dedup_correctness.sql` |
| `supabase/tests/bug_0220_56_last_admin_concurrency.sql` | G2 | via shell wrapper |
| `supabase/tests/run_bug_0220_56_last_admin_concurrency.sh` | G2 | `bash supabase/tests/run_bug_0220_56_last_admin_concurrency.sh` (non-zero exit on fail) |
| `supabase/tests/bug_0220_56_rollback_integrity.sql` | G3 | `psql -v ON_ERROR_STOP=1 -f supabase/tests/bug_0220_56_rollback_integrity.sql` |
| `supabase/tests/bug_0220_56_schema_equivalence_strict.sql` | G3a | `psql -v ON_ERROR_STOP=1 -f supabase/tests/bug_0220_56_schema_equivalence_strict.sql` |
| `supabase/tests/bug_0220_56_restore_hash_parity.sql` | G3b | `psql -v ON_ERROR_STOP=1 -f supabase/tests/bug_0220_56_restore_hash_parity.sql` |
| `supabase/tests/bug_0220_56_audit_tamper_resistance.sql` | G7 | `psql -v ON_ERROR_STOP=1 -f supabase/tests/bug_0220_56_audit_tamper_resistance.sql` |

**G3a test** (`bug_0220_56_schema_equivalence_strict.sql`):
- Read `backup_table_name` from `migration_run_log WHERE migration_key = '<exact_key>'`.
- Fail if not found.
- Compare column_name, data_type, ordinal_position between backup and `user_roles` using EXCEPT in both directions.
- Fail if any difference exists.

**G3b test** (`bug_0220_56_restore_hash_parity.sql`):
- Read `backup_table_name` from `migration_run_log WHERE migration_key = '<exact_key>'`.
- Fail if not found.
- Compute `md5(string_agg(row::text, '|' ORDER BY id))` for both backup and restored user_roles.
- After rollback execution, compare hashes.
- Fail if mismatch.

**G7 test** (`bug_0220_56_audit_tamper_resistance.sql`):
- SET ROLE authenticated -> attempt INSERT/UPDATE/DELETE on audit log -> assert `insufficient_privilege` for all three.
- SET ROLE anon -> same assertions.
- SET ROLE service_role -> INSERT succeeds.

#### Frontend Test Files

| File | Gate | Command |
|---|---|---|
| `src/hooks/__tests__/useUserRoles.admin-set-role.test.tsx` | G5A | `vitest run src/hooks/__tests__/useUserRoles.admin-set-role.test.tsx` |
| `src/components/settings/__tests__/UserRolesManager.test.tsx` | G5B | `vitest run src/components/settings/__tests__/UserRolesManager.test.tsx` |
| `src/components/forms/__tests__/StaffForm.role-sync-dialog.test.tsx` | G5C | `vitest run src/components/forms/__tests__/StaffForm.role-sync-dialog.test.tsx` |
| `src/pages/__tests__/Settings.user-management-flow.test.tsx` | G5D | `vitest run src/pages/__tests__/Settings.user-management-flow.test.tsx` |

### 5.2 CHANGE

#### `src/hooks/useUserRoles.ts`

- **Delete** lines 35-42: direct `.from('user_roles').update(...)`.
- **Replace** `useUpdateUserRole.mutationFn`: call `supabase.rpc('admin_set_user_role', { p_target_user_id, p_new_role, p_reason })`. Throw on `!result.success`.
- **Replace** `onError` (lines 47-49): map LAST_ADMIN, SELF_CHANGE, NOT_ADMIN to typed i18n toasts.
- **Add** `useDeleteAuthUser`: invoke `manage-auth-user`, map SELF_DELETE/LINKED_USER, invalidate `["all_user_roles"]`.

#### `src/components/settings/UserRolesManager.tsx`

- Replace em-dash (lines 122-125) with orphan badge: AlertTriangle + warning text.
- Add Actions column: orphan non-self gets Create Staff link (`/staff/new?email=...`) + Delete Account AlertDialog. Self: disabled. Linked: empty. All disabled while isPending.

#### `src/components/forms/StaffForm.tsx`

- After `updateMutation.mutateAsync`, before `onSaveSuccess`: check category change on auth-linked staff. Look up `newCategory.default_app_role`. Admin: toast.info, skip. Different mapped role + not admin: open sync dialog. Confirm -> RPC -> onSaveSuccess. Skip/Close/Escape -> onSaveSuccess directly.

#### `src/components/forms/CategoryForm.tsx`

- Schema: add `default_app_role: z.string().optional()`.
- Reset: `default_app_role: category?.default_app_role || ""`.
- Payload: add `default_app_role: data.default_app_role || null`.
- Add Select with 11 app_role values + None. Helper text.

#### `src/hooks/useEmsData.ts` (lines 4-13)

```text
export interface Category {
  category_id: string;
  category_name: string;
  rate_high_bob: number;
  rate_low_bob: number;
  rate_high_usd: number;
  rate_low_usd: number;
  display_order: number;
  can_approve_wo: boolean;
  can_approve_timesheets: boolean;
  default_app_role: string | null;
}
```

#### `src/hooks/mutations/useCategoryMutations.ts`

Add `can_approve_timesheets?: boolean; default_app_role?: string | null;` to create (lines 10-17) and update (lines 42-51) payload types.

#### `src/pages/StaffNew.tsx`

Add `useSearchParams`, read `?email`, pass as `prefillEmail` to StaffForm. Leave-lock unchanged.

#### `src/locales/en.json`

userRoles: orphanWarning, createStaff, deleteAccount, deleteAccountTitle, confirmDeleteAccount, accountDeleted, deleteError, cannotDeleteSelf, cannotDeleteLinked, lastAdminBlocked, alreadyDeleted, notAdmin.
staff: syncRoleTitle, syncRoleMessage, syncRoleConfirm, syncRoleSkip, roleSynced, roleSyncError, adminRoleProtected.
category: defaultAppRole, defaultAppRoleHelp.

#### `src/locales/es.json`

Exact key parity.

#### `docs/CHANGELOG-2026-02-22.md`

Append Plan_0220-56_v13 entry.

### 5.3 DELETE

| What | Replaced By |
|---|---|
| Direct `.from('user_roles').update(...)` (lines 36-39) | RPC admin_set_user_role |
| Temporary permissive "Trusted insert lifecycle audit" policy | Never created in v13; M2b enforces least-privilege atomically |
| M4 from v12 | Replaced by M2b (same REVOKE/GRANT, runs immediately after M2) |

---

## 6) RELEASE GATES (All Automated)

| # | Gate | Bound To | Command |
|---|---|---|---|
| G1 | Dedup correctness | `supabase/tests/bug_0220_56_dedup_correctness.sql` | `psql -v ON_ERROR_STOP=1 -f ...` |
| G2 | Last-admin concurrency | `supabase/tests/run_bug_0220_56_last_admin_concurrency.sh` | `bash ...` (non-zero exit on fail) |
| G3 | Rollback integrity | `supabase/tests/bug_0220_56_rollback_integrity.sql` | `psql -v ON_ERROR_STOP=1 -f ...` |
| G3a | Schema equivalence | `supabase/tests/bug_0220_56_schema_equivalence_strict.sql` | `psql -v ON_ERROR_STOP=1 -f ...` |
| G3b | Hash parity | `supabase/tests/bug_0220_56_restore_hash_parity.sql` | `psql -v ON_ERROR_STOP=1 -f ...` |
| G4 | Post-migration assertions | Migration M3 | Migration execution |
| G5A | Hook test | `src/hooks/__tests__/useUserRoles.admin-set-role.test.tsx` | `vitest run ...` |
| G5B | UserRolesManager UI | `src/components/settings/__tests__/UserRolesManager.test.tsx` | `vitest run ...` |
| G5C | StaffForm dialog | `src/components/forms/__tests__/StaffForm.role-sync-dialog.test.tsx` | `vitest run ...` |
| G5D | Settings integration | `src/pages/__tests__/Settings.user-management-flow.test.tsx` | `vitest run ...` |
| G6 | verify_jwt=true | `supabase/config.toml` | `rg -n "^\[functions\.manage-auth-user\]\|^verify_jwt\s*=\s*true" supabase/config.toml` |
| G7 | Audit tamper resistance | `supabase/tests/bug_0220_56_audit_tamper_resistance.sql` | `psql -v ON_ERROR_STOP=1 -f ...` |

---

## 7) ROLLBACK

### Contract
- Exact run key: `WHERE migration_key = '0220-56-role-dedup-<ts>'` (no LIKE, no ORDER BY LIMIT)
- Hard failure if metadata missing
- Transaction + table lock
- Strict schema equivalence validation before restore (column name, data_type, ordinal_position)
- Row-level MD5 hash parity check after restore
- Restore constraint to UNIQUE(user_id, role)

### Script

```sql
DO $$
DECLARE
  v_exact_key text := '0220-56-role-dedup-<ts>';
  v_backup text;
  v_schema_match boolean;
  v_backup_rows integer;
  v_hash_backup text;
  v_hash_restored text;
BEGIN
  SELECT backup_table_name INTO v_backup
  FROM migration_run_log WHERE migration_key = v_exact_key;
  IF v_backup IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK BLOCKED: No entry for key %', v_exact_key;
  END IF;

  -- Strict schema equivalence: name, type, ordinal position
  SELECT NOT EXISTS (
    (SELECT column_name, data_type, ordinal_position FROM information_schema.columns
     WHERE table_schema='public' AND table_name=v_backup
     EXCEPT
     SELECT column_name, data_type, ordinal_position FROM information_schema.columns
     WHERE table_schema='public' AND table_name='user_roles')
    UNION ALL
    (SELECT column_name, data_type, ordinal_position FROM information_schema.columns
     WHERE table_schema='public' AND table_name='user_roles'
     EXCEPT
     SELECT column_name, data_type, ordinal_position FROM information_schema.columns
     WHERE table_schema='public' AND table_name=v_backup)
  ) INTO v_schema_match;
  IF NOT v_schema_match THEN
    RAISE EXCEPTION 'ROLLBACK BLOCKED: Schema structure mismatch between backup and user_roles';
  END IF;

  EXECUTE format('SELECT count(*) FROM public.%I', v_backup) INTO v_backup_rows;
  IF v_backup_rows = 0 THEN
    RAISE EXCEPTION 'ROLLBACK BLOCKED: Backup table % is empty', v_backup;
  END IF;

  -- Compute pre-restore hash of backup
  EXECUTE format('SELECT md5(string_agg(row::text, ''|'' ORDER BY id)) FROM (SELECT * FROM public.%I ORDER BY id) row', v_backup) INTO v_hash_backup;

  -- Drop v13 objects
  DROP FUNCTION IF EXISTS public.admin_set_user_role(uuid, app_role, text);
  DROP POLICY IF EXISTS "Admins can view lifecycle audit" ON public.user_lifecycle_audit_log;
  REVOKE ALL ON public.user_lifecycle_audit_log FROM service_role;
  DROP TABLE IF EXISTS public.user_lifecycle_audit_log;
  ALTER TABLE categories DROP COLUMN IF EXISTS default_app_role;

  -- Restore
  ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_key;
  LOCK TABLE user_roles IN ACCESS EXCLUSIVE MODE;
  TRUNCATE user_roles;
  EXECUTE format('INSERT INTO user_roles SELECT * FROM public.%I', v_backup);
  ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

  -- Post-restore hash parity
  SELECT md5(string_agg(row::text, '|' ORDER BY id)) FROM (SELECT * FROM user_roles ORDER BY id) row INTO v_hash_restored;
  IF v_hash_backup IS DISTINCT FROM v_hash_restored THEN
    RAISE EXCEPTION 'ROLLBACK INTEGRITY FAILURE: Hash mismatch (backup=%, restored=%)', v_hash_backup, v_hash_restored;
  END IF;

  DELETE FROM migration_run_log WHERE migration_key = v_exact_key;
END $$;
```

Edge function: delete `supabase/functions/manage-auth-user/`; remove config.toml entry.
Frontend: revert changed files; delete added test files.

---

## 8) RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Concurrent last-admin demotion | Very Low | Zero admins | Advisory lock 67890 + FOR UPDATE + G2 |
| Stale backup reuse | None | Wrong restore | UNIQUE migration_key + fail-fast |
| Orphan deletion misuse | Low | Permanent | AlertDialog + server guard + audit |
| Category mapping drift | Medium | Sync skipped | CategoryForm field + M3 assertion |
| Type/schema drift | Low | TS errors | Interface updated; temp cast until types regen |
| Audit tampering | Very Low | Integrity | No permissive policy ever; REVOKE + G7 |
| Rollback data corruption | Very Low | Wrong state | Schema equivalence (G3a) + hash parity (G3b) |

---

## 9) DEFINITION OF DONE

- [ ] migration_run_log with UNIQUE migration_key and exact run entry
- [ ] Run-scoped snapshot with dynamic name
- [ ] Dedup via row_number() with 3-key ordering
- [ ] UNIQUE(user_id) replacing UNIQUE(user_id, role)
- [ ] categories.default_app_role with fail-fast backfill
- [ ] user_lifecycle_audit_log with action, metadata jsonb, RLS, NO permissive INSERT policy
- [ ] M2b: REVOKE INSERT/UPDATE/DELETE from anon/authenticated; GRANT INSERT to service_role only (atomic, no interim exposure)
- [ ] admin_set_user_role RPC with advisory lock 67890, FOR UPDATE, 6 typed codes
- [ ] Post-migration assertions using exact migration_key (M3)
- [ ] manage-auth-user Edge Function with verify_jwt=true, deletion audit via service_role
- [ ] config.toml: [functions.manage-auth-user] verify_jwt = true
- [ ] useUpdateUserRole uses RPC only (direct UPDATE deleted)
- [ ] useDeleteAuthUser mutation with typed codes
- [ ] UserRolesManager orphan warning + Create Staff + Delete Account
- [ ] Self-delete and self-role-change blocked backend + frontend
- [ ] Last-admin downgrade blocked
- [ ] StaffForm sync-role dialog with confirm/skip/close semantics
- [ ] Admin role never auto-downgraded
- [ ] /staff/new?email=X pre-fills email
- [ ] CategoryForm includes default_app_role dropdown
- [ ] Category interface includes can_approve_timesheets + default_app_role (no any casts)
- [ ] useCategoryMutations includes both fields
- [ ] EN + ES i18n keys with exact parity
- [ ] No direct role table update path remains
- [ ] No static backup table references remain
- [ ] No LIKE-based rollback selection remains
- [ ] No permissive audit INSERT policy exists (not even temporarily)
- [ ] **G1 PASS**: dedup correctness
- [ ] **G2 PASS**: last-admin concurrency (non-zero exit on failure)
- [ ] **G3 PASS**: rollback integrity
- [ ] **G3a PASS**: strict schema equivalence (name, type, ordinal)
- [ ] **G3b PASS**: restore hash parity (MD5 ordered by id)
- [ ] **G4 PASS**: post-migration assertions
- [ ] **G5A PASS**: hook test
- [ ] **G5B PASS**: UserRolesManager UI test
- [ ] **G5C PASS**: StaffForm dialog test
- [ ] **G5D PASS**: Settings integration test
- [ ] **G6 PASS**: verify_jwt=true confirmed
- [ ] **G7 PASS**: audit tamper resistance
- [ ] Changelog appended to docs/CHANGELOG-2026-02-22.md

---

## 10) CHANGELOG

Target: `docs/CHANGELOG-2026-02-22.md`

```text
---

### Bug 0220-56: User Management Integration -- v13

**Plan**: Plan_0220-56_v13
**Priority**: Media

**Problem**: Direct table UPDATE for roles, no server guards,
UNIQUE(user_id, role) allows multiple roles, no category-role sync,
orphan users non-actionable, no auth deletion, no audit tamper
protection, prior versions had interim permissive audit policy window.

**Root cause**: Missing default_app_role column, direct table mutation
in useUpdateUserRole, no Edge Function, no permissions hardening.

**v13 delta from v12**:
- Eliminated interim permissive "Trusted insert lifecycle audit" policy
  entirely. M2 creates audit table with NO INSERT policy for
  anon/authenticated from the start.
- New M2b migration atomically enforces REVOKE/GRANT with zero
  permissive window.
- M4 from v12 replaced by M2b (identical content, earlier execution).
- New G3a gate: strict schema equivalence test (name, type, ordinal).
- New G3b gate: restore hash parity test (MD5 ordered by id).
- Rollback script includes mandatory schema + hash validation before
  and after restore.

**Changes**:
- migration_run_log with UNIQUE migration_key
- Dynamic backup table naming bound to exact migration_key
- Deterministic row_number() dedup with 3-key ordering
- UNIQUE(user_id) replacing UNIQUE(user_id, role)
- categories.default_app_role with fail-fast backfill
- user_lifecycle_audit_log: no permissive INSERT policy ever created
- M2b: atomic REVOKE/GRANT (no interim permissive window)
- admin_set_user_role RPC: advisory lock 67890 + FOR UPDATE + 6 codes
- manage-auth-user Edge Function: verify_jwt=true, orphan-only, audit
- Post-migration assertions using exact migration_key
- RPC-backed role mutation replacing direct table UPDATE
- UserRolesManager: orphan badge, Create Staff, Delete Account
- StaffForm: sync-role dialog with confirm/skip/close semantics
- CategoryForm: default_app_role dropdown
- Category interface: can_approve_timesheets + default_app_role
- useCategoryMutations: payload types updated
- StaffNew: email prefill from query parameter
- EN/ES i18n keys with exact parity
- 12 automated release gates (G1, G2, G3, G3a, G3b, G4, G5A-D, G6, G7)

**Safety**:
- verify_jwt=true (G6)
- Advisory lock 67890 + row lock (G2)
- No permissive audit INSERT policy at any point (G7)
- Strict schema equivalence + MD5 hash parity for rollback (G3a, G3b)
- Exact-key rollback with schema validation (G3)
- Dedup correctness (G1)
- Post-migration assertions (G4)
- Integration tests (G5A-G5D)
```

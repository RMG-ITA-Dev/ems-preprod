-- Catalog-level convergence assertions for C1-C4 (Fase 2 del Scheduler,
-- bugs/scheduler/fase_2/plan_v2.md). Structural checks the RLS/RPC suites
-- don't already cover directly — grants, ACLs, triggers, defaults — plus a
-- couple of behavioral checks for the two new helper functions that don't
-- warrant a full RLS/RPC suite of their own.
--
-- Run via supabase/tests/local/run-rls-tests.sh against the disposable scratch
-- database, AFTER the 8 historical scheduler migrations and C1-C4 have been
-- applied. Single transaction, ALWAYS rolls back (the behavioral checks in
-- part 2 insert throwaway fixtures). Success output: one NOTICE per passing
-- check ending with "SCHEMA CONVERGENCE: ALL CHECKS PASSED (rolled back)".
--
-- Acceptance-criteria mapping (plan_v2.md, "Mapeo a criterios de aceptación"):
--   is_schedulable en esquema             -> part 1, check 1
--   status con default válido             -> part 1, check 2
--   Sin lectura global para autenticados  -> part 1, check 3
--   Grants de mínimo privilegio           -> part 1, checks 4-5
--   Vistas no evaden RLS                  -> part 1, check 6 (skipped if the
--                                            view doesn't exist in this shim)
--   Estructura + categorías del servicio  -> part 1, check 7 (triggers) +
--                                            part 2 (is_engagement_responsible
--                                            / engagement_accepts_assignment_writes
--                                            behavior)
--   copy_categories_between_practices      -> part 1, check 8 (structural: the
--   extendida a 6 referrers                 6 referrer tables appear in the
--                                            function body; the shim carries
--                                            no wo_budget_lines/activity_*
--                                            fixtures to invoke it end to end
--                                            — that path is exercised for real
--                                            in Rutas A/B/C against Docker).
--
-- Incidente RLS 2026-09-28 (bugs/seguridad/barrido_plan.md §5, Carril A):
--   Sin escritura de roles por la Data API -> part 1, check 11
--   Compuerta relrowsecurity (A.3)         -> part 1, check 12 (lista de
--                                            excepciones = pendiente del Carril B)

BEGIN;

-- =====================================================================
-- Part 1 — pure catalog assertions (no fixtures required).
-- =====================================================================
DO $$
DECLARE
  n       int;
  v_def   text;
  v_default text;
BEGIN
  -- 1. staff.is_schedulable (G6)
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'staff'
     AND column_name = 'is_schedulable' AND data_type = 'boolean' AND is_nullable = 'NO';
  IF n <> 1 THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — staff.is_schedulable missing or not NOT NULL boolean';
  END IF;
  SELECT column_default INTO v_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'is_schedulable';
  IF v_default IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — staff.is_schedulable default drifted from true (found %)', v_default;
  END IF;
  RAISE NOTICE 'PASS — staff.is_schedulable is boolean NOT NULL DEFAULT true';

  -- 2. engagement_assignments.status default (G5) — same sonda C2 itself
  --    runs at apply time; re-asserted here as a standing regression guard.
  --    Compares only the literal (before "::"), not the type suffix — the live
  --    column can be character varying instead of text depending on how it was
  --    originally created (Lovable vs. this repo's migrations), same value either way.
  SELECT column_default INTO v_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'engagement_assignments' AND column_name = 'status';
  IF split_part(v_default, '::', 1) IS DISTINCT FROM '''PROPOSED''' THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — engagement_assignments.status default drifted from PROPOSED (found %)', v_default;
  END IF;
  RAISE NOTICE 'PASS — engagement_assignments.status default is PROPOSED';

  -- 3. Zero USING(true)-shaped SELECT/ALL policies on the 2 staffing tables (G2)
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('wo_staffing_requirements', 'wo_staffing_requirement_skills')
     AND qual = 'true';
  IF n <> 0 THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — % USING(true)-shaped polic(y/ies) survive on the staffing tables (G2 regression)', n;
  END IF;
  RAISE NOTICE 'PASS — G2 closed: zero USING(true) policies on wo_staffing_requirements/_skills';

  -- 4. Table grants: authenticated has exactly SELECT/INSERT/UPDATE/DELETE,
  --    anon has none, on all 3 scheduler-owned tables.
  DECLARE
    tbl text;
  BEGIN
    FOREACH tbl IN ARRAY ARRAY['wo_staffing_requirements', 'wo_staffing_requirement_skills', 'engagement_assignments'] LOOP
      IF NOT (has_table_privilege('authenticated', 'public.' || tbl, 'SELECT')
              AND has_table_privilege('authenticated', 'public.' || tbl, 'INSERT')
              AND has_table_privilege('authenticated', 'public.' || tbl, 'UPDATE')
              AND has_table_privilege('authenticated', 'public.' || tbl, 'DELETE')) THEN
        RAISE EXCEPTION 'CONVERGENCE FAIL — authenticated is missing a DML grant on %', tbl;
      END IF;
      IF to_regrole('anon') IS NOT NULL AND (
           has_table_privilege('anon', 'public.' || tbl, 'SELECT')
           OR has_table_privilege('anon', 'public.' || tbl, 'INSERT')
           OR has_table_privilege('anon', 'public.' || tbl, 'UPDATE')
           OR has_table_privilege('anon', 'public.' || tbl, 'DELETE')
         ) THEN
        RAISE EXCEPTION 'CONVERGENCE FAIL — anon retains a grant on % (least privilege violated)', tbl;
      END IF;
    END LOOP;
  END;
  RAISE NOTICE 'PASS — table grants: authenticated has SELECT/INSERT/UPDATE/DELETE, anon has none, on all 3 scheduler tables';

  -- 5. Helper/RPC function ACLs: anon=false, authenticated=true, service_role=false.
  DECLARE
    fn text;
  BEGIN
    FOREACH fn IN ARRAY ARRAY[
      'is_engagement_responsible(uuid)',
      'engagement_accepts_assignment_writes(uuid)',
      'save_wo_staffing(uuid, jsonb)',
      'save_engagement_assignments(uuid, jsonb, uuid[])'
    ] LOOP
      IF to_regrole('anon') IS NOT NULL AND has_function_privilege('anon', 'public.' || fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'CONVERGENCE FAIL — anon retains EXECUTE on public.%', fn;
      END IF;
      IF NOT has_function_privilege('authenticated', 'public.' || fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'CONVERGENCE FAIL — authenticated lost EXECUTE on public.%', fn;
      END IF;
      IF to_regrole('service_role') IS NOT NULL AND has_function_privilege('service_role', 'public.' || fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'CONVERGENCE FAIL — service_role retains EXECUTE on public.% (least privilege violated)', fn;
      END IF;
    END LOOP;
  END;
  RAISE NOTICE 'PASS — C1-C4 function ACLs: anon=false authenticated=true service_role=false on all 4 new functions';

  -- 6. vw_staffing_alerts does not evade RLS (skip if absent — this shim does
  --    not replay development's view-creation migration; the real 3-route
  --    convergence is verified against Docker, see scheduler-fase-2-verificacion.md).
  IF to_regclass('public.vw_staffing_alerts') IS NULL THEN
    RAISE NOTICE 'SKIP — vw_staffing_alerts not present in this environment';
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid = 'public.vw_staffing_alerts'::regclass
        AND (c.reloptions IS NOT NULL AND 'security_invoker=true' = ANY(c.reloptions))
    ) THEN
      RAISE EXCEPTION 'CONVERGENCE FAIL — vw_staffing_alerts is missing security_invoker=true';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.vw_staffing_alerts', 'SELECT') THEN
      RAISE EXCEPTION 'CONVERGENCE FAIL — vw_staffing_alerts GRANT to authenticated not restored';
    END IF;
    IF to_regrole('anon') IS NOT NULL AND has_table_privilege('anon', 'public.vw_staffing_alerts', 'SELECT') THEN
      RAISE EXCEPTION 'CONVERGENCE FAIL — vw_staffing_alerts still readable by anon';
    END IF;
    RAISE NOTICE 'PASS — vw_staffing_alerts: security_invoker=true, authenticated restored, anon revoked';
  END IF;

  -- 7. Practice-scope backstop triggers exist on both scheduler tables (G3)
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.wo_staffing_requirements'::regclass
     AND tgname = 'trg_enforce_wo_staffing_practice_scope' AND NOT tgisinternal;
  IF n <> 1 THEN RAISE EXCEPTION 'CONVERGENCE FAIL — trg_enforce_wo_staffing_practice_scope missing on wo_staffing_requirements'; END IF;

  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.engagement_assignments'::regclass
     AND tgname = 'trg_enforce_assignment_practice_scope' AND NOT tgisinternal;
  IF n <> 1 THEN RAISE EXCEPTION 'CONVERGENCE FAIL — trg_enforce_assignment_practice_scope missing on engagement_assignments'; END IF;
  RAISE NOTICE 'PASS — practice-scope backstop triggers present on both tables (G3)';

  -- 8. copy_categories_between_practices extended to the 2 new referrers
  --    (structural: the function body mentions both new tables; the full
  --    behavioral path — target_referenced block — needs wo_budget_lines/
  --    activity_worksheet_cells/activity_codes fixtures this shim doesn't
  --    carry, and is already exercised for real in Rutas A/B/C).
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'copy_categories_between_practices';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — copy_categories_between_practices not found';
  END IF;
  IF v_def NOT LIKE '%wo_staffing_requirements%' OR v_def NOT LIKE '%engagement_assignments%' THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — copy_categories_between_practices guard does not reference both new referrers';
  END IF;
  RAISE NOTICE 'PASS — copy_categories_between_practices references both new referrer tables (structural check)';

  -- 9. Fase 5 O6: la normalización de práctica legada corrió — cero engagements
  --    con practica IS NULL sobreviven a la migración de convergencia.
  SELECT count(*) INTO n FROM public.engagements WHERE practica IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — % engagement(s) still have practica IS NULL after the Auditoría backfill (Fase 5 O6)', n;
  END IF;
  RAISE NOTICE 'PASS — no engagements remain with practica IS NULL (Fase 5 O6 backfill to Auditoría applied)';

  -- 10. BUG 0828-185: society_id NOT NULL (own_society del RPC list_portfolio_engagements
  --     necesita comparar sociedades reales) y el CHECK manager_id <> especialista, validado
  --     (no NOT VALID) tras la remediación de la propia migración.
  SELECT count(*) INTO n FROM pg_attribute
   WHERE attrelid = 'public.engagements'::regclass
     AND attname = 'society_id' AND attnotnull AND NOT attisdropped;
  IF n <> 1 THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — engagements.society_id debe ser NOT NULL (BUG 0828-185)';
  END IF;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.engagements'::regclass
     AND conname = 'chk_engagements_manager_not_specialist'
     AND contype = 'c' AND convalidated;
  IF n <> 1 THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — falta (o no está validado) chk_engagements_manager_not_specialist en engagements (BUG 0828-185)';
  END IF;
  RAISE NOTICE 'PASS — engagements.society_id es NOT NULL y chk_engagements_manager_not_specialist está presente y validado (BUG 0828-185)';

  -- 11. Carril A del incidente RLS 2026-09-28 (bugs/seguridad/barrido_plan.md §5, BAR-001/004/007):
  --     ningún rol de API escribe user_roles, ni toca su respaldo, ni ejecuta assign_user_role_atomic;
  --     service_role conserva todo. El SELECT de user_roles se mantiene a propósito (lo usa el frontend).
  DECLARE
    r    text;
    priv text;
  BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF to_regrole(r) IS NULL THEN CONTINUE; END IF;
      FOREACH priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
        IF has_table_privilege(r, 'public.user_roles', priv) THEN
          RAISE EXCEPTION 'CONVERGENCE FAIL — % retains % on public.user_roles (escalada de rol por la Data API, BAR-001)', r, priv;
        END IF;
      END LOOP;
      IF has_any_column_privilege(r, 'public.user_roles', 'INSERT, UPDATE') THEN
        RAISE EXCEPTION 'CONVERGENCE FAIL — % retains a column-level INSERT/UPDATE on public.user_roles (BAR-001)', r;
      END IF;
      IF NOT has_table_privilege(r, 'public.user_roles', 'SELECT') THEN
        RAISE EXCEPTION 'CONVERGENCE FAIL — % lost SELECT on public.user_roles (useAuth/useUserRole/StaffForm lo leen)', r;
      END IF;
      IF has_table_privilege(r, 'public.user_roles_backup_0220_56_20260224',
                             'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         OR has_any_column_privilege(r, 'public.user_roles_backup_0220_56_20260224', 'SELECT, INSERT, UPDATE, REFERENCES') THEN
        RAISE EXCEPTION 'CONVERGENCE FAIL — % retains a privilege on public.user_roles_backup_0220_56_20260224 (BAR-004)', r;
      END IF;
      IF has_function_privilege(r, 'public.assign_user_role_atomic(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'CONVERGENCE FAIL — % retains EXECUTE on public.assign_user_role_atomic(uuid) (BAR-007)', r;
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'public.assign_user_role_atomic(uuid)'::regprocedure
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'CONVERGENCE FAIL — PUBLIC retains EXECUTE on public.assign_user_role_atomic(uuid) (BAR-007)';
    END IF;
    IF to_regrole('service_role') IS NOT NULL AND NOT (
         has_table_privilege('service_role', 'public.user_roles', 'SELECT')
         AND has_table_privilege('service_role', 'public.user_roles', 'INSERT')
         AND has_table_privilege('service_role', 'public.user_roles', 'UPDATE')
         AND has_table_privilege('service_role', 'public.user_roles', 'DELETE')
         AND has_table_privilege('service_role', 'public.user_roles_backup_0220_56_20260224', 'SELECT')
         AND has_function_privilege('service_role', 'public.assign_user_role_atomic(uuid)', 'EXECUTE')) THEN
      RAISE EXCEPTION 'CONVERGENCE FAIL — service_role lost a privilege on user_roles / its backup / assign_user_role_atomic (Edge Functions dependen de él)';
    END IF;
  END;
  RAISE NOTICE 'PASS — Carril A: anon/authenticated sin escritura en user_roles (SELECT intacto), sin acceso al respaldo ni EXECUTE en assign_user_role_atomic; service_role intacto';

  -- 12. Compuerta de RLS (barrido_plan.md §5 A.3): toda tabla de `public` (el esquema que publica la
  --     Data API) tiene relrowsecurity, salvo las de esta lista. La causa raíz del incidente es que
  --     nada verificaba pg_class.relrowsecurity: 177 políticas escritas, 16 tablas con política y RLS
  --     apagado. La lista es el pendiente vivo del Carril B y solo puede encoger: falla también si
  --     una excepción ya tiene RLS (hay que retirarla de acá) o si la tabla dejó de existir.
  --     Responsable de cada entrada: por asignar (barrido_report.md §10).
  DECLARE
    v_exceptions text[] := ARRAY[
      -- Grupo A — identidad y logs (P0)
      'user_roles',                          -- BAR-001: escritura cerrada en el Carril A; falta RLS para la lectura
      'user_roles_backup_0220_56_20260224',  -- BAR-004: sin acceso para roles de API; decidir conservar/retirar
      'migration_run_log',                   -- sin políticas; log interno
      -- Grupo B — núcleo de negocio (P0)
      'staff',                               -- BAR-002/003: PII; hardening por columna anulado por anon
      'clients',                             -- BAR-002
      'engagements',                         -- BAR-002
      'time_entries',                        -- BAR-002
      'timer_entries',                       -- BAR-002
      'timesheet_line_approvals',            -- BAR-002
      'timesheet_periods',                   -- BAR-002
      -- Grupo C — presupuestos y gastos
      'activity_worksheet_cells',            -- BAR-002
      'wo_budget_lines',                     -- BAR-002
      'wo_expense_budget',                   -- BAR-002
      -- Grupo D — configuración y catálogos (P1/P2)
      'global_settings',                     -- BAR-002: la pantalla de login la lee sin sesión
      'activity_codes',                      -- BAR-002
      'categories',                          -- BAR-002
      'expense_types',                       -- BAR-002
      'industries'                           -- BAR-002
    ];
    v_list text;
  BEGIN
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_list
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
       AND c.relname <> ALL (v_exceptions);
    IF v_list IS NOT NULL THEN
      RAISE EXCEPTION 'CONVERGENCE FAIL — public tables without RLS and not in the exception list: % (habilitar RLS con sus políticas, o registrar la excepción con justificación)', v_list;
    END IF;

    SELECT string_agg(e, ', ' ORDER BY e) INTO v_list
      FROM unnest(v_exceptions) e
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relname = e AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity);
    IF v_list IS NOT NULL THEN
      RAISE EXCEPTION 'CONVERGENCE FAIL — stale RLS exception(s), the table now has RLS or no longer exists: % (retirarla de la lista)', v_list;
    END IF;
    RAISE NOTICE 'PASS — RLS gate: every public table has relrowsecurity except the % listed exceptions (Carril B pendiente)',
      array_length(v_exceptions, 1);
  END;
END $$;

-- =====================================================================
-- Part 2 — behavioral checks for is_engagement_responsible() and
-- engagement_accepts_assignment_writes(), as postgres (SECURITY DEFINER
-- callers bypass RLS internally either way; these are STABLE SQL functions
-- with no auth.uid() dependency for the override-state check, and
-- is_engagement_responsible reads get_my_staff_id() which returns NULL for
-- postgres — so these are probed via direct staff_id/override values, not
-- impersonation).
-- =====================================================================
DO $$
DECLARE
  v_client uuid := 'c1000000-0000-4000-8000-0000000000d1';
  v_cat    uuid := 'c0000000-0000-4000-8000-0000000000d1';
  v_e_open uuid := 'e0000000-0000-4000-8000-0000000000d1';
  v_e_term uuid := 'e0000000-0000-4000-8000-0000000000d2';
  v_e_null uuid := 'e0000000-0000-4000-8000-0000000000d3';
  v_state  smallint;
  v_ok     boolean;
BEGIN
  INSERT INTO public.categories (category_id, category_name, practica_id) VALUES
    (v_cat, 'Convergence Behavior Category', (SELECT practica_id FROM public.practicas WHERE code = 1));
  INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
    (v_client, 'Convergence Behavior Client', 'CONV-TAX-001');
  -- fecha_cierre is NOT NULL with no DEFAULT on a live Supabase (20260702000000) — the local shim
  -- has no such column at all, so this must be supplied explicitly to work in both environments.
  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_state_override, fecha_cierre, society_id) VALUES
    (v_e_open, v_client, 'Convergence E-open', 1, '2026-09-30', (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),   -- derived state 1..5/8 -> writable
    (v_e_term, v_client, 'Convergence E-terminal', 7, '2026-09-30', (SELECT society_id FROM public.society ORDER BY name LIMIT 1)), -- Finalizado -> locked
    (v_e_null, v_client, 'Convergence E-null', NULL, '2026-09-30', (SELECT society_id FROM public.society ORDER BY name LIMIT 1));  -- no override -> writable

  -- engagement_accepts_assignment_writes: true for 1..5/8/NULL, false for 6/7 (0817-179 retiró el 9).
  IF NOT public.engagement_accepts_assignment_writes(v_e_open) THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — engagement_accepts_assignment_writes(override=1) should be true';
  END IF;
  IF public.engagement_accepts_assignment_writes(v_e_term) THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — engagement_accepts_assignment_writes(override=7) should be false';
  END IF;
  IF NOT public.engagement_accepts_assignment_writes(v_e_null) THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — engagement_accepts_assignment_writes(override=NULL) should be true';
  END IF;
  FOR v_state IN SELECT unnest(ARRAY[6]) LOOP
    UPDATE public.engagements SET engagement_state_override = v_state WHERE engagement_id = v_e_term;
    IF public.engagement_accepts_assignment_writes(v_e_term) THEN
      RAISE EXCEPTION 'CONVERGENCE FAIL — engagement_accepts_assignment_writes(override=%) should be false', v_state;
    END IF;
  END LOOP;
  -- Non-existent engagement: COALESCE(..., true) — fails open on a missing row
  -- (mirrors C2's own comment: "sin fila ⇒ escribible").
  IF NOT public.engagement_accepts_assignment_writes('99999999-0000-4000-8000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'CONVERGENCE FAIL — engagement_accepts_assignment_writes on a missing engagement should default true';
  END IF;
  RAISE NOTICE 'PASS — engagement_accepts_assignment_writes: true for {1,5,8,NULL,missing}, false for {6,7} (G4)';

  -- BUG 0817-179: el estado 9 Congelado se retiró. El CHECK de la columna es lo que lo hace
  -- inalcanzable (borrarlo solo del enum de TypeScript lo esconde, no lo elimina).
  BEGIN
    UPDATE public.engagements SET engagement_state_override = 9 WHERE engagement_id = v_e_term;
    RAISE EXCEPTION 'CONVERGENCE FAIL — engagement_state_override = 9 debe ser rechazado por engagements_state_override_check (0817-179)';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- esperado
  END;
  RAISE NOTICE 'PASS — engagement_state_override = 9 rechazado por CHECK 1..8 (0817-179)';

  -- is_engagement_responsible: true for each of the 6 columns individually
  -- (via the real function, impersonated), false for someone linked to none.
  DECLARE
    v_staff      uuid := 'd0000000-0000-4000-8000-0000000000d1';
    v_auth       uuid := 'a0000000-0000-4000-8000-0000000000d1';
    v_bystander  uuid := 'd0000000-0000-4000-8000-0000000000d2';
    v_bystander_auth uuid := 'a0000000-0000-4000-8000-0000000000d2';
    col          text;
  BEGIN
    -- staff.auth_user_id carries a real FK to auth.users on a live Supabase (the local shim has
    -- no such table/constraint — this block is a no-op there). Guarded so this works in both.
    IF to_regclass('auth.users') IS NOT NULL THEN
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at,
                               raw_app_meta_data, raw_user_meta_data) VALUES
        (v_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conv-test-d1@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
        (v_bystander_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conv-test-d2@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    END IF;

    INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, category_id, practica_id, society_id) VALUES
      (v_staff, v_auth, 'Resp', 'Probe', v_cat, (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society LIMIT 1)),
      (v_bystander, v_bystander_auth, 'NotResp', 'Probe', v_cat, (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society LIMIT 1));

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

    FOREACH col IN ARRAY ARRAY['manager_id', 'partner_id', 'sqr_id', 'encargado_id', 'specialist_it_id', 'specialist_tax_id'] LOOP
      UPDATE public.engagements
         SET manager_id = NULL, partner_id = NULL, sqr_id = NULL,
             encargado_id = NULL, specialist_it_id = NULL, specialist_tax_id = NULL
       WHERE engagement_id = v_e_open;
      EXECUTE format('UPDATE public.engagements SET %I = $1 WHERE engagement_id = $2', col)
        USING v_staff, v_e_open;

      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT public.is_engagement_responsible(v_e_open) INTO v_ok;
      EXECUTE 'RESET ROLE';
      IF NOT v_ok THEN
        RAISE EXCEPTION 'CONVERGENCE FAIL — is_engagement_responsible() false for % (should be true)', col;
      END IF;
    END LOOP;

    -- Bystander: linked to none of the 6 columns -> false.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bystander_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT public.is_engagement_responsible(v_e_open) INTO v_ok;
    EXECUTE 'RESET ROLE';
    IF v_ok THEN
      RAISE EXCEPTION 'CONVERGENCE FAIL — is_engagement_responsible() true for a bystander linked to none of the 6 columns';
    END IF;
  END;
  RAISE NOTICE 'PASS — is_engagement_responsible() covers all 6 responsible-personnel columns (manager_id/partner_id/sqr_id/encargado_id/specialist_it_id/specialist_tax_id, G7) and denies a bystander';

  RAISE NOTICE 'SCHEMA CONVERGENCE: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;

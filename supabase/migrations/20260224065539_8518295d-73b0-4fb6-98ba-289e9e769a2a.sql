
-- M3: Bug 0220-56 — Post-migration assertions
DO $$
DECLARE v_count integer;
  v_exact_key text := '0220-56-role-dedup-20260224';
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

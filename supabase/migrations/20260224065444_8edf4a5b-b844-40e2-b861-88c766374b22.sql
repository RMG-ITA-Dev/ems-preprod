
-- M1: Bug 0220-56 — Role dedup + UNIQUE(user_id)
-- Creates migration_run_log, backs up user_roles, deduplicates, replaces constraint

CREATE TABLE IF NOT EXISTS public.migration_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_key text NOT NULL UNIQUE,
  backup_table_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_by text DEFAULT current_user
);

DO $$
DECLARE
  v_key text := '0220-56-role-dedup-20260224';
  v_backup text := 'user_roles_backup_0220_56_20260224';
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

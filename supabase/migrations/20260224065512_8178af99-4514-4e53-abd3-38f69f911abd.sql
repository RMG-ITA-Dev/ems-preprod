
-- M2: Bug 0220-56 — Schema + RPC + Audit log

-- Add default_app_role to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS default_app_role app_role;

-- Fail-fast category validation
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

-- Backfill default_app_role
UPDATE categories SET default_app_role = 'partner' WHERE category_name = 'Socio';
UPDATE categories SET default_app_role = 'sqr' WHERE category_name = 'SQR';
UPDATE categories SET default_app_role = 'director' WHERE category_name = 'Director';
UPDATE categories SET default_app_role = 'manager' WHERE category_name = 'Gerente';
UPDATE categories SET default_app_role = 'senior' WHERE category_name IN ('Supervisor','Senior');
UPDATE categories SET default_app_role = 'semisenior' WHERE category_name = 'Semi-Senior';
UPDATE categories SET default_app_role = 'staff' WHERE category_name = 'Asistente';
UPDATE categories SET default_app_role = 'specialist_it' WHERE category_name = 'Especialista IT';
UPDATE categories SET default_app_role = 'specialist_tax' WHERE category_name = 'Especialista TAX';

-- Create audit log with RLS, NO permissive INSERT policy
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

CREATE POLICY "Admins can view lifecycle audit"
  ON public.user_lifecycle_audit_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- admin_set_user_role RPC
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

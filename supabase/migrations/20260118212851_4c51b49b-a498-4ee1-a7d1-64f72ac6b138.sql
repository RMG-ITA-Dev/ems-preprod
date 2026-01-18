-- Create atomic role assignment function with advisory lock
-- This function prevents race conditions when multiple users sign up simultaneously
CREATE OR REPLACE FUNCTION public.assign_user_role_atomic(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_count integer;
  v_assigned_role text;
  v_existing_role text;
BEGIN
  -- Acquire advisory lock to prevent race condition
  -- Lock ID 12345 is reserved for first-user-admin check
  PERFORM pg_advisory_xact_lock(12345);
  
  -- Check if user already has a role
  SELECT role::text INTO v_existing_role
  FROM user_roles
  WHERE user_id = p_user_id;
  
  IF v_existing_role IS NOT NULL THEN
    RETURN jsonb_build_object(
      'role', v_existing_role,
      'isFirstUser', false,
      'message', 'Role already assigned'
    );
  END IF;
  
  -- Count existing roles
  SELECT count(*) INTO v_role_count FROM user_roles;
  
  -- First user gets admin, others get staff
  IF v_role_count = 0 THEN
    v_assigned_role := 'admin';
  ELSE
    v_assigned_role := 'staff';
  END IF;
  
  -- Insert the role
  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, v_assigned_role::app_role);
  
  -- Lock is automatically released when transaction commits
  RETURN jsonb_build_object(
    'role', v_assigned_role,
    'isFirstUser', v_role_count = 0
  );
END;
$$;

-- Grant execute permission to service role (for edge function)
GRANT EXECUTE ON FUNCTION public.assign_user_role_atomic(uuid) TO service_role;
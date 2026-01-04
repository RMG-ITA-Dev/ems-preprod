-- Function to get all users with their roles (admin only)
CREATE OR REPLACE FUNCTION get_all_user_roles()
RETURNS TABLE (
  role_id uuid,
  user_id uuid,
  email text,
  role app_role,
  staff_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ur.id as role_id,
    ur.user_id,
    au.email::text,
    ur.role,
    COALESCE(s.first_name || ' ' || s.last_name, NULL) as staff_name,
    ur.created_at
  FROM user_roles ur
  JOIN auth.users au ON ur.user_id = au.id
  LEFT JOIN staff s ON s.auth_user_id = au.id
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY ur.created_at DESC;
$$;
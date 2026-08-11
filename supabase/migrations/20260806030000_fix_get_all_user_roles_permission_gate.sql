-- Convergencia dev-scheduler + feat/roles-permisos — corrige el gate de get_all_user_roles().
--
-- Por qué: 20260729000000_authz_fase8_ui_role_key.sql gatea este RPC por
-- `role_key = 'admin' OR role = 'admin'` (chequeo directo del enum/role_key del caller), en vez de
-- `has_permission('user_role.read')`. La matriz (authz_fase2_seed.sql:298-299) otorga ese permiso
-- también a `it_security_manager`, y Settings.tsx:94 (`canRolesTab = can("user_role.read")`) ya le
-- muestra el tab Roles en el frontend. Resultado: a ese rol la app lo invita a la pantalla y el RPC
-- le devuelve 0 filas sin ningún aviso — un permiso otorgado por la matriz que no funciona.
--
-- Fix: usar has_permission('user_role.read') como en el resto del motor de autorización. Cubre a
-- `admin` igual que antes (tiene esa concesión en el catálogo) sin depender del enum legacy — no
-- hace falta el fallback `OR role = 'admin'` porque has_permission() ya lee solo role_key, inmune
-- al desalineamiento del espejo que motivaba ese fallback. Mismo tipo de retorno, CREATE OR REPLACE
-- sin DROP. Aditiva/de cola, no toca el contenido de ninguna migración existente.

CREATE OR REPLACE FUNCTION public.get_all_user_roles()
RETURNS TABLE (
  role_id    uuid,
  user_id    uuid,
  email      text,
  role       app_role,
  role_key   text,
  staff_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ur.id AS role_id,
    ur.user_id,
    au.email::text,
    ur.role,
    ur.role_key,
    COALESCE(s.first_name || ' ' || s.last_name, NULL) AS staff_name,
    ur.created_at
  FROM user_roles ur
  JOIN auth.users au ON ur.user_id = au.id
  LEFT JOIN staff s ON s.auth_user_id = au.id
  WHERE public.has_permission('user_role.read')
  ORDER BY ur.created_at DESC;
$$;

-- Validación (contra Postgres aislado — no ejecutar desde R-APP):
--   impersonando it_security_manager: select * from get_all_user_roles(); -> N filas, no 0
--   impersonando admin: mismo resultado que antes de este fix
--   impersonando un role_key sin user_role.read (ej. senior): 0 filas (fail-closed, sin cambio)

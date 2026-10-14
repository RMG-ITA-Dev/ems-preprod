-- Carril B, etapa B2 del barrido de seguridad RLS: lectura de public.user_roles (BAR-001, lectura).
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Idempotente (ENABLE RLS y
-- DROP POLICY IF EXISTS + CREATE POLICY): se aplica primero a mano en Dev 2.0 para probar y después
-- con `db push`, que la registra en el ledger. Cada etapa del Carril B va en su propio archivo.
--
-- Antes de B2 cualquier usuario con sesión leía el mapa completo de quién tiene qué rol (32 filas en
-- Dev 2.0, 89 en Test), porque la tabla no tenía RLS: las dos políticas de cero_05 nunca rigieron.
-- El Carril A ya cerró la escritura y el acceso de `anon`; esto cierra la lectura de `authenticated`.
--
-- Regla (decisión del operador, 08/10/2026): cada uno ve su propia fila; ven todas las filas el admin
-- y quien tenga `user_role.read` (hoy admin e it_security_manager). La escritura no pasa por RLS
-- ni por política alguna: `authenticated` no tiene INSERT/UPDATE/DELETE (cero_06) y los cambios de
-- rol van por RPC SECURITY DEFINER (admin_set_user_role*) o por service_role, que salta RLS.
--
-- Consumidores revisados el 12/10/2026 (ninguno cambia de comportamiento):
--   · useAuth, useUserRole y assign-user-role leen solo la fila del propio usuario.
--   · StaffForm lee el rol de OTRO usuario, pero solo con `user_role.update` (solo admin).
--   · unlock-account, manage-auth-user, dashboard-data y los handlers del scheduler usan service_role
--     o filtran por el id del llamador.
--   · Las 33 funciones de `public` que leen la tabla son SECURITY DEFINER con el mismo dueño que la
--     tabla (postgres) y la tabla no usa FORCE ROW LEVEL SECURITY, así que RLS no las alcanza.
--   · Las políticas de timesheet_periods/timesheet_line_approvals que consultan user_roles filtran por
--     `user_id = auth.uid()`: les basta con la fila propia.
--   · vw_staffing_alerts (security_invoker) busca las filas de administradores, pero solo los admins
--     reciben esas alertas (el hook filtra por staff_id propio) y el admin conserva la vista completa.

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Las dos políticas de cero_05 no tenían TO (regían para PUBLIC) y la de admin era FOR ALL sin que
-- exista ningún privilegio de escritura que la use. Se reemplazan por una sola, de lectura.
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;

-- is_admin() y has_permission() son SECURITY DEFINER: leen user_roles como su dueño, sin recursión.
CREATE POLICY "user_roles_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_admin())
    OR (SELECT public.has_permission('user_role.read'))
  );

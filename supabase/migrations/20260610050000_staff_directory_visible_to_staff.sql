-- Fund Requests — Phase 6: permitir que cualquier staff vinculado vea
-- el directorio de staff activo (campos no sensibles) para poder popular
-- el dropdown de "Gerente Aprobador" en la solicitud de fondos.
--
-- Sin esta policy, un usuario con rol 'staff' (Asistente, Senior, etc.)
-- solo puede ver su propio registro, por lo que useCategoryStaff()
-- devuelve lista vacía y el dropdown queda bloqueado.
--
-- IMPORTANTE:
-- - Solo abre SELECT, no INSERT/UPDATE/DELETE.
-- - Solo expone staff ACTIVO (is_active = true).
-- - Requiere que el viewer también tenga staff vinculado.
-- - Los campos sensibles (email, id_number, auth_user_id, etc.) siguen
--   protegidos a nivel de aplicación: useStaff() solo selecciona
--   staff_id, first_name, last_name, short_name, initials, category_id,
--   city, is_active — nunca PII.

DROP POLICY IF EXISTS "Authenticated staff can view active staff directory" ON public.staff;
CREATE POLICY "Authenticated staff can view active staff directory" ON public.staff
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND get_my_staff_id() IS NOT NULL
  );

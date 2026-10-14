-- Carril B / B6: un auth_user_id no puede estar en dos fichas de staff activas.
--
-- Hasta aqui nada lo impedia: no habia UNIQUE sobre staff.auth_user_id (solo la FK a auth.users). B3e (20261013120000) cerro
-- el secuestro de identidad por la API (ya nadie salvo admin escribe en staff), pero la regla de integridad seguia sin
-- expresarse en la base: get_my_staff_id() y las politicas que dependen de el asumen UNA ficha por usuario, y una ficha
-- duplicada (por un UPDATE de admin, una carga o un SQL a mano) haria que dos personas compartan identidad sin error.
--
-- El indice es PARCIAL y excluye las fichas borradas (deleted_at IS NOT NULL), a proposito:
--   · el borrado logico (useStaffMutations) solo pone deleted_at e is_active=false y CONSERVA auth_user_id;
--   · link_staff_to_auth_user (BEFORE INSERT/UPDATE en staff) y link_auth_user_to_staff (AFTER INSERT en auth.users) ya
--     ignoran las fichas borradas al decidir si un usuario esta libre. Con un indice sobre auth_user_id a secas, dar de baja
--     a alguien y volver a darlo de alta con una ficha nueva (mismo correo, permitido porque idx_staff_email_unique tambien
--     excluye borradas) haria que el trigger enlace la ficha nueva al mismo usuario y el INSERT fallara con 23505.
--   · los dos triggers de enlace nunca asignan un auth_user_id que ya tenga una ficha activa, asi que el indice no rompe
--     el alta de usuarios (probado en rls-carril-b-b6-staff-unique.sql: alta con ficha, sin ficha y con ficha ya enlazada).
--
-- La guarda aborta con un mensaje claro si ya hay duplicados entre fichas activas (el CREATE UNIQUE INDEX fallaria igual,
-- pero con un error que no dice cuales). Idempotente: se aplica dos veces sin efecto.
-- Ejercitado por rls-carril-b-b6-staff-unique.sql y por el check 20 de schema-convergence-assertions.sql.

DO $$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(d.auth_user_id::text || ' (' || d.n || ' fichas)', ', ') INTO v_dups
    FROM (SELECT auth_user_id, count(*) AS n
            FROM public.staff
           WHERE auth_user_id IS NOT NULL AND deleted_at IS NULL
           GROUP BY auth_user_id
          HAVING count(*) > 1) d;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'B6: fichas de staff activas comparten auth_user_id; resuelvalas antes de crear el indice unico: %', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_auth_user_id_unique
  ON public.staff (auth_user_id)
  WHERE auth_user_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.idx_staff_auth_user_id_unique IS
  'B6: una ficha de staff activa por usuario de auth. Parcial: excluye fichas borradas, que conservan su auth_user_id (reingreso con ficha nueva).';

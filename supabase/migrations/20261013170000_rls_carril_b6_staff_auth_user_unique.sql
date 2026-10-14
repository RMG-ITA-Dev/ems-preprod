-- Carril B / B6: un auth_user_id no puede estar en dos fichas de staff, y una ficha dada de baja suelta su usuario.
--
-- Hasta aqui nada lo impedia: no habia UNIQUE sobre staff.auth_user_id (solo la FK a auth.users). B3e (20261013120000) cerro
-- el secuestro de identidad por la API (ya nadie salvo admin escribe en staff), pero la regla de integridad seguia sin
-- expresarse en la base: get_my_staff_id() y las politicas que dependen de el asumen UNA ficha por usuario, y una ficha
-- duplicada (por un UPDATE de admin, una carga o un SQL a mano) haria que dos personas compartan identidad sin error.
--
-- La baja logica (useStaffMutations) solo ponia deleted_at e is_active=false y CONSERVABA auth_user_id. Con eso, el reingreso de
-- alguien dado de baja (ficha nueva con el mismo correo; idx_staff_email_unique permite repetirlo porque excluye borradas) dejaba
-- DOS fichas con el mismo usuario: link_staff_to_auth_user ignora a las borradas al decidir si el usuario esta libre. Medido
-- (14/10/2026): get_my_staff_id() devolvia la ficha BORRADA (su cuerpo es SELECT ... WHERE auth_user_id = auth.uid(), sin mirar
-- deleted_at; 13 funciones y 7 politicas mas resuelven la identidad igual) y la consulta del frontend (.eq('auth_user_id') +
-- .maybeSingle(), en useCurrentStaff y useAuth) veia 2 filas. Revision del PR (Codex, P1). Un indice parcial que excluyera a las
-- borradas habria dado ese estado por bueno; en vez de tocar las 21 piezas que resuelven la identidad, se corrige la causa:
--   1) un trigger BEFORE UPDATE suelta el auth_user_id en la misma sentencia en que deleted_at pasa de NULL a un valor
--      (una ficha borrada no se puede restaurar —DELETED_AT_IMMUTABLE en prevent_staff_reactivation—, asi que el enlace
--      nunca hay que recuperarlo);
--   2) esta migracion suelta el enlace de las fichas YA borradas (en Dev 2.0 hay 0);
--   3) el indice UNIQUE es sobre auth_user_id a secas (WHERE auth_user_id IS NOT NULL): un usuario, una ficha, borrada o no.
--      get_my_staff_id() nunca es ambigua. Reemplaza al indice de la primera version de esta migracion, que era parcial y
--      excluia a las borradas (ya aplicada a mano en Dev 2.0 y en el proyecto de prueba; se detecta por mencionar deleted_at).
--
-- Efecto: quien se da de baja queda sin ficha enlazada y useAuth lo bloquea como ya lo hacia (ACCOUNT_INACTIVE al iniciar sesion;
-- un admin dado de baja sigue entrando por el chequeo de user_roles, igual que antes). Cambiar el ROL o cortar las sesiones
-- abiertas al dar de baja es un tema aparte (offboarding), no se toca aqui. notify_staff_events no usa auth_user_id: el aviso de
-- baja no cambia.
--
-- La guarda aborta con un mensaje claro si, tras soltar los enlaces de las borradas, hay fichas que comparten usuario (el
-- CREATE UNIQUE INDEX fallaria igual, pero con un error que no dice cuales). Idempotente: se aplica dos veces sin efecto.
-- Ejercitado por rls-carril-b-b6-staff-unique.sql y por el check 20 de schema-convergence-assertions.sql.

-- 1) fichas YA borradas: sueltan su usuario (en el UPDATE ya no corre el enlace por correo: NEW.deleted_at no es NULL)
UPDATE public.staff
   SET auth_user_id = NULL
 WHERE deleted_at IS NOT NULL AND auth_user_id IS NOT NULL;

-- 2) guarda: ningun usuario en dos fichas
DO $$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(d.auth_user_id::text || ' (' || d.n || ' fichas)', ', ') INTO v_dups
    FROM (SELECT auth_user_id, count(*) AS n
            FROM public.staff
           WHERE auth_user_id IS NOT NULL
           GROUP BY auth_user_id
          HAVING count(*) > 1) d;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'B6: fichas de staff comparten auth_user_id; resuelvalas antes de crear el indice unico: %', v_dups;
  END IF;
END $$;

-- 3) trigger: la baja suelta el usuario
CREATE OR REPLACE FUNCTION public.staff_release_auth_user_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- WHEN del trigger: OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
  NEW.auth_user_id := NULL;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.staff_release_auth_user_on_delete() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.staff_release_auth_user_on_delete() IS
  'B6: al dar de baja (deleted_at NULL -> valor) la ficha suelta su auth_user_id. Evita dos fichas con el mismo usuario tras un reingreso, que get_my_staff_id() y otras 20 piezas resolverian a la ficha borrada.';

DROP TRIGGER IF EXISTS trg_staff_release_auth_user_on_delete ON public.staff;
CREATE TRIGGER trg_staff_release_auth_user_on_delete
  BEFORE UPDATE OF deleted_at ON public.staff
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.staff_release_auth_user_on_delete();

-- 4) indice unico sobre auth_user_id a secas; reemplaza al de la primera version (parcial por deleted_at)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes
              WHERE schemaname = 'public' AND indexname = 'idx_staff_auth_user_id_unique' AND indexdef LIKE '%deleted_at%') THEN
    DROP INDEX public.idx_staff_auth_user_id_unique;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_auth_user_id_unique
  ON public.staff (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON INDEX public.idx_staff_auth_user_id_unique IS
  'B6: un usuario de auth, una ficha de staff (borrada o no). La baja suelta el enlace (trg_staff_release_auth_user_on_delete), asi que el reingreso con ficha nueva no choca.';

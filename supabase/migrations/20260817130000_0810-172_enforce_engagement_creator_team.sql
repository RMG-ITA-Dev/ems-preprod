-- BUG 0810-172 — refuerzo en BD de la asignación automática del Socio/Director o Gerente al CREAR
-- un encargo.
--
-- Problema: `create_engagement_with_code` valida oficina, práctica, función, año fiscal, fecha de
-- cierre, sociedad y taxonomía, y tiene un gate de admin para el override del año fiscal, pero
-- `p_partner_id` y `p_manager_id` viajan DIRECTO al INSERT sin ninguna verificación (ni de rol, ni
-- de servicio, ni de auto-asignación). La policy de INSERT solo exige `has_permission
-- ('engagement.create')`. Consecuencia: cualquier usuario con ese permiso puede llamar el RPC desde
-- la consola del navegador con el partner_id/manager_id que quiera. Un bloqueo solo de UI no es un
-- bloqueo.
--
-- POR QUÉ UN TRIGGER Y NO RE-EMITIR EL RPC (decisión de síntesis, plan_v2 §Comparison Matrix):
--   1. `CREATE OR REPLACE` del RPC exige copiar BYTE A BYTE su firma de 24 parámetros. Un solo
--      nombre o tipo distinto crea un OVERLOAD en vez de reemplazar — y 20260813120000 trata
--      exactamente eso como error fatal (su postcondición aborta si sobrevive más de 1 firma),
--      porque ya se observó drift de overloads vivos en los fingerprints de las 3 rutas.
--   2. El trigger cubre además el INSERT DIRECTO por REST, que el RPC no puede proteger.
--   3. RLS no sirve para esto: no puede reescribir valores, y no se aplica al INSERT que hace un
--      RPC `SECURITY DEFINER`.
--
-- CANONIZAR Y NO RECHAZAR: se sobrescribe el valor enviado en vez de lanzar excepción. Con la UI
-- bloqueada, el valor canónico es EXACTAMENTE el que el usuario ve, así que no se introduce ningún
-- modo de falla nuevo; rechazar dejaría sin salida al usuario ante cualquier deriva front/back.
--
-- SOLO `INSERT` (decisión del operador 2026-08-17): el packet pide la regla "durante la creación
-- del encargo". Consecuencia aceptada: un Gerente puede crear con él mismo forzado y DESPUÉS editar
-- el encargo para poner a otro — el camino de UPDATE queda gobernado por la policy
-- "engagements write update", sin este guard.
--
-- `auth.uid()` funciona dentro del RPC `SECURITY DEFINER`: lee el GUC `request.jwt.claims` que
-- setea PostgREST, y `SECURITY DEFINER` cambia el rol de ejecución pero no ese GUC.
--
-- Aditiva y de cola: no toca el contenido de ninguna migración existente, ni la definición del RPC.
-- Idempotente (`CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS`/`CREATE TRIGGER`), así que se puede
-- re-pegar en el SQL Editor tras un apply parcial sin fallar.

CREATE OR REPLACE FUNCTION public.enforce_engagement_creator_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  text;
  v_staff uuid;
BEGIN
  -- Sin identidad autenticada no hay a quién asignar: seeds, imports, migraciones de backfill y
  -- cualquier operación con service_role pasan intactas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Espejo EXACTO del `isAdmin` del formulario (`roleKey === "admin"` vía
  -- get_my_authorization_context). A PROPÓSITO no se usa public.is_admin(): esa helper lee el enum
  -- LEGACY `user_roles.role` (20260107032620, nunca redefinida), no `role_key`. Un usuario con
  -- role_key = 'admin' cuyo espejo legacy no diga 'admin' vería su elección reescrita pese a que la
  -- UI se la ofrece editable.
  v_role := public.current_role_key();
  IF v_role IS NULL OR v_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Sin staff vinculado no hay `staff_id` que canonizar. Se deja el payload intacto: escribir NULL
  -- en un campo que el negocio considera obligatorio sería peor, y rechazar dejaría al usuario sin
  -- forma de crear nada. Es el mismo criterio fail-open que aplica la UI, que en ese caso tampoco
  -- bloquea el campo.
  v_staff := public.get_my_staff_id();
  IF v_staff IS NULL THEN
    RETURN NEW;
  END IF;

  -- ESPEJO de src/lib/engagementSelfAssignment.ts (SELF_ASSIGN_PARTNER_ROLE_KEYS /
  -- SELF_ASSIGN_MANAGER_ROLE_KEYS). Si se toca uno, tocar el otro.
  --
  -- Solo los roles BASE, igual que el mapa de candidatos de 0722-162. Quedan deliberadamente FUERA
  -- (sin restricción alguna): ita_manager y tax_manager — que sí tienen engagement.create pero
  -- pertenecen a los grupos specialist_it/specialist_tax y por lo tanto no son candidatos elegibles
  -- para el campo Gerente — más senior_partner, risk_partner, risk_supervisor,
  -- it_security_manager, accounting_*, hr_*, sqr, senior, semisenior y assistant.
  IF v_role IN ('partner', 'director') THEN
    NEW.partner_id := v_staff;
  ELSIF v_role = 'manager' THEN
    NEW.manager_id := v_staff;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_engagement_creator_team() IS
  'BUG 0810-172: en la CREACIÓN de un encargo canoniza partner_id/manager_id al staff del llamante '
  'según su role_key (partner/director -> partner_id; manager -> manager_id). Exentos: role_key '
  'admin, inserts sin auth.uid() (seeds/service_role) y llamantes sin staff vinculado. Espejo de '
  'src/lib/engagementSelfAssignment.ts. Solo INSERT: el UPDATE no aplica esta regla.';

-- Orden frente al trigger ya existente `trg_engagements_created_by` (20260730040000): los BEFORE
-- INSERT disparan en orden alfabético por nombre, así que created_by corre primero — pero son
-- independientes de todos modos (columnas distintas, ninguno lee lo que escribe el otro).
DROP TRIGGER IF EXISTS trg_engagements_creator_team ON public.engagements;
CREATE TRIGGER trg_engagements_creator_team
  BEFORE INSERT ON public.engagements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_engagement_creator_team();

-- ────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN (impersonando; no ejecutar desde R-APP). La batería completa y transaccional está en
-- supabase/tests/trigger-engagement-creator-team.sql, que se puede pegar tal cual en el SQL Editor
-- (termina SIEMPRE en ROLLBACK).
--
--   -- 1. El trigger existe y es solo de INSERT:
--   select tgname, tgtype from pg_trigger
--    where tgrelid = 'public.engagements'::regclass and not tgisinternal;
--
--   -- 2. El RPC NO fue tocado por esta migración — debe seguir habiendo exactamente 1 firma:
--   select count(*) from pg_proc
--    where proname = 'create_engagement_with_code' and pronamespace = 'public'::regnamespace;
--
--   -- 3. Como Gerente, creando y mandando el manager_id de otra persona: debe persistir el propio.
--   --    Como admin: deben persistir los valores enviados, sin reescritura.
-- ────────────────────────────────────────────────────────────────────────────

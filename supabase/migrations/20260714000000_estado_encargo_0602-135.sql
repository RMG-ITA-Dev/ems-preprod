-- FEAT 0602-135: máquina de estados del encargo (9 estados).
-- Consolida en una sola migración idempotente:
--   (1) columna de override manual del estado,
--   (2) gating de horas por estado terminal en el trigger check_wo_approved,
--   (3) auto-cierre (7 Finalizado) vía pg_cron.
-- Ver bugs/0602-135/plan_v2.md. Seguro de re-ejecutar.

-- ============================================================================
-- 1) Override manual/terminal del estado del encargo (1..9). NULL = derivado de la OT.
--    6 Cancelado / 7 Finalizado / 9 Congelado son terminales; el 7 lo escribe el cron.
-- ============================================================================
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS engagement_state_override smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'engagements_state_override_check'
  ) THEN
    ALTER TABLE public.engagements
      ADD CONSTRAINT engagements_state_override_check
      CHECK (engagement_state_override IS NULL OR engagement_state_override BETWEEN 1 AND 9);
  END IF;
END $$;

COMMENT ON COLUMN public.engagements.engagement_state_override IS
  'FEAT 0602-135: override manual del estado del encargo (1..9). NULL = derivado de la OT. '
  '6 Cancelado / 7 Finalizado / 9 Congelado son terminales; 7 lo escribe el cron finalize-engagements.';

-- Backfill de estados legacy (Codex): la UI nueva deriva el estado de override/OT e ignora el
-- campo `status` legacy ('active'/'pending'/'completed'/'cancelled'). Sin backfill, un encargo
-- 'cancelled'/'completed' se mostraría como Aprobado. Se mapea SOLO los estados terminales legacy:
--   cancelled -> 6 Cancelado, completed -> 7 Finalizado.
-- 'active'/'pending' quedan en NULL a propósito (derivan de la OT; los aprobados vencidos los
-- finaliza el cron/trigger). Idempotente: solo filas con override aún NULL (no pisa overrides ya
-- fijados). Corre antes de crear los triggers de estado, así que no los dispara en la 1ra aplicación.
UPDATE public.engagements
   SET engagement_state_override = 6
 WHERE status = 'cancelled' AND engagement_state_override IS NULL;

UPDATE public.engagements
   SET engagement_state_override = 7
 WHERE status = 'completed' AND engagement_state_override IS NULL;

-- ============================================================================
-- 2) Gating de horas (Política 13). Espejo EXACTO de canLogHours (frontend): solo los
--    estados 4 Aprobado y 5 Aprobado de emergencia permiten cargar horas.
--    - Si hay override manual (1..9), ESE determina la carga: 4/5 permiten (y saltan el
--      chequeo de OT, porque el override gana sobre la OT); cualquier otro (1,2,3,6,7,8,9)
--      la bloquea — incluye encargos administrativos.
--    - Sin override: estado derivado de la OT (bypass administrativo o OT aprobada), que
--      corresponde a los estados 4/5 derivados.
--    Mantiene el patrón de redefinición vía trailing migration (check_wo_approved ya se
--    redefine en 20251204065852 / 20260217221721 / 20260217233439). CREATE OR REPLACE
--    preserva el trigger existente sobre time_entries.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_wo_approved()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_wo_required boolean;
  v_override    smallint;
BEGIN
  SELECT work_order_required, engagement_state_override
    INTO v_wo_required, v_override
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  -- FEAT 0602-135: el override manual manda. Solo 4/5 permiten cargar; el resto bloquea.
  IF v_override IS NOT NULL THEN
    IF v_override NOT IN (4, 5) THEN
      RAISE EXCEPTION 'Cannot log time: engagement state (override %) does not allow logging', v_override;
    END IF;
    RETURN NEW;  -- override 4/5: aprobado manualmente, salta el chequeo de OT
  END IF;

  -- Sin override → estado derivado de la OT.
  -- Non-WO-required engagements bypass the WO approval check
  IF v_wo_required IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- WO approval check. FEAT 0602-135: excluye OT con Riesgos rechazado — useRejectRisk deja
  -- approval_status='Approved' pero risk_status='Rejected', que la máquina trata como estado 8
  -- Rechazado (no cargable). Sin este filtro el gate permitiría horas en un encargo rechazado.
  IF NOT EXISTS (
    SELECT 1 FROM work_orders wo
    WHERE wo.engagement_id = NEW.engagement_id
    AND wo.approval_status = 'Approved'
    AND wo.risk_status IS DISTINCT FROM 'Rejected'
  ) THEN
    RAISE EXCEPTION 'Cannot log time: Work Order is not approved';
  END IF;

  RETURN NEW;
END;
$function$;

-- FEAT 0602-135: el gate debe cubrir INSERT y UPDATE. El merge de useTimesheetImport hace UPDATE
-- sobre time_entries existentes; el trigger histórico enforce_wo_approval era BEFORE INSERT solo,
-- así que un encargo Congelado/Cancelado/Finalizado/no-aprobado podía acumular horas por merge sin
-- pasar por el gate de estado. Se consolida en un único trigger BEFORE INSERT OR UPDATE (idempotente;
-- elimina ambos nombres previos para no duplicar).
DROP TRIGGER IF EXISTS enforce_wo_approval ON public.time_entries;
DROP TRIGGER IF EXISTS trg_check_wo_approved ON public.time_entries;
CREATE TRIGGER trg_check_wo_approved
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.check_wo_approved();

-- ============================================================================
-- 3) Auto-cierre (7 Finalizado). Reglas (equipo, iteración 2):
--    - Se basa SOLO en end_date, sin período de gracia: fecha fin 15-jul -> Finalizado el
--      16-jul. "Hoy" en America/La_Paz (UTC-4) para no finalizar un día antes.
--    - SOLO finaliza encargos cuyo estado EFECTIVO sea 4 Aprobado (override=4, o derivado:
--      administrativo, o OT aprobada NO-emergencia). Excluye Pendiente/Aprobado Socio/
--      Aprobado Riesgos/Rechazado/Cancelado/Congelado y también Aprobado de emergencia (5).
--    - Se aplica por dos vías con la MISMA regla (helper compartido):
--        (a) cron diario (paso del tiempo),
--        (b) trigger al editar end_date (recálculo inmediato, cualquier rol que edite).
-- ============================================================================

-- Helper: ¿el estado EFECTIVO del encargo es 4 Aprobado? (fuente única de la regla)
CREATE OR REPLACE FUNCTION public.engagement_is_approved_state(
  p_engagement_id uuid,
  p_override       smallint,
  p_wo_required    boolean
) RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Override manual gana: solo el 4 (Aprobado) cuenta como aprobado.
  IF p_override IS NOT NULL THEN
    RETURN p_override = 4;
  END IF;
  -- Derivado: administrativo (sin OT) = Aprobado.
  IF p_wo_required = false THEN
    RETURN true;
  END IF;
  -- Derivado: estado 4 Aprobado = OT aprobada, NO en emergencia (sería 5) y NO risk-rejected
  -- (sería 8 Rechazado). Ambos se excluyen del auto-cierre.
  RETURN EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.engagement_id = p_engagement_id
      AND wo.approval_status = 'Approved'
      AND wo.risk_status IS DISTINCT FROM 'Emergency_Approved'
      AND wo.risk_status IS DISTINCT FROM 'Rejected'
  );
END;
$function$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.finalize_due_engagements()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.engagements e
     SET engagement_state_override = 7,   -- 7 Finalizado
         updated_at = now()
   WHERE e.end_date IS NOT NULL
     AND e.end_date < (now() AT TIME ZONE 'America/La_Paz')::date
     -- Solo estado efectivo Aprobado (4). Un override 7 ya fijado devuelve false → idempotente.
     AND public.engagement_is_approved_state(e.engagement_id, e.engagement_state_override, e.work_order_required);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- Recálculo inmediato al editar end_date (solo actúa cuando end_date cambia; no interfiere con
-- otras ediciones ni con el UPDATE del cron, que no toca end_date). Dos direcciones:
--   (a) Forward: fecha fin ya pasó y estado Aprobado (4) → Finalizado (7). Cualquier rol que
--       pueda editar la fecha (Admin + team members).
--   (b) Reapertura (Política 6, Opción 1): un Finalizado (7) cuya nueva fecha fin es hoy/futura
--       vuelve a Aprobado. SOLO Admin (is_admin()) — el frontend además bloquea a no-admins editar
--       fechas de un Finalizado. Si la OT deriva a Aprobado se limpia el override (queda ligado a
--       la OT); si no, se fija override=4 para garantizar Aprobado.
CREATE OR REPLACE FUNCTION public.recompute_engagement_finalization()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Recalcular si cambia end_date O el override. (Codex P2: limpiar/cambiar el override de un
  -- encargo cuya fecha fin ya pasó debía re-evaluar la finalización, no esperar al cron.)
  IF TG_OP = 'UPDATE'
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
     AND NEW.engagement_state_override IS NOT DISTINCT FROM OLD.engagement_state_override THEN
    RETURN NEW;
  END IF;

  -- (a) Forward → Finalizado
  IF NEW.end_date IS NOT NULL
     AND NEW.end_date < (now() AT TIME ZONE 'America/La_Paz')::date
     AND public.engagement_is_approved_state(NEW.engagement_id, NEW.engagement_state_override, NEW.work_order_required)
  THEN
    NEW.engagement_state_override := 7;  -- Finalizado
    RETURN NEW;
  END IF;

  -- (b) Reapertura → Aprobado (solo Admin, y solo si el estado sigue marcado Finalizado)
  IF TG_OP = 'UPDATE'
     AND OLD.engagement_state_override = 7
     AND NEW.engagement_state_override = 7
     AND (NEW.end_date IS NULL OR NEW.end_date >= (now() AT TIME ZONE 'America/La_Paz')::date)
     AND public.is_admin()
  THEN
    IF public.engagement_is_approved_state(NEW.engagement_id, NULL, NEW.work_order_required) THEN
      NEW.engagement_state_override := NULL;  -- vínculo con la OT (derivado = Aprobado)
    ELSE
      NEW.engagement_state_override := 4;     -- fijar Aprobado
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_recompute_engagement_finalization ON public.engagements;
CREATE TRIGGER trg_recompute_engagement_finalization
  BEFORE INSERT OR UPDATE ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_engagement_finalization();

-- Programación idempotente del cron: desprogramar si ya existe y volver a programar.
-- '30 4 * * *' UTC ≈ 00:30 America/La_Paz.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finalize-engagements') THEN
    PERFORM cron.unschedule('finalize-engagements');
  END IF;
  PERFORM cron.schedule(
    'finalize-engagements',
    '30 4 * * *',
    $cron$SELECT public.finalize_due_engagements();$cron$
  );
END $$;

-- ============================================================================
-- 4) RLS: el SQR ASIGNADO al encargo (engagements.sqr_id) aprueba/rechaza la pista de Riesgos,
--    lo que actualiza work_orders. La UPDATE RLS previa solo permitía admin o team (partner/manager),
--    así que el SQR asignado fallaba por RLS. Se le concede UPDATE SOLO sobre las OT de los encargos
--    donde es el SQR asignado — mismo modelo/alcance que un team member (is_engagement_team_member),
--    no un permiso global. (Codex: evita que cualquier SQR toque cualquier OT.)
--
--    DECISIÓN DE DISEÑO (aceptada por el equipo, review Codex): RLS es a nivel de fila, no de
--    columna, así que esta policy permite al SQR asignado actualizar cualquier columna de la OT de
--    SUS encargos — el MISMO alcance que ya tienen partner/manager vía "Team can manage engagement
--    work orders". El SQR asignado se considera miembro del equipo del encargo (se asigna en el
--    apartado de Equipo). No es un permiso nuevo/mayor que el de partner/manager. Si en el futuro se
--    quisiera least-privilege estricto (SQR solo campos de riesgo), habría que mover las mutaciones de
--    riesgo a RPCs SECURITY DEFINER y quitar esta policy UPDATE (dejando solo la SELECT de abajo).
-- ============================================================================
DROP POLICY IF EXISTS "SQR can update work orders for risk approval" ON public.work_orders;
DROP POLICY IF EXISTS "Assigned SQR can update work orders" ON public.work_orders;
CREATE POLICY "Assigned SQR can update work orders" ON public.work_orders
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.engagements e
    WHERE e.engagement_id = work_orders.engagement_id
      AND e.sqr_id = public.get_my_staff_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.engagements e
    WHERE e.engagement_id = work_orders.engagement_id
      AND e.sqr_id = public.get_my_staff_id()
  ));

-- El SQR asignado también necesita SELECT: useWorkOrderById carga la OT con un SELECT directo, y las
-- policies de SELECT previas solo cubren team (partner/manager) + admin. Sin esto, el SQR asignado no
-- puede abrir la OT para aprobar Riesgos. (Codex P2)
DROP POLICY IF EXISTS "Assigned SQR can view work orders" ON public.work_orders;
CREATE POLICY "Assigned SQR can view work orders" ON public.work_orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.engagements e
    WHERE e.engagement_id = work_orders.engagement_id
      AND e.sqr_id = public.get_my_staff_id()
  ));

-- ============================================================================
-- 5) Vista RLS-safe para el estado de la OT en el badge del encargo.
--    engagements es legible por todos los autenticados, pero work_orders SELECT es team/admin-only.
--    El badge (listas legibles por todos) necesita el estado de la OT para derivarlo. Esta vista
--    expone SOLO los 3 campos de estado (no presupuesto/cliente/notas). security_invoker=false →
--    corre con privilegios del owner y no se filtra por la RLS de work_orders.
-- ============================================================================
CREATE OR REPLACE VIEW public.engagement_wo_state
  WITH (security_invoker = false)
AS
  SELECT engagement_id, approval_status, approved_at, risk_status
  FROM public.work_orders;

GRANT SELECT ON public.engagement_wo_state TO authenticated;

-- ============================================================================
-- 6) Autorización server-side del override de estado (engagement_state_override).
--    check_wo_approved confía en este campo para permitir/bloquear horas, así que no basta el guard
--    del frontend: la policy "Team can update engagements" deja a partner/manager escribir cualquier
--    columna de sus encargos. Este trigger valida quién puede CAMBIAR el override (espejo del frontend):
--      - Admin: cualquier valor.
--      - Gerente (manager): solo congelar/descongelar (Aprobado↔Congelado): null→9 o 9→null, y solo si
--        el estado DERIVADO es Aprobado.
--      - Otros roles: no pueden cambiarlo.
--    Operaciones de sistema (cron/service_role, sin auth.uid()) pasan. Corre ANTES de
--    trg_recompute_engagement_finalization (orden alfabético: "authorize" < "recompute"), así valida el
--    cambio que trae el usuario; el override=7/reapertura que fija el recálculo es acción de sistema posterior.
--
--    También aplica el bloqueo de EDICIÓN DE FECHAS por no-admin en estados terminales (Decisión A):
--    si el estado actual (override) es 6 Cancelado / 7 Finalizado / 9 Congelado, un no-admin no puede
--    cambiar start_date/end_date/fecha_cierre (espejo de datesLockedByState del frontend). El Admin sí
--    (necesario para reabrir un Finalizado extendiendo la fecha fin).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.authorize_engagement_state_override()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Sistema (cron/service_role/definer sin sesión): sin auth.uid() → permitir.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.engagement_state_override IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'No autorizado a fijar el estado del encargo';
    END IF;
    RETURN NEW;
  END IF;

  -- Decisión A (Codex): bloqueo server-side de edición de fechas por no-admin cuando el estado
  -- actual es terminal (override 6/7/9). Debe evaluarse aunque el override no cambie.
  IF NOT public.is_admin()
     AND OLD.engagement_state_override IN (6, 7, 9)
     AND (
       NEW.start_date   IS DISTINCT FROM OLD.start_date
       OR NEW.end_date  IS DISTINCT FROM OLD.end_date
       OR NEW.fecha_cierre IS DISTINCT FROM OLD.fecha_cierre
     )
  THEN
    RAISE EXCEPTION 'No autorizado a editar fechas de un encargo Cancelado/Finalizado/Congelado';
  END IF;

  -- UPDATE: validación del override solo si cambia.
  IF NEW.engagement_state_override IS NOT DISTINCT FROM OLD.engagement_state_override THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Gerente: congelar (null→9) o descongelar (9→null), solo con estado derivado Aprobado.
  IF public.has_role(auth.uid(), 'manager'::public.app_role)
     AND public.engagement_is_approved_state(NEW.engagement_id, NULL, NEW.work_order_required)
     AND (
       (OLD.engagement_state_override IS NULL AND NEW.engagement_state_override = 9)
       OR (OLD.engagement_state_override = 9 AND NEW.engagement_state_override IS NULL)
     )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'No autorizado a cambiar el estado del encargo (override)';
END;
$function$;

DROP TRIGGER IF EXISTS trg_authorize_engagement_state_override ON public.engagements;
CREATE TRIGGER trg_authorize_engagement_state_override
  BEFORE INSERT OR UPDATE ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.authorize_engagement_state_override();

-- ============================================================================
-- 7) Solicitudes de fondos: bloquear por estado efectivo del encargo.
--    El spec de los 9 estados dice que Congelado(9)/Finalizado(7) no admiten "solicitudes de gastos",
--    y el hint de la UI lo promete, pero el gate de estado solo estaba en time_entries. Fondos
--    (vista del dropdown + trigger fr_wo_validate_approved) aceptaba cualquier OT 'Approved'. Se
--    replica el mismo criterio que el gate de horas: solo estado efectivo 4/5 admite solicitudes.
-- ============================================================================

-- Helper compartido: ¿el encargo admite horas/solicitudes? (estado efectivo 4 Aprobado o 5 Emergencia).
-- Misma regla que check_wo_approved (gate de horas), centralizada para Fondos.
CREATE OR REPLACE FUNCTION public.engagement_allows_hours_or_requests(p_engagement_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_override    smallint;
  v_wo_required boolean;
  v_approval    text;
  v_risk        text;
BEGIN
  SELECT e.engagement_state_override, e.work_order_required
    INTO v_override, v_wo_required
  FROM public.engagements e WHERE e.engagement_id = p_engagement_id;

  -- Override manual manda: solo 4/5 permiten.
  IF v_override IS NOT NULL THEN
    RETURN v_override IN (4, 5);
  END IF;
  -- Administrativo (sin OT) = Aprobado.
  IF v_wo_required = false THEN
    RETURN true;
  END IF;
  -- Derivado: OT aprobada y NO risk-rejected (=8 Rechazado).
  SELECT approval_status, risk_status INTO v_approval, v_risk
  FROM public.work_orders WHERE engagement_id = p_engagement_id;
  RETURN v_approval = 'Approved' AND v_risk IS DISTINCT FROM 'Rejected';
END;
$function$;

-- (a) Vista del dropdown: excluir encargos cuyo estado no admite solicitudes. Se reproduce la vista
--     de 20260610190000 + el filtro por estado (CREATE OR REPLACE, mismas columnas).
CREATE OR REPLACE VIEW public.fund_request_selectable_work_orders
WITH (security_invoker = false) AS
SELECT
  wo.wo_id,
  wo.currency,
  wo.approval_status,
  e.engagement_id,
  e.engagement_code,
  e.engagement_name,
  e.manager_id,
  s.staff_id   AS manager_staff_id,
  s.short_name AS manager_short_name,
  s.first_name AS manager_first_name,
  s.last_name  AS manager_last_name
FROM public.work_orders wo
JOIN public.engagements e ON e.engagement_id = wo.engagement_id
LEFT JOIN public.staff s ON s.staff_id = e.manager_id
WHERE wo.approval_status = 'Approved'
  AND get_my_staff_id() IS NOT NULL
  AND public.engagement_allows_hours_or_requests(e.engagement_id);  -- FEAT 0602-135

GRANT SELECT ON public.fund_request_selectable_work_orders TO authenticated;

-- (b) Trigger de validación al asignar una OT a una solicitud: además de 'Approved', el estado
--     efectivo del encargo debe admitir solicitudes. Se reproduce fr_wo_validate_approved
--     (20260610190000) + el chequeo de estado.
CREATE OR REPLACE FUNCTION public.fr_wo_validate_approved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text;
  v_wo_currency text;
  v_fr_currency text;
  v_engagement_id uuid;
BEGIN
  SELECT approval_status, currency, engagement_id
    INTO v_status, v_wo_currency, v_engagement_id
  FROM public.work_orders WHERE wo_id = NEW.wo_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Work order % does not exist', NEW.wo_id;
  END IF;
  IF v_status <> 'Approved' THEN
    RAISE EXCEPTION 'Work order % must be Approved to be allocated (current: %)', NEW.wo_id, v_status;
  END IF;

  -- FEAT 0602-135: el estado efectivo del encargo debe admitir solicitudes (4/5). Bloquea
  -- Congelado(9)/Finalizado(7)/Cancelado(6)/Rechazado(8) y overrides no-cargables.
  IF NOT public.engagement_allows_hours_or_requests(v_engagement_id) THEN
    RAISE EXCEPTION 'El encargo no admite solicitudes de fondos en su estado actual';
  END IF;

  SELECT currency INTO v_fr_currency
  FROM public.fund_requests WHERE fund_request_id = NEW.fund_request_id;
  IF v_wo_currency IS DISTINCT FROM v_fr_currency THEN
    RAISE EXCEPTION 'La moneda de la OT (%) no coincide con la de la solicitud (%)', v_wo_currency, v_fr_currency;
  END IF;

  RETURN NEW;
END;
$$;

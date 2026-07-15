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
  IF TG_OP = 'UPDATE' AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN
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

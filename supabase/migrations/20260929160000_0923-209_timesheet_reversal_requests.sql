-- BUG 0923-209: Solicitar la reversión de boletas de horas aprobadas.
--
-- Hoy la única vía para revertir una boleta aprobada es "Retirar Envío"
-- (unsubmit_timesheet_safe), auto-servicio y restringido a admin/partner/senior_partner en
-- la semana en curso. Este archivo separa SOLICITAR de EJECUTAR (decisiones
-- `granularidad_de_reversion` / `quien_ejecuta` del paquete 0923-209):
--
--   * Cualquier colaborador puede SOLICITAR la reversión de su propia semana (alcance SEMANA).
--   * Un aprobador (manager/ita_manager/tax_manager/hr_manager) puede SOLICITAR la reversión
--     de las líneas que él aprobó dentro de su encargo (alcance ENCARGO).
--   * Sólo el admin EJECUTA (con o sin solicitud previa) y RECHAZA, siempre con razón.
--
-- No se toca `unsubmit_timesheet_safe`: sigue siendo el auto-servicio del dueño, con su
-- ventana de la semana en curso y sus tests UA1-UA4 intactos. execute_timesheet_reversal()
-- es una función admin-only separada que replica únicamente los pasos 8/9 de esa función
-- para el alcance SEMANA (UPDATE submitted_at + DELETE de las líneas approved), sin la
-- ventana ni el chequeo de dueño.
--
-- Los 3 `type_key` de notificación viven en `approval.*` (no `timesheet.*`): el módulo
-- `timesheet_approval` del catálogo usa ese prefijo (approval.line_approved,
-- approval.revision_requested). El seed generado (02) termina con `delete ... not in (...)`
-- que poda lo no listado; como esta migración corre DESPUÉS (20260929 > 20260911), estas 3
-- filas sobreviven a un reset — quedan fuera del seed generado a propósito.

-- =====================================================================
-- A) Tabla de solicitudes de reversión
-- =====================================================================

CREATE TABLE public.timesheet_reversal_requests (
  request_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id        uuid NOT NULL REFERENCES public.timesheet_periods(period_id) ON DELETE CASCADE,
  scope            text NOT NULL,
  engagement_id    uuid REFERENCES public.engagements(engagement_id),
  requested_by     uuid NOT NULL REFERENCES public.staff(staff_id),
  requested_at     timestamptz NOT NULL DEFAULT now(),
  reason           text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  -- Reversión directa del admin desde la tab "Aprobadas", sin solicitud previa: nace ya
  -- ejecutada, como bitácora de auditoría (decisión "registro del solicitante, fecha y
  -- estado" del JSON aplica también a este camino).
  is_direct        boolean NOT NULL DEFAULT false,
  resolved_by      uuid REFERENCES public.staff(staff_id),
  resolved_at      timestamptz,
  resolution_notes text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT trr_scope_check  CHECK (scope  IN ('engagement','week')),
  CONSTRAINT trr_status_check CHECK (status IN ('pending','executed','rejected')),
  -- El encargo es obligatorio en alcance ENCARGO y prohibido en SEMANA.
  CONSTRAINT trr_scope_engagement_coherence CHECK (
    (scope = 'engagement' AND engagement_id IS NOT NULL)
    OR (scope = 'week' AND engagement_id IS NULL)),
  CONSTRAINT trr_reason_not_empty CHECK (btrim(reason) <> ''),
  -- rechazo_de_solicitud: razón obligatoria también al rechazar.
  CONSTRAINT trr_reject_needs_notes CHECK (
    status <> 'rejected' OR btrim(COALESCE(resolution_notes,'')) <> ''),
  -- is_direct sólo puede nacer ya ejecutada.
  CONSTRAINT trr_direct_is_executed CHECK (NOT is_direct OR status = 'executed')
);

-- Una sola solicitud ABIERTA por destino; las resueltas no compiten.
CREATE UNIQUE INDEX uq_trr_open_week ON public.timesheet_reversal_requests (period_id)
  WHERE status = 'pending' AND scope = 'week';
CREATE UNIQUE INDEX uq_trr_open_engagement
  ON public.timesheet_reversal_requests (period_id, engagement_id)
  WHERE status = 'pending' AND scope = 'engagement';

CREATE INDEX idx_trr_queue     ON public.timesheet_reversal_requests (status, requested_at DESC);
CREATE INDEX idx_trr_requester ON public.timesheet_reversal_requests (requested_by, requested_at DESC);

CREATE TRIGGER update_timesheet_reversal_requests_updated_at
  BEFORE UPDATE ON public.timesheet_reversal_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.timesheet_reversal_requests IS
  '0923-209: solicitudes (y bitácora de reversiones directas del admin) para revertir líneas ya aprobadas de una boleta. El único escritor es la RPC SECURITY DEFINER de este archivo -- sin GRANT de INSERT/UPDATE/DELETE a authenticated.';

-- =====================================================================
-- B) RLS -- sólo SELECT; toda escritura pasa por RPC
-- =====================================================================
--
-- No es preferencia: notify_staff() está REVOKEado de authenticated (notificaciones_01),
-- así que cualquier escritura que deba notificar tiene que ser SECURITY DEFINER.

ALTER TABLE public.timesheet_reversal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY trr_select_visible ON public.timesheet_reversal_requests
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR requested_by = public.get_my_staff_id()
    OR EXISTS (SELECT 1 FROM public.timesheet_periods tp
                WHERE tp.period_id = timesheet_reversal_requests.period_id
                  AND tp.staff_id = public.get_my_staff_id())
    OR (scope = 'engagement'
        AND public.can_approve_timesheet_line(auth.uid(), period_id, engagement_id)));

-- El bootstrap de la plataforma fija `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- TABLES TO anon, authenticated, service_role, postgres` (documentado en
-- cero_06_grants.sql:1801-1814): toda tabla nueva nace con ALL para anon/authenticated, así que
-- sin este REVOKE explícito -- mismo patrón que cero_06 aplica tabla por tabla al hardenizar --
-- `anon` y `authenticated` conservarían INSERT/UPDATE/DELETE/SELECT crudos sobre las 14
-- columnas. RLS los bloquea en la práctica (la única policy es de SELECT), pero el GRANT
-- quedaría contradiciendo la intención documentada más abajo ("sin GRANT de INSERT/UPDATE/
-- DELETE a authenticated") -- hallazgo real: así es como este archivo llegó a divergir del
-- fingerprint aceptado de consolidated-replay. El REVOKE a nivel de tabla también revoca
-- cualquier SELECT por columna ya otorgado al mismo rol, así que va ANTES del GRANT angosto.
REVOKE ALL ON TABLE public.timesheet_reversal_requests FROM anon;
REVOKE ALL ON TABLE public.timesheet_reversal_requests FROM authenticated;

GRANT SELECT ON public.timesheet_reversal_requests TO authenticated;

-- `service_role` es un límite de confianza distinto de `authenticated`/`anon`: ya bypassea RLS
-- (BYPASSRLS) y ya tiene ALL sobre esta tabla vía el default privileges de arriba (nunca se le
-- hizo REVOKE, a propósito). Se re-afirma explícito, no porque haga falta funcionalmente, sino
-- para que la intención quede clara en el archivo -- mismo patrón que cero_06_grants.sql y
-- exchange_rate_history.sql, que tampoco confían en el default implícito sin declararlo. No
-- relaja la restricción real: el único escritor pensado para `authenticated` sigue siendo la
-- RPC SECURITY DEFINER.
GRANT ALL ON TABLE public.timesheet_reversal_requests TO service_role;

-- =====================================================================
-- A2) Lectura de "Aprobadas" para roles de solo consulta con alcance `assigned_engagements`
--     (review iteración 8, hallazgo #3)
-- =====================================================================
-- partner / director / sqr / risk_partner (y manager, ita_manager, tax_manager, hr_manager)
-- tienen `timesheet_approval.read` con alcance `assigned_engagements` (cero_13), pero las
-- policies SELECT de `timesheet_line_approvals` / `timesheet_periods` sólo cubren firm-wide,
-- dueño y `can_approve_*` (que exige `.approve`). La tab "Aprobadas" les salía vacía aunque
-- plan_v2 §g.6 / decisión 3 promete lectura. Se suma acceso de SOLO LECTURA a las líneas de
-- sus encargos asignados y al período que las contiene.
--
-- `timesheet_periods` no tiene `engagement_id`, y "Staff can view own line approvals" ya
-- consulta `timesheet_periods`: una policy de períodos que consultara `timesheet_line_approvals`
-- directo cerraría un ciclo de RLS (recursión infinita). Por eso el EXISTS va en una función
-- SECURITY DEFINER (mismo patrón que `can_approve_timesheet` / `is_assigned_to_engagement`).

CREATE FUNCTION public.can_read_assigned_timesheet_period(p_period_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.has_permission('timesheet_approval.read')
    and public.permission_scope('timesheet_approval.read') = 'assigned_engagements'
    and exists (
      select 1 from timesheet_line_approvals tla
      where tla.period_id = p_period_id
        and public.is_assigned_to_engagement(tla.engagement_id)
    )
$$;

REVOKE ALL ON FUNCTION public.can_read_assigned_timesheet_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_assigned_timesheet_period(uuid) TO authenticated, service_role;

CREATE POLICY "Assigned read line approvals" ON public.timesheet_line_approvals
  FOR SELECT TO authenticated USING (
    public.has_permission('timesheet_approval.read')
    AND public.permission_scope('timesheet_approval.read') = 'assigned_engagements'
    AND public.is_assigned_to_engagement(engagement_id));

CREATE POLICY "Assigned read periods" ON public.timesheet_periods
  FOR SELECT TO authenticated USING (public.can_read_assigned_timesheet_period(period_id));

-- =====================================================================
-- C) RPC (SECURITY DEFINER) -- request / execute / reject
-- =====================================================================

CREATE FUNCTION public.request_timesheet_reversal(
  p_period_id     uuid,
  p_scope         text,
  p_engagement_id uuid,
  p_reason        text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id     uuid;
  v_period       record;
  v_reason       text;
  v_all_approved boolean;
  v_has_approved boolean;
  v_request_id   uuid;
  v_admin        uuid;
BEGIN
  v_staff_id := public.get_my_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'REVERSAL_NOT_AUTHORIZED';
  END IF;

  IF p_scope NOT IN ('engagement', 'week') THEN
    RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
  END IF;
  IF p_scope = 'engagement' AND p_engagement_id IS NULL THEN
    RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
  END IF;
  IF p_scope = 'week' AND p_engagement_id IS NOT NULL THEN
    RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED';
  END IF;

  SELECT tp.* INTO v_period
    FROM public.timesheet_periods tp
   WHERE tp.period_id = p_period_id
     FOR UPDATE;

  IF NOT FOUND OR v_period.submitted_at IS NULL THEN
    RAISE EXCEPTION 'REVERSAL_NOT_SUBMITTED';
  END IF;

  IF v_period.is_period_locked THEN
    RAISE EXCEPTION 'REVERSAL_PERIOD_LOCKED';
  END IF;

  IF p_scope = 'week' THEN
    -- El colaborador siempre solicita alcance SEMANA sobre su propia boleta (decisión del
    -- operador, §i.1): la pantalla /timesheet no ofrece selector de alcance.
    IF v_period.staff_id IS DISTINCT FROM v_staff_id THEN
      RAISE EXCEPTION 'REVERSAL_NOT_AUTHORIZED';
    END IF;

    -- Mismo umbral que la UI ("boleta aprobada" = isFullyApproved).
    SELECT COALESCE(bool_and(tla.status = 'approved'), false)
      INTO v_all_approved
      FROM public.timesheet_line_approvals tla
     WHERE tla.period_id = p_period_id;

    IF NOT v_all_approved THEN
      RAISE EXCEPTION 'REVERSAL_NOT_FULLY_APPROVED';
    END IF;
  ELSE
    -- Alcance ENCARGO: sólo quien puede aprobar esas líneas puede solicitar su reversión.
    IF NOT public.can_approve_timesheet_line(auth.uid(), p_period_id, p_engagement_id) THEN
      RAISE EXCEPTION 'REVERSAL_NOT_AUTHORIZED';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.timesheet_line_approvals
       WHERE period_id = p_period_id AND engagement_id = p_engagement_id AND status = 'approved'
    ) INTO v_has_approved;

    IF NOT v_has_approved THEN
      RAISE EXCEPTION 'REVERSAL_NOTHING_APPROVED';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.timesheet_reversal_requests
      (period_id, scope, engagement_id, requested_by, reason)
    VALUES (p_period_id, p_scope, p_engagement_id, v_staff_id, v_reason)
    RETURNING request_id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'REVERSAL_ALREADY_REQUESTED';
  END;

  FOR v_admin IN SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
  LOOP
    PERFORM public.notify_staff('approval.reversal_requested', v_admin, v_request_id::text,
      jsonb_build_object('reason', v_reason, 'scope', p_scope, 'period_id', p_period_id));
  END LOOP;

  RETURN v_request_id;
END;
$$;

CREATE FUNCTION public.execute_timesheet_reversal(
  p_period_id     uuid,
  p_scope         text,
  p_engagement_id uuid DEFAULT NULL,
  p_reason        text DEFAULT NULL,
  p_request_id    uuid DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin_staff        uuid;
  v_period             record;
  v_request            record;
  v_stale_week_request record;
  v_reason             text;
  v_scope              text;
  v_period_id          uuid;
  v_engagement_id      uuid;
  v_request_id         uuid;
  v_recipients         uuid[];
  v_recipient          uuid;
  v_affected           integer;
  v_all_approved       boolean;
  -- Token de sistema, no texto libre (review iteración 4, hallazgo #5): antes era una oración
  -- fija en español, así que un destinatario en inglés la veía sin traducir tanto en la
  -- notificación como en "Mis solicitudes". El frontend traduce este token con
  -- `approval.reversalCascadeNote` en cada lugar donde se muestre (REVERSAL_CASCADE_NOTE_TOKEN
  -- en src/lib/notifications.ts) -- a diferencia de un motivo/nota real de una persona, que sí
  -- debe quedar en el idioma en que se escribió.
  v_cascade_note       text := 'SYSTEM_CASCADE_WEEK_STALE';
BEGIN
  -- quien_ejecuta: SOLO el admin, sin excepción. El aprobador ya no auto-ejecuta lo que
  -- él mismo aprobó -- sólo solicita.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'REVERSAL_NOT_ADMIN';
  END IF;

  v_admin_staff := public.get_my_staff_id();

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED';
  END IF;

  IF p_request_id IS NOT NULL THEN
    -- Espiar el destino SIN bloquear todavía la solicitud (review iteración 3, hallazgo #2):
    -- request_timesheet_reversal bloquea período -> (choca con el índice único al insertar);
    -- si acá bloqueáramos la solicitud antes que el período, dos transacciones concurrentes
    -- sobre el mismo destino podrían esperarse en un ciclo (deadlock) en vez de serializar
    -- limpio. Bloquear el período PRIMERO, en las dos RPC, evita el ciclo.
    SELECT period_id, scope, engagement_id INTO v_period_id, v_scope, v_engagement_id
      FROM public.timesheet_reversal_requests
     WHERE request_id = p_request_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'REVERSAL_NOT_PENDING';
    END IF;
  ELSE
    -- Reversión directa (botón "Revertir" en "Aprobadas", sin solicitud previa).
    IF p_scope NOT IN ('engagement', 'week') THEN
      RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
    END IF;
    IF p_scope = 'engagement' AND p_engagement_id IS NULL THEN
      RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
    END IF;
    IF p_scope = 'week' AND p_engagement_id IS NOT NULL THEN
      RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
    END IF;

    v_scope         := p_scope;
    v_period_id     := p_period_id;
    v_engagement_id := p_engagement_id;
  END IF;

  SELECT tp.* INTO v_period
    FROM public.timesheet_periods tp
   WHERE tp.period_id = v_period_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVERSAL_NOT_SUBMITTED';
  END IF;

  IF v_period.is_period_locked THEN
    RAISE EXCEPTION 'REVERSAL_PERIOD_LOCKED';
  END IF;

  IF p_request_id IS NOT NULL THEN
    -- Ahora sí bloquear y revalidar la solicitud, con el período ya bloqueado (mismo orden
    -- que request_timesheet_reversal). Re-derivar del row bloqueado, no de la espiada arriba:
    -- es la fuente de verdad una vez que ya no puede cambiar bajo nuestros pies.
    SELECT * INTO v_request
      FROM public.timesheet_reversal_requests
     WHERE request_id = p_request_id
       FOR UPDATE;

    IF NOT FOUND OR v_request.status <> 'pending' THEN
      RAISE EXCEPTION 'REVERSAL_NOT_PENDING';
    END IF;

    v_scope         := v_request.scope;
    v_period_id     := v_request.period_id;
    v_engagement_id := v_request.engagement_id;
  END IF;

  IF v_scope = 'engagement' THEN
    -- El período NO se toca: sigue enviado. Sólo las líneas del encargo objetivo vuelven a
    -- pending -- el resto de encargos de esa semana sigue aprobado.
    --
    -- Revalidación tras el lock (review iteración 3, hallazgo #3): un unsubmit PARCIAL
    -- (unsubmit_timesheet_safe sólo borra las líneas approved cuando v_all_approved) puede
    -- dejar el período en Draft con líneas approved sueltas -- sin este chequeo, esta rama
    -- las revertiría igual sobre un período que el dueño ya retiró.
    IF v_period.submitted_at IS NULL THEN
      RAISE EXCEPTION 'REVERSAL_NOT_SUBMITTED';
    END IF;

    UPDATE public.timesheet_line_approvals
       SET status = 'pending', approved_by = NULL, approved_at = NULL, review_notes = v_reason
     WHERE period_id = v_period_id AND engagement_id = v_engagement_id AND status = 'approved';

    -- Revalidación tras el lock (review iteración 1, hallazgo #5 / riesgo G7): una solicitud
    -- desactualizada -- las líneas ya se revirtieron por otra vía entre el pedido y esta
    -- ejecución -- no puede quedar marcada `executed` sin haber revertido nada.
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected = 0 THEN
      RAISE EXCEPTION 'REVERSAL_NOTHING_APPROVED';
    END IF;

    -- Cierre en cascada simétrico (review iteración 3, hallazgo #4): en cuanto una línea de
    -- este período vuelve a pending, el período deja de estar "totalmente aprobado" -- así
    -- que cualquier solicitud de alcance SEMANA pending sobre el mismo período ya NUNCA podrá
    -- ejecutarse (la revalidación de la rama SEMANA la bloquearía con
    -- REVERSAL_NOT_FULLY_APPROVED). A diferencia del cierre en cascada de la rama SEMANA (que
    -- sí logra lo que la solicitud de encargo pedía, y por eso se marca `executed`), acá el
    -- pedido de revertir TODA la semana no se cumplió -- sólo se marca `rejected`, con aviso
    -- real al solicitante, para no hacerle creer que su solicitud se ejecutó.
    FOR v_stale_week_request IN
      SELECT request_id, requested_by
        FROM public.timesheet_reversal_requests
       WHERE period_id = v_period_id AND scope = 'week' AND status = 'pending'
         FOR UPDATE
    LOOP
      UPDATE public.timesheet_reversal_requests
         SET status = 'rejected', resolved_by = v_admin_staff, resolved_at = now(),
             resolution_notes = v_cascade_note
       WHERE request_id = v_stale_week_request.request_id;

      PERFORM public.notify_staff('approval.reversal_rejected', v_stale_week_request.requested_by,
        v_stale_week_request.request_id::text, jsonb_build_object('notes', v_cascade_note));
    END LOOP;

    -- Cierre en cascada del MISMO destino (review iteración 5, hallazgo #2): si además de esta
    -- ejecución (directa o por otra solicitud) hay OTRA solicitud `pending` de alcance ENCARGO
    -- sobre el mismo (período, encargo), ya se cumplió lo que pedía -- sin esto quedaba
    -- `pending` para siempre, porque el próximo intento de ejecutarla encuentra 0 líneas
    -- `approved` y falla con REVERSAL_NOTHING_APPROVED. El índice único `uq_trr_open_engagement`
    -- garantiza a lo sumo una fila. Mismo criterio que el cierre en cascada de la rama SEMANA de
    -- abajo (:414-420): se marca `executed`, sin aviso aparte, porque el pedido sí se cumplió.
    UPDATE public.timesheet_reversal_requests
       SET status = 'executed', resolved_by = v_admin_staff, resolved_at = now(),
           resolution_notes = v_reason
     WHERE period_id = v_period_id AND engagement_id = v_engagement_id AND scope = 'engagement'
       AND status = 'pending' AND (p_request_id IS NULL OR request_id <> p_request_id);

    SELECT ARRAY(
      SELECT DISTINCT sid FROM (
        SELECT manager_id AS sid FROM public.engagements WHERE engagement_id = v_engagement_id
        UNION
        SELECT partner_id AS sid FROM public.engagements WHERE engagement_id = v_engagement_id
      ) x WHERE sid IS NOT NULL AND sid IS DISTINCT FROM v_admin_staff
    ) INTO v_recipients;
  ELSE
    -- Alcance SEMANA: replica LITERALMENTE los pasos 8/9 de unsubmit_timesheet_safe (cero_02,
    -- borra -- no pasa a pending -- las líneas approved, para que el reenvío re-dispare la
    -- auto-aprobación), sin el chequeo de dueño (paso 1-3), el rol legacy (paso 6b) ni la
    -- ventana de la semana en curso (paso 7): eso es justo lo que esta función admin-only
    -- releva (decisión `alcance_de_semanas`).
    --
    -- Revalidación tras el lock (review iteración 1, hallazgo #5 / riesgo G7): entre el pedido
    -- y esta ejecución el período pudo volver a Draft por otra vía (p.ej. unsubmit_timesheet_safe
    -- del propio dueño, o una ejecución concurrente de alcance semana) o una línea pudo
    -- reabrirse por el bypass de RLS documentado en G6 -- ambos casos dejan de cumplir lo que
    -- ya se validó en request_timesheet_reversal.
    IF v_period.submitted_at IS NULL THEN
      RAISE EXCEPTION 'REVERSAL_NOT_SUBMITTED';
    END IF;

    SELECT COALESCE(bool_and(tla.status = 'approved'), false)
      INTO v_all_approved
      FROM public.timesheet_line_approvals tla
     WHERE tla.period_id = v_period_id;

    IF NOT v_all_approved THEN
      RAISE EXCEPTION 'REVERSAL_NOT_FULLY_APPROVED';
    END IF;

    -- Los destinatarios se capturan ANTES del DELETE, que es lo que borra las filas que
    -- identifican los encargos afectados.
    SELECT ARRAY(
      SELECT DISTINCT sid FROM (
        SELECT e.manager_id AS sid
          FROM public.timesheet_line_approvals tla
          JOIN public.engagements e ON e.engagement_id = tla.engagement_id
         WHERE tla.period_id = v_period_id
        UNION
        SELECT e.partner_id AS sid
          FROM public.timesheet_line_approvals tla
          JOIN public.engagements e ON e.engagement_id = tla.engagement_id
         WHERE tla.period_id = v_period_id
      ) x WHERE sid IS NOT NULL AND sid IS DISTINCT FROM v_admin_staff
    ) INTO v_recipients;

    UPDATE public.timesheet_periods
       SET submitted_at = NULL
     WHERE period_id = v_period_id;

    DELETE FROM public.timesheet_line_approvals
     WHERE period_id = v_period_id AND status = 'approved';

    -- Cierre en cascada: las solicitudes `pending` de este período quedan sobre líneas que ya se
    -- borraron -- sin esto, la cola del admin las mostraría como accionables. Sin filtro de
    -- `scope` (review iteración 10, hallazgo #1): una reversión DIRECTA de semana
    -- (p_request_id NULL) también deja inviable una solicitud SEMANA pendiente del mismo período
    -- (volvería a fallar con REVERSAL_NOT_SUBMITTED); `uq_trr_open_week` garantiza a lo sumo una.
    -- La propia solicitud que se está ejecutando (p_request_id) se excluye: se cierra más abajo.
    UPDATE public.timesheet_reversal_requests
       SET status = 'executed', resolved_by = v_admin_staff, resolved_at = now(),
           resolution_notes = v_reason
     WHERE period_id = v_period_id AND status = 'pending'
       AND (p_request_id IS NULL OR request_id <> p_request_id);
  END IF;

  -- notificacion_al_ejecutar_admin: la razón a los gerentes/socios de los encargos
  -- afectados (todos los del período en alcance SEMANA, sólo uno en alcance ENCARGO),
  -- excluyendo al admin ejecutor.
  FOREACH v_recipient IN ARRAY v_recipients LOOP
    PERFORM public.notify_staff('approval.reversal_executed', v_recipient, v_period_id::text,
      jsonb_build_object('reason', v_reason, 'scope', v_scope, 'engagement_id', v_engagement_id));
  END LOOP;

  IF p_request_id IS NULL THEN
    -- Bitácora de la reversión directa: nace ya ejecutada (is_direct = true).
    INSERT INTO public.timesheet_reversal_requests
      (period_id, scope, engagement_id, requested_by, reason, status, is_direct,
       resolved_by, resolved_at, resolution_notes)
    VALUES
      (v_period_id, v_scope, v_engagement_id, v_admin_staff, v_reason, 'executed', true,
       v_admin_staff, now(), v_reason)
    RETURNING request_id INTO v_request_id;
  ELSE
    UPDATE public.timesheet_reversal_requests
       SET status = 'executed', resolved_by = v_admin_staff, resolved_at = now(),
           resolution_notes = v_reason
     WHERE request_id = p_request_id
     RETURNING request_id INTO v_request_id;
  END IF;

  RETURN v_request_id;
END;
$$;

CREATE FUNCTION public.reject_timesheet_reversal(
  p_request_id uuid,
  p_notes      text
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin   uuid;
  v_request record;
  v_notes   text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'REVERSAL_NOT_ADMIN';
  END IF;

  v_notes := btrim(COALESCE(p_notes, ''));
  IF v_notes = '' THEN
    RAISE EXCEPTION 'REVERSAL_REJECT_NOTES_REQUIRED';
  END IF;

  v_admin := public.get_my_staff_id();

  SELECT * INTO v_request
    FROM public.timesheet_reversal_requests
   WHERE request_id = p_request_id
     FOR UPDATE;

  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'REVERSAL_NOT_PENDING';
  END IF;

  UPDATE public.timesheet_reversal_requests
     SET status = 'rejected', resolved_by = v_admin, resolved_at = now(), resolution_notes = v_notes
   WHERE request_id = p_request_id;

  -- rechazo_de_solicitud: notifica al solicitante, mismo patrón que el rechazo de líneas.
  PERFORM public.notify_staff('approval.reversal_rejected', v_request.requested_by,
    p_request_id::text, jsonb_build_object('notes', v_notes));
END;
$$;

REVOKE ALL ON FUNCTION public.request_timesheet_reversal(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_timesheet_reversal(uuid, text, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.execute_timesheet_reversal(uuid, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_timesheet_reversal(uuid, text, uuid, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reject_timesheet_reversal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_timesheet_reversal(uuid, text) TO authenticated, service_role;

-- =====================================================================
-- D) Notificaciones -- 3 tipos nuevos, módulo timesheet_approval
-- =====================================================================
--
-- El seed generado (02) es "no editar a mano" y termina con `delete ... not in (...)` que
-- poda lo no listado; estas 3 filas viven fuera de ese seed a propósito (esta migración
-- corre después por timestamp, así que sobreviven a un reset). email_enabled = false: sólo
-- in-app en v1 (decisión `notificaciones_v1`). display_order 75-77 (el máximo actual es 74).

INSERT INTO public.notification_types
  (type_key, module_key, label_key, delivery, display_order, is_active, email_enabled)
VALUES
  ('approval.reversal_requested', 'timesheet_approval', 'notifications.types.approval.reversal_requested', 'event', 75, true, false),
  ('approval.reversal_executed',  'timesheet_approval', 'notifications.types.approval.reversal_executed',  'event', 76, true, false),
  ('approval.reversal_rejected',  'timesheet_approval', 'notifications.types.approval.reversal_rejected',  'event', 77, true, false)
ON CONFLICT (type_key) DO NOTHING;

-- approval.reversal_requested -> todos los admin (alcance firm).
INSERT INTO public.notification_role_types (role_key, type_key, scope_key) VALUES
  ('admin', 'approval.reversal_requested', 'firm')
ON CONFLICT (role_key, type_key) DO NOTHING;

-- approval.reversal_executed -> gerentes/socios de los encargos afectados (alcance assigned).
INSERT INTO public.notification_role_types (role_key, type_key, scope_key) VALUES
  ('manager',       'approval.reversal_executed', 'assigned'),
  ('ita_manager',   'approval.reversal_executed', 'assigned'),
  ('tax_manager',   'approval.reversal_executed', 'assigned'),
  ('hr_manager',    'approval.reversal_executed', 'assigned'),
  ('partner',       'approval.reversal_executed', 'assigned'),
  ('senior_partner','approval.reversal_executed', 'assigned'),
  ('director',      'approval.reversal_executed', 'assigned'),
  ('sqr',           'approval.reversal_executed', 'assigned'),
  ('risk_partner',  'approval.reversal_executed', 'assigned'),
  ('admin',         'approval.reversal_executed', 'assigned')
ON CONFLICT (role_key, type_key) DO NOTHING;

-- approval.reversal_rejected -> el solicitante, alcance own. Cualquier rol que pueda ser dueño
-- de un período enviado puede solicitar alcance SEMANA (request_timesheet_reversal no
-- restringe por rol, sólo por dueño), así que la lista tiene que cubrir a TODOS los que
-- timesheet.reverted ya notifica cuando el admin revierte su semana -- no sólo a los 7 que
-- reportan horas de base -- más los 4 gerentes que solicitan alcance ENCARGO (review iteración
-- 1, hallazgo #3: partner/senior_partner/director/sqr/risk_partner/it_security_manager podían
-- pedir una reversión y nunca enterarse de un rechazo).
INSERT INTO public.notification_role_types (role_key, type_key, scope_key) VALUES
  ('senior',              'approval.reversal_rejected', 'own'),
  ('semisenior',          'approval.reversal_rejected', 'own'),
  ('assistant',           'approval.reversal_rejected', 'own'),
  ('ita_senior',          'approval.reversal_rejected', 'own'),
  ('ita_assistant',       'approval.reversal_rejected', 'own'),
  ('tax_senior',          'approval.reversal_rejected', 'own'),
  ('tax_assistant',       'approval.reversal_rejected', 'own'),
  ('manager',             'approval.reversal_rejected', 'own'),
  ('ita_manager',         'approval.reversal_rejected', 'own'),
  ('tax_manager',         'approval.reversal_rejected', 'own'),
  ('hr_manager',          'approval.reversal_rejected', 'own'),
  ('partner',             'approval.reversal_rejected', 'own'),
  ('senior_partner',      'approval.reversal_rejected', 'own'),
  ('director',            'approval.reversal_rejected', 'own'),
  ('sqr',                 'approval.reversal_rejected', 'own'),
  ('risk_partner',        'approval.reversal_rejected', 'own'),
  ('it_security_manager', 'approval.reversal_rejected', 'own')
ON CONFLICT (role_key, type_key) DO NOTHING;

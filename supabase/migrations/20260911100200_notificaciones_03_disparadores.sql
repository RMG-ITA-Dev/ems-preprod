--
-- NOTIFICACIONES 03 — disparadores de los tres módulos con emisores.
--
-- Un archivo por CAPA, no por módulo: el catálogo y el portón viven en el 01, la matriz
-- sembrada en el 02, y acá los emisores. Cuando llegue un módulo nuevo se agrega su parte al
-- final de este archivo, no un archivo más — la alternativa (uno por módulo) ya se probó y
-- dejaba a `get_my_notification_aggregates()` definida en dos lugares, con el que corriera
-- último ganando en silencio.
--
--   PARTE 1  Solicitudes de Fondos   (Fase 3.a)  2 triggers, 14 eventos
--   PARTE 2  Órdenes de Trabajo      (Fase 3.b)  2 triggers + 1 cron, 15 eventos
--   PARTE 3  Encargos                (Fase 3.c)  2 triggers, 7 eventos
--
-- REGLAS QUE VALEN PARA LOS TRES:
--   * Se dispara por TRIGGER, no desde el frontend: así el aviso sale venga la transición de
--     un hook, de un RPC, del panel de Lovable o de un UPDATE a mano en el SQL Editor.
--   * Ningún disparador bloquea su operación: todos degradan a WARNING.
--   * `notify_staff()` filtra por la matriz pero NO evalúa `scope_key`. Respetarlo es
--     responsabilidad de cada disparador: `own`/`assigned` se resuelven con las columnas del
--     registro, `department`/`firm` con `notif_staff_by_roles()`. Se puede mandar de más y
--     dejar que la matriz descarte; NUNCA mandar a un asignado que no lo está.
--
-- Requiere el 01 (portón y contadores) y el 02 (seed) aplicados antes. Idempotente.
--

-- #####################################################################
-- ## PARTE 1 — SOLICITUDES DE FONDOS (Fase 3.a)
-- #####################################################################

-- =====================================================================
-- A) Resolución de destinatarios
-- =====================================================================
--
-- Los alcances `own` y `assigned` los resuelve cada disparador con sus propias columnas
-- (requester_staff_id, manager_staff_id). Los alcances `firm` y `department` necesitan
-- traducir "todos los admin" o "todos los analistas de contabilidad" a staff_ids concretos.
--

DROP FUNCTION IF EXISTS public.notif_staff_by_roles(text[]);

CREATE FUNCTION public.notif_staff_by_roles(p_role_keys text[])
    RETURNS TABLE (staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT s.staff_id
    FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
   WHERE ur.role_key = ANY (p_role_keys)
     AND s.is_active
     AND s.deleted_at IS NULL
$$;

COMMENT ON FUNCTION public.notif_staff_by_roles(text[]) IS
  'Traduce una lista de role_key a los staff_id activos que los tienen. Lo usan los disparadores para los alcances firm/department de la matriz de notificaciones.';

DROP FUNCTION IF EXISTS public.notif_fund_request_managers(uuid);

CREATE FUNCTION public.notif_fund_request_managers(p_fund_request_id uuid)
    RETURNS TABLE (staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  SELECT DISTINCT frw.manager_staff_id
    FROM public.fund_request_work_orders frw
   WHERE frw.fund_request_id = p_fund_request_id
     AND frw.manager_staff_id IS NOT NULL
$BODY$;

COMMENT ON FUNCTION public.notif_fund_request_managers(uuid) IS
  'Gerentes de las OT de una solicitud de fondos (multi-gerente: cada uno aprueba su parte). Lo usan los disparadores de notificacion del modulo.';

-- =====================================================================
-- B) fund_requests
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_fund_request_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_payload jsonb;
  v_rec     record;
BEGIN
  v_payload := jsonb_build_object(
    'request_number', COALESCE(NEW.request_number, ''),
    'amount',         NEW.total_requested_amount,
    'currency',       NEW.currency);

  -- Entro a aprobacion: a CADA gerente de las OT. "Entro", no "salio de borrador": cubre el
  -- envio inicial y los reenvios desde observado/rechazado por igual.
  IF NEW.status = 'pendiente_aprobacion'
     AND OLD.status IS DISTINCT FROM 'pendiente_aprobacion' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.request.submitted_for_approval',
                                  v_rec.staff_id, NEW.fund_request_id::text, v_payload);
    END LOOP;
  END IF;

  -- Decision del gerente: al solicitante.
  IF OLD.status = 'pendiente_aprobacion'
     AND NEW.status IN ('aprobado_gerente', 'observado', 'rechazado') THEN
    PERFORM public.notify_staff('fund.request.decided',
              NEW.requester_staff_id, NEW.fund_request_id::text,
              v_payload || jsonb_build_object('decision', NEW.status::text));
  END IF;

  -- Desembolso / liquidacion / cierre: al solicitante Y a los gerentes. Se miran los
  -- timestamps y no el status: son hitos independientes de la maquina de estados (la
  -- liquidacion es de dos pasos manuales) y el status puede no moverse.
  IF OLD.disbursed_at IS NULL AND NEW.disbursed_at IS NOT NULL THEN
    PERFORM public.notify_staff('fund.disbursement.done',
              NEW.requester_staff_id, NEW.fund_request_id::text,
              v_payload || jsonb_build_object('disbursed', NEW.total_disbursed_amount));
    FOR v_rec IN SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.disbursement.done',
                v_rec.staff_id, NEW.fund_request_id::text,
                v_payload || jsonb_build_object('disbursed', NEW.total_disbursed_amount));
    END LOOP;
  END IF;

  IF OLD.settled_at IS NULL AND NEW.settled_at IS NOT NULL THEN
    PERFORM public.notify_staff('fund.settlement.recorded',
              NEW.requester_staff_id, NEW.fund_request_id::text,
              v_payload || jsonb_build_object('balance', NEW.settlement_balance));
    FOR v_rec IN SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.settlement.recorded',
                v_rec.staff_id, NEW.fund_request_id::text,
                v_payload || jsonb_build_object('balance', NEW.settlement_balance));
    END LOOP;
  END IF;

  IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
    PERFORM public.notify_staff('fund.request.closed',
              NEW.requester_staff_id, NEW.fund_request_id::text, v_payload);
    FOR v_rec IN SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.request.closed',
                v_rec.staff_id, NEW.fund_request_id::text, v_payload);
    END LOOP;
  END IF;

  -- Cancelacion: admins (alcance firm) + los gerentes que la autorizaron.
  IF NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado' THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
      UNION
      SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.request.cancelled',
                                  v_rec.staff_id, NEW.fund_request_id::text, v_payload);
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_fund_request_events fallo para % : %', NEW.fund_request_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

CREATE TRIGGER tr_notify_fund_request
  AFTER UPDATE ON public.fund_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_fund_request_events();

-- =====================================================================
-- C) fund_request_expenses
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_fund_expense_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_requester uuid;
  v_manager   uuid;
  v_number    text;
  v_payload   jsonb;
  v_rec       record;
  v_faltan    integer;
  -- La bandeja de revision contable. Los dos eventos de abajo deben repartirse SIEMPRE al
  -- mismo conjunto; tenerlos como constante evita que vuelvan a separarse.
  c_contabilidad constant text[] := ARRAY['accounting_analyst', 'accounting_manager'];
BEGIN
  SELECT fr.requester_staff_id, COALESCE(fr.request_number, '')
    INTO v_requester, v_number
    FROM public.fund_requests fr
   WHERE fr.fund_request_id = NEW.fund_request_id;

  -- El gerente que aprueba ESTE gasto es el de su OT, no el de toda la solicitud.
  SELECT frw.manager_staff_id INTO v_manager
    FROM public.fund_request_work_orders frw
   WHERE frw.fund_request_id = NEW.fund_request_id
     AND frw.wo_id = NEW.wo_id;

  -- fund_request_id: lo consume notificationRoute() para armar /fund-requests/<id>/expenses.
  v_payload := jsonb_build_object(
    'fund_request_id', NEW.fund_request_id,
    'request_number',  v_number,
    'amount',          NEW.amount,
    'currency',        NEW.currency,
    'description',     COALESCE(NEW.description, ''));

  -- Entro a aprobacion: al gerente de su OT (envio inicial y reenvios).
  IF NEW.status = 'pendiente_aprobacion'
     AND OLD.status IS DISTINCT FROM 'pendiente_aprobacion'
     AND v_manager IS NOT NULL THEN
    PERFORM public.notify_staff('fund.expense.submitted_for_approval',
                                v_manager, NEW.fre_id::text, v_payload);
  END IF;

  -- Decision del gerente sobre el gasto: al solicitante.
  IF OLD.status = 'pendiente_aprobacion'
     AND NEW.status IN ('aprobado_gerente', 'observado', 'rechazado') THEN
    PERFORM public.notify_staff('fund.expense.decided',
              v_requester, NEW.fre_id::text,
              v_payload || jsonb_build_object('decision', NEW.status::text));
  END IF;

  -- El gerente aprobo: el gasto entra a la bandeja de revision de contabilidad.
  IF OLD.status = 'pendiente_aprobacion' AND NEW.status = 'aprobado_gerente' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_contabilidad)
    LOOP
      PERFORM public.notify_staff('fund.expense.sent_to_support_review',
                                  v_rec.staff_id, NEW.fre_id::text, v_payload);
    END LOOP;
  END IF;

  -- Contabilidad devuelve por falta de respaldo: al solicitante. El flag solo lo puede
  -- encender quien tenga expense_settlement.update (fre_validate_transition), asi que este
  -- ES el rechazo de contabilidad, no el del gerente.
  IF OLD.returned_by_assistant = false AND NEW.returned_by_assistant = true THEN
    PERFORM public.notify_staff('fund.expense.returned_no_support',
              v_requester, NEW.fre_id::text,
              v_payload || jsonb_build_object(
                'reason', COALESCE(NEW.invoice_observation_notes, '')));
  END IF;

  -- El solicitante subio la factura y reenvia: vuelve DIRECTO a contabilidad, sin pasar por
  -- el gerente. La senal es el flag apagandose y no un cambio de status, porque
  -- useResendReturnedExpense() devuelve el status a 'aprobado_gerente' (de donde salio).
  IF OLD.returned_by_assistant = true AND NEW.returned_by_assistant = false THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_contabilidad)
    LOOP
      PERFORM public.notify_staff('fund.expense.resubmitted',
                                  v_rec.staff_id, NEW.fre_id::text, v_payload);
    END LOOP;
  END IF;

  -- Contabilidad aprobo ESTE gasto: solo al solicitante (uno por gasto).
  IF NEW.status = 'revisado_asistente'
     AND OLD.status IS DISTINCT FROM 'revisado_asistente' THEN
    PERFORM public.notify_staff('fund.expense.reviewed',
              v_requester, NEW.fre_id::text, v_payload);

    -- Y si con este quedaron TODOS revisados, el consolidado al gerente.
    --
    -- 'rechazado' SI cuenta como pendiente, alineado con expensePhase() (src/lib/fundRequest.ts):
    -- "rechazado sigue siendo corregible/reenviable -> no esta finalizado". Excluirlo
    -- disparaba el hito "todos aprobados" mientras quedaba un gasto que el solicitante
    -- todavia puede corregir, y la solicitud no aparecia como lista para liquidar.
    SELECT COUNT(*) INTO v_faltan
      FROM public.fund_request_expenses e
     WHERE e.fund_request_id = NEW.fund_request_id
       AND e.status <> 'revisado_asistente';

    IF v_faltan = 0 THEN
      FOR v_rec IN SELECT staff_id
                     FROM public.notif_fund_request_managers(NEW.fund_request_id)
      LOOP
        PERFORM public.notify_staff('fund.expenses.all_reviewed',
                  v_rec.staff_id, NEW.fund_request_id::text,
                  jsonb_build_object('request_number', v_number,
                                     'fund_request_id', NEW.fund_request_id));
      END LOOP;
    END IF;
  END IF;

  -- Multa IVA: al solicitante.
  IF COALESCE(OLD.iva_penalty_amount, 0) = 0 AND COALESCE(NEW.iva_penalty_amount, 0) > 0 THEN
    PERFORM public.notify_staff('fund.expense.iva_penalty',
              v_requester, NEW.fre_id::text,
              v_payload || jsonb_build_object('penalty', NEW.iva_penalty_amount));
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_fund_expense_events fallo para % : %', NEW.fre_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_fund_expense_events() IS
  'FASE 3.a: 8 eventos de fund_request_expenses. Contabilidad revisa gasto por gasto: el solicitante recibe uno por gasto (fund.expense.reviewed) y el gerente UNO solo cuando quedan todos revisados (fund.expenses.all_reviewed), que es el hito previo a la liquidacion. Degrada a WARNING: nunca bloquea la operacion.';

CREATE TRIGGER tr_notify_fund_expense
  AFTER UPDATE ON public.fund_request_expenses
  FOR EACH ROW EXECUTE FUNCTION public.notify_fund_expense_events();


-- #####################################################################
-- ## PARTE 2 — ÓRDENES DE TRABAJO (Fase 3.b)
-- #####################################################################
--
-- POR QUÉ NO SE MIRA `approval_status` PARA DETECTAR APROBACIONES. Las dos pistas de la OT
-- (Socio y Riesgos) se aprueban en DOS sentencias: primero se firma la pista
-- (`approved_at` / `risk_status`), después un UPDATE condicional cierra la OT a 'Approved'
-- sólo si la otra pista ya estaba lista. El trigger corre, entonces, DOS veces por
-- aprobación, y en la primera `approval_status` todavía dice 'Pending_Approval'.
--
-- CÓMO SE DISTINGUEN LOS TRES CAMINOS QUE LLEGAN A 'Pending_Approval':
--   * ENVÍO       OLD ∈ {Draft, Rejected}  -> `wo.submitted_partner`
--   * REVERSIÓN   OLD = Approved y la marca de la pista se apaga -> `wo.approval_reverted`
--   * COMPLECIÓN  OLD = Approved y `risk_status` vuelve a Pending -> `wo.risk.resubmitted`
--
-- Los contadores del módulo (`wo.installment.*`) viven en el archivo 01 con el resto.

-- =====================================================================
-- A) Resolución de destinatarios `assigned`
-- =====================================================================
--
-- Dos conjuntos, porque la matriz del módulo OT reparte exactamente por ahí: la pista del
-- Socio y el plan de pagos van a los "de arriba"; las decisiones y los plazos, a los
-- gerentes. `encargado_id` NO entra en ninguno: en las 18 filas del módulo, las columnas
-- Senior/Semi Senior/Asistente están todas en `no`, así que agregarlo sólo sumaría llamadas
-- que la matriz descarta.
--

DROP FUNCTION IF EXISTS public.notif_engagement_partners(uuid);

CREATE FUNCTION public.notif_engagement_partners(p_engagement_id uuid)
    RETURNS TABLE (staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  -- sqr_id incluido a propósito (D-19): la función SQR la ocupan Socio, Senior Partner,
  -- Senior o Director, y para ellos "asignados" significa justamente "el encargo donde soy
  -- el SQR". Quien la ocupe con un rol que la matriz no contempla lo filtra notify_staff().
  SELECT s FROM (
    SELECT e.partner_id AS s FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION
    SELECT e.sqr_id     FROM public.engagements e WHERE e.engagement_id = p_engagement_id
  ) q WHERE s IS NOT NULL
$BODY$;

COMMENT ON FUNCTION public.notif_engagement_partners(uuid) IS
  'Alcance `assigned` de la banda alta de un encargo: partner_id + sqr_id. Lo usan los disparadores de notificación del módulo Órdenes de Trabajo.';

DROP FUNCTION IF EXISTS public.notif_engagement_managers(uuid);

CREATE FUNCTION public.notif_engagement_managers(p_engagement_id uuid)
    RETURNS TABLE (staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  -- Los tres gerentes del encargo: el general y los dos especialistas. En la matriz las
  -- columnas Gerente / Gerente ESPECIALISTA ITA / Gerente ESPECIALISTA TAX se mueven siempre
  -- juntas, así que se resuelven juntas.
  SELECT s FROM (
    SELECT e.manager_id        AS s FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION
    SELECT e.specialist_it_id  FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION
    SELECT e.specialist_tax_id FROM public.engagements e WHERE e.engagement_id = p_engagement_id
  ) q WHERE s IS NOT NULL
$BODY$;

COMMENT ON FUNCTION public.notif_engagement_managers(uuid) IS
  'Alcance `assigned` de la banda gerencial de un encargo: manager_id + specialist_it_id + specialist_tax_id. Lo usan los disparadores de notificación del módulo Órdenes de Trabajo.';

-- =====================================================================
-- B) work_orders — 11 eventos de transición
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_work_order_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_code       text;
  v_base       jsonb;
  v_rec        record;
  v_submitted  boolean;
  v_rev_socio  boolean;
  v_rev_risk   boolean;
  v_resubmit   boolean;
  v_to_risk    boolean;
  v_emergency  boolean;
  v_has_plan   boolean;
  c_riesgos   constant text[] := ARRAY['risk_partner', 'risk_supervisor'];
  c_cobranzas constant text[] := ARRAY['collections_analyst'];
BEGIN
  SELECT COALESCE(e.engagement_code, '') INTO v_code
    FROM public.engagements e
   WHERE e.engagement_id = NEW.engagement_id;

  -- engagement_code lo pinta el panel como chip (notificationMeta); engagement_id no se usa
  -- hoy en la ruta —el destino es /work-orders/<wo_id>— pero deja el encargo a mano para
  -- cuando la Fase 3.c linkee al detalle del encargo.
  v_base := jsonb_build_object(
    'engagement_code', v_code,
    'engagement_id',   NEW.engagement_id,
    'currency',        NEW.currency);

  -- ── Discriminadores ──
  v_submitted := NEW.approval_status = 'Pending_Approval'
             AND OLD.approval_status IN ('Draft', 'Rejected');

  -- La reversión se detecta por la marca de la pista APAGÁNDOSE, no por approval_status:
  -- useRevertSocioApproval/useRevertRiskApproval limpian la firma en la primera sentencia y
  -- reabren la OT en la segunda, y sólo la primera distingue una reversión de un rechazo.
  v_rev_socio := OLD.approved_at      IS NOT NULL AND NEW.approved_at      IS NULL;
  v_rev_risk  := OLD.risk_approved_at IS NOT NULL AND NEW.risk_approved_at IS NULL;

  -- Reenvío de datos de riesgo tras un veredicto (rechazo, o compleción de los datos que
  -- quedaron pendientes de una aprobación de emergencia).
  v_resubmit := NEW.risk_status = 'Pending'
            AND OLD.risk_status IN ('Rejected', 'Emergency_Approved');

  -- Entrada a la cola de Riesgos. Dos caminos, y ninguno es una transición de risk_status:
  --   * el envío inicial —risk_status ya venía en 'Pending' por DEFAULT, así que no cambia—;
  --   * la reversión de la aprobación de Riesgos (D-23), que devuelve trabajo a esa cola.
  --
  -- `NOT v_resubmit` es obligatorio y no una precaución: useSubmitWorkOrder con
  -- `resetRiskToPending` (reenvío tras un rechazo de Riesgos) cumple las dos condiciones a la
  -- vez, y sin esto el Supervisor recibiría el aviso de entrada Y el de reenvío por el mismo
  -- hecho. Gana el más específico.
  -- El COALESCE no es cosmético: es el único NOT de los discriminadores, y un NULL bajo un
  -- NOT vuelve NULL toda la condición y se traga un aviso legítimo. Los demás se evalúan en
  -- positivo, donde NULL ya se comporta como false (que es lo que queremos: fail-closed).
  v_to_risk := NEW.risk_status = 'Pending'
           AND (v_submitted OR v_rev_risk)
           AND NOT COALESCE(v_resubmit, false);

  -- Emergencia = el gerente envió SIN datos de riesgo, justificando. Es la misma condición
  -- que habilita el flujo de dos firmas en el frontend.
  v_emergency := NEW.risk_level IS NULL
             AND NULLIF(btrim(COALESCE(NEW.emergency_justification, '')), '') IS NOT NULL;

  -- ── Envío a aprobación del Socio ──
  IF v_submitted THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_partners(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.submitted_partner', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('status', NEW.approval_status));
    END LOOP;

    -- Plan de pagos (D-24): no tiene aprobación propia, viaja con la de la OT. Sólo se avisa
    -- si hay cuotas cargadas — sin cuotas no hay nada que revisar y Cobranzas recibiría ruido.
    SELECT EXISTS (SELECT 1 FROM public.wo_payment_installments i WHERE i.wo_id = NEW.wo_id)
      INTO v_has_plan;

    IF v_has_plan THEN
      FOR v_rec IN
        SELECT staff_id FROM public.notif_engagement_partners(NEW.engagement_id)
        UNION
        SELECT staff_id FROM public.notif_staff_by_roles(c_cobranzas)
      LOOP
        PERFORM public.notify_staff('wo.payment_plan.pending_approval', v_rec.staff_id,
                  NEW.wo_id::text, v_base);
      END LOOP;
    END IF;
  END IF;

  -- ── Entrada a la cola de Riesgos (absorbe assessment_assigned/emergency, D-10) ──
  IF v_to_risk THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_riesgos)
    LOOP
      -- `context` no es un dato mas: es la clave reservada de i18next. El panel hace
      -- t(label_key, {...payload}), asi que un payload con context='emergency' resuelve
      -- `notifications.types.wo.submitted_risk_emergency` y, si esa clave no existe, cae
      -- sola a la base. Asi una variante de texto no necesita un tipo nuevo en la matriz.
      PERFORM public.notify_staff('wo.submitted_risk', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('risk_level', NEW.risk_level)
                       || CASE WHEN v_emergency
                               THEN jsonb_build_object('context', 'emergency')
                               ELSE '{}'::jsonb END);
    END LOOP;
  END IF;

  -- ── Reenvío de los datos de evaluación ──
  IF v_resubmit THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_riesgos)
    LOOP
      PERFORM public.notify_staff('wo.risk.resubmitted', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('risk_level', NEW.risk_level));
    END LOOP;
  END IF;

  -- ── Firma del Socio ──
  -- Se compara el timestamp y no `IS NULL -> IS NOT NULL`: un rechazo NO limpia approved_at,
  -- así que tras rechazar y reenviar la segunda firma dejaría la marca ya no-nula y un
  -- chequeo de nulidad se la perdería.
  IF NEW.approved_at IS NOT NULL AND OLD.approved_at IS DISTINCT FROM NEW.approved_at THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.approved_partner', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('status', 'Approved'));
    END LOOP;
  END IF;

  -- ── Rechazo del Socio ──
  IF NEW.approval_status = 'Rejected'
     AND OLD.approval_status IS DISTINCT FROM 'Rejected' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.rejected_partner', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('status', 'Rejected',
                                             'reason', COALESCE(NEW.notes, '')));
    END LOOP;
  END IF;

  -- ── Veredicto de Riesgos ──
  -- Cubre las DOS formas de aprobar: la normal ('Approved') y la de emergencia
  -- ('Emergency_Approved', las dos firmas). Decisión del operador 2026-09-10 (D-25): en la
  -- rama de emergencia el Gerente recibe los dos avisos —"Riesgos aprobó la OT" y
  -- "Emergencia aprobada: 7 días para completar"— porque son dos hechos distintos: uno
  -- desbloquea la OT, el otro le abre un plazo con trabajo pendiente.
  --
  -- El `status` va desde la columna y no como literal: así el badge del panel dice
  -- "Aprobada por emergencia" y no miente diciendo "Aprobada" a secas.
  IF NEW.risk_status IN ('Approved', 'Emergency_Approved')
     AND OLD.risk_status IS DISTINCT FROM NEW.risk_status THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.approved_risk', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('status', NEW.risk_status));
    END LOOP;
  END IF;

  -- El rechazo de Riesgos sube más arriba que la aprobación: la matriz se lo manda también a
  -- socios y directores, porque frena la OT entera.
  IF NEW.risk_status = 'Rejected' AND OLD.risk_status IS DISTINCT FROM 'Rejected' THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_engagement_partners(NEW.engagement_id)
      UNION
      SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.rejected_risk', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('status', 'Rejected',
                                             'reason', COALESCE(NEW.risk_notes, '')));
    END LOOP;
  END IF;

  -- ── Reversión de Admin (cualquiera de las dos pistas) ──
  IF v_rev_socio OR v_rev_risk THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_engagement_partners(NEW.engagement_id)
      UNION
      SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      -- `context` = la pista revertida, para que el texto diga cual (ver la nota de
      -- submitted_risk). Si algun dia se revierten las dos en una sola sentencia gana
      -- 'partner'; la clave base es generica y sirve igual.
      PERFORM public.notify_staff('wo.approval_reverted', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object(
                  'context', CASE WHEN v_rev_socio THEN 'partner' ELSE 'risk' END,
                  'status',  NEW.approval_status));
    END LOOP;
  END IF;

  -- ── Emergencia: paso 1 (firma de Riesgos) ──
  IF NEW.emergency_review_at IS NOT NULL
     AND OLD.emergency_review_at IS DISTINCT FROM NEW.emergency_review_at THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_riesgos)
    LOOP
      PERFORM public.notify_staff('wo.emergency.step1_done', v_rec.staff_id, NEW.wo_id::text,
                v_base);
    END LOOP;
  END IF;

  -- ── Emergencia: paso 2 firmado -> arranca el plazo de 7 días ──
  -- La señal es `emergency_deadline_at` encendiéndose, que es lo que escribe la segunda firma
  -- (useApproveEmergencyPartner). El aviso dice "tenés 7 días para completar los datos", así
  -- que su dueño es el reloj, no la firma.
  IF NEW.emergency_deadline_at IS NOT NULL
     AND OLD.emergency_deadline_at IS DISTINCT FROM NEW.emergency_deadline_at THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.emergency.created', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('deadline', NEW.emergency_deadline_at,
                                             'status',   NEW.risk_status));
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_work_order_events fallo para % : %', NEW.wo_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_work_order_events() IS
  'FASE 3.b: 11 eventos de work_orders. Las aprobaciones se detectan por la marca de cada pista (approved_at / risk_status) y no por approval_status, porque la aprobacion se escribe en dos sentencias y el trigger corre dos veces. Degrada a WARNING: nunca bloquea la operacion.';

DROP TRIGGER IF EXISTS tr_notify_work_order ON public.work_orders;
CREATE TRIGGER tr_notify_work_order
  AFTER UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_work_order_events();

-- =====================================================================
-- C) wo_payment_installments — cambio de estado de una cuota
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_wo_installment_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_code text;
  v_curr text;
  v_rec  record;
  c_contabilidad constant text[] := ARRAY['accounting_manager', 'accounting_analyst'];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.engagement_code, ''), w.currency
    INTO v_code, v_curr
    FROM public.work_orders w
    JOIN public.engagements e ON e.engagement_id = w.engagement_id
   WHERE w.wo_id = NEW.wo_id;

  -- entity_id = wo_id, no installment_id: la cuota no tiene pantalla propia, se edita dentro
  -- de la pestaña "Plan de pagos" de su OT.
  FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_contabilidad)
  LOOP
    PERFORM public.notify_staff('wo.installment.status_changed', v_rec.staff_id,
              NEW.wo_id::text,
              jsonb_build_object(
                'engagement_code',     v_code,
                'currency',            v_curr,
                'installment_id',      NEW.installment_id,
                'installment_number',  NEW.installment_number,
                'amount',              NEW.amount,
                'agreed_payment_date', NEW.agreed_payment_date,
                'status',              NEW.status));
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_wo_installment_events fallo para % : %', NEW.installment_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_wo_installment_events() IS
  'FASE 3.b: cambio de estado de una cuota del plan de pagos, a la bandeja de Contabilidad. Degrada a WARNING: nunca bloquea la operacion.';

DROP TRIGGER IF EXISTS tr_notify_wo_installment ON public.wo_payment_installments;
CREATE TRIGGER tr_notify_wo_installment
  AFTER UPDATE ON public.wo_payment_installments
  FOR EACH ROW EXECUTE FUNCTION public.notify_wo_installment_events();

-- =====================================================================
-- D) Eventos de calendario — cron diario
-- =====================================================================
--
-- Los tres eventos que no nacen de una transición sino del paso del tiempo. No pueden ser
-- triggers: nadie escribe en la fila el día que vence el plazo.
--
-- IDEMPOTENCIA POR DESTINATARIO. El cron corre todos los días y estos hechos duran varios,
-- así que cada emisión se protege con un NOT EXISTS contra `notifications`. Se compara por
-- destinatario y no sólo por OT, para que un gerente asignado DESPUÉS del primer aviso
-- igual lo reciba. Es también lo que hace segura la re-ejecución manual de la función.
--

DROP FUNCTION IF EXISTS public.notif_wo_daily_scheduled();

CREATE FUNCTION public.notif_wo_daily_scheduled() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
  v_rec   record;
  v_sent  integer := 0;
  c_riesgos constant text[] := ARRAY['risk_partner', 'risk_supervisor'];
BEGIN
  -- ── 1. Plazo de emergencia por vencer (D-09: dos disparos del mismo tipo) ──
  -- `risk_status = 'Emergency_Approved'` es la condición de "todavía debe los datos": en
  -- cuanto el gerente los completa, useCompleteRiskAssessment lo devuelve a 'Pending' y el
  -- recordatorio se apaga solo.
  FOR v_rec IN
    SELECT w.wo_id, w.engagement_id, w.currency, w.emergency_deadline_at,
           COALESCE(e.engagement_code, '') AS engagement_code,
           (w.emergency_deadline_at - v_today) AS days_left,
           r.staff_id
      FROM public.work_orders w
      JOIN public.engagements e ON e.engagement_id = w.engagement_id
      CROSS JOIN LATERAL (
        SELECT staff_id FROM public.notif_engagement_managers(w.engagement_id)
        UNION
        SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
      ) r
     WHERE w.risk_status = 'Emergency_Approved'
       AND w.emergency_deadline_at IS NOT NULL
       AND (w.emergency_deadline_at - v_today) IN (3, 0)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.type_key = 'wo.emergency.deadline_near'
         AND n.entity_id = v_rec.wo_id::text
         AND n.recipient_staff_id = v_rec.staff_id
         AND n.payload->>'days_left' = v_rec.days_left::text
    ) THEN
      IF public.notify_staff('wo.emergency.deadline_near', v_rec.staff_id,
           v_rec.wo_id::text,
           jsonb_build_object('engagement_code', v_rec.engagement_code,
                              'engagement_id',   v_rec.engagement_id,
                              'currency',        v_rec.currency,
                              'deadline',        v_rec.emergency_deadline_at,
                              'days_left',       v_rec.days_left)
           -- El último día no se anuncia como "quedan 0 días": `context` de i18next le da
           -- su propio texto sin gastar un tipo del catálogo (D-09).
           || CASE WHEN v_rec.days_left = 0
                   THEN jsonb_build_object('context', 'last_day')
                   ELSE '{}'::jsonb END) IS NOT NULL THEN
        v_sent := v_sent + 1;
      END IF;
    END IF;
  END LOOP;

  -- ── 2. Plazo de emergencia vencido ──
  -- Un solo aviso por OT y destinatario, sin `days_left`: el hecho no cambia con los días.
  FOR v_rec IN
    SELECT w.wo_id, w.engagement_id, w.currency, w.emergency_deadline_at,
           COALESCE(e.engagement_code, '') AS engagement_code,
           r.staff_id
      FROM public.work_orders w
      JOIN public.engagements e ON e.engagement_id = w.engagement_id
      CROSS JOIN LATERAL (
        SELECT staff_id FROM public.notif_staff_by_roles(c_riesgos)
      ) r
     WHERE w.risk_status = 'Emergency_Approved'
       AND w.emergency_deadline_at IS NOT NULL
       AND w.emergency_deadline_at < v_today
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.type_key = 'wo.emergency.deadline_passed'
         AND n.entity_id = v_rec.wo_id::text
         AND n.recipient_staff_id = v_rec.staff_id
    ) THEN
      IF public.notify_staff('wo.emergency.deadline_passed', v_rec.staff_id,
           v_rec.wo_id::text,
           jsonb_build_object('engagement_code', v_rec.engagement_code,
                              'engagement_id',   v_rec.engagement_id,
                              'currency',        v_rec.currency,
                              'deadline',        v_rec.emergency_deadline_at)) IS NOT NULL THEN
        v_sent := v_sent + 1;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. Semana de facturación del cliente (D-22) ──
  -- Una cuota entra en su semana de facturación cuando `agreed_invoice_date` cae en la semana
  -- corriente (lunes a domingo) y todavía no se facturó. El dedup lleva installment_id porque
  -- una OT puede tener dos cuotas facturables en la misma semana y el entity_id es la OT.
  FOR v_rec IN
    SELECT i.installment_id, i.installment_number, i.amount, i.agreed_invoice_date,
           w.wo_id, w.engagement_id, w.currency,
           COALESCE(e.engagement_code, '') AS engagement_code,
           r.staff_id
      FROM public.wo_payment_installments i
      JOIN public.work_orders w ON w.wo_id = i.wo_id
      JOIN public.engagements e ON e.engagement_id = w.engagement_id
      CROSS JOIN LATERAL (
        SELECT staff_id FROM public.notif_engagement_managers(w.engagement_id)
      ) r
     WHERE i.status = 'Pending'
       AND i.agreed_invoice_date IS NOT NULL
       AND i.agreed_invoice_date >= date_trunc('week', v_today)::date
       AND i.agreed_invoice_date <= date_trunc('week', v_today)::date + 6
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.type_key = 'wo.client.billing_week'
         AND n.entity_id = v_rec.wo_id::text
         AND n.recipient_staff_id = v_rec.staff_id
         AND n.payload->>'installment_id' = v_rec.installment_id::text
    ) THEN
      IF public.notify_staff('wo.client.billing_week', v_rec.staff_id,
           v_rec.wo_id::text,
           jsonb_build_object('engagement_code',    v_rec.engagement_code,
                              'engagement_id',      v_rec.engagement_id,
                              'currency',           v_rec.currency,
                              'installment_id',     v_rec.installment_id,
                              'installment_number', v_rec.installment_number,
                              'amount',             v_rec.amount,
                              'invoice_date',       v_rec.agreed_invoice_date)) IS NOT NULL THEN
        v_sent := v_sent + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$BODY$;

COMMENT ON FUNCTION public.notif_wo_daily_scheduled() IS
  'FASE 3.b: los 3 eventos del modulo OT que dependen del calendario (plazo de emergencia por vencer / vencido, semana de facturacion). Idempotente por destinatario contra public.notifications: re-ejecutarla el mismo dia no duplica nada. Devuelve cuantas notificaciones emitio.';

-- Sin GRANT a `authenticated`: la dispara el cron, no el cliente.
REVOKE ALL ON FUNCTION public.notif_wo_daily_scheduled() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notif_wo_daily_scheduled() TO service_role;

-- El guard de pg_cron es el mismo patrón defensivo de cero_01/cero_02: en el harness local la
-- extensión no existe (sólo se puede crear en la base `postgres`) y la migración no debe
-- fallar por eso. '0 12 * * *' UTC ≈ 08:00 America/La_Paz: los avisos de plazo llegan al
-- empezar la jornada, no de madrugada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-wo-daily') THEN
      PERFORM cron.unschedule('notif-wo-daily');
    END IF;
    PERFORM cron.schedule(
      'notif-wo-daily',
      '0 12 * * *',
      $cron$SELECT public.notif_wo_daily_scheduled();$cron$
    );
  END IF;
END $$;


-- #####################################################################
-- ## PARTE 3 — ENCARGOS (Fase 3.c)
-- #####################################################################
--
-- TRES CÍRCULOS DE DESTINATARIOS, y la diferencia importa:
--   * `notif_engagement_owners()`   los 6 cargos DEL ENCARGO. Es "la conducción".
--   * `notif_engagement_staffed()`  la gente de `engagement_assignments` VIGENTE: seniors,
--                                   semis, asistentes. Sin esto `engagement.finalized` —que
--                                   la matriz concede a 15 roles— no llegaría a ninguno,
--                                   porque al encargo no se atan por columna.
--   * el afectado                   alcance `own`: el recién asignado o dado de baja.
--
-- BORRADO DEL ENCARGO: `engagements` NO tiene borrado lógico, así que ese disparador va
-- AFTER DELETE y lee OLD. La notificación sobrevive a la fila, que es correcto: el hecho a
-- comunicar es justamente que dejó de existir.

-- =====================================================================
-- A) Los dos círculos que faltaban
-- =====================================================================

DROP FUNCTION IF EXISTS public.notif_engagement_owners(uuid);

CREATE FUNCTION public.notif_engagement_owners(p_engagement_id uuid)
    RETURNS TABLE (staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  -- Los 6 cargos del encargo. `notif_engagement_partners` + `notif_engagement_managers`
  -- (PARTE 2) cubren 5 de estos 6 entre las dos; acá se suma `encargado_id`, que en el
  -- módulo OT no hacía falta y en éste sí.
  SELECT s FROM (
    SELECT e.partner_id        AS s FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION SELECT e.manager_id        FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION SELECT e.sqr_id            FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION SELECT e.encargado_id      FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION SELECT e.specialist_it_id  FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION SELECT e.specialist_tax_id FROM public.engagements e WHERE e.engagement_id = p_engagement_id
  ) q WHERE s IS NOT NULL
$BODY$;

COMMENT ON FUNCTION public.notif_engagement_owners(uuid) IS
  'Los 6 cargos de un encargo: partner, manager, sqr, encargado y los dos especialistas. Alcance `assigned` de la conduccion, para el modulo Encargos.';

DROP FUNCTION IF EXISTS public.notif_engagement_staffed(uuid);

CREATE FUNCTION public.notif_engagement_staffed(p_engagement_id uuid)
    RETURNS TABLE (staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  -- Staffing VIGENTE (decisión del operador 2026-09-10): ni borrado lógicamente ni
  -- CANCELLED. Quien salió del encargo hace tres meses no tiene por qué enterarse de que
  -- terminó.
  SELECT DISTINCT a.staff_id
    FROM public.engagement_assignments a
   WHERE a.engagement_id = p_engagement_id
     AND a.deleted_at IS NULL
     AND a.status <> 'CANCELLED'
$BODY$;

COMMENT ON FUNCTION public.notif_engagement_staffed(uuid) IS
  'Staff con asignacion VIGENTE en el encargo (engagement_assignments sin deleted_at y con status <> CANCELLED). Es la unica via por la que seniors/semis/asistentes se atan a un encargo.';

-- =====================================================================
-- B) engagements — 5 eventos
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_engagement_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_row      record;
  v_base     jsonb;
  v_rec      record;
  v_owners   boolean;
  v_finished boolean;
BEGIN
  -- OLD en el borrado, NEW en todo lo demás: así el resto del cuerpo no repite el CASE.
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  v_base := jsonb_build_object(
    'engagement_code', COALESCE(v_row.engagement_code, ''),
    'engagement_name', COALESCE(v_row.engagement_name, ''),
    'engagement_id',   v_row.engagement_id);

  -- ── Borrado: sólo auditoría (la matriz se lo da a ADM con alcance firm) ──
  IF TG_OP = 'DELETE' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
    LOOP
      PERFORM public.notify_staff('engagement.deleted', v_rec.staff_id,
                                  v_row.engagement_id::text, v_base);
    END LOOP;
    RETURN NULL;
  END IF;

  -- ── Alta ──
  IF TG_OP = 'INSERT' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_owners(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('engagement.created', v_rec.staff_id,
                                  NEW.engagement_id::text, v_base);
    END LOOP;
  END IF;

  -- ── Cambio de responsables ──
  -- En el alta NO se emite: "cambiaron los responsables" de un encargo que acaba de nacer no
  -- es un hecho — para eso está `engagement.created`.
  IF TG_OP = 'UPDATE' THEN
    v_owners := NEW.partner_id        IS DISTINCT FROM OLD.partner_id
             OR NEW.manager_id        IS DISTINCT FROM OLD.manager_id
             OR NEW.sqr_id            IS DISTINCT FROM OLD.sqr_id
             OR NEW.encargado_id      IS DISTINCT FROM OLD.encargado_id
             OR NEW.specialist_it_id  IS DISTINCT FROM OLD.specialist_it_id
             OR NEW.specialist_tax_id IS DISTINCT FROM OLD.specialist_tax_id;

    IF v_owners THEN
      -- Admins por auditoría (firm) + la conducción nueva. Se notifica a la conducción
      -- RESULTANTE, no a la anterior: al que sacaron ya no le corresponde el encargo.
      FOR v_rec IN
        SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
        UNION
        SELECT staff_id FROM public.notif_engagement_owners(NEW.engagement_id)
      LOOP
        PERFORM public.notify_staff('engagement.owners.changed', v_rec.staff_id,
                                    NEW.engagement_id::text, v_base);
      END LOOP;
    END IF;
  END IF;

  -- ── "Te asignaron como SQR / Encargado" (alcance `own`) ──
  -- Se emiten TAMBIÉN en el alta (decisión del operador 2026-09-10): el formulario pide las
  -- dos personas al crear el encargo, y si sólo se emitieran al reasignar, un Encargado no se
  -- enteraría nunca de su primer encargo — en `engagement.created` la columna Senior está en
  -- `no`, así que ese aviso no le llega.
  IF NEW.sqr_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.sqr_id IS DISTINCT FROM OLD.sqr_id) THEN
    PERFORM public.notify_staff('engagement.sqr_assigned', NEW.sqr_id,
                                NEW.engagement_id::text, v_base);
  END IF;

  IF NEW.encargado_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.encargado_id IS DISTINCT FROM OLD.encargado_id) THEN
    PERFORM public.notify_staff('engagement.encargado_assigned', NEW.encargado_id,
                                NEW.engagement_id::text, v_base);
  END IF;

  -- ── Finalización ──
  -- La señal es el override llegando a 7, venga del cron nocturno
  -- (finalize_due_engagements) o del trigger BEFORE recompute_engagement_finalization, que
  -- lo fija en cualquier UPDATE cuya fecha fin ya pasó. Las dos vías terminan acá.
  v_finished := NEW.engagement_state_override = 7
            AND (TG_OP = 'INSERT' OR OLD.engagement_state_override IS DISTINCT FROM 7);

  IF v_finished THEN
    -- Conducción + equipo vigente. Es el único evento del módulo que baja hasta los
    -- asistentes, y por eso el único que necesita la tabla de staffing.
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
      UNION
      SELECT staff_id FROM public.notif_engagement_owners(NEW.engagement_id)
      UNION
      SELECT staff_id FROM public.notif_engagement_staffed(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('engagement.finalized', v_rec.staff_id,
                NEW.engagement_id::text,
                v_base || jsonb_build_object('end_date', NEW.end_date));
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_engagement_events fallo para % : %', v_row.engagement_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_engagement_events() IS
  'FASE 3.c: 5 eventos de engagements (alta, cambio de responsables, asignacion de SQR/Encargado, finalizacion y borrado). La finalizacion baja hasta el staffing vigente porque es el unico evento que la matriz concede a seniors/semis/asistentes. Degrada a WARNING.';

DROP TRIGGER IF EXISTS tr_notify_engagement ON public.engagements;
CREATE TRIGGER tr_notify_engagement
  AFTER INSERT OR UPDATE OR DELETE ON public.engagements
  FOR EACH ROW EXECUTE FUNCTION public.notify_engagement_events();

-- =====================================================================
-- C) engagement_assignments — asignación y desasignación de staffing
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_engagement_staffing_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_alta  boolean;
  v_baja  boolean;
  v_code  text;
  v_name  text;
  v_who   text;
  v_base  jsonb;
  v_rec   record;
BEGIN
  -- TRES FORMAS DE SACAR A ALGUIEN, y las tres cuentan (decisión del operador 2026-09-10):
  -- el borrado lógico (`deleted_at`, que es lo que escribe save_engagement_assignments) y el
  -- paso a CANCELLED. Los cambios de fechas/horas/porcentaje NO avisan: el Scheduler
  -- reescribe esas columnas seguido y sería puro ruido.
  IF TG_OP = 'INSERT' THEN
    v_alta := NEW.deleted_at IS NULL AND NEW.status <> 'CANCELLED';
    v_baja := false;
  ELSE
    v_alta := (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL AND NEW.status <> 'CANCELLED')
           OR (OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' AND NEW.deleted_at IS NULL);
    v_baja := (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
           OR (OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED');
  END IF;

  IF NOT (v_alta OR v_baja) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.engagement_code, ''), COALESCE(e.engagement_name, '')
    INTO v_code, v_name
    FROM public.engagements e
   WHERE e.engagement_id = NEW.engagement_id;

  SELECT COALESCE(s.first_name || ' ' || s.last_name, '')
    INTO v_who
    FROM public.staff s WHERE s.staff_id = NEW.staff_id;

  v_base := jsonb_build_object(
    'engagement_code', v_code,
    'engagement_name', v_name,
    'engagement_id',   NEW.engagement_id,
    'staff_name',      v_who);

  -- El MISMO type_key con dos redacciones, porque el hecho se lee distinto según de qué lado
  -- estés: "te asignaron a X" vs "asignaron a Fulano a X". `context` es la clave reservada de
  -- i18next y el panel hace t(label_key, {...payload}), así que cada destinatario recibe su
  -- propia variante sin que el catálogo necesite cuatro tipos.
  PERFORM public.notify_staff('engagement.staffing.changed', NEW.staff_id,
            NEW.engagement_id::text,
            v_base || jsonb_build_object('context',
              CASE WHEN v_alta THEN 'assigned' ELSE 'unassigned' END));

  FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
  LOOP
    -- Al propio afectado no se le manda dos veces si además es gerente del encargo.
    IF v_rec.staff_id IS DISTINCT FROM NEW.staff_id THEN
      PERFORM public.notify_staff('engagement.staffing.changed', v_rec.staff_id,
                NEW.engagement_id::text,
                v_base || jsonb_build_object('context',
                  CASE WHEN v_alta THEN 'team_assigned' ELSE 'team_unassigned' END));
    END IF;
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_engagement_staffing_events fallo para % : %', NEW.assignment_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_engagement_staffing_events() IS
  'FASE 3.c: alta y baja de staffing. Baja = deleted_at o status CANCELLED; los cambios de fechas/horas no avisan. El afectado y los gerentes reciben el mismo type_key con redaccion distinta via el `context` de i18next. Degrada a WARNING.';

DROP TRIGGER IF EXISTS tr_notify_engagement_staffing ON public.engagement_assignments;
CREATE TRIGGER tr_notify_engagement_staffing
  AFTER INSERT OR UPDATE ON public.engagement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_engagement_staffing_events();

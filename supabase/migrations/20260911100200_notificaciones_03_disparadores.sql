--
-- NOTIFICACIONES 03 — disparadores de los módulos con emisores.
--
-- Un archivo por CAPA, no por módulo: el catálogo y el portón viven en el 01, la matriz
-- sembrada en el 02, y acá los emisores. Cuando llegue un módulo nuevo se agrega su parte al
-- final de este archivo, no un archivo más — la alternativa (uno por módulo) ya se probó y
-- dejaba a `get_my_notification_aggregates()` definida en dos lugares, con el que corriera
-- último ganando en silencio.
--
--   PARTE 1  Solicitudes de Fondos   (Fase 3.a)  2 triggers, 14 eventos
--   PARTE 2  Órdenes de Trabajo      (Fase 3.b)  2 triggers + 1 cron, 15 eventos
--   PARTE 3  Encargos                (Fase 3.c)  2 triggers + 1 cron, 8 eventos
--   PARTE 4  Tiempos                 (Fase 3.d)  3 triggers, 7 eventos
--                                                (timesheets + aprobaciones + tracker)
--   PARTE 5  Cuentas / Auth          (Fase 3.e)  3 triggers, 8 eventos
--                                                (cuentas + personal + competencias)
--   PARTE 6  Clientes                (Fase 3.f)  1 trigger, 3 eventos
--   PARTE 7  Hojas de Trabajo        (Fase 3.g)  1 trigger, 1 evento (sin via en el
--                                                producto todavia: D-38)
--
-- El aviso previo a la fecha fin del encargo (D-05) se agrego al final, despues de la
-- PARTE 7: necesita `notif_engagement_owners()`, que se define en la PARTE 3.
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
  --
  -- El UNION no es cosmetico y el DISTINCT de notif_fund_request_managers() no alcanza: el
  -- solicitante PUEDE ser tambien gerente de la OT. `manager` tiene `fund_request.create`, y
  -- `fr_wo_set_manager()` copia `manager_staff_id` desde `engagements.manager_id`, asi que un
  -- Gerente que pide fondos contra una OT de su propio encargo cae en las dos listas. Como
  -- notify_staff() no deduplica --inserta una fila por llamada, y el dedupe_key del correo es
  -- el notification_id, distinto en cada INSERT-- recibia dos campanas y dos correos por hito.
  -- Es el mismo patron que ya usaba la cancelacion, mas abajo.
  IF OLD.disbursed_at IS NULL AND NEW.disbursed_at IS NOT NULL THEN
    FOR v_rec IN
      SELECT NEW.requester_staff_id AS staff_id
      UNION
      SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.disbursement.done',
                v_rec.staff_id, NEW.fund_request_id::text,
                v_payload || jsonb_build_object('disbursed', NEW.total_disbursed_amount));
    END LOOP;
  END IF;

  IF OLD.settled_at IS NULL AND NEW.settled_at IS NOT NULL THEN
    FOR v_rec IN
      SELECT NEW.requester_staff_id AS staff_id
      UNION
      SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.settlement.recorded',
                v_rec.staff_id, NEW.fund_request_id::text,
                v_payload || jsonb_build_object('balance', NEW.settlement_balance));
    END LOOP;
  END IF;

  IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
    FOR v_rec IN
      SELECT NEW.requester_staff_id AS staff_id
      UNION
      SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
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

-- El DROP no es decorativo: sin él, re-pegar este archivo tras una aplicación parcial
-- muere con 42710 ("trigger already exists") en esta línea, y el encabezado promete que es
-- idempotente. Mismo patrón que los cinco disparadores siguientes.
DROP TRIGGER IF EXISTS tr_notify_fund_request ON public.fund_requests;
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

DROP TRIGGER IF EXISTS tr_notify_fund_expense ON public.fund_request_expenses;
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
REVOKE ALL ON FUNCTION public.notif_wo_daily_scheduled() FROM PUBLIC, anon, authenticated;
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
--   * `notif_engagement_staffed()`  la gente de `engagement_assignments` viva AL CIERRE: seniors,
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
  -- Staffing VIGENTE AL CIERRE (decisión del operador 2026-09-10): "quien salió del encargo
  -- hace tres meses no tiene por qué enterarse de que terminó".
  --
  -- Hay TRES formas de salir y antes se miraban dos. El borrado lógico y el `CANCELLED` son las
  -- dos salidas ANTICIPADAS; la tercera es la normal —la asignación llega a su `end_date`— y no
  -- deja ninguna marca de estado: `end_date` es NOT NULL, nadie en el repositorio escribe
  -- `'COMPLETED'` (el estado existe en el CHECK y ninguna vía lo asigna), así que una asignación
  -- vencida se queda en `CONFIRMED` con `deleted_at` NULL para siempre. Sin mirar la fecha, esta
  -- función devolvía a quien estuvo en enero para un encargo que cierra en septiembre.
  --
  -- LA COMPARACIÓN ES CONTRA `engagements.end_date` Y NO CONTRA HOY, y eso no es un detalle: el
  -- encargo se finaliza DESPUÉS de que su fecha de fin pasó, así que a esa altura todas las
  -- asignaciones ya vencieron y un filtro contra `now()` dejaría la lista VACÍA — convertiría un
  -- aviso de más en un aviso de menos, que es peor.
  --
  -- Con `e.end_date` NULL no se filtra nada: un dato faltante no puede vaciar la audiencia.
  --
  -- Achicar esto no puede silenciar el evento: `notify_engagement_events` une admin + los 6
  -- cargos + este helper, así que la finalización siempre llega a la conducción.
  SELECT DISTINCT a.staff_id
    FROM public.engagement_assignments a
    JOIN public.engagements e ON e.engagement_id = a.engagement_id
   WHERE a.engagement_id = p_engagement_id
     AND a.deleted_at IS NULL
     AND a.status <> 'CANCELLED'
     AND (e.end_date IS NULL
          OR (a.start_date <= e.end_date AND a.end_date >= e.end_date))
$BODY$;

COMMENT ON FUNCTION public.notif_engagement_staffed(uuid) IS
  'Staff cuya asignacion seguia viva AL CIERRE del encargo: sin deleted_at, status <> CANCELLED, y abarcando engagements.end_date. La tercera condicion es la que excluye a quien se fue por vencimiento normal de su asignacion, que no deja marca de estado. Se compara contra end_date del encargo y no contra hoy, porque la finalizacion ocurre cuando esa fecha ya paso y filtrar por hoy vaciaria la lista. Con end_date NULL no filtra. Es la unica via por la que seniors/semis/asistentes se atan a un encargo.';

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
  v_cliente  text;
BEGIN
  -- OLD en el borrado, NEW en todo lo demás: así el resto del cuerpo no repite el CASE.
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  -- El CLIENTE viaja en el payload porque es lo que ubica al encargo: "Auditoria Externa 2026"
  -- se repite entre clientes, y el correo de `engagement.specialist_assigned` sale SIN BOTÓN
  -- —el portafolio de 0828-185 no contempla a los especialistas—, así que el texto es lo único
  -- que el destinatario tiene para saber de qué encargo le hablan. `client_id` es NOT NULL, así que
  -- esto sólo queda vacío si el cliente se borró en la misma transacción.
  SELECT c.client_legal_name INTO v_cliente
    FROM public.clients c
   WHERE c.client_id = v_row.client_id;

  v_base := jsonb_build_object(
    'engagement_code', COALESCE(v_row.engagement_code, ''),
    'engagement_name', COALESCE(v_row.engagement_name, ''),
    'client_name',     COALESCE(v_cliente, ''),
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

  -- Y lo mismo para los dos gerentes ESPECIALISTAS (D-43). Sin esto, al Gerente ESPECIALISTA
  -- ITA/TAX solo le llegaba `engagement.owners.changed` —"Cambiaron los responsables del
  -- encargo"—, el mismo aviso generico que recibe cuando cambian al Socio o al SQR: tenia que
  -- abrir el encargo para saber si el cambio era sobre el.
  --
  -- UN tipo y no dos, con la especialidad en `context`: el hecho es identico y lo unico que
  -- cambia es la palabra. Mismo criterio que D-09 con `days_left`.
  IF NEW.specialist_it_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.specialist_it_id IS DISTINCT FROM OLD.specialist_it_id) THEN
    PERFORM public.notify_staff('engagement.specialist_assigned', NEW.specialist_it_id,
              NEW.engagement_id::text, v_base || jsonb_build_object('context', 'it'));
  END IF;

  IF NEW.specialist_tax_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.specialist_tax_id IS DISTINCT FROM OLD.specialist_tax_id) THEN
    PERFORM public.notify_staff('engagement.specialist_assigned', NEW.specialist_tax_id,
              NEW.engagement_id::text, v_base || jsonb_build_object('context', 'tax'));
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
  'FASE 3.c: 5 eventos de engagements (alta, cambio de responsables, asignacion de SQR/Encargado/especialista, finalizacion y borrado). La finalizacion baja hasta el staffing vigente porque es el unico evento que la matriz concede a seniors/semis/asistentes. Degrada a WARNING.';

DROP TRIGGER IF EXISTS tr_notify_engagement ON public.engagements;
CREATE TRIGGER tr_notify_engagement
  AFTER INSERT OR UPDATE OR DELETE ON public.engagements
  FOR EACH ROW EXECUTE FUNCTION public.notify_engagement_events();

-- =====================================================================
-- C.0) Una asignación no se muda de encargo
-- =====================================================================
--
-- La fila de `engagement_assignments` pertenece a SU encargo, y cambiarle `engagement_id` no es
-- "mover a alguien": es dejar una fila cuyos datos pertenecen a otro lado.
--
--   * `requirement_id` apunta a `wo_staffing_requirements`, que cuelga de una OT y por lo tanto de
--     UN encargo. Movida la fila, ese puntero señala el requerimiento de un encargo ajeno — y esa
--     columna NO tiene clave foránea (ni en cero_03 ni en cero_04), asi que nada se queja.
--   * `start_date`, `end_date`, `hours_per_week`, `allocation_percent` y `category_id` se cargaron
--     contra el encargo viejo, y la deteccion de solapamiento de `save_engagement_assignments`
--     corrio contra ESE conjunto de asignaciones. Despues del movimiento nadie las revalida.
--
-- Por eso se prohibe en vez de notificarse. El disparador de abajo reconoce tres hechos —entro
-- alguien, salio alguien, lo reemplazaron— y un cambio de encargo a secas no es ninguno: la fila
-- sigue viva y la persona no cambia, asi que el aviso no salia y nadie se enteraba. Agregarle esa
-- rama seria anunciar con prolijidad una operacion que deja la fila mintiendo; el agujero de
-- verdad es que la operacion exista.
--
-- NINGUN camino de la aplicacion se rompe: `save_engagement_assignments` no incluye
-- `engagement_id` en su SET y su WHERE lo fija (cero_02). Mover a una persona de encargo ya se
-- hace como corresponde — se cierra una asignacion y se abre otra—, y por esa via todos los avisos
-- salen solos.
--
-- Va como trigger y no como CHECK porque hay que comparar OLD con NEW.
CREATE OR REPLACE FUNCTION public.reject_engagement_assignment_move() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $BODY$
BEGIN
  IF NEW.engagement_id IS DISTINCT FROM OLD.engagement_id THEN
    RAISE EXCEPTION
      'ASSIGNMENT_ENGAGEMENT_IMMUTABLE: una asignacion no cambia de encargo (% -> %). Cerrar la asignacion en el encargo actual y crear una nueva en el destino.',
      OLD.engagement_id, NEW.engagement_id;
  END IF;
  RETURN NEW;
END;
$BODY$;

COMMENT ON FUNCTION public.reject_engagement_assignment_move() IS
  'Rechaza cambiarle el engagement_id a una asignacion existente. La fila lleva datos atados a su encargo —requirement_id (sin FK), fechas, horas, categoria, y el solapamiento validado contra ese encargo— que un movimiento deja apuntando a otro lado sin que nada se queje. La via soportada es cerrar la asignacion y abrir otra.';

DROP TRIGGER IF EXISTS tr_reject_engagement_assignment_move ON public.engagement_assignments;
CREATE TRIGGER tr_reject_engagement_assignment_move
  BEFORE UPDATE ON public.engagement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.reject_engagement_assignment_move();

-- =====================================================================
-- C) engagement_assignments — asignación y desasignación de staffing
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_engagement_staffing_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_viva_antes boolean;
  v_viva_ahora boolean;
  v_alta       boolean;
  v_baja       boolean;
  v_reemplazo  boolean;
  v_avisos     jsonb;
  v_aviso      jsonb;
  v_staff      uuid;
  v_eng        uuid;
  v_es_alta    boolean;
  v_code       text;
  v_name       text;
  v_who        text;
  v_base       jsonb;
  v_rec        record;
BEGIN
  -- TRES FORMAS DE SACAR A ALGUIEN, y las tres cuentan (decisión del operador 2026-09-10).
  -- Durante un tiempo el comentario decía "tres" y el código miraba dos: el borrado lógico
  -- (`deleted_at`, que es lo que escribe save_engagement_assignments) y el paso a CANCELLED.
  --
  -- La tercera es el REEMPLAZO: `save_engagement_assignments` cambia `staff_id` en la fila que ya
  -- existe, sin tocar `deleted_at` ni `status`. No es un caso raro —esa función tiene una
  -- validación dedicada para él (cero_02, "reasignar la fila a un staff DISTINTO exige la misma
  -- elegibilidad que un insert nuevo")— y sin embargo no encendía ninguno de los dos predicados,
  -- así que la reasignación no le avisaba a NADIE: ni a quien salía, ni a quien entraba, ni a los
  -- gerentes.
  --
  -- Un reemplazo son DOS hechos y se emiten los dos, en ese orden: se fue uno, entró otro.
  --
  -- Los cambios de fechas/horas/porcentaje siguen sin avisar: el Scheduler reescribe esas
  -- columnas seguido y sería puro ruido.
  --
  -- "Viva" se calcula una vez y las tres condiciones se leen de ahí. Antes cada predicado
  -- enumeraba sus combinaciones de `deleted_at` y `status` por separado, y de paso eso hacía que
  -- borrar una fila que YA estaba CANCELLED contara como una baja nueva.
  IF TG_OP = 'INSERT' THEN
    v_viva_antes := false;
    v_viva_ahora := NEW.deleted_at IS NULL AND NEW.status <> 'CANCELLED';
  ELSE
    v_viva_antes := OLD.deleted_at IS NULL AND OLD.status <> 'CANCELLED';
    v_viva_ahora := NEW.deleted_at IS NULL AND NEW.status <> 'CANCELLED';
  END IF;

  v_alta      := NOT v_viva_antes AND v_viva_ahora;
  v_baja      := v_viva_antes AND NOT v_viva_ahora;
  v_reemplazo := TG_OP <> 'INSERT'
             AND v_viva_antes AND v_viva_ahora
             AND NEW.staff_id IS DISTINCT FROM OLD.staff_id;

  -- Cada aviso es (a quién, de qué encargo, si es alta). El reemplazo produce dos; el resto, uno.
  --
  -- La baja lleva el encargo VIEJO y el alta el nuevo, y no es una precaución vacía: nada en la
  -- base impide que un UPDATE directo mueva `engagement_id` —`save_engagement_assignments` no lo
  -- toca y su WHERE lo fija, pero eso es la aplicación, no una restricción—. Con los dos avisos
  -- armados sobre `NEW`, un movimiento entre encargos le decía al que sale que lo sacaron de un
  -- encargo donde nunca estuvo, y dejaba a los gerentes del encargo viejo sin enterarse.
  IF v_reemplazo THEN
    v_avisos := jsonb_build_array(
      jsonb_build_object('staff', OLD.staff_id, 'eng', OLD.engagement_id, 'alta', false),
      jsonb_build_object('staff', NEW.staff_id, 'eng', NEW.engagement_id, 'alta', true));
  ELSIF v_alta OR v_baja THEN
    v_avisos := jsonb_build_array(
      jsonb_build_object('staff', NEW.staff_id, 'eng', NEW.engagement_id, 'alta', v_alta));
  ELSE
    RETURN NULL;
  END IF;

  FOR v_aviso IN SELECT * FROM jsonb_array_elements(v_avisos)
  LOOP
    v_staff   := (v_aviso->>'staff')::uuid;
    v_eng     := (v_aviso->>'eng')::uuid;
    v_es_alta := (v_aviso->>'alta')::boolean;

    -- Encargo y persona se resuelven POR AVISO. En un reemplazo cada mitad nombra a una persona
    -- distinta —el texto que leen los gerentes es "asignaron a Fulano" / "sacaron a Mengano"— y,
    -- si además cambió el encargo, cada mitad habla del suyo.
    SELECT COALESCE(e.engagement_code, ''), COALESCE(e.engagement_name, '')
      INTO v_code, v_name
      FROM public.engagements e
     WHERE e.engagement_id = v_eng;

    SELECT COALESCE(s.first_name || ' ' || s.last_name, '')
      INTO v_who
      FROM public.staff s WHERE s.staff_id = v_staff;

    v_base := jsonb_build_object(
      'engagement_code', v_code,
      'engagement_name', v_name,
      'engagement_id',   v_eng,
      'staff_name',      v_who);

    -- El MISMO type_key con dos redacciones, porque el hecho se lee distinto según de qué lado
    -- estés: "te asignaron a X" vs "asignaron a Fulano a X". `context` es la clave reservada de
    -- i18next y el panel hace t(label_key, {...payload}), así que cada destinatario recibe su
    -- propia variante sin que el catálogo necesite cuatro tipos.
    PERFORM public.notify_staff('engagement.staffing.changed', v_staff,
              v_eng::text,
              v_base || jsonb_build_object('context',
                CASE WHEN v_es_alta THEN 'assigned' ELSE 'unassigned' END));

    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(v_eng)
    LOOP
      -- Al propio afectado no se le manda dos veces si además es gerente del encargo.
      IF v_rec.staff_id IS DISTINCT FROM v_staff THEN
        PERFORM public.notify_staff('engagement.staffing.changed', v_rec.staff_id,
                  v_eng::text,
                  v_base || jsonb_build_object('context',
                    CASE WHEN v_es_alta THEN 'team_assigned' ELSE 'team_unassigned' END));
      END IF;
    END LOOP;
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_engagement_staffing_events fallo para % : %', NEW.assignment_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_engagement_staffing_events() IS
  'FASE 3.c: alta, baja y REEMPLAZO de staffing. Baja = deleted_at o status CANCELLED; reemplazo = cambia staff_id en la fila viva, que es como save_engagement_assignments reasigna una posicion y antes no avisaba a nadie. Un reemplazo emite dos hechos: baja del anterior y alta del nuevo. Los cambios de fechas/horas no avisan. El afectado y los gerentes reciben el mismo type_key con redaccion distinta via el `context` de i18next. Degrada a WARNING.';

DROP TRIGGER IF EXISTS tr_notify_engagement_staffing ON public.engagement_assignments;
CREATE TRIGGER tr_notify_engagement_staffing
  AFTER INSERT OR UPDATE ON public.engagement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_engagement_staffing_events();


-- #####################################################################
-- ## PARTE 4 — TIEMPOS: TIMESHEETS, APROBACIONES Y TRACKER (Fase 3.d)
-- #####################################################################
--
-- Tres tablas y un problema nuevo: acá, por primera vez, el MISMO type_key se reparte con
-- alcances distintos según el rol. `timesheet.weekly_submitted` es `assigned` para la
-- conducción del encargo, y la matriz nunca lo entrega como `own`. `notify_staff()` no
-- evalúa `scope_key` —sólo elegibilidad rol×tipo—, así que respetarlo es del disparador: de
-- ahí `notif_scope_of()`, que le pregunta a la matriz con qué alcance le toca a ESE
-- destinatario.
--
-- CÓMO SE REPARTE UN ENVÍO DE BOLETA (D-12). Un mismo hecho, tres audiencias disjuntas:
--   * el DUEÑO       `timesheet.own_submit_confirmed`        acuse de su envío y de su retiro
--   * el APROBADOR   `timesheet.team_submitted_for_approval` accionable, tiene prioridad
--   * la CONDUCCIÓN  `timesheet.weekly_submitted`            informativo, sólo a quien no aprueba
-- Nadie recibe dos filas por el mismo envío: el informativo saltea al dueño y a los
-- aprobadores. Antes de cerrar D-12, con las celdas `propio` de la matriz y el `firm` de los
-- socios, un envío podía dejar tres filas a la misma persona y una por cada boleta de la
-- firma a cada socio.
--
-- LO QUE NO NOTIFICA, Y POR QUÉ (las tres trampas de este módulo):
--   1. La AUTOAPROBACIÓN (D-30). `submit_timesheet_safe` deja líneas en `approved` sin que
--      nadie las mire (encargos con `approval_required = false`, feriados, categorías con
--      `timesheet.self_approve`) y siempre con `approved_by` = el dueño del período. El
--      evento avisa que ALGUIEN revisó tu trabajo, así que exige `approved_by <> dueño`.
--   2. El REENVÍO tras corregir (D-33). `submit_timesheet_safe` devuelve las líneas
--      rechazadas a `pending`; eso no es una solicitud de revisión. La solicitud es
--      `approved -> pending`, que sólo escribe `useRequestRevision`.
--   3. El RETIRO de la boleta sólo le importa al dueño: `unsubmit_timesheet_safe` no reabre
--      trabajo para nadie más (borra las líneas aprobadas) y la matriz no le dio tipo.
--
-- El contador de capacitación (`approval.training_pending`) vive en el archivo 01 con el
-- resto de los `aggregate`.

-- =====================================================================
-- A) Resolución de destinatarios
-- =====================================================================

DROP FUNCTION IF EXISTS public.notif_scope_of(text, uuid);

CREATE FUNCTION public.notif_scope_of(p_type_key text, p_staff_id uuid)
    RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  -- El alcance con el que la matriz le concede ese tipo al rol del destinatario, o NULL si
  -- no se lo concede. `user_roles` es UNIQUE por usuario y la PK de la matriz es
  -- (role_key, type_key), así que devuelve una fila como máximo.
  SELECT nrt.scope_key
    FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
    JOIN public.notification_role_types nrt ON nrt.role_key = ur.role_key
   WHERE s.staff_id = p_staff_id
     AND nrt.type_key = p_type_key
$BODY$;

COMMENT ON FUNCTION public.notif_scope_of(text, uuid) IS
  'Alcance (scope_key) con el que la matriz de notificaciones le concede un type_key al rol de un staff; NULL si no se lo concede. Lo usan los disparadores cuando el mismo tipo se reparte con alcances distintos segun el rol.';

DROP FUNCTION IF EXISTS public.notif_timesheet_period_leads(uuid);

CREATE FUNCTION public.notif_timesheet_period_leads(p_period_id uuid)
    RETURNS TABLE (staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  -- La conducción de los encargos donde esa boleta cargó horas reales. Se resuelve por
  -- `period_id` porque es la misma columna que mira `submit_timesheet_safe` para decidir qué
  -- líneas de aprobación crear: si un encargo no está ahí, no formó parte de este envío.
  --
  -- `encargado_id` queda AFUERA a propósito: lo ocupa un Senior o un Semi Senior, y la
  -- matriz no les da `weekly_submitted` (su celda era el acuse propio, que tiene tipo
  -- aparte). Los dos conjuntos que sí entran son los de PARTE 2, reutilizados tal cual.
  SELECT DISTINCT r.staff_id
    FROM (
      SELECT DISTINCT te.engagement_id
        FROM public.time_entries te
       WHERE te.period_id = p_period_id
         AND te.is_forecast = false
    ) g
    CROSS JOIN LATERAL (
      SELECT staff_id FROM public.notif_engagement_partners(g.engagement_id)
      UNION
      SELECT staff_id FROM public.notif_engagement_managers(g.engagement_id)
    ) r
   WHERE r.staff_id IS NOT NULL
$BODY$;

COMMENT ON FUNCTION public.notif_timesheet_period_leads(uuid) IS
  'Conduccion (socio/SQR/gerentes) de los encargos con horas reales en un periodo de timesheet. Alcance `assigned` del aviso informativo de envio; excluye encargado_id, que la matriz no incluye en ese tipo.';

-- =====================================================================
-- B) timesheet_periods — envío y retiro de la boleta
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_timesheet_period_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_submitted boolean;
  v_withdrawn boolean;
  v_who       text;
  v_base      jsonb;
  v_approvers uuid[];
  v_rec       record;
  v_id        uuid;
BEGIN
  -- Sólo AFTER UPDATE: el período existe desde que el usuario carga la primera hora
  -- (`submit_timesheet_safe` falla con PERIOD_NOT_FOUND si no está), así que el envío es
  -- siempre un UPDATE. Un INSERT con `submitted_at` ya puesto es carga de datos, no un envío.
  v_submitted := OLD.submitted_at IS NULL     AND NEW.submitted_at IS NOT NULL;
  v_withdrawn := OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS NULL;

  IF NOT (v_submitted OR v_withdrawn) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(s.first_name || ' ' || s.last_name, '')
    INTO v_who
    FROM public.staff s WHERE s.staff_id = NEW.staff_id;

  v_base := jsonb_build_object(
    'period_id',   NEW.period_id,
    'week_start',  NEW.week_start_date,
    'week_number', NEW.week_number,
    'year',        NEW.year,
    'total_hours', NEW.total_hours,
    'staff_name',  v_who);

  -- ── Acuse al dueño: el mismo tipo para el envío y para el retiro ──
  -- Dos redacciones vía el `context` de i18next, mismo criterio que
  -- `engagement.staffing.changed`: es el mismo hecho ("mi boleta cambió de estado") y
  -- partirlo en dos tipos habría duplicado la fila de la matriz para siete roles.
  PERFORM public.notify_staff('timesheet.own_submit_confirmed', NEW.staff_id,
            NEW.period_id::text,
            v_base || jsonb_build_object('context',
              CASE WHEN v_submitted THEN 'submitted' ELSE 'withdrawn' END));

  IF v_withdrawn THEN
    RETURN NULL;
  END IF;

  -- ── A quien le toca aprobar ──
  -- `get_timesheet_approvers()` es la autoridad, y no las columnas del encargo: descarta a
  -- las categorías autoaprobadas y exige `timesheet_approval.approve` en el rol, así que un
  -- Socio puesto como `partner_id` sin ese permiso no entra (hoy es el caso: el permiso lo
  -- tienen admin y los tres gerentes). La lista se guarda para no volver a avisarles abajo.
  SELECT COALESCE(array_agg(g.approver_staff_id), '{}'::uuid[])
    INTO v_approvers
    FROM public.get_timesheet_approvers(NEW.staff_id, NEW.week_start_date) g;

  FOREACH v_id IN ARRAY v_approvers
  LOOP
    PERFORM public.notify_staff('timesheet.team_submitted_for_approval', v_id,
                                NEW.period_id::text, v_base);
  END LOOP;

  -- ── Informativo a la conducción que NO aprueba ──
  FOR v_rec IN SELECT staff_id FROM public.notif_timesheet_period_leads(NEW.period_id)
  LOOP
    -- Nadie recibe dos filas por el mismo envío (D-12): el dueño ya tiene su acuse, y el
    -- aprobador su aviso accionable, que es el más específico de los dos.
    IF v_rec.staff_id = NEW.staff_id OR v_rec.staff_id = ANY (v_approvers) THEN
      CONTINUE;
    END IF;

    -- Y el alcance de la matriz manda: este tipo sólo se entrega como `assigned`. Sin el
    -- chequeo, un Senior que ocupe `manager_id` recibiría la boleta de un colega.
    IF public.notif_scope_of('timesheet.weekly_submitted', v_rec.staff_id)
       IS DISTINCT FROM 'assigned' THEN
      CONTINUE;
    END IF;

    PERFORM public.notify_staff('timesheet.weekly_submitted', v_rec.staff_id,
                                NEW.period_id::text, v_base);
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_timesheet_period_events fallo para % : %', NEW.period_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_timesheet_period_events() IS
  'FASE 3.d: envio y retiro de la boleta semanal. Reparte el mismo hecho en tres audiencias disjuntas (dueno / aprobador / conduccion) y respeta el scope_key de la matriz via notif_scope_of, porque weekly_submitted solo se entrega como `assigned`. Degrada a WARNING: nunca bloquea el envio.';

DROP TRIGGER IF EXISTS tr_notify_timesheet_period ON public.timesheet_periods;
CREATE TRIGGER tr_notify_timesheet_period
  AFTER UPDATE ON public.timesheet_periods
  FOR EACH ROW EXECUTE FUNCTION public.notify_timesheet_period_events();

-- =====================================================================
-- C) timesheet_line_approvals — veredicto sobre una línea
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_timesheet_line_approval_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_owner    uuid;
  v_week     date;
  v_code     text;
  v_activity text;
  v_reviewer text;
  v_base     jsonb;
  v_prev     text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
BEGIN
  -- El destinatario es siempre el dueño de la boleta (alcance `own`): el veredicto es sobre
  -- SU línea. Quien aprueba ya lo sabe, y su gerencia no está en esta fila de la matriz.
  SELECT tp.staff_id, tp.week_start_date
    INTO v_owner, v_week
    FROM public.timesheet_periods tp
   WHERE tp.period_id = NEW.period_id;

  IF v_owner IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.engagement_code, '') INTO v_code
    FROM public.engagements e WHERE e.engagement_id = NEW.engagement_id;
  SELECT COALESCE(a.activity_code, '') INTO v_activity
    FROM public.activity_codes a WHERE a.activity_id = NEW.activity_id;
  SELECT COALESCE(s.first_name || ' ' || s.last_name, '') INTO v_reviewer
    FROM public.staff s WHERE s.staff_id = NEW.approved_by;

  v_base := jsonb_build_object(
    'engagement_code', v_code,
    'engagement_id',   NEW.engagement_id,
    'activity_code',   v_activity,
    'week_start',      v_week,
    'reviewer',        v_reviewer,
    'notes',           COALESCE(NEW.review_notes, ''));

  -- ── Aprobación de una línea ──
  -- `approved_by <> dueño` es el filtro de la autoaprobación (D-30): submit_timesheet_safe
  -- firma con el staff_id del propio dueño, y devolverle N filas "tu línea fue aprobada" en
  -- cada envío habría vaciado de significado al evento.
  IF NEW.status = 'approved'
     AND v_prev IS DISTINCT FROM 'approved'
     AND NEW.approved_by IS DISTINCT FROM v_owner THEN
    PERFORM public.notify_staff('approval.line_approved', v_owner,
                                NEW.approval_id::text, v_base);
  END IF;

  -- ── Rechazo ──
  -- Sin filtro por `approved_by`: ningún camino automático escribe 'rejected', así que
  -- siempre es la decisión de una persona.
  IF NEW.status = 'rejected'
     AND v_prev IS DISTINCT FROM 'rejected' THEN
    PERFORM public.notify_staff('approval.line_rejected', v_owner,
                                NEW.approval_id::text, v_base);
  END IF;

  -- ── Solicitud de revisión (D-33) ──
  -- `approved -> pending` lo escribe solamente useRequestRevision. El otro camino a
  -- `pending` —el reset de `rejected` que hace submit_timesheet_safe cuando el usuario
  -- corrige y reenvía— no es una solicitud de revisión: avisaría al usuario de su propio
  -- reenvío.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved'
     AND NEW.status = 'pending' THEN
    PERFORM public.notify_staff('approval.revision_requested', v_owner,
                                NEW.approval_id::text, v_base);
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_timesheet_line_approval_events fallo para % : %', NEW.approval_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_timesheet_line_approval_events() IS
  'FASE 3.d: los 3 veredictos sobre una linea de timesheet (aprobada, rechazada, revision solicitada), al dueno de la boleta. Calla la autoaprobacion (approved_by = el dueno, D-30) y el reset rejected->pending del reenvio (D-33). Degrada a WARNING.';

-- INSERT incluido: hoy la única vía que inserta líneas ya resueltas es
-- `submit_timesheet_safe`, y las firma el dueño (autoaprobación, que el filtro de arriba
-- calla). Cubrirlo igual evita que un camino futuro que inserte un veredicto ajeno entre sin
-- avisar — el predicado es el mismo, sólo cambia de dónde sale el estado anterior.
DROP TRIGGER IF EXISTS tr_notify_timesheet_line_approval ON public.timesheet_line_approvals;
CREATE TRIGGER tr_notify_timesheet_line_approval
  AFTER INSERT OR UPDATE ON public.timesheet_line_approvals
  FOR EACH ROW EXECUTE FUNCTION public.notify_timesheet_line_approval_events();

-- =====================================================================
-- D) timer_entries — cierre automático del cronómetro
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_timer_auto_stop_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_code     text;
  v_activity text;
BEGIN
  -- El cronómetro se cerró recién.
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RETURN NULL;
  END IF;

  -- LA MARCA DEL CIERRE AUTOMÁTICO (D-32): `finalize_all_stale_timers()` —el cron cada 15
  -- min— y `finalize_my_stale_timers()` escriben `ended_at = started_at + 8h` EXACTAS. Un
  -- cierre manual no puede producir esa igualdad: `stop_timer_entry()` pasa `now()`, y
  -- `validate_timer_entry_duration` rechaza con excepción cualquier `ended_at` posterior a
  -- las 8 h, así que ese borde superior sólo lo alcanza el cierre automático. Se mira la
  -- marca y no quién escribió, porque el cron corre sin sesión.
  IF NEW.ended_at IS DISTINCT FROM NEW.started_at + interval '8 hours' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.engagement_code, '') INTO v_code
    FROM public.engagements e WHERE e.engagement_id = NEW.engagement_id;
  SELECT COALESCE(a.activity_code, '') INTO v_activity
    FROM public.activity_codes a WHERE a.activity_id = NEW.activity_id;

  PERFORM public.notify_staff('tracker.timer.auto_stopped', NEW.staff_id,
            NEW.timer_id::text,
            jsonb_build_object(
              'engagement_code',  v_code,
              'engagement_id',    NEW.engagement_id,
              'activity_code',    v_activity,
              'started_at',       NEW.started_at,
              'ended_at',         NEW.ended_at,
              'duration_minutes', NEW.duration_minutes,
              'description',      COALESCE(NEW.description, '')));

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_timer_auto_stop_events fallo para % : %', NEW.timer_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_timer_auto_stop_events() IS
  'FASE 3.d: cronometro cerrado automaticamente por inactividad, a su dueno. Se detecta por la marca del cierre automatico (ended_at = started_at + 8h exactas, D-32) y no por el actor: el cron corre sin sesion. Degrada a WARNING.';

DROP TRIGGER IF EXISTS tr_notify_timer_auto_stop ON public.timer_entries;
CREATE TRIGGER tr_notify_timer_auto_stop
  AFTER UPDATE ON public.timer_entries
  FOR EACH ROW EXECUTE FUNCTION public.notify_timer_auto_stop_events();


-- #####################################################################
-- ## PARTE 5 — CUENTAS / AUTH Y PERSONAL (Fase 3.e)
-- #####################################################################
--
-- DÓNDE VIVEN LAS SEÑALES (D-34). Ninguna toca el esquema `auth`, que gestiona GoTrue:
--   * alta de usuario        INSERT en `user_roles`  (lo escribe handle_new_user)
--   * cambio de rol          UPDATE de `user_roles.role_key`
--   * eliminación de cuenta  DELETE en `user_roles`  (manage-auth-user, tras deleteUser)
--   * bloqueo por seguridad  `staff.is_blocked` -> true (lo escribe record_failed_login)
--   * alta/baja de personal  INSERT / UPDATE de `staff`
--   * competencias           INSERT / DELETE en `staff_skills`
--
-- Poner triggers sobre `auth.users` era la alternativa y se descartó: ese esquema lo maneja
-- GoTrue, Studio es de sólo lectura sobre él, y los triggers propios ya se perdieron una vez
-- en un dump/restore del mirror. `user_roles` es la sombra en `public` de cada cuenta —
-- una fila por usuario, garantizada por handle_new_user — y sirve igual.
--
-- ALCANCE `practica`, nuevo en esta fase. Las altas y bajas de personal le llegan a los tres
-- gerentes de la MISMA línea de servicio (`staff.practica_id`), no a todos los gerentes: es
-- lo que D-18 dejó definido cuando disolvió el token `equipo`.
--
-- EL AFECTADO NO SIEMPRE EXISTE COMO STAFF. Al crearse la cuenta, `link_auth_user_to_staff`
-- corre DESPUÉS de handle_new_user, así que en el INSERT de `user_roles` todavía no hay
-- ficha vinculada. Por eso el payload lleva `staff_id` cuando se lo puede resolver y el mail
-- siempre: sin ficha, el nombre no existe todavía y el correo es el único identificador.

-- =====================================================================
-- A) Resolución de destinatarios
-- =====================================================================

DROP FUNCTION IF EXISTS public.notif_staff_by_practice(uuid, text[]);

CREATE FUNCTION public.notif_staff_by_practice(p_practica_id uuid, p_role_keys text[])
    RETURNS TABLE (staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  -- Alcance `practica`: los roles indicados, pero sólo los de esa línea de servicio. Con
  -- `p_practica_id` NULL no devuelve a nadie — una ficha sin práctica no le corresponde a
  -- ningún gerente en particular, y mandarlo a todos sería el alcance `firm`, que la matriz
  -- reserva para ADM y Talento Humano.
  SELECT DISTINCT s.staff_id
    FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
   WHERE ur.role_key = ANY (p_role_keys)
     AND s.practica_id = p_practica_id
     AND s.is_active
     AND s.deleted_at IS NULL
$BODY$;

COMMENT ON FUNCTION public.notif_staff_by_practice(uuid, text[]) IS
  'Alcance `practica` de la matriz de notificaciones: staff activo con esos role_key dentro de una misma linea de servicio (staff.practica_id). NULL no devuelve a nadie.';

-- =====================================================================
-- B) user_roles — alta de cuenta, cambio de rol y eliminación
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_user_account_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_row      record;
  v_staff    uuid;
  v_name     text;
  v_email    text;
  v_base     jsonb;
  v_rec      record;
  v_rol_prev  text;
  v_rol_nuevo text;
  c_auditoria constant text[] := ARRAY['admin', 'it_security_manager'];
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  SELECT s.staff_id, COALESCE(s.first_name || ' ' || s.last_name, '')
    INTO v_staff, v_name
    FROM public.staff s
   WHERE s.auth_user_id = v_row.user_id
     AND s.deleted_at IS NULL;

  -- El correo es el único identificador que existe siempre: en el alta la ficha todavía no
  -- está vinculada, y en el borrado ya no la hay. Se lee con guarda porque el harness local
  -- monta un `auth` mínimo y otros entornos podrían no exponerlo.
  BEGIN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_row.user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  -- La marca gana sobre la lectura. En un DELETE por CASCADE `auth.users` ya se borro y el SELECT
  -- de arriba no devuelve nada; `deletion_email` es lo que prepare_account_deletion() dejo ahi
  -- justo para este momento (ver A.3). Fuera de un borrado en curso la marca es NULL y manda la
  -- lectura, asi que el COALESCE no necesita saber en que operacion esta.
  v_email := COALESCE(v_row.deletion_email, v_email);

  v_base := jsonb_build_object(
    'user_id',    v_row.user_id,
    'staff_id',   v_staff,
    'staff_name', COALESCE(v_name, ''),
    'email',      COALESCE(v_email, ''),
    'role_key',   COALESCE(v_row.role_key, ''));

  -- ── Alta de cuenta: auditoría del ADM ──
  IF TG_OP = 'INSERT' THEN
    -- Salvo que sea una baja que se está deshaciendo. `manage-auth-user` repone la fila cuando
    -- GoTrue no pudo borrar la cuenta, y eso no es un alta: la cuenta existía desde antes. Mismo
    -- marcador y mismo motivo que la rama del DELETE de más abajo.
    IF COALESCE(current_setting('ems.account_rollback', true), '') = '1' THEN
      RETURN NULL;
    END IF;

    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
    LOOP
      PERFORM public.notify_staff('auth.user.registered', v_rec.staff_id,
                                  COALESCE(v_staff::text, NEW.user_id::text), v_base);
    END LOOP;
    RETURN NULL;
  END IF;

  -- ── Eliminación de cuenta: sólo Seguridad TI (la matriz no se lo da al ADM) ──
  IF TG_OP = 'DELETE' THEN
    -- Salvo que sea un alta que se está deshaciendo. `register-user` borra la cuenta que acaba
    -- de crear cuando el correo de confirmación no sale, y ese borrado llega hasta acá por el
    -- CASCADE de user_roles.user_id -> auth.users. Avisarle a Seguridad TI de una "cuenta
    -- eliminada" por un 503 de Microsoft Graph es una alarma falsa, y las alarmas falsas en un
    -- canal de seguridad se pagan con que dejen de mirarse.
    --
    -- El marcador lo pone rollback_unconfirmed_signup() con `set_config(..., true)`: es
    -- transaction-local, así que no puede quedarse pegado ni filtrarse a otra sesión del pool.
    -- Mismo mecanismo que `ems.role_change_source` (ver notif_origen_cambio_rol).
    IF COALESCE(current_setting('ems.account_rollback', true), '') = '1' THEN
      RETURN NULL;
    END IF;

    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['it_security_manager'])
    LOOP
      PERFORM public.notify_staff('auth.account.deleted', v_rec.staff_id,
                                  OLD.user_id::text, v_base);
    END LOOP;
    RETURN NULL;
  END IF;

  -- ── Cambio de rol ──
  -- `role_key` es la autoridad y `role` el espejo legacy, pero se miran los dos, y el enum NO es
  -- cosmético: `is_admin()` y `has_role()` (cero_02) leen `user_roles.role`, así que mover sólo
  -- el enum da o quita admin en todas las policies que las llaman. Es justamente el cambio que
  -- más merece auditoría, no uno para ignorar.
  --
  -- Por eso los dos roles del payload salen de la columna QUE CAMBIÓ y no siempre de `role_key`:
  -- `admin_set_user_role()` hace `UPDATE user_roles SET role = ...` y deja `role_key` intacto.
  -- Está deprecado y ningún componente lo llama, pero sigue con GRANT a `authenticated`
  -- (cero_06), o sea que se alcanza directo por PostgREST. Leyendo `role_key` de los dos lados,
  -- ese camino mandaba un aviso de auditoría que decía "de X a X" — sin delta, que es peor que
  -- no mandarlo: el lector concluye que no pasó nada justo cuando alguien ganó admin.
  --
  -- Si cambian las dos, manda `role_key`: es la autoridad, y el enum es su espejo.
  IF NEW.role_key IS DISTINCT FROM OLD.role_key THEN
    v_rol_prev  := COALESCE(OLD.role_key, '');
    v_rol_nuevo := COALESCE(NEW.role_key, '');
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    v_rol_prev  := COALESCE(OLD.role::text, '');
    v_rol_nuevo := COALESCE(NEW.role::text, '');
  END IF;

  IF v_rol_nuevo IS NOT NULL THEN
    -- Al afectado (alcance `own`), con el rol anterior para que el texto pueda decir de qué
    -- a qué. Sin ficha de staff no hay a quién notificar: notify_staff necesita un staff_id.
    IF v_staff IS NOT NULL THEN
      PERFORM public.notify_staff('auth.role.changed', v_staff,
                COALESCE(v_staff::text, NEW.user_id::text),
                v_base || jsonb_build_object('role_key',          v_rol_nuevo,
                                             'previous_role_key', v_rol_prev,
                                             -- De donde vino el cambio: `category` si lo escribio
                                             -- sync_user_role_from_category, `direct` si no. El
                                             -- correo elige el texto con esto (D-44); el trigger
                                             -- ve el resultado y no la causa, asi que la causa la
                                             -- anota quien la conoce.
                                             'source', public.notif_origen_cambio_rol(),
                                             'context', 'own'));
    END IF;

    -- Y a la auditoría (ADM + Seguridad TI, alcance `firm`, D-17). Al propio afectado no se
    -- le manda dos veces si además es uno de ellos.
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_auditoria)
    LOOP
      IF v_rec.staff_id IS DISTINCT FROM v_staff THEN
        PERFORM public.notify_staff('auth.role.changed', v_rec.staff_id,
                  COALESCE(v_staff::text, NEW.user_id::text),
                  v_base || jsonb_build_object('role_key',          v_rol_nuevo,
                                               'previous_role_key', v_rol_prev));
      END IF;
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_user_account_events fallo para % : %', v_row.user_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_user_account_events() IS
  'FASE 3.e: alta de cuenta, cambio de rol y eliminacion, leidos desde public.user_roles y no desde auth.users (D-34). El cambio de rol va al afectado con context=own y a la auditoria (ADM + Seguridad TI) sin duplicar, con role_key/previous_role_key tomados de la columna que cambio (role_key manda; si solo se movio el enum legacy `role`, van sus valores, porque is_admin()/has_role() lo leen). El borrado NO avisa si ems.account_rollback = 1 (alta deshecha, no baja real). Degrada a WARNING.';

DROP TRIGGER IF EXISTS tr_notify_user_account ON public.user_roles;
CREATE TRIGGER tr_notify_user_account
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.notify_user_account_events();

-- ---------------------------------------------------------------------
-- A.2) Deshacer un alta que quedó a medias
-- ---------------------------------------------------------------------
--
-- `generateLink({ type: "signup" })` crea la cuenta ANTES de que haya nada que mandar, así que
-- si Microsoft Graph falla queda una cuenta sin confirmar y sin correo. `register-user` la borra
-- (ver `FalloDeEnvio` en `_shared/correo-auth.ts`), y ese borrado no es gratis: el alta ya dejó
-- rastro en tres lugares.
--
--   1. `user_roles`, que lo escribe handle_new_user() en el INSERT de auth.users;
--   2. una notificación `auth.user.registered` para cada ADM, que el trigger de arriba emitió
--      en ese mismo INSERT;
--   3. el correo de esa notificación, encolado en notification_emails.
--
-- Sin limpiar eso, deshacer el alta produce MÁS ruido que dejarla: el borrado de `user_roles`
-- por CASCADE dispara `auth.account.deleted` a Seguridad TI, y los ADM se quedan con un aviso
-- de que se registró alguien que ya no existe — con su correo en camino.
--
-- Esta función deshace las tres cosas en UNA transacción, que es la única forma de que el
-- marcador `ems.account_rollback` sea visible para el trigger: `set_config(..., true)` es
-- transaction-local, y la llamada a `auth.admin.deleteUser()` de la edge function viaja por otra
-- conexión. Por eso la fila de `user_roles` se borra ACÁ y no se deja para el CASCADE.
--
-- La cuenta en sí la sigue borrando GoTrue por su API de admin: `auth` es suyo, y un DELETE
-- directo sobre `auth.users` desde acá se salteariía su propia contabilidad.
DROP FUNCTION IF EXISTS public.rollback_unconfirmed_signup(uuid);

CREATE FUNCTION public.rollback_unconfirmed_signup(p_user_id uuid)
    RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_confirmado boolean;
  v_avisos     uuid[];
  v_correos    integer := 0;
  v_roles      integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NULL_USER_ID');
  END IF;

  -- GUARDA. Esto solo puede tocar una cuenta que nunca se confirmo. Es service_role y hoy la
  -- llama un unico sitio, pero el costo de equivocarse es borrarle el acceso a alguien que lo
  -- estaba usando, asi que la condicion se verifica aca y no se confia en quien llama.
  BEGIN
    SELECT u.email_confirmed_at IS NOT NULL INTO v_confirmado
      FROM auth.users u WHERE u.id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- El harness local monta un `auth` minimo. Ahi no hay nada que proteger.
    v_confirmado := NULL;
  END;

  IF v_confirmado THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ACCOUNT_CONFIRMED');
  END IF;

  -- Transaction-local: vale para todo lo que siga en ESTA transaccion y para nada mas.
  PERFORM set_config('ems.account_rollback', '1', true);

  -- Los avisos de alta que el trigger emitio a los ADM. Se buscan por `payload->>'user_id'` y
  -- no por `entity_id`, que en un alta es el user_id pero pasaria a ser el staff_id si alguna
  -- vez la ficha llegara a estar vinculada a tiempo.
  SELECT COALESCE(array_agg(notification_id), ARRAY[]::uuid[]) INTO v_avisos
    FROM public.notifications
   WHERE type_key = 'auth.user.registered'
     AND payload->>'user_id' = p_user_id::text;

  -- El correo primero: solo lo que TODAVIA no salio. Un correo ya enviado es un hecho y su fila
  -- es el registro de ese hecho — borrarla no lo desmiente, solo esconde que paso.
  --
  -- `<> 'sent'` y no `IN ('pending','failed')`, porque falta el tercer estado: `sending`. El
  -- drenaje corre cada 5 minutos y puede haber RECLAMADO el correo del alta mientras register-user
  -- todavia peleaba con Graph. Esa fila no entraba en el filtro viejo, y el DELETE de
  -- `notifications` que viene abajo solo le pone `notification_id` en NULL (la FK es ON DELETE SET
  -- NULL): el drenaje seguia y le mandaba al ADM el aviso de un alta que se acababa de deshacer.
  --
  -- Borrarla la cancela sin mecanismo nuevo: `begin_notification_email_attempt` solo actualiza
  -- `WHERE status = 'sending'`, asi que devuelve NULL, y el drenaje ya sabe saltear ese caso
  -- ("La fila dejo de estar arrendada entre el claim y esto").
  --
  -- No cierra la ventana ENTERA, y conviene saberlo: si el drenaje ya paso ese punto y esta dentro
  -- de la llamada a Graph, el correo sale igual. Eso no lo arregla ninguna bandera — el mensaje
  -- salio o no salio. Lo que se cierra del todo es el caso "reclamado y todavia sin intentar".
  DELETE FROM public.notification_emails
   WHERE notification_id = ANY (v_avisos)
     AND status <> 'sent';
  GET DIAGNOSTICS v_correos = ROW_COUNT;

  DELETE FROM public.notifications WHERE notification_id = ANY (v_avisos);

  -- Y la fila que dispara el CASCADE. Borrarla aca, con el marcador puesto, es lo que evita el
  -- `auth.account.deleted` cuando despues GoTrue borre la cuenta: para entonces ya no queda
  -- nada que cascadear.
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_roles = ROW_COUNT;

  RETURN jsonb_build_object('ok', true,
                            'notificaciones', COALESCE(array_length(v_avisos, 1), 0),
                            'correos', v_correos,
                            'roles', v_roles);
END;
$BODY$;

COMMENT ON FUNCTION public.rollback_unconfirmed_signup(uuid) IS
  'Deshace el rastro en public de un alta que quedo a medias (el correo de confirmacion no salio): borra los avisos auth.user.registered, sus correos que no llegaron a salir —incluidos los ya reclamados por el drenaje, que se cancelan solos porque begin_notification_email_attempt deja de encontrarlos en sending— y la fila de user_roles, con ems.account_rollback puesto para que el trigger no reporte una baja de cuenta a Seguridad TI. Rechaza cuentas ya confirmadas. La cuenta en auth la borra GoTrue por su API.';

REVOKE ALL ON FUNCTION public.rollback_unconfirmed_signup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_unconfirmed_signup(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- A.3) Borrar una cuenta de verdad
-- ---------------------------------------------------------------------
--
-- El aviso `auth.account.deleted` a Seguridad TI necesita el CORREO, y ahí está la dificultad:
-- `user_roles.user_id` tiene `ON DELETE CASCADE` contra `auth.users`, así que el trigger corre
-- DENTRO del cascade, con la fila padre ya borrada. Para entonces `SELECT u.email FROM auth.users`
-- no devuelve nada, y el correo es el único identificador que queda —una cuenta con ficha de
-- staff no se puede borrar (ver el paso 7 de `manage-auth-user`)—. El aviso salía como
-- 'Se eliminó la cuenta ' y nadie podía saber cuál.
--
-- LA PRIMERA SOLUCIÓN FUE PEOR QUE EL PROBLEMA, y por eso esto se reescribió. Consistía en borrar
-- la fila de `user_roles` ACÁ, antes de que GoTrue tocara `auth.users`: el trigger la leía viva y
-- el aviso salía con la dirección. Pero eso COMMITEA el borrado y el aviso antes de la llamada
-- externa a `deleteUser()`, y esas dos cosas viven en transacciones distintas. Si la edge function
-- muere entre una y otra —timeout, redeploy, caída— queda:
--
--   * una cuenta VIVA sin rol: el frontend es fail-closed, esa persona entra y no ve nada, y
--   * un `auth.account.deleted` ya emitido a Seguridad TI por una baja que no ocurrió.
--
-- La reposición existía, pero sólo corría cuando `deleteUser()` DEVOLVÍA error. Una invocación
-- interrumpida no devuelve nada, así que ese estado quedaba para siempre y en silencio.
--
-- LO QUE SE HACE AHORA: no se borra nada acá. Se GUARDA el correo en la propia fila, y se deja
-- que el CASCADE dispare el aviso cuando la cuenta se haya borrado DE VERDAD. El trigger ya no
-- necesita `auth.users`: lee la marca de `OLD`.
--
-- El estado intermedio deja de existir. Si la función muere después de marcar:
--
--   * no se borró ninguna fila — el rol sigue donde estaba;
--   * no se emitió ningún aviso — nadie anunció una baja que no pasó;
--   * el único residuo es un texto en una columna, que no lo lee nadie más.
--
-- Y se conserva lo que la solución anterior ganaba: un borrado hecho POR FUERA de
-- `manage-auth-user` (alguien que borra la cuenta desde Studio, o por la API de GoTrue) sigue
-- disparando el aviso por el CASCADE, sólo que sin correo — que es exactamente como estaba antes
-- de todo esto, no una regresión.

-- La marca. Vive en `user_roles` y no en una tabla aparte porque el trigger la lee de `OLD`: en un
-- DELETE por CASCADE no hay a dónde ir a buscarla, la fila que se está borrando es todo lo que hay.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS deletion_email text;

COMMENT ON COLUMN public.user_roles.deletion_email IS
  'Correo de la cuenta, copiado por prepare_account_deletion() justo antes de que GoTrue la borre. Lo lee el trigger en el DELETE por CASCADE, cuando auth.users ya no existe y el aviso a Seguridad TI se quedaria sin identificar la cuenta. NULL fuera de un borrado en curso.';

DROP FUNCTION IF EXISTS public.prepare_account_deletion(uuid);

CREATE FUNCTION public.prepare_account_deletion(p_user_id uuid)
    RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_staff   uuid;
  v_email   text;
  v_existe  boolean;
  v_filas   integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NULL_USER_ID');
  END IF;

  -- GUARDA. Esto anuncia una baja, y la única razón para anunciarla es que se esté borrando la
  -- cuenta. `manage-auth-user` ya lo verifica antes de llamar; si igual llega una cuenta con ficha
  -- vinculada, alguien se equivocó y no se toca.
  SELECT s.staff_id INTO v_staff
    FROM public.staff s
   WHERE s.auth_user_id = p_user_id
     AND s.deleted_at IS NULL;

  IF v_staff IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'LINKED_STAFF');
  END IF;

  -- Se leen las DOS cosas por separado, y no se deduce una de la otra: "no hay correo" y "no hay
  -- cuenta" no son lo mismo, y quien llama necesita distinguirlas. Si `deleteUser()` despues
  -- falla, `existe_auth = false` dice que la cuenta ya no estaba —el borrado es idempotente y la
  -- baja es real—; `true` dice que el borrado fallo de verdad.
  BEGIN
    SELECT u.email, true INTO v_email, v_existe
      FROM auth.users u WHERE u.id = p_user_id;
    v_existe := COALESCE(v_existe, false);
  EXCEPTION WHEN OTHERS THEN
    -- El harness local monta un `auth` mínimo: no se puede afirmar nada, y NULL lo dice.
    v_email  := NULL;
    v_existe := NULL;
  END;

  -- UPDATE, no DELETE. Es toda la diferencia: esto no borra ni anuncia nada, así que no hay
  -- estado intermedio que reponer si lo que viene después no llega a pasar.
  UPDATE public.user_roles
     SET deletion_email = NULLIF(btrim(COALESCE(v_email, '')), '')
   WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  RETURN jsonb_build_object('ok', true,
                            'marcado', v_filas,
                            -- NULL cuando no se pudo mirar `auth` (harness local).
                            'existe_auth', v_existe,
                            -- false = el aviso va a salir sin dirección. No es un error: el
                            -- borrado igual tiene que seguir.
                            'con_correo', COALESCE(btrim(v_email), '') <> '');
END;
$BODY$;

COMMENT ON FUNCTION public.prepare_account_deletion(uuid) IS
  'Copia el correo de la cuenta a user_roles.deletion_email y devuelve en existe_auth si la cuenta seguia en auth.users para que el aviso auth.account.deleted identifique la cuenta cuando el CASCADE borre la fila con auth.users ya vacia. NO borra ni anuncia nada: el aviso lo dispara el borrado real, asi que una invocacion interrumpida no deja ni una cuenta sin rol ni una alarma falsa. Se niega si la cuenta tiene ficha de staff vinculada.';

REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- A.4) Limpiar la marca cuando el borrado no se concreta
-- ---------------------------------------------------------------------
--
-- Reemplaza a `abort_account_deletion()`, que ya no tiene nada que deshacer: como A.3 no borra ni
-- anuncia, no queda ni fila que reponer ni aviso que retirar. Lo único que sobrevive a un borrado
-- fallido es la marca, y dejarla puesta tampoco rompe nada —nadie la lee fuera del DELETE— pero se
-- limpia igual, para que no quede una dirección vieja esperando a un borrado futuro por si la
-- persona cambia de correo en el medio.
DROP FUNCTION IF EXISTS public.abort_account_deletion(uuid, jsonb);
DROP FUNCTION IF EXISTS public.clear_account_deletion_mark(uuid);

CREATE FUNCTION public.clear_account_deletion_mark(p_user_id uuid)
    RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_filas integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NULL_USER_ID');
  END IF;

  UPDATE public.user_roles
     SET deletion_email = NULL
   WHERE user_id = p_user_id
     AND deletion_email IS NOT NULL;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'limpiadas', v_filas);
END;
$BODY$;

COMMENT ON FUNCTION public.clear_account_deletion_mark(uuid) IS
  'Borra user_roles.deletion_email cuando el borrado de la cuenta no llego a concretarse. Reemplaza a abort_account_deletion(): desde que prepare_account_deletion() no borra ni anuncia, no hay fila que reponer ni aviso que retirar.';

REVOKE ALL ON FUNCTION public.clear_account_deletion_mark(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_account_deletion_mark(uuid) TO service_role;


-- =====================================================================
-- C) staff — alta, baja y bloqueo de cuenta
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_staff_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_baja  boolean;
  v_base  jsonb;
  v_rec   record;
  c_firma    constant text[] := ARRAY['admin', 'hr_manager', 'hr_analyst'];
  c_gerentes constant text[] := ARRAY['manager', 'ita_manager', 'tax_manager'];
  c_seguridad constant text[] := ARRAY['admin', 'it_security_manager'];
BEGIN
  v_base := jsonb_build_object(
    'staff_id',    NEW.staff_id,
    'staff_name',  COALESCE(NEW.first_name || ' ' || NEW.last_name, ''),
    'email',       COALESCE(NEW.email, ''),
    'practica_id', NEW.practica_id);

  -- ── Alta de personal ──
  -- Va al ADM y a Talento Humano (alcance `firm`) y a los gerentes de SU práctica (alcance
  -- `practica`). Al recién dado de alta no: la matriz no le da la fila, y todavía no tiene
  -- cuenta con la que mirar la campana.
  IF TG_OP = 'INSERT' THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(c_firma)
      UNION
      SELECT staff_id FROM public.notif_staff_by_practice(NEW.practica_id, c_gerentes)
    LOOP
      PERFORM public.notify_staff('staff.created', v_rec.staff_id,
                                  NEW.staff_id::text, v_base);
    END LOOP;
    RETURN NULL;
  END IF;

  -- ── Baja de personal: tres señales, un solo evento (D-35) ──
  --
  -- La primera señal es cargar `termination_date`, y esa fecha puede ser FUTURA: StaffForm sólo
  -- exige la fecha cuando `is_active` pasa a false, no al revés, así que se puede registrar la
  -- salida de alguien que sigue trabajando. El aviso sale igual —es lo que D-35 decidió, y a
  -- Talento Humano le sirve saberlo cuando se registra, no el último día— pero por eso el texto
  -- dice "Se registró la baja de X" y no "X dejó la firma": la fecha efectiva viaja en el payload.
  --
  -- Hacer que la fecha avise recién el día que llega pediría un emisor por calendario, como los
  -- de plazo de emergencia. Hoy no existe, y sin él sacar esta señal dejaría la baja sin avisar
  -- hasta que alguien apague `is_active` a mano.
  -- La UI usa una u otra según la pantalla (fecha de baja, desactivar, borrado lógico) y el
  -- hecho de negocio es uno. Hacer las tres en el mismo UPDATE deja UNA notificación.
  v_baja := (OLD.termination_date IS NULL AND NEW.termination_date IS NOT NULL)
         OR (COALESCE(OLD.is_active, true) AND NOT COALESCE(NEW.is_active, true))
         OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL);

  IF v_baja THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(c_firma)
      UNION
      SELECT staff_id FROM public.notif_staff_by_practice(NEW.practica_id, c_gerentes)
    LOOP
      PERFORM public.notify_staff('staff.terminated', v_rec.staff_id,
                NEW.staff_id::text,
                v_base || jsonb_build_object('termination_date', NEW.termination_date));
    END LOOP;
  END IF;

  -- ── Bloqueo de cuenta por seguridad (D-36) ──
  -- Lo enciende record_failed_login() al agotarse los intentos. Al bloqueado NO se le avisa:
  -- no puede entrar a ver la campana, y la pantalla de login ya se lo dice. El desbloqueo
  -- tampoco emite — la matriz no le dio tipo.
  IF NOT COALESCE(OLD.is_blocked, false) AND COALESCE(NEW.is_blocked, false) THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_seguridad)
    LOOP
      PERFORM public.notify_staff('auth.account.blocked', v_rec.staff_id,
                                  NEW.staff_id::text, v_base);
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_staff_events fallo para % : %', NEW.staff_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_staff_events() IS
  'FASE 3.e: alta de personal, baja (termination_date / is_active / deleted_at, D-35) y bloqueo de cuenta (D-36). Alta y baja combinan alcance firm (ADM + Talento Humano) con practica (los gerentes de esa linea de servicio). Degrada a WARNING.';

DROP TRIGGER IF EXISTS tr_notify_staff ON public.staff;
CREATE TRIGGER tr_notify_staff
  AFTER INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.notify_staff_events();

-- =====================================================================
-- D) staff_skills — competencias
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_staff_competency_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_row   record;
  v_skill text;
  v_base  jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  SELECT COALESCE(sk.name, '') INTO v_skill
    FROM public.skills sk WHERE sk.skill_id = v_row.skill_id;

  v_base := jsonb_build_object(
    'staff_id',          v_row.staff_id,
    'skill_id',          v_row.skill_id,
    'skill_name',        v_skill,
    'proficiency_level', COALESCE(v_row.proficiency_level, ''));

  -- Dos tipos y no uno con `context` (D-03): ganar una competencia y perderla son hechos
  -- distintos. Sólo al afectado, que es el único alcance que la matriz le da a esta fila.
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_staff('staff.competency.assigned', NEW.staff_id,
                                NEW.staff_id::text, v_base);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.notify_staff('staff.competency.removed', OLD.staff_id,
                                OLD.staff_id::text, v_base);
  END IF;

  -- El UPDATE (subir o bajar el nivel de una competencia que ya tenías) no avisa: la matriz
  -- tiene la asignación y la baja, no la reevaluación.
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_staff_competency_events fallo para % : %', v_row.staff_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_staff_competency_events() IS
  'FASE 3.e: alta y baja de una competencia (staff_skills), al afectado. Dos type_key distintos (D-03); cambiar el nivel de una competencia existente no avisa. Degrada a WARNING.';

DROP TRIGGER IF EXISTS tr_notify_staff_competency ON public.staff_skills;
CREATE TRIGGER tr_notify_staff_competency
  AFTER INSERT OR DELETE ON public.staff_skills
  FOR EACH ROW EXECUTE FUNCTION public.notify_staff_competency_events();


-- #####################################################################
-- ## PARTE 6 — CLIENTES (Fase 3.f)
-- #####################################################################
--
-- UN SOLO TRIGGER Y TRES EVENTOS, pero el alcance `assigned` acá no sale de una columna:
-- "estar asignado a un cliente" significa TENER UN ENCARGO SUYO (`is_assigned_to_client()`),
-- así que el conjunto se arma dando la vuelta por `engagements`.
--
-- LA CONSECUENCIA, Y ES LA TRAMPA DEL MÓDULO (D-37): el día del alta ese conjunto está
-- VACÍO — un cliente recién creado todavía no tiene encargos. Si `client.created` se
-- repartiera sólo por `assigned`, no le llegaría a nadie salvo al Senior Partner, que lo
-- tiene por `global`. Por eso el alta suma a `created_by_staff_id`: esa columna existe
-- justamente para que el creador vea el cliente antes de que exista el primer encargo.
--
-- EDICIÓN vs INACTIVACIÓN. La inactivación ES un UPDATE, así que sin cuidado dispararía los
-- dos avisos por el mismo hecho. Gana el específico: cuando `is_active` cae, sale
-- `client.deactivated` y NO `client.updated`.

-- =====================================================================
-- A) Resolución de destinatarios
-- =====================================================================

DROP FUNCTION IF EXISTS public.notif_client_assigned(uuid);

CREATE FUNCTION public.notif_client_assigned(p_client_id uuid)
    RETURNS TABLE (staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  -- Espejo de `is_assigned_to_client()`, del revés: esa función pregunta "¿estoy asignado a
  -- este cliente?" y ésta responde "¿quiénes lo están?". Se suman los dos especialistas, que
  -- la original no mira: para la matriz de notificaciones son gerentes del encargo igual que
  -- el general, y las tres columnas se mueven siempre juntas.
  --
  -- Sin filtrar por estado del encargo, igual que la original: un cliente con un encargo
  -- cerrado sigue siendo "tu cliente" a los efectos de enterarte de que lo inactivaron.
  SELECT DISTINCT s FROM (
    SELECT e.partner_id        AS s FROM public.engagements e WHERE e.client_id = p_client_id
    UNION SELECT e.manager_id        FROM public.engagements e WHERE e.client_id = p_client_id
    UNION SELECT e.sqr_id            FROM public.engagements e WHERE e.client_id = p_client_id
    UNION SELECT e.encargado_id      FROM public.engagements e WHERE e.client_id = p_client_id
    UNION SELECT e.specialist_it_id  FROM public.engagements e WHERE e.client_id = p_client_id
    UNION SELECT e.specialist_tax_id FROM public.engagements e WHERE e.client_id = p_client_id
  ) q WHERE s IS NOT NULL
$BODY$;

COMMENT ON FUNCTION public.notif_client_assigned(uuid) IS
  'Staff asignado a un cliente: quienes ocupan un cargo en alguno de sus encargos, en cualquier estado. Espejo de is_assigned_to_client() en sentido inverso, incluidos los dos especialistas.';

-- Y el espejo, del otro lado, para que las dos funciones digan lo MISMO.
--
-- `is_assigned_to_client()` (cero_02) miraba partner/manager/sqr/encargado y no las dos
-- columnas de especialista. Con `notif_client_assigned()` incluyendolas, un `ita_manager` o
-- `tax_manager` que entra al cliente SOLO por ahi recibe `client.updated` /
-- `client.deactivated` y el aviso linkea a /clients/<id> — tiene `client.read` (alcance
-- `assigned_clients`), asi que `notif_permiso_de_ruta` no lo marca `sin_ruta`. Si la policy no
-- lo reconoce, el enlace lleva a una pantalla sin su fila.
--
-- HOY eso no se rompe, y conviene decirlo para que nadie lo confunda con lo de D-43: `clients`
-- NO tiene `ENABLE ROW LEVEL SECURITY` — drift de la consolidacion, ver
-- docs/hallazgo-rls-drift-ruta-a.md — asi que la policy "clients read" no se evalua y
-- `useClientsFull()` devuelve todos los clientes a todos. La divergencia se vuelve real el dia
-- que se aplique la reconciliacion de ese hallazgo, que el mismo doc pone como requisito
-- previo a produccion. Se cierra ahora, que cuesta una funcion.
--
-- Barato de verdad, al reves que ampliar el portafolio de encargos (D-43): ver un cliente NO
-- habilita editarlo. `client.update` lo tiene unicamente `admin`, y ClientForm resuelve
-- `canSave = !isEdit || can("client.update")`, asi que para estos dos roles el formulario
-- queda de solo lectura. La unica via de escritura era el `isEdit=false` del deep-link sin
-- fila, y esa la tapa el guard de ClientEdit.tsx.
--
-- Una sola funcion: la policy "clients read" (cero_05) la hereda por CREATE OR REPLACE, sin
-- DDL de policies. NO se toca `is_assigned_to_engagement()`: es otra decision, con otras
-- consecuencias, y ahi ver SI es editar.
CREATE OR REPLACE FUNCTION public.is_assigned_to_client(p_client_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  -- Cliente asignado = tengo >=1 encargo (en cualquier estado) donde ocupo uno de los seis
  -- cargos del bloque Equipo. Las tres columnas de gerencia —general, ITA y TAX— se mueven
  -- siempre juntas en el formulario del encargo y valen lo mismo para ver a su cliente.
  select exists (
    select 1 from engagements e
    where e.client_id = p_client_id
      and get_my_staff_id() in (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id,
                                e.specialist_it_id, e.specialist_tax_id)
  )
$BODY$;

COMMENT ON FUNCTION public.is_assigned_to_client(uuid) IS
  'True si el usuario actual ocupa algun cargo del bloque Equipo (partner/manager/sqr/encargado/specialist_it/specialist_tax) en algun encargo de este cliente, sin importar el estado del encargo. Los dos especialistas se sumaron el 2026-09-16 para que coincida con notif_client_assigned(): sin eso, un aviso de cliente podia linkear a una ficha que la policy "clients read" le escondia.';

-- =====================================================================
-- B) clients — alta, edición e inactivación
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_client_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_base        jsonb;
  v_rec         record;
  v_deactivated boolean;
  c_firma constant text[] := ARRAY['senior_partner'];
BEGIN
  v_base := jsonb_build_object(
    'client_id',         NEW.client_id,
    'client_legal_name', COALESCE(NEW.client_legal_name, ''),
    'unique_tax_id',     COALESCE(NEW.unique_tax_id, ''));

  -- ── Alta (D-37) ──
  IF TG_OP = 'INSERT' THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(c_firma)
      UNION
      -- El creador. Va por UNION y no con un IF aparte para que no reciba dos filas si
      -- además es el Senior Partner.
      SELECT NEW.created_by_staff_id WHERE NEW.created_by_staff_id IS NOT NULL
    LOOP
      PERFORM public.notify_staff('client.created', v_rec.staff_id,
                                  NEW.client_id::text, v_base);
    END LOOP;
    RETURN NULL;
  END IF;

  -- ── Inactivación ──
  -- `is_active` es NULLABLE con DEFAULT true, así que se compara con COALESCE: un NULL
  -- heredado no debe leerse como "estaba inactivo" y tragarse el aviso.
  v_deactivated := COALESCE(OLD.is_active, true) AND NOT COALESCE(NEW.is_active, true);

  IF v_deactivated THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(c_firma)
      UNION
      SELECT staff_id FROM public.notif_client_assigned(NEW.client_id)
    LOOP
      PERFORM public.notify_staff('client.deactivated', v_rec.staff_id,
                                  NEW.client_id::text, v_base);
    END LOOP;

    -- La inactivación NO cuenta además como edición: es el mismo UPDATE y el aviso
    -- específico ya salió, con más audiencia que el genérico.
    RETURN NULL;
  END IF;

  -- ── Edición (D-04) ──
  -- Cualquier cambio de la ficha, sin filtrar por campo: la matriz se lo da sólo a los
  -- gerentes del cliente, que son pocos y para quienes el dato es de trabajo. Se exige un
  -- cambio real —no basta con que corra el UPDATE— porque un "guardar sin tocar nada" no es
  -- una edición y el formulario permite guardar sin cambios.
  --
  -- `updated_at` SE EXCLUYE DE LA COMPARACIÓN, y es la mitad que hace falta para que la frase
  -- de arriba sea cierta. `update_clients_updated_at` es un trigger BEFORE UPDATE que le pone
  -- `now()` en CADA update, así que para cuando corre este AFTER la fila nueva SIEMPRE difiere
  -- de la vieja: `NEW IS DISTINCT FROM OLD` a secas da true siempre y le manda un aviso a cada
  -- gerente por cada guardado, cambie algo o no.
  --
  -- Se compara sobre jsonb menos esa clave en vez de enumerar columnas: la lista se
  -- desactualiza en cuanto alguien agrega un campo a `clients`, y el modo de fallar es
  -- silencioso — dejaría de avisar de un campo nuevo sin que nada lo acuse.
  IF to_jsonb(NEW) - 'updated_at' IS DISTINCT FROM to_jsonb(OLD) - 'updated_at' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_client_assigned(NEW.client_id)
    LOOP
      PERFORM public.notify_staff('client.updated', v_rec.staff_id,
                                  NEW.client_id::text, v_base);
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_client_events fallo para % : %', NEW.client_id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_client_events() IS
  'FASE 3.f: alta, edicion e inactivacion de un cliente. El alta suma al creador porque el alcance `assigned` esta vacio ese dia (D-37); la inactivacion no cuenta ademas como edicion. Degrada a WARNING.';

DROP TRIGGER IF EXISTS tr_notify_client ON public.clients;
CREATE TRIGGER tr_notify_client
  AFTER INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_events();


-- #####################################################################
-- ## PARTE 7 — HOJAS DE TRABAJO (Fase 3.g)
-- #####################################################################
--
-- EL ÚNICO DISPARADOR DEL CATÁLOGO QUE HOY NO SE EJERCITA, y es a propósito (D-38).
-- `activity_worksheets.status` admite `draft | approved | archived` desde el esquema, pero
-- el producto todavía no tiene el paso "enviar a revisión de calidad": la hoja nace en
-- `draft` y `useUpdateWorksheet()` sólo escribe `notes`. Nadie mueve `status`.
--
-- Se deja el disparador montado sobre la transición que el esquema ya admite —
-- `draft -> approved`— en vez de inventar una señal que signifique otra cosa. El día que se
-- agregue el botón, el aviso sale solo y no hay que tocar el catálogo ni la matriz. Hasta
-- entonces no emite nada, que es el comportamiento correcto: el hecho no ocurre.
--
-- A QUIÉN LE LLEGA (D-07). La matriz se lo da con alcance `assigned` a los cinco roles que
-- pueden ocupar la función SQR de un encargo —Senior Partner, Socio, SQR, Director y
-- Senior—, que es quien revisa la calidad. Por eso el destinatario se resuelve con la
-- conducción del encargo y no con `created_by_staff_id`: el que la manda a revisar no es el
-- que la revisa.

CREATE OR REPLACE FUNCTION public.notify_worksheet_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_code text;
  v_name text;
  v_base jsonb;
  v_rec  record;
BEGIN
  -- La transición, y sólo esa. `archived` no es una revisión y volver a `draft` tampoco.
  IF NOT (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved') THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.engagement_code, ''), COALESCE(e.engagement_name, '')
    INTO v_code, v_name
    FROM public.engagements e
   WHERE e.engagement_id = NEW.engagement_id;

  -- `engagement_id` en el payload y `worksheet_id` en entity_id: el destino es la hoja
  -- (/worksheets/<id>), y el COT viaja como chip.
  v_base := jsonb_build_object(
    'worksheet_id',    NEW.id,
    'engagement_id',   NEW.engagement_id,
    'engagement_code', v_code,
    'engagement_name', v_name,
    'version',         NEW.version);

  -- Los 6 cargos del encargo. Los que la matriz no contempla —los dos especialistas y el
  -- Encargado— los descarta notify_staff(); mandar de más es explícitamente aceptable, y
  -- así este disparador no repite la lista de roles que ya vive en la matriz.
  FOR v_rec IN SELECT staff_id FROM public.notif_engagement_owners(NEW.engagement_id)
  LOOP
    PERFORM public.notify_staff('worksheet.sent_to_quality', v_rec.staff_id,
                                NEW.id::text, v_base);
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_worksheet_events fallo para % : %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$BODY$;

COMMENT ON FUNCTION public.notify_worksheet_events() IS
  'FASE 3.g: hoja de trabajo enviada a revision de calidad (activity_worksheets.status draft -> approved), a la conduccion del encargo. Hoy ninguna via del producto escribe ese status: el disparador queda montado para cuando exista el paso (D-38). Degrada a WARNING.';

DROP TRIGGER IF EXISTS tr_notify_worksheet ON public.activity_worksheets;
CREATE TRIGGER tr_notify_worksheet
  AFTER UPDATE ON public.activity_worksheets
  FOR EACH ROW EXECUTE FUNCTION public.notify_worksheet_events();


-- =====================================================================
-- PARTE 3 bis) Encargos — aviso previo a la fecha fin (D-05)
-- =====================================================================
--
-- `engagement.finalized` avisa que el encargo TERMINO; éste avisa que ESTA POR TERMINAR, y
-- son dos hechos distintos: uno se comunica, el otro se acciona (cerrar pendientes, pedir
-- prórroga). Por eso es un tipo aparte y no un `context` del otro.
--
-- No puede ser un trigger: nadie escribe en la fila el día que faltan 7 días. Va por el cron,
-- con el mismo patrón del plazo de emergencia (D-09): UN tipo, DOS disparos —a 7 días y a 1
-- día— distinguidos por `days_left` en el payload, e idempotente por destinatario contra
-- `public.notifications` para que re-ejecutarlo el mismo día no duplique.
--
-- Audiencia: la conducción + ADM. NO baja al staffing, a diferencia de `finalized`: un
-- asistente no decide una prórroga.

DROP FUNCTION IF EXISTS public.notif_engagement_daily_scheduled();

CREATE FUNCTION public.notif_engagement_daily_scheduled() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
  v_rec   record;
  v_sent  integer := 0;
BEGIN
  FOR v_rec IN
    SELECT e.engagement_id, e.end_date,
           COALESCE(e.engagement_code, '') AS engagement_code,
           COALESCE(e.engagement_name, '') AS engagement_name,
           (e.end_date - v_today) AS days_left,
           r.staff_id
      FROM public.engagements e
      CROSS JOIN LATERAL (
        SELECT staff_id FROM public.notif_engagement_owners(e.engagement_id)
        UNION
        SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
      ) r
     WHERE e.end_date IS NOT NULL
       AND (e.end_date - v_today) IN (7, 1)
       -- Un encargo ya finalizado, cancelado o rechazado no tiene fecha fin que avisar. El
       -- mismo criterio de `finalize_due_engagements()`: sólo los estados que siguen vivos.
       AND (e.engagement_state_override IS NULL
            OR e.engagement_state_override NOT IN (6, 7, 8))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.type_key = 'engagement.ending_soon'
         AND n.entity_id = v_rec.engagement_id::text
         AND n.recipient_staff_id = v_rec.staff_id
         AND n.payload->>'days_left' = v_rec.days_left::text
    ) THEN
      IF public.notify_staff('engagement.ending_soon', v_rec.staff_id,
           v_rec.engagement_id::text,
           jsonb_build_object('engagement_id',   v_rec.engagement_id,
                              'engagement_code', v_rec.engagement_code,
                              'engagement_name', v_rec.engagement_name,
                              'end_date',        v_rec.end_date,
                              'days_left',       v_rec.days_left)
           -- El último día no se anuncia como "quedan 1 días": `context` de i18next le da su
           -- propia redacción sin gastar un tipo del catálogo.
           || CASE WHEN v_rec.days_left = 1
                   THEN jsonb_build_object('context', 'last_day')
                   ELSE '{}'::jsonb END) IS NOT NULL THEN
        v_sent := v_sent + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$BODY$;

COMMENT ON FUNCTION public.notif_engagement_daily_scheduled() IS
  'FASE 3.c (D-05): aviso previo a la fecha fin del encargo, a 7 dias y a 1 dia, a la conduccion + ADM. Idempotente por destinatario y por days_left contra public.notifications. Devuelve cuantas notificaciones emitio.';

REVOKE ALL ON FUNCTION public.notif_engagement_daily_scheduled() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.notif_engagement_daily_scheduled() TO service_role;

-- Mismo guard de pg_cron y misma hora que `notif-wo-daily`: '0 12 * * *' UTC ≈ 08:00
-- America/La_Paz, para que los avisos de plazo lleguen al empezar la jornada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-engagement-daily') THEN
      PERFORM cron.unschedule('notif-engagement-daily');
    END IF;
    PERFORM cron.schedule(
      'notif-engagement-daily',
      '0 12 * * *',
      $cron$SELECT public.notif_engagement_daily_scheduled();$cron$
    );
  END IF;
END $$;


-- =====================================================================
-- FASE 3.i — Recordatorios periódicos (D-44)
-- =====================================================================
---------------------------------------------------------------------
--
-- Los contadores del catálogo no mandan correo por suceso: mandan un resumen con cadencia
-- (D-44). Es lo que permite que ninguna aprobación se pierda sin mandar un correo por ítem —
-- una solicitud de fondos de 12 gastos generaría 49 correos, y a la tercera semana la gente
-- arma una regla en Outlook y ahí se pierden también los que importaban.
--
-- Cada emisor recorre a quien tenga el tipo concedido en la matriz, arma el resumen con LOS
-- MISMOS contadores que pinta la campana, y sólo avisa si hay algo que contar. `notify_staff()`
-- pone el freno final: el tipo es `delivery = 'email'`, así que no deja fila en la campana, y el
-- `dedupe_key` hace que dos corridas de la misma ventana manden un correo y no dos.
--
-- Los emisores NO filtran por alcance `firm`: eso lo hace notify_staff() y sólo para el correo
-- por suceso. Un rol `firm` sí recibe el resumen — es justamente el formato que le sirve.

-- Un rol tiene concedido un tipo. Se usa para armar los resumenes pieza por pieza: sumar todos
-- los contadores sin preguntar le mostraria a un gerente la cola de capacitacion de Talento
-- Humano, que la matriz no le concede.
CREATE OR REPLACE FUNCTION public.notif_role_tiene(p_role_key text, p_type_key text)
RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  SELECT EXISTS (
    SELECT 1 FROM public.notification_role_types
     WHERE role_key = p_role_key AND type_key = p_type_key);
$BODY$;

COMMENT ON FUNCTION public.notif_role_tiene(text, text) IS
  'Si la matriz le concede ese tipo a ese rol. Helper de los emisores de recordatorio.';

-- 1. Diario: mis horas.
CREATE OR REPLACE FUNCTION public.notif_emit_timesheet_reminder_daily()
RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_from     date := public.notif_timesheet_window_start();
  v_hoy      text := to_char((now() AT TIME ZONE 'America/La_Paz')::date, 'YYYY-MM-DD');
  v_weeks    jsonb;
  v_overdue  jsonb;
  v_reverted jsonb;
  v_avisados integer := 0;
  v_rec      record;
BEGIN
  FOR v_rec IN
    SELECT s.staff_id, ur.role_key
      FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
      JOIN public.notification_role_types nrt ON nrt.role_key = ur.role_key
     WHERE nrt.type_key = 'timesheet.reminder.daily'
       AND s.is_active
       AND s.deleted_at IS NULL
       AND s.email IS NOT NULL
       AND btrim(s.email) <> ''
  LOOP
    -- Hora local, no CURRENT_DATE (UTC): ver 20260911100600_fecha_local_current_date.sql.
    v_weeks    := public.get_week_statuses(v_rec.staff_id, v_from, (now() AT TIME ZONE 'America/La_Paz')::date);
    v_overdue  := public.notif_agg_timesheet_overdue(v_weeks);
    v_reverted := public.notif_agg_timesheet_reverted(v_weeks);

    -- Sin nada pendiente no se manda nada. Un recordatorio que dice "cero" todos los días
    -- enseña a ignorarlo.
    CONTINUE WHEN COALESCE((v_overdue->>'count')::integer, 0)
                + COALESCE((v_reverted->>'count')::integer, 0) = 0;

    PERFORM public.notify_staff('timesheet.reminder.daily', v_rec.staff_id, NULL,
              jsonb_build_object('dedupe',   v_hoy,
                                 'overdue',  v_overdue,
                                 'reverted', v_reverted));
    v_avisados := v_avisados + 1;
  END LOOP;

  RETURN v_avisados;
END;
$BODY$;

COMMENT ON FUNCTION public.notif_emit_timesheet_reminder_daily() IS
  'Recordatorio diario de horas: semanas sin cargar y semanas devueltas. Devuelve a cuantas personas se les emitio (el dedupe puede descartar alguna si el cron corre dos veces el mismo dia).';

-- 2. Semanal: lo que tengo que aprobar.
CREATE OR REPLACE FUNCTION public.notif_emit_approval_reminder_weekly()
RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_from      date := public.notif_timesheet_window_start();
  v_semana    text := to_char((now() AT TIME ZONE 'America/La_Paz')::date, 'IYYY-"W"IW');
  v_lineas    jsonb;
  v_capac     jsonb;
  v_encargos  jsonb;
  v_total     integer;
  v_avisados  integer := 0;
  v_rec       record;
BEGIN
  FOR v_rec IN
    SELECT s.staff_id, ur.role_key
      FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
      JOIN public.notification_role_types nrt ON nrt.role_key = ur.role_key
     WHERE nrt.type_key = 'approval.reminder.weekly'
       AND s.is_active
       AND s.deleted_at IS NULL
       AND s.email IS NOT NULL
       AND btrim(s.email) <> ''
  LOOP
    -- Cada pieza del resumen se incluye SOLO si la matriz le concede ese contador. Sumarlos
    -- todos le mostraria a un gerente la cola de capacitacion de Talento Humano.
    v_lineas := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'timesheet.pending_approval')
                     THEN public.notif_agg_timesheet_pending_approval(v_rec.staff_id, v_from)
                     ELSE NULL END;
    v_capac  := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'approval.training_pending')
                     THEN public.notif_agg_approval_training_pending()
                     ELSE NULL END;
    v_encargos := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'engagement.pending_partner_approval')
                       THEN public.engagement_approval_bucket(v_rec.staff_id, 'Pending_Approval')
                       ELSE NULL END;

    v_total := COALESCE((v_lineas->>'count')::integer, 0)
             + COALESCE((v_capac->>'count')::integer, 0)
             + COALESCE((v_encargos->>'count')::integer, 0);
    CONTINUE WHEN v_total = 0;

    PERFORM public.notify_staff('approval.reminder.weekly', v_rec.staff_id, NULL,
              jsonb_build_object('dedupe',    v_semana,
                                 'total',     v_total,
                                 'lineas',    v_lineas,
                                 'capacitacion', v_capac,
                                 'encargos',  v_encargos));
    v_avisados := v_avisados + 1;
  END LOOP;

  RETURN v_avisados;
END;
$BODY$;

COMMENT ON FUNCTION public.notif_emit_approval_reminder_weekly() IS
  'Recordatorio semanal de aprobaciones: lineas de timesheet, cola de capacitacion y encargos esperando al Socio. Cada pieza entra solo si la matriz le concede ese contador al rol.';

-- 3. Semanal: fondos.
CREATE OR REPLACE FUNCTION public.notif_emit_fund_reminder_weekly()
RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_semana   text := to_char((now() AT TIME ZONE 'America/La_Paz')::date, 'IYYY-"W"IW');
  v_revision jsonb;
  v_desemb   jsonb;
  v_liquid   jsonb;
  v_cierre   jsonb;
  -- Los mismos cuatro contadores recortados a lo que la matriz le concede a CADA destinatario.
  v_rev_rol  jsonb;
  v_des_rol  jsonb;
  v_liq_rol  jsonb;
  v_cie_rol  jsonb;
  v_total    integer;
  v_avisados integer := 0;
  v_rec      record;
BEGIN
  -- Los cuatro contadores de fondos no reciben staff: son de toda la firma, y la matriz se los
  -- concede a Contabilidad con alcance `department`. Se calculan una sola vez.
  v_revision := public.notif_agg_fund_expense_review_pending();
  v_desemb   := public.notif_agg_fund_disbursement_pending();
  v_liquid   := public.notif_agg_fund_settlement_pending();
  v_cierre   := public.notif_agg_fund_closure_pending();

  FOR v_rec IN
    SELECT s.staff_id, ur.role_key
      FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
      JOIN public.notification_role_types nrt ON nrt.role_key = ur.role_key
     WHERE nrt.type_key = 'fund.reminder.weekly'
       AND s.is_active
       AND s.deleted_at IS NULL
       AND s.email IS NOT NULL
       AND btrim(s.email) <> ''
  LOOP
    -- El recorte por rol tiene que pasar ANTES de armar el payload y no sólo dentro de v_total:
    -- gatear el total decide bien a quién se le manda y mal qué lee. `detallesDeRecordatorio()`
    -- (plantillas/notificaciones.ts) renderiza todo bucket con count > 0, así que un
    -- accounting_analyst —que tiene `fund.reminder.weekly` y de los cuatro contadores sólo
    -- `fund.expense.review_pending`— recibía los otros tres, que son de Contabilidad.
    -- Mismo patrón que notif_emit_approval_reminder_weekly: la pieza no concedida viaja NULL.
    v_rev_rol := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'fund.expense.review_pending')
                      THEN v_revision ELSE NULL END;
    v_des_rol := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'fund.disbursement.pending')
                      THEN v_desemb ELSE NULL END;
    v_liq_rol := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'fund.settlement.pending')
                      THEN v_liquid ELSE NULL END;
    v_cie_rol := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'fund.request.closure_pending')
                      THEN v_cierre ELSE NULL END;

    v_total := COALESCE((v_rev_rol->>'count')::integer, 0)
             + COALESCE((v_des_rol->>'count')::integer, 0)
             + COALESCE((v_liq_rol->>'count')::integer, 0)
             + COALESCE((v_cie_rol->>'count')::integer, 0);
    CONTINUE WHEN v_total = 0;

    PERFORM public.notify_staff('fund.reminder.weekly', v_rec.staff_id, NULL,
              jsonb_build_object('dedupe', v_semana,
                                 'total',  v_total,
                                 'revision_gastos', v_rev_rol,
                                 'desembolsos',     v_des_rol,
                                 'liquidaciones',   v_liq_rol,
                                 'cierres',         v_cie_rol));
    v_avisados := v_avisados + 1;
  END LOOP;

  RETURN v_avisados;
END;
$BODY$;

COMMENT ON FUNCTION public.notif_emit_fund_reminder_weekly() IS
  'Recordatorio semanal de fondos: gastos por revisar, solicitudes por desembolsar, por liquidar y por cerrar. Cada contador entra al payload solo si la matriz se lo concede al rol del destinatario.';

-- 4. Semanal: cuotas.
CREATE OR REPLACE FUNCTION public.notif_emit_wo_installment_reminder_weekly()
RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_semana   text := to_char((now() AT TIME ZONE 'America/La_Paz')::date, 'IYYY-"W"IW');
  v_semana_actual jsonb := public.notif_agg_wo_installment_due_this_week();
  v_mora     jsonb;
  -- `v_semana_actual` es de toda la firma; esta es su version recortada al destinatario.
  v_por_venc jsonb;
  v_total    integer;
  v_avisados integer := 0;
  v_rec      record;
BEGIN
  FOR v_rec IN
    SELECT s.staff_id, ur.role_key,
           -- El alcance del contador de mora, que la matriz reparte con DOS: `assigned` para los
           -- gerentes (sus encargos) y `department` para Contabilidad (todo). Sin esto un gerente
           -- veria la mora de toda la firma.
           (SELECT n2.scope_key FROM public.notification_role_types n2
             WHERE n2.role_key = ur.role_key
               AND n2.type_key = 'wo.installment.overdue') AS scope_mora
      FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
      JOIN public.notification_role_types nrt ON nrt.role_key = ur.role_key
     WHERE nrt.type_key = 'wo.installment.reminder.weekly'
       AND s.is_active
       AND s.deleted_at IS NULL
       AND s.email IS NOT NULL
       AND btrim(s.email) <> ''
  LOOP
    v_mora := CASE WHEN v_rec.scope_mora IS NOT NULL
                   THEN public.notif_agg_wo_installment_overdue(v_rec.staff_id, v_rec.scope_mora)
                   ELSE NULL END;

    -- Igual que la mora de arriba: el contador entra al payload sólo si la matriz se lo concede.
    -- `wo.installment.due_this_week` es de Contabilidad (alcance `department`) y los gerentes no
    -- lo tienen, así que mandárselo les entregaba las cuotas por vencer de toda la firma —
    -- exactamente lo que `scope_mora` se cuida de no hacer con las vencidas.
    v_por_venc := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'wo.installment.due_this_week')
                       THEN v_semana_actual ELSE NULL END;

    v_total := COALESCE((v_mora->>'count')::integer, 0)
             + COALESCE((v_por_venc->>'count')::integer, 0);
    CONTINUE WHEN v_total = 0;

    PERFORM public.notify_staff('wo.installment.reminder.weekly', v_rec.staff_id, NULL,
              jsonb_build_object('dedupe', v_semana,
                                 'total',  v_total,
                                 'vencidas',   v_mora,
                                 'por_vencer', v_por_venc));
    v_avisados := v_avisados + 1;
  END LOOP;

  RETURN v_avisados;
END;
$BODY$;

COMMENT ON FUNCTION public.notif_emit_wo_installment_reminder_weekly() IS
  'Recordatorio semanal de cuotas: vencidas (con el alcance que la matriz le da al rol) y por vencer esta semana (solo si la matriz le concede ese contador). Reemplaza al correo por cuota de wo.client.billing_week (D-44).';

REVOKE ALL ON FUNCTION public.notif_emit_timesheet_reminder_daily() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_emit_approval_reminder_weekly() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_emit_fund_reminder_weekly() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_emit_wo_installment_reminder_weekly() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notif_emit_timesheet_reminder_daily() TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_emit_approval_reminder_weekly() TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_emit_fund_reminder_weekly() TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_emit_wo_installment_reminder_weekly() TO service_role;

-- =====================================================================
-- Quien puede llamar a los resolutores de destinatarios
-- =====================================================================
--
-- Mismo motivo que el bloque G.6 de la migracion 01. Todos estos son SECURITY DEFINER y todos
-- reciben el id de la entidad por parametro, asi que sin REVOKE cualquiera con la anon key
-- preguntaba por PostgREST "quienes son los gerentes del encargo X" o "quienes tienen el rol
-- partner", que es exactamente el directorio que la RLS no le entrega.
--
-- Los `notify_*_events()` NO estan en la lista: devuelven `trigger`, y una funcion asi no se
-- puede invocar directamente (`trigger functions can only be called as triggers`) ni la publica
-- PostgREST. El grant sobre ellas no cambia nada.
--
-- Nadie mas que el dueño necesita ejecutarlas: quien las llama son los triggers y los emisores
-- del cron, todos SECURITY DEFINER, o sea que corren como el dueño y conservan su EXECUTE.

REVOKE ALL ON FUNCTION public.notif_staff_by_roles(text[])                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_staff_by_practice(uuid, text[])       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_fund_request_managers(uuid)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_engagement_partners(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_engagement_managers(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_engagement_owners(uuid)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_engagement_staffed(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_timesheet_period_leads(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_client_assigned(uuid)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_scope_of(text, uuid)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_role_tiene(text, text)                FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.notif_staff_by_roles(text[])             TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_staff_by_practice(uuid, text[])    TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_fund_request_managers(uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_engagement_partners(uuid)          TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_engagement_managers(uuid)          TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_engagement_owners(uuid)            TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_engagement_staffed(uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_timesheet_period_leads(uuid)       TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_client_assigned(uuid)              TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_scope_of(text, uuid)               TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_role_tiene(text, text)             TO service_role;

-- Horarios en UTC. La Paz es UTC-4, así que 13:00 UTC = 09:00 local: media mañana, no de
-- madrugada como los emisores de la campana. Un correo que llega a las 2 AM se lee junto con el
-- spam de la noche.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-reminder-timesheet-daily') THEN
      PERFORM cron.unschedule('notif-reminder-timesheet-daily');
    END IF;
    -- Lunes a viernes: el fin de semana no se cargan horas y el aviso sólo gasta atención.
    PERFORM cron.schedule('notif-reminder-timesheet-daily', '0 13 * * 1-5',
      $cron$SELECT public.notif_emit_timesheet_reminder_daily();$cron$);

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-reminder-approval-weekly') THEN
      PERFORM cron.unschedule('notif-reminder-approval-weekly');
    END IF;
    PERFORM cron.schedule('notif-reminder-approval-weekly', '10 13 * * 1',
      $cron$SELECT public.notif_emit_approval_reminder_weekly();$cron$);

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-reminder-fund-weekly') THEN
      PERFORM cron.unschedule('notif-reminder-fund-weekly');
    END IF;
    PERFORM cron.schedule('notif-reminder-fund-weekly', '20 13 * * 1',
      $cron$SELECT public.notif_emit_fund_reminder_weekly();$cron$);

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-reminder-installment-weekly') THEN
      PERFORM cron.unschedule('notif-reminder-installment-weekly');
    END IF;
    PERFORM cron.schedule('notif-reminder-installment-weekly', '30 13 * * 1',
      $cron$SELECT public.notif_emit_wo_installment_reminder_weekly();$cron$);
  END IF;
END $$;


-- =====================================================================
-- FASE 3.j — De dónde vino el cambio de rol (D-44)
-- =====================================================================
---------------------------------------------------------------------
--
-- `auth.role.changed` manda correo (D-44), y el texto tiene que decir una cosa distinta según el
-- cambio haya sido directo o derivado de la categoría: el rol se deriva de ella
-- (`sync_user_role_from_category`, 0820-182), así que cambiar la categoría de alguien también
-- dispara este aviso.
--
-- El trigger está sobre `user_roles` y ve el resultado, no la causa. La causa la deja anotada
-- quien la conoce, en una variable de sesión local a la transacción, y el trigger la copia al
-- payload. Determinístico, en vez de adivinar mirando si la categoría cambió cerca en el tiempo.
--
-- `notif_origen_cambio_rol()` vive en la migración 01: la llama el trigger del 03, que corre
-- antes que este archivo.

-- Y quien conoce la causa la anota. Se usa la clausula SET de la propia funcion en vez de tocar
-- su cuerpo: `20260825000000_category_default_role_key.sql` ya esta aplicada en ambientes reales,
-- y reescribir sus 100 lineas aca solo para agregar una es pedir que las dos copias se separen.
-- La clausula vale mientras la funcion corre, incluida la delegacion en admin_set_user_role_key y
-- el trigger que esa escritura dispara, y se restaura sola al salir.
--
-- Va guardado porque este archivo no puede exigir esa migracion: el catalogo de notificaciones
-- no depende de la sincronizacion de categoria, y un ambiente sin ella —EMS-Test, sin ir mas
-- lejos— no tiene por que quedarse sin los emisores enteros por un detalle de redaccion de un
-- correo. Si la funcion no esta, el origen queda en `direct` y el correo dice "su rol cambio",
-- que es verdad igual.
-- El ALTER degrada, no aborta. `ems.role_change_source` es un GUC personalizado, y fijarlo con
-- `ALTER FUNCTION ... SET` exige privilegio sobre el parametro: en el stack de Supabase las
-- migraciones corren como `postgres`, que NO es superusuario (lo es `supabase_admin`), y el
-- intento muere con 42501 -- "permission denied to set parameter". En un cluster donde el que
-- aplica SI es superusuario pasa sin ruido, que es por lo que el harness local no lo veia:
-- hallazgo real de CI (2026-09-16, `supabase start`).
--
-- Que se caiga ahi no puede costar las tres migraciones de notificaciones enteras. Es la misma
-- razon por la que el ELSE de abajo tampoco aborta: esto decide el TEXTO de un correo, no si el
-- correo sale. Sin el parametro, `notif_origen_cambio_rol()` devuelve `direct` y el mensaje dice
-- "su rol cambio", que es verdad igual -- solo se pierde la variante que aclara que vino de un
-- cambio de categoria.
--
-- Se atrapa `insufficient_privilege` y no `OTHERS`: cualquier otro fallo aca si es un problema
-- de verdad y tiene que salir a la luz.
DO $$
BEGIN
  IF to_regprocedure('public.sync_user_role_from_category(uuid, text, text)') IS NOT NULL THEN
    BEGIN
      EXECUTE 'ALTER FUNCTION public.sync_user_role_from_category(uuid, text, text)' ||
              ' SET "ems.role_change_source" = ''category''';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'sin privilegio para fijar ems.role_change_source (hace falta superusuario): auth.role.changed saldra siempre con source=direct.';
    END;
  ELSE
    RAISE NOTICE 'sync_user_role_from_category no existe: auth.role.changed no podra distinguir el cambio de categoria (falta 20260825000000_category_default_role_key.sql).';
  END IF;
END $$;


-- =====================================================================
-- Verificación final: ningún helper del módulo quedó abierto al cliente
-- =====================================================================
--
-- Va al final del ÚLTIMO archivo de notificaciones a propósito: acá ya existen las funciones de
-- las tres migraciones, así que es el único punto donde se puede mirar el módulo entero.
--
-- El problema que atrapa es de omisión, y los `REVOKE` de arriba no se defienden solos: Postgres
-- le da `EXECUTE` a `PUBLIC` a toda función nueva y PostgREST publica en `/rest/v1/rpc/` todo lo
-- que el rol de la petición pueda ejecutar. Agregar un contador y olvidarse del `REVOKE` no da
-- ningún error — deja un endpoint público que contesta con datos que la RLS esconde. Fue
-- exactamente lo que pasó con `engagement_approval_bucket`, que devolvía código y nombre de
-- encargo a cualquiera que mandara un staff_id ajeno con la anon key.
--
-- Por eso se verifica en vez de barrer automáticamente: un barrido silencioso arregla el
-- síntoma y deja que la costumbre se pierda. Esto rompe la migración y obliga a decidir a qué
-- lista va la función nueva.
DO $$
DECLARE v_abiertos text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_abiertos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     -- Los `notify_*_events()` devuelven `trigger`: no se pueden invocar directamente
     -- (`trigger functions can only be called as triggers`) ni los publica PostgREST.
     AND p.prorettype <> 'pg_catalog.trigger'::regtype
     -- El filtro cubre el MODULO ENTERO, no solo el prefijo `notif\_`.
     --
     -- Antes decia `notif\_% OR engagement_approval_bucket`, con la nota de que notify_staff
     -- "de todos modos ya esta revocada en la migracion 01". Estaba revocada a medias: con
     -- `FROM PUBLIC` a secas, que en Postgres pelado alcanza y en un proyecto Supabase no —el
     -- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated` del proyecto
     -- le da un grant DIRECTO que revocar PUBLIC no toca. O sea que la unica funcion que el
     -- filtro dejaba pasar por confiar en otro archivo era la que escribe notificaciones y
     -- encola correos a nombre de cualquiera. Hallazgo real al pegar esto en el mirror
     -- (2026-09-15); el harness no podia verlo hasta que 00-shim-auth.sql replico ese default.
     --
     -- Moraleja que vale para lo que se agregue: el guard no confia en que otro archivo haya
     -- revocado bien, lo verifica.
     AND (p.proname LIKE 'notif\_%'
       OR p.proname LIKE 'notify\_%'
       OR p.proname LIKE '%notification%'
       OR p.proname IN ('engagement_approval_bucket',
                        'rollback_unconfirmed_signup',
                        'prepare_account_deletion',
                        'clear_account_deletion_mark'))
     -- Las 4 RPC del panel son la excepcion y SI deben estar abiertas: se verifican abajo, al
     -- reves. Ninguna recibe un staff_id — las cuatro lo derivan de get_my_staff_id().
     AND p.proname NOT IN ('get_my_notifications',
                           'get_my_notification_aggregates',
                           'mark_notifications_read',
                           'dismiss_notifications')
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('anon', p.oid, 'EXECUTE'));

  IF v_abiertos IS NOT NULL THEN
    RAISE EXCEPTION
      'Helpers de notificaciones ejecutables desde el cliente (PostgREST los publica): %. Agregar su REVOKE junto al CREATE.',
      v_abiertos;
  END IF;

  -- El reverso, que ningún REVOKE de más deje el panel en blanco. Las cuatro derivan el staff de
  -- get_my_staff_id(), así que son las únicas que `authenticated` debe poder ejecutar.
  IF NOT has_function_privilege('authenticated', 'public.get_my_notifications(integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_my_notification_aggregates()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.mark_notifications_read(uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.dismiss_notifications(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'Alguna de las 4 RPC del panel quedo sin EXECUTE para authenticated: el panel no carga';
  END IF;

  RAISE NOTICE 'PASS — helpers cerrados al cliente, las 4 RPC del panel abiertas a authenticated';
END $$;

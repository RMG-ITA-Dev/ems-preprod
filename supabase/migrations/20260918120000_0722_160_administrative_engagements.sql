-- 0722-160: flujo de encargos administrativos.
--
-- Los encargos cuya funcion no es Cliente (1) son internos y usan solamente
-- los dos clientes internos de las sociedades. El trigger es la defensa en
-- profundidad frente a llamadas RPC/directas que no pasan por el formulario.

DO $$
BEGIN
  -- El flujo depende de las dos sociedades del catálogo base. Algunos mirrors
  -- históricos no ejecutaron ese seed; se asegura aquí de forma idempotente
  -- antes de resolver los clientes internos contra ellas.
  INSERT INTO public.society (name, is_active) VALUES
    ('Ruizmier Pelaez S.R.L.', true),
    ('Ruizmier Jauregui S.R.L.', true)
  ON CONFLICT (name) DO UPDATE
    SET is_active = true;

  -- Corrección de la primera versión de 0722-160: "Juaregui" fue un error
  -- ortográfico. Se conserva la fila antigua (no se borra: staff/engagements
  -- podrían referenciarla y la FK es ON DELETE RESTRICT), pero deja de ser
  -- elegible en catálogos activos.
  --
  -- Review fix (Codex): desactivar sin repuntar dejaba varado a cualquier staff cuya ficha
  -- ya apuntara al UUID viejo -- enforce_engagement_profile_scope() exige NEW.society_id =
  -- staff.society_id EXACTO (por UUID), mientras enforce_administrative_engagement_rules()
  -- exige que ese society_id resuelva (por NOMBRE) a 'Ruizmier Jauregui S.R.L.' canónico. Un
  -- creador con la ficha en el UUID viejo no podía satisfacer ambos triggers a la vez -> no
  -- podía crear NINGÚN encargo administrativo de esa sociedad. Se repuntan las dos únicas FKs
  -- reales (staff.society_id, engagements.society_id) al UUID canónico antes de desactivar.
  UPDATE public.staff st
     SET society_id = canonical.society_id
    FROM public.society legacy
    JOIN public.society canonical ON canonical.name = 'Ruizmier Jauregui S.R.L.'
   WHERE legacy.name = 'Ruizmier Juaregui S.R.L.'
     AND st.society_id = legacy.society_id;

  UPDATE public.engagements e
     SET society_id = canonical.society_id
    FROM public.society legacy
    JOIN public.society canonical ON canonical.name = 'Ruizmier Jauregui S.R.L.'
   WHERE legacy.name = 'Ruizmier Juaregui S.R.L.'
     AND e.society_id = legacy.society_id;

  UPDATE public.society
     SET is_active = false
   WHERE name = 'Ruizmier Juaregui S.R.L.'
     AND EXISTS (
       SELECT 1
         FROM public.society canonical
        WHERE canonical.name = 'Ruizmier Jauregui S.R.L.'
     );

  -- El mirror conserva un cliente histórico con el NIT correcto y el sufijo
  -- "ADMIN". Se conserva su id (y por tanto sus relaciones) y se normaliza al
  -- nombre oficial de su sociedad antes de validar/sembrar el catálogo.
  -- Review fix (Greptile): reactivar (is_active=true) es una condición del SET, no del WHERE —
  -- si el nombre ya coincidía pero la fila estaba inactiva, el WHERE original (solo por nombre)
  -- la dejaba afuera y list_administrative_internal_clients() nunca la habría reactivado.
  UPDATE public.clients c
     SET client_legal_name = s.name,
         is_active = true
    FROM (VALUES
      ('Ruizmier Pelaez S.R.L.'::text, '1006979026'::text),
      ('Ruizmier Jauregui S.R.L.'::text, '184046021'::text)
    ) AS v(society_name, nit)
    JOIN public.society s ON s.name = v.society_name
   WHERE c.unique_tax_id = v.nit
     AND (lower(trim(c.client_legal_name)) <> lower(trim(s.name)) OR c.is_active = false);

  INSERT INTO public.clients (client_legal_name, unique_tax_id, is_active)
  SELECT s.name, v.nit, true
    FROM (VALUES
      ('Ruizmier Pelaez S.R.L.'::text, '1006979026'::text),
      ('Ruizmier Jauregui S.R.L.'::text, '184046021'::text)
    ) AS v(society_name, nit)
    JOIN public.society s ON s.name = v.society_name
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.clients c
      WHERE c.unique_tax_id = v.nit
         OR lower(trim(c.client_legal_name)) = lower(trim(s.name))
   );

  IF NOT EXISTS (
    SELECT 1
      FROM public.clients c
      JOIN public.society s ON s.name = 'Ruizmier Pelaez S.R.L.'
     WHERE lower(trim(c.client_legal_name)) = lower(trim(s.name))
       AND c.unique_tax_id = '1006979026'
  ) OR NOT EXISTS (
    SELECT 1
      FROM public.clients c
      JOIN public.society s ON s.name = 'Ruizmier Jauregui S.R.L.'
     WHERE lower(trim(c.client_legal_name)) = lower(trim(s.name))
       AND c.unique_tax_id = '184046021'
  ) THEN
    RAISE EXCEPTION '0722-160: los clientes internos de sociedad ya existen con un nombre o NIT incompatible';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_administrative_engagement_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_client_nit text;
  v_society_name text;
BEGIN
  -- Review fix (Codex, 3ra vuelta): `funcion` es inmutable despues de crear. EngagementForm
  -- ya lo trata asi (el payload de update la omite a proposito), pero la base no lo exigia y
  -- la policy "Team can update engagements" deja hacer el PATCH directo por PostgREST. Sin
  -- este guard, convertir un encargo Cliente ya aprobado a 0/2/3 pasaba sin tocar sus OTs:
  -- los triggers de work_orders y de plan de pagos son BEFORE INSERT OR UPDATE sobre SUS
  -- tablas, asi que la aprobacion de Riesgos, el plan y las cuotas quedaban vivas (Cobranzas
  -- las sigue viendo) mientras la UI ya escondia Riesgos y facturacion por la funcion nueva.
  -- Se bloquea el cambio en vez de cascadearlo: ademas, `funcion` va dentro de
  -- engagement_code (FY.[oficina][practica][funcion].[correlativo]), asi que moverla
  -- desincroniza el codigo ya emitido.
  --
  -- Unica excepcion: NULL -> 1. Las filas legacy tienen funcion NULL y todo el sistema las
  -- lee como Cliente (COALESCE(funcion, 1) = 1), asi que clasificarlas explicitamente no
  -- cambia nada. NULL -> 0/2/3 si es una conversion real y cae en el mismo bloqueo.
  IF TG_OP = 'UPDATE'
     AND OLD.funcion IS DISTINCT FROM NEW.funcion
     AND NOT (OLD.funcion IS NULL AND NEW.funcion = 1) THEN
    RAISE EXCEPTION '0722-160: la funcion del encargo no se puede cambiar despues de crearlo';
  END IF;

  IF NEW.funcion IS NULL OR NEW.funcion = 1 THEN
    RETURN NEW;
  END IF;

  -- Do not make historical administrative rows uneditable merely because their
  -- original client/society predates this flow. A new administrative row, or a
  -- change to its function/client/society, must use the controlled mapping.
  IF TG_OP = 'UPDATE'
     AND OLD.funcion = NEW.funcion
     AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id
     AND OLD.society_id IS NOT DISTINCT FROM NEW.society_id THEN
    NEW.is_internal := true;
    NEW.activity_required := false;
    RETURN NEW;
  END IF;

  SELECT c.unique_tax_id, s.name
    INTO v_client_nit, v_society_name
    FROM public.clients c
    JOIN public.society s ON s.society_id = NEW.society_id
   WHERE c.client_id = NEW.client_id;

  IF (v_society_name = 'Ruizmier Pelaez S.R.L.' AND v_client_nit = '1006979026')
     OR (v_society_name = 'Ruizmier Jauregui S.R.L.' AND v_client_nit = '184046021') THEN
    NEW.is_internal := true;
    NEW.activity_required := false;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '0722-160: el cliente interno debe corresponder a la sociedad del encargo';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_administrative_engagement_rules ON public.engagements;
CREATE TRIGGER trg_enforce_administrative_engagement_rules
  BEFORE INSERT OR UPDATE OF funcion, client_id, society_id, is_internal, activity_required
  ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_administrative_engagement_rules();

COMMENT ON FUNCTION public.enforce_administrative_engagement_rules() IS
  '0722-160: para funciones Administrativa/Capacitacion/Calidad exige el cliente interno de su sociedad y fuerza interno=true/activity_required=false. Ademas hace `funcion` inmutable tras crear (unica excepcion NULL -> 1), porque cambiarla dejaria las OTs del encargo sin normalizar y desincronizaria engagement_code.';

-- Review fix (Codex, 3ra vuelta): repara los encargos administrativos creados ANTES de esta
-- regla, igual que mas abajo se reparan sus OTs. El trigger solo corrige una fila cuando
-- alguien la vuelve a escribir, asi que una fila historica con funcion 0/2/3 se quedaba con
-- el default `is_internal = false`. Consecuencia concreta: useApprovedEngagements (Tracker)
-- excluye por `is_internal` y NO por `funcion` (src/hooks/useApprovedEngagements.ts), asi que
-- esos encargos seguian siendo seleccionables para cargar horas en el Tracker, y en
-- Engagements.tsx seguian sin el distintivo de interno. `activity_required` ya venia
-- backfilleado por 20260828123000_0827-184; `is_internal` era la mitad que faltaba.
--
-- El UPDATE dispara el trigger de arriba (UPDATE OF is_internal), que para una fila sin cambio
-- de funcion/cliente/sociedad entra por la rama historica y reafirma los dos flags sin exigir
-- el mapeo de cliente interno. Por eso una fila con cliente/sociedad heredados no explota.
UPDATE public.engagements
   SET is_internal = true,
       activity_required = false
 WHERE funcion IS NOT NULL
   AND funcion <> 1
   AND (is_internal IS DISTINCT FROM true OR activity_required IS DISTINCT FROM false);

-- `tr_wo_guard_risk_approval` corre antes que el trigger administrativo por
-- orden alfabético. Mantiene su bloqueo para Cliente, pero deja pasar una OT
-- administrativa para que el trigger siguiente descarte cualquier dato Riesgos.
CREATE OR REPLACE FUNCTION public.wo_guard_risk_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.engagements e
     WHERE e.engagement_id = NEW.engagement_id
       AND e.funcion IS NOT NULL
       AND e.funcion <> 1
  ) THEN
    RETURN NEW;
  END IF;

  IF (
    (NEW.risk_approved_by IS DISTINCT FROM OLD.risk_approved_by AND NEW.risk_approved_by IS NOT NULL)
    OR (NEW.risk_status IS DISTINCT FROM OLD.risk_status
        AND NEW.risk_status IN ('Approved', 'Rejected', 'Emergency_Approved'))
    OR (NEW.emergency_review_by IS DISTINCT FROM OLD.emergency_review_by AND NEW.emergency_review_by IS NOT NULL)
    OR (NEW.emergency_partner_by IS DISTINCT FROM OLD.emergency_partner_by AND NEW.emergency_partner_by IS NOT NULL)
  ) AND NOT public.can_approve_wo_risk(NEW.engagement_id) THEN
    RAISE EXCEPTION 'Solo un aprobador de Riesgos autorizado puede aprobar o rechazar la seccion de Riesgos de esta OT';
  END IF;

  RETURN NEW;
END;
$$;

-- Review fix (Codex): notify_work_order_events() (20260911100200) decide la entrada a la cola
-- de Riesgos con `risk_status = 'Pending' AND v_submitted`. Para una OT administrativa esa
-- combinacion se cumple SIEMPRE -- enforce_administrative_work_order_rules() (BEFORE) fuerza
-- 'Pending' antes de que el trigger de notificaciones (AFTER) lo lea -- asi que cada envio
-- disparaba wo.submitted_risk (panel + correo) a risk_partner/risk_supervisor por una pista
-- que esta misma migracion elimina y que WorkOrderEdit ni siquiera renderiza. Se redefine la
-- funcion entera (unico cambio: el gate por funcion; el resto es copia literal) porque esta
-- migracion corre despues y no se debe reeditar la original.
--
-- Review fix (Codex, 2da vuelta): va ANTES de las reparaciones de datos de mas abajo, no al final
-- del archivo. Esos UPDATE bajan risk_status a 'Pending' y limpian risk_approved_at en OTs
-- administrativas historicas; con la definicion vieja todavia instalada, el trigger AFTER las
-- leia como un reenvio de datos (wo.risk.resubmitted) y como una reversion de Riesgos
-- (wo.approval_reverted) y mandaba notificaciones y correos reales durante el despliegue.
CREATE OR REPLACE FUNCTION public.notify_work_order_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_code       text;
  v_funcion    smallint;
  v_is_client  boolean;
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
  SELECT COALESCE(e.engagement_code, ''), e.funcion INTO v_code, v_funcion
    FROM public.engagements e
   WHERE e.engagement_id = NEW.engagement_id;

  -- engagement_code lo pinta el panel como chip (notificationMeta); engagement_id no se usa
  -- hoy en la ruta —el destino es /work-orders/<wo_id>— pero deja el encargo a mano para
  -- cuando la Fase 3.c linkee al detalle del encargo.
  v_base := jsonb_build_object(
    'engagement_code', v_code,
    'engagement_id',   NEW.engagement_id,
    'currency',        NEW.currency);

  -- 0722-160: Cliente es la unica funcion con pista de Riesgos. COALESCE trata funcion NULL
  -- como Cliente, que es el default historico de la columna.
  v_is_client := COALESCE(v_funcion, 1) = 1;

  -- ── Discriminadores ──
  v_submitted := NEW.approval_status = 'Pending_Approval'
             AND OLD.approval_status IN ('Draft', 'Rejected');

  -- La reversión se detecta por la marca de la pista APAGÁNDOSE, no por approval_status:
  -- useRevertSocioApproval/useRevertRiskApproval limpian la firma en la primera sentencia y
  -- reabren la OT en la segunda, y sólo la primera distingue una reversión de un rechazo.
  v_rev_socio := OLD.approved_at      IS NOT NULL AND NEW.approved_at      IS NULL;
  v_rev_risk  := v_is_client AND OLD.risk_approved_at IS NOT NULL AND NEW.risk_approved_at IS NULL;

  -- Reenvío de datos de riesgo tras un veredicto (rechazo, o compleción de los datos que
  -- quedaron pendientes de una aprobación de emergencia).
  v_resubmit := v_is_client
            AND NEW.risk_status = 'Pending'
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
  --
  -- 0722-160: en una OT administrativa `risk_status = 'Pending'` significa "no aplica", no
  -- "en cola". enforce_administrative_work_order_rules() es BEFORE y lo fuerza a 'Pending'
  -- antes de que este trigger (AFTER) lo lea, asi que sin `v_is_client` TODO envio
  -- administrativo avisaba por panel y correo a risk_partner/risk_supervisor sobre una pista
  -- que la feature elimino y que la UI ni siquiera muestra.
  --
  -- Review fix (Codex, 2da vuelta): el gate NO alcanza con ponerlo aca. `v_resubmit` y
  -- `v_rev_risk` alimentan wo.risk.resubmitted y wo.approval_reverted, y las reparaciones de
  -- datos de mas abajo (bajan risk_status a 'Pending' y limpian risk_approved_at en OTs
  -- administrativas historicas) cumplen las dos condiciones. Por eso los tres discriminadores
  -- de la pista de Riesgos llevan `v_is_client`, no solo este.
  v_to_risk := v_is_client
           AND NEW.risk_status = 'Pending'
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
  'FASE 3.b: 11 eventos de work_orders. Las aprobaciones se detectan por la marca de cada pista (approved_at / risk_status) y no por approval_status, porque la aprobacion se escribe en dos sentencias y el trigger corre dos veces. Degrada a WARNING: nunca bloquea la operacion. 0722-160: las OTs de encargos administrativos (funcion <> 1) no tienen pista de Riesgos, asi que no disparan wo.submitted_risk, wo.risk.resubmitted ni la reversion de Riesgos.';

CREATE OR REPLACE FUNCTION public.enforce_administrative_work_order_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_funcion smallint;
BEGIN
  SELECT funcion INTO v_funcion
    FROM public.engagements
   WHERE engagement_id = NEW.engagement_id;

  IF v_funcion IS NOT NULL AND v_funcion <> 1 THEN
    -- Las OTs administrativas pueden presupuestar gastos, pero no facturan ni
    -- pasan por Riesgos. Pending representa una pista no aplicable, no aprobada.
    NEW.risk_status := 'Pending';
    NEW.risk_approved_by := NULL;
    NEW.risk_approved_at := NULL;
    NEW.ceac_completed_at := NULL;
    NEW.ceac_notes := NULL;
    NEW.ceac_number := NULL;
    NEW.san_completed_at := NULL;
    NEW.san_notes := NULL;
    NEW.san_approval_id := NULL;
    NEW.risk_level := NULL;
    NEW.risk_notes := NULL;
    NEW.emergency_deadline_at := NULL;
    NEW.emergency_justification := NULL;
    NEW.emergency_review_by := NULL;
    NEW.emergency_review_at := NULL;
    NEW.emergency_partner_by := NULL;
    NEW.emergency_partner_at := NULL;

    -- Para administrativas, la firma del Socio cierra la OT sin una segunda
    -- aprobación. Cliente conserva el motor de dos pistas.
    IF TG_OP = 'UPDATE'
       AND NEW.approved_at IS NOT NULL
       AND OLD.approved_at IS NULL THEN
      NEW.approval_status := 'Approved';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_administrative_work_order_rules ON public.work_orders;
CREATE TRIGGER trg_enforce_administrative_work_order_rules
  BEFORE INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_administrative_work_order_rules();

-- Repara OTs administrativas creadas antes de instalar esta regla. El trigger
-- limpia los metadatos de Riesgos al ejecutar este update.
UPDATE public.work_orders wo
   SET risk_status = 'Pending'
  FROM public.engagements e
 WHERE e.engagement_id = wo.engagement_id
   AND e.funcion IS NOT NULL
   AND e.funcion <> 1
   AND (
     wo.risk_status IS DISTINCT FROM 'Pending'
     OR wo.risk_level IS NOT NULL
     OR wo.risk_approved_by IS NOT NULL
     OR wo.risk_approved_at IS NOT NULL
     OR wo.ceac_completed_at IS NOT NULL
     OR wo.ceac_notes IS NOT NULL
     OR wo.ceac_number IS NOT NULL
     OR wo.san_completed_at IS NOT NULL
     OR wo.san_notes IS NOT NULL
     OR wo.san_approval_id IS NOT NULL
     OR wo.risk_notes IS NOT NULL
     OR wo.emergency_deadline_at IS NOT NULL
     OR wo.emergency_justification IS NOT NULL
     OR wo.emergency_review_by IS NOT NULL
     OR wo.emergency_review_at IS NOT NULL
     OR wo.emergency_partner_by IS NOT NULL
     OR wo.emergency_partner_at IS NOT NULL
   );

-- Una OT administrativa histórica puede tener firma de Socio pero haber quedado
-- Pending esperando Riesgos. Al eliminar esa segunda pista, queda aprobada.
UPDATE public.work_orders wo
   SET approval_status = 'Approved'
  FROM public.engagements e
 WHERE e.engagement_id = wo.engagement_id
   AND e.funcion IS NOT NULL
   AND e.funcion <> 1
   AND wo.approval_status = 'Pending_Approval'
   AND wo.approved_at IS NOT NULL;

COMMENT ON FUNCTION public.enforce_administrative_work_order_rules() IS
  '0722-160: OTs administrativas omiten Riesgos; la aprobación del Socio las cierra.';

CREATE OR REPLACE FUNCTION public.list_administrative_engagements()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_can_see_history boolean;
  v_current_fiscal_year int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_can_see_history := public.has_permission('engagement.create');

  -- Espejo de getCurrentFiscalPeriod() (src/lib/fiscalCalculations.ts): el año
  -- fiscal corre de octubre a septiembre; de octubre en adelante ya es el
  -- fiscal del año calendario siguiente.
  --
  -- Review fix (Codex): en America/La_Paz y no en now() a secas. Supabase deja la base en UTC
  -- (ninguna migracion cambia el GUC TimeZone) y La Paz es UTC-4, asi que el 30 de septiembre
  -- entre las 20:00 y la medianoche hora local now() ya esta en octubre: el servidor adelantaba
  -- el corte cuatro horas y dejaba de devolver las filas del FY vigente mientras el navegador
  -- —que resuelve getCurrentFiscalPeriod() en hora local— seguia en el anterior. Mismo problema
  -- y misma solucion que 20260911100600_fecha_local_current_date.sql.
  v_current_fiscal_year := CASE
    WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/La_Paz')) >= 10
      THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/La_Paz'))::int + 1
    ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/La_Paz'))::int
  END;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'engagement_id', e.engagement_id,
          'engagement_code', e.engagement_code,
          'engagement_name', e.engagement_name,
          'funcion', e.funcion,
          'society_id', e.society_id,
          'society_name', s.name,
          'client_id', e.client_id,
          'client_name', c.client_legal_name,
          'oficina', e.oficina,
          'practica', e.practica,
          'practica_name', p.name,
          'anio_fiscal', e.anio_fiscal,
          'start_date', e.start_date,
          'end_date', e.end_date,
          'status', e.status
        )
        ORDER BY e.created_at DESC NULLS LAST, e.engagement_id
      )
        FROM public.engagements e
        JOIN public.clients c ON c.client_id = e.client_id
        JOIN public.society s ON s.society_id = e.society_id
        LEFT JOIN public.practicas p ON p.code = e.practica
       WHERE e.funcion <> 1
         AND (v_can_see_history OR (e.anio_fiscal IS NOT NULL AND e.anio_fiscal >= v_current_fiscal_year))
    ),
    '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.list_administrative_engagements() IS
  '0722-160: listado minimo de encargos Administrativa/Capacitacion/Calidad. Quien tiene engagement.create ve todo el historico; el resto solo ve anio_fiscal vigente o futuro (espejo server-side del filtro que antes vivia solo en el frontend). El corte del anio fiscal se calcula en America/La_Paz: con now() en UTC se adelantaba cuatro horas el 30 de septiembre. No concede acceso al detalle.';

REVOKE ALL ON FUNCTION public.list_administrative_engagements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_administrative_engagements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_administrative_engagements() TO service_role;

-- Review fix (Codex): hr_manager/hr_analyst reciben engagement.create justamente para crear
-- encargos Administrativa/Capacitacion (20260826221706), pero nunca recibieron client.read
-- (misma migracion). El selector de cliente interno de EngagementForm filtra sobre useClients(),
-- que corre bajo RLS -- para esos dos roles vuelve vacio, asi que no pueden completar client_id
-- y la creacion queda bloqueada pese a tener el permiso pensado para este flujo exacto.
-- Se resuelve con un RPC angosto (mismo patron que list_administrative_engagements): expone
-- solo los dos clientes internos controlados, nunca la cartera real, a cualquiera con
-- engagement.create -- evita ademas otorgar client.read de alcance amplio solo para esto.
CREATE OR REPLACE FUNCTION public.list_administrative_internal_clients()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'client_id', c.client_id,
        'client_legal_name', c.client_legal_name,
        'unique_tax_id', c.unique_tax_id,
        'is_active', c.is_active
      )
      ORDER BY c.client_legal_name
    ),
    '[]'::jsonb
  )
    FROM public.clients c
   WHERE c.unique_tax_id IN ('1006979026', '184046021')
     AND c.is_active
     AND public.has_permission('engagement.create');
$$;

COMMENT ON FUNCTION public.list_administrative_internal_clients() IS
  '0722-160: expone unicamente los dos clientes internos de sociedad (Pelaez/Jauregui) a quien tiene engagement.create, sin depender de client.read -- hr_manager/hr_analyst tienen engagement.create para este flujo pero no client.read, y otorgarles client.read general expondria la cartera completa en vez de solo los dos clientes controlados. Review fix (Greptile): filtra is_active ademas del NIT -- defensa en profundidad, independiente de que el DO block de arriba ya deba haber reactivado ambas filas canonicas.';

REVOKE ALL ON FUNCTION public.list_administrative_internal_clients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_administrative_internal_clients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_administrative_internal_clients() TO service_role;

-- Review fix (Codex): el trigger de arriba (enforce_administrative_work_order_rules) ya limpia
-- Riesgos en OTs administrativas segun su propio comentario ("no facturan ni pasan por Riesgos"),
-- pero el "no facturan" solo se aplicaba en la UI (WorkOrderForm oculta la pestana de plan de
-- pagos para isAdministrative). La policy "Manager can manage payment plans"
-- (20260908150000_0722-156b) solo chequea e.manager_id, sin mirar funcion -- un gerente de
-- encargo administrativo puede insertar wo_payment_plan/wo_payment_installments via llamada
-- directa. Este trigger cierra esa escritura a nivel de base, simetrico al de Riesgos.
CREATE OR REPLACE FUNCTION public.enforce_administrative_no_payment_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_funcion smallint;
BEGIN
  SELECT e.funcion INTO v_funcion
    FROM public.work_orders wo
    JOIN public.engagements e ON e.engagement_id = wo.engagement_id
   WHERE wo.wo_id = NEW.wo_id;

  IF v_funcion IS NOT NULL AND v_funcion <> 1 THEN
    RAISE EXCEPTION '0722-160: las OTs administrativas no facturan; no admiten plan de pagos';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_administrative_no_payment_plan() IS
  '0722-160: defensa en profundidad -- bloquea a nivel de base la escritura de wo_payment_plan para OTs administrativas; hasta ahora solo la UI ocultaba la pestana.';

DROP TRIGGER IF EXISTS trg_enforce_administrative_no_payment_plan ON public.wo_payment_plan;
CREATE TRIGGER trg_enforce_administrative_no_payment_plan
  BEFORE INSERT OR UPDATE ON public.wo_payment_plan
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_administrative_no_payment_plan();

-- Review fix (Codex): el guard de arriba solo cubre wo_payment_plan. wo_payment_installments
-- tiene su propia columna wo_id (denormalizada) y su propio RPC de escritura
-- (sync_wo_payment_installments, SECURITY DEFINER) -- ninguno de los dos pasa por
-- wo_payment_plan, asi que un plan administrativo que ya existiera antes de este fix (o una
-- llamada directa) podia seguir recibiendo cuotas. Guard simetrico sobre la tabla de cuotas.
CREATE OR REPLACE FUNCTION public.enforce_administrative_no_payment_installments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_funcion smallint;
BEGIN
  -- Se resuelve por NEW.wo_id y NO por NEW.plan_id -> wo_payment_plan.wo_id, aunque la fila
  -- lleve las dos referencias denormalizadas y la policy "Manager can manage payment
  -- installments" autorice solo por plan_id. Alcanza porque la igualdad entre las dos ya es
  -- invariante de la tabla: wo_payment_installments_guard_exchange_rate() rechaza todo INSERT
  -- con `plan.wo_id IS DISTINCT FROM NEW.wo_id` (INSTALLMENT_WO_MISMATCH,
  -- 20260910090000_0722-156b_fixed_mode_rate_guard.sql) y congela plan_id/wo_id en todo UPDATE.
  -- La suite cubre las dos entradas -- cuota cruzada y wo_id administrativo directo -- para que
  -- el dia que ese guard cambie, esto falle en vez de degradarse en silencio.
  SELECT e.funcion INTO v_funcion
    FROM public.work_orders wo
    JOIN public.engagements e ON e.engagement_id = wo.engagement_id
   WHERE wo.wo_id = NEW.wo_id;

  IF v_funcion IS NOT NULL AND v_funcion <> 1 THEN
    RAISE EXCEPTION '0722-160: las OTs administrativas no facturan; no admiten cuotas de plan de pagos';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_administrative_no_payment_installments() IS
  '0722-160: defensa en profundidad, simetrica a enforce_administrative_no_payment_plan pero sobre wo_payment_installments -- cierra el camino de sync_wo_payment_installments() y de un plan administrativo preexistente al que ya no se le pueden agregar cuotas nuevas. Resuelve la funcion por NEW.wo_id; la igualdad con wo_payment_plan.wo_id ya la garantiza wo_payment_installments_guard_exchange_rate() (INSTALLMENT_WO_MISMATCH).';

DROP TRIGGER IF EXISTS trg_enforce_administrative_no_payment_installments ON public.wo_payment_installments;
CREATE TRIGGER trg_enforce_administrative_no_payment_installments
  BEFORE INSERT OR UPDATE ON public.wo_payment_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_administrative_no_payment_installments();

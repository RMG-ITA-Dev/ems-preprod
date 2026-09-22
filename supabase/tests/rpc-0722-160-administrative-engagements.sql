-- 0722-160: clientes internos, reglas de escritura y listado consultivo de
-- encargos Administrativa/Capacitacion/Control de Calidad.

BEGIN;

DO $$
DECLARE
  v_pelaez_society uuid;
  v_juaregui_society uuid;
  v_pelaez_client uuid;
  v_juaregui_client uuid;
  v_engagement uuid;
  v_legacy_engagement uuid;
  v_pre_trigger uuid;
  v_client_wo uuid;
  v_admin_plan uuid;
  v_move_target uuid;
  v_historical uuid;
  v_work_order uuid;
  v_payload jsonb;
  -- Review fix (Codex): el anio fiscal del fixture NO puede ir hardcodeado. El JWT de mas abajo
  -- no tiene fila en user_roles, asi que cae en la rama consultiva de
  -- list_administrative_engagements(), que filtra `anio_fiscal >= FY vigente`. Con 2026 fijo el
  -- test pasaba hoy y empezaba a fallar solo el 2026-10-01, cuando el FY vigente salta a 2027.
  -- Se deriva con la misma regla (y la misma zona horaria) que la RPC.
  v_fiscal_year int := CASE
    WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/La_Paz')) >= 10
      THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/La_Paz'))::int + 1
    ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/La_Paz'))::int
  END;
BEGIN
  SELECT society_id INTO v_pelaez_society
    FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.';
  SELECT society_id INTO v_juaregui_society
    FROM public.society WHERE name = 'Ruizmier Jauregui S.R.L.';
  SELECT client_id INTO v_pelaez_client
    FROM public.clients WHERE unique_tax_id = '1006979026';
  SELECT client_id INTO v_juaregui_client
    FROM public.clients WHERE unique_tax_id = '184046021';

  IF v_pelaez_society IS NULL OR v_juaregui_society IS NULL
     OR v_pelaez_client IS NULL OR v_juaregui_client IS NULL THEN
    RAISE EXCEPTION '0722-160 fixture missing internal society/client mapping';
  END IF;

  INSERT INTO public.engagements (
    client_id, engagement_name, start_date, end_date, status, oficina, practica,
    funcion, anio_fiscal, work_order_required, activity_required, is_internal,
    approval_required, fecha_cierre, society_id
  ) VALUES (
    v_pelaez_client, '0722-160 Administrative fixture', DATE '2026-09-01', DATE '2026-09-30',
    'active', 1, 1, 0, v_fiscal_year, true, true, false, true, DATE '2026-09-30', v_pelaez_society
  ) RETURNING engagement_id INTO v_engagement;

  IF NOT EXISTS (
    SELECT 1 FROM public.engagements
     WHERE engagement_id = v_engagement
       AND is_internal = true
       AND activity_required = false
  ) THEN
    RAISE EXCEPTION '0722-160 administrative trigger did not force internal/activity policy';
  END IF;

  INSERT INTO public.work_orders (
    engagement_id, currency, season_mode, risk_status, risk_level
  ) VALUES (
    v_engagement, 'BOB', 'High', 'Pending', 'Alto'
  ) RETURNING wo_id INTO v_work_order;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_orders
     WHERE wo_id = v_work_order
       AND risk_status = 'Pending'
       AND risk_level IS NULL
       AND risk_approved_by IS NULL
  ) THEN
    RAISE EXCEPTION '0722-160 administrative work order did not bypass risk evaluation';
  END IF;

  -- Dos sentencias, como la app: useSubmitWorkOrder envia y useApproveWorkOrder firma despues.
  -- El cierre automatico exige que la OT YA este en Pending_Approval.
  UPDATE public.work_orders SET approval_status = 'Pending_Approval' WHERE wo_id = v_work_order;
  UPDATE public.work_orders SET approved_at = now() WHERE wo_id = v_work_order;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_orders
     WHERE wo_id = v_work_order
       AND approval_status = 'Approved'
       AND risk_status = 'Pending'
  ) THEN
    RAISE EXCEPTION '0722-160 administrative work order did not close with partner approval only';
  END IF;

  -- Una OT en Draft NO se cierra escribiendo approved_at: eso salteaba el envio y la aprobacion
  -- del Socio de un saque. El cierre automatico solo aplica viniendo de Pending_Approval.
  UPDATE public.work_orders
     SET approval_status = 'Draft', approved_by = NULL, approved_at = NULL
   WHERE wo_id = v_work_order;
  UPDATE public.work_orders SET approved_at = now() WHERE wo_id = v_work_order;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_orders
     WHERE wo_id = v_work_order AND approval_status = 'Draft'
  ) THEN
    RAISE EXCEPTION '0722-160 una OT administrativa en Draft se cerro con solo escribir approved_at';
  END IF;

  -- Se vuelve al camino normal para lo que sigue.
  UPDATE public.work_orders
     SET approval_status = 'Draft', approved_by = NULL, approved_at = NULL
   WHERE wo_id = v_work_order;
  UPDATE public.work_orders SET approval_status = 'Pending_Approval' WHERE wo_id = v_work_order;
  UPDATE public.work_orders SET approved_at = now() WHERE wo_id = v_work_order;

  -- Retiro tras la firma. useUnsubmitWorkOrder escribe approval_status='Draft' y NO limpia
  -- approved_at; para una administrativa esa firma vieja rompe el unico cierre que tiene, porque
  -- la re-aprobacion deja de ser la transicion NULL -> no NULL que dispara el trigger y la OT
  -- queda varada en Pending_Approval. El trigger la limpia al volver a Draft.
  UPDATE public.work_orders SET approval_status = 'Draft' WHERE wo_id = v_work_order;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_orders
     WHERE wo_id = v_work_order
       AND approval_status = 'Draft'
       AND approved_at IS NULL
       AND approved_by IS NULL
  ) THEN
    RAISE EXCEPTION '0722-160 el retiro dejo la firma del Socio pegada en una OT administrativa';
  END IF;

  -- Y con la firma limpia, reenvio + nueva firma vuelve a cerrarla.
  UPDATE public.work_orders SET approval_status = 'Pending_Approval' WHERE wo_id = v_work_order;
  UPDATE public.work_orders SET approved_at = now() WHERE wo_id = v_work_order;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_orders
     WHERE wo_id = v_work_order AND approval_status = 'Approved'
  ) THEN
    RAISE EXCEPTION '0722-160 una OT administrativa reenviada tras un retiro no volvio a cerrarse';
  END IF;

  -- Y la reparacion de datos para las filas que YA llegaron asi (retiradas antes de instalar el
  -- trigger). Se reproduce ese estado con el trigger apagado y se corre la misma sentencia de la
  -- migracion, que ademas debe ser idempotente.
  ALTER TABLE public.work_orders DISABLE TRIGGER trg_enforce_administrative_work_order_rules;
  UPDATE public.work_orders
     SET approval_status = 'Draft', approved_at = now()
   WHERE wo_id = v_work_order;
  ALTER TABLE public.work_orders ENABLE TRIGGER trg_enforce_administrative_work_order_rules;

  UPDATE public.work_orders wo
     SET approved_by = NULL,
         approved_at = NULL
    FROM public.engagements e
   WHERE e.engagement_id = wo.engagement_id
     AND e.funcion IS NOT NULL
     AND e.funcion <> 1
     AND wo.approval_status = 'Draft'
     AND (wo.approved_at IS NOT NULL OR wo.approved_by IS NOT NULL);

  IF EXISTS (
    SELECT 1
      FROM public.work_orders wo
      JOIN public.engagements e ON e.engagement_id = wo.engagement_id
     WHERE e.funcion IS NOT NULL
       AND e.funcion <> 1
       AND wo.approval_status = 'Draft'
       AND (wo.approved_at IS NOT NULL OR wo.approved_by IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '0722-160 quedaron OTs administrativas en Draft con firma de Socio vieja';
  END IF;

  -- La suite sigue asumiendo una OT administrativa cerrada (el plan de pagos de mas abajo).
  UPDATE public.work_orders SET approval_status = 'Pending_Approval' WHERE wo_id = v_work_order;
  UPDATE public.work_orders SET approved_at = now() WHERE wo_id = v_work_order;

  BEGIN
    INSERT INTO public.engagements (
      client_id, engagement_name, start_date, end_date, status, oficina, practica,
      funcion, anio_fiscal, work_order_required, activity_required, is_internal,
      approval_required, fecha_cierre, society_id
    ) VALUES (
      v_juaregui_client, '0722-160 Wrong society fixture', DATE '2026-09-01', DATE '2026-09-30',
      'active', 1, 1, 2, 2026, true, false, true, true, DATE '2026-09-30', v_pelaez_society
    );
    RAISE EXCEPTION '0722-160 accepted a client from another society';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '0722-160: el cliente interno debe corresponder a la sociedad del encargo' THEN
      RAISE;
    END IF;
  END;

  -- `funcion` es inmutable tras crear. Sin el guard, un PATCH directo por PostgREST bajo la
  -- policy "Team can update engagements" convertia un encargo Cliente aprobado en 0/2/3 sin
  -- normalizar sus OTs: la aprobacion de Riesgos, el plan de pagos y las cuotas quedaban vivas
  -- mientras la UI ya las escondia por la funcion nueva.
  BEGIN
    UPDATE public.engagements SET funcion = 2 WHERE engagement_id = v_engagement;
    RAISE EXCEPTION '0722-160 accepted a funcion change after create';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '0722-160: la funcion del encargo no se puede cambiar despues de crearlo' THEN
      RAISE;
    END IF;
  END;

  -- Unica excepcion: clasificar una fila legacy (funcion NULL) como Cliente. Todo el sistema ya
  -- la lee asi via COALESCE(funcion, 1) = 1, de modo que el UPDATE no cambia comportamiento.
  INSERT INTO public.engagements (
    client_id, engagement_name, start_date, end_date, status, oficina, practica,
    funcion, anio_fiscal, work_order_required, activity_required, is_internal,
    approval_required, fecha_cierre, society_id
  ) VALUES (
    v_pelaez_client, '0722-160 Legacy funcion fixture', DATE '2026-09-01', DATE '2026-09-30',
    'active', 1, 1, NULL, v_fiscal_year, true, true, false, true, DATE '2026-09-30', v_pelaez_society
  ) RETURNING engagement_id INTO v_legacy_engagement;

  UPDATE public.engagements SET funcion = 1 WHERE engagement_id = v_legacy_engagement;

  IF NOT EXISTS (
    SELECT 1 FROM public.engagements WHERE engagement_id = v_legacy_engagement AND funcion = 1
  ) THEN
    RAISE EXCEPTION '0722-160 blocked the legacy NULL -> 1 funcion classification';
  END IF;

  -- Y una vez clasificada, ya no se puede volver a mover.
  BEGIN
    UPDATE public.engagements SET funcion = 0 WHERE engagement_id = v_legacy_engagement;
    RAISE EXCEPTION '0722-160 accepted a funcion change on a just-classified legacy row';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '0722-160: la funcion del encargo no se puede cambiar despues de crearlo' THEN
      RAISE;
    END IF;
  END;

  -- Cuotas cruzadas: wo_payment_installments guarda `wo_id` denormalizado ADEMAS de `plan_id`, y
  -- la policy "Manager can manage payment installments" autoriza solo por plan_id. Un INSERT
  -- directo puede entonces declarar el plan administrativo y el wo_id de una OT de Cliente, y
  -- enforce_administrative_no_payment_installments() resuelve la funcion por NEW.wo_id, asi que
  -- no lo ve. Ese camino lo cierra el guard de 156b, que exige que las dos referencias coincidan.
  -- Esta asercion fija esa dependencia: si INSTALLMENT_WO_MISMATCH desaparece, falla aca en vez
  -- de dejar entrar una cuota facturable colgada de un plan administrativo.
  INSERT INTO public.work_orders (engagement_id, currency, season_mode)
  VALUES (v_legacy_engagement, 'BOB', 'High')
  RETURNING wo_id INTO v_client_wo;

  -- Una OT no cambia de encargo. Las tablas de facturacion cuelgan de `wo_id`, asi que mover una
  -- OT de Cliente a un encargo administrativo dejaba su plan de pagos y sus cuotas vivas: los
  -- guards por funcion son BEFORE INSERT OR UPDATE sobre SUS tablas y no corren si nadie las
  -- escribe.
  --
  -- El destino tiene que ser un encargo administrativo SIN OT: work_orders lleva
  -- UNIQUE (engagement_id) (cero_03), asi que mover hacia uno que ya tiene OT lo frena esa
  -- constraint y no este guard -- y entonces la asercion no probaria nada. El caso real es
  -- justamente el encargo administrativo recien creado, que todavia no tiene la suya.
  --
  -- Va dos anios fiscales atras a proposito: la rama consultiva de
  -- list_administrative_engagements() corta por `anio_fiscal >= FY vigente`, y una fila mas en el
  -- FY actual rompe la asercion de "exactamente 1 fila" de mas abajo.
  INSERT INTO public.engagements (
    client_id, engagement_name, start_date, end_date, status, oficina, practica,
    funcion, anio_fiscal, work_order_required, activity_required, is_internal,
    approval_required, fecha_cierre, society_id
  ) VALUES (
    v_pelaez_client, '0722-160 Move target fixture', DATE '2024-09-01', DATE '2024-09-30',
    'active', 1, 1, 2, v_fiscal_year - 2, true, true, false, true, DATE '2024-09-30', v_pelaez_society
  ) RETURNING engagement_id INTO v_move_target;

  BEGIN
    UPDATE public.work_orders SET engagement_id = v_move_target WHERE wo_id = v_client_wo;
    RAISE EXCEPTION '0722-160 accepted moving a work order to another engagement';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'WO_ENGAGEMENT_IMMUTABLE:%' THEN
      RAISE;
    END IF;
  END;

  -- Y un UPDATE que no toca engagement_id sigue pasando.
  UPDATE public.work_orders SET notes = '0722-160 touch' WHERE wo_id = v_client_wo;

  -- Plan administrativo "preexistente": se siembra con el guard apagado, que es exactamente el
  -- estado de una base actualizada desde antes de esta migracion.
  ALTER TABLE public.wo_payment_plan DISABLE TRIGGER trg_enforce_administrative_no_payment_plan;
  ALTER TABLE public.wo_payment_plan DISABLE TRIGGER trg_wo_payment_plan_guard_exchange_rate;
  INSERT INTO public.wo_payment_plan (wo_id, payment_days)
  VALUES (v_work_order, 30)
  RETURNING plan_id INTO v_admin_plan;
  ALTER TABLE public.wo_payment_plan ENABLE TRIGGER trg_wo_payment_plan_guard_exchange_rate;
  ALTER TABLE public.wo_payment_plan ENABLE TRIGGER trg_enforce_administrative_no_payment_plan;

  BEGIN
    INSERT INTO public.wo_payment_installments (plan_id, wo_id, installment_number, percentage)
    VALUES (v_admin_plan, v_client_wo, 1, 100);
    RAISE EXCEPTION '0722-160 accepted an installment on an administrative plan via a client wo_id';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INSTALLMENT_WO_MISMATCH: el wo_id de la cuota no coincide con el de su plan de pagos' THEN
      RAISE;
    END IF;
  END;

  -- Y el camino directo (wo_id administrativo) sigue bloqueado.
  BEGIN
    INSERT INTO public.wo_payment_installments (plan_id, wo_id, installment_number, percentage)
    VALUES (v_admin_plan, v_work_order, 1, 100);
    RAISE EXCEPTION '0722-160 accepted an installment on an administrative work order';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '0722-160: las OTs administrativas no facturan; no admiten cuotas de plan de pagos' THEN
      RAISE;
    END IF;
  END;

  -- Fila historica: mismo cliente interno y misma sociedad, dos anios fiscales atras. Sin ella la
  -- asercion "exactamente 1 fila" se cumplia sola, porque no habia ninguna otra fila que filtrar;
  -- con ella, el corte por anio fiscal de la rama consultiva queda realmente ejercitado.
  INSERT INTO public.engagements (
    client_id, engagement_name, start_date, end_date, status, oficina, practica,
    funcion, anio_fiscal, work_order_required, activity_required, is_internal,
    approval_required, fecha_cierre, society_id
  ) VALUES (
    v_pelaez_client, '0722-160 Historical fixture', DATE '2024-09-01', DATE '2024-09-30',
    'active', 1, 1, 0, v_fiscal_year - 2, true, true, false, true, DATE '2024-09-30', v_pelaez_society
  ) RETURNING engagement_id INTO v_historical;

  -- Backfill de filas historicas: un encargo con funcion 0/2/3 creado ANTES de esta migracion
  -- se quedaba con el default `is_internal = false`, y useApprovedEngagements (Tracker) excluye
  -- por `is_internal`, no por `funcion` -- seguia siendo seleccionable para cargar horas. Se
  -- simula esa fila apagando el trigger (que es justo lo que no existia entonces) y se corre la
  -- misma sentencia que la migracion, que ademas debe ser idempotente.
  ALTER TABLE public.engagements DISABLE TRIGGER trg_enforce_administrative_engagement_rules;
  INSERT INTO public.engagements (
    client_id, engagement_name, start_date, end_date, status, oficina, practica,
    funcion, anio_fiscal, work_order_required, activity_required, is_internal,
    approval_required, fecha_cierre, society_id
  ) VALUES (
    v_pelaez_client, '0722-160 Pre-trigger fixture', DATE '2024-09-01', DATE '2024-09-30',
    'active', 1, 1, 0, v_fiscal_year - 2, true, true, false, true, DATE '2024-09-30', v_pelaez_society
  ) RETURNING engagement_id INTO v_pre_trigger;
  ALTER TABLE public.engagements ENABLE TRIGGER trg_enforce_administrative_engagement_rules;

  IF NOT EXISTS (
    SELECT 1 FROM public.engagements
     WHERE engagement_id = v_pre_trigger AND is_internal = false AND activity_required = true
  ) THEN
    RAISE EXCEPTION '0722-160 pre-trigger fixture did not reproduce the historical state';
  END IF;

  -- Copia literal del UPDATE de la migracion (no hay forma de re-ejecutar solo esa sentencia).
  UPDATE public.engagements
     SET is_internal = true,
         activity_required = false
   WHERE funcion IS NOT NULL
     AND funcion <> 1
     AND (is_internal IS DISTINCT FROM true OR activity_required IS DISTINCT FROM false);

  IF NOT EXISTS (
    SELECT 1 FROM public.engagements
     WHERE engagement_id = v_pre_trigger AND is_internal = true AND activity_required = false
  ) THEN
    RAISE EXCEPTION '0722-160 backfill did not normalize a pre-trigger administrative row';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.engagements
     WHERE funcion IS NOT NULL AND funcion <> 1
       AND (is_internal IS DISTINCT FROM true OR activity_required IS DISTINCT FROM false)
  ) THEN
    RAISE EXCEPTION '0722-160 administrative rows left with is_internal/activity_required drift';
  END IF;

  IF public.list_administrative_engagements() <> '[]'::jsonb THEN
    RAISE EXCEPTION '0722-160 list leaked rows without an authenticated caller';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'a0722160-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
    true
  );
  v_payload := public.list_administrative_engagements();
  IF jsonb_array_length(v_payload) <> 1
     OR (v_payload -> 0 ->> 'engagement_id')::uuid <> v_engagement
     OR v_payload -> 0 ->> 'society_name' <> 'Ruizmier Pelaez S.R.L.'
     OR (v_payload -> 0 ->> 'funcion')::smallint <> 0 THEN
    RAISE EXCEPTION '0722-160 administrative list did not return the expected minimal row';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_payload) AS elem
     WHERE (elem ->> 'engagement_id')::uuid = v_historical
  ) THEN
    RAISE EXCEPTION '0722-160 administrative list leaked a historical row to a read-only caller';
  END IF;

  RAISE NOTICE '0722-160: internal client mapping, trigger and authenticated list passed';
END
$$;

ROLLBACK;

\echo 'ADMINISTRATIVE ENGAGEMENTS: ALL CHECKS PASSED'

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

  UPDATE public.work_orders
     SET approval_status = 'Pending_Approval',
         approved_at = now()
   WHERE wo_id = v_work_order;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_orders
     WHERE wo_id = v_work_order
       AND approval_status = 'Approved'
       AND risk_status = 'Pending'
  ) THEN
    RAISE EXCEPTION '0722-160 administrative work order did not close with partner approval only';
  END IF;

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

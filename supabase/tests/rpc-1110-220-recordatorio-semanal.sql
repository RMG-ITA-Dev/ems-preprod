-- 1110-220 (D10) — el recordatorio semanal approval.reminder.weekly incluye las líneas de horas que el destinatario
-- tiene que APROBAR (contador `por_aprobar`), no solo sus semanas propias pendientes (`lineas`).
--
-- Por qué: el contador `lineas` cuenta las semanas que el destinatario ENVIÓ (notif_agg_timesheet_pending_approval filtra
-- por tp.staff_id). Ningún aprobador recibía por correo lo que tenía pendiente de aprobar; si no abría la app y no vio el
-- aviso del momento (timesheet.team_submitted_for_approval), nada se lo recordaba.
--
-- Corre desde supabase/tests/local/run-rls-tests.sh. Transacción única, SIEMPRE hace ROLLBACK.
-- Salida de éxito: una NOTICE por chequeo y "1110-220 RECORDATORIO SEMANAL: ALL CHECKS PASSED (rolled back)".
--
-- Fixture (prefijo 1103): M manager con dos líneas asignadas (una dentro de la ventana, otra fuera) · M2 manager sin
-- nada pendiente · X assistant que envió la semana. Todos con correo.

BEGIN;

INSERT INTO auth.users (id) VALUES
  ('a1103000-0000-4000-8000-000000000001'), ('a1103000-0000-4000-8000-000000000002'),
  ('a1103000-0000-4000-8000-000000000003');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a1103000-0000-4000-8000-000000000001', 'manager', 'manager'),
  ('a1103000-0000-4000-8000-000000000002', 'manager', 'manager'),
  ('a1103000-0000-4000-8000-000000000003', 'staff',   'assistant')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, email, is_active, practica_id, society_id)
SELECT ('51103000-0000-4000-8000-00000000000' || n)::uuid, ('a1103000-0000-4000-8000-00000000000' || n)::uuid,
       'U' || n, 'R1103', 'r1103-' || n || '@ruizmier.com', true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.')
FROM (VALUES ('1'), ('2'), ('3')) AS v(n);

INSERT INTO public.clients (client_id, client_legal_name, tax_id, is_active) VALUES
  ('c1103000-0000-4000-8000-000000000001', 'R1103 Cliente', 'R1103-TAX-001', true);

INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id)
VALUES ('R1103-ACT', 'Harness Activity 1110-220 recordatorio', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;

-- Semana dentro de la ventana (la anterior a la actual) y semana fuera de ella (12 semanas atrás; la ventana por
-- defecto es de 4). El encargo y las aprobaciones se siembran como dueño con los triggers de réplica apagados.
SET LOCAL session_replication_role = replica;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, funcion, fecha_cierre,
                                start_date, end_date, approval_required, manager_id, society_id)
VALUES ('e1103000-0000-4000-8000-000000000001', 'c1103000-0000-4000-8000-000000000001', 'R1103 E', 'R1103-E', 1,
        '2099-12-31', '2020-01-06', '2099-06-30', true, '51103000-0000-4000-8000-000000000001',
        (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'));

INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year, submitted_at)
SELECT p.id::uuid, '51103000-0000-4000-8000-000000000003', p.ws,
       extract(week FROM p.ws)::int, extract(isoyear FROM p.ws)::int, now()
  FROM (VALUES
    ('b1103000-0000-4000-8000-000000000001', (date_trunc('week', (now() AT TIME ZONE 'America/La_Paz'))::date - 7)),
    ('b1103000-0000-4000-8000-000000000002', (date_trunc('week', (now() AT TIME ZONE 'America/La_Paz'))::date - 84))
  ) AS p(id, ws);

INSERT INTO public.timesheet_line_approvals (period_id, engagement_id, activity_id, status, approved_by)
SELECT p.id::uuid, 'e1103000-0000-4000-8000-000000000001',
       (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'R1103-ACT'),
       'pending', '51103000-0000-4000-8000-000000000001'
  FROM (VALUES ('b1103000-0000-4000-8000-000000000001'), ('b1103000-0000-4000-8000-000000000002')) AS p(id);
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  c_m   constant uuid := '51103000-0000-4000-8000-000000000001';
  c_m2  constant uuid := '51103000-0000-4000-8000-000000000002';
  c_x   constant uuid := '51103000-0000-4000-8000-000000000003';
  v_agg jsonb;
  v_pl  jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);

  -- 1. El contador nuevo: solo las líneas asignadas al aprobador, dentro de la ventana.
  v_agg := public.notif_agg_timesheet_lines_to_approve(c_m, public.notif_timesheet_window_start());
  IF (v_agg ->> 'count')::int <> 1 THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — el aprobador debía tener 1 línea por aprobar en la ventana (tiene %)', v_agg;
  END IF;
  IF NOT (v_agg -> 'items' -> 0 -> 'cots') ? 'R1103-E' THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — el detalle debía traer el código del encargo (%)', v_agg;
  END IF;
  IF (public.notif_agg_timesheet_lines_to_approve(c_x, public.notif_timesheet_window_start()) ->> 'count')::int <> 0 THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — quien envió la semana no tiene líneas por aprobar';
  END IF;
  -- No-vacuidad de la ventana: sin recorte, cuenta también la línea vieja.
  IF (public.notif_agg_timesheet_lines_to_approve(c_m, '2000-01-03') ->> 'count')::int <> 2 THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — sin ventana debían contar las 2 líneas del fixture';
  END IF;
  RAISE NOTICE 'PASS — notif_agg_timesheet_lines_to_approve cuenta por approved_by, en pending, dentro de la ventana';

  -- 2. Una línea aprobada deja de contar.
  UPDATE public.timesheet_line_approvals SET status = 'approved'
   WHERE period_id = 'b1103000-0000-4000-8000-000000000001';
  IF (public.notif_agg_timesheet_lines_to_approve(c_m, public.notif_timesheet_window_start()) ->> 'count')::int <> 0 THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — una línea aprobada siguió contando';
  END IF;
  UPDATE public.timesheet_line_approvals SET status = 'pending'
   WHERE period_id = 'b1103000-0000-4000-8000-000000000001';
  RAISE NOTICE 'PASS — una línea aprobada sale del contador';

  -- 3. El emisor semanal.
  PERFORM public.notif_emit_approval_reminder_weekly();

  SELECT payload INTO v_pl FROM public.notification_emails
   WHERE type_key = 'approval.reminder.weekly' AND recipient_staff_id = c_m;
  IF v_pl IS NULL THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — el aprobador con líneas pendientes no recibió el recordatorio semanal';
  END IF;
  IF (v_pl -> 'por_aprobar' ->> 'count')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — el payload del aprobador debía traer por_aprobar = 1 (%)', v_pl;
  END IF;
  IF v_pl ? 'sin_ruta' THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — el aprobador perdió el botón a /timesheet/approvals';
  END IF;

  -- El que envió la semana recibe su recordatorio por `lineas` (sus semanas esperando), sin `por_aprobar`.
  SELECT payload INTO v_pl FROM public.notification_emails
   WHERE type_key = 'approval.reminder.weekly' AND recipient_staff_id = c_x;
  IF v_pl IS NULL OR COALESCE((v_pl -> 'lineas' ->> 'count')::int, 0) < 1
     OR (v_pl -> 'por_aprobar') IS NOT NULL AND v_pl -> 'por_aprobar' <> 'null'::jsonb THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — el asistente debía recibir solo sus semanas propias (%)', v_pl;
  END IF;

  -- Sin nada pendiente, no hay correo (CONTINUE WHEN v_total = 0 sigue valiendo).
  IF EXISTS (SELECT 1 FROM public.notification_emails
              WHERE type_key = 'approval.reminder.weekly' AND recipient_staff_id = c_m2) THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — un gerente sin nada pendiente recibió el recordatorio';
  END IF;
  RAISE NOTICE 'PASS — emisor: el aprobador recibe por_aprobar con botón; el asistente solo sus semanas; sin pendientes no hay correo';

  -- 4. El permiso del botón sigue al contador, con por_aprobar primero (espejo de DESTINOS_POR_CONCEPTO).
  IF public.notif_permiso_de_ruta('approval.reminder.weekly', 'timesheet_approval',
       '{"por_aprobar": {"count": 2}, "lineas": {"count": 1}}'::jsonb) IS DISTINCT FROM 'timesheet_approval.read' THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — con por_aprobar el permiso debía ser timesheet_approval.read';
  END IF;
  IF public.notif_permiso_de_ruta('approval.reminder.weekly', 'timesheet_approval',
       '{"por_aprobar": {"count": 0}, "lineas": {"count": 1}}'::jsonb) IS DISTINCT FROM 'timesheet.read' THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — un por_aprobar en cero decidió el permiso';
  END IF;
  RAISE NOTICE 'PASS — notif_permiso_de_ruta: por_aprobar tiene prioridad y en cero no cuenta';

  -- 5. Privilegios: el contador recibe un staff_id, así que no es para el cliente (regla del bloque G.6).
  IF has_function_privilege('authenticated', 'public.notif_agg_timesheet_lines_to_approve(uuid, date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.notif_agg_timesheet_lines_to_approve(uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION '1110-220 RECORDATORIO FAIL — notif_agg_timesheet_lines_to_approve no debe ser ejecutable por anon/authenticated';
  END IF;
  RAISE NOTICE 'PASS — el contador nuevo no es ejecutable por anon ni authenticated';
END $$;

DO $$ BEGIN RAISE NOTICE '1110-220 RECORDATORIO SEMANAL: ALL CHECKS PASSED (rolled back)'; END $$;

ROLLBACK;

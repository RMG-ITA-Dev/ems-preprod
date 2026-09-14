-- Tests transaccionales de la bandeja de salida de correos (migración 04).
--
-- Por qué existe: `notify_staff()` pasó a tener dos salidas y una compuerta nueva. La propiedad
-- que hay que sostener es que el correo sale SOLO cuando se dan las tres condiciones —tipo
-- marcado, destinatario con correo cargado, alcance distinto de `firm`— y que un cron que corre
-- dos veces no manda el mismo correo dos veces. Si cualquiera de las dos cede, se rompe en
-- silencio: nadie mira una tabla que "anda".
--
-- Se corre desde supabase/tests/local/run-rls-tests.sh. Transacción única, SIEMPRE ROLLBACK.
-- Salida de éxito: una NOTICE por chequeo, terminando en 'NOTIFICACIONES CORREOS: ALL CHECKS PASSED'.
--
-- Fixtures (sufijo ...9c<n>):
--   S_OWN   manager con correo      — alcance `own` en auth.role.changed: DEBE recibir correo
--   S_FIRM  admin con correo        — alcance `firm` en el MISMO tipo: NO debe recibirlo
--   S_NOMAIL manager sin correo     — no hay a dónde mandarlo

BEGIN;

-- ── Fixtures ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a9c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'correo-test-' || n || '@ruizmier.com', 'x', now(), now(), now(),
           '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 3) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a9c00000-0000-4000-8000-000000000001', 'manager', 'manager'),
  ('a9c00000-0000-4000-8000-000000000002', 'admin',   'admin'),
  ('a9c00000-0000-4000-8000-000000000003', 'manager', 'manager')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, email, is_active,
                          practica_id, society_id, weekly_capacity_hours, hire_date, city)
VALUES
  ('59c00000-0000-4000-8000-000000000001', 'a9c00000-0000-4000-8000-000000000001',
   'CORREO', 'Own', 'own@ruizmier.com', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59c00000-0000-4000-8000-000000000002', 'a9c00000-0000-4000-8000-000000000002',
   'CORREO', 'Firm', 'firm@ruizmier.com', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59c00000-0000-4000-8000-000000000003', 'a9c00000-0000-4000-8000-000000000003',
   'CORREO', 'SinMail', NULL, true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz');

-- ── Grupo 18 ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n        integer;
  v_id       uuid;
  v_dedupe   text;
  v_reclamados integer;
  v_email_id uuid;
  v_estado   text;
  v_intentos integer;
  v_ok       boolean;
  c_own    constant uuid := '59c00000-0000-4000-8000-000000000001';
  c_firm   constant uuid := '59c00000-0000-4000-8000-000000000002';
  c_nomail constant uuid := '59c00000-0000-4000-8000-000000000003';
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.notification_emails;
  DELETE FROM public.notifications;

  -- 18.a El seed trae la bandera, y la trae para los tipos que decidió D-44.
  SELECT COUNT(*) INTO v_n FROM public.notification_types WHERE email_enabled;
  IF v_n <> 27 THEN
    RAISE EXCEPTION 'TEST FAIL - hay % tipos con email_enabled, se esperaban 27', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n
    FROM public.notification_types
   WHERE email_enabled AND delivery = 'email';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'TEST FAIL - hay % recordatorios (delivery=email con correo), se esperaban 4', v_n;
  END IF;
  RAISE NOTICE 'PASS - el seed trae 27 tipos con correo, 4 de ellos recordatorios';

  -- 18.b Un tipo marcado, con destinatario de alcance `own`: campana Y correo.
  v_id := public.notify_staff('auth.role.changed', c_own, 'ent-1', '{}'::jsonb);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - no se creo la notificacion de campana';
  END IF;
  SELECT COUNT(*) INTO v_n
    FROM public.notification_emails
   WHERE recipient_staff_id = c_own AND type_key = 'auth.role.changed';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - se encolaron % correos para el alcance own, se esperaba 1', v_n;
  END IF;
  -- El correo sale de staff.email, y la clave de idempotencia es el id de la notificacion.
  SELECT COUNT(*) INTO v_n
    FROM public.notification_emails
   WHERE notification_id = v_id
     AND to_email = 'own@ruizmier.com'
     AND dedupe_key = v_id::text
     AND status = 'pending';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la fila encolada no quedo bien formada';
  END IF;
  RAISE NOTICE 'PASS - alcance own: deja campana y encola correo';

  -- 18.c El MISMO tipo, con alcance `firm`: campana si, correo no.
  --      Es la regla que reemplaza a marcar 419 celdas rol x tipo.
  v_id := public.notify_staff('auth.role.changed', c_firm, 'ent-1', '{}'::jsonb);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - el alcance firm dejo de recibir la campana';
  END IF;
  SELECT COUNT(*) INTO v_n
    FROM public.notification_emails WHERE recipient_staff_id = c_firm;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el alcance firm recibio correo (% filas)', v_n;
  END IF;
  RAISE NOTICE 'PASS - alcance firm: campana si, correo no';

  -- 18.d Sin staff.email no hay a donde mandarlo, y no se encola una fila rota.
  v_id := public.notify_staff('auth.role.changed', c_nomail, 'ent-1', '{}'::jsonb);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - quien no tiene correo dejo de recibir la campana';
  END IF;
  SELECT COUNT(*) INTO v_n
    FROM public.notification_emails WHERE recipient_staff_id = c_nomail;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - se encolo un correo sin direccion';
  END IF;
  RAISE NOTICE 'PASS - sin staff.email no se encola nada';

  -- 18.e Un tipo NO marcado no manda correo, por mas que el destinatario lo tenga.
  v_id := public.notify_staff('client.created', c_own, 'cli-1', '{}'::jsonb);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - client.created dejo de llegar a la campana';
  END IF;
  SELECT COUNT(*) INTO v_n
    FROM public.notification_emails WHERE type_key = 'client.created';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - un tipo sin email_enabled encolo correo';
  END IF;
  RAISE NOTICE 'PASS - un tipo sin la marca no manda correo';

  -- 18.f Un recordatorio (delivery = 'email') encola y NO deja rastro en la campana.
  DELETE FROM public.notification_emails;
  DELETE FROM public.notifications;

  v_id := public.notify_staff('timesheet.reminder.daily', c_own, NULL,
                              jsonb_build_object('dedupe', '2026-09-14', 'pendientes', 3));
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL - un recordatorio devolvio notification_id';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications WHERE type_key = 'timesheet.reminder.daily';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el recordatorio dejo % filas en la campana', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notification_emails
   WHERE type_key = 'timesheet.reminder.daily' AND notification_id IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el recordatorio no encolo correo';
  END IF;
  RAISE NOTICE 'PASS - un recordatorio manda correo y no toca la campana';

  -- 18.f.2 El alcance `firm` SI recibe el recordatorio, que es la otra mitad de la regla: no
  --        recibe correo por suceso porque serian cien, y recibe el resumen porque es uno.
  PERFORM public.notify_staff('approval.reminder.weekly', c_firm, NULL,
                              jsonb_build_object('dedupe', '2026-W38', 'total', 5));
  SELECT COUNT(*) INTO v_n FROM public.notification_emails
   WHERE recipient_staff_id = c_firm AND type_key = 'approval.reminder.weekly';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el alcance firm no recibio el recordatorio (% filas)', v_n;
  END IF;
  RAISE NOTICE 'PASS - alcance firm: sin correo por suceso, pero si el recordatorio';

  -- 18.g Repetir el mismo recordatorio en la misma ventana NO duplica. Es lo que permite que el
  --      cron corra dos veces sin que nadie reciba el correo dos veces.
  PERFORM public.notify_staff('timesheet.reminder.daily', c_own, NULL,
                              jsonb_build_object('dedupe', '2026-09-14', 'pendientes', 4));
  SELECT COUNT(*) INTO v_n FROM public.notification_emails
   WHERE type_key = 'timesheet.reminder.daily';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la segunda corrida del cron encolo otro correo (% filas)', v_n;
  END IF;

  -- Y la ventana siguiente SI es un correo nuevo.
  PERFORM public.notify_staff('timesheet.reminder.daily', c_own, NULL,
                              jsonb_build_object('dedupe', '2026-09-15'));
  SELECT COUNT(*) INTO v_n FROM public.notification_emails
   WHERE type_key = 'timesheet.reminder.daily';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - la ventana siguiente no encolo (% filas)', v_n;
  END IF;
  RAISE NOTICE 'PASS - dedupe_key: una ventana, un correo; ventana nueva, correo nuevo';

  -- 18.h El drenaje reclama y marca `sending`, y no entrega dos veces la misma fila.
  DELETE FROM public.notification_emails;
  DELETE FROM public.notifications;
  PERFORM public.notify_staff('auth.role.changed', c_own, 'ent-2', '{}'::jsonb);

  SELECT COUNT(*) INTO v_reclamados FROM public.claim_notification_emails(50);
  IF v_reclamados <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el drenaje reclamo % filas, se esperaba 1', v_reclamados;
  END IF;
  SELECT status, attempts INTO v_estado, v_intentos
    FROM public.notification_emails LIMIT 1;
  IF v_estado <> 'sending' OR v_intentos <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - tras reclamar quedo status=% attempts=%', v_estado, v_intentos;
  END IF;

  SELECT COUNT(*) INTO v_reclamados FROM public.claim_notification_emails(50);
  IF v_reclamados <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el segundo drenaje volvio a tomar la misma fila';
  END IF;
  RAISE NOTICE 'PASS - el drenaje reclama una vez y la fila no vuelve a salir';

  -- 18.i Un envio exitoso cierra la fila.
  SELECT email_id INTO v_email_id FROM public.notification_emails LIMIT 1;
  IF public.mark_notification_email_result(v_email_id, true, NULL) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - marcar enviado devolvio false';
  END IF;
  SELECT status INTO v_estado FROM public.notification_emails WHERE email_id = v_email_id;
  IF v_estado <> 'sent' THEN
    RAISE EXCEPTION 'TEST FAIL - tras un envio exitoso el status es %', v_estado;
  END IF;
  RAISE NOTICE 'PASS - un envio exitoso deja la fila en sent';

  -- 18.j Un fallo vuelve a pending y se reintenta; al TERCER intento queda failed.
  --      Reintentar para siempre esconde un error de configuracion en vez de mostrarlo.
  DELETE FROM public.notification_emails;
  DELETE FROM public.notifications;
  PERFORM public.notify_staff('auth.role.changed', c_own, 'ent-3', '{}'::jsonb);
  SELECT email_id INTO v_email_id FROM public.notification_emails LIMIT 1;

  FOR v_n IN 1..2 LOOP
    PERFORM public.claim_notification_emails(50);
    PERFORM public.mark_notification_email_result(v_email_id, false, 'error simulado');
    SELECT status INTO v_estado FROM public.notification_emails WHERE email_id = v_email_id;
    IF v_estado <> 'pending' THEN
      RAISE EXCEPTION 'TEST FAIL - en el intento % el status quedo en % y no en pending', v_n, v_estado;
    END IF;
  END LOOP;

  PERFORM public.claim_notification_emails(50);
  PERFORM public.mark_notification_email_result(v_email_id, false, 'error simulado');
  SELECT status, attempts, last_error INTO v_estado, v_intentos, v_dedupe
    FROM public.notification_emails WHERE email_id = v_email_id;
  IF v_estado <> 'failed' OR v_intentos <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - al tercer intento quedo status=% attempts=%', v_estado, v_intentos;
  END IF;
  IF v_dedupe IS DISTINCT FROM 'error simulado' THEN
    RAISE EXCEPTION 'TEST FAIL - no se guardo el ultimo error';
  END IF;
  RAISE NOTICE 'PASS - dos reintentos y al tercero queda failed, con el error guardado';

  -- 18.j.2 `sending` es un ARRIENDO, no un destino: si la invocacion muere entre reclamar y
  --        cerrar, la fila tiene que volver a salir. Antes no salia — el claim solo miraba
  --        `pending`— y con 50 envios en serie una corrida cortada sepultaba el resto del lote.
  DELETE FROM public.notification_emails;
  DELETE FROM public.notifications;
  PERFORM public.notify_staff('auth.role.changed', c_own, 'ent-4', '{}'::jsonb);
  SELECT email_id INTO v_email_id FROM public.notification_emails LIMIT 1;

  PERFORM public.claim_notification_emails(50);
  -- Aca MUERE el drenaje: no se llama a mark_notification_email_result().
  SELECT claimed_at IS NOT NULL INTO v_ok FROM public.notification_emails WHERE email_id = v_email_id;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'TEST FAIL - el claim no estampo claimed_at';
  END IF;

  -- Con el arriendo vigente la fila NO sale: dos crons seguidos no mandan el correo dos veces.
  SELECT COUNT(*) INTO v_reclamados FROM public.claim_notification_emails(50);
  IF v_reclamados <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - se retomo una fila con el arriendo todavia vigente (correo duplicado)';
  END IF;

  -- Vencido el arriendo, sale. Se envejece la estampa en vez de esperar 15 minutos reales.
  UPDATE public.notification_emails
     SET claimed_at = now() - interval '16 minutes' WHERE email_id = v_email_id;
  SELECT COUNT(*) INTO v_reclamados FROM public.claim_notification_emails(50);
  IF v_reclamados <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el arriendo vencido no se recogio (% filas)', v_reclamados;
  END IF;
  SELECT attempts INTO v_intentos FROM public.notification_emails WHERE email_id = v_email_id;
  IF v_intentos <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - tras retomar el arriendo attempts=%, se esperaba 2', v_intentos;
  END IF;
  RAISE NOTICE 'PASS - el arriendo vencido se recoge y el vigente no';

  -- 18.j.3 Un envio que mata al proceso CADA vez no se reintenta para siempre. El tope de 3 lo
  --        aplica mark_notification_email_result(), o sea justo la funcion a la que esa fila
  --        nunca llega: sin el barrido del claim, la fila daria vueltas indefinidamente.
  UPDATE public.notification_emails
     SET claimed_at = now() - interval '16 minutes' WHERE email_id = v_email_id;
  PERFORM public.claim_notification_emails(50);   -- attempts 3
  SELECT status, attempts INTO v_estado, v_intentos
    FROM public.notification_emails WHERE email_id = v_email_id;
  IF v_estado <> 'sending' OR v_intentos <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - antes del barrido quedo status=% attempts=%', v_estado, v_intentos;
  END IF;

  UPDATE public.notification_emails
     SET claimed_at = now() - interval '16 minutes' WHERE email_id = v_email_id;
  SELECT COUNT(*) INTO v_reclamados FROM public.claim_notification_emails(50);
  IF v_reclamados <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - se volvio a reclamar una fila con los 3 intentos gastados';
  END IF;
  SELECT status, last_error INTO v_estado, v_dedupe
    FROM public.notification_emails WHERE email_id = v_email_id;
  IF v_estado <> 'failed' THEN
    RAISE EXCEPTION 'TEST FAIL - el arriendo vencido con 3 intentos quedo en % y no en failed', v_estado;
  END IF;
  IF v_dedupe IS NULL OR v_dedupe NOT LIKE '%arriendo vencido%' THEN
    RAISE EXCEPTION 'TEST FAIL - no se guardo el motivo del failed (last_error = %)', v_dedupe;
  END IF;
  RAISE NOTICE 'PASS - un arriendo que vence 3 veces termina en failed, no en bucle';

  -- 18.j.4 Cerrar suelta el arriendo: una fila de vuelta en pending no puede seguir figurando
  --        como reclamada por alguien.
  DELETE FROM public.notification_emails;
  DELETE FROM public.notifications;
  PERFORM public.notify_staff('auth.role.changed', c_own, 'ent-5', '{}'::jsonb);
  SELECT email_id INTO v_email_id FROM public.notification_emails LIMIT 1;

  PERFORM public.claim_notification_emails(50);
  PERFORM public.mark_notification_email_result(v_email_id, false, 'error simulado');
  SELECT status, claimed_at IS NULL INTO v_estado, v_ok
    FROM public.notification_emails WHERE email_id = v_email_id;
  IF v_estado <> 'pending' OR NOT v_ok THEN
    RAISE EXCEPTION 'TEST FAIL - tras el reintento quedo status=% con el arriendo sin soltar', v_estado;
  END IF;

  PERFORM public.claim_notification_emails(50);
  PERFORM public.mark_notification_email_result(v_email_id, true, NULL);
  SELECT status, claimed_at IS NULL INTO v_estado, v_ok
    FROM public.notification_emails WHERE email_id = v_email_id;
  IF v_estado <> 'sent' OR NOT v_ok THEN
    RAISE EXCEPTION 'TEST FAIL - tras el envio exitoso quedo status=% con el arriendo sin soltar', v_estado;
  END IF;
  RAISE NOTICE 'PASS - cerrar un correo suelta el arriendo, salga bien o mal';

  -- 18.k La purga se lleva lo enviado viejo y CONSERVA lo fallido: es el registro de lo que
  --      nunca llego.
  DELETE FROM public.notification_emails;
  INSERT INTO public.notification_emails
    (dedupe_key, recipient_staff_id, to_email, type_key, status, created_at, sent_at)
  VALUES
    ('vieja-enviada',  c_own, 'own@ruizmier.com', 'auth.role.changed', 'sent',
     now() - interval '40 days', now() - interval '40 days'),
    ('reciente-enviada', c_own, 'own@ruizmier.com', 'auth.role.changed', 'sent',
     now() - interval '5 days', now() - interval '5 days'),
    ('vieja-fallida',  c_own, 'own@ruizmier.com', 'auth.role.changed', 'failed',
     now() - interval '40 days', NULL);

  IF public.purge_old_notification_emails() <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la purga no borro exactamente la enviada vieja';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notification_emails WHERE dedupe_key = 'vieja-fallida';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la purga se llevo una fila failed';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notification_emails WHERE dedupe_key = 'reciente-enviada';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la purga se llevo una enviada dentro de la ventana';
  END IF;
  RAISE NOTICE 'PASS - la purga borra lo enviado viejo y conserva lo fallido';

  -- 18.l Los cuatro emisores de recordatorio corren. Es humo, y es el que mas falta hace: un
  --      error de sintaxis o de permisos en una funcion que solo se ejecuta 9 AM de un lunes se
  --      descubre 9 AM de un lunes. Con la base limpia no hay nada pendiente, asi que avisan a 0.
  DELETE FROM public.notification_emails;
  IF public.notif_emit_timesheet_reminder_daily() IS NULL
     OR public.notif_emit_approval_reminder_weekly() IS NULL
     OR public.notif_emit_fund_reminder_weekly() IS NULL
     OR public.notif_emit_wo_installment_reminder_weekly() IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - un emisor de recordatorio devolvio NULL';
  END IF;
  RAISE NOTICE 'PASS - los cuatro emisores de recordatorio corren';

  -- 18.m El origen del cambio de rol: fuera de la sincronizacion de categoria es `direct`.
  IF public.notif_origen_cambio_rol() <> 'direct' THEN
    RAISE EXCEPTION 'TEST FAIL - sin marcador el origen no es direct';
  END IF;
  PERFORM set_config('ems.role_change_source', 'category', true);
  IF public.notif_origen_cambio_rol() <> 'category' THEN
    RAISE EXCEPTION 'TEST FAIL - con el marcador puesto el origen no es category';
  END IF;
  PERFORM set_config('ems.role_change_source', '', true);
  RAISE NOTICE 'PASS - el origen del cambio de rol se lee del marcador';

  RAISE NOTICE 'NOTIFICACIONES CORREOS: ALL CHECKS PASSED';
END $$;

ROLLBACK;

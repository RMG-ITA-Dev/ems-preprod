-- =====================================================================
-- claim_auth_email_slot() — freno de los correos de cuenta
-- =====================================================================
--
-- Cubre el reemplazo del limite de correos de GoTrue. Desde que los correos de cuenta salen por
-- Microsoft Graph, GoTrue ya no cuenta ninguno: si esta funcion falla, el formulario publico de
-- "olvide mi contrasena" queda sin ningun freno.
--
-- El freno tiene dos mitades y las dos importan: `claim_auth_email_slot()` descuenta el cupo
-- ANTES de intentar el envio —al reves no frena nada— y `release_auth_email_slot()` lo devuelve
-- cuando el correo no llego a salir. Sin la segunda, el rollback del alta a medias no destranca
-- nada: el reintento del usuario cae en el minimo entre correos.
--
-- Y el cupo son DOS: el del destinatario y el de la firma. El de GoTrue era por proyecto, asi
-- que un freno solo por destinatario no lo reemplaza — se esquiva recorriendo direcciones, que
-- en una firma con dominio propio son adivinables.
--
-- Marcador final: 'THROTTLE CORREO AUTH: ALL CHECKS PASSED'

BEGIN;

DO $$
DECLARE
  v_ok    boolean;
  v_n     integer;
  v_count integer;
BEGIN
  DELETE FROM public.auth_email_throttle;

  -- 1. Un correo vacio no consume cupo ni crea fila: es un error de quien llama, no un pedido.
  IF public.claim_auth_email_slot('') <> false
     OR public.claim_auth_email_slot(NULL) <> false
     OR public.claim_auth_email_slot('   ') <> false THEN
    RAISE EXCEPTION 'TEST FAIL - un correo vacio obtuvo cupo';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.auth_email_throttle;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - un correo vacio creo % filas', v_n;
  END IF;
  RAISE NOTICE 'PASS - un correo vacio no consume cupo ni deja rastro';

  -- 2. El primer pedido se concede y queda registrado.
  IF public.claim_auth_email_slot('persona@ruizmier.com') <> true THEN
    RAISE EXCEPTION 'TEST FAIL - el primer pedido no obtuvo cupo';
  END IF;
  SELECT sent_count INTO v_count FROM public.auth_email_throttle
   WHERE email_normalized = 'persona@ruizmier.com';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el contador quedo en % tras el primer correo', v_count;
  END IF;
  RAISE NOTICE 'PASS - el primer correo se concede';

  -- 3. El segundo inmediato NO: hay un minimo de segundos entre dos correos al mismo
  --    destinatario. Es lo que impide usar el formulario como martillo contra una casilla.
  IF public.claim_auth_email_slot('persona@ruizmier.com') <> false THEN
    RAISE EXCEPTION 'TEST FAIL - se concedieron dos correos seguidos al mismo destinatario';
  END IF;
  SELECT sent_count INTO v_count FROM public.auth_email_throttle
   WHERE email_normalized = 'persona@ruizmier.com';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - un pedido rechazado movio el contador a %', v_count;
  END IF;
  RAISE NOTICE 'PASS - el minimo entre correos frena el segundo, y no consume cupo';

  -- 4. El correo se normaliza: mayusculas y espacios comparten el mismo cupo.
  IF public.claim_auth_email_slot('  PERSONA@Ruizmier.com ') <> false THEN
    RAISE EXCEPTION 'TEST FAIL - cambiar mayusculas o espacios esquivo el freno';
  END IF;
  -- Se excluye '*', que es el contador de la firma y no un destinatario.
  SELECT COUNT(*) INTO v_n FROM public.auth_email_throttle WHERE email_normalized <> '*';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la normalizacion creo % filas para el mismo correo', v_n;
  END IF;
  RAISE NOTICE 'PASS - mayusculas y espacios no abren un cupo nuevo';

  -- 5. Con el minimo en cero manda el tope de la ventana, y se respeta.
  DELETE FROM public.auth_email_throttle;
  FOR v_n IN 1..3 LOOP
    IF public.claim_auth_email_slot('tope@ruizmier.com', 3, 0) <> true THEN
      RAISE EXCEPTION 'TEST FAIL - el correo % de 3 fue rechazado dentro del tope', v_n;
    END IF;
  END LOOP;
  IF public.claim_auth_email_slot('tope@ruizmier.com', 3, 0) <> false THEN
    RAISE EXCEPTION 'TEST FAIL - se concedio un cuarto correo con el tope en 3';
  END IF;
  SELECT sent_count INTO v_count FROM public.auth_email_throttle
   WHERE email_normalized = 'tope@ruizmier.com';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - el contador paso de 3 a % pese al tope', v_count;
  END IF;
  RAISE NOTICE 'PASS - el tope por ventana corta en el numero configurado';

  -- 6. Vencida la ventana, el cupo se renueva y el contador arranca de nuevo.
  UPDATE public.auth_email_throttle
     SET window_start = now() - interval '2 hours',
         last_sent_at = now() - interval '2 hours'
   WHERE email_normalized = 'tope@ruizmier.com';

  IF public.claim_auth_email_slot('tope@ruizmier.com', 3, 0) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - la ventana vencida no renovo el cupo';
  END IF;
  SELECT sent_count INTO v_count FROM public.auth_email_throttle
   WHERE email_normalized = 'tope@ruizmier.com';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - tras renovar la ventana el contador quedo en %, se esperaba 1', v_count;
  END IF;
  RAISE NOTICE 'PASS - la ventana se renueva y el contador vuelve a empezar';

  -- 7. Cada destinatario lleva su propio cupo: agotar uno no afecta al otro.
  IF public.claim_auth_email_slot('otra@ruizmier.com', 3, 0) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - el cupo de un destinatario afecto a otro';
  END IF;
  RAISE NOTICE 'PASS - el cupo es por destinatario';

  -- 8. Devolver el cupo: un correo que no llego a salir no se cobra.
  --
  -- El cupo se descuenta ANTES de intentar el envio, asi que un fallo de Graph deja gastado un
  -- cupo por un correo que nunca existio. Sin devolverlo, el rollback del alta a medias no sirve
  -- de nada: el reintento del usuario choca contra el minimo entre correos.
  DELETE FROM public.auth_email_throttle;

  -- Tope de 2 y sin minimo entre correos, para medir el contador sin pelear con el reloj.
  IF public.claim_auth_email_slot('vuelta@ruizmier.com', 2, 0) <> true
     OR public.claim_auth_email_slot('vuelta@ruizmier.com', 2, 0) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - no se pudieron consumir los dos cupos de la ventana';
  END IF;
  IF public.claim_auth_email_slot('vuelta@ruizmier.com', 2, 0) <> false THEN
    RAISE EXCEPTION 'TEST FAIL - con el tope en 2 se concedio un tercer cupo';
  END IF;

  -- Se devuelve con el correo tal como lo escribio quien llama: misma normalizacion que el claim.
  IF public.release_auth_email_slot('  VUELTA@Ruizmier.com ') <> true THEN
    RAISE EXCEPTION 'TEST FAIL - devolver un cupo consumido no devolvio true';
  END IF;
  SELECT sent_count INTO v_count FROM public.auth_email_throttle
   WHERE email_normalized = 'vuelta@ruizmier.com';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - tras la devolucion el contador quedo en %, se esperaba 1', v_count;
  END IF;
  IF public.claim_auth_email_slot('vuelta@ruizmier.com', 2, 0) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - el cupo devuelto no se puede volver a usar';
  END IF;
  RAISE NOTICE 'PASS - el cupo de un correo que no salio se devuelve y se puede reusar';

  -- 8.b El caso que motiva la funcion: el reintento inmediato del alta deja de estar frenado.
  DELETE FROM public.auth_email_throttle;
  IF public.claim_auth_email_slot('reintento@ruizmier.com', 5, 60) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - el primer pedido no obtuvo cupo';
  END IF;
  IF public.claim_auth_email_slot('reintento@ruizmier.com', 5, 60) <> false THEN
    RAISE EXCEPTION 'TEST FAIL - el minimo entre correos no freno el reintento inmediato';
  END IF;
  PERFORM public.release_auth_email_slot('reintento@ruizmier.com');
  IF public.claim_auth_email_slot('reintento@ruizmier.com', 5, 60) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - tras devolver el cupo el reintento sigue frenado';
  END IF;
  RAISE NOTICE 'PASS - devolver el cupo destranca el reintento inmediato del alta';

  -- 8.c Y no regala cupo: sin consumo previo no hay nada que devolver.
  DELETE FROM public.auth_email_throttle;
  IF public.release_auth_email_slot('nadie@ruizmier.com') <> false THEN
    RAISE EXCEPTION 'TEST FAIL - se devolvio cupo de un destinatario sin fila';
  END IF;
  IF public.release_auth_email_slot('') <> false
     OR public.release_auth_email_slot(NULL) <> false THEN
    RAISE EXCEPTION 'TEST FAIL - un correo vacio devolvio cupo';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.auth_email_throttle;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - devolver cupo creo % filas', v_n;
  END IF;

  INSERT INTO public.auth_email_throttle (email_normalized, window_start, sent_count, last_sent_at)
  VALUES ('cero@ruizmier.com', now(), 0, NULL);
  IF public.release_auth_email_slot('cero@ruizmier.com') <> false THEN
    RAISE EXCEPTION 'TEST FAIL - se devolvio cupo sobre un contador que ya estaba en cero';
  END IF;
  SELECT sent_count INTO v_count FROM public.auth_email_throttle
   WHERE email_normalized = 'cero@ruizmier.com';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el contador quedo en % tras una devolucion que no correspondia',
      v_count;
  END IF;
  RAISE NOTICE 'PASS - devolver no regala cupo ni crea filas';

  -- 9. El tope de la firma. El freno por destinatario no lo cubre: quien conoce el dominio
  --    conoce las direcciones, y recorriendo una lista de empleados multiplica el tope por la
  --    cantidad de casillas. Los correos de cuenta salen por el mismo buzon de Graph que el
  --    drenaje de notificaciones, asi que agotarlo se lleva puestas las notificaciones de todos.
  DELETE FROM public.auth_email_throttle;

  -- Tope global de 2, con el freno por destinatario holgado para que no interfiera.
  IF public.claim_auth_email_slot('uno@ruizmier.com', 5, 0, 2) <> true
     OR public.claim_auth_email_slot('dos@ruizmier.com', 5, 0, 2) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - el tope global de 2 no concedio los dos primeros';
  END IF;

  -- El tercero es un destinatario NUEVO, con su cupo propio intacto: lo unico que lo frena es
  -- el tope de la firma.
  IF public.claim_auth_email_slot('tres@ruizmier.com', 5, 0, 2) <> false THEN
    RAISE EXCEPTION 'TEST FAIL - un destinatario nuevo esquivo el tope global';
  END IF;
  RAISE NOTICE 'PASS - el tope de la firma frena a un destinatario que nunca pidio nada';

  -- Y al frenarlo NO le cobra el cupo. Si se lo cobrara, alcanzaria con pedir mientras el tope
  -- global esta agotado para dejar sin cupo propio a quien nunca recibio un correo.
  SELECT COALESCE(MAX(sent_count), 0) INTO v_count FROM public.auth_email_throttle
   WHERE email_normalized = 'tres@ruizmier.com';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - al frenado por el tope global se le descontó cupo propio (%)', v_count;
  END IF;
  SELECT sent_count INTO v_count FROM public.auth_email_throttle WHERE email_normalized = '*';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - el contador global quedo en %, se esperaba 2', v_count;
  END IF;
  RAISE NOTICE 'PASS - un pedido frenado por el tope global no descuenta ningun cupo';

  -- 9.b Devolver un cupo devuelve TAMBIEN el de la firma. Si no, cada falla de Graph gastaria
  --     techo global para siempre y el freno se cerraria solo.
  IF public.release_auth_email_slot('dos@ruizmier.com') <> true THEN
    RAISE EXCEPTION 'TEST FAIL - no se pudo devolver el cupo';
  END IF;
  SELECT sent_count INTO v_count FROM public.auth_email_throttle WHERE email_normalized = '*';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el contador global quedo en % tras la devolucion, se esperaba 1',
      v_count;
  END IF;
  IF public.claim_auth_email_slot('tres@ruizmier.com', 5, 0, 2) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - el cupo global devuelto no se puede reusar';
  END IF;
  RAISE NOTICE 'PASS - devolver un cupo devuelve tambien el de la firma';

  -- 9.c Y una devolucion sobre un correo que nunca reclamo nada no baja el contador de la
  --     firma: seria techo global gratis, llamando a release en un bucle.
  SELECT sent_count INTO v_count FROM public.auth_email_throttle WHERE email_normalized = '*';
  IF public.release_auth_email_slot('jamas@ruizmier.com') <> false THEN
    RAISE EXCEPTION 'TEST FAIL - se devolvio el cupo de un correo que nunca reclamo';
  END IF;
  SELECT sent_count INTO v_n FROM public.auth_email_throttle WHERE email_normalized = '*';
  IF v_n <> v_count THEN
    RAISE EXCEPTION 'TEST FAIL - una devolucion sin consumo movio el contador global de % a %',
      v_count, v_n;
  END IF;
  RAISE NOTICE 'PASS - devolver sin consumo previo no toca el contador de la firma';

  -- 9.d La fila global comparte tabla con los destinatarios, asi que su clave tiene que ser
  --     inalcanzable desde afuera: reclamarla o devolverla por nombre seria romper el tope.
  IF public.claim_auth_email_slot('*', 5, 0, 2) <> false
     OR public.claim_auth_email_slot('  *  ', 5, 0, 2) <> false
     OR public.release_auth_email_slot('*') <> false THEN
    RAISE EXCEPTION 'TEST FAIL - la clave reservada de la fila global se acepto como destinatario';
  END IF;
  RAISE NOTICE 'PASS - la fila global no se puede reclamar ni devolver como si fuera un correo';

  -- 9.e Sin parametro, el tope global sale de global_settings; un valor mal tipeado cae al
  --     default en vez de dejar a la firma entera sin correos de cuenta.
  DELETE FROM public.auth_email_throttle;
  UPDATE public.global_settings SET setting_value = '1'
   WHERE setting_key = 'AUTH_EMAIL_GLOBAL_MAX_PER_HOUR';
  IF public.claim_auth_email_slot('a@ruizmier.com', 5, 0) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - el primer correo no paso con el tope global en 1';
  END IF;
  IF public.claim_auth_email_slot('b@ruizmier.com', 5, 0) <> false THEN
    RAISE EXCEPTION 'TEST FAIL - el tope global de global_settings no se aplico';
  END IF;

  UPDATE public.global_settings SET setting_value = 'muchos'
   WHERE setting_key = 'AUTH_EMAIL_GLOBAL_MAX_PER_HOUR';
  IF public.claim_auth_email_slot('c@ruizmier.com', 5, 0) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - un tope global mal tipeado dejo a la firma sin correos';
  END IF;
  UPDATE public.global_settings SET setting_value = '120'
   WHERE setting_key = 'AUTH_EMAIL_GLOBAL_MAX_PER_HOUR';
  RAISE NOTICE 'PASS - el tope global se lee de global_settings y un valor basura cae al default';

  -- 9.f La ventana de la firma tambien se renueva: el tope es por hora, no un techo de por vida.
  DELETE FROM public.auth_email_throttle;
  INSERT INTO public.auth_email_throttle (email_normalized, window_start, sent_count, last_sent_at)
  VALUES ('*', now() - interval '2 hours', 999, now() - interval '2 hours');
  IF public.claim_auth_email_slot('d@ruizmier.com', 5, 0, 2) <> true THEN
    RAISE EXCEPTION 'TEST FAIL - la ventana global vencida siguio frenando';
  END IF;
  SELECT sent_count INTO v_count FROM public.auth_email_throttle WHERE email_normalized = '*';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - tras renovar la ventana global el contador quedo en %, se esperaba 1',
      v_count;
  END IF;
  RAISE NOTICE 'PASS - la ventana de la firma se renueva y el contador vuelve a empezar';

  -- 10. La purga se lleva lo vencido hace mas de un dia y conserva lo vigente.
  DELETE FROM public.auth_email_throttle;
  INSERT INTO public.auth_email_throttle (email_normalized, window_start, sent_count, last_sent_at)
  VALUES
    ('vieja@ruizmier.com',  now() - interval '3 days', 5, now() - interval '3 days'),
    ('reciente@ruizmier.com', now() - interval '2 hours', 5, now() - interval '2 hours');

  IF public.purge_old_auth_email_throttle() <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la purga no borro exactamente la fila vencida';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.auth_email_throttle
   WHERE email_normalized = 'reciente@ruizmier.com';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la purga se llevo una fila dentro del dia';
  END IF;
  RAISE NOTICE 'PASS - la purga borra lo vencido hace mas de un dia y conserva el resto';

  RAISE NOTICE 'THROTTLE CORREO AUTH: ALL CHECKS PASSED';
END $$;

ROLLBACK;

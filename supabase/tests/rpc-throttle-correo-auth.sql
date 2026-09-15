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
  SELECT COUNT(*) INTO v_n FROM public.auth_email_throttle;
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

  -- 9. La purga se lleva lo vencido hace mas de un dia y conserva lo vigente.
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

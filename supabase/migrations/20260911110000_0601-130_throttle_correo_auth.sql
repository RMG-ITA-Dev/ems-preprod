-- =====================================================================
-- Throttle de los correos de cuenta que ahora emite la aplicación
-- =====================================================================
--
-- Contexto: los correos de cuenta (recuperación, alta, desbloqueo) dejaron de salir por GoTrue y
-- salen por Microsoft Graph. GoTrue sigue emitiendo el token con `generateLink()`, que no manda
-- correo — y como para GoTrue no hubo correo, su límite de envíos por hora deja de aplicar.
--
-- Ese límite era, además del techo que molestaba, el anti-abuso del formulario "olvidé mi
-- contraseña": sin él, un endpoint público que manda correos es un amplificador — cualquiera
-- puede pedir mil recuperaciones contra la casilla de otro. Esta tabla lo repone del lado
-- nuestro, con tres frenos:
--
--   * un mínimo de segundos entre dos correos al mismo destinatario,
--   * un tope por ventana de una hora para ese destinatario, y
--   * un tope por ventana de una hora para TODA la firma.
--
-- El tercero no es un extra: el límite de GoTrue era por proyecto, y frenar sólo por
-- destinatario deja el techo global en nada. Quien conoce el dominio conoce las direcciones
-- —son `nombre@dominio`— y recorriendo una lista de empleados multiplica el tope por la
-- cantidad de casillas. Y como los correos de cuenta salen por el MISMO buzón de Graph que el
-- drenaje de notificaciones (`MS_GRAPH_SENDER_EMAIL`), agotar su cuota no es sólo molestar a
-- quien recibe: se lleva puestas las notificaciones de todos.
--
-- El tope global se configura en `global_settings` y se deja holgado a propósito. Un techo
-- global apretado es exactamente el problema que esta rama vino a resolver: el de GoTrue eran
-- 2 por hora para todo el proyecto.
--
-- Se cuenta por destinatario y NO por si la cuenta existe: contar sólo las que existen
-- convertiría el tiempo de respuesta en un detector de usuarios.
--
-- Sigue la convención de `public.auth_login_attempts` (bug 0514-115): misma forma de normalizar
-- el correo, misma idea de ventana móvil.

-- ---------------------------------------------------------------------
-- A) Tabla
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.auth_email_throttle (
    email_normalized text PRIMARY KEY,
    window_start     timestamp with time zone NOT NULL DEFAULT now(),
    sent_count       integer NOT NULL DEFAULT 0,
    last_sent_at     timestamp with time zone
);

COMMENT ON TABLE public.auth_email_throttle IS
  'Freno de los correos de cuenta emitidos por la app (recuperación, alta). Una fila por destinatario, más la fila "*" que lleva el contador de toda la firma. Se escribe únicamente vía claim_auth_email_slot() / release_auth_email_slot().';
COMMENT ON COLUMN public.auth_email_throttle.email_normalized IS
  'Destinatario en minúsculas y sin espacios, o "*" para el contador global. Los dos conviven en la misma tabla sin poder pisarse: un correo válido siempre lleva "@", y las dos funciones rechazan lo que no lo tenga.';
COMMENT ON COLUMN public.auth_email_throttle.window_start IS
  'Inicio de la ventana móvil de una hora. Se reinicia cuando la ventana vence.';
COMMENT ON COLUMN public.auth_email_throttle.sent_count IS
  'Correos concedidos dentro de la ventana en curso.';

INSERT INTO public.global_settings (setting_key, setting_value, description) VALUES
  ('AUTH_EMAIL_GLOBAL_MAX_PER_HOUR', '120',
   'Tope de correos de cuenta (alta, recuperación, desbloqueo) que la app manda por hora para TODA la firma, sumando destinatarios. Repone el límite por proyecto que ponía GoTrue y que el freno por destinatario no cubre. Holgado a propósito: apretarlo reintroduce el problema original. Rango aceptado 1-100000; fuera de rango o no numérico cae a 120.')
ON CONFLICT (setting_key) DO NOTHING;

-- Sin policies a propósito: sólo `service_role` toca esta tabla, y `service_role` no evalúa RLS.
-- Con RLS activa y cero policies, `authenticated` y `anon` no ven ni escriben nada.
ALTER TABLE public.auth_email_throttle ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.auth_email_throttle FROM PUBLIC;
REVOKE ALL ON TABLE public.auth_email_throttle FROM anon, authenticated;
GRANT ALL ON TABLE public.auth_email_throttle TO service_role;

-- ---------------------------------------------------------------------
-- B) claim_auth_email_slot()
-- ---------------------------------------------------------------------
--
-- Devuelve true si se puede mandar el correo, y en ese caso ya consumió el cupo — los DOS
-- cupos: el del destinatario y el de la firma.
--
-- La fila se asegura primero y se bloquea después: el `FOR UPDATE` es lo que impide que dos
-- pedidos simultáneos del mismo correo se concedan los dos. El segundo espera al primero y lee
-- el contador ya actualizado.
--
-- Las dos filas se bloquean SIEMPRE en el mismo orden —primero la global, después la del
-- destinatario— y `release_auth_email_slot()` hace lo mismo. Dos pedidos simultáneos de correos
-- distintos toman los mismos candados en el mismo orden, así que no pueden trabarse entre sí.
--
-- Y no se escribe nada hasta que los dos topes pasaron: cortar después de haber descontado el
-- del destinatario le cobraría un cupo por un correo que la firma no dejó salir.
--
-- La decisión es explícita y no deducida del estado resultante. Deducirla comparando
-- `last_sent_at = now()` parece más corto y está mal: `now()` es constante dentro de una
-- transacción, así que dos llamadas seguidas ven el mismo instante y la segunda se lee como
-- concedida.

-- Las dos firmas: la de 3 argumentos es la anterior al tope global. Si sobrevive, `.rpc()` con
-- sólo `p_email` queda ambiguo entre las dos sobrecargas y las edge functions dejan de resolver.
DROP FUNCTION IF EXISTS public.claim_auth_email_slot(text, integer, integer);
DROP FUNCTION IF EXISTS public.claim_auth_email_slot(text, integer, integer, integer);

CREATE FUNCTION public.claim_auth_email_slot(
    p_email       text,
    p_max_por_hora integer DEFAULT 5,
    p_min_segundos integer DEFAULT 60,
    -- NULL = leer el tope global de `global_settings`. Se puede forzar por parámetro para que
    -- las pruebas no tengan que quemar 120 cupos para llegar al techo.
    p_max_global  integer DEFAULT NULL
) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email       text := lower(trim(coalesce(p_email, '')));
  v_ahora       timestamp with time zone := now();
  v_fila        public.auth_email_throttle%ROWTYPE;
  v_global      public.auth_email_throttle%ROWTYPE;
  v_max_global  integer := p_max_global;
  v_raw         text;
  v_venc_email  boolean;
  v_venc_global boolean;
  c_global      constant text := '*';
BEGIN
  -- El '@' no es cosmético: es lo que garantiza que un destinatario no pueda hacerse pasar por
  -- la fila global. Quien llama ya validó la dirección; acá alcanza con que no sea la clave
  -- reservada.
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN false;
  END IF;

  IF v_max_global IS NULL THEN
    -- Se valida con regex en vez de castear a ciegas: `global_settings` es texto libre y un
    -- valor mal tipeado por el admin no puede dejar sin correos de cuenta a la firma entera.
    v_max_global := 120;
    SELECT setting_value INTO v_raw
      FROM public.global_settings WHERE setting_key = 'AUTH_EMAIL_GLOBAL_MAX_PER_HOUR';
    IF v_raw ~ '^[0-9]+$' THEN
      v_max_global := LEAST(GREATEST(v_raw::integer, 1), 100000);
    END IF;
  END IF;

  -- Asegura las filas sin pisarlas si ya existen, para poder bloquearlas en el paso siguiente.
  INSERT INTO public.auth_email_throttle (email_normalized, window_start, sent_count, last_sent_at)
  VALUES (c_global, v_ahora, 0, NULL), (v_email, v_ahora, 0, NULL)
  ON CONFLICT (email_normalized) DO NOTHING;

  SELECT * INTO v_global
    FROM public.auth_email_throttle
   WHERE email_normalized = c_global
     FOR UPDATE;

  SELECT * INTO v_fila
    FROM public.auth_email_throttle
   WHERE email_normalized = v_email
     FOR UPDATE;

  v_venc_email  := v_fila.window_start   < v_ahora - interval '1 hour';
  v_venc_global := v_global.window_start < v_ahora - interval '1 hour';

  -- Los topes del destinatario. Con la ventana vencida no hay nada que chequear: el contador
  -- arranca de cero y este correo es el primero.
  IF NOT v_venc_email THEN
    -- Demasiado seguido al mismo destinatario.
    IF v_fila.last_sent_at IS NOT NULL
       AND v_fila.last_sent_at > v_ahora - make_interval(secs => p_min_segundos) THEN
      RETURN false;
    END IF;

    -- Tope de la ventana en curso.
    IF v_fila.sent_count >= p_max_por_hora THEN
      RETURN false;
    END IF;
  END IF;

  -- El tope de la firma. Sin mínimo entre correos: ese freno es contra la casilla de una
  -- persona, y uno global convertiría el formulario en una fila de a uno por minuto.
  IF NOT v_venc_global AND v_global.sent_count >= v_max_global THEN
    RETURN false;
  END IF;

  UPDATE public.auth_email_throttle
     SET window_start = CASE WHEN v_venc_global THEN v_ahora ELSE window_start END,
         sent_count   = CASE WHEN v_venc_global THEN 1 ELSE v_global.sent_count + 1 END,
         last_sent_at = v_ahora
   WHERE email_normalized = c_global;

  UPDATE public.auth_email_throttle
     SET window_start = CASE WHEN v_venc_email THEN v_ahora ELSE window_start END,
         sent_count   = CASE WHEN v_venc_email THEN 1 ELSE v_fila.sent_count + 1 END,
         last_sent_at = v_ahora
   WHERE email_normalized = v_email;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.claim_auth_email_slot(text, integer, integer, integer) IS
  'Consume un cupo de correo de cuenta: el del destinatario y el de la firma. Devuelve true si se puede mandar (y ya descontó los dos), false si está dentro del mínimo entre correos, pasó el tope por destinatario de la ventana de una hora, o la firma agotó AUTH_EMAIL_GLOBAL_MAX_PER_HOUR. Cuando devuelve false no descuenta nada.';

REVOKE ALL ON FUNCTION public.claim_auth_email_slot(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_auth_email_slot(text, integer, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auth_email_slot(text, integer, integer, integer) TO service_role;

-- ---------------------------------------------------------------------
-- C) release_auth_email_slot()
-- ---------------------------------------------------------------------
--
-- Devuelve el cupo cuando el correo NO llegó a salir. El cupo se descuenta ANTES de intentar el
-- envío —tiene que ser así: descontarlo después deja la puerta abierta a mil pedidos en paralelo
-- que todavía no terminaron— y si Graph falla, queda un cupo gastado por un correo que nunca
-- existió.
--
-- Eso no es contabilidad fina: `register-user` deshace el alta a medias justamente para que el
-- reintento funcione, y sin devolver el cupo el reintento cae en el mínimo entre correos y se
-- come una respuesta de "revise su casilla" sobre una cuenta que ya no existe. El arreglo del
-- rollback quedaba anulado por su propio freno.
--
-- Qué NO se devuelve: un cupo gastado por un correo que SÍ salió, aunque el flujo termine en
-- error o el destinatario no exista. Ese consumo es el anti-barrido y está decidido en las
-- funciones que llaman.
--
-- `last_sent_at = NULL` y no "el valor anterior" —que no se guarda— porque no afloja la política:
-- para que haya algo que devolver tuvo que haber un `claim` concedido, y un `claim` sólo se
-- concede si el último correo REAL salió hace más de `p_min_segundos`. Así que el pedido que
-- entra después de una devolución sigue cayendo, como mínimo, a esa distancia del anterior.
--
-- Devuelve los DOS cupos que el claim descontó, y el global sólo si el del destinatario tenía
-- algo que devolver: es la única forma de que los dos contadores no se separen. Un `release`
-- sobre un correo que nunca reclamó nada no puede bajar el contador de la firma.

DROP FUNCTION IF EXISTS public.release_auth_email_slot(text);

CREATE FUNCTION public.release_auth_email_slot(p_email text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_filas  integer;
  c_global constant text := '*';
BEGIN
  -- Mismo guard que el claim: la fila global no es un destinatario y no se devuelve por nombre.
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN false;
  END IF;

  -- Mismo orden de candados que claim_auth_email_slot(): global primero. Acá se toma con un
  -- SELECT ... FOR UPDATE y no con el UPDATE directo para que el orden sea el mismo aunque el
  -- destinatario no tenga nada que devolver y el UPDATE global no llegue a ejecutarse.
  PERFORM 1 FROM public.auth_email_throttle
   WHERE email_normalized = c_global
     FOR UPDATE;

  UPDATE public.auth_email_throttle
     SET sent_count   = GREATEST(sent_count - 1, 0),
         last_sent_at = NULL
   WHERE email_normalized = v_email
     -- Sin cupo consumido no hay nada que devolver, y restar igual regalaría cupo de más.
     AND sent_count > 0;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas = 0 THEN
    RETURN false;
  END IF;

  -- `last_sent_at` de la fila global NO se limpia: no gobierna ningún chequeo (el mínimo entre
  -- correos es por destinatario) y borrarlo perdería el único rastro de cuándo se movió.
  UPDATE public.auth_email_throttle
     SET sent_count = GREATEST(sent_count - 1, 0)
   WHERE email_normalized = c_global
     AND sent_count > 0;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.release_auth_email_slot(text) IS
  'Devuelve los cupos que claim_auth_email_slot() ya descontó —el del destinatario y el de la firma—, para cuando el correo no llegó a salir (falla de Graph). Devuelve true si había algo que devolver. NO se usa cuando el correo sí salió.';

REVOKE ALL ON FUNCTION public.release_auth_email_slot(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_auth_email_slot(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_auth_email_slot(text) TO service_role;

-- ---------------------------------------------------------------------
-- D) Limpieza
-- ---------------------------------------------------------------------
--
-- La tabla es una fila por destinatario y no crece con el uso, pero una fila cuya ventana venció
-- hace días ya no dice nada. Se limpia con el mismo cron diario que purga notificaciones, para no
-- sumar un job más.
--
-- La fila global entra en la purga como cualquier otra, y está bien: si estuvo un día entero sin
-- moverse, su ventana venció hace rato y el próximo claim la vuelve a crear en cero. Es el mismo
-- estado, sin la fila.

CREATE OR REPLACE FUNCTION public.purge_old_auth_email_throttle()
RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_borradas integer;
BEGIN
  DELETE FROM public.auth_email_throttle
   WHERE window_start < now() - interval '1 day';
  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;

COMMENT ON FUNCTION public.purge_old_auth_email_throttle() IS
  'Borra las filas de auth_email_throttle cuya ventana venció hace más de un día. Devuelve cuántas borró.';

REVOKE ALL ON FUNCTION public.purge_old_auth_email_throttle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_auth_email_throttle() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auth-email-throttle-purge-daily') THEN
      PERFORM cron.unschedule('auth-email-throttle-purge-daily');
    END IF;
    PERFORM cron.schedule(
      'auth-email-throttle-purge-daily',
      '40 5 * * *',
      $cron$SELECT public.purge_old_auth_email_throttle();$cron$
    );
  END IF;
END $$;


-- =====================================================================
-- Verificación final: el freno no se maneja desde el cliente
-- =====================================================================
--
-- Mismo guard que cierra la migración 03, sobre las tres funciones de este archivo. Va acá
-- porque este archivo corre DESPUÉS del 03, así que aquel no puede verlas.
--
-- Lo que protege es más grave que un dato de más: las tres son el freno antiabuso del
-- formulario público de "olvidé mi contraseña". Con `EXECUTE` para `anon`, PostgREST las
-- publica en `/rest/v1/rpc/` y el freno se maneja desde afuera con la anon key:
-- `release_auth_email_slot` devuelve cupo consumido y `purge_old_auth_email_throttle` vacía
-- la tabla entera. O sea, el mecanismo que reemplaza al límite de GoTrue, desarmable por
-- quien debía frenar.
--
-- Por qué hace falta verificarlo y no alcanza con escribir el REVOKE: un proyecto Supabase
-- trae `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated` sobre
-- `public`, que le da a esos roles un grant DIRECTO. `REVOKE ... FROM PUBLIC` a secas NO lo
-- toca, y el resultado es una función que se lee cerrada en el archivo y está abierta en el
-- proyecto. Pasó con estas tres (hallazgo 2026-09-15, al pegar el módulo en el mirror).
DO $$
DECLARE v_abiertos text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_abiertos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('claim_auth_email_slot',
                       'release_auth_email_slot',
                       'purge_old_auth_email_throttle')
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('anon', p.oid, 'EXECUTE'));

  IF v_abiertos IS NOT NULL THEN
    RAISE EXCEPTION
      'El freno de correos de auth es ejecutable desde el cliente (PostgREST lo publica): %. Revocar a anon y authenticated, no solo a PUBLIC.',
      v_abiertos;
  END IF;

  RAISE NOTICE 'PASS — el freno de correos de auth solo lo maneja service_role';
END $$;

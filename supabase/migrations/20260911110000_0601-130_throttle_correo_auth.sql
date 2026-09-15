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
-- nuestro, con dos frenos:
--
--   * un mínimo de segundos entre dos correos al mismo destinatario, y
--   * un tope por ventana de una hora.
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
  'Freno de los correos de cuenta emitidos por la app (recuperación, alta). Una fila por destinatario. Se escribe únicamente vía claim_auth_email_slot().';
COMMENT ON COLUMN public.auth_email_throttle.window_start IS
  'Inicio de la ventana móvil de una hora. Se reinicia cuando la ventana vence.';
COMMENT ON COLUMN public.auth_email_throttle.sent_count IS
  'Correos concedidos dentro de la ventana en curso.';

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
-- Devuelve true si se puede mandar el correo, y en ese caso ya consumió el cupo.
--
-- La fila se asegura primero y se bloquea después: el `FOR UPDATE` es lo que impide que dos
-- pedidos simultáneos del mismo correo se concedan los dos. El segundo espera al primero y lee
-- el contador ya actualizado.
--
-- La decisión es explícita y no deducida del estado resultante. Deducirla comparando
-- `last_sent_at = now()` parece más corto y está mal: `now()` es constante dentro de una
-- transacción, así que dos llamadas seguidas ven el mismo instante y la segunda se lee como
-- concedida.

DROP FUNCTION IF EXISTS public.claim_auth_email_slot(text, integer, integer);

CREATE FUNCTION public.claim_auth_email_slot(
    p_email       text,
    p_max_por_hora integer DEFAULT 5,
    p_min_segundos integer DEFAULT 60
) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_ahora timestamp with time zone := now();
  v_fila  public.auth_email_throttle%ROWTYPE;
BEGIN
  IF v_email = '' THEN
    RETURN false;
  END IF;

  -- Asegura la fila sin pisarla si ya existe, para poder bloquearla en el paso siguiente.
  INSERT INTO public.auth_email_throttle (email_normalized, window_start, sent_count, last_sent_at)
  VALUES (v_email, v_ahora, 0, NULL)
  ON CONFLICT (email_normalized) DO NOTHING;

  SELECT * INTO v_fila
    FROM public.auth_email_throttle
   WHERE email_normalized = v_email
     FOR UPDATE;

  -- Ventana vencida: arranca una nueva y este correo es el primero.
  IF v_fila.window_start < v_ahora - interval '1 hour' THEN
    UPDATE public.auth_email_throttle
       SET window_start = v_ahora, sent_count = 1, last_sent_at = v_ahora
     WHERE email_normalized = v_email;
    RETURN true;
  END IF;

  -- Demasiado seguido al mismo destinatario.
  IF v_fila.last_sent_at IS NOT NULL
     AND v_fila.last_sent_at > v_ahora - make_interval(secs => p_min_segundos) THEN
    RETURN false;
  END IF;

  -- Tope de la ventana en curso.
  IF v_fila.sent_count >= p_max_por_hora THEN
    RETURN false;
  END IF;

  UPDATE public.auth_email_throttle
     SET sent_count = v_fila.sent_count + 1, last_sent_at = v_ahora
   WHERE email_normalized = v_email;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.claim_auth_email_slot(text, integer, integer) IS
  'Consume un cupo de correo de cuenta para ese destinatario. Devuelve true si se puede mandar (y ya descontó), false si está dentro del mínimo entre correos o pasó el tope de la ventana de una hora.';

REVOKE ALL ON FUNCTION public.claim_auth_email_slot(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_auth_email_slot(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auth_email_slot(text, integer, integer) TO service_role;

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

DROP FUNCTION IF EXISTS public.release_auth_email_slot(text);

CREATE FUNCTION public.release_auth_email_slot(p_email text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_filas integer;
BEGIN
  IF v_email = '' THEN
    RETURN false;
  END IF;

  UPDATE public.auth_email_throttle
     SET sent_count   = GREATEST(sent_count - 1, 0),
         last_sent_at = NULL
   WHERE email_normalized = v_email
     -- Sin cupo consumido no hay nada que devolver, y restar igual regalaría cupo de más.
     AND sent_count > 0;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  RETURN v_filas > 0;
END;
$$;

COMMENT ON FUNCTION public.release_auth_email_slot(text) IS
  'Devuelve el cupo que claim_auth_email_slot() ya descontó, para cuando el correo no llegó a salir (falla de Graph). Devuelve true si había algo que devolver. NO se usa cuando el correo sí salió.';

REVOKE ALL ON FUNCTION public.release_auth_email_slot(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_auth_email_slot(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_auth_email_slot(text) TO service_role;

-- ---------------------------------------------------------------------
-- D) Limpieza
-- ---------------------------------------------------------------------
--
-- La tabla es una fila por destinatario y no crece con el uso, pero una fila cuya ventana venció
-- hace días ya no dice nada. Se limpia con el mismo cron diario que purga notificaciones, para no
-- sumar un job más.

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

REVOKE ALL ON FUNCTION public.purge_old_auth_email_throttle() FROM PUBLIC;
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

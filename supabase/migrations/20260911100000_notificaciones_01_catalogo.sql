--
-- NOTIFICACIONES 01 — catálogo, lectura y contadores.
--
-- Espejo deliberado del catálogo de autorización (cero_13): la matriz de negocio vive en
-- `docs/matriz-notificaciones.md`, `tools/parse-matriz-notificaciones.py` la convierte en el
-- seed (archivo 02), y una sola función-portón decide quién recibe qué. Igual que nadie
-- escribe `role IN (...)` en una policy porque existe has_permission(), nadie debe decidir
-- destinatarios a mano en un trigger: para eso está notify_staff().
--
--   authorization_roles            -> (se reutiliza tal cual, FK)
--   authorization_permissions      -> notification_types
--   authorization_role_permissions -> notification_role_types
--   (sin equivalente)              -> notifications   <- instancias de evento
--
-- DOS FORMAS DE ENTREGA:
--   'event'     una fila por suceso, con leído/no leído. Avisa la TRANSICIÓN.
--   'aggregate' no se persiste: se calcula al vuelo. Mide el BACKLOG.
--   'email'     reservado para la fase de Microsoft Graph; hoy nada lo consume.
-- Un mismo hecho puede tener las dos formas cuando puede apilarse: el evento avisa que pasó,
-- el contador recuerda que sigue sin resolverse. En el panel nunca aparecen juntos.
--
-- ALCANCE (`scope_key`): describe QUÉ registros disparan la notificación para ese rol
-- (`own`, `assigned`, `practice`, `department`, `society`, `firm`). notify_staff() NO lo
-- evalúa — sólo verifica elegibilidad rol×tipo. Quien calcula los destinatarios concretos es
-- el disparador de cada módulo (archivo 03 y siguientes), y `scope_key` es su especificación.
--
-- Orden: este archivo primero, el seed (02) después — el seed tiene FK a notification_types.
-- Idempotente de punta a punta: re-pegable en el SQL Editor tras una aplicación parcial.
--

-- =====================================================================
-- A) Catálogo de tipos
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.notification_types (
    type_key      text PRIMARY KEY,
    module_key    text NOT NULL,
    label_key     text NOT NULL,
    delivery      text NOT NULL,
    display_order integer NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT true,
    -- Segundo eje, independiente de `delivery` (D-44): si el tipo ademas sale por correo. La
    -- bandeja de salida y la compuerta viven en la migracion 04; la columna vive aca porque el
    -- seed la escribe, y el seed corre antes.
    email_enabled boolean NOT NULL DEFAULT false,
    created_at    timestamp with time zone NOT NULL DEFAULT now(),
    updated_at    timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT notification_types_delivery_check
      CHECK (delivery IN ('event', 'aggregate', 'email')),
    CONSTRAINT notification_types_key_not_empty
      CHECK (btrim(type_key) <> '')
);

-- `CREATE TABLE IF NOT EXISTS` no agrega columnas a una tabla que ya existe: este ALTER es
-- lo que pone `email_enabled` en los ambientes donde este archivo ya se aplico antes de la
-- fase de correos. Desde cero es un no-op.
ALTER TABLE public.notification_types
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT false;

COMMENT ON TABLE public.notification_types IS
  'Catálogo de tipos de notificación. GENERADO desde docs/matriz-notificaciones.md por tools/parse-matriz-notificaciones.py — no editar filas a mano.';
COMMENT ON COLUMN public.notification_types.delivery IS
  'event = una fila por suceso en public.notifications; aggregate = contador calculado al vuelo, nunca se persiste; email = solo correo, sin fila en la campana (los recordatorios periodicos).';
COMMENT ON COLUMN public.notification_types.email_enabled IS
  'Si el tipo ademas sale por correo. GENERADO desde la columna CORREO de docs/matriz-notificaciones.md (D-44). Independiente de delivery: un event puede mandar los dos, y un email solo correo.';
COMMENT ON COLUMN public.notification_types.label_key IS
  'Clave i18n: notifications.types.<type_key>, en src/locales/{es,en}.json.';

-- =====================================================================
-- B) Matriz rol × tipo
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.notification_role_types (
    role_key   text NOT NULL REFERENCES public.authorization_roles(role_key) ON DELETE CASCADE,
    type_key   text NOT NULL REFERENCES public.notification_types(type_key) ON DELETE CASCADE,
    scope_key  text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (role_key, type_key),
    CONSTRAINT notification_role_types_scope_check
      CHECK (scope_key IN ('own', 'assigned', 'practice', 'department', 'society', 'firm'))
);

CREATE INDEX IF NOT EXISTS idx_notification_role_types_type
  ON public.notification_role_types (type_key);

COMMENT ON TABLE public.notification_role_types IS
  'Matriz rol x tipo de notificación (una fila = una concesión). GENERADA desde docs/matriz-notificaciones.md — no editar a mano.';
COMMENT ON COLUMN public.notification_role_types.scope_key IS
  'Qué registros disparan la notificación para ese rol. Lo consume el disparador de cada módulo; notify_staff() no lo evalúa.';

-- =====================================================================
-- C) Instancias de evento
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    notification_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_staff_id uuid NOT NULL REFERENCES public.staff(staff_id) ON DELETE CASCADE,
    type_key           text NOT NULL REFERENCES public.notification_types(type_key) ON DELETE CASCADE,
    entity_id          text,
    payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at         timestamp with time zone NOT NULL DEFAULT now(),
    read_at            timestamp with time zone
);

-- Bandeja del usuario: el único patrón de lectura del panel.
CREATE INDEX IF NOT EXISTS idx_notifications_inbox
  ON public.notifications (recipient_staff_id, created_at DESC);
-- Contador de no leídas: parcial, para que no crezca con el histórico ya leído.
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications (recipient_staff_id) WHERE read_at IS NULL;

COMMENT ON TABLE public.notifications IS
  'Instancias de notificación de tipo event. Se escriben ÚNICAMENTE vía notify_staff(); no hay policy de INSERT para authenticated.';

-- =====================================================================
-- C.2) La bandeja de salida de correos
-- =====================================================================
---------------------------------------------------------------------
--
-- Por qué una tabla y no llamar a la función de correo desde el trigger: el envío no puede vivir
-- dentro de la transacción de negocio. Si Graph tarda 20 s, la aprobación de la OT tarda 20 s; y si
-- el envío falla, no puede tumbar el INSERT del hecho. La bandeja desacopla las dos cosas y deja
-- rastro de qué se mandó, a quién y con qué error.

CREATE TABLE IF NOT EXISTS public.notification_emails (
    email_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- La idempotencia. Para lo derivado de un suceso es el notification_id; para un recordatorio,
    -- `type_key|staff_id|ventana`. Un cron que corre dos veces manda un correo, no dos.
    dedupe_key         text NOT NULL UNIQUE,
    notification_id    uuid REFERENCES public.notifications(notification_id) ON DELETE SET NULL,
    recipient_staff_id uuid NOT NULL REFERENCES public.staff(staff_id) ON DELETE CASCADE,
    to_email           text NOT NULL,
    -- El nombre se congela al encolar y no se resuelve al enviar: el correo saluda a quien era
    -- destinatario cuando ocurrio el hecho, y una baja o un cambio de apellido en el medio no
    -- deberia cambiar un mensaje ya generado.
    to_name            text,
    type_key           text NOT NULL REFERENCES public.notification_types(type_key) ON DELETE CASCADE,
    entity_id          text,
    payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
    status             text NOT NULL DEFAULT 'pending',
    attempts           integer NOT NULL DEFAULT 0,
    last_error         text,
    created_at         timestamp with time zone NOT NULL DEFAULT now(),
    sent_at            timestamp with time zone,
    CONSTRAINT notification_emails_status_check
      CHECK (status IN ('pending', 'sending', 'failed', 'sent'))
);

-- El único patrón de lectura del drenaje: lo pendiente, más viejo primero.
CREATE INDEX IF NOT EXISTS idx_notification_emails_pendientes
  ON public.notification_emails (created_at)
  WHERE status = 'pending';

-- Igual que `email_enabled`: el CREATE la declara para el replay desde cero, y el ALTER la
-- agrega donde la tabla ya existe.
ALTER TABLE public.notification_emails
  ADD COLUMN IF NOT EXISTS to_name text;

COMMENT ON TABLE public.notification_emails IS
  'Bandeja de salida de correos. Se escribe UNICAMENTE via notify_staff(); la drena la edge function send-notification-emails. Sin policies: no se lee desde el cliente.';
COMMENT ON COLUMN public.notification_emails.dedupe_key IS
  'Clave de idempotencia. Derivado de un suceso: el notification_id. Recordatorio: type_key|staff_id|ventana.';
COMMENT ON COLUMN public.notification_emails.notification_id IS
  'La fila de la campana que lo origino, si la hay. NULL en los recordatorios (delivery=email) y cuando la notificacion se descarta: el correo ya mandado sigue siendo un hecho.';

ALTER TABLE public.notification_emails ENABLE ROW LEVEL SECURITY;

-- Sin policies a propósito: sólo `service_role` toca esta tabla, y `service_role` no evalúa RLS.
REVOKE ALL ON TABLE public.notification_emails FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_emails FROM anon, authenticated;
GRANT ALL ON TABLE public.notification_emails TO service_role;


-- =====================================================================
-- C.3) De dónde vino un cambio de rol
-- =====================================================================
--
-- `auth.role.changed` manda correo (D-44), y el texto dice una cosa distinta según el cambio haya
-- sido directo o derivado de la categoría — el rol se deriva de ella (`sync_user_role_from_category`,
-- 0820-182), así que cambiar la categoría de alguien también dispara el aviso.
--
-- El trigger está sobre `user_roles` y ve el resultado, no la causa. La causa la anota quien la
-- conoce, en una variable de sesión local a la transacción (ver FASE 3.j en el archivo 03), y el
-- trigger la copia al payload. Determinístico, en vez de adivinar mirando si la categoría cambió
-- cerca en el tiempo.

CREATE OR REPLACE FUNCTION public.notif_origen_cambio_rol() RETURNS text
    LANGUAGE sql STABLE
    AS $BODY$
  SELECT COALESCE(NULLIF(current_setting('ems.role_change_source', true), ''), 'direct');
$BODY$;

COMMENT ON FUNCTION public.notif_origen_cambio_rol() IS
  'De donde vino el cambio de rol en curso: category si lo escribio sync_user_role_from_category, direct en cualquier otro caso. Lo consume el payload de auth.role.changed para elegir el texto del correo.';

-- =====================================================================
-- D) notify_staff() — el portón único
-- =====================================================================
--
-- No se llama `notify` a propósito: NOTIFY es una sentencia de PostgreSQL (LISTEN/NOTIFY) y
-- el choque de nombres confunde más de lo que ahorra.
--
-- Devuelve NULL —sin error— cuando el destinatario no corresponde. Eso es deliberado: un
-- disparador puede llamar a notify_staff() para todos los candidatos y dejar que la matriz
-- filtre, sin envolver cada llamada en un IF.
--
CREATE OR REPLACE FUNCTION public.notify_staff(
    p_type_key           text,
    p_recipient_staff_id uuid,
    p_entity_id          text  DEFAULT NULL,
    p_payload            jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_delivery        text;
  v_email_enabled   boolean;
  v_role_key        text;
  v_scope_key       text;
  v_notification_id uuid;
  v_email           text;
  v_nombre          text;
  v_dedupe          text;
BEGIN
  IF p_type_key IS NULL OR p_recipient_staff_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- El tipo debe existir y estar activo. Un type_key con typo no crea filas huérfanas.
  SELECT nt.delivery, nt.email_enabled INTO v_delivery, v_email_enabled
    FROM public.notification_types nt
   WHERE nt.type_key = p_type_key
     AND nt.is_active;

  -- Los `aggregate` se calculan al vuelo: no se persisten ni se mandan.
  IF v_delivery IS NULL OR v_delivery = 'aggregate' THEN
    RETURN NULL;
  END IF;

  -- Rol del DESTINATARIO (no del que dispara). Sin cuenta vinculada o sin rol, no hay aviso.
  -- El correo se trae acá mismo: es la misma fila.
  SELECT ur.role_key, s.email,
         btrim(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))
    INTO v_role_key, v_email, v_nombre
    FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
   WHERE s.staff_id = p_recipient_staff_id
     AND s.is_active
     AND s.deleted_at IS NULL;

  IF v_role_key IS NULL THEN
    RETURN NULL;
  END IF;

  -- El portón: la matriz decide, y de paso dice con qué alcance.
  SELECT nrt.scope_key INTO v_scope_key
    FROM public.notification_role_types nrt
   WHERE nrt.role_key = v_role_key
     AND nrt.type_key = p_type_key;

  IF v_scope_key IS NULL THEN
    RETURN NULL;
  END IF;

  -- La campana, sólo para los tipos que viven ahí.
  IF v_delivery = 'event' THEN
    INSERT INTO public.notifications (recipient_staff_id, type_key, entity_id, payload)
    VALUES (p_recipient_staff_id, p_type_key, p_entity_id, COALESCE(p_payload, '{}'::jsonb))
    RETURNING notification_id INTO v_notification_id;
  END IF;

  -- El correo. Tres condiciones, y las tres tienen que darse:
  --
  --   * el tipo está marcado en la matriz (D-44),
  --   * el destinatario tiene correo cargado — sin `staff.email` no hay a dónde mandarlo, y
  --   * el alcance no es `firm`, SALVO que sea un recordatorio.
  --
  -- Lo último es la regla que reemplaza a marcar 419 celdas: `firm` significa "ve toda la firma".
  -- Por campana eso es una lista; por correo POR SUCESO sería un mensaje por cada hecho de la
  -- empresa. La excepción es el recordatorio (`delivery = 'email'`), que es justamente el formato
  -- que le sirve a ese destinatario: un resumen por semana en vez de cien avisos sueltos.
  -- Excluirlo de los dos lo dejaría sin ninguna vía de correo, que no es lo que se decidió.
  IF v_email_enabled
     AND v_email IS NOT NULL
     AND btrim(v_email) <> ''
     AND (v_scope_key <> 'firm' OR v_delivery = 'email') THEN

    -- Para un evento alcanza el notification_id. Un recordatorio (delivery='email') no tiene, y
    -- su unicidad la define quien llama: pasa la ventana en el payload (`dedupe`), y si no la
    -- pasa cae a la fecha, que es la cadencia más fina que tiene sentido para un recordatorio.
    v_dedupe := COALESCE(
      v_notification_id::text,
      p_type_key || '|' || p_recipient_staff_id::text || '|' ||
        COALESCE(p_payload->>'dedupe', to_char(now(), 'YYYY-MM-DD')));

    INSERT INTO public.notification_emails
      (dedupe_key, notification_id, recipient_staff_id, to_email, to_name, type_key,
       entity_id, payload)
    VALUES
      (v_dedupe, v_notification_id, p_recipient_staff_id, btrim(v_email),
       NULLIF(v_nombre, ''), p_type_key, p_entity_id, COALESCE(p_payload, '{}'::jsonb))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN v_notification_id;
END;
$$;

COMMENT ON FUNCTION public.notify_staff(text, uuid, text, jsonb) IS
  'Porton unico de escritura. Inserta en la campana si delivery=event, y encola correo si el tipo tiene email_enabled, el destinatario tiene staff.email y su alcance no es firm (D-44). Devuelve el notification_id, o NULL si no corresponde (tambien cuando solo se encolo correo).';

-- Sin GRANT a `authenticated` a propósito: nadie notifica a mano desde el cliente. Los
-- disparadores de Fase 3+ deben ser SECURITY DEFINER (propiedad del owner) para poder
-- llamarla — un trigger sin SECURITY DEFINER corre como el usuario que hizo el INSERT y
-- se topa con "permission denied for function notify_staff". Es el comportamiento buscado.
REVOKE ALL ON FUNCTION public.notify_staff(text, uuid, text, jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_staff(text, uuid, text, jsonb) TO service_role;

-- =====================================================================
-- E) Vista legacy de la campana: expone `seen_at`
-- =====================================================================
--
-- `vw_staffing_alerts` (cero_02) alimenta el feed histórico de la campana. El mecanismo de
-- "visto" estaba construido a medias: existen la tabla `staff_alert_seen`, el hook que la
-- escribe y el frontend que evalúa `!a.seen_at`, pero la vista NUNCA devolvió esa columna.
-- Consecuencia: el panel marcaba todo como visto en cada apertura, nadie leía el resultado, y
-- el contador no bajaba nunca. Se agrega la columna que faltaba y nada más — el fan-out de
-- destinatarios sigue como estaba, y la vista entera se reemplaza por este catálogo cuando
-- sus 4 tipos migren a `notification_types`.
--
-- La vista es `security_invoker` y `staff_alert_seen` tiene RLS de sólo-lo-propio, así que el
-- LEFT JOIN no puede filtrar el "visto" de otro: si su fila no es visible, da NULL y la
-- alerta aparece como no vista. Correcto.
--
-- Se reemplaza con CREATE OR REPLACE y no con DROP + CREATE porque así preserva permisos y
-- dependencias. La lista de columnas crece al final, que es lo único que CREATE OR REPLACE
-- permite.
--

CREATE OR REPLACE VIEW public.vw_staffing_alerts WITH (security_invoker='true') AS
WITH base AS (
 SELECT 'timesheet_pending_approval'::text AS alert_type,
    c.category_name,
    (((((s_sub.first_name)::text || ' '::text) || (s_sub.last_name)::text) || ' — '::text) || (e.engagement_name)::text) AS description,
    tla.created_at AS detected_at,
    e.engagement_id,
    e.engagement_name,
    e.engagement_code,
    (tla.approval_id)::text AS entity_id,
        CASE
            WHEN (tla.created_at < (now() - '3 days'::interval)) THEN 'high'::text
            ELSE 'medium'::text
        END AS priority_level,
    tla.approved_by AS staff_id,
    (((s_apr.first_name)::text || ' '::text) || (s_apr.last_name)::text) AS staff_name,
    (1)::numeric AS required_count,
    tp.week_start_date AS start_date,
    (tp.week_start_date + 6) AS end_date
   FROM (((((public.timesheet_line_approvals tla
     JOIN public.timesheet_periods tp ON ((tp.period_id = tla.period_id)))
     JOIN public.engagements e ON ((e.engagement_id = tla.engagement_id)))
     JOIN public.staff s_sub ON ((s_sub.staff_id = tp.staff_id)))
     JOIN public.categories c ON ((c.category_id = s_sub.category_id)))
     JOIN public.staff s_apr ON ((s_apr.staff_id = tla.approved_by)))
  WHERE (((tla.status)::text = 'pending'::text) AND (tla.approved_by IS NOT NULL))
UNION ALL
 SELECT 'work_order_pending_approval'::text AS alert_type,
    NULL::character varying AS category_name,
    ('WO pendiente de aprobación — '::text || (e.engagement_name)::text) AS description,
    wo.created_at AS detected_at,
    e.engagement_id,
    e.engagement_name,
    e.engagement_code,
    (wo.wo_id)::text AS entity_id,
    'medium'::text AS priority_level,
    e.partner_id AS staff_id,
    (((s_partner.first_name)::text || ' '::text) || (s_partner.last_name)::text) AS staff_name,
    (1)::numeric AS required_count,
    e.start_date,
    e.end_date
   FROM ((public.work_orders wo
     JOIN public.engagements e ON ((e.engagement_id = wo.engagement_id)))
     JOIN public.staff s_partner ON ((s_partner.staff_id = e.partner_id)))
  WHERE (((wo.approval_status)::text = 'Pending_Approval'::text) AND (e.partner_id IS NOT NULL))
UNION ALL
 SELECT 'engagement_created'::text AS alert_type,
    NULL::character varying AS category_name,
    cl.client_legal_name AS description,
    e.created_at AS detected_at,
    e.engagement_id,
    e.engagement_name,
    e.engagement_code,
    (e.engagement_id)::text AS entity_id,
    'medium'::text AS priority_level,
    e.partner_id AS staff_id,
    (((s.first_name)::text || ' '::text) || (s.last_name)::text) AS staff_name,
    (1)::numeric AS required_count,
    e.start_date,
    e.end_date
   FROM ((public.engagements e
     JOIN public.clients cl ON ((cl.client_id = e.client_id)))
     JOIN public.staff s ON ((s.staff_id = e.partner_id)))
  WHERE ((e.partner_id IS NOT NULL) AND (e.created_at >= (now() - '7 days'::interval)))
UNION ALL
 SELECT 'engagement_created'::text AS alert_type,
    NULL::character varying AS category_name,
    cl.client_legal_name AS description,
    e.created_at AS detected_at,
    e.engagement_id,
    e.engagement_name,
    e.engagement_code,
    (e.engagement_id)::text AS entity_id,
    'medium'::text AS priority_level,
    e.manager_id AS staff_id,
    (((s.first_name)::text || ' '::text) || (s.last_name)::text) AS staff_name,
    (1)::numeric AS required_count,
    e.start_date,
    e.end_date
   FROM ((public.engagements e
     JOIN public.clients cl ON ((cl.client_id = e.client_id)))
     JOIN public.staff s ON ((s.staff_id = e.manager_id)))
  WHERE ((e.manager_id IS NOT NULL) AND (e.manager_id IS DISTINCT FROM e.partner_id) AND (e.created_at >= (now() - '7 days'::interval)))
UNION ALL
 SELECT 'new_user_registered'::text AS alert_type,
    c.category_name,
    (((s_new.first_name)::text || ' '::text) || (s_new.last_name)::text) AS description,
    s_new.created_at AS detected_at,
    NULL::uuid AS engagement_id,
    NULL::character varying AS engagement_name,
    NULL::character varying AS engagement_code,
    (s_new.staff_id)::text AS entity_id,
    'medium'::text AS priority_level,
    s_admin.staff_id,
    (((s_admin.first_name)::text || ' '::text) || (s_admin.last_name)::text) AS staff_name,
    (1)::numeric AS required_count,
    NULL::date AS start_date,
    NULL::date AS end_date
   FROM ((public.staff s_new
     JOIN public.categories c ON ((c.category_id = s_new.category_id)))
     CROSS JOIN ( SELECT s.staff_id,
            s.first_name,
            s.last_name
           FROM (public.staff s
             JOIN public.user_roles ur ON ((ur.user_id = s.auth_user_id)))
          WHERE ((ur.role = 'admin'::public.app_role) AND (s.is_active = true) AND (s.auth_user_id IS NOT NULL))) s_admin)
  WHERE ((s_new.is_active = true) AND (s_new.created_at >= (now() - '30 days'::interval)) AND (s_new.staff_id <> s_admin.staff_id))
)
 SELECT b.alert_type,
    b.category_name,
    b.description,
    b.detected_at,
    b.engagement_id,
    b.engagement_name,
    b.engagement_code,
    b.entity_id,
    b.priority_level,
    b.staff_id,
    b.staff_name,
    b.required_count,
    b.start_date,
    b.end_date,
    -- La columna que faltaba. NULL = no vista.
    sas.seen_at
   FROM base b
     LEFT JOIN public.staff_alert_seen sas
            ON ((sas.staff_id = b.staff_id)
            AND (sas.entity_id = b.entity_id)
            AND (sas.alert_type = b.alert_type));

COMMENT ON VIEW public.vw_staffing_alerts IS
  'Feed legacy de alertas de la campana. `seen_at` viene de staff_alert_seen (LEFT JOIN): NULL = no vista. Se reemplaza por el catálogo de notificaciones (notification_types/notifications) en la Fase 3.';

-- =====================================================================
-- F) Ajustes de la ventana de alarmas
-- =====================================================================
--
-- Independientes de `TS_EMPLOYEE_RETRO_DAYS`, que gobierna la EDICIÓN de semanas pasadas:
-- acoplarlas obligaría a restringir la edición para bajar el ruido de notificaciones, que es
-- una regresión funcional. Son dos preocupaciones distintas.
--
INSERT INTO public.global_settings (setting_key, setting_value, description) VALUES
  ('TS_ALERT_WINDOW_WEEKS', '4',
   'Semanas hacia atrás que miran las alarmas de timesheet de la campana (vencidos, revertidos, aprobaciones pendientes). Independiente de TS_EMPLOYEE_RETRO_DAYS, que gobierna la EDICIÓN. Rango aceptado 1-52; fuera de rango o no numérico cae a 4.'),
  ('TS_TRACKING_START_DATE', '',
   'Fecha (YYYY-MM-DD) desde la que la firma carga horas en EMS 2.0. Las semanas anteriores no generan alarmas de timesheet: nunca van a tener datos. Vacío = sin recorte. Hoy sólo afecta notificaciones.')
ON CONFLICT (setting_key) DO NOTHING;

-- =====================================================================
-- G) Contadores (delivery = 'aggregate')
-- =====================================================================
--
-- Cada contador es una función suelta y el despachador sólo los ensambla: con 10 módulos por
-- delante, reescribir get_my_notification_aggregates() entera cada vez que se agrega uno no
-- escala.
--

DROP FUNCTION IF EXISTS public.engagement_approval_bucket(uuid, text);

CREATE FUNCTION public.engagement_approval_bucket(p_staff_id uuid, p_status text)
    RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
           'count', COUNT(*),
           'items', COALESCE(jsonb_agg(jsonb_build_object(
                      'engagement_id',   e.engagement_id,
                      'engagement_code', e.engagement_code,
                      'engagement_name', e.engagement_name)
                    ORDER BY e.engagement_code), '[]'::jsonb))
    FROM public.engagements e
    JOIN public.work_orders wo ON wo.engagement_id = e.engagement_id
   WHERE e.created_by_staff_id = p_staff_id
     AND wo.approval_status = p_status
     AND (e.engagement_state_override IS NULL
          OR e.engagement_state_override NOT IN (6, 7));
$$;

COMMENT ON FUNCTION public.engagement_approval_bucket(uuid, text) IS
  'Helper de get_my_notification_aggregates(): encargos creados por p_staff_id cuya OT está en p_status, excluyendo Cancelado (6) y Finalizado (7).';

DROP FUNCTION IF EXISTS public.notif_agg_fund_disbursement_pending();
CREATE FUNCTION public.notif_agg_fund_disbursement_pending() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
    AS $$
  -- Aprobadas por el gerente y todavía sin desembolsar.
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.fund_requests
   WHERE status = 'aprobado_gerente' AND disbursed_at IS NULL;
$$;

DROP FUNCTION IF EXISTS public.notif_agg_fund_settlement_pending();
CREATE FUNCTION public.notif_agg_fund_settlement_pending() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
    AS $$
  -- En liquidación y sin liquidación registrada. La liquidación es de dos pasos manuales,
  -- así que `en_liquidacion` con settled_at NULL es exactamente "falta registrarla".
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.fund_requests
   WHERE status = 'en_liquidacion' AND settled_at IS NULL;
$$;

DROP FUNCTION IF EXISTS public.notif_agg_fund_closure_pending();
CREATE FUNCTION public.notif_agg_fund_closure_pending() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
    AS $$
  -- Liquidada pero sin cerrar: el segundo paso manual pendiente.
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.fund_requests
   WHERE settled_at IS NOT NULL AND closed_at IS NULL AND status <> 'cancelado';
$$;

DROP FUNCTION IF EXISTS public.notif_agg_fund_expense_review_pending();

CREATE FUNCTION public.notif_agg_fund_expense_review_pending() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.fund_requests fr
   WHERE fr.status = 'fondos_entregados'
     AND EXISTS (
       SELECT 1 FROM public.fund_request_expenses e
        WHERE e.fund_request_id = fr.fund_request_id
          AND e.status = 'aprobado_gerente'
     );
$BODY$;

COMMENT ON FUNCTION public.notif_agg_fund_expense_review_pending() IS
  'Contador "Gastos por revisar": solicitudes en fondos_entregados con algun gasto en aprobado_gerente. Mismo predicado que el tab expenses_review de FundRequestDisbursements (tabOf + expensePhase).';

-- =====================================================================
-- G.2) Contadores de cuotas del plan de pagos (módulo Órdenes de Trabajo)
-- =====================================================================
--
-- Los dos miden la misma cola desde dos lados y NO se solapan a propósito: "por vencer esta
-- semana" cuenta de hoy al domingo, "vencida" cuenta lo anterior a hoy. Una cuota que venció
-- el lunes de esta misma semana es vencida, no por vencer.
--
-- La fecha se calcula en America/La_Paz y no con CURRENT_DATE: la sesión de Postgres corre en
-- UTC, que entre las 20:00 y la medianoche local ya es el día siguiente, y el contador
-- adelantaría un día los vencimientos. Mismo criterio que finalize_due_engagements().
--

DROP FUNCTION IF EXISTS public.notif_agg_wo_installment_due_this_week();

CREATE FUNCTION public.notif_agg_wo_installment_due_this_week() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.wo_payment_installments i
   WHERE i.status <> 'Completed'
     AND i.agreed_payment_date IS NOT NULL
     AND i.agreed_payment_date >= (now() AT TIME ZONE 'America/La_Paz')::date
     AND i.agreed_payment_date <=
         (date_trunc('week', (now() AT TIME ZONE 'America/La_Paz')::date)::date + 6);
$BODY$;

COMMENT ON FUNCTION public.notif_agg_wo_installment_due_this_week() IS
  'Contador "Cuotas por vencer esta semana": cuotas no cobradas cuya fecha de pago acordada cae entre hoy y el domingo. Solo la matriz de Contabilidad lo recibe (alcance department), asi que no filtra por staff.';

DROP FUNCTION IF EXISTS public.notif_agg_wo_installment_overdue(uuid, text);

CREATE FUNCTION public.notif_agg_wo_installment_overdue(p_staff_id uuid, p_scope text)
    RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  -- Único contador del catálogo que la matriz reparte con DOS alcances: `assigned` para los
  -- gerentes (sus encargos) y `department` para Contabilidad y Cobranzas (todo). Por eso
  -- recibe el scope: sin él, un gerente vería la mora de toda la firma.
  --
  -- `items` sólo se llena en el caso `assigned`, que son pocas filas y se pintan como chips
  -- de COT en el panel. Para Contabilidad la lista puede ser de cientos y no aporta: el
  -- número manda a la pantalla, y la pantalla tiene los filtros.
  SELECT jsonb_build_object(
           'count', COUNT(*),
           'items', CASE WHEN p_scope = 'assigned'
                    THEN COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                           'engagement_id',   q.engagement_id,
                           'engagement_code', q.engagement_code)), '[]'::jsonb)
                    ELSE '[]'::jsonb END)
    FROM (
      SELECT e.engagement_id,
             COALESCE(e.engagement_code, '—') AS engagement_code
        FROM public.wo_payment_installments i
        JOIN public.work_orders w  ON w.wo_id = i.wo_id
        JOIN public.engagements e  ON e.engagement_id = w.engagement_id
       WHERE i.status <> 'Completed'
         AND (i.status = 'Overdue'
              OR (i.agreed_payment_date IS NOT NULL
                  AND i.agreed_payment_date < (now() AT TIME ZONE 'America/La_Paz')::date))
         AND (p_scope <> 'assigned'
              OR p_staff_id IN (e.manager_id, e.specialist_it_id, e.specialist_tax_id))
    ) q;
$BODY$;

COMMENT ON FUNCTION public.notif_agg_wo_installment_overdue(uuid, text) IS
  'Contador "Cuotas vencidas". Respeta el scope_key de la matriz: `assigned` limita a los encargos donde el staff es gerente (general o especialista); cualquier otro alcance cuenta toda la firma.';

-- =====================================================================
-- G.3) Contador de capacitación (módulo Aprobaciones de Timesheet)
-- =====================================================================
--
-- D-31: "entrenamiento" son las horas cargadas a un encargo de CAPACITACIÓN, y lo que los
-- identifica es `engagements.funcion = 2` (0 administrativa / 1 cliente / 2 capacitación /
-- 3 calidad, clasificación de 0827-184). Cierra la parte de negocio que el handoff dejó
-- abierta para `timesheet_admin_training_approval.manage` ("qué códigos/encargos las
-- identifican"); la mitad administrativa (`funcion = 0`) queda fuera porque la matriz no le
-- dio fila.
--
-- No filtra por persona: la matriz sólo lo concede con alcance `firm` (ADM) y `department`
-- (Talento Humano), que son justamente los que miran la cola completa. Exige el período
-- ENVIADO por el mismo motivo que `timesheet.pending_approval`: `unsubmit_timesheet_safe`
-- borra las líneas aprobadas pero deja las `pending`, así que una boleta retirada dejaría
-- filas pendientes que ya no esperan a nadie.
--

DROP FUNCTION IF EXISTS public.notif_agg_approval_training_pending();

CREATE FUNCTION public.notif_agg_approval_training_pending() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.timesheet_line_approvals tla
    JOIN public.timesheet_periods tp ON tp.period_id = tla.period_id
    JOIN public.engagements e        ON e.engagement_id = tla.engagement_id
   WHERE tla.status = 'pending'
     AND tp.submitted_at IS NOT NULL
     AND e.funcion = 2;
$BODY$;

COMMENT ON FUNCTION public.notif_agg_approval_training_pending() IS
  'Contador "Solicitudes de aprobacion de entrenamiento pendientes" (D-31): lineas de timesheet en pending, de periodos ya enviados, sobre encargos de capacitacion (engagements.funcion = 2). Sin filtro por persona: la matriz lo concede solo con alcance firm/department.';


-- =====================================================================
-- G.4) Contador de cobertura (módulo Scheduler)
-- =====================================================================
--
-- D-40: "gap de cobertura" = POSICIONES COMPROMETIDAS SIN CUBRIR. La OT aprobada declara
-- cuánta gente de cada categoría necesita (`wo_staffing_requirements.staff_count`); el
-- Scheduler asigna personas a ese encargo (`engagement_assignments`). El gap es la resta,
-- por categoría, y sólo cuando falta: sobrar gente no es un gap negativo.
--
-- NO son los 4 gaps de la edge function `scheduler-gaps` (headcount/horas/competencias/
-- banca vs pipeline): ésos son un tablero analítico con ventana de fechas, viven en Deno y
-- son de liderazgo firmwide. Un contador de campana necesita ser un número, calculable en
-- SQL y con el alcance de CADA rol; por eso éste se define aparte y más chico.
--
-- Tres alcances, que es lo que la matriz reparte: `firm` (ADM, Senior Partner), `society`
-- (Socio) y `assigned` (SQR, Director, gerentes y Senior). El pareo requerimiento↔asignación
-- va por (encargo, categoría) y no por `engagement_assignments.requirement_id`: esa columna
-- es NULLABLE y el Scheduler no siempre la llena, así que confiar en ella contaría como
-- descubierta una posición que sí tiene gente.
--

DROP FUNCTION IF EXISTS public.notif_agg_scheduler_coverage_gap(uuid, text);

CREATE FUNCTION public.notif_agg_scheduler_coverage_gap(p_staff_id uuid, p_scope text)
    RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
  WITH req AS (
    SELECT w.engagement_id,
           r.category_id,
           SUM(r.staff_count) AS required
      FROM public.wo_staffing_requirements r
      JOIN public.work_orders w ON w.wo_id = r.wo_id
      JOIN public.engagements e ON e.engagement_id = w.engagement_id
     WHERE w.approval_status = 'Approved'
       -- Encargo vivo: sin override, o en los dos estados que permiten trabajar (4 Aprobado,
       -- 5 Aprobado Emergencia). Cancelado/Finalizado/Rechazado no tienen cobertura que
       -- reclamar.
       AND (e.engagement_state_override IS NULL
            OR e.engagement_state_override IN (4, 5))
       AND (p_scope = 'firm'
            OR (p_scope = 'society'
                AND e.society_id = (SELECT s.society_id FROM public.staff s
                                     WHERE s.staff_id = p_staff_id))
            OR (p_scope NOT IN ('firm', 'society')
                AND p_staff_id IN (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id,
                                   e.specialist_it_id, e.specialist_tax_id)))
     GROUP BY w.engagement_id, r.category_id
  ), asignados AS (
    SELECT a.engagement_id,
           a.category_id,
           COUNT(DISTINCT a.staff_id) AS cubiertas
      FROM public.engagement_assignments a
     WHERE a.deleted_at IS NULL
       AND a.status <> 'CANCELLED'
     GROUP BY a.engagement_id, a.category_id
  ), gap AS (
    SELECT r.engagement_id,
           GREATEST(r.required - COALESCE(a.cubiertas, 0), 0) AS faltan
      FROM req r
      LEFT JOIN asignados a
             ON a.engagement_id = r.engagement_id
            AND a.category_id   = r.category_id
  )
  SELECT jsonb_build_object(
           'count', COALESCE(SUM(g.faltan), 0),
           -- `items` sólo en el alcance `assigned`, mismo criterio que wo.installment.overdue:
           -- son pocos encargos y se pintan como chips de COT. En `firm`/`society` la lista
           -- puede ser de cientos y el número ya manda a la pantalla, que tiene filtros.
           'items', CASE WHEN p_scope NOT IN ('firm', 'society')
                    THEN COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                           'engagement_id',   g.engagement_id,
                           'engagement_code', COALESCE(e.engagement_code, '—'))
                         ) FILTER (WHERE g.faltan > 0), '[]'::jsonb)
                    ELSE '[]'::jsonb END)
    FROM gap g
    JOIN public.engagements e ON e.engagement_id = g.engagement_id;
$BODY$;

COMMENT ON FUNCTION public.notif_agg_scheduler_coverage_gap(uuid, text) IS
  'Contador "Gap de cobertura" (D-40): posiciones que la OT aprobada pidio (wo_staffing_requirements.staff_count) y que el staffing vigente no cubre, por encargo y categoria. Respeta el scope_key de la matriz: firm / society / assigned. No son los 4 gaps analiticos de la edge function scheduler-gaps.';


-- Los tres contadores de timesheet, extraidos del despachador (D-44). Estaban escritos en linea
-- adentro de get_my_notification_aggregates(), que resuelve al usuario con get_my_staff_id(); el
-- cron de recordatorios no tiene usuario actual y no podia reusarlos. Duplicar el SQL era la otra
-- salida, y termina con la campana diciendo 3 y el correo diciendo 5.
--
-- `overdue` y `reverted` reciben las semanas YA calculadas en vez del staff_id: get_week_statuses()
-- es la parte cara y los dos miran la misma lista. Asi se calcula una vez por persona, que es lo
-- que hacia el despachador antes de esto.

DROP FUNCTION IF EXISTS public.notif_timesheet_window_start();

CREATE FUNCTION public.notif_timesheet_window_start() RETURNS date
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_raw    text;
  v_window integer := 4;
  v_start  date;
  v_from   date;
BEGIN
  -- Se valida con regex en vez de castear a ciegas: global_settings es texto libre y un valor
  -- mal tipeado por el admin no debe tumbar la campana entera.
  SELECT setting_value INTO v_raw
    FROM public.global_settings WHERE setting_key = 'TS_ALERT_WINDOW_WEEKS';
  IF v_raw ~ '^[0-9]+$' THEN
    v_window := LEAST(GREATEST(v_raw::integer, 1), 52);
  END IF;

  SELECT setting_value INTO v_raw
    FROM public.global_settings WHERE setting_key = 'TS_TRACKING_START_DATE';
  IF btrim(COALESCE(v_raw, '')) ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_start := btrim(v_raw)::date;
  END IF;

  v_from := CURRENT_DATE - (v_window * 7);
  -- La fecha de arranque del sistema solo puede ACORTAR la ventana, nunca alargarla.
  IF v_start IS NOT NULL AND v_start > v_from THEN
    v_from := v_start;
  END IF;

  RETURN v_from;
END;
$fn$;

COMMENT ON FUNCTION public.notif_timesheet_window_start() IS
  'Inicio de la ventana de las alarmas de timesheet: TS_ALERT_WINDOW_WEEKS semanas atras, recortada por TS_TRACKING_START_DATE. Un valor mal tipeado cae al default de 4 semanas.';

DROP FUNCTION IF EXISTS public.notif_agg_timesheet_overdue(jsonb);

CREATE FUNCTION public.notif_agg_timesheet_overdue(p_weeks jsonb) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $fn$
  SELECT jsonb_build_object(
           'count', COUNT(*),
           'missing_hours', COALESCE(SUM((w->>'missing_hours')::numeric), 0),
           'items', COALESCE(jsonb_agg(jsonb_build_object(
                      'week_start',    w->>'week_start',
                      'missing_hours', (w->>'missing_hours')::numeric
                    ) ORDER BY w->>'week_start' DESC), '[]'::jsonb))
    FROM jsonb_array_elements(COALESCE(p_weeks, '[]'::jsonb)) w
   WHERE w->>'status' IN ('NOT_LOGGED', 'NOT_SUBMITTED', 'DRAFT');
$fn$;

COMMENT ON FUNCTION public.notif_agg_timesheet_overdue(jsonb) IS
  'Semanas sin cargar o sin enviar, sobre la salida de get_week_statuses(). Lo consumen el despachador de la campana y el recordatorio diario.';

DROP FUNCTION IF EXISTS public.notif_agg_timesheet_reverted(jsonb);

CREATE FUNCTION public.notif_agg_timesheet_reverted(p_weeks jsonb) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $fn$
  SELECT jsonb_build_object(
           'count', COUNT(*),
           'items', COALESCE(jsonb_agg(jsonb_build_object('week_start', w->>'week_start')
                      ORDER BY w->>'week_start' DESC), '[]'::jsonb))
    FROM jsonb_array_elements(COALESCE(p_weeks, '[]'::jsonb)) w
   WHERE w->>'status' = 'REJECTED';
$fn$;

COMMENT ON FUNCTION public.notif_agg_timesheet_reverted(jsonb) IS
  'Semanas devueltas al colaborador, sobre la salida de get_week_statuses().';

DROP FUNCTION IF EXISTS public.notif_agg_timesheet_pending_approval(uuid, date);

CREATE FUNCTION public.notif_agg_timesheet_pending_approval(p_staff_id uuid, p_from date)
    RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
  -- DISTINCT obligatorio: timesheet_line_approvals es UNIQUE (period_id, engagement_id,
  -- activity_id), asi que sin el el COT se repetiria una vez por actividad.
  SELECT jsonb_build_object(
           'count', COUNT(*),
           'items', COALESCE(jsonb_agg(jsonb_build_object(
                      'week_start', week_start, 'cots', cots) ORDER BY week_start DESC),
                    '[]'::jsonb))
    FROM (
      SELECT tp.week_start_date AS week_start,
             COALESCE(jsonb_agg(DISTINCT e.engagement_code)
                      FILTER (WHERE e.engagement_code IS NOT NULL), '[]'::jsonb) AS cots
        FROM public.timesheet_periods tp
        JOIN public.timesheet_line_approvals tla ON tla.period_id = tp.period_id
        JOIN public.engagements e ON e.engagement_id = tla.engagement_id
       WHERE tp.staff_id = p_staff_id
         AND tp.submitted_at IS NOT NULL
         AND tla.status = 'pending'
         AND tp.week_start_date >= p_from
       GROUP BY tp.week_start_date
    ) q;
$fn$;

COMMENT ON FUNCTION public.notif_agg_timesheet_pending_approval(uuid, date) IS
  'Semanas enviadas por p_staff_id con lineas todavia en pending, desde p_from.';

DROP FUNCTION IF EXISTS public.get_my_notification_aggregates();

CREATE FUNCTION public.get_my_notification_aggregates() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_staff    uuid := public.get_my_staff_id();
  v_role     text;
  v_types    text[];
  v_weeks    jsonb;
  v_out      jsonb := '{}'::jsonb;
  v_from     date;
  v_scope_overdue text;
  v_scope_gap     text;
BEGIN
  IF v_staff IS NULL THEN
    RETURN v_out;
  END IF;

  SELECT ur.role_key INTO v_role
    FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
   WHERE s.staff_id = v_staff;

  IF v_role IS NULL THEN
    RETURN v_out;
  END IF;

  SELECT array_agg(nrt.type_key) INTO v_types
    FROM public.notification_role_types nrt
    JOIN public.notification_types nt ON nt.type_key = nrt.type_key
   WHERE nrt.role_key = v_role
     AND nt.is_active
     AND nt.delivery = 'aggregate';

  IF v_types IS NULL THEN
    RETURN v_out;
  END IF;

  -- ── Ventana de las alarmas de timesheet ──
  v_from := public.notif_timesheet_window_start();

  -- ── Timesheets ──
  IF v_types && ARRAY['timesheet.overdue','timesheet.reverted','timesheet.pending_approval'] THEN
    v_weeks := public.get_week_statuses(v_staff, v_from, CURRENT_DATE);
  END IF;

  IF 'timesheet.overdue' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('timesheet.overdue',
               public.notif_agg_timesheet_overdue(v_weeks));
  END IF;

  IF 'timesheet.reverted' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('timesheet.reverted',
               public.notif_agg_timesheet_reverted(v_weeks));
  END IF;

  IF 'timesheet.pending_approval' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('timesheet.pending_approval',
               public.notif_agg_timesheet_pending_approval(v_staff, v_from));
  END IF;

  -- ── Encargos generados: estado actual de la OT, no una ventana ──
  IF 'engagement.rejected_by_partner' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('engagement.rejected_by_partner',
                        public.engagement_approval_bucket(v_staff, 'Rejected'));
  END IF;
  IF 'engagement.pending_partner_approval' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('engagement.pending_partner_approval',
                        public.engagement_approval_bucket(v_staff, 'Pending_Approval'));
  END IF;

  -- ── Solicitudes de Fondos: cola de trabajo de Contabilidad ──
  IF 'fund.disbursement.pending' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('fund.disbursement.pending',
                        public.notif_agg_fund_disbursement_pending());
  END IF;
  IF 'fund.expense.review_pending' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('fund.expense.review_pending',
                        public.notif_agg_fund_expense_review_pending());
  END IF;
  IF 'fund.settlement.pending' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('fund.settlement.pending',
                        public.notif_agg_fund_settlement_pending());
  END IF;
  IF 'fund.request.closure_pending' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('fund.request.closure_pending',
                        public.notif_agg_fund_closure_pending());
  END IF;

  -- ── Órdenes de Trabajo: cuotas del plan de pagos (FASE 3.b) ──
  IF 'wo.installment.due_this_week' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('wo.installment.due_this_week',
                        public.notif_agg_wo_installment_due_this_week());
  END IF;
  IF 'wo.installment.overdue' = ANY (v_types) THEN
    -- El scope viene de la matriz, no de una constante: el mismo contador vale `assigned`
    -- para un gerente y `department` para Contabilidad.
    SELECT nrt.scope_key INTO v_scope_overdue
      FROM public.notification_role_types nrt
     WHERE nrt.role_key = v_role
       AND nrt.type_key = 'wo.installment.overdue';

    v_out := v_out || jsonb_build_object('wo.installment.overdue',
                        public.notif_agg_wo_installment_overdue(v_staff, v_scope_overdue));
  END IF;

  -- ── Aprobaciones de Timesheet: capacitación (FASE 3.d) ──
  IF 'approval.training_pending' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('approval.training_pending',
                        public.notif_agg_approval_training_pending());
  END IF;

  -- ── Scheduler: cobertura (FASE 3.h) ──
  -- Segundo contador que necesita el scope de la matriz, y el primero con TRES alcances
  -- distintos (firm / society / assigned).
  IF 'scheduler.coverage_gap' = ANY (v_types) THEN
    SELECT nrt.scope_key INTO v_scope_gap
      FROM public.notification_role_types nrt
     WHERE nrt.role_key = v_role
       AND nrt.type_key = 'scheduler.coverage_gap';

    v_out := v_out || jsonb_build_object('scheduler.coverage_gap',
                        public.notif_agg_scheduler_coverage_gap(v_staff, v_scope_gap));
  END IF;

  RETURN v_out;
END;
$BODY$;

COMMENT ON FUNCTION public.get_my_notification_aggregates() IS
  'Contadores (delivery=aggregate) del usuario actual, gateados por notification_role_types. Timesheet respeta TS_ALERT_WINDOW_WEEKS/TS_TRACKING_START_DATE; wo.installment.overdue respeta el scope_key de la matriz; approval.training_pending cuenta la cola de capacitacion (funcion=2); scheduler.coverage_gap respeta firm/society/assigned. Definido una sola vez: no hay una version anterior que pisar.';


-- =====================================================================
-- H) Lectura de la bandeja
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_my_notifications(integer);

CREATE FUNCTION public.get_my_notifications(p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff  uuid := public.get_my_staff_id();
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_events jsonb;
  v_unread integer;
BEGIN
  -- Fail-closed: una cuenta sin ficha de staff no ve nada, igual que
  -- get_my_authorization_context() con un usuario sin rol.
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('events', '[]'::jsonb,
                              'aggregates', '{}'::jsonb,
                              'unread_count', 0);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'notification_id', n.notification_id,
           'type_key',        n.type_key,
           'module_key',      nt.module_key,
           'label_key',       nt.label_key,
           'entity_id',       n.entity_id,
           'payload',         n.payload,
           'created_at',      n.created_at,
           'read_at',         n.read_at) ORDER BY n.created_at DESC), '[]'::jsonb)
    INTO v_events
    FROM (
      SELECT * FROM public.notifications
       WHERE recipient_staff_id = v_staff
       ORDER BY created_at DESC
       LIMIT v_limit
    ) n
    JOIN public.notification_types nt ON nt.type_key = n.type_key
   WHERE nt.is_active;

  SELECT COUNT(*) INTO v_unread
    FROM public.notifications
   WHERE recipient_staff_id = v_staff
     AND read_at IS NULL;

  RETURN jsonb_build_object(
    'events',       v_events,
    'aggregates',   public.get_my_notification_aggregates(),
    'unread_count', v_unread);
END;
$$;

COMMENT ON FUNCTION public.get_my_notifications(integer) IS
  'Bandeja del usuario actual: eventos (public.notifications) + contadores (get_my_notification_aggregates) + no leídas. Fail-closed sin ficha de staff.';

DROP FUNCTION IF EXISTS public.mark_notifications_read(uuid[]);

CREATE FUNCTION public.mark_notifications_read(p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff uuid := public.get_my_staff_id();
  v_count integer;
BEGIN
  IF v_staff IS NULL OR p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- El filtro por recipient_staff_id es lo que impide marcar como leída la notificación de
  -- otro pasando su uuid. No se re-marca lo ya leído (read_at IS NULL).
  UPDATE public.notifications
     SET read_at = now()
   WHERE notification_id = ANY (p_ids)
     AND recipient_staff_id = v_staff
     AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.mark_notifications_read(uuid[]) IS
  'Marca como leídas las notificaciones propias. Ignora ids ajenos: el UPDATE filtra por recipient_staff_id = get_my_staff_id().';

-- =====================================================================
-- H.2) Descarte manual — la "x" de cada fila
-- =====================================================================
--
-- Borra de verdad, y no marca `dismissed_at`: cada notificación tiene UN solo destinatario,
-- así que la fila es enteramente suya y descartarla no le saca nada a nadie. Tampoco hay
-- valor de auditoría que preservar — el hecho que la originó vive en su propia tabla
-- (el encargo, la OT, la boleta), y esto es sólo el aviso.
--
-- Es también lo que hace que el descarte SIRVA para el tamaño de la tabla: un `dismissed_at`
-- dejaría la fila ahí y la limpieza seguiría dependiendo entera del cron de retención.
--
DROP FUNCTION IF EXISTS public.dismiss_notifications(uuid[]);

CREATE FUNCTION public.dismiss_notifications(p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff uuid := public.get_my_staff_id();
  v_count integer;
BEGIN
  IF v_staff IS NULL OR p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- El filtro por recipient_staff_id es lo que impide borrar la notificación de otro
  -- pasando su uuid, igual que en mark_notifications_read().
  DELETE FROM public.notifications
   WHERE notification_id = ANY (p_ids)
     AND recipient_staff_id = v_staff;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.dismiss_notifications(uuid[]) IS
  'Descarta (BORRA) notificaciones propias, una o varias. Ignora ids ajenos: el DELETE filtra por recipient_staff_id = get_my_staff_id(). No hay policy de DELETE para authenticated — esta es la unica via.';

-- =====================================================================
-- H.3) Retención — el cron que acota la tabla
-- =====================================================================
--
-- El descarte manual no alcanza y nunca va a alcanzar: quien no abre la campana no descarta
-- nada, y las notificaciones de alguien que se fue de la firma no las descarta nadie.
--
-- DOS VENTANAS, porque no significan lo mismo. Una LEÍDA ya cumplió su propósito: 30 días es
-- historial de sobra para "¿qué pasó la semana pasada?". Una NO LEÍDA todavía tiene algo que
-- decir, así que aguanta 90 — pero no para siempre: un aviso de hace tres meses que nadie
-- miró no se va a mirar nunca, y a esa altura el hecho lo cuenta la pantalla del módulo.
--
-- Los dos plazos son configurables por `global_settings` con el mismo patrón que
-- TS_ALERT_WINDOW_WEEKS: se validan con regex antes de castear, porque es texto libre que
-- edita un admin y un valor mal tipeado no debe romper el cron ni —peor— borrar de más.
--
INSERT INTO public.global_settings (setting_key, setting_value, description) VALUES
  ('NOTIF_RETENTION_READ_DAYS', '30',
   'Dias que sobrevive una notificacion YA LEIDA antes de que la borre el cron de retencion. Rango aceptado 1-3650; fuera de rango o no numerico cae a 30.'),
  ('NOTIF_RETENTION_UNREAD_DAYS', '90',
   'Dias que sobrevive una notificacion SIN LEER antes de que la borre el cron de retencion. Siempre mayor o igual que NOTIF_RETENTION_READ_DAYS. Rango aceptado 1-3650; fuera de rango o no numerico cae a 90.')
ON CONFLICT (setting_key) DO NOTHING;

DROP FUNCTION IF EXISTS public.purge_old_notifications();

CREATE FUNCTION public.purge_old_notifications() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $BODY$
DECLARE
  v_raw    text;
  v_read   integer := 30;
  v_unread integer := 90;
  v_count  integer;
BEGIN
  SELECT setting_value INTO v_raw
    FROM public.global_settings WHERE setting_key = 'NOTIF_RETENTION_READ_DAYS';
  IF v_raw ~ '^[0-9]+$' THEN
    v_read := LEAST(GREATEST(v_raw::integer, 1), 3650);
  END IF;

  SELECT setting_value INTO v_raw
    FROM public.global_settings WHERE setting_key = 'NOTIF_RETENTION_UNREAD_DAYS';
  IF v_raw ~ '^[0-9]+$' THEN
    v_unread := LEAST(GREATEST(v_raw::integer, 1), 3650);
  END IF;

  -- Una no leída nunca vive MENOS que una leída: si el admin invierte los valores, gana el
  -- más conservador en vez de borrar avisos que nadie vio todavía.
  v_unread := GREATEST(v_unread, v_read);

  DELETE FROM public.notifications
   WHERE (read_at IS NOT NULL AND created_at < now() - make_interval(days => v_read))
      OR (read_at IS NULL     AND created_at < now() - make_interval(days => v_unread));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$BODY$;

COMMENT ON FUNCTION public.purge_old_notifications() IS
  'Retencion de public.notifications: borra las leidas mas viejas que NOTIF_RETENTION_READ_DAYS (30) y las no leidas mas viejas que NOTIF_RETENTION_UNREAD_DAYS (90). Una no leida nunca vive menos que una leida. Devuelve cuantas borro.';

REVOKE ALL ON FUNCTION public.purge_old_notifications() FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_old_notifications() TO service_role;

-- Mismo guard de pg_cron que el resto. '30 5 * * *' UTC ≈ 01:30 America/La_Paz: de
-- madrugada, porque a diferencia de los crons de aviso a nadie le importa la hora y conviene
-- que el DELETE no compita con la jornada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-purge-daily') THEN
      PERFORM cron.unschedule('notif-purge-daily');
    END IF;
    PERFORM cron.schedule(
      'notif-purge-daily',
      '30 5 * * *',
      $cron$SELECT public.purge_old_notifications();$cron$
    );
  END IF;
END $$;

-- =====================================================================
-- H.4) El drenaje de correos
-- =====================================================================
---------------------------------------------------------------------
--
-- `FOR UPDATE SKIP LOCKED` es el control de concurrencia: dos drenajes simultáneos se reparten
-- las filas en vez de pelearse por las mismas. Es lo que hace que el cron pueda correr cada 5
-- minutos sin coordinar nada.

DROP FUNCTION IF EXISTS public.claim_notification_emails(integer);

CREATE FUNCTION public.claim_notification_emails(p_limit integer DEFAULT 50)
RETURNS TABLE (
    email_id   uuid,
    to_email   text,
    to_name    text,
    type_key   text,
    entity_id  text,
    payload    jsonb,
    attempts   integer
)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH tomadas AS (
    SELECT e.email_id
      FROM public.notification_emails e
     WHERE e.status = 'pending'
     ORDER BY e.created_at
     LIMIT GREATEST(COALESCE(p_limit, 50), 0)
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_emails e
     SET status = 'sending', attempts = e.attempts + 1
    FROM tomadas t
   WHERE e.email_id = t.email_id
  RETURNING e.email_id, e.to_email, e.to_name, e.type_key, e.entity_id, e.payload, e.attempts;
END;
$$;

COMMENT ON FUNCTION public.claim_notification_emails(integer) IS
  'Reclama hasta p_limit correos pendientes y los marca sending. FOR UPDATE SKIP LOCKED: dos drenajes simultaneos no toman la misma fila.';

REVOKE ALL ON FUNCTION public.claim_notification_emails(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_emails(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_emails(integer) TO service_role;

-- Tope de intentos. Tres es suficiente para cubrir una caída de red o un 500 pasajero; más que
-- eso es un problema de configuración, y reintentarlo cada 5 minutos para siempre sólo esconde
-- el error en vez de mostrarlo.
DROP FUNCTION IF EXISTS public.mark_notification_email_result(uuid, boolean, text);

CREATE FUNCTION public.mark_notification_email_result(
    p_email_id uuid,
    p_ok       boolean,
    p_error    text DEFAULT NULL
) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_intentos integer;
BEGIN
  IF p_email_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_ok THEN
    UPDATE public.notification_emails
       SET status = 'sent', sent_at = now(), last_error = NULL
     WHERE email_id = p_email_id;
    RETURN FOUND;
  END IF;

  SELECT attempts INTO v_intentos
    FROM public.notification_emails
   WHERE email_id = p_email_id;

  IF v_intentos IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.notification_emails
     SET status     = CASE WHEN v_intentos >= 3 THEN 'failed' ELSE 'pending' END,
         last_error = p_error
   WHERE email_id = p_email_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.mark_notification_email_result(uuid, boolean, text) IS
  'Cierra un correo reclamado: sent si salio, de vuelta a pending para reintentar, o failed al tercer intento.';

REVOKE ALL ON FUNCTION public.mark_notification_email_result(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_email_result(uuid, boolean, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_email_result(uuid, boolean, text) TO service_role;


-- =====================================================================
-- H.5) Retención de correos
-- =====================================================================
---------------------------------------------------------------------
--
-- Las `sent` viejas no dicen nada: el hecho vive en su módulo y el correo ya llegó. Las `failed`
-- se conservan — son el registro de lo que NO llegó, y borrarlas es perder la única pista de que
-- alguien nunca se enteró de algo.

CREATE OR REPLACE FUNCTION public.purge_old_notification_emails()
RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_borrados integer;
BEGIN
  DELETE FROM public.notification_emails
   WHERE status = 'sent'
     AND COALESCE(sent_at, created_at) < now() - interval '30 days';
  GET DIAGNOSTICS v_borrados = ROW_COUNT;
  RETURN v_borrados;
END;
$$;

COMMENT ON FUNCTION public.purge_old_notification_emails() IS
  'Borra los correos enviados hace mas de 30 dias. Conserva los failed: son el registro de lo que no llego.';

REVOKE ALL ON FUNCTION public.purge_old_notification_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_notification_emails() TO service_role;

-- Mismo horario y mismo guard que el resto de los crons del catálogo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-email-purge-daily') THEN
      PERFORM cron.unschedule('notif-email-purge-daily');
    END IF;
    PERFORM cron.schedule(
      'notif-email-purge-daily',
      '35 5 * * *',
      $cron$SELECT public.purge_old_notification_emails();$cron$
    );
  END IF;
END $$;


-- =====================================================================
-- I) RLS
-- =====================================================================

ALTER TABLE public.notification_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_role_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;

-- Los dos catálogos son de lectura pública para cualquier autenticado (mismo criterio que
-- authorization_permissions): el frontend necesita las etiquetas y el delivery para pintar el
-- panel. La escritura es exclusiva del seed, que corre como owner.
DROP POLICY IF EXISTS notification_types_read ON public.notification_types;
CREATE POLICY notification_types_read ON public.notification_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS notification_role_types_read ON public.notification_role_types;
CREATE POLICY notification_role_types_read ON public.notification_role_types
  FOR SELECT TO authenticated USING (true);

-- Cada quien ve sólo su bandeja. NO hay policy de INSERT ni de UPDATE a propósito: la única
-- vía de escritura es notify_staff() / mark_notifications_read(), ambas SECURITY DEFINER.
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_staff_id = public.get_my_staff_id());

-- =====================================================================
-- I.2) Realtime — la campana se entera sola
-- =====================================================================
--
-- Sin esto el panel depende del polling (5 min) y un aviso puede tardar eso en aparecer: el
-- usuario recarga la página para verlo, que es exactamente lo que se reportó probando.
--
-- SÓLO INSERT, y por eso no hace falta `REPLICA IDENTITY FULL`: lo que tiene que llegar solo
-- es la notificación NUEVA. El "leído" y el descarte los origina el propio usuario en su
-- pestaña, y ahí el hook ya invalida la query por su cuenta; escuchar DELETE obligaría a
-- publicar la fila vieja completa para poder filtrarla por destinatario.
--
-- Realtime respeta RLS: `notifications_select_own` ya limita cada bandeja a su dueño, así que
-- el filtro por `recipient_staff_id` del cliente es una optimización, no el control.
--
-- El guard existe porque la publicación `supabase_realtime` la crea la plataforma: en el
-- harness local (Postgres liso) no existe, y la migración no debe fallar por eso.
--
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename  = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;

-- =====================================================================
-- J) Grants de tabla
-- =====================================================================

GRANT SELECT ON public.notification_types      TO authenticated;
GRANT SELECT ON public.notification_role_types TO authenticated;
GRANT SELECT ON public.notifications           TO authenticated;

GRANT ALL ON public.notification_types      TO service_role;
GRANT ALL ON public.notification_role_types TO service_role;
GRANT ALL ON public.notifications           TO service_role;

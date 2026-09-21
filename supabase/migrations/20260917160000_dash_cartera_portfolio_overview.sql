-- FEAT dash_cartera: rediseño de la pestaña Cartera -- backend (bugs/dashboard/cartera/
-- plan_v2.md, secciones 6 y 7; decisiones de negocio en bugs/dashboard/cartera/decisiones.md).
--
-- Contenido, en orden (idempotente: CREATE OR REPLACE / DROP ... IF EXISTS / IF NOT EXISTS
-- en todo el archivo, per plan_v2.md §10):
--   1. tabla portfolio_events (bitácora append-only de partner_id/manager_id, SIN backfill,
--      decisiones.md §7.2) + índice + RLS sin policies + trigger anti-UPDATE/DELETE
--   2. log_engagement_assignment_change() + trigger AFTER UPDATE en public.engagements
--   3. portfolio_overview()  (plan_v2.md §7.1/§7.2/§7.3 -- ~28 CTEs, payload de un round-trip)
--   4. COMMENT ON de los 3 objetos + REVOKE ALL FROM PUBLIC + GRANT EXECUTE a
--      authenticated/service_role
--
-- DEPENDENCIA DURA (plan_v2.md §6.1, R1): esta migración usa
-- public.effective_engagement_state(smallint, boolean, uuid, text, text, timestamptz) y
-- public.latest_exchange_rate(), creadas por 20260915130000_dash_socio_partner_overview.sql.
-- Debe aplicarse DESPUÉS de esa migración (timestamp posterior + orden explícito en
-- supabase/tests/local/run-rls-tests.sh).
--
-- El permiso dashboard.portfolio.read YA existe con las 8 concesiones exactas de
-- decisiones.md §2 (cero_13:323-330: admin/senior_partner=firm, partner/director/manager/
-- ita_manager/tax_manager/risk_partner=assigned_engagements|department) -- esta migración NO
-- toca authorization_permissions ni authorization_role_permissions.
--
-- Nada de esto se aplica aquí a ningún Supabase real (ni Lovable, ni Dev 2.0, ni Test) --
-- solo se crea el archivo, per instrucción explícita del operador.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. portfolio_events -- bitácora append-only de partner_id/manager_id (decisiones.md §7.2)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Solo 2 tipos de evento: son los únicos que decisiones.md §7.2 declara NO derivables de una
-- columna real. engagement_created/work_order_approved/risk_approved se leen directo de
-- engagements.created_at / work_orders.approved_at / work_orders.risk_approved_at -- no se
-- duplican acá. Sin FK a engagements: la evidencia de auditoría debe sobrevivir al ciclo de
-- vida del encargo (si algún día se permite borrar un encargo, la bitácora no se cae con él).

CREATE TABLE IF NOT EXISTS public.portfolio_events (
  event_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id     uuid NOT NULL,
  event_type        text NOT NULL,
  subject_staff_id  uuid,                         -- staff que pasa a ocupar el rol (NEW)
  previous_staff_id uuid,                         -- staff anterior (OLD), nullable
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  actor_user_id     uuid,                         -- auth.uid(), nullable en contextos de servicio
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_events_type_check
    CHECK (event_type IN ('partner_assigned', 'manager_assigned'))
);

CREATE INDEX IF NOT EXISTS idx_portfolio_events_engagement_occurred
  ON public.portfolio_events (engagement_id, occurred_at DESC);

-- RLS activo SIN ninguna policy -> ningún cliente (authenticated/anon) puede leer ni escribir
-- directo. La única escritura es el trigger de bitácora (SECURITY DEFINER); la única lectura
-- es portfolio_overview() (SECURITY DEFINER, ya filtrado por alcance).
ALTER TABLE public.portfolio_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portfolio_events FROM PUBLIC, authenticated;

-- Append-only incluso para el owner/service_role: ni el propio trigger de bitácora hace
-- UPDATE/DELETE nunca, así que esto no le afecta a él, solo bloquea correcciones manuales.
CREATE OR REPLACE FUNCTION public.portfolio_events_append_only() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'portfolio_events es append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_portfolio_events_append_only ON public.portfolio_events;
CREATE TRIGGER trg_portfolio_events_append_only
  BEFORE UPDATE OR DELETE ON public.portfolio_events
  FOR EACH ROW EXECUTE FUNCTION public.portfolio_events_append_only();

COMMENT ON TABLE public.portfolio_events IS 'dash_cartera (decisiones.md §7.2, plan_v2.md §6.2): bitácora append-only de cambios de partner_id/manager_id en engagements -- únicos 2 eventos de Hitos que no se pueden derivar de una columna real ya existente. RLS activo SIN policies (nadie la lee/escribe directo) + trigger anti-UPDATE/DELETE. Arranca vacía -- SIN backfill retroactivo (decisiones.md §7.2 lo prohíbe explícitamente); hasta que acumule datos, el hito "assignment" no tiene qué mostrar.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2. log_engagement_assignment_change() -- trigger de bitácora en public.engagements
-- ═══════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_engagement_assignment_change()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
    INSERT INTO public.portfolio_events (engagement_id, event_type, subject_staff_id, previous_staff_id, actor_user_id)
    VALUES (NEW.engagement_id, 'partner_assigned', NEW.partner_id, OLD.partner_id, auth.uid());
  END IF;
  IF NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
    INSERT INTO public.portfolio_events (engagement_id, event_type, subject_staff_id, previous_staff_id, actor_user_id)
    VALUES (NEW.engagement_id, 'manager_assigned', NEW.manager_id, OLD.manager_id, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_engagements_log_assignment ON public.engagements;
CREATE TRIGGER trg_engagements_log_assignment
  AFTER UPDATE OF partner_id, manager_id ON public.engagements
  FOR EACH ROW EXECUTE FUNCTION public.log_engagement_assignment_change();

COMMENT ON FUNCTION public.log_engagement_assignment_change() IS 'dash_cartera (decisiones.md §7.2, plan_v2.md §6.2): inserta en portfolio_events cuando partner_id/manager_id cambian de valor (IS DISTINCT FROM, cubre NULL). AFTER UPDATE OF esas 2 columnas -> un UPDATE de engagements que no las toque nunca dispara este trigger. RETURN NULL (AFTER trigger, el valor de retorno se ignora). SECURITY DEFINER porque portfolio_events no tiene ninguna policy de INSERT para authenticated.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 3. portfolio_overview() -- RPC principal (decisiones.md §4-§8; plan_v2.md §7.1/§7.2/§7.3)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER + plpgsql: usa el JWT del llamante vía get_my_staff_id()/current_role_key(),
-- gateado por has_permission('dashboard.portfolio.read'), fail-closed. Un solo round-trip: 5
-- KPI + 8 bloques del cuerpo en un único jsonb. `staff` se lee solo con columnas explícitas
-- (staff_id, short_name, first_name, last_name, category_id, practica_id) -- nunca staff(*)
-- (memoria del proyecto: staff.SELECT endurecida por columna).
--
-- KPI 3 se apoya en categories.default_role_key (D-1, plan_v2.md §16): agrupa las categorías
-- que comparten rol, de modo que un gerente sume 'Gerente' y 'Gerente/Asociado Senior' (LEG)
-- y excluya specialist_it/specialist_tax. 2026-09-20: ya no está clavado en 'manager' -- usa
-- el role_key de la categoría de quien mira (ver caller_category / my_role_scope_fy), con
-- respaldo por nombre de categoría cuando default_role_key está sin poblar.
--
-- KPI 4 (D-2, plan_v2.md §16): opera sobre scope_fy COMPLETO (el encargo cuenta si el
-- llamante es su socio *o* su gerente), no solo sobre manager_scope_fy -- a propósito
-- distinto de KPI 3, que sigue siendo el indicador personal "como Gerente".
--
-- El RPC NUNCA lee authorization_role_permissions.scope_key -- el alcance de risk_partner es
-- IDÉNTICO al de partner/director/manager (partner_id=yo OR manager_id=yo), no departamental
-- (decisiones.md §2 nota).

-- 2026-09-20: p_practica_id se agregó como parámetro nuevo con DEFAULT, así que el CREATE OR
-- REPLACE de abajo NO reemplaza la versión de 6 argumentos -- crea una SEGUNDA sobrecarga y
-- la vieja queda viva, congelada con la lógica de antes. Confirmado en el ambiente de Test
-- del operador (2026-09-20): las 2 firmas coexistían, y PostgREST resuelve por el conjunto de
-- nombres de parámetro que manda el cliente, así que cualquier llamador que omita
-- p_practica_id cae en la obsoleta. IF EXISTS la hace idempotente donde nunca existió.
DROP FUNCTION IF EXISTS public.portfolio_overview(date, date, integer, date, date, uuid);

CREATE OR REPLACE FUNCTION public.portfolio_overview(
  p_start        date,
  p_end          date,
  p_fiscal_year  integer,
  p_fy_start     date,
  p_fy_end       date,
  p_client_id    uuid DEFAULT NULL,
  -- 2026-09-19: filtro de Práctica, pedido del operador para admin/senior_partner -- ver
  -- comentario de `scope` más abajo. Puramente de presentación (post-alcance), igual que
  -- p_client_id -- NO es un cambio de autorización, role_scope queda intacto.
  p_practica_id  uuid DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: no session';
  END IF;
  IF NOT public.has_permission('dashboard.portfolio.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.portfolio.read';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  IF p_fy_start IS NULL OR p_fy_end IS NULL OR p_fy_start > p_fy_end THEN
    RAISE EXCEPTION 'INVALID_FISCAL_RANGE';
  END IF;
  IF p_fiscal_year IS NULL OR p_fiscal_year < 2000 OR p_fiscal_year > 2100 THEN
    RAISE EXCEPTION 'INVALID_FISCAL_YEAR';
  END IF;

  v_result := (
  WITH
  -- ── 1. Llamante ──────────────────────────────────────────────────────────────────────
  caller AS (
    SELECT public.get_my_staff_id() AS staff_id,
           public.current_role_key() AS role_key
  ),
  -- ── 1b. Práctica del llamante (subtítulo de la Cascada, §5.4 de decisiones) ─────────
  caller_staff AS (
    SELECT s.staff_id AS resolved_staff_id, s.practica_id, pr.name AS practica_name
    FROM caller c
    LEFT JOIN public.staff s ON s.staff_id = c.staff_id
    LEFT JOIN public.practicas pr ON pr.practica_id = s.practica_id
  ),
  -- ── 1c. Categoría del llamante -- KPI 3 (decisión del operador 2026-09-20) ──────────
  -- Antes el KPI 3 era "Horas como Gerente" fijo: presupuesto de las categorías con
  -- default_role_key='manager' sobre los encargos donde el llamante es manager_id. Para un
  -- socio daba 0/0 SIEMPRE, por construcción (nunca es manager_id) -- reportado en vivo por
  -- el operador. Ahora el KPI se adapta a la categoría de la ficha de quien mira: el título
  -- lo pone role_label y el cálculo lo dirige role_key.
  -- LEFT JOIN en toda la cadena: este CTE DEBE devolver exactamente 1 fila (va en un CROSS
  -- JOIN del ensamblado final; 0 filas anularían el payload entero).
  caller_category AS (
    SELECT cat.category_name AS role_label, cat.default_role_key AS role_key
    FROM caller c
    LEFT JOIN public.staff s ON s.staff_id = c.staff_id
    LEFT JOIN public.categories cat ON cat.category_id = s.category_id
  ),
  now_ctx AS (
    SELECT ((now() AT TIME ZONE 'America/La_Paz')::date) AS today
  ),
  retro_days_ctx AS (
    SELECT COALESCE(
      (SELECT setting_value::int FROM public.global_settings WHERE setting_key = 'TS_EMPLOYEE_RETRO_DAYS'),
      30
    ) AS retro_days
  ),
  default_rate AS (
    SELECT public.latest_exchange_rate() AS rate
  ),
  milestone_window AS (
    SELECT
      (date_trunc('month', (SELECT today FROM now_ctx)) - interval '1 month')::date AS win_start,
      (date_trunc('month', (SELECT today FROM now_ctx)) + interval '2 months' - interval '1 day')::date AS win_end
  ),

  -- ── 2. Estado efectivo por encargo (★ dash_socio :199-214, + columnas de Cartera) ──────
  eng_state AS (
    SELECT
      e.engagement_id, e.client_id, e.engagement_name, e.engagement_code::text AS engagement_code,
      e.partner_id, e.manager_id, e.sqr_id, e.society_id, e.start_date, e.end_date, e.anio_fiscal,
      e.fecha_cierre, e.funcion, e.taxonomy_id, e.created_at, e.work_order_required,
      e.engagement_state_override, e.practica,
      cl.client_legal_name,
      wo.wo_id, wo.currency, wo.season_mode, wo.tax_rate, wo.adjustment_amount,
      wo.approval_status, wo.risk_status, wo.approved_at, wo.risk_approved_at,
      public.effective_engagement_state(
        e.engagement_state_override, e.work_order_required, wo.wo_id,
        wo.approval_status, wo.risk_status, wo.approved_at
      ) AS state
    FROM public.engagements e
    JOIN public.clients cl ON cl.client_id = e.client_id
    LEFT JOIN public.work_orders wo ON wo.engagement_id = e.engagement_id
  ),

  -- ── 3. Alcance por rol (decisiones.md §2): admin/senior_partner=firma; el resto SOLO
  -- donde es partner_id o manager_id del encargo -- sin excepción por rol (a diferencia de
  -- dash_socio, acá los 8 role_key comparten el mismo predicado). El scope_key
  -- ('department' de risk_partner) NUNCA se lee -- decisiones.md §2 nota + §3.
  role_scope AS (
    SELECT es.*
    FROM eng_state es
    CROSS JOIN caller c
    WHERE
      c.role_key IN ('admin', 'senior_partner')
      OR (c.staff_id IS NOT NULL AND (es.partner_id = c.staff_id OR es.manager_id = c.staff_id))
  ),

  -- ── 4. scope_all: + estado 4/5 + funcion=1 (Cliente). SIN filtro de fecha a nivel
  -- encargo (plan_v2.md §3.2): los bloques por periodo filtran horas/cuotas/gastos, no
  -- encargos.
  scope_all AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state IN (4, 5)
      AND rs.funcion = 1
  ),

  -- ── 5. Opciones del filtro de Cliente (desde scope_all, antes de aplicar p_client_id) ──
  filters_clients AS (
    SELECT DISTINCT sa.client_id, sa.client_legal_name FROM scope_all sa
  ),
  -- Selector de Práctica (solo tiene sentido visualmente para admin/senior_partner, cuyo
  -- alcance abarca varias prácticas a la vez -- decisiones.md §5.2 -- pero se arma para
  -- cualquier rol, es barato: catálogo fijo). Lista TODAS las prácticas activas de la
  -- firma, no derivada de scope_all -- mismo criterio "selector cerrado" que
  -- filters_societies en partner_overview() (una práctica sin encargos en cartera hoy no
  -- debe desaparecer del selector).
  filters_practicas AS (
    SELECT pr.practica_id, pr.name
    FROM public.practicas pr
    WHERE pr.is_active
  ),
  filters_agg AS (
    SELECT
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('client_id', client_id, 'client_legal_name', client_legal_name)
                           ORDER BY client_legal_name) FROM filters_clients),
        '[]'::jsonb
      ) AS clients,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('practica_id', practica_id, 'name', name)
                           ORDER BY name) FROM filters_practicas),
        '[]'::jsonb
      ) AS practicas
  ),

  -- ── 6. scope: + filtro de Cliente y Práctica del encabezado (aplicados DESPUÉS del
  -- alcance -- p_practica_id traduce el uuid del selector al code smallint que guarda
  -- engagements.practica; un encargo sin práctica asignada (NULL) queda afuera de
  -- cualquier filtro específico, nunca de "Todas") ────────────────────────────────────
  scope AS (
    SELECT sa.*
    FROM scope_all sa
    WHERE (p_client_id IS NULL OR sa.client_id = p_client_id)
      AND (p_practica_id IS NULL OR sa.practica = (SELECT code FROM public.practicas WHERE practica_id = p_practica_id))
  ),

  -- ── 7. scope_fy / scope_fy_prev / manager_scope_fy ──────────────────────────────────
  scope_fy AS (
    SELECT s.* FROM scope s WHERE s.anio_fiscal = p_fiscal_year
  ),
  scope_fy_prev AS (
    SELECT s.* FROM scope s WHERE s.anio_fiscal = p_fiscal_year - 1
  ),
  -- Solo KPI 3 (personal, "como <mi categoría>"). KPI 4 usa scope_fy completo (D-2).
  -- 2026-09-20: el conjunto ya no es fijo "donde soy manager_id" -- depende del rol que mi
  -- categoría implica. engagements solo tiene columna estructural para partner/manager/sqr;
  -- cualquier otra categoría (Director, Senior, Asistente, especialistas...) o una sin
  -- default_role_key poblado cae al ELSE: los encargos donde ocupo CUALQUIER rol estructural.
  -- No se cae a "toda la cartera" a propósito -- para un admin firm-wide eso compararía sus
  -- horas personales contra el presupuesto de toda la firma.
  my_role_scope_fy AS (
    SELECT sf.*
    FROM scope_fy sf
    CROSS JOIN caller c
    CROSS JOIN caller_category cc
    WHERE c.staff_id IS NOT NULL
      AND CASE cc.role_key
            WHEN 'partner' THEN sf.partner_id = c.staff_id
            WHEN 'manager' THEN sf.manager_id = c.staff_id
            WHEN 'sqr'     THEN sf.sqr_id = c.staff_id
            ELSE (sf.partner_id = c.staff_id OR sf.manager_id = c.staff_id OR sf.sqr_id = c.staff_id)
          END
  ),

  -- ── 7b. pending_wo_scope: KPI 5 -- TODOS los estados (una OT pendiente no puede estar
  -- en cartera 4/5), pero SÍ funcion=1 y filtro de Cliente.
  pending_wo_scope AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.funcion = 1
      AND (p_client_id IS NULL OR rs.client_id = p_client_id)
      AND (p_practica_id IS NULL OR rs.practica = (SELECT code FROM public.practicas WHERE practica_id = p_practica_id))
  ),

  -- ── 8. wo: OT Approved por encargo de scope -- honorario, gastos, TC, base con IVA ────
  wo_raw AS (
    SELECT
      s.engagement_id, s.wo_id, s.currency, s.season_mode,
      COALESCE(s.tax_rate, 0.13) AS tax_rate,
      COALESCE(s.adjustment_amount, 0) AS adjustment_amount,
      s.approval_status,
      COALESCE(bl.fee, 0) AS total_standard_fee,
      COALESCE(eb.amt, 0) AS expense_budget,
      p.plan_id, p.exchange_rate AS plan_exchange_rate
    FROM scope s
    LEFT JOIN LATERAL (
      SELECT SUM(bl.budgeted_hours * bl.standard_rate) AS fee
      FROM public.wo_budget_lines bl
      WHERE bl.wo_id = s.wo_id AND s.approval_status = 'Approved'
    ) bl ON true
    LEFT JOIN LATERAL (
      SELECT SUM(eb.budgeted_amount) AS amt
      FROM public.wo_expense_budget eb
      WHERE eb.wo_id = s.wo_id AND s.approval_status = 'Approved'
    ) eb ON true
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = s.wo_id
  ),
  wo_rate AS (
    SELECT
      w.*,
      (w.total_standard_fee + w.adjustment_amount) AS fee_net,
      CASE
        WHEN w.currency = 'BOB' THEN 1
        WHEN w.plan_exchange_rate IS NOT NULL THEN w.plan_exchange_rate
        WHEN w.currency = 'USD' THEN (SELECT rate FROM default_rate)
        ELSE NULL
      END AS rate_to_bob
    FROM wo_raw w
  ),
  wo AS (
    SELECT
      w.*,
      (w.fee_net + w.expense_budget) / NULLIF(1 - w.tax_rate, 0) AS installment_base
    FROM wo_rate w
  ),

  -- ── 9. budget_lines: horas presupuestadas por encargo y categoría (OT Approved) ───────
  budget_lines AS (
    SELECT
      s.engagement_id, cat.category_id, cat.category_name, cat.default_role_key, cat.display_order,
      SUM(bl.budgeted_hours) AS hours
    FROM scope s
    JOIN public.wo_budget_lines bl ON bl.wo_id = s.wo_id AND s.approval_status = 'Approved'
    JOIN public.categories cat ON cat.category_id = bl.category_id
    GROUP BY s.engagement_id, cat.category_id, cat.category_name, cat.default_role_key, cat.display_order
  ),

  -- ── 10. hours: UN solo scan de time_entries para scope (obs. de rendimiento) ─────────
  -- Conserva activity_id en el join con timesheet_line_approvals -- no repite horas de un
  -- mismo (period_id, engagement_id) en varias actividades (plan_v2.md §3.3).
  --
  -- BUG 2026-09-20 (categorías duplicadas -- confirmado con datos reales del operador):
  -- `staff.category_id` está atado por FK compuesto a la práctica DE LA PERSONA
  -- (staff_practica_category_fk, cero_04:841), mientras que `wo_budget_lines.category_id`
  -- trae la categoría de la práctica DEL ENCARGO. Cada práctica siembra su propia fila
  -- 'Socio'/'Gerente'/... (cero_11: 7 'Socio' distintos; UNIQUE (practica_id, category_name)
  -- garantiza que no haya dos dentro de una misma práctica), así que un socio de Compliance
  -- que carga horas en un encargo de Auditoría producía DOS barras 'Socio': una
  -- solo-presupuesto (la de AUD) y otra solo-ejecutado (la de COM). Medido en Test: 40h de
  -- un socio COM sobre encargos AUD y 40h de un socio AUD sobre un encargo COM -- trabajo
  -- cruzado entre prácticas, normal en la firma, no un dato mal cargado (las líneas de
  -- presupuesto sí respetan la práctica del encargo en los 2 casos reales).
  --
  -- exec_category_id re-mapea la hora a la categoría homónima de la práctica DEL ENCARGO,
  -- que es contra cuyo presupuesto se la está comparando. Si esa práctica no tiene homónima
  -- (o el encargo no tiene práctica, o la persona no tiene categoría) cae a la categoría
  -- propia y la fila aparece igual: NUNCA se descarta una hora. La comparación de nombres
  -- ignora mayúsculas y separadores ('Semi-Senior' de AUD == 'Semi Senior' del resto del
  -- catálogo, cero_11), con el match exacto primero para que sea determinista.
  hours AS (
    SELECT
      s.engagement_id, te.activity_id, te.staff_id,
      COALESCE(engcat.category_id, st.category_id) AS exec_category_id,
      CASE WHEN tla.status = 'approved' THEN 'approved'
           WHEN tla.status = 'rejected' THEN 'rejected'
           ELSE 'pending' END AS bucket,
      te.hours_logged, te.date_worked, te.period_id
    FROM scope s
    JOIN public.time_entries te ON te.engagement_id = s.engagement_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
    LEFT JOIN public.staff st ON st.staff_id = te.staff_id
    LEFT JOIN public.categories stcat ON stcat.category_id = st.category_id
    LEFT JOIN public.practicas engpr ON engpr.code = s.practica
    LEFT JOIN LATERAL (
      SELECT ec.category_id
      FROM public.categories ec
      WHERE ec.practica_id = engpr.practica_id
        AND regexp_replace(lower(ec.category_name), '[^a-z0-9]', '', 'g')
          = regexp_replace(lower(stcat.category_name), '[^a-z0-9]', '', 'g')
      ORDER BY (ec.category_name = stcat.category_name) DESC, ec.display_order
      LIMIT 1
    ) engcat ON true
  ),
  engagement_budget_total AS (
    SELECT engagement_id, SUM(hours) AS budget_hours FROM budget_lines GROUP BY engagement_id
  ),
  engagement_lifetime_hours AS (
    SELECT engagement_id, SUM(hours_logged) FILTER (WHERE bucket IN ('approved', 'pending')) AS lifetime_hours
    FROM hours GROUP BY engagement_id
  ),
  engagement_period_hours AS (
    SELECT
      engagement_id,
      SUM(hours_logged) FILTER (WHERE bucket = 'approved' AND date_worked BETWEEN p_start AND p_end) AS approved_hours,
      SUM(hours_logged) FILTER (WHERE bucket = 'pending' AND date_worked BETWEEN p_start AND p_end) AS pending_hours
    FROM hours GROUP BY engagement_id
  ),

  -- ── 11. KPI 1: Encargos (scope_fy) ───────────────────────────────────────────────────
  kpi_engagements AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE state = 4) AS approved,
      COUNT(*) FILTER (WHERE state = 5) AS emergency
    FROM scope_fy
  ),

  -- ── 12. KPI 2: Clientes/Servicios (scope_fy vs scope_fy_prev) ────────────────────────
  kpi_clients_services AS (
    SELECT
      (SELECT COUNT(DISTINCT sf.client_id) FROM scope_fy sf) AS clients,
      (SELECT COUNT(DISTINCT sf.taxonomy_id) FROM scope_fy sf
         JOIN public.servicios sv ON sv.taxonomy_id = sf.taxonomy_id) AS services,
      (SELECT COUNT(DISTINCT sfp.client_id) FROM scope_fy_prev sfp) AS previous_clients,
      (SELECT COUNT(DISTINCT sfp.taxonomy_id) FROM scope_fy_prev sfp
         JOIN public.servicios sv ON sv.taxonomy_id = sfp.taxonomy_id) AS previous_services
  ),

  -- ── 13. KPI 3: Horas como <mi categoría> (solo mis horas, FY completo, sin scheduler) ─
  -- D-1 se conserva como mecanismo, pero generalizado: el presupuesto son las líneas cuya
  -- categoría comparte MI default_role_key -- para un gerente eso sigue cubriendo 'Gerente'
  -- y 'Gerente/Asociado Senior' (LEG) y excluyendo los especialistas, exactamente como
  -- antes; para un socio son todas las variantes 'Socio' del catálogo. El match por role_key
  -- también cruza prácticas gratis (el 'Socio' de cada práctica comparte role_key).
  -- Respaldo por NOMBRE cuando mi categoría no tiene default_role_key: el backfill de
  -- 20260825000100 deja la columna NULL si el default_app_role mapea a más de un role_key,
  -- y sin este respaldo el KPI volvería a 0/0 justo para las categorías no mapeadas.
  kpi_role_budget AS (
    SELECT COALESCE(SUM(bl.hours), 0) AS budget
    FROM my_role_scope_fy msf
    JOIN budget_lines bl ON bl.engagement_id = msf.engagement_id
    CROSS JOIN caller_category cc
    WHERE CASE
            WHEN cc.role_key IS NOT NULL THEN bl.default_role_key = cc.role_key
            ELSE regexp_replace(lower(bl.category_name), '[^a-z0-9]', '', 'g')
               = regexp_replace(lower(cc.role_label), '[^a-z0-9]', '', 'g')
          END
  ),
  kpi_role_exec AS (
    SELECT
      COALESCE(SUM(h.hours_logged) FILTER (WHERE h.bucket = 'approved'), 0) AS approved,
      COALESCE(SUM(h.hours_logged) FILTER (WHERE h.bucket = 'pending'), 0) AS pending
    FROM hours h
    CROSS JOIN caller c
    WHERE h.staff_id = c.staff_id
      AND h.date_worked BETWEEN p_fy_start AND p_fy_end
      AND h.engagement_id IN (SELECT engagement_id FROM my_role_scope_fy)
  ),

  -- ── 14. KPI 4: Avance de cartera (D-2: scope_fy completo -- socio O gerente; todo el
  -- equipo, FY completo). Coincide con activities.total_budget_hours cuando el periodo
  -- visible cubre el FY completo (§5.3 de decisiones).
  kpi_portfolio_budget AS (
    SELECT COALESCE(SUM(bl.hours), 0) AS budget
    FROM scope_fy sf
    JOIN budget_lines bl ON bl.engagement_id = sf.engagement_id
  ),
  kpi_portfolio_exec AS (
    SELECT
      COALESCE(SUM(h.hours_logged) FILTER (WHERE h.bucket = 'approved'), 0) AS approved,
      COALESCE(SUM(h.hours_logged) FILTER (WHERE h.bucket = 'pending'), 0) AS pending
    FROM hours h
    WHERE h.date_worked BETWEEN p_fy_start AND p_fy_end
      AND h.engagement_id IN (SELECT engagement_id FROM scope_fy)
  ),

  -- ── 15. KPI 5: Revisión -- sobregirados (vida completa) · OT por aprobar · Riesgo
  -- pendiente (risk_status='Pending' AND approval_status='Pending_Approval', decisiones.md
  -- §4.2 -- un borrador Draft+Pending NO cuenta) ──────────────────────────────────────
  kpi_review AS (
    SELECT
      (SELECT COUNT(*) FROM scope s
         WHERE COALESCE((SELECT lifetime_hours FROM engagement_lifetime_hours elh WHERE elh.engagement_id = s.engagement_id), 0)
             > COALESCE((SELECT budget_hours FROM engagement_budget_total ebt WHERE ebt.engagement_id = s.engagement_id), 0)
      ) AS over_budget_count,
      (SELECT COUNT(*) FROM pending_wo_scope WHERE approval_status = 'Pending_Approval') AS pending_wo_count,
      (SELECT COUNT(*) FROM pending_wo_scope
         WHERE risk_status = 'Pending' AND approval_status = 'Pending_Approval') AS pending_risk_count
  ),

  -- ── 16. Cascada de Actividades: última worksheet approved por encargo (sin doble
  -- conteo, R2) ─────────────────────────────────────────────────────────────────────────
  worksheet_latest AS (
    SELECT DISTINCT ON (aw.engagement_id) aw.id AS worksheet_id, aw.engagement_id
    FROM public.activity_worksheets aw
    WHERE aw.engagement_id IN (SELECT engagement_id FROM scope) AND aw.status = 'approved'
    ORDER BY aw.engagement_id, aw.version DESC, aw.updated_at DESC, aw.id DESC
  ),
  activity_budget AS (
    SELECT c.activity_id, SUM(c.budget_hours) AS budget_hours
    FROM worksheet_latest wl
    JOIN public.activity_worksheet_cells c ON c.worksheet_id = wl.worksheet_id
    GROUP BY c.activity_id
  ),
  activity_exec AS (
    SELECT
      h.activity_id,
      SUM(h.hours_logged) FILTER (WHERE h.bucket = 'approved') AS approved_hours,
      SUM(h.hours_logged) FILTER (WHERE h.bucket = 'pending') AS pending_hours
    FROM hours h
    WHERE h.activity_id IS NOT NULL AND h.date_worked BETWEEN p_start AND p_end
    GROUP BY h.activity_id
  ),
  activities_joined AS (
    SELECT
      COALESCE(ab.activity_id, ae.activity_id) AS activity_id,
      COALESCE(ab.budget_hours, 0) AS budget_hours,
      COALESCE(ae.approved_hours, 0) AS approved_hours,
      COALESCE(ae.pending_hours, 0) AS pending_hours
    FROM activity_budget ab
    FULL OUTER JOIN activity_exec ae ON ae.activity_id = ab.activity_id
  ),
  activities_rows AS (
    SELECT aj.activity_id, ac.activity_code, ac.description, aj.budget_hours, aj.approved_hours, aj.pending_hours
    FROM activities_joined aj
    JOIN public.activity_codes ac ON ac.activity_id = aj.activity_id
  ),
  activities_total AS (
    SELECT COALESCE(SUM(budget_hours), 0) AS total_budget_hours FROM activities_rows
  ),
  activities_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'activity_id', activity_id, 'activity_code', activity_code, 'description', description,
      'budget_hours', budget_hours, 'approved_hours', approved_hours, 'pending_hours', pending_hours
    ) ORDER BY budget_hours DESC, description), '[]'::jsonb) AS items
    FROM activities_rows
  ),

  -- ── 17-18. Horas por categoría (sin acumulado, sin matriz -- directo de wo_budget_lines) ──
  category_budget AS (
    SELECT category_id, category_name, display_order, SUM(hours) AS budget_hours
    FROM budget_lines
    GROUP BY category_id, category_name, display_order
  ),
  -- Agrupa por hours.exec_category_id (categoría de la práctica DEL ENCARGO, ver el
  -- comentario largo del CTE `hours`), NO por staff.category_id -- si no, una misma
  -- categoría aparece dos veces cuando alguien de otra práctica trabaja el encargo.
  -- Tampoco se filtra por p_practica_id acá: ese filtro descartaba las horas cruzadas en
  -- silencio (el total ejecutado dejaba de cuadrar con Horas por encargo).
  category_exec AS (
    SELECT
      h.exec_category_id AS category_id,
      SUM(h.hours_logged) FILTER (WHERE h.bucket = 'approved' AND h.date_worked BETWEEN p_start AND p_end) AS approved_hours,
      SUM(h.hours_logged) FILTER (WHERE h.bucket = 'pending' AND h.date_worked BETWEEN p_start AND p_end) AS pending_hours
    FROM hours h
    GROUP BY h.exec_category_id
  ),
  categories_joined AS (
    SELECT
      COALESCE(cb.category_id, ce.category_id) AS category_id,
      cb.category_name AS cb_category_name,
      cb.display_order AS cb_display_order,
      COALESCE(cb.budget_hours, 0) AS budget_hours,
      COALESCE(ce.approved_hours, 0) AS approved_hours,
      COALESCE(ce.pending_hours, 0) AS pending_hours
    FROM category_budget cb
    FULL OUTER JOIN category_exec ce ON ce.category_id = cb.category_id
  ),
  -- practica_abbr (2026-09-20): con el re-mapeo de arriba ya no hay filas repetidas dentro
  -- de una práctica, pero en la vista "Todas" siguen conviviendo legítimamente el 'Socio' de
  -- cada práctica. La UI usa esta abreviatura para desambiguar SOLO cuando un mismo nombre
  -- aparece más de una vez -- con una práctica elegida, la etiqueta queda limpia.
  categories_rows AS (
    SELECT
      cj.category_id,
      COALESCE(cj.cb_category_name, cat.category_name) AS category_name,
      COALESCE(cj.cb_display_order, cat.display_order) AS display_order,
      pr.abbreviation AS practica_abbr,
      cj.budget_hours, cj.approved_hours, cj.pending_hours
    FROM categories_joined cj
    LEFT JOIN public.categories cat ON cat.category_id = cj.category_id
    LEFT JOIN public.practicas pr ON pr.practica_id = cat.practica_id
  ),
  categories_total AS (
    SELECT COALESCE(SUM(budget_hours), 0) AS total_budget_hours FROM categories_rows
  ),
  categories_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'category_id', category_id, 'category_name', category_name, 'display_order', display_order,
      'practica_abbr', practica_abbr,
      'budget_hours', budget_hours, 'approved_hours', approved_hours, 'pending_hours', pending_hours
    ) ORDER BY budget_hours DESC NULLS LAST), '[]'::jsonb) AS items
    FROM categories_rows
  ),

  -- ── 19. Presupuesto de personal: wo_staffing_requirements vs distintos que cargaron
  -- horas, sin filtrar por aprobación (§6.3 de decisiones) ────────────────────────────
  staffing_budget AS (
    SELECT wsr.category_id, SUM(wsr.staff_count) AS staff_count
    FROM scope s
    JOIN public.wo_staffing_requirements wsr ON wsr.wo_id = s.wo_id AND s.approval_status = 'Approved'
    GROUP BY wsr.category_id
  ),
  -- Mismo re-mapeo que category_exec (ver el comentario del CTE `hours`): la persona cuenta
  -- en la categoría homónima de la práctica del encargo que trabajó, no en la de su ficha.
  staffing_exec AS (
    SELECT h.exec_category_id AS category_id, COUNT(DISTINCT h.staff_id) AS executed
    FROM hours h
    WHERE h.date_worked BETWEEN p_start AND p_end
    GROUP BY h.exec_category_id
  ),
  staffing_joined AS (
    SELECT
      COALESCE(sb.category_id, se.category_id) AS category_id,
      sb.staff_count AS budgeted,
      COALESCE(se.executed, 0) AS executed
    FROM staffing_budget sb
    FULL OUTER JOIN staffing_exec se ON se.category_id = sb.category_id
  ),
  staffing_rows AS (
    SELECT sj.category_id, cat.category_name, pr.abbreviation AS practica_abbr, sj.budgeted, sj.executed
    FROM staffing_joined sj
    LEFT JOIN public.categories cat ON cat.category_id = sj.category_id
    LEFT JOIN public.practicas pr ON pr.practica_id = cat.practica_id
  ),
  staffing_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'category_id', category_id, 'category_name', category_name, 'practica_abbr', practica_abbr,
      'budgeted', budgeted, 'executed', executed
    ) ORDER BY budgeted DESC NULLS LAST), '[]'::jsonb) AS items
    FROM staffing_rows
  ),

  -- ── 20. Facturación: installments_full (★ dash_socio), by_status acotado al periodo
  -- por agreed_invoice_date (a diferencia de dash_socio, que no lo acota) ────────────────
  installments_full AS (
    SELECT
      i.installment_id, w.wo_id, w.engagement_id, w.plan_id,
      i.status, i.agreed_invoice_date, i.agreed_payment_date,
      i.collection_invoice_date, i.collection_payment_date, i.payment_date_actual,
      COALESCE(i.amount, i.percentage * w.installment_base / 100) AS amount_native,
      w.rate_to_bob,
      COALESCE(i.invoice_exchange_rate, w.rate_to_bob) AS invoice_rate,
      COALESCE(i.payment_exchange_rate, i.invoice_exchange_rate, w.rate_to_bob) AS payment_rate
    FROM wo w
    JOIN public.wo_payment_installments i ON i.wo_id = w.wo_id
  ),
  collections_by_status AS (
    SELECT jsonb_build_object(
      'collected', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status = 'Completed' AND inst.agreed_invoice_date BETWEEN p_start AND p_end),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.payment_rate) FILTER (
          WHERE inst.status = 'Completed' AND inst.agreed_invoice_date BETWEEN p_start AND p_end), 0)),
      'invoiced', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status IN ('Invoiced', 'Overdue') AND inst.agreed_invoice_date BETWEEN p_start AND p_end),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.invoice_rate) FILTER (
          WHERE inst.status IN ('Invoiced', 'Overdue') AND inst.agreed_invoice_date BETWEEN p_start AND p_end), 0)),
      'in_arrears', jsonb_build_object(
        'count', COUNT(*) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date < (SELECT today FROM now_ctx)
            AND inst.agreed_invoice_date BETWEEN p_start AND p_end),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.rate_to_bob) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date < (SELECT today FROM now_ctx)
            AND inst.agreed_invoice_date BETWEEN p_start AND p_end), 0)),
      'upcoming', jsonb_build_object(
        'count', COUNT(*) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date >= (SELECT today FROM now_ctx)
            AND inst.agreed_invoice_date BETWEEN p_start AND p_end),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.rate_to_bob) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date >= (SELECT today FROM now_ctx)
            AND inst.agreed_invoice_date BETWEEN p_start AND p_end), 0))
    ) AS by_status
    FROM installments_full inst
  ),
  collections_next7 AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'installment_id', inst.installment_id, 'wo_id', inst.wo_id, 'engagement_id', inst.engagement_id,
        'client_legal_name', cl.client_legal_name,
        'kind', CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN 'collect' ELSE 'invoice' END,
        'date', CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN inst.agreed_payment_date ELSE inst.agreed_invoice_date END,
        'amount_bob', inst.amount_native * inst.rate_to_bob
      ) ORDER BY CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN inst.agreed_payment_date ELSE inst.agreed_invoice_date END
    ), '[]'::jsonb) AS items
    FROM installments_full inst
    JOIN public.engagements e ON e.engagement_id = inst.engagement_id
    JOIN public.clients cl ON cl.client_id = e.client_id
    WHERE
      (inst.status IN ('Invoiced', 'Overdue')
        AND inst.agreed_payment_date BETWEEN (SELECT today FROM now_ctx) AND (SELECT today FROM now_ctx) + 7)
      OR
      (inst.status = 'Pending'
        AND inst.agreed_invoice_date BETWEEN (SELECT today FROM now_ctx) AND (SELECT today FROM now_ctx) + 7)
  ),
  avg_collection_days_agg AS (
    SELECT AVG(COALESCE(inst.payment_date_actual, inst.collection_payment_date) - inst.collection_invoice_date)
             FILTER (WHERE inst.status = 'Completed'
                       AND COALESCE(inst.payment_date_actual, inst.collection_payment_date) BETWEEN p_start AND p_end
             ) AS avg_days
    FROM installments_full inst
  ),

  -- ── 21. Gastos de la cartera: solo revisado_asistente = ejecutado -- decisión del
  -- operador 2026-09-18, corrige inconsistencia con partner_overview() (★ dash_socio
  -- :450-461, donde ya distinguía reviewed_bob=revisado_asistente de
  -- manager_approved_bob=aprobado_gerente "solo tooltip"): un gasto se considera "ejecutado"
  -- únicamente cuando concluye el flujo completo (Contabilidad revisa, revisado_asistente),
  -- NO cuando el gerente lo aprueba (aprobado_gerente es un paso intermedio, todavía puede
  -- ser observado/rechazado por Contabilidad). pending_count ahora incluye aprobado_gerente
  -- (sigue "pendiente" desde la óptica de Contabilidad, aunque el gerente ya lo aprobó) para
  -- que ningún gasto no rechazado/no observado desaparezca del resumen. top3 por encargo,
  -- sobregirados primero (decisiones.md §7) ──────────────────────────────────
  expenses_by_engagement AS (
    SELECT
      w.engagement_id,
      COALESCE(w.expense_budget * w.rate_to_bob, 0) AS budget_bob,
      COALESCE(SUM(fre.amount * CASE fre.currency WHEN 'BOB' THEN 1 ELSE COALESCE(w.rate_to_bob, (SELECT rate FROM default_rate)) END)
        FILTER (WHERE fre.status = 'revisado_asistente' AND fre.expense_date BETWEEN p_start AND p_end), 0) AS executed_bob,
      COUNT(*) FILTER (WHERE fre.status IN ('pendiente_aprobacion', 'aprobado_gerente')) AS pending_count,
      COUNT(*) FILTER (WHERE fre.status = 'revisado_asistente' AND fre.expense_date BETWEEN p_start AND p_end) AS approved_count
    FROM wo w
    LEFT JOIN public.fund_request_expenses fre ON fre.wo_id = w.wo_id
    GROUP BY w.engagement_id, w.expense_budget, w.rate_to_bob
  ),
  expenses_totals AS (
    SELECT
      COALESCE(SUM(budget_bob), 0) AS budget_bob,
      COALESCE(SUM(executed_bob), 0) AS executed_bob,
      COALESCE(SUM(pending_count), 0) AS pending_count,
      COALESCE(SUM(approved_count), 0) AS approved_count
    FROM expenses_by_engagement
  ),
  expenses_top3_base AS (
    SELECT
      ebe.engagement_id, s.engagement_code, s.client_legal_name,
      ebe.budget_bob, ebe.executed_bob,
      (ebe.executed_bob / NULLIF(ebe.budget_bob, 0)) * 100 AS pct
    FROM expenses_by_engagement ebe
    JOIN scope s ON s.engagement_id = ebe.engagement_id
    WHERE ebe.budget_bob > 0
  ),
  expenses_top3 AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'engagement_id', engagement_id, 'engagement_code', engagement_code, 'client_legal_name', client_legal_name,
      'budget_bob', budget_bob, 'executed_bob', executed_bob, 'pct', pct
    ) ORDER BY (pct > 100) DESC, pct DESC, executed_bob DESC), '[]'::jsonb) AS items
    FROM (
      SELECT * FROM expenses_top3_base
      ORDER BY (pct > 100) DESC, pct DESC, executed_bob DESC
      LIMIT 3
    ) t3
  ),

  -- ── 22. Cola de aprobación (enriquecida, §7.1 de decisiones): horas totales, personas
  -- distintas, antigüedad en semanas, alerta a partir de retro_days ────────────────────
  approval_queue_rows AS (
    SELECT
      tla.approval_id, tla.engagement_id, s.engagement_code, tp.week_start_date, tp.staff_id,
      COALESCE(st.short_name, TRIM(BOTH FROM (COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')))) AS staff_name,
      COALESCE(h.hours, 0) AS hours,
      ((SELECT today FROM now_ctx) - tp.week_start_date) AS days_old
    FROM public.timesheet_line_approvals tla
    JOIN scope s ON s.engagement_id = tla.engagement_id
    JOIN public.timesheet_periods tp ON tp.period_id = tla.period_id
    LEFT JOIN public.staff st ON st.staff_id = tp.staff_id
    LEFT JOIN LATERAL (
      SELECT SUM(te.hours_logged) AS hours FROM public.time_entries te
      WHERE te.period_id = tla.period_id AND te.engagement_id = tla.engagement_id AND te.activity_id = tla.activity_id
    ) h ON true
    WHERE tla.status = 'pending'
  ),
  approval_queue_derived AS (
    SELECT aqr.*,
      FLOOR(aqr.days_old / 7.0)::int AS weeks_old,
      (aqr.days_old >= (SELECT retro_days FROM retro_days_ctx)) AS alert
    FROM approval_queue_rows aqr
  ),
  approval_queue_agg AS (
    SELECT
      COALESCE(SUM(hours), 0) AS total_hours,
      COUNT(DISTINCT staff_id) AS distinct_people,
      COUNT(*) AS total_count
    FROM approval_queue_derived
  ),
  -- MF-03 (review.md iteración 1): la consolidación por persona va ANTES del LIMIT. Cuando
  -- el recorte se hacía sobre líneas crudas, una sola persona con 20 líneas pendientes
  -- agotaba el cupo y TODAS las demás desaparecían del payload -- el frontend, que agrupa
  -- después, no tenía forma de saberlo y el "+N más" tampoco las contaba. Se conserva la
  -- línea MÁS ANTIGUA de cada persona (mayor days_old), que es la que decide la alerta.
  approval_queue_per_person AS (
    SELECT DISTINCT ON (aqd.staff_id) aqd.*
    FROM approval_queue_derived aqd
    ORDER BY aqd.staff_id, aqd.days_old DESC, aqd.week_start_date ASC, aqd.approval_id
  ),
  approval_queue_items AS (
    -- staff_id viaja para que el cliente deduplique por identidad y no por nombre visible.
    -- No es PII: la aserción #22 de la suite prohíbe email / id_number / auth_user_id.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'approval_id', approval_id, 'staff_id', staff_id, 'staff_name', staff_name,
      'engagement_id', engagement_id,
      'engagement_code', engagement_code, 'week_start_date', week_start_date, 'hours', hours,
      'weeks_old', weeks_old, 'alert', alert
    ) ORDER BY week_start_date ASC), '[]'::jsonb) AS items
    FROM (SELECT * FROM approval_queue_per_person ORDER BY week_start_date ASC LIMIT 20) t
  ),

  -- ── 23. Hitos: ventana fija ±1 mes (decisiones.md §7.2); ignoran Periodo, respetan
  -- Cliente ───────────────────────────────────────────────────────────────────────────
  milestones_closing AS (
    SELECT 'closing'::text AS kind, s.fecha_cierre AS date, s.engagement_id,
           s.engagement_code, s.engagement_name, NULL::int AS weeks
    FROM scope s CROSS JOIN milestone_window mw
    WHERE s.fecha_cierre BETWEEN mw.win_start AND mw.win_end
  ),
  milestones_new_engagement AS (
    SELECT 'new_engagement'::text, s.created_at::date, s.engagement_id, s.engagement_code, s.engagement_name, NULL::int
    FROM scope s CROSS JOIN now_ctx nc
    WHERE s.created_at::date BETWEEN (nc.today - interval '1 month')::date AND nc.today
  ),
  milestones_wo_approved AS (
    SELECT 'wo_approved'::text, s.approved_at::date, s.engagement_id, s.engagement_code, s.engagement_name, NULL::int
    FROM scope s CROSS JOIN now_ctx nc
    WHERE s.approved_at IS NOT NULL AND s.approved_at::date BETWEEN (nc.today - interval '1 month')::date AND nc.today
  ),
  milestones_risk_approved AS (
    SELECT 'risk_approved'::text, s.risk_approved_at::date, s.engagement_id, s.engagement_code, s.engagement_name, NULL::int
    FROM scope s CROSS JOIN now_ctx nc
    WHERE s.risk_approved_at IS NOT NULL AND s.risk_approved_at::date BETWEEN (nc.today - interval '1 month')::date AND nc.today
  ),
  milestones_assignment AS (
    SELECT 'assignment'::text, pe.occurred_at::date, pe.engagement_id, s.engagement_code, s.engagement_name, NULL::int
    FROM public.portfolio_events pe
    JOIN scope s ON s.engagement_id = pe.engagement_id
    CROSS JOIN caller c
    CROSS JOIN now_ctx nc
    WHERE pe.subject_staff_id = c.staff_id
      AND pe.occurred_at::date BETWEEN (nc.today - interval '1 month')::date AND nc.today
  ),
  milestones_lock_deadline AS (
    SELECT 'lock_deadline'::text,
           (aqd.week_start_date + 6 + (SELECT retro_days FROM retro_days_ctx)),
           NULL::uuid, NULL::text, NULL::text, aqd.weeks_old
    FROM approval_queue_derived aqd
    CROSS JOIN milestone_window mw
    CROSS JOIN now_ctx nc
    WHERE (aqd.week_start_date + 6 + (SELECT retro_days FROM retro_days_ctx)) BETWEEN nc.today AND mw.win_end
  ),
  milestones_all AS (
    SELECT * FROM milestones_closing
    UNION ALL SELECT * FROM milestones_new_engagement
    UNION ALL SELECT * FROM milestones_wo_approved
    UNION ALL SELECT * FROM milestones_risk_approved
    UNION ALL SELECT * FROM milestones_assignment
    UNION ALL SELECT * FROM milestones_lock_deadline
  ),
  milestones_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'kind', kind, 'date', date, 'engagement_id', engagement_id, 'engagement_code', engagement_code,
      'engagement_name', engagement_name, 'weeks', weeks
    ) ORDER BY date), '[]'::jsonb) AS items
    FROM (SELECT * FROM milestones_all ORDER BY date LIMIT 40) m
  ),

  -- ── 24. Horas por encargo: tabla simple, reacciona a Cliente y Periodo ───────────────
  engagement_rows_agg AS (
    SELECT
      s.engagement_id, s.engagement_code, s.engagement_name, s.client_legal_name,
      COALESCE(ebt.budget_hours, 0) AS budget_hours,
      COALESCE(eph.approved_hours, 0) AS approved_hours,
      COALESCE(eph.pending_hours, 0) AS pending_hours,
      (COALESCE(elh.lifetime_hours, 0) > COALESCE(ebt.budget_hours, 0)) AS over_budget,
      CASE WHEN COALESCE(ebt.budget_hours, 0) > 0
           THEN (COALESCE(eph.approved_hours, 0) + COALESCE(eph.pending_hours, 0)) / ebt.budget_hours
           ELSE 0 END AS consumption_ratio
    FROM scope s
    LEFT JOIN engagement_budget_total ebt ON ebt.engagement_id = s.engagement_id
    LEFT JOIN engagement_period_hours eph ON eph.engagement_id = s.engagement_id
    LEFT JOIN engagement_lifetime_hours elh ON elh.engagement_id = s.engagement_id
  ),
  engagement_rows_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'engagement_id', engagement_id, 'engagement_code', engagement_code, 'engagement_name', engagement_name,
      'client_legal_name', client_legal_name, 'budget_hours', budget_hours, 'approved_hours', approved_hours,
      'pending_hours', pending_hours, 'over_budget', over_budget
    ) ORDER BY consumption_ratio DESC), '[]'::jsonb) AS items
    FROM (SELECT * FROM engagement_rows_agg ORDER BY consumption_ratio DESC LIMIT 200) t
  ),

  -- ── 25. Conteos de alcance (meta) ────────────────────────────────────────────────────
  scope_counts AS (
    SELECT
      (SELECT COUNT(*) FROM scope_all) AS unfiltered_scope_count,
      (SELECT COUNT(*) FROM scope) AS scope_count
  ),

  -- ── 26. Fila resumen "Encargos finalizados" (pedido del operador 2026-09-19): encargos
  -- que cerraron (estado efectivo 7) DENTRO del periodo visible ([p_start, p_end], por
  -- end_date -- mismo criterio que ya usa finalized_scope en partner_overview() para
  -- "finalizados en el periodo"), acotados a role_scope + funcion=1 + filtro de Cliente
  -- (NO por año fiscal: un encargo se cierra en una fecha real, no en un ejercicio
  -- seleccionable). budget_hours/executed_hours son de VIDA COMPLETA del encargo (para
  -- reflejar el desempeño final, no solo lo cargado durante la ventana de cierre);
  -- executed_expenses_bob usa la misma regla recién corregida en el bloque de Gastos
  -- (solo revisado_asistente = ejecutado, aprobado_gerente no cuenta).
  finalized_scope AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state = 7
      AND rs.funcion = 1
      AND rs.end_date BETWEEN p_start AND p_end
      AND (p_client_id IS NULL OR rs.client_id = p_client_id)
      AND (p_practica_id IS NULL OR rs.practica = (SELECT code FROM public.practicas WHERE practica_id = p_practica_id))
  ),
  finalized_wo AS (
    SELECT
      fs.engagement_id, wo.wo_id, wo.currency,
      CASE
        WHEN wo.currency = 'BOB' THEN 1
        WHEN p.exchange_rate IS NOT NULL THEN p.exchange_rate
        WHEN wo.currency = 'USD' THEN (SELECT rate FROM default_rate)
        ELSE NULL
      END AS rate_to_bob
    FROM finalized_scope fs
    JOIN public.work_orders wo ON wo.engagement_id = fs.engagement_id AND wo.approval_status = 'Approved'
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = wo.wo_id
  ),
  finalized_count AS (
    SELECT COUNT(*) AS cnt FROM finalized_scope
  ),
  finalized_budget AS (
    SELECT COALESCE(SUM(bl.budgeted_hours), 0) AS budget_hours
    FROM finalized_wo fw
    JOIN public.wo_budget_lines bl ON bl.wo_id = fw.wo_id
  ),
  finalized_hours AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS executed_hours
    FROM finalized_scope fs
    JOIN public.time_entries te ON te.engagement_id = fs.engagement_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
    WHERE tla.status IS DISTINCT FROM 'rejected'
  ),
  finalized_expenses AS (
    SELECT COALESCE(SUM(
      fre.amount * CASE fre.currency WHEN 'BOB' THEN 1 ELSE COALESCE(fw.rate_to_bob, (SELECT rate FROM default_rate)) END
    ) FILTER (WHERE fre.status = 'revisado_asistente'), 0) AS executed_bob
    FROM finalized_wo fw
    JOIN public.fund_request_expenses fre ON fre.wo_id = fw.wo_id
  )

  -- ── 27. Ensamblado final (§7.3 del plan: forma exacta del payload) ───────────────────
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'role_key', c.role_key,
      'scope_kind', CASE WHEN c.role_key IN ('admin', 'senior_partner') THEN 'firm' ELSE 'own' END,
      'practica_name', cs.practica_name,
      'scope_count', sc.scope_count,
      'unfiltered_scope_count', sc.unfiltered_scope_count,
      'fiscal_year', p_fiscal_year,
      'retro_days', rd.retro_days,
      'today', nc.today
    ),
    'filters', jsonb_build_object('clients', fa.clients, 'practicas', fa.practicas),
    'kpis', jsonb_build_object(
      'engagements', jsonb_build_object('total', ke.total, 'approved', ke.approved, 'emergency', ke.emergency),
      'clients_services', jsonb_build_object(
        'clients', kcs.clients, 'services', kcs.services,
        'previous_clients', kcs.previous_clients, 'previous_services', kcs.previous_services
      ),
      'my_role_hours', jsonb_build_object(
        'role_key', cc.role_key, 'role_label', cc.role_label,
        'budget', krb.budget, 'approved', kre.approved, 'pending', kre.pending
      ),
      'portfolio_progress', jsonb_build_object('budget', kpb.budget, 'approved', kpe.approved, 'pending', kpe.pending),
      'review', jsonb_build_object(
        'over_budget_count', kr.over_budget_count, 'pending_wo_count', kr.pending_wo_count,
        'pending_risk_count', kr.pending_risk_count
      )
    ),
    'activities', jsonb_build_object('total_budget_hours', atot.total_budget_hours, 'items', aj.items),
    'categories', jsonb_build_object('total_budget_hours', ctot.total_budget_hours, 'items', cj.items),
    'staffing', stf.items,
    'collections', jsonb_build_object(
      'by_status', cbs.by_status, 'next_7_days', n7.items, 'avg_collection_days', acd.avg_days
    ),
    'expenses', jsonb_build_object(
      'budget_bob', et.budget_bob, 'executed_bob', et.executed_bob,
      'pending_count', et.pending_count, 'approved_count', et.approved_count, 'top3', et3.items
    ),
    'approval_queue', jsonb_build_object(
      'total_hours', aqa.total_hours, 'distinct_people', aqa.distinct_people,
      'total_count', aqa.total_count, 'items', aqi.items
    ),
    'milestones', mj.items,
    'engagement_rows', erj.items,
    'finalized_summary', jsonb_build_object(
      'count', fzc.cnt, 'budget_hours', fzb.budget_hours,
      'executed_hours', fzh.executed_hours, 'executed_expenses_bob', fze.executed_bob
    )
  )
  FROM caller c
  CROSS JOIN caller_staff cs
  CROSS JOIN caller_category cc
  CROSS JOIN now_ctx nc
  CROSS JOIN retro_days_ctx rd
  CROSS JOIN scope_counts sc
  CROSS JOIN filters_agg fa
  CROSS JOIN kpi_engagements ke
  CROSS JOIN kpi_clients_services kcs
  CROSS JOIN kpi_role_budget krb
  CROSS JOIN kpi_role_exec kre
  CROSS JOIN kpi_portfolio_budget kpb
  CROSS JOIN kpi_portfolio_exec kpe
  CROSS JOIN kpi_review kr
  CROSS JOIN activities_total atot
  CROSS JOIN activities_json aj
  CROSS JOIN categories_total ctot
  CROSS JOIN categories_json cj
  CROSS JOIN staffing_json stf
  CROSS JOIN collections_by_status cbs
  CROSS JOIN collections_next7 n7
  CROSS JOIN avg_collection_days_agg acd
  CROSS JOIN expenses_totals et
  CROSS JOIN expenses_top3 et3
  CROSS JOIN approval_queue_agg aqa
  CROSS JOIN approval_queue_items aqi
  CROSS JOIN milestones_json mj
  CROSS JOIN engagement_rows_json erj
  CROSS JOIN finalized_count fzc
  CROSS JOIN finalized_budget fzb
  CROSS JOIN finalized_hours fzh
  CROSS JOIN finalized_expenses fze
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.portfolio_overview(date, date, integer, date, date, uuid, uuid) IS 'dash_cartera (decisiones.md §4-§8, plan_v2.md §7.1-§7.3): payload único de la pestaña Cartera (5 KPI + 5 filas de bloques) en un round-trip. Gateado por dashboard.portfolio.read (ya concedido a admin/senior_partner/partner/director/manager/ita_manager/tax_manager/risk_partner, cero_13:323-330 -- esta migración no toca esa tabla). Alcance: admin/senior_partner ven toda la firma; el resto SOLO donde es partner_id o manager_id del encargo (role_scope), sin distinción de rol y SIN leer authorization_role_permissions.scope_key -- risk_partner nunca recibe alcance departamental. Base = estado efectivo 4/5 + funcion=1 (Cliente), SIN filtro de fecha a nivel encargo -- los bloques por periodo filtran horas/cuotas/gastos, no encargos. KPI 3 (2026-09-20, decisión del operador) dejó de ser "Horas como Gerente" fijo -- que para un socio daba 0/0 por construcción -- y se adapta a la categoría de la ficha del llamante: my_role_hours.role_label da el título y role_key dirige el cálculo (encargos donde ocupo ese rol estructural + líneas de presupuesto que comparten mi default_role_key, con respaldo por nombre si la categoría no lo tiene poblado). D-1 sobrevive como mecanismo: un gerente sigue sumando ''Gerente'' + ''Gerente/Asociado Senior'' y excluyendo los especialistas. KPI 4 (Avance de cartera) opera sobre scope_fy completo, contando el encargo si el llamante es su socio O su gerente (D-2). p_practica_id (2026-09-19): filtro de Práctica post-alcance, pedido del operador para admin/senior_partner -- NO es un cambio de autorización, role_scope no lo usa. "Horas por categoría"/"Presupuesto de personal" atribuyen cada hora a la categoría homónima de la práctica DEL ENCARGO (hours.exec_category_id), no a la de la ficha de quien la cargó: sin eso, alguien de otra práctica trabajando el encargo abría una segunda fila con el mismo nombre (BUG 2026-09-20, ver el comentario del CTE `hours`). Cada fila viaja con practica_abbr para que la UI desambigüe los homónimos legítimos de la vista "Todas". La Cola de aprobación se consolida por persona (una fila por staff_id, la línea más antigua) ANTES de su LIMIT 20 y emite staff_id: cortando líneas crudas, una sola persona con 20 pendientes escondía a todas las demás del payload (review.md iteración 1, MF-03). Depende de public.effective_engagement_state() y public.latest_exchange_rate(), creadas por 20260915130000_dash_socio_partner_overview.sql -- debe aplicarse después de esa migración. Ver bugs/dashboard/cartera/plan_v2.md §7.3 para el contrato exacto del payload.';

REVOKE ALL ON FUNCTION public.portfolio_overview(date, date, integer, date, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portfolio_overview(date, date, integer, date, date, uuid, uuid) TO authenticated, service_role;

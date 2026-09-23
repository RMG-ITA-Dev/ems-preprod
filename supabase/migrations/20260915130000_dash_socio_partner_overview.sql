-- FEAT dash_socio: Dashboard del Socio -- backend (bugs/dashboard/socio/plan_v2.md, secciones
-- 6 y 7; decisiones de negocio en bugs/dashboard/socio/decisiones.md).
--
-- Contenido, en orden (idempotente: CREATE OR REPLACE / DROP ... IF EXISTS / IF NOT EXISTS /
-- ON CONFLICT en todo el archivo, per plan_v2.md §5.1):
--   1. latest_exchange_rate()                         (plan_v2 §6.1)
--   2. seed global_settings.default_exchange_rate     (plan_v2 §6.2)
--   3. backfill de wo_payment_plan.exchange_rate       (plan_v2 §6.3)
--   4. CHECK + NOT NULL + DEFAULT en exchange_rate     (plan_v2 §6.4)
--   5. 2 indices faltantes                             (plan_v2 §6.5)
--   6. effective_engagement_state()                    (plan_v2 §6.6)
--   7. permiso dashboard.partner.read + 6 concesiones   (plan_v2 §6.7; +admin 2026-09-16,
--      +risk_partner 2026-09-16 -- ver bugs/dashboard/socio/reporte_ejecucion.md)
--   8. partner_overview()                              (plan_v2 §7.1)
--   9. partner_overview_engagements()                  (plan_v2 §7.2)
--  10. grants (REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated, service_role)
--
-- Prerrequisito de datos (decisiones.md §4.1): wo_payment_plan.exchange_rate pasa a
-- NOT NULL DEFAULT latest_exchange_rate(), sin triggers nuevos. El backfill deshabilita
-- puntualmente trg_wo_payment_plan_guard_exchange_rate (0722-156b) -- ese guard exige
-- is_admin()/manager_id = get_my_staff_id() y esta migracion corre con auth.uid() NULL --
-- y deja habilitado trg_wo_payment_plan_sync_fixed_installments para que el nuevo TC se
-- propague a las cuotas Pending de planes en modo 'fijo'.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. latest_exchange_rate()
-- ═══════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.latest_exchange_rate() RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT compra FROM public.exchange_rate_history ORDER BY fecha_vigencia DESC LIMIT 1),
    (SELECT setting_value::numeric FROM public.global_settings WHERE setting_key = 'default_exchange_rate')
  );
$$;

COMMENT ON FUNCTION public.latest_exchange_rate() IS 'dash_socio (decisiones.md §4.1): TC de respaldo para wo_payment_plan.exchange_rate DEFAULT y para convertir honorarios/cuotas a Bs. Mismo orden que el navbar (useExchangeRate.ts:28): compra mas reciente de exchange_rate_history, si no hay historial cae a global_settings.default_exchange_rate. Devuelve NULL si ninguna fuente existe -- el INSERT que dependa del DEFAULT falla entonces con NOT NULL, nunca guarda basura.';

REVOKE ALL ON FUNCTION public.latest_exchange_rate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.latest_exchange_rate() TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2. Seed de respaldo: default_exchange_rate
-- ═══════════════════════════════════════════════════════════════════════════════════════

INSERT INTO public.global_settings (setting_key, setting_value, description)
VALUES ('default_exchange_rate', '10.99',
        'TC BCB compra de respaldo para latest_exchange_rate(); solo se usa si exchange_rate_history esta vacia')
ON CONFLICT (setting_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 3. Backfill de wo_payment_plan.exchange_rate (bracket de trigger)
-- ═══════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.wo_payment_plan DISABLE TRIGGER trg_wo_payment_plan_guard_exchange_rate;
DO $$
DECLARE n int;
BEGIN
  UPDATE public.wo_payment_plan
     SET exchange_rate = public.latest_exchange_rate()
   WHERE exchange_rate IS NULL OR exchange_rate <= 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'dash_socio: % planes de pago backfilleados con latest_exchange_rate()', n;
END $$;
ALTER TABLE public.wo_payment_plan ENABLE TRIGGER trg_wo_payment_plan_guard_exchange_rate;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 4. CHECK + NOT NULL + DEFAULT
-- ═══════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.wo_payment_plan DROP CONSTRAINT IF EXISTS wo_payment_plan_exchange_rate_positive;
ALTER TABLE public.wo_payment_plan
  ADD CONSTRAINT wo_payment_plan_exchange_rate_positive CHECK (exchange_rate > 0),
  ALTER COLUMN exchange_rate SET NOT NULL,
  ALTER COLUMN exchange_rate SET DEFAULT public.latest_exchange_rate();

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 5. Indices faltantes (verificado: no existen en supabase/migrations)
-- ═══════════════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_wo_budget_lines_wo_id ON public.wo_budget_lines (wo_id);
CREATE INDEX IF NOT EXISTS idx_wo_expense_budget_wo_id ON public.wo_expense_budget (wo_id);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 6. effective_engagement_state() -- espejo SQL de src/lib/engagementStatus.ts
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Si se toca uno, tocar el otro (ver comentario identico en engagementStatus.ts).
-- engagements.engagement_state_override acepta 1..9 por CHECK (9 Congelado retirado en
-- BUG 0817-179, ver 20260902120000), por eso el rango valido aca es 1..8 -- un override
-- 9 remanente (no deberia existir tras 0817-179) cae al derivado, igual que en TS.

CREATE OR REPLACE FUNCTION public.effective_engagement_state(
  p_override smallint, p_wo_required boolean, p_wo_id uuid,
  p_approval_status text, p_risk_status text, p_approved_at timestamptz
) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_override BETWEEN 1 AND 8 THEN p_override
    WHEN NOT p_wo_required THEN 4
    WHEN p_wo_id IS NULL THEN 1
    WHEN p_approval_status = 'Rejected' OR p_risk_status = 'Rejected' THEN 8
    WHEN p_approval_status = 'Approved' THEN CASE WHEN p_risk_status = 'Emergency_Approved' THEN 5 ELSE 4 END
    WHEN p_approved_at IS NOT NULL THEN 2
    WHEN p_risk_status IN ('Approved','Emergency_Approved') THEN 3
    ELSE 1 END;
$$;

COMMENT ON FUNCTION public.effective_engagement_state(smallint, boolean, uuid, text, text, timestamptz) IS 'dash_socio (decisiones.md §2/§8 obs.8, plan_v2.md §6.6): espejo SQL exacto de effectiveEngagementState()/deriveEngagementState() en src/lib/engagementStatus.ts. Usado por partner_overview()/partner_overview_engagements() para derivar el conjunto "cartera" (estado 4/5). Mantener sincronizado con el TS -- ver comentario cruzado alla.';

REVOKE ALL ON FUNCTION public.effective_engagement_state(smallint, boolean, uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_engagement_state(smallint, boolean, uuid, text, text, timestamptz) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 7. Permiso dashboard.partner.read + 6 concesiones
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- display_order 84 sigue al 83, el ultimo usado por cero_13 (verificado:
-- grep -n "display_order" 20251204001004_cero_13_seed_authorization_rbac.sql | tail -5).
-- Correccion del operador (2026-09-16, corrige decisiones.md §7): admin ve la pestana
-- Socio con el mismo alcance que senior_partner (toda la firma), ya no queda excluido.
-- Correccion del operador (2026-09-16, segunda ronda -- ver bugs/dashboard/socio/
-- reporte_ejecucion.md): esta pestana pasa a reemplazar visualmente a "Practica" en la UI
-- (Index.tsx/useDashboardAccess.ts ocultan el tab 'practica'; dashboard.practice_financials
-- .read no se toca). Se agrega risk_partner con scope 'assigned_engagements', IGUAL que
-- director/sqr -- NO firm-wide como en dashboard.practice_financials.read (el operador fue
-- explicito: "hasta que se defina bien que puede ver el socio de riesgos... solo vea lo que
-- esta asignado"). Este alcance nuevo es intencionalmente mas angosto que el que
-- risk_partner ya tiene hoy en list_portfolio_engagements() (firm-wide, 0828-185:126) --
-- aplica solo a este RPC de Dashboard, no a Encargos ni a ninguna otra pantalla.

INSERT INTO public.authorization_permissions (permission_key, module_key, action_key, label_key, display_order)
VALUES ('dashboard.partner.read', 'dashboard', 'partner.read', 'authz.perm.dashboard.partner.read', 84)
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key) VALUES
  ('senior_partner', 'dashboard.partner.read', 'firm'),
  ('admin',          'dashboard.partner.read', 'firm'),
  ('partner',        'dashboard.partner.read', 'assigned_engagements'),
  ('director',       'dashboard.partner.read', 'assigned_engagements'),
  ('sqr',            'dashboard.partner.read', 'assigned_engagements'),
  ('risk_partner',   'dashboard.partner.read', 'assigned_engagements')
ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 8. partner_overview() -- RPC principal (decisiones.md §2, §4, §5, §7, §9; plan_v2.md §7.1)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER + plpgsql: lleva el JWT del llamante via get_my_staff_id()/
-- current_role_key() (a diferencia de una edge function con service_role). Gateado por
-- has_permission('dashboard.partner.read'); fail-closed con RAISE EXCEPTION. Toda la
-- valorizacion se hace con joins/agregados en SQL (decisiones.md §8 obs.9, sin N+1):
-- un unico scan de time_entries con 3 FILTER (periodo, periodo anterior, vida completa).
--
-- `staff` se lee solo con columnas explicitas (staff_id, short_name, society_id,
-- category_id) -- nunca staff(*) -- porque staff.SELECT esta endurecida por columna en
-- Dev 2.0 (ver memoria del proyecto).

CREATE OR REPLACE FUNCTION public.partner_overview(
  p_start date,
  p_end date,
  p_fiscal_year integer DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL,
  p_industry_id uuid DEFAULT NULL,
  p_society_id uuid DEFAULT NULL  -- 2026-09-17: filtro de Sociedad, solo admin/senior_partner
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_permission('dashboard.partner.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.partner.read';
  END IF;

  v_result := (
  WITH
  -- ── 1. Llamante ──────────────────────────────────────────────────────────────────────
  caller AS (
    SELECT public.get_my_staff_id() AS staff_id,
           public.current_role_key() AS role_key
  ),
  caller_staff AS (
    SELECT s.staff_id AS resolved_staff_id, s.society_id, soc.name AS society_name
    FROM caller c
    LEFT JOIN public.staff s ON s.staff_id = c.staff_id
    LEFT JOIN public.society soc ON soc.society_id = s.society_id
  ),
  now_ctx AS (
    SELECT ((now() AT TIME ZONE 'America/La_Paz')::date) AS today
  ),
  default_rate AS (
    SELECT public.latest_exchange_rate() AS rate
  ),

  -- ── 2. Estado efectivo por encargo ───────────────────────────────────────────────────
  eng_state AS (
    SELECT
      e.engagement_id, e.client_id, e.engagement_name, e.partner_id, e.manager_id, e.sqr_id,
      e.society_id, e.start_date, e.end_date, e.anio_fiscal, e.fecha_cierre, e.funcion,
      e.work_order_required, e.engagement_state_override,
      cl.industry_id,
      wo.wo_id, wo.currency, wo.season_mode, wo.tax_rate, wo.adjustment_amount,
      wo.approval_status, wo.risk_status, wo.approved_at,
      public.effective_engagement_state(
        e.engagement_state_override, e.work_order_required, wo.wo_id,
        wo.approval_status, wo.risk_status, wo.approved_at
      ) AS state
    FROM public.engagements e
    JOIN public.clients cl ON cl.client_id = e.client_id
    LEFT JOIN public.work_orders wo ON wo.engagement_id = e.engagement_id
  ),

  -- ── 3. Alcance por rol (decisiones.md §2), SIN filtrar por estado todavia ───────────
  -- Correccion del operador (2026-09-16): director/sqr/risk_partner solo entran a la
  -- cartera principal (este CTE, y todo lo que se arma sobre scope_all/scope: KPI1, Bloques
  -- A-H, KPI5) por ser SOCIO del encargo (partner_id = yo). Ser SQR de un encargo (sqr_id =
  -- yo) YA NO alcanza aqui -- ese encargo no cuenta como "de tu cartera", sos parte del
  -- equipo. Las horas de SQR siguen visibles, pero SOLO via kpis.my_sqr_hours (CTEs
  -- my_sqr_engagements/my_sqr_budget/my_sqr_hours mas abajo, seccion 12), que ya eran
  -- siempre personales y NUNCA dependieron de este CTE -- no requieren cambio.
  role_scope AS (
    SELECT es.*
    FROM eng_state es
    CROSS JOIN caller c
    LEFT JOIN caller_staff cs ON true
    WHERE
      c.role_key IN ('senior_partner', 'admin')
      OR (c.role_key = 'partner' AND es.society_id IS NOT NULL AND cs.society_id IS NOT NULL
          AND es.society_id = cs.society_id)
      OR (c.role_key IN ('director', 'sqr', 'risk_partner') AND c.staff_id IS NOT NULL
          AND es.partner_id = c.staff_id)
  ),

  -- ── 4. scope_all: + estado 4/5 + funcion Cliente + filtro de periodo ────────────────
  -- 2026-09-17: revertido el intento de usar fecha_cierre para el filtro de periodo --
  -- vuelve al solapamiento start_date/end_date original (con anio_fiscal cuando el
  -- selector es FY completo). Motivo: start_date/end_date son la vida real del encargo
  -- (overlap con el rango elegido, no exige que empiece o termine adentro); fecha_cierre
  -- sola excluiria encargos activos cuyo cierre cae fuera del rango aunque hayan tenido
  -- horas/facturacion durante el periodo. fecha_cierre sigue usandose para KPI 1
  -- "finalizados en el periodo" y para el pp de cumplimiento del Bloque F (client-side).
  -- 2026-09-17: se agrega `funcion = 1` (Cliente) a la regla base de cartera -- los
  -- encargos con funcion Administrativo(0)/Capacitacion(2)/Calidad(3) NO entran a NINGUN
  -- bloque de este tablero (decision del operador: "toda esta grafica de Practica" es
  -- solo cartera de clientes). `funcion = 1` ya excluye NULL (dato legacy sin clasificar)
  -- sin necesidad de una clausula aparte -- la columna no es NOT NULL hoy (queda para
  -- otro issue), asi que un encargo sin clasificar queda afuera, igual que decidio el
  -- operador para las otras funciones.
  scope_all AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state IN (4, 5)
      AND rs.funcion = 1
      AND (
        CASE WHEN p_fiscal_year IS NOT NULL THEN rs.anio_fiscal = p_fiscal_year
             ELSE COALESCE(rs.start_date, p_start) <= p_end AND COALESCE(rs.end_date, p_end) >= p_start
        END
      )
  ),

  -- ── 5. Opciones de filtro (desde scope_all, antes de aplicar Cliente/Gerente/Sector) ─
  filters_clients AS (
    SELECT DISTINCT cl.client_id, cl.client_legal_name
    FROM scope_all sa JOIN public.clients cl ON cl.client_id = sa.client_id
  ),
  filters_managers AS (
    SELECT DISTINCT s.staff_id, s.short_name
    FROM scope_all sa JOIN public.staff s ON s.staff_id = sa.manager_id
    WHERE sa.manager_id IS NOT NULL
  ),
  filters_industries AS (
    SELECT DISTINCT i.industry_id, i.industry_name
    FROM scope_all sa JOIN public.industries i ON i.industry_id = sa.industry_id
    WHERE sa.industry_id IS NOT NULL
  ),
  -- 2026-09-17: opciones del filtro de Sociedad. Solo lo consume la UI para
  -- admin/senior_partner, pero se arma igual para cualquier rol (barato: 2 filas fijas).
  -- FIX 2026-09-17 (consolidado en review.md iteracion 2, MF-02): filters_societies NO se
  -- deriva de scope_all. Es un selector cerrado de las sociedades reales de la firma
  -- (decisiones.md §2) -- debe listar siempre las mismas opciones, tenga o no encargos
  -- calificados en el periodo/alcance actual (antes: `SELECT DISTINCT ... FROM scope_all sa
  -- JOIN public.society soc ...` -- una sociedad sin encargos en cartera desaparecia del
  -- selector, hallazgo real de revision visual del operador). Este fix vivia en una
  -- migracion incremental separada (20260917150000) que quedo retirada: como ninguna
  -- migracion de este feature esta aplicada a un ambiente real todavia (confirmado por el
  -- operador, review.md iteracion 2, MF-01), se consolido de vuelta aca en vez de mantener
  -- dos copias completas de partner_overview() (memoria del proyecto: minimizar archivos de
  -- migracion).
  filters_societies AS (
    SELECT soc.society_id, soc.name
    FROM public.society soc
    WHERE soc.is_active
  ),
  filters_agg AS (
    SELECT
      COALESCE((SELECT jsonb_agg(jsonb_build_object('client_id', client_id, 'client_legal_name', client_legal_name)
                                 ORDER BY client_legal_name) FROM filters_clients), '[]'::jsonb) AS clients,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('staff_id', staff_id, 'short_name', short_name)
                                 ORDER BY short_name) FROM filters_managers), '[]'::jsonb) AS managers,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('industry_id', industry_id, 'industry_name', industry_name)
                                 ORDER BY industry_name) FROM filters_industries), '[]'::jsonb) AS industries,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('society_id', society_id, 'name', name)
                                 ORDER BY name) FROM filters_societies), '[]'::jsonb) AS societies
  ),

  -- ── 6. scope: + filtros Cliente/Gerente/Sector/Sociedad del encabezado ──────────────
  scope AS (
    SELECT sa.*
    FROM scope_all sa
    WHERE (p_client_id IS NULL OR sa.client_id = p_client_id)
      AND (p_manager_id IS NULL OR sa.manager_id = p_manager_id)
      AND (p_industry_id IS NULL OR sa.industry_id = p_industry_id)
      AND (p_society_id IS NULL OR sa.society_id = p_society_id)
  ),

  -- ── 6b. scope_previous_year: MISMO alcance/filtros que `scope`, pero para el periodo
  -- desplazado un anio (review.md iteracion 1, MF-02). Antes, `previous_total_bob` sumaba
  -- sobre el `scope` ACTUAL filtrando approved_at al anio pasado -- un encargo que solo
  -- estuvo en cartera el anio pasado (y ya no esta en `scope` hoy) quedaba afuera de la
  -- comparacion. Mismo criterio de "periodo anterior" que ya usa hours_totals.prior_period_*
  -- mas abajo: siempre por solapamiento de fechas desplazado, sin distinguir FY completo
  -- (ninguna otra comparacion "vs anterior" del tablero lo distingue tampoco).
  scope_previous_year AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state IN (4, 5)
      AND rs.funcion = 1
      -- mismo default "sin fechas = siempre activo" que scope_all, pero contra la
      -- ventana desplazada (NO contra p_start/p_end actuales -- ese era el bug: con
      -- COALESCE(..., p_end) cualquier encargo con start_date/end_date NULL quedaba
      -- excluido siempre, porque p_end > p_end-1y nunca es <= p_end-1y).
      AND COALESCE(rs.start_date, (p_start - interval '1 year')::date) <= (p_end - interval '1 year')::date
      AND COALESCE(rs.end_date, (p_end - interval '1 year')::date) >= (p_start - interval '1 year')::date
      AND (p_client_id IS NULL OR rs.client_id = p_client_id)
      AND (p_manager_id IS NULL OR rs.manager_id = p_manager_id)
      AND (p_industry_id IS NULL OR rs.industry_id = p_industry_id)
      AND (p_society_id IS NULL OR rs.society_id = p_society_id)
  ),

  -- ── 7. wo: OT aprobada por encargo -- honorario, gastos, TC, bases neta/con IVA ─────
  -- Condicion 4.1/4.2: solo cuenta el fee/gastos/horas presupuestadas de una OT con
  -- approval_status = 'Approved' (un override manual puede forzar estado 4/5 aunque la
  -- OT real siga en Draft/Pending_Approval; esa OT no debe aportar dinero al tablero).
  wo_raw AS (
    SELECT
      s.engagement_id, s.wo_id, s.currency, s.season_mode,
      COALESCE(s.tax_rate, 0.13) AS tax_rate,
      COALESCE(s.adjustment_amount, 0) AS adjustment_amount,
      s.approval_status, s.approved_at,
      COALESCE(bl.fee, 0) AS total_standard_fee,
      COALESCE(eb.amt, 0) AS expense_budget,
      p.plan_id, p.exchange_rate AS plan_exchange_rate, p.exchange_rate_mode AS plan_exchange_rate_mode
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

  -- ── 8. budget_hours: horas presupuestadas por encargo y por categoria (4.2, KPI 3/4) ─
  budget_hours AS (
    SELECT s.engagement_id, cat.category_name, SUM(bl.budgeted_hours) AS hours
    FROM scope s
    JOIN public.wo_budget_lines bl ON bl.wo_id = s.wo_id AND s.approval_status = 'Approved'
    JOIN public.categories cat ON cat.category_id = bl.category_id
    GROUP BY s.engagement_id, cat.category_name
  ),
  budget_hours_total AS (
    SELECT engagement_id, SUM(hours) AS total_budget_hours
    FROM budget_hours GROUP BY engagement_id
  ),

  -- ── 9. hours: UN solo scan de time_entries (obs.9), 3 FILTER (periodo/anterior/vida) ─
  hours AS (
    SELECT
      s.engagement_id,
      CASE WHEN tla.status = 'approved' THEN 'approved'
           WHEN tla.status = 'rejected' THEN 'rejected'
           ELSE 'pending' END AS bucket,
      te.hours_logged,
      te.date_worked,
      CASE WHEN s.wo_id IS NULL THEN 0
        ELSE COALESCE(bl.standard_rate,
          CASE WHEN s.currency = 'BOB' THEN
                 CASE s.season_mode WHEN 'High' THEN cat.rate_high_bob ELSE cat.rate_low_bob END
               ELSE
                 CASE s.season_mode WHEN 'High' THEN cat.rate_high_usd ELSE cat.rate_low_usd END
          END, 0)
      END AS rate
    FROM scope s
    JOIN public.time_entries te ON te.engagement_id = s.engagement_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
    LEFT JOIN public.staff st ON st.staff_id = te.staff_id
    LEFT JOIN public.wo_budget_lines bl
      ON bl.wo_id = s.wo_id AND bl.category_id = st.category_id AND s.approval_status = 'Approved'
    LEFT JOIN public.categories cat ON cat.category_id = st.category_id
  ),
  hours_totals AS (
    SELECT
      engagement_id,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end) AS period_total,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'approved') AS period_approved,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'pending') AS period_pending,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'rejected') AS period_rejected,
      SUM(hours_logged) FILTER (
        WHERE date_worked BETWEEN (p_start - interval '1 year')::date AND (p_end - interval '1 year')::date
      ) AS prior_period_total,
      -- review.md iteracion 1, MF-03: excluye 'rejected' del total de vida usado para
      -- sobregiro (decisiones.md §4.3: rechazadas solo van al tooltip, nunca cuentan como
      -- "cargado"). Antes este total sumaba TODOS los buckets.
      SUM(hours_logged) FILTER (WHERE bucket IN ('approved', 'pending')) AS lifetime_consumed,
      SUM(hours_logged * rate) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'approved') AS period_value_approved,
      SUM(hours_logged * rate) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'pending') AS period_value_pending,
      SUM(hours_logged * rate) FILTER (
        WHERE date_worked BETWEEN (p_start - interval '1 year')::date AND (p_end - interval '1 year')::date
      ) AS prior_period_value
    FROM hours
    GROUP BY engagement_id
  ),

  -- ── 10. expenses: 4.6, revisado_asistente (gastado) + aprobado_gerente (tooltip) ────
  expenses_by_engagement AS (
    SELECT
      w.engagement_id,
      COALESCE(SUM(fre.amount * CASE fre.currency WHEN 'BOB' THEN 1 ELSE COALESCE(w.rate_to_bob, (SELECT rate FROM default_rate)) END)
        FILTER (WHERE fre.status = 'revisado_asistente' AND fre.expense_date BETWEEN p_start AND p_end), 0) AS reviewed_bob,
      COALESCE(SUM(fre.amount * CASE fre.currency WHEN 'BOB' THEN 1 ELSE COALESCE(w.rate_to_bob, (SELECT rate FROM default_rate)) END)
        FILTER (WHERE fre.status = 'aprobado_gerente' AND fre.expense_date BETWEEN p_start AND p_end), 0) AS manager_approved_bob
    FROM wo w
    LEFT JOIN public.fund_request_expenses fre ON fre.wo_id = w.wo_id
    GROUP BY w.engagement_id
  ),

  -- ── 11. installments: Bloque B (fechas reales) + Bloque C (fechas pactadas) ─────────
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
  economic_cycle AS (
    SELECT
      COALESCE(SUM(inst.amount_native * inst.rate_to_bob), 0) AS to_invoice_bob,
      COALESCE(SUM(inst.amount_native * inst.invoice_rate) FILTER (
        WHERE inst.status IN ('Invoiced', 'Completed', 'Overdue')
          AND inst.collection_invoice_date BETWEEN p_start AND p_end
      ), 0) AS invoiced_bob,
      COALESCE(SUM(inst.amount_native * inst.payment_rate) FILTER (
        WHERE inst.status = 'Completed'
          AND COALESCE(inst.payment_date_actual, inst.collection_payment_date) BETWEEN p_start AND p_end
      ), 0) AS collected_bob,
      COALESCE(SUM(inst.amount_native * inst.invoice_rate) FILTER (
        WHERE inst.status IN ('Invoiced', 'Overdue')
          AND inst.collection_invoice_date < (SELECT today FROM now_ctx) - 90
      ), 0) AS overdue_90_bob,
      COUNT(*) FILTER (
        WHERE inst.status IN ('Invoiced', 'Overdue')
          AND inst.collection_invoice_date < (SELECT today FROM now_ctx) - 90
      ) AS overdue_90_count,
      AVG(COALESCE(inst.payment_date_actual, inst.collection_payment_date) - inst.collection_invoice_date) FILTER (
        WHERE inst.status = 'Completed'
          AND COALESCE(inst.payment_date_actual, inst.collection_payment_date) BETWEEN p_start AND p_end
      ) AS avg_collection_days
    FROM installments_full inst
  ),
  collections_by_status AS (
    SELECT jsonb_build_object(
      'collected', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status = 'Completed'),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.payment_rate) FILTER (WHERE inst.status = 'Completed'), 0)),
      'invoiced', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status IN ('Invoiced', 'Overdue')),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.invoice_rate) FILTER (WHERE inst.status IN ('Invoiced', 'Overdue')), 0)),
      'in_arrears', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status = 'Pending' AND inst.agreed_invoice_date < (SELECT today FROM now_ctx)),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.rate_to_bob) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date < (SELECT today FROM now_ctx)), 0)),
      'upcoming', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status = 'Pending' AND inst.agreed_invoice_date >= (SELECT today FROM now_ctx)),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.rate_to_bob) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date >= (SELECT today FROM now_ctx)), 0))
    ) AS by_status
    FROM installments_full inst
  ),
  next7 AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'installment_id', inst.installment_id, 'wo_id', inst.wo_id, 'engagement_id', inst.engagement_id,
        'client_legal_name', cl.client_legal_name,
        'kind', CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN 'collect' ELSE 'invoice' END,
        'date', CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN inst.agreed_payment_date ELSE inst.agreed_invoice_date END,
        -- review.md dash_socio iteración 9, G-01 (2026-09-22): una cuota ya facturada
        -- (Invoiced/Overdue) se valora al TC congelado de su factura (invoice_rate), NO al
        -- TC del plan (rate_to_bob) -- consistente con collections_by_status.invoiced, unas
        -- lineas mas arriba. Solo las Pending (aun sin facturar, kind='invoice') usan
        -- rate_to_bob, porque todavia no hay TC congelado.
        'amount_bob', CASE WHEN inst.status IN ('Invoiced', 'Overdue')
                        THEN inst.amount_native * inst.invoice_rate
                        ELSE inst.amount_native * inst.rate_to_bob END
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
  overdue_list AS (
    SELECT
      COUNT(*) AS cnt,
      COALESCE(SUM(inst.amount_native * inst.rate_to_bob), 0) AS amt,
      COALESCE(jsonb_agg(jsonb_build_object(
        'installment_id', inst.installment_id, 'wo_id', inst.wo_id,
        'client_legal_name', cl.client_legal_name,
        'agreed_payment_date', inst.agreed_payment_date,
        'amount_bob', inst.amount_native * inst.rate_to_bob
      ) ORDER BY inst.agreed_payment_date), '[]'::jsonb) AS items
    FROM installments_full inst
    JOIN public.engagements e ON e.engagement_id = inst.engagement_id
    JOIN public.clients cl ON cl.client_id = e.client_id
    WHERE inst.status IN ('Invoiced', 'Overdue') AND inst.agreed_payment_date < (SELECT today FROM now_ctx)
  ),

  -- ── 12. my_engagements/my_budget/my_hours: KPI 3/4, SIEMPRE personales ──────────────
  -- 2026-09-17: KPI 3/4 son personales y no pasan por scope_all, pero tambien se
  -- acotan a funcion=1 (Cliente) -- decision del operador ("si a las horas tambien,
  -- solo si es para cliente").
  my_partner_engagements AS (
    SELECT es.* FROM eng_state es CROSS JOIN caller c
    WHERE es.state IN (4, 5) AND es.funcion = 1 AND c.staff_id IS NOT NULL AND es.partner_id = c.staff_id
  ),
  my_sqr_engagements AS (
    SELECT es.* FROM eng_state es CROSS JOIN caller c
    WHERE es.state IN (4, 5) AND es.funcion = 1 AND c.staff_id IS NOT NULL AND es.sqr_id = c.staff_id
  ),
  my_partner_budget AS (
    SELECT COALESCE(SUM(bl.budgeted_hours), 0) AS hours
    FROM my_partner_engagements mpe
    JOIN public.wo_budget_lines bl ON bl.wo_id = mpe.wo_id AND mpe.approval_status = 'Approved'
    JOIN public.categories cat ON cat.category_id = bl.category_id AND cat.category_name = 'Socio'
  ),
  my_sqr_budget AS (
    SELECT COALESCE(SUM(bl.budgeted_hours), 0) AS hours
    FROM my_sqr_engagements mse
    JOIN public.wo_budget_lines bl ON bl.wo_id = mse.wo_id AND mse.approval_status = 'Approved'
    JOIN public.categories cat ON cat.category_id = bl.category_id AND cat.category_name = 'SQR'
  ),
  my_partner_hours AS (
    SELECT
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND tla.status = 'approved'), 0) AS approved,
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND (tla.status IS NULL OR tla.status = 'pending')), 0) AS pending,
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND tla.status = 'rejected'), 0) AS rejected
    FROM my_partner_engagements mpe
    CROSS JOIN caller c
    JOIN public.time_entries te
      ON te.engagement_id = mpe.engagement_id AND te.staff_id = c.staff_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
  ),
  my_sqr_hours AS (
    SELECT
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND tla.status = 'approved'), 0) AS approved,
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND (tla.status IS NULL OR tla.status = 'pending')), 0) AS pending,
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND tla.status = 'rejected'), 0) AS rejected
    FROM my_sqr_engagements mse
    CROSS JOIN caller c
    JOIN public.time_entries te
      ON te.engagement_id = mse.engagement_id AND te.staff_id = c.staff_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
  ),
  my_sqr_engagement_list AS (
    SELECT
      COUNT(*) AS cnt,
      COALESCE(jsonb_agg(jsonb_build_object('engagement_id', engagement_id, 'engagement_name', engagement_name)), '[]'::jsonb) AS items
    FROM my_sqr_engagements
  ),

  -- ── 13. wo_pending: OT pendientes/riesgo pendiente, TODOS los estados (KPI 5) ───────
  wo_pending_scope AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.funcion = 1  -- 2026-09-17: solo cartera de clientes, igual que scope_all
      AND (p_client_id IS NULL OR rs.client_id = p_client_id)
      AND (p_manager_id IS NULL OR rs.manager_id = p_manager_id)
      AND (p_industry_id IS NULL OR rs.industry_id = p_industry_id)
      AND (p_society_id IS NULL OR rs.society_id = p_society_id)
  ),
  wo_pending AS (
    SELECT
      COUNT(*) FILTER (WHERE approval_status = 'Pending_Approval') AS pending_wo_count,
      COUNT(*) FILTER (WHERE risk_status = 'Pending' AND approval_status = 'Approved') AS pending_risk_count
    FROM wo_pending_scope
  ),

  -- ── 14. finalizados en el periodo (KPI 1, obs.8: end_date como proxy) ───────────────
  finalized_scope AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state = 7
      AND rs.funcion = 1  -- 2026-09-17: solo cartera de clientes, igual que scope_all
      AND rs.end_date BETWEEN p_start AND p_end
      AND (p_client_id IS NULL OR rs.client_id = p_client_id)
      AND (p_manager_id IS NULL OR rs.manager_id = p_manager_id)
      AND (p_industry_id IS NULL OR rs.industry_id = p_industry_id)
      AND (p_society_id IS NULL OR rs.society_id = p_society_id)
  ),

  -- ── 15. alertas adicionales (Bloque H) ──────────────────────────────────────────────
  alerts_extra AS (
    SELECT
      COUNT(*) FILTER (WHERE s.fecha_cierre BETWEEN (SELECT today FROM now_ctx) AND (SELECT today FROM now_ctx) + 30) AS closing_soon,
      COUNT(*) FILTER (WHERE s.risk_status = 'Pending' AND s.approval_status = 'Approved') AS risk_pending
    FROM scope s
  ),
  draft_worksheets_agg AS (
    SELECT COUNT(*) AS cnt
    FROM public.activity_worksheets aw
    JOIN scope s ON s.engagement_id = aw.engagement_id
    WHERE aw.status = 'draft' AND aw.wo_id IS NULL
  ),

  -- ── 16. filas por encargo (Bloque F, sobregiro de KPI 5, Bloque E) ──────────────────
  engagement_rows AS (
    SELECT
      s.engagement_id, s.engagement_name, s.client_id, s.manager_id, s.industry_id,
      s.approval_status, s.risk_status, s.state,
      cl.client_legal_name,
      mgr.short_name AS manager_short_name,
      COALESCE(bt.total_budget_hours, 0) AS budget_hours,
      COALESCE(ht.period_approved, 0) AS approved_hours,
      COALESCE(ht.period_pending, 0) AS pending_hours,
      COALESCE(ht.period_rejected, 0) AS rejected_hours,
      COALESCE(ht.lifetime_consumed, 0) AS lifetime_hours,
      (COALESCE(ht.lifetime_consumed, 0) > COALESCE(bt.total_budget_hours, 0)) AS over_budget,
      CASE WHEN COALESCE(bt.total_budget_hours, 0) > 0
           THEN COALESCE(ht.lifetime_consumed, 0) / bt.total_budget_hours
           ELSE 0 END AS consumption_ratio
    FROM scope s
    JOIN public.clients cl ON cl.client_id = s.client_id
    LEFT JOIN public.staff mgr ON mgr.staff_id = s.manager_id
    LEFT JOIN budget_hours_total bt ON bt.engagement_id = s.engagement_id
    LEFT JOIN hours_totals ht ON ht.engagement_id = s.engagement_id
  ),
  -- 2026-09-17: se retira engagement_hours_agg (preview fijo de 20, ordenado siempre
  -- igual). El Bloque F ya no lee un preview de este payload -- consulta siempre
  -- partner_overview_engagements() (mismos filtros + p_sort_key + p_over_budget_only),
  -- que ahora también sirve la vista "top 10" además de "Ver todos". engagement_rows se
  -- mantiene solo para over_budget_agg (KPI 5 / Bloque H).
  over_budget_agg AS (
    SELECT COUNT(*) FILTER (WHERE over_budget) AS cnt FROM engagement_rows
  ),

  -- ── 17. sectores, gerentes, top clientes ────────────────────────────────────────────
  sectors AS (
    SELECT s.industry_id, ind.industry_name,
      COUNT(*) AS engagement_count,
      COALESCE(SUM(w.fee_net * w.rate_to_bob), 0) AS fee_bob
    FROM scope s
    LEFT JOIN public.industries ind ON ind.industry_id = s.industry_id
    LEFT JOIN wo w ON w.engagement_id = s.engagement_id
    GROUP BY s.industry_id, ind.industry_name
  ),
  sectors_agg AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'industry_id', industry_id, 'industry_name', industry_name,
        'engagement_count', engagement_count, 'fee_bob', fee_bob
      ) ORDER BY fee_bob DESC), '[]'::jsonb) AS items
    FROM sectors
  ),
  managers AS (
    SELECT s.manager_id AS staff_id, st.short_name,
      COUNT(*) AS engagement_count,
      COALESCE(SUM(bt.total_budget_hours), 0) AS budget_hours,
      COALESCE(SUM(ht.period_approved), 0) AS approved_hours,
      COALESCE(SUM(ht.period_pending), 0) AS pending_hours,
      COUNT(*) FILTER (WHERE s.approval_status = 'Pending_Approval') AS pending_wo_count,
      -- 2026-09-17 (Bloque E rediseñado a tabla): fecha de inicio más próxima y fecha fin
      -- más lejana entre los encargos 4/5 del gerente (mismo alcance de siempre).
      MIN(s.start_date) AS start_date,
      MAX(s.end_date) AS end_date
    FROM scope s
    LEFT JOIN public.staff st ON st.staff_id = s.manager_id
    LEFT JOIN budget_hours_total bt ON bt.engagement_id = s.engagement_id
    LEFT JOIN hours_totals ht ON ht.engagement_id = s.engagement_id
    WHERE s.manager_id IS NOT NULL
    GROUP BY s.manager_id, st.short_name
  ),
  managers_agg AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'staff_id', staff_id, 'short_name', short_name, 'engagement_count', engagement_count,
        'budget_hours', budget_hours, 'approved_hours', approved_hours, 'pending_hours', pending_hours,
        'pending_wo_count', pending_wo_count, 'start_date', start_date, 'end_date', end_date
      ) ORDER BY (CASE WHEN budget_hours > 0 THEN (approved_hours + pending_hours) / budget_hours ELSE 0 END) DESC),
      '[]'::jsonb) AS items
    FROM managers
  ),
  top_clients_base AS (
    SELECT
      s.client_id, cl.client_legal_name,
      COUNT(*) AS engagement_count,
      COALESCE(SUM(w.fee_net * w.rate_to_bob), 0) AS fee_bob,
      COALESCE(SUM(w.fee_net * w.rate_to_bob), 0)
        - (COALESCE(SUM(ht.period_value_approved), 0) + COALESCE(SUM(ht.period_value_pending), 0) + COALESCE(SUM(eb.reviewed_bob), 0)) AS margin_abs,
      COALESCE(SUM(ifull.to_invoice_bob), 0) AS to_invoice_bob,
      COALESCE(SUM(ifull.collected_bob), 0) AS collected_bob
    FROM scope s
    JOIN public.clients cl ON cl.client_id = s.client_id
    LEFT JOIN wo w ON w.engagement_id = s.engagement_id
    LEFT JOIN hours_totals ht ON ht.engagement_id = s.engagement_id
    LEFT JOIN expenses_by_engagement eb ON eb.engagement_id = s.engagement_id
    LEFT JOIN (
      SELECT engagement_id,
        SUM(amount_native * rate_to_bob) AS to_invoice_bob,
        SUM(amount_native * payment_rate) FILTER (WHERE status = 'Completed') AS collected_bob
      FROM installments_full GROUP BY engagement_id
    ) ifull ON ifull.engagement_id = s.engagement_id
    GROUP BY s.client_id, cl.client_legal_name
  ),
  top_clients_agg AS (
    SELECT COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'client_id', client_id, 'client_legal_name', client_legal_name, 'fee_bob', fee_bob,
          'engagement_count', engagement_count,
          'margin_pct', CASE WHEN fee_bob > 0 THEN round((margin_abs / fee_bob) * 100, 2) ELSE NULL END,
          'collected_pct', CASE WHEN to_invoice_bob > 0 THEN round((collected_bob / to_invoice_bob) * 100, 2) ELSE NULL END
        ) ORDER BY fee_bob DESC)
       FROM (SELECT * FROM top_clients_base ORDER BY fee_bob DESC LIMIT 5) t5),  -- 2026-09-17: 3 -> 5
      '[]'::jsonb
    ) AS items
  ),

  -- ── 18. rentabilidad (Bloque A) + honorarios/sparkline (KPI 2) ──────────────────────
  profitability_agg AS (
    SELECT
      COALESCE(SUM(bt.total_budget_hours), 0) AS hours_budget,
      COALESCE(SUM(ht.period_approved), 0) AS hours_approved,
      COALESCE(SUM(ht.period_pending), 0) AS hours_pending,
      COALESCE(SUM(ht.period_rejected), 0) AS hours_rejected,
      COALESCE(SUM(ht.prior_period_total), 0) AS hours_previous_logged,
      COALESCE(SUM(w.fee_net * w.rate_to_bob), 0) AS money_fee_net,
      COALESCE(SUM(w.expense_budget * w.rate_to_bob), 0) AS money_expense_budget,
      COALESCE(SUM(ht.period_value_approved), 0) AS money_hours_valued_approved,
      COALESCE(SUM(ht.period_value_pending), 0) AS money_hours_valued_pending,
      COALESCE(SUM(eb.reviewed_bob), 0) AS money_expenses_reviewed,
      COALESCE(SUM(eb.manager_approved_bob), 0) AS money_expenses_manager_approved,
      COALESCE(SUM(ht.prior_period_value), 0) AS money_previous_executed,
      COUNT(*) FILTER (WHERE w.wo_id IS NOT NULL AND w.plan_exchange_rate_mode = 'variable') AS variable_rate_count,
      COUNT(*) FILTER (WHERE w.wo_id IS NOT NULL AND w.rate_to_bob IS NULL) AS nonconvertible_count
    FROM scope s
    LEFT JOIN budget_hours_total bt ON bt.engagement_id = s.engagement_id
    LEFT JOIN hours_totals ht ON ht.engagement_id = s.engagement_id
    LEFT JOIN wo w ON w.engagement_id = s.engagement_id
    LEFT JOIN expenses_by_engagement eb ON eb.engagement_id = s.engagement_id
  ),
  nonconvertible_agg AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'engagement_id', w.engagement_id, 'currency', w.currency, 'fee_native', w.fee_net
      )), '[]'::jsonb) AS items
    FROM wo w
    WHERE w.wo_id IS NOT NULL AND w.rate_to_bob IS NULL
  ),
  -- prev_wo_fee (MF-02): honorario neto en Bs de los encargos que estaban en cartera
  -- HACE UN ANIO (scope_previous_year), no de los de hoy. Reimplementa solo lo que
  -- fees_agg necesita de wo_raw/wo_rate (fee_net + TC) porque `wo` esta atado a `scope`.
  prev_wo_fee AS (
    SELECT
      spy.engagement_id,
      (COALESCE(bl.fee, 0) + COALESCE(spy.adjustment_amount, 0)) AS fee_net,
      CASE
        WHEN spy.currency = 'BOB' THEN 1
        WHEN p.exchange_rate IS NOT NULL THEN p.exchange_rate
        WHEN spy.currency = 'USD' THEN (SELECT rate FROM default_rate)
        ELSE NULL
      END AS rate_to_bob
    FROM scope_previous_year spy
    LEFT JOIN LATERAL (
      SELECT SUM(bl.budgeted_hours * bl.standard_rate) AS fee
      FROM public.wo_budget_lines bl
      WHERE bl.wo_id = spy.wo_id AND spy.approval_status = 'Approved'
    ) bl ON true
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = spy.wo_id
  ),
  fees_agg AS (
    SELECT
      COALESCE(SUM(w.fee_net * w.rate_to_bob), 0) AS total_bob,
      (SELECT COALESCE(SUM(pf.fee_net * pf.rate_to_bob), 0) FROM prev_wo_fee pf) AS previous_total_bob
    FROM scope s
    LEFT JOIN wo w ON w.engagement_id = s.engagement_id
  ),
  fees_monthly AS (
    SELECT date_trunc('month', w.approved_at)::date AS month, SUM(w.fee_net * w.rate_to_bob) AS value_bob
    FROM scope s
    LEFT JOIN wo w ON w.engagement_id = s.engagement_id
    WHERE w.approved_at BETWEEN p_start AND p_end
    GROUP BY date_trunc('month', w.approved_at)
  ),
  fees_monthly_agg AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'value_bob', value_bob)
      ORDER BY month), '[]'::jsonb) AS items
    FROM fees_monthly
  ),

  -- ── 19. conteos de alcance (meta) ────────────────────────────────────────────────────
  scope_counts AS (
    SELECT
      (SELECT COUNT(*) FROM scope_all) AS unfiltered_scope_count,
      (SELECT COUNT(*) FROM scope) AS scope_count,
      (SELECT COUNT(*) FILTER (WHERE state = 4) FROM scope) AS approved_count,
      (SELECT COUNT(*) FILTER (WHERE state = 5) FROM scope) AS emergency_count
  ),
  finalized_count AS (
    SELECT COUNT(*) AS cnt FROM finalized_scope
  ),

  -- ── 19b. Fila resumen "Encargos finalizados" (pedido del operador 2026-09-19): extiende
  -- finalized_scope/finalized_count (arriba, ya usado por kpis.engagements.finalized_in_period)
  -- con presupuesto/ejecutado/honorarios pagados. budget_hours/executed_hours son de VIDA
  -- COMPLETA del encargo (desempeño final, no solo lo cargado durante la ventana de
  -- cierre); collected_bob usa el mismo criterio "Completed" que collections_by_status.
  finalized_wo_raw AS (
    SELECT
      fs.engagement_id, wo.wo_id, wo.currency, wo.season_mode,
      COALESCE(wo.tax_rate, 0.13) AS tax_rate,
      COALESCE(wo.adjustment_amount, 0) AS adjustment_amount,
      COALESCE(bl.fee, 0) AS total_standard_fee,
      COALESCE(eb.amt, 0) AS expense_budget,
      p.exchange_rate AS plan_exchange_rate
    FROM finalized_scope fs
    JOIN public.work_orders wo ON wo.engagement_id = fs.engagement_id AND wo.approval_status = 'Approved'
    LEFT JOIN LATERAL (
      SELECT SUM(bl.budgeted_hours * bl.standard_rate) AS fee
      FROM public.wo_budget_lines bl WHERE bl.wo_id = wo.wo_id
    ) bl ON true
    LEFT JOIN LATERAL (
      SELECT SUM(eb.budgeted_amount) AS amt
      FROM public.wo_expense_budget eb WHERE eb.wo_id = wo.wo_id
    ) eb ON true
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = wo.wo_id
  ),
  finalized_wo AS (
    SELECT
      fwr.*,
      (fwr.total_standard_fee + fwr.adjustment_amount) AS fee_net,
      CASE
        WHEN fwr.currency = 'BOB' THEN 1
        WHEN fwr.plan_exchange_rate IS NOT NULL THEN fwr.plan_exchange_rate
        WHEN fwr.currency = 'USD' THEN (SELECT rate FROM default_rate)
        ELSE NULL
      END AS rate_to_bob
    FROM finalized_wo_raw fwr
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
  finalized_collected AS (
    SELECT COALESCE(SUM(
      COALESCE(i.amount, i.percentage * ((fw.fee_net + fw.expense_budget) / NULLIF(1 - fw.tax_rate, 0)) / 100)
      * COALESCE(i.payment_exchange_rate, i.invoice_exchange_rate, fw.rate_to_bob)
    ) FILTER (WHERE i.status = 'Completed'), 0) AS collected_bob
    FROM finalized_wo fw
    JOIN public.wo_payment_installments i ON i.wo_id = fw.wo_id
  )

  -- ── 20. Ensamblado final ─────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'role_key', c.role_key,
      'scope_kind', CASE c.role_key
                      WHEN 'senior_partner' THEN 'firm'
                      WHEN 'admin' THEN 'firm'
                      WHEN 'partner' THEN 'society'
                      WHEN 'director' THEN 'own'
                      WHEN 'sqr' THEN 'own'
                      WHEN 'risk_partner' THEN 'own'
                      ELSE 'none' END,
      'society_name', cs.society_name,
      'scope_count', sc.scope_count,
      'unfiltered_scope_count', sc.unfiltered_scope_count,
      'variable_rate_count', pa.variable_rate_count,
      'nonconvertible_count', pa.nonconvertible_count,
      'today', nc.today
    ),
    'filters', jsonb_build_object(
      'clients', fa.clients, 'managers', fa.managers, 'industries', fa.industries, 'societies', fa.societies
    ),
    'kpis', jsonb_build_object(
      'engagements', jsonb_build_object(
        'total', sc.scope_count, 'approved', sc.approved_count, 'emergency', sc.emergency_count,
        'finalized_in_period', fc.cnt
      ),
      'fees', jsonb_build_object(
        'total_bob', fe.total_bob, 'previous_total_bob', fe.previous_total_bob, 'sparkline', fma.items
      ),
      'my_partner_hours', jsonb_build_object(
        'budget', mpb.hours, 'approved', mph.approved, 'pending', mph.pending, 'rejected', mph.rejected
      ),
      'my_sqr_hours', jsonb_build_object(
        'budget', msb.hours, 'approved', msh.approved, 'pending', msh.pending, 'rejected', msh.rejected,
        'engagement_count', msel.cnt, 'engagements', msel.items
      ),
      'alerts', jsonb_build_object(
        'over_budget_count', oba.cnt, 'portfolio_count', sc.scope_count,
        'pending_wo_count', wp.pending_wo_count, 'pending_risk_count', wp.pending_risk_count
      )
    ),
    'profitability', jsonb_build_object(
      'hours', jsonb_build_object(
        'budget', pa.hours_budget, 'approved', pa.hours_approved, 'pending', pa.hours_pending,
        'rejected', pa.hours_rejected, 'previous_logged', pa.hours_previous_logged
      ),
      'money_bob', jsonb_build_object(
        'fee_net', pa.money_fee_net, 'expense_budget', pa.money_expense_budget,
        'hours_valued_approved', pa.money_hours_valued_approved, 'hours_valued_pending', pa.money_hours_valued_pending,
        'expenses_reviewed', pa.money_expenses_reviewed, 'expenses_manager_approved', pa.money_expenses_manager_approved,
        'previous_executed', pa.money_previous_executed
      ),
      'nonconvertible', nca.items
    ),
    'economic_cycle', jsonb_build_object(
      'to_invoice_bob', ec.to_invoice_bob, 'invoiced_bob', ec.invoiced_bob, 'collected_bob', ec.collected_bob,
      'overdue_90_bob', ec.overdue_90_bob, 'avg_collection_days', ec.avg_collection_days
    ),
    'collections', jsonb_build_object(
      'by_status', cbs.by_status,
      'next_7_days', n7.items,
      'overdue', jsonb_build_object('count', ol.cnt, 'amount_bob', ol.amt, 'items', ol.items)
    ),
    'sectors', sa.items,
    'managers', ma.items,
    'top_clients', tca.items,
    'alerts', jsonb_build_object(
      'pending_wo', wp.pending_wo_count, 'over_budget', oba.cnt, 'in_arrears', (cbs.by_status->'in_arrears'->>'count')::int,
      'overdue_90', ec.overdue_90_count, 'closing_soon', ae.closing_soon, 'risk_pending', ae.risk_pending,
      'draft_worksheets', dwa.cnt
    ),
    'finalized_summary', jsonb_build_object(
      'count', fc.cnt, 'budget_hours', fzb.budget_hours,
      'executed_hours', fzh.executed_hours, 'collected_bob', fzcol.collected_bob
    )
  )
  FROM caller c
  CROSS JOIN caller_staff cs
  CROSS JOIN now_ctx nc
  CROSS JOIN scope_counts sc
  CROSS JOIN finalized_count fc
  CROSS JOIN filters_agg fa
  CROSS JOIN fees_agg fe
  CROSS JOIN fees_monthly_agg fma
  CROSS JOIN my_partner_budget mpb
  CROSS JOIN my_partner_hours mph
  CROSS JOIN my_sqr_budget msb
  CROSS JOIN my_sqr_hours msh
  CROSS JOIN my_sqr_engagement_list msel
  CROSS JOIN wo_pending wp
  CROSS JOIN over_budget_agg oba
  CROSS JOIN profitability_agg pa
  CROSS JOIN nonconvertible_agg nca
  CROSS JOIN economic_cycle ec
  CROSS JOIN collections_by_status cbs
  CROSS JOIN next7 n7
  CROSS JOIN overdue_list ol
  CROSS JOIN sectors_agg sa
  CROSS JOIN managers_agg ma
  CROSS JOIN top_clients_agg tca
  CROSS JOIN alerts_extra ae
  CROSS JOIN draft_worksheets_agg dwa
  CROSS JOIN finalized_budget fzb
  CROSS JOIN finalized_hours fzh
  CROSS JOIN finalized_collected fzcol
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.partner_overview(date, date, integer, uuid, uuid, uuid, uuid) IS 'dash_socio (decisiones.md, plan_v2.md §7.1): payload unico del tablero "Practica" (re-etiquetado 2026-09-16, reemplaza visualmente al viejo tab practica/dashboard.practice_financials.read -- ver Index.tsx) con 5 KPI + bloques A-H en un round-trip. Gateado por dashboard.partner.read; alcance por role_key (senior_partner/admin=firma, partner=sociedad, director/sqr/risk_partner=SOLO partner_id = yo -- ser sqr_id ya no basta, ver comentario en role_scope), conjunto base = estado efectivo 4/5 + funcion=1/Cliente (2026-09-17: excluye Administrativo/Capacitacion/Calidad de TODO el tablero, incl. KPI 3/4), filtrado por periodo via solapamiento start_date/end_date u anio_fiscal si el selector es FY completo (revertido 2026-09-17, ver comentario en scope_all). p_society_id (2026-09-17) angosta por sociedad, solo lo setea la UI para admin/senior_partner. El Bloque F ya no viaja en este payload -- ver partner_overview_engagements(). Ver bugs/dashboard/socio/plan_v2.md §7.3 para el contrato exacto del payload.';

REVOKE ALL ON FUNCTION public.partner_overview(date, date, integer, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_overview(date, date, integer, uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 9. partner_overview_engagements() -- Bloque F completo (plan_v2.md §7.2)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2026-09-17: deja de ser solo el paginado bajo demanda de "Ver todos" -- ahora es la ÚNICA
-- fuente de filas del Bloque F. El payload de partner_overview() ya no trae un preview fijo
-- (era top 20 ordenado siempre igual: reordenar del lado del cliente por un criterio
-- distinto al que uso el servidor para recortar no da el verdadero top-N de ese criterio
-- sobre TODA la cartera). El frontend llama a esta función tanto para la vista compacta
-- (p_limit=10, offset=0, el orden/filtro activo) como para "Ver todos" (p_limit mayor) --
-- mismos parámetros, un solo camino de datos. Nuevos: p_society_id (2026-09-17, filtro de
-- Sociedad), p_sort_key ('start_date'|'end_date'|'progress'|'pending_pct' -- fechas
-- ascendente, porcentajes descendente, decisión del operador 2026-09-17) y
-- p_over_budget_only (reemplaza el filtrado client-side que hacia el toggle "Solo
-- sobregirados"). Devuelve {total, items}; total ya refleja p_over_budget_only.

CREATE OR REPLACE FUNCTION public.partner_overview_engagements(
  p_start date,
  p_end date,
  p_fiscal_year integer DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL,
  p_industry_id uuid DEFAULT NULL,
  p_society_id uuid DEFAULT NULL,
  p_sort_key text DEFAULT 'end_date',
  p_over_budget_only boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 0), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_sort_key text := CASE WHEN p_sort_key IN ('start_date', 'end_date', 'progress', 'pending_pct')
                          THEN p_sort_key ELSE 'end_date' END;
BEGIN
  IF NOT public.has_permission('dashboard.partner.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.partner.read';
  END IF;

  v_result := (
  WITH
  caller AS (
    SELECT public.get_my_staff_id() AS staff_id,
           public.current_role_key() AS role_key
  ),
  caller_staff AS (
    SELECT s.staff_id AS resolved_staff_id, s.society_id
    FROM caller c
    LEFT JOIN public.staff s ON s.staff_id = c.staff_id
  ),
  eng_state AS (
    SELECT
      e.engagement_id, e.client_id, e.engagement_name, e.partner_id, e.manager_id, e.sqr_id,
      e.society_id, e.start_date, e.end_date, e.anio_fiscal, e.fecha_cierre, e.funcion,
      e.work_order_required, e.engagement_state_override,
      cl.industry_id,
      wo.wo_id, wo.currency, wo.season_mode, wo.approval_status, wo.risk_status, wo.approved_at,
      public.effective_engagement_state(
        e.engagement_state_override, e.work_order_required, wo.wo_id,
        wo.approval_status, wo.risk_status, wo.approved_at
      ) AS state
    FROM public.engagements e
    JOIN public.clients cl ON cl.client_id = e.client_id
    LEFT JOIN public.work_orders wo ON wo.engagement_id = e.engagement_id
  ),
  role_scope AS (
    SELECT es.*
    FROM eng_state es
    CROSS JOIN caller c
    LEFT JOIN caller_staff cs ON true
    WHERE
      c.role_key IN ('senior_partner', 'admin')
      OR (c.role_key = 'partner' AND es.society_id IS NOT NULL AND cs.society_id IS NOT NULL
          AND es.society_id = cs.society_id)
      OR (c.role_key IN ('director', 'sqr', 'risk_partner') AND c.staff_id IS NOT NULL
          AND es.partner_id = c.staff_id)
  ),
  -- 2026-09-17: revertido el intento de usar fecha_cierre (mismo motivo que
  -- partner_overview() -- ver comentario ahi). Vuelve al solapamiento start_date/end_date
  -- original, con anio_fiscal si el selector es FY completo. Se agrega funcion=1
  -- (Cliente): decision del operador, excluye Administrativo/Capacitacion/Calidad de
  -- TODO el tablero, tambien de este bloque.
  scope_all AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state IN (4, 5)
      AND rs.funcion = 1
      AND (
        CASE WHEN p_fiscal_year IS NOT NULL THEN rs.anio_fiscal = p_fiscal_year
             ELSE COALESCE(rs.start_date, p_start) <= p_end AND COALESCE(rs.end_date, p_end) >= p_start
        END
      )
  ),
  scope AS (
    SELECT sa.*
    FROM scope_all sa
    WHERE (p_client_id IS NULL OR sa.client_id = p_client_id)
      AND (p_manager_id IS NULL OR sa.manager_id = p_manager_id)
      AND (p_industry_id IS NULL OR sa.industry_id = p_industry_id)
      AND (p_society_id IS NULL OR sa.society_id = p_society_id)
  ),
  budget_hours AS (
    SELECT s.engagement_id, SUM(bl.budgeted_hours) AS hours
    FROM scope s
    JOIN public.wo_budget_lines bl ON bl.wo_id = s.wo_id AND s.approval_status = 'Approved'
    GROUP BY s.engagement_id
  ),
  hours AS (
    SELECT
      s.engagement_id,
      CASE WHEN tla.status = 'approved' THEN 'approved'
           WHEN tla.status = 'rejected' THEN 'rejected'
           ELSE 'pending' END AS bucket,
      te.hours_logged,
      te.date_worked
    FROM scope s
    JOIN public.time_entries te ON te.engagement_id = s.engagement_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
  ),
  hours_totals AS (
    SELECT
      engagement_id,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'approved') AS period_approved,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'pending') AS period_pending,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'rejected') AS period_rejected,
      -- review.md iteracion 1, MF-03: excluye 'rejected' -- decisiones.md §4.3 dice que las
      -- rechazadas solo van al tooltip, nunca cuentan como "cargado" (ni para sobregiro ni
      -- para el % de avance que se muestra en la tabla).
      SUM(hours_logged) FILTER (WHERE bucket IN ('approved', 'pending')) AS lifetime_consumed
    FROM hours
    GROUP BY engagement_id
  ),
  engagement_rows AS (
    SELECT
      s.engagement_id, s.engagement_name, s.state, s.start_date, s.end_date,
      cl.client_legal_name,
      mgr.short_name AS manager_short_name,
      COALESCE(bh.hours, 0) AS budget_hours,
      COALESCE(ht.period_approved, 0) AS approved_hours,
      COALESCE(ht.period_pending, 0) AS pending_hours,
      COALESCE(ht.period_rejected, 0) AS rejected_hours,
      (COALESCE(ht.lifetime_consumed, 0) > COALESCE(bh.hours, 0)) AS over_budget,
      CASE WHEN COALESCE(bh.hours, 0) > 0
           THEN COALESCE(ht.lifetime_consumed, 0) / bh.hours
           ELSE 0 END AS consumption_ratio,
      CASE WHEN COALESCE(bh.hours, 0) > 0
           THEN COALESCE(ht.period_pending, 0) / bh.hours
           ELSE 0 END AS pending_ratio
    FROM scope s
    JOIN public.clients cl ON cl.client_id = s.client_id
    LEFT JOIN public.staff mgr ON mgr.staff_id = s.manager_id
    LEFT JOIN budget_hours bh ON bh.engagement_id = s.engagement_id
    LEFT JOIN hours_totals ht ON ht.engagement_id = s.engagement_id
  ),
  -- p_over_budget_only filtra ANTES de contar/paginar, para que 'total' refleje el filtro
  -- activo (el botón "Ver todos" decide si mostrarse comparando total vs. items.length).
  filtered_rows AS (
    SELECT * FROM engagement_rows
    WHERE (NOT p_over_budget_only OR over_budget)
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM filtered_rows),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'engagement_id', engagement_id, 'engagement_name', engagement_name,
        'client_legal_name', client_legal_name, 'manager_short_name', manager_short_name,
        'state', state, 'budget_hours', budget_hours, 'approved_hours', approved_hours,
        'pending_hours', pending_hours, 'rejected_hours', rejected_hours, 'over_budget', over_budget,
        'start_date', start_date, 'end_date', end_date
      ) ORDER BY
          CASE WHEN v_sort_key = 'start_date' THEN start_date END ASC,
          CASE WHEN v_sort_key = 'end_date' THEN end_date END ASC,
          CASE WHEN v_sort_key = 'progress' THEN consumption_ratio END DESC,
          CASE WHEN v_sort_key = 'pending_pct' THEN pending_ratio END DESC,
          engagement_id)
      FROM (
        SELECT * FROM filtered_rows
        ORDER BY
          CASE WHEN v_sort_key = 'start_date' THEN start_date END ASC,
          CASE WHEN v_sort_key = 'end_date' THEN end_date END ASC,
          CASE WHEN v_sort_key = 'progress' THEN consumption_ratio END DESC,
          CASE WHEN v_sort_key = 'pending_pct' THEN pending_ratio END DESC,
          engagement_id
        LIMIT v_limit OFFSET v_offset
      ) paged
    ), '[]'::jsonb)
  )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.partner_overview_engagements(date, date, integer, uuid, uuid, uuid, uuid, text, boolean, integer, integer) IS 'dash_socio (plan_v2.md §7.2, reescrito 2026-09-17): fuente única del Bloque F -- misma llamada sirve la vista compacta (p_limit=10) y "Ver todos" (p_limit mayor); p_sort_key (start_date|end_date|progress|pending_pct) y p_over_budget_only controlan orden/filtro del lado del servidor para que el top-N sea real sobre toda la cartera, no solo sobre un preview recortado. Mismo alcance que partner_overview(): estado 4/5 + funcion=1/Cliente, periodo por solapamiento start_date/end_date o anio_fiscal.';

REVOKE ALL ON FUNCTION public.partner_overview_engagements(date, date, integer, uuid, uuid, uuid, uuid, text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_overview_engagements(date, date, integer, uuid, uuid, uuid, uuid, text, boolean, integer, integer) TO authenticated, service_role;

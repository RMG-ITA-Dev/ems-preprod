-- ============================================================================
-- staff_alert_seen: tracks when each staff member first viewed each alert.
-- vw_staffing_alerts: updated to expose seen_at and filter alerts seen > 7 days ago.
-- ============================================================================

-- 1. Table: staff_alert_seen
CREATE TABLE IF NOT EXISTS public.staff_alert_seen (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id   uuid        NOT NULL REFERENCES public.staff(staff_id) ON DELETE CASCADE,
  entity_id  text        NOT NULL,
  alert_type text        NOT NULL,
  seen_at    timestamptz DEFAULT now() NOT NULL,
  UNIQUE (staff_id, entity_id, alert_type)
);

ALTER TABLE public.staff_alert_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_alert_seen_select" ON public.staff_alert_seen
  FOR SELECT USING (
    staff_id IN (
      SELECT staff_id FROM public.staff WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "staff_alert_seen_insert" ON public.staff_alert_seen
  FOR INSERT WITH CHECK (
    staff_id IN (
      SELECT staff_id FROM public.staff WHERE auth_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.staff_alert_seen TO authenticated;

-- 2. Replace vw_staffing_alerts to add seen_at column and 7-day post-seen expiry
DROP VIEW IF EXISTS public.vw_staffing_alerts;

CREATE VIEW public.vw_staffing_alerts WITH (security_invoker = on) AS

-- Alert Type 1: Pending timesheet line approvals (shown to the approver)
SELECT
  'timesheet_pending_approval'::text                                       AS alert_type,
  c.category_name,
  s_sub.first_name || ' ' || s_sub.last_name
    || ' — ' || e.engagement_name                                          AS description,
  tla.created_at                                                           AS detected_at,
  e.engagement_id,
  e.engagement_name,
  e.engagement_code,
  tla.approval_id::text                                                    AS entity_id,
  CASE
    WHEN tla.created_at < now() - INTERVAL '3 days' THEN 'high'
    ELSE 'medium'
  END                                                                      AS priority_level,
  tla.approved_by                                                          AS staff_id,
  s_apr.first_name || ' ' || s_apr.last_name                              AS staff_name,
  1::numeric                                                               AS required_count,
  tp.week_start_date                                                       AS start_date,
  (tp.week_start_date + 6)::date                                          AS end_date,
  sas.seen_at                                                              AS seen_at

FROM public.timesheet_line_approvals tla
JOIN  public.timesheet_periods tp   ON tp.period_id    = tla.period_id
JOIN  public.engagements e          ON e.engagement_id = tla.engagement_id
JOIN  public.staff s_sub            ON s_sub.staff_id  = tp.staff_id
JOIN  public.categories c           ON c.category_id   = s_sub.category_id
JOIN  public.staff s_apr            ON s_apr.staff_id  = tla.approved_by
LEFT JOIN public.staff_alert_seen sas
  ON  sas.staff_id   = tla.approved_by
  AND sas.entity_id  = tla.approval_id::text
  AND sas.alert_type = 'timesheet_pending_approval'
WHERE tla.status = 'pending'
  AND tla.approved_by IS NOT NULL
  AND (sas.seen_at IS NULL OR sas.seen_at > now() - INTERVAL '7 days')

UNION ALL

-- Alert Type 2: Work orders pending approval (shown to the engagement's partner)
SELECT
  'work_order_pending_approval'::text                                      AS alert_type,
  NULL::varchar                                                            AS category_name,
  'WO pendiente de aprobación — ' || e.engagement_name                   AS description,
  wo.created_at                                                            AS detected_at,
  e.engagement_id,
  e.engagement_name,
  e.engagement_code,
  wo.wo_id::text                                                           AS entity_id,
  'medium'::text                                                           AS priority_level,
  e.partner_id                                                             AS staff_id,
  s_partner.first_name || ' ' || s_partner.last_name                     AS staff_name,
  1::numeric                                                               AS required_count,
  e.start_date,
  e.end_date,
  sas.seen_at                                                              AS seen_at

FROM public.work_orders wo
JOIN  public.engagements e         ON e.engagement_id  = wo.engagement_id
JOIN  public.staff s_partner       ON s_partner.staff_id = e.partner_id
LEFT JOIN public.staff_alert_seen sas
  ON  sas.staff_id   = e.partner_id
  AND sas.entity_id  = wo.wo_id::text
  AND sas.alert_type = 'work_order_pending_approval'
WHERE wo.approval_status = 'Pending_Approval'
  AND e.partner_id IS NOT NULL
  AND (sas.seen_at IS NULL OR sas.seen_at > now() - INTERVAL '7 days')

UNION ALL

-- Alert Type 3: Engagement created → partner (7-day creation window)
SELECT
  'engagement_created'::text                                               AS alert_type,
  NULL::varchar                                                            AS category_name,
  cl.client_legal_name                                                     AS description,
  e.created_at                                                             AS detected_at,
  e.engagement_id,
  e.engagement_name,
  e.engagement_code,
  e.engagement_id::text                                                    AS entity_id,
  'medium'::text                                                           AS priority_level,
  e.partner_id                                                             AS staff_id,
  s.first_name || ' ' || s.last_name                                      AS staff_name,
  1::numeric                                                               AS required_count,
  e.start_date,
  e.end_date,
  sas.seen_at                                                              AS seen_at

FROM public.engagements e
JOIN  public.clients cl  ON cl.client_id  = e.client_id
JOIN  public.staff s     ON s.staff_id    = e.partner_id
LEFT JOIN public.staff_alert_seen sas
  ON  sas.staff_id   = e.partner_id
  AND sas.entity_id  = e.engagement_id::text
  AND sas.alert_type = 'engagement_created'
WHERE e.partner_id IS NOT NULL
  AND e.created_at >= now() - INTERVAL '7 days'
  AND (sas.seen_at IS NULL OR sas.seen_at > now() - INTERVAL '7 days')

UNION ALL

-- Alert Type 4: Engagement created → manager (7-day creation window, if different from partner)
SELECT
  'engagement_created'::text                                               AS alert_type,
  NULL::varchar                                                            AS category_name,
  cl.client_legal_name                                                     AS description,
  e.created_at                                                             AS detected_at,
  e.engagement_id,
  e.engagement_name,
  e.engagement_code,
  e.engagement_id::text                                                    AS entity_id,
  'medium'::text                                                           AS priority_level,
  e.manager_id                                                             AS staff_id,
  s.first_name || ' ' || s.last_name                                      AS staff_name,
  1::numeric                                                               AS required_count,
  e.start_date,
  e.end_date,
  sas.seen_at                                                              AS seen_at

FROM public.engagements e
JOIN  public.clients cl  ON cl.client_id  = e.client_id
JOIN  public.staff s     ON s.staff_id    = e.manager_id
LEFT JOIN public.staff_alert_seen sas
  ON  sas.staff_id   = e.manager_id
  AND sas.entity_id  = e.engagement_id::text
  AND sas.alert_type = 'engagement_created'
WHERE e.manager_id IS NOT NULL
  AND e.manager_id IS DISTINCT FROM e.partner_id
  AND e.created_at >= now() - INTERVAL '7 days'
  AND (sas.seen_at IS NULL OR sas.seen_at > now() - INTERVAL '7 days')

UNION ALL

-- Alert Type 5: New staff registered → all active admins (30-day creation window)
SELECT
  'new_user_registered'::text                                              AS alert_type,
  c.category_name,
  s_new.first_name || ' ' || s_new.last_name                             AS description,
  s_new.created_at                                                         AS detected_at,
  NULL::uuid                                                               AS engagement_id,
  NULL::varchar                                                            AS engagement_name,
  NULL::varchar                                                            AS engagement_code,
  s_new.staff_id::text                                                     AS entity_id,
  'medium'::text                                                           AS priority_level,
  s_admin.staff_id                                                         AS staff_id,
  s_admin.first_name || ' ' || s_admin.last_name                         AS staff_name,
  1::numeric                                                               AS required_count,
  NULL::date                                                               AS start_date,
  NULL::date                                                               AS end_date,
  sas.seen_at                                                              AS seen_at

FROM public.staff s_new
JOIN public.categories c ON c.category_id = s_new.category_id
CROSS JOIN (
  SELECT s.staff_id, s.first_name, s.last_name
  FROM public.staff s
  JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
  WHERE ur.role = 'admin'
    AND s.is_active = true
    AND s.auth_user_id IS NOT NULL
) s_admin
LEFT JOIN public.staff_alert_seen sas
  ON  sas.staff_id   = s_admin.staff_id
  AND sas.entity_id  = s_new.staff_id::text
  AND sas.alert_type = 'new_user_registered'
WHERE s_new.is_active = true
  AND s_new.created_at >= now() - INTERVAL '30 days'
  AND s_new.staff_id != s_admin.staff_id
  AND (sas.seen_at IS NULL OR sas.seen_at > now() - INTERVAL '7 days');

GRANT SELECT ON public.vw_staffing_alerts TO authenticated;

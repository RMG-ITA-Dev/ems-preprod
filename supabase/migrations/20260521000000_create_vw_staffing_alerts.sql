-- ============================================================================
-- vw_staffing_alerts
-- Powers the notifications bell (NotificationsPanel) in AppHeader.
-- Returns one row per alert, scoped to the staff_id who should see it.
-- No new tables — view is fully derived from existing data.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_staffing_alerts AS

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
  (tp.week_start_date + 6)::date                                          AS end_date

FROM public.timesheet_line_approvals tla
JOIN public.timesheet_periods tp   ON tp.period_id    = tla.period_id
JOIN public.engagements e          ON e.engagement_id = tla.engagement_id
JOIN public.staff s_sub            ON s_sub.staff_id  = tp.staff_id
JOIN public.categories c           ON c.category_id   = s_sub.category_id
JOIN public.staff s_apr            ON s_apr.staff_id  = tla.approved_by
WHERE tla.status = 'pending'
  AND tla.approved_by IS NOT NULL

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
  e.end_date

FROM public.work_orders wo
JOIN public.engagements e         ON e.engagement_id  = wo.engagement_id
JOIN public.staff s_partner       ON s_partner.staff_id = e.partner_id
WHERE wo.approval_status NOT IN ('Approved', 'Rejected')
  AND e.partner_id IS NOT NULL;

GRANT SELECT ON public.vw_staffing_alerts TO authenticated;

-- PostgreSQL / EMS local: línea base antes de F3
SELECT
  COUNT(*) AS time_entries_total,
  COALESCE(SUM(hours_logged), 0) AS horas_total,
  COUNT(*) FILTER (WHERE period_id IS NULL AND is_forecast = false) AS filas_historicas_f3,
  COALESCE(SUM(hours_logged) FILTER (
    WHERE period_id IS NULL AND is_forecast = false
  ), 0) AS horas_historicas_f3
FROM public.time_entries;

SELECT
  (SELECT COUNT(*) FROM public.timesheet_periods) AS periods,
  (SELECT COUNT(*) FROM public.timesheet_line_approvals) AS line_approvals;





  UPDATE public.activity_worksheets
SET
  status = 'approved',
  updated_at = now()
WHERE status = 'draft'
  AND wo_id IS NOT NULL
RETURNING id, wo_id, status, updated_at;



-- 1. Por usuario. Local: 123 personas, total 24.968,00
SELECT lower(au.email) AS email, SUM(te.hours_logged) AS horas
FROM public.time_entries te
JOIN public.staff s ON s.staff_id = te.staff_id
JOIN auth.users au ON au.id = s.auth_user_id
WHERE te.is_forecast = false AND te.period_id IS NULL
GROUP BY 1 ORDER BY horas DESC, email;

-- 2. Por encargo de un usuario (comparar con el mapa COT→código)
SELECT e.engagement_code, SUM(te.hours_logged) AS horas
FROM auth.users au
JOIN public.staff s ON s.auth_user_id = au.id
JOIN public.time_entries te ON te.staff_id = s.staff_id AND te.is_forecast = false AND te.period_id IS NULL
JOIN public.engagements e ON e.engagement_id = te.engagement_id
WHERE lower(au.email) = lower('xxx@ruizmier.com')
GROUP BY e.engagement_code ORDER BY horas DESC, e.engagement_code;

-- 3. Por práctica. Local: AUD 14.631 · COM 4.648 · TAX 5.689
SELECT p.abbreviation AS practica, SUM(te.hours_logged) AS horas
FROM public.time_entries te
JOIN public.engagements e ON e.engagement_id = te.engagement_id
JOIN public.practicas p ON p.code = e.practica
WHERE te.is_forecast = false AND te.period_id IS NULL
GROUP BY p.abbreviation ORDER BY p.abbreviation;


WITH presup_matriz AS (
  SELECT w.engagement_id, SUM(c.budget_hours) AS horas
  FROM public.activity_worksheets w
  JOIN public.activity_worksheet_cells c ON c.worksheet_id = w.id
  GROUP BY w.engagement_id
), presup_ot AS (
  SELECT wo.engagement_id, SUM(l.budgeted_hours) AS horas
  FROM public.work_orders wo
  JOIN public.wo_budget_lines l ON l.wo_id = wo.wo_id
  GROUP BY wo.engagement_id
), ejecutadas AS (
  SELECT te.engagement_id, SUM(te.hours_logged) AS horas
  FROM public.time_entries te
  WHERE te.is_forecast = false AND te.period_id IS NULL
  GROUP BY te.engagement_id
)
SELECT e.engagement_code,
       COALESCE(pm.horas, 0) AS presupuestadas_matriz,
       COALESCE(po.horas, 0) AS presupuestadas_ot,
       COALESCE(x.horas, 0)  AS ejecutadas
FROM public.engagements e
LEFT JOIN presup_matriz pm ON pm.engagement_id = e.engagement_id
LEFT JOIN presup_ot po     ON po.engagement_id = e.engagement_id
LEFT JOIN ejecutadas x     ON x.engagement_id  = e.engagement_id
WHERE e.is_internal = false          -- los 124 encargos cliente; los 10 administrativos no tienen horas
ORDER BY e.engagement_code;
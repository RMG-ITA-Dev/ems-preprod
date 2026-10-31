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
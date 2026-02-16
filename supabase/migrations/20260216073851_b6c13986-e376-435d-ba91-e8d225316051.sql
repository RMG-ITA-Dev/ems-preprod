-- Backfill created_by_staff_id from engagement manager
UPDATE public.expense_logs el
SET created_by_staff_id = e.manager_id
FROM public.engagements e
WHERE el.engagement_id = e.engagement_id
  AND el.created_by_staff_id IS NULL
  AND e.manager_id IS NOT NULL;

-- Step 1: Add weekly_capacity_hours to staff table
ALTER TABLE public.staff
ADD COLUMN weekly_capacity_hours NUMERIC NOT NULL DEFAULT 40;

-- Step 2: Migrate any existing data from staff_capacity (safety measure)
UPDATE public.staff s
SET weekly_capacity_hours = sc.weekly_capacity_hours
FROM (
  SELECT DISTINCT ON (staff_id) staff_id, weekly_capacity_hours
  FROM public.staff_capacity
  ORDER BY staff_id, effective_from DESC
) sc
WHERE s.staff_id = sc.staff_id;

-- Step 3: Drop staff_capacity table (cascades policies, indexes, triggers)
DROP TABLE IF EXISTS public.staff_capacity CASCADE;

-- Drop the existing view first to avoid column order issues
DROP VIEW IF EXISTS public.staff_directory;

-- Recreate staff_directory view with correct column order, excluding soft-deleted staff
CREATE VIEW public.staff_directory AS
SELECT 
  staff_id,
  first_name,
  last_name,
  short_name,
  initials,
  category_id,
  city,
  is_active,
  created_at,
  updated_at
FROM public.staff
WHERE deleted_at IS NULL;
-- Fix staff_directory view to use security_invoker
DROP VIEW IF EXISTS public.staff_directory;

CREATE VIEW public.staff_directory 
WITH (security_invoker = true)
AS
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
FROM public.staff;

-- Re-grant permissions after recreating
GRANT SELECT ON public.staff_directory TO authenticated;
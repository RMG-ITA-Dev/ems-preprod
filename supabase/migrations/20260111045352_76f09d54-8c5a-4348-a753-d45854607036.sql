-- Fix 1: Recreate staff_directory view WITHOUT security_invoker
-- This allows authenticated users to query non-sensitive staff data for dropdowns
DROP VIEW IF EXISTS public.staff_directory;

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
FROM public.staff;

-- Grant SELECT to authenticated users (view doesn't expose PII columns)
GRANT SELECT ON public.staff_directory TO authenticated;

-- Fix 2: Create clients_directory view for non-sensitive client data
CREATE VIEW public.clients_directory AS
SELECT 
  client_id,
  client_legal_name,
  industry_id,
  contact_name,
  contact_email,
  contact_phone,
  address,
  is_active,
  created_at,
  updated_at
FROM public.clients;

-- Grant SELECT to authenticated users (excludes unique_tax_id)
GRANT SELECT ON public.clients_directory TO authenticated;

-- Fix 3: Update clients table RLS policies
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can read clients" ON public.clients;

-- Add restrictive policy: Admins can view all clients
CREATE POLICY "Admins can view all clients" 
  ON public.clients FOR SELECT 
  USING (is_admin());

-- Add restrictive policy: Team members can view their engagement's clients
CREATE POLICY "Team can view engagement clients" 
  ON public.clients FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM engagements e 
      WHERE e.client_id = clients.client_id 
      AND is_engagement_team_member(e.engagement_id)
    )
  );
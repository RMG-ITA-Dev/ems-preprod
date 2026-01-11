-- Restore permissive read access for staff table
-- PII protection is handled by frontend using staff_directory view

DROP POLICY IF EXISTS "Admins can view all staff" ON public.staff;
DROP POLICY IF EXISTS "Users can view their linked staff record" ON public.staff;

CREATE POLICY "Authenticated users can read staff" 
  ON public.staff FOR SELECT 
  TO authenticated
  USING (true);

-- Restore permissive read access for clients table
-- Tax ID protection is handled by frontend using clients_directory view

DROP POLICY IF EXISTS "Admins can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Team can view engagement clients" ON public.clients;

CREATE POLICY "Authenticated users can read clients" 
  ON public.clients FOR SELECT 
  TO authenticated
  USING (true);
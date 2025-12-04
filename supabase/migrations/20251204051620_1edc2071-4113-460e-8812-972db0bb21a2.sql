-- Function to link new auth user to existing staff member by email
CREATE OR REPLACE FUNCTION public.link_auth_user_to_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update staff record if email matches
  UPDATE public.staff
  SET auth_user_id = NEW.id,
      updated_at = now()
  WHERE email = NEW.email
    AND auth_user_id IS NULL;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-link staff on user creation
CREATE TRIGGER on_auth_user_created_link_staff
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_auth_user_to_staff();

-- Add RLS policy for staff to view their own record
CREATE POLICY "Users can view their linked staff record"
ON public.staff
FOR SELECT
USING (auth_user_id = auth.uid());

-- Add policy for users to update their own staff record
CREATE POLICY "Users can update their linked staff record"
ON public.staff
FOR UPDATE
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());
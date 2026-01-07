-- Update validate_email_domain trigger to read from global_settings dynamically
CREATE OR REPLACE FUNCTION public.validate_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  allowed_domain TEXT;
  user_domain TEXT;
BEGIN
  -- Get allowed domain from global_settings
  SELECT setting_value INTO allowed_domain
  FROM public.global_settings
  WHERE setting_key = 'ALLOWED_EMAIL_DOMAIN';
  
  -- If no setting found or empty, allow all domains
  IF allowed_domain IS NULL OR allowed_domain = '' THEN
    RETURN NEW;
  END IF;
  
  -- Extract domain from email
  user_domain := split_part(NEW.email, '@', 2);
  
  -- Check if domain matches (case-insensitive)
  IF lower(user_domain) != lower(allowed_domain) THEN
    RAISE EXCEPTION 'Registration restricted to @% emails only', allowed_domain;
  END IF;
  
  RETURN NEW;
END;
$$;
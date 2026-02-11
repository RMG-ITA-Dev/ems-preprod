
CREATE OR REPLACE FUNCTION public.link_staff_to_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Only attempt if staff record has email and no auth_user_id
  IF NEW.email IS NOT NULL AND NEW.auth_user_id IS NULL THEN
    -- Look for an auth user with matching email
    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE email = NEW.email
    LIMIT 1;

    IF v_auth_user_id IS NOT NULL THEN
      -- Check no other staff record is already linked to this auth user
      IF NOT EXISTS (
        SELECT 1 FROM public.staff
        WHERE auth_user_id = v_auth_user_id
          AND staff_id != NEW.staff_id
      ) THEN
        NEW.auth_user_id := v_auth_user_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_staff_to_auth_user
  BEFORE INSERT OR UPDATE OF email ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.link_staff_to_auth_user();

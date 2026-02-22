-- Plan_0220-45_v3: Fix deletion of exported time entries
-- FK constraint name verified: timer_entries_imported_to_time_id_fkey

-- Step 1: Drop the existing FK
ALTER TABLE public.timer_entries
  DROP CONSTRAINT timer_entries_imported_to_time_id_fkey;

-- Step 2: Re-create with ON DELETE SET NULL
ALTER TABLE public.timer_entries
  ADD CONSTRAINT timer_entries_imported_to_time_id_fkey
  FOREIGN KEY (imported_to_time_id)
  REFERENCES public.time_entries(time_id)
  ON DELETE SET NULL;

-- Step 3: Trigger to reset is_imported when imported_to_time_id becomes NULL
CREATE OR REPLACE FUNCTION public.reset_timer_import_on_unlink()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.imported_to_time_id IS NULL AND OLD.imported_to_time_id IS NOT NULL THEN
    NEW.is_imported := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reset_timer_import_on_unlink
  BEFORE UPDATE ON public.timer_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_timer_import_on_unlink();
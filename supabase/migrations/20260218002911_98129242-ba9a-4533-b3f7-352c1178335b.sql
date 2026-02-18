
CREATE OR REPLACE FUNCTION public.prevent_imported_timer_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.is_imported = true THEN
    RAISE EXCEPTION 'Cannot delete imported timer entry (timer_id: %)', OLD.timer_id;
  END IF;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER trg_prevent_imported_timer_delete
  BEFORE DELETE ON public.timer_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_imported_timer_delete();

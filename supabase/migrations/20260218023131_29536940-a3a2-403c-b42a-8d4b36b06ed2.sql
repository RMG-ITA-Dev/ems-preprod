CREATE OR REPLACE FUNCTION public.protect_approved_time_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_period uuid;
  old_engagement uuid;
  new_period uuid;
  new_engagement uuid;
BEGIN
  -- ── DELETE ────────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    old_period := OLD.period_id;
    old_engagement := OLD.engagement_id;

    IF old_period IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.timesheet_line_approvals tla
      WHERE tla.period_id = old_period
        AND tla.engagement_id = old_engagement
        AND tla.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot delete time entries on an approved line';
    END IF;

    RETURN OLD;
  END IF;

  -- ── INSERT ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    new_period := NEW.period_id;
    new_engagement := NEW.engagement_id;

    IF new_period IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.timesheet_line_approvals tla
      WHERE tla.period_id = new_period
        AND tla.engagement_id = new_engagement
        AND tla.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot insert time entries into an approved line';
    END IF;

    RETURN NEW;
  END IF;

  -- ── UPDATE ────────────────────────────────────────────────────────
  old_period := OLD.period_id;
  old_engagement := OLD.engagement_id;
  new_period := COALESCE(NEW.period_id, OLD.period_id);
  new_engagement := COALESCE(NEW.engagement_id, OLD.engagement_id);

  -- Block if OLD pair is approved (editing an approved line)
  IF old_period IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.timesheet_line_approvals tla
    WHERE tla.period_id = old_period
      AND tla.engagement_id = old_engagement
      AND tla.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot modify time entries on an approved line';
  END IF;

  -- Block if NEW pair is approved (moving into an approved line)
  IF new_period IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.timesheet_line_approvals tla
    WHERE tla.period_id = new_period
      AND tla.engagement_id = new_engagement
      AND tla.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot move time entries into an approved line';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_approved_time_entries ON public.time_entries;

CREATE TRIGGER trg_protect_approved_time_entries
  BEFORE INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_approved_time_entries();
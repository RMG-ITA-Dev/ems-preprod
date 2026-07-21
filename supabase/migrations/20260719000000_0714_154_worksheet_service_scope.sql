-- BUG 0714-154: the Work Matrix (activity_worksheet_cells) showed categories/activities from
-- every service instead of only the one tied to the engagement (engagements.practica, matched
-- against services.code — see src/lib/activityFilters.ts, already used by Tracker/Timesheet).
-- The frontend fix (src/pages/WorksheetEdit.tsx) now scopes the grid and purges out-of-service
-- cells on save/copy, but existing test data already has mismatched cells and nothing at the
-- database level prevented new ones from being written directly.
--
-- 1. Delete existing worksheet cells whose category/activity service does not match the
--    engagement's service, for engagements that have a service assigned (practica IS NOT NULL).
--    Engagements without a service (practica IS NULL) are left untouched.
--    Activity codes with service_id IS NULL are global (legacy codes, e.g. 100-PLA, ADM) and are
--    valid for every service — never deleted on that basis.
-- 2. Resync wo_budget_lines for Draft work orders linked to a worksheet touched by the cleanup
--    above — sync_worksheet_to_wo_budget() only runs once at WO creation and otherwise only via
--    the manual "Resync" button (disabled once the WO is Approved/Pending_Approval/Rejected), so
--    without this the WO would keep stale, inflated hours after cells are deleted. Locked work
--    orders are intentionally left untouched (open question — see review.md iteración 4).
-- 3. Add a BEFORE INSERT OR UPDATE trigger on activity_worksheet_cells that rejects any new cell
--    whose category or (service-linked) activity does not match the parent worksheet's
--    engagement service. This is a backstop: the only writer is the frontend batch-upsert hook,
--    which after this fix only ever sends in-scope cells.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. DATA CLEANUP
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM public.activity_worksheet_cells awc
USING public.activity_worksheets aw,
      public.engagements e,
      public.services svc,
      public.categories c,
      public.activity_codes a
WHERE aw.id = awc.worksheet_id
  AND e.engagement_id = aw.engagement_id
  AND svc.code = e.practica
  AND c.category_id = awc.category_id
  AND a.activity_id = awc.activity_id
  AND e.practica IS NOT NULL
  AND (
    c.service_id <> svc.service_id
    OR (a.service_id IS NOT NULL AND a.service_id <> svc.service_id)
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 1b. RESYNC DRAFT WORK ORDER BUDGETS
--     Restores wo_budget_lines consistency for worksheets whose cells were just deleted above.
--     Only Draft work orders are touched — Approved/Pending_Approval/Rejected are left as-is
--     (mutating already-issued figures is a business decision out of scope for this bug fix).
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT aw.id AS worksheet_id, aw.wo_id
      FROM public.activity_worksheets aw
      JOIN public.work_orders wo ON wo.wo_id = aw.wo_id
     WHERE aw.wo_id IS NOT NULL
       AND wo.approval_status = 'Draft'
  LOOP
    PERFORM public.sync_worksheet_to_wo_budget(r.worksheet_id, r.wo_id);
  END LOOP;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. GUARD TRIGGER: reject new/updated cells outside the engagement's service
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_worksheet_cell_service_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_practica    smallint;
  v_service_id  uuid;
  v_cat_service uuid;
  v_act_service uuid;
BEGIN
  SELECT e.practica INTO v_practica
    FROM public.activity_worksheets aw
    JOIN public.engagements e ON e.engagement_id = aw.engagement_id
   WHERE aw.id = NEW.worksheet_id;

  -- Legacy engagements with no assigned service are not scoped by this rule;
  -- the UI already limits them to no categories (categories.service_id is NOT NULL).
  IF v_practica IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT service_id INTO v_service_id
    FROM public.services
   WHERE code = v_practica;

  SELECT service_id INTO v_cat_service
    FROM public.categories
   WHERE category_id = NEW.category_id;

  IF v_cat_service IS DISTINCT FROM v_service_id THEN
    RAISE EXCEPTION 'Category % does not belong to the engagement''s service', NEW.category_id;
  END IF;

  SELECT service_id INTO v_act_service
    FROM public.activity_codes
   WHERE activity_id = NEW.activity_id;

  -- NULL activity service_id = global activity (e.g. 100-PLA, ADM), valid for every service.
  IF v_act_service IS NOT NULL AND v_act_service <> v_service_id THEN
    RAISE EXCEPTION 'Activity % does not belong to the engagement''s service', NEW.activity_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_worksheet_cell_service_scope ON public.activity_worksheet_cells;
CREATE TRIGGER trg_enforce_worksheet_cell_service_scope
  BEFORE INSERT OR UPDATE ON public.activity_worksheet_cells
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_worksheet_cell_service_scope();

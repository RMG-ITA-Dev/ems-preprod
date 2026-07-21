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
-- 2. Resync wo_budget_lines for Draft work orders whose worksheet actually lost cells in the
--    cleanup above (captured via a RETURNING-based CTE, not every Draft-linked worksheet) —
--    sync_worksheet_to_wo_budget() only runs once at WO creation and otherwise only via the
--    manual "Resync" button (disabled once the WO is Approved/Pending_Approval/Rejected), so
--    without this the WO would keep stale, inflated hours after cells are deleted. Locked work
--    orders are intentionally left untouched (open question — see review.md iteración 4).
--    Scoping to only-cleaned worksheets avoids recomputing unrelated Draft WOs' budgets from
--    today's category rates for no reason (review.md iteración 8).
-- 3. Add a BEFORE INSERT OR UPDATE trigger on activity_worksheet_cells that rejects any new cell
--    whose category or (service-linked) activity does not match the parent worksheet's
--    engagement service. This is a backstop: the only writer is the frontend batch-upsert hook,
--    which after this fix only ever sends in-scope cells.
-- 4. Add batch_upsert_worksheet_cells(): the frontend used to delete-all-then-reinsert a
--    worksheet's cells as two separate PostgREST requests (two transactions). If the trigger
--    above rejected the insert, the prior delete stayed committed, wiping the worksheet's
--    entire matrix over a single invalid cell. Wrapping both steps in one SECURITY DEFINER
--    function makes them one transaction, so a rejected insert rolls back its own delete too
--    (review.md iteración 10). src/hooks/useWorksheetMutations.ts (useBatchUpsertCells) now
--    calls this RPC instead of issuing the delete/insert directly.

-- ────────────────────────────────────────────────────────────────────────────
-- 1 + 1b. DATA CLEANUP, then RESYNC DRAFT WORK ORDER BUDGETS for cleaned worksheets only
--     A single DO block: the DELETE's RETURNING captures exactly which worksheets lost a cell,
--     and only those (with a Draft-status linked WO) get resynced. Approved/Pending_Approval/
--     Rejected WOs are left as-is (mutating already-issued figures is a business decision out
--     of scope for this bug fix).
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cleaned_worksheet_ids uuid[];
  r                       RECORD;
BEGIN
  WITH deleted AS (
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
      )
    RETURNING awc.worksheet_id
  )
  SELECT array_agg(DISTINCT worksheet_id) INTO v_cleaned_worksheet_ids FROM deleted;

  IF v_cleaned_worksheet_ids IS NOT NULL THEN
    FOR r IN
      SELECT aw.id AS worksheet_id, aw.wo_id
        FROM public.activity_worksheets aw
        JOIN public.work_orders wo ON wo.wo_id = aw.wo_id
       WHERE aw.wo_id IS NOT NULL
         AND wo.approval_status = 'Draft'
         AND aw.id = ANY(v_cleaned_worksheet_ids)
    LOOP
      PERFORM public.sync_worksheet_to_wo_budget(r.worksheet_id, r.wo_id);
    END LOOP;
  END IF;
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

-- ────────────────────────────────────────────────────────────────────────────
-- 4. ATOMIC BATCH UPSERT: delete + reinsert a worksheet's cells in one transaction
--    Authorization mirrors the RLS policies this SECURITY DEFINER function bypasses
--    ("Team can manage worksheet cells" / "Admins can manage worksheet cells",
--    migration 20260107032620): caller must be an engagement team member or admin.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.batch_upsert_worksheet_cells(
  p_worksheet_id uuid,
  p_cells        jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_engagement_id uuid;
BEGIN
  SELECT engagement_id INTO v_engagement_id
    FROM public.activity_worksheets
   WHERE id = p_worksheet_id;

  IF v_engagement_id IS NULL THEN
    RAISE EXCEPTION 'Worksheet not found: %', p_worksheet_id;
  END IF;

  IF NOT (public.is_admin() OR public.is_engagement_team_member(v_engagement_id)) THEN
    RAISE EXCEPTION 'Permission denied: not a team member of this engagement'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.activity_worksheet_cells WHERE worksheet_id = p_worksheet_id;

  INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
  SELECT
    p_worksheet_id,
    (elem->>'category_id')::uuid,
    (elem->>'activity_id')::uuid,
    (elem->>'budget_hours')::numeric
  FROM jsonb_array_elements(p_cells) AS elem
  WHERE (elem->>'budget_hours')::numeric > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_upsert_worksheet_cells(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_upsert_worksheet_cells(uuid, jsonb) TO authenticated;

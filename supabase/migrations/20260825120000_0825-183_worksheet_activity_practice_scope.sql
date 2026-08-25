-- 0825-183: exclude out-of-practice activities (ADM, other-practice, global) from
-- worksheet matrices.
--
-- Bug: the Work Matrix (WorksheetEdit) reused activityFilters.ts'
-- filterActivitiesByService, which treats activities with practica_id IS NULL
-- (global/system activities, e.g. ADM, is_system=true) as always valid — correct
-- for Timesheet/Tracker, wrong for the budget matrix, where every cell must belong
-- to the engagement's own practice. enforce_worksheet_cell_practice_scope and
-- batch_upsert_worksheet_cells carried the same "global activity always valid"
-- exception, and historical activity_worksheet_cells rows may already carry these
-- out-of-scope activities/categories, or belong to a worksheet whose engagement has
-- no practica at all.
--
-- This migration:
--   1. Deletes activity_worksheet_cells rows whose category or activity does not
--      match the worksheet's engagement practice exactly (including global/system
--      activities, and cells on worksheets whose engagement has no practica, or
--      whose practica code doesn't resolve to any row in practicas).
--   2. Resyncs wo_budget_lines only for Draft work orders whose worksheet actually
--      lost cells in step 1 (sync_worksheet_to_wo_budget aggregates from the
--      now-clean cells). Pending_Approval/Approved/Rejected work orders are left
--      untouched — their stray cells are still removed, but nothing recomputes
--      their already-committed budget; a NOTICE lists them for manual review.
--   3. Hardens enforce_worksheet_cell_practice_scope (BEFORE INSERT/UPDATE trigger
--      on activity_worksheet_cells) and batch_upsert_worksheet_cells to reject the
--      same out-of-scope writes going forward, with stable error codes (review.md
--      iteración 1, #2/#3/#7 — practice precedence covers both "no practica" and
--      "practica code doesn't resolve"; activity check covers both foreign-practice
--      and is_system, independently; every RAISE carries a DETAIL with the
--      offending ids so MESSAGE stays the bare code):
--        WORKSHEET_PRACTICE_REQUIRED     - engagement has no practica, or its code
--                                           doesn't resolve to a practicas row,
--                                           and the payload is non-empty
--        WORKSHEET_CATEGORY_OUT_OF_SCOPE - category.practica_id != engagement practice
--        WORKSHEET_ACTIVITY_OUT_OF_SCOPE - activity.practica_id != engagement practice
--                                           OR activity.is_system, independently
--                                           (incl. NULL/global/system activities)

-- ── 1. Clean up historical out-of-scope cells ──────────────────────────────────
CREATE TEMP TABLE _0825_183_stray_cells AS
SELECT awc.id, aw.id AS worksheet_id, aw.wo_id
  FROM public.activity_worksheet_cells awc
  JOIN public.activity_worksheets aw ON aw.id = awc.worksheet_id
  JOIN public.engagements e ON e.engagement_id = aw.engagement_id
  LEFT JOIN public.practicas p ON p.code = e.practica
  LEFT JOIN public.categories c ON c.category_id = awc.category_id
  LEFT JOIN public.activity_codes a ON a.activity_id = awc.activity_id
 WHERE e.practica IS NULL
    OR p.practica_id IS NULL
    OR c.practica_id IS DISTINCT FROM p.practica_id
    OR a.practica_id IS DISTINCT FROM p.practica_id
    OR a.is_system IS NOT FALSE;

DELETE FROM public.activity_worksheet_cells
 WHERE id IN (SELECT id FROM _0825_183_stray_cells);

-- ── 2. Resync Draft work orders whose worksheet lost cells; log locked ones ─────
DO $$
DECLARE
  v_row          RECORD;
  v_draft_count  integer := 0;
  v_locked_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT DISTINCT s.worksheet_id, s.wo_id, wo.approval_status
      FROM _0825_183_stray_cells s
      JOIN public.work_orders wo ON wo.wo_id = s.wo_id
  LOOP
    IF v_row.approval_status = 'Draft' THEN
      PERFORM public.sync_worksheet_to_wo_budget(v_row.worksheet_id, v_row.wo_id);
      v_draft_count := v_draft_count + 1;
    ELSE
      v_locked_count := v_locked_count + 1;
      RAISE NOTICE '0825-183: work order % (status %) had stray worksheet cells removed; its budget was left untouched for manual review', v_row.wo_id, v_row.approval_status;
    END IF;
  END LOOP;

  RAISE NOTICE '0825-183: resynced % Draft work order(s); % locked work order(s) left for manual review', v_draft_count, v_locked_count;
END $$;

DROP TABLE _0825_183_stray_cells;

-- ── 3. Harden the trigger: no more "global activity valid everywhere" exception,
--       and a worksheet with no practica accepts no rows at all ───────────────
CREATE OR REPLACE FUNCTION public.enforce_worksheet_cell_practice_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica       smallint;
  v_practica_id    uuid;
  v_cat_practica   uuid;
  v_act_practica   uuid;
  v_act_is_system  boolean;
BEGIN
  SELECT e.practica INTO v_practica
    FROM public.activity_worksheets aw
    JOIN public.engagements e ON e.engagement_id = aw.engagement_id
   WHERE aw.id = NEW.worksheet_id;

  -- A worksheet whose engagement has no assigned practice accepts no cells at
  -- all (the frontend keeps the grid empty and purges any payload — 0825-183).
  IF v_practica IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'WORKSHEET_PRACTICE_REQUIRED',
      DETAIL = format('worksheet_id=%s reason=no_practica', NEW.worksheet_id);
  END IF;

  SELECT practica_id INTO v_practica_id
    FROM public.practicas
   WHERE code = v_practica;

  -- A practica code that doesn't resolve to any practicas row is just as
  -- unusable as no practica at all — same precedence, same code (review.md
  -- iteración 1, #3).
  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'WORKSHEET_PRACTICE_REQUIRED',
      DETAIL = format('worksheet_id=%s reason=unresolved_practica_code practica_code=%s', NEW.worksheet_id, v_practica);
  END IF;

  SELECT practica_id INTO v_cat_practica
    FROM public.categories
   WHERE category_id = NEW.category_id;

  IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
    RAISE EXCEPTION USING
      MESSAGE = 'WORKSHEET_CATEGORY_OUT_OF_SCOPE',
      DETAIL = format('worksheet_id=%s category_id=%s', NEW.worksheet_id, NEW.category_id);
  END IF;

  SELECT practica_id, is_system INTO v_act_practica, v_act_is_system
    FROM public.activity_codes
   WHERE activity_id = NEW.activity_id;

  -- Global/system activities (practica_id IS NULL, e.g. ADM) no longer qualify
  -- as valid for any practice, and is_system is checked independently of
  -- practica_id so a hypothetical system activity carrying the engagement's own
  -- practica_id is still rejected (0825-183; review.md iteración 1, #2).
  IF v_act_practica IS DISTINCT FROM v_practica_id OR v_act_is_system IS NOT FALSE THEN
    RAISE EXCEPTION USING
      MESSAGE = 'WORKSHEET_ACTIVITY_OUT_OF_SCOPE',
      DETAIL = format('worksheet_id=%s activity_id=%s', NEW.worksheet_id, NEW.activity_id);
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. Validate p_cells in batch_upsert_worksheet_cells before the delete, so a
--       rejected payload leaves the worksheet untouched instead of emptied ─────
CREATE OR REPLACE FUNCTION public.batch_upsert_worksheet_cells(p_worksheet_id uuid, p_cells jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_engagement_id uuid;
  v_practica      smallint;
  v_practica_id   uuid;
  v_invalid_count integer;
begin
  select aw.engagement_id, e.practica
    into v_engagement_id, v_practica
    from public.activity_worksheets aw
    join public.engagements e on e.engagement_id = aw.engagement_id
   where aw.id = p_worksheet_id;

  if v_engagement_id is null then
    raise exception 'Worksheet not found: %', p_worksheet_id;
  end if;

  if not (public.is_admin() or public.is_engagement_team_member(v_engagement_id)) then
    raise exception 'Permission denied: not a team member of this engagement'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(p_cells) > 0 then
    if v_practica is null then
      raise exception using
        message = 'WORKSHEET_PRACTICE_REQUIRED',
        detail = format('worksheet_id=%s reason=no_practica', p_worksheet_id);
    end if;

    select practica_id into v_practica_id
      from public.practicas
     where code = v_practica;

    -- Same precedence as the trigger: an unresolved practica code is treated
    -- the same as no practica at all (review.md iteración 1, #3).
    if v_practica_id is null then
      raise exception using
        message = 'WORKSHEET_PRACTICE_REQUIRED',
        detail = format('worksheet_id=%s reason=unresolved_practica_code practica_code=%s', p_worksheet_id, v_practica);
    end if;

    select count(*) into v_invalid_count
      from jsonb_array_elements(p_cells) as elem
      left join public.categories c on c.category_id = (elem->>'category_id')::uuid
     where c.practica_id is distinct from v_practica_id;

    if v_invalid_count > 0 then
      raise exception using
        message = 'WORKSHEET_CATEGORY_OUT_OF_SCOPE',
        detail = format('worksheet_id=%s', p_worksheet_id);
    end if;

    -- is_system is checked independently of practica_id, same rule as the
    -- trigger (review.md iteración 1, #2).
    select count(*) into v_invalid_count
      from jsonb_array_elements(p_cells) as elem
      left join public.activity_codes a on a.activity_id = (elem->>'activity_id')::uuid
     where a.practica_id is distinct from v_practica_id
        or a.is_system is not false;

    if v_invalid_count > 0 then
      raise exception using
        message = 'WORKSHEET_ACTIVITY_OUT_OF_SCOPE',
        detail = format('worksheet_id=%s', p_worksheet_id);
    end if;
  end if;

  delete from public.activity_worksheet_cells where worksheet_id = p_worksheet_id;

  insert into public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
  select
    p_worksheet_id,
    (elem->>'category_id')::uuid,
    (elem->>'activity_id')::uuid,
    (elem->>'budget_hours')::numeric
  from jsonb_array_elements(p_cells) as elem
  where (elem->>'budget_hours')::numeric > 0;
end;
$$;

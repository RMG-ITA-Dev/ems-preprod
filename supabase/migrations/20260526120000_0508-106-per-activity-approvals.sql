-- ─── BUG 0508-106 Plan v3: Per-activity approval model ───────────────────────
-- Converts timesheet_line_approvals from (period, engagement) granularity to
-- (period, engagement, activity) granularity so each engagement+activity pair
-- can be approved/rejected independently.

-- ─── STEP 1: Add activity_id column (nullable initially for backfill) ─────────
ALTER TABLE public.timesheet_line_approvals
  ADD COLUMN activity_id UUID REFERENCES public.activity_codes(activity_id);

-- ─── STEP 1b: Drop old unique constraint BEFORE backfill ─────────────────────
-- The old UNIQUE(period_id, engagement_id) would reject every backfill INSERT
-- (one new row per activity shares the same engagement as the existing legacy
-- row). Drop it now so the backfill can create multiple rows per engagement.
-- The replacement constraint is added in STEP 5 after NOT NULL is enforced.
ALTER TABLE public.timesheet_line_approvals
  DROP CONSTRAINT IF EXISTS timesheet_line_approvals_period_id_engagement_id_key;

-- ─── STEP 2: Backfill — one record per (period, engagement, activity) ────────
-- For each existing approval, derive one row per distinct activity_id found
-- in time_entries. Status/notes from the parent approval are inherited.
-- Orphaned approvals (no time_entries) are naturally excluded and will be
-- cleaned up in STEP 3.
WITH per_activity AS (
  SELECT DISTINCT
    tla.period_id,
    tla.engagement_id,
    te.activity_id,
    tla.status,
    tla.approved_by,
    tla.approved_at,
    tla.review_notes
  FROM public.timesheet_line_approvals tla
  JOIN public.time_entries te
    ON te.period_id    = tla.period_id
   AND te.engagement_id = tla.engagement_id
   AND te.is_forecast   = false
  WHERE tla.activity_id IS NULL
)
INSERT INTO public.timesheet_line_approvals
  (period_id, engagement_id, activity_id, status, approved_by, approved_at, review_notes)
SELECT period_id, engagement_id, activity_id, status, approved_by, approved_at, review_notes
FROM per_activity;

-- ─── STEP 3: Remove old engagement-level records (those with activity_id = NULL) ─
DELETE FROM public.timesheet_line_approvals WHERE activity_id IS NULL;

-- ─── STEP 4: Enforce NOT NULL ────────────────────────────────────────────────
ALTER TABLE public.timesheet_line_approvals
  ALTER COLUMN activity_id SET NOT NULL;

-- ─── STEP 5: Add new UNIQUE constraint ───────────────────────────────────────
ALTER TABLE public.timesheet_line_approvals
  ADD CONSTRAINT timesheet_line_approvals_period_engagement_activity_key
  UNIQUE (period_id, engagement_id, activity_id);

-- ─── STEP 6: Update submit_timesheet_safe RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_timesheet_safe(
  p_period_id          uuid,
  p_staff_id           uuid,
  p_engagement_ids     uuid[],
  p_activity_ids       uuid[],
  p_is_auto_approved   boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period                    RECORD;
  v_existing                  RECORD;
  v_max_te_updated            timestamptz;
  v_affected                  integer;
  v_pair_count                integer;
  i                           integer;
  v_eng_id                    uuid;
  v_act_id                    uuid;

  v_preserved_approved        integer := 0;
  v_reset_to_pending          integer := 0;
  v_kept_rejected             integer := 0;
  v_new_pending               integer := 0;
  v_new_auto_approved         integer := 0;
  v_guarded_update_skips      integer := 0;
BEGIN
  -- 1. VALIDATE: Arrays must be same length and non-empty
  v_pair_count := array_length(p_engagement_ids, 1);
  IF v_pair_count IS NULL OR v_pair_count = 0 THEN
    RAISE EXCEPTION 'EMPTY_ENGAGEMENTS: No valid engagement/activity pairs after sanitization';
  END IF;
  IF array_length(p_activity_ids, 1) <> v_pair_count THEN
    RAISE EXCEPTION 'ARRAY_LENGTH_MISMATCH: p_engagement_ids and p_activity_ids must be the same length';
  END IF;

  -- 2. LOCK: Acquire row-level lock on period
  SELECT period_id, staff_id, submitted_at
  INTO v_period
  FROM timesheet_periods
  WHERE period_id = p_period_id AND staff_id = p_staff_id
  FOR UPDATE;

  IF v_period IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Period % does not exist or does not belong to staff %', p_period_id, p_staff_id;
  END IF;

  -- 3. UPDATE PERIOD: Set submitted_at
  UPDATE timesheet_periods
  SET submitted_at = now()
  WHERE period_id = p_period_id;

  -- 4-7. Process each (engagement, activity) pair
  FOR i IN 1 .. v_pair_count LOOP
    v_eng_id := p_engagement_ids[i];
    v_act_id := p_activity_ids[i];

    -- Skip NULLs
    IF v_eng_id IS NULL OR v_act_id IS NULL THEN CONTINUE; END IF;

    -- 4. Fetch existing line approval for this (period, engagement, activity)
    SELECT approval_id, status, updated_at
    INTO v_existing
    FROM timesheet_line_approvals
    WHERE period_id    = p_period_id
      AND engagement_id = v_eng_id
      AND activity_id   = v_act_id;

    IF FOUND THEN
      -- b. Approved: SKIP
      IF v_existing.status = 'approved' THEN
        v_preserved_approved := v_preserved_approved + 1;
        CONTINUE;
      END IF;

      -- c. Pending: SKIP
      IF v_existing.status = 'pending' THEN
        CONTINUE;
      END IF;

      -- d. Rejected: check modified-since-rejection
      IF v_existing.status = 'rejected' THEN
        SELECT MAX(te.updated_at)
        INTO v_max_te_updated
        FROM time_entries te
        WHERE te.period_id      = p_period_id
          AND te.engagement_id  = v_eng_id
          AND te.activity_id    = v_act_id
          AND te.is_forecast    = false;

        IF v_max_te_updated IS NOT NULL AND v_max_te_updated > v_existing.updated_at THEN
          v_affected := 0;
          UPDATE timesheet_line_approvals
          SET status       = 'pending',
              approved_by  = NULL,
              approved_at  = NULL,
              review_notes = NULL
          WHERE period_id    = p_period_id
            AND engagement_id = v_eng_id
            AND activity_id   = v_act_id
            AND status        = 'rejected';

          GET DIAGNOSTICS v_affected = ROW_COUNT;

          IF v_affected = 0 THEN
            v_guarded_update_skips := v_guarded_update_skips + 1;
            v_preserved_approved   := v_preserved_approved + 1;
          ELSE
            v_reset_to_pending := v_reset_to_pending + 1;
          END IF;
        ELSE
          v_kept_rejected := v_kept_rejected + 1;
        END IF;

        CONTINUE;
      END IF;
    ELSE
      -- e. No existing row: INSERT
      IF p_is_auto_approved THEN
        INSERT INTO timesheet_line_approvals
          (period_id, engagement_id, activity_id, status, approved_by, approved_at)
        VALUES
          (p_period_id, v_eng_id, v_act_id, 'approved', p_staff_id, now());
        v_new_auto_approved := v_new_auto_approved + 1;
      ELSE
        INSERT INTO timesheet_line_approvals
          (period_id, engagement_id, activity_id, status)
        VALUES
          (p_period_id, v_eng_id, v_act_id, 'pending');
        v_new_pending := v_new_pending + 1;
      END IF;
    END IF;
  END LOOP;

  -- 7. Return summary
  RETURN jsonb_build_object(
    'period_id',              p_period_id,
    'preserved_approved',     v_preserved_approved,
    'reset_to_pending',       v_reset_to_pending,
    'kept_rejected',          v_kept_rejected,
    'new_pending',            v_new_pending,
    'new_auto_approved',      v_new_auto_approved,
    'guarded_update_skips',   v_guarded_update_skips
  );
END;
$$;

-- ─── STEP 7: Update protect_approved_time_entries trigger ────────────────────
CREATE OR REPLACE FUNCTION public.protect_approved_time_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_period     uuid;
  old_engagement uuid;
  old_activity   uuid;
  new_period     uuid;
  new_engagement uuid;
  new_activity   uuid;
BEGIN
  -- ── DELETE ──────────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    old_period     := OLD.period_id;
    old_engagement := OLD.engagement_id;
    old_activity   := OLD.activity_id;

    IF old_period IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.timesheet_line_approvals tla
      WHERE tla.period_id    = old_period
        AND tla.engagement_id = old_engagement
        AND tla.activity_id   = old_activity
        AND tla.status        = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot delete time entries on an approved line';
    END IF;
    RETURN OLD;
  END IF;

  -- ── INSERT ──────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    new_period     := NEW.period_id;
    new_engagement := NEW.engagement_id;
    new_activity   := NEW.activity_id;

    IF new_period IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.timesheet_line_approvals tla
      WHERE tla.period_id    = new_period
        AND tla.engagement_id = new_engagement
        AND tla.activity_id   = new_activity
        AND tla.status        = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot insert time entries into an approved line';
    END IF;
    RETURN NEW;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────
  old_period     := OLD.period_id;
  old_engagement := OLD.engagement_id;
  old_activity   := OLD.activity_id;
  new_period     := COALESCE(NEW.period_id,    OLD.period_id);
  new_engagement := COALESCE(NEW.engagement_id, OLD.engagement_id);
  new_activity   := COALESCE(NEW.activity_id,  OLD.activity_id);

  IF old_period IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.timesheet_line_approvals tla
    WHERE tla.period_id    = old_period
      AND tla.engagement_id = old_engagement
      AND tla.activity_id   = old_activity
      AND tla.status        = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot modify time entries on an approved line';
  END IF;

  IF new_period IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.timesheet_line_approvals tla
    WHERE tla.period_id    = new_period
      AND tla.engagement_id = new_engagement
      AND tla.activity_id   = new_activity
      AND tla.status        = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot move time entries into an approved line';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_approved_time_entries ON public.time_entries;

CREATE TRIGGER trg_protect_approved_time_entries
  BEFORE INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.protect_approved_time_entries();

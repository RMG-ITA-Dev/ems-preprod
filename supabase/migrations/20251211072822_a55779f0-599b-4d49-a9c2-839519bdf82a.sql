-- ============================================
-- ACTIVITY WORKSHEET MATRIX - Step 1: Schema
-- ============================================

-- 1. Create activity_worksheets table (linked to engagements)
CREATE TABLE public.activity_worksheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id) ON DELETE CASCADE,
    wo_id UUID REFERENCES public.work_orders(wo_id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
    notes TEXT,
    created_by_staff_id UUID REFERENCES public.staff(staff_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (engagement_id, version)
);

-- 2. Create activity_worksheet_cells table (the matrix cells)
CREATE TABLE public.activity_worksheet_cells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worksheet_id UUID NOT NULL REFERENCES public.activity_worksheets(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(category_id),
    activity_id UUID NOT NULL REFERENCES public.activity_codes(activity_id),
    budget_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (budget_hours >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (worksheet_id, category_id, activity_id)
);

-- 3. Add default_category_id to activity_codes (for deriving category in reporting)
ALTER TABLE public.activity_codes 
ADD COLUMN IF NOT EXISTS default_category_id UUID REFERENCES public.categories(category_id);

-- 4. Create indexes for performance
CREATE INDEX idx_activity_worksheets_engagement ON public.activity_worksheets(engagement_id);
CREATE INDEX idx_activity_worksheets_wo ON public.activity_worksheets(wo_id);
CREATE INDEX idx_activity_worksheet_cells_worksheet ON public.activity_worksheet_cells(worksheet_id);
CREATE INDEX idx_activity_worksheet_cells_category ON public.activity_worksheet_cells(category_id);
CREATE INDEX idx_activity_worksheet_cells_activity ON public.activity_worksheet_cells(activity_id);

-- 5. Triggers for updated_at
CREATE TRIGGER update_activity_worksheets_updated_at
    BEFORE UPDATE ON public.activity_worksheets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_activity_worksheet_cells_updated_at
    BEFORE UPDATE ON public.activity_worksheet_cells
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 6. SQL Views for Reporting
-- ============================================

-- View: Detailed budget hours by category and activity (from worksheet cells)
CREATE OR REPLACE VIEW public.vw_wo_budget_hours_by_category_activity AS
SELECT 
    wo.wo_id,
    wo.engagement_id,
    aw.id AS worksheet_id,
    awc.category_id,
    c.category_name,
    c.display_order AS category_display_order,
    awc.activity_id,
    ac.activity_code,
    ac.description AS activity_description,
    awc.budget_hours
FROM public.work_orders wo
JOIN public.activity_worksheets aw ON aw.wo_id = wo.wo_id
JOIN public.activity_worksheet_cells awc ON awc.worksheet_id = aw.id
JOIN public.categories c ON c.category_id = awc.category_id
JOIN public.activity_codes ac ON ac.activity_id = awc.activity_id
WHERE awc.budget_hours > 0;

-- View: Budget hours aggregated by category only
CREATE OR REPLACE VIEW public.vw_wo_budget_hours_by_category AS
SELECT 
    wo.wo_id,
    wo.engagement_id,
    awc.category_id,
    c.category_name,
    c.display_order AS category_display_order,
    SUM(awc.budget_hours) AS total_budget_hours
FROM public.work_orders wo
JOIN public.activity_worksheets aw ON aw.wo_id = wo.wo_id
JOIN public.activity_worksheet_cells awc ON awc.worksheet_id = aw.id
JOIN public.categories c ON c.category_id = awc.category_id
WHERE awc.budget_hours > 0
GROUP BY wo.wo_id, wo.engagement_id, awc.category_id, c.category_name, c.display_order;

-- View: Actual hours from time_entries by category and activity
CREATE OR REPLACE VIEW public.vw_actual_hours_by_category_activity AS
SELECT 
    te.engagement_id,
    s.category_id,
    c.category_name,
    c.display_order AS category_display_order,
    te.activity_id,
    ac.activity_code,
    ac.description AS activity_description,
    SUM(te.hours_logged) AS actual_hours
FROM public.time_entries te
JOIN public.staff s ON s.staff_id = te.staff_id
JOIN public.categories c ON c.category_id = s.category_id
JOIN public.activity_codes ac ON ac.activity_id = te.activity_id
WHERE te.is_forecast = false
GROUP BY te.engagement_id, s.category_id, c.category_name, c.display_order, 
         te.activity_id, ac.activity_code, ac.description;

-- View: Budget vs Actual comparison
CREATE OR REPLACE VIEW public.vw_budget_vs_actual_hours_by_category_activity AS
SELECT 
    COALESCE(b.wo_id, wo.wo_id) AS wo_id,
    COALESCE(b.engagement_id, a.engagement_id) AS engagement_id,
    COALESCE(b.category_id, a.category_id) AS category_id,
    COALESCE(b.category_name, a.category_name) AS category_name,
    COALESCE(b.category_display_order, a.category_display_order) AS category_display_order,
    COALESCE(b.activity_id, a.activity_id) AS activity_id,
    COALESCE(b.activity_code, a.activity_code) AS activity_code,
    COALESCE(b.activity_description, a.activity_description) AS activity_description,
    COALESCE(b.budget_hours, 0) AS budget_hours,
    COALESCE(a.actual_hours, 0) AS actual_hours,
    COALESCE(b.budget_hours, 0) - COALESCE(a.actual_hours, 0) AS variance_hours
FROM public.vw_wo_budget_hours_by_category_activity b
FULL OUTER JOIN public.vw_actual_hours_by_category_activity a 
    ON b.engagement_id = a.engagement_id 
    AND b.category_id = a.category_id 
    AND b.activity_id = a.activity_id
LEFT JOIN public.work_orders wo ON wo.engagement_id = a.engagement_id;

-- ============================================
-- 7. Function to sync worksheet to wo_budget_lines
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_worksheet_to_wo_budget(
    p_worksheet_id UUID,
    p_wo_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wo RECORD;
BEGIN
    -- Get work order details for rate calculation
    SELECT wo_id, currency, season_mode INTO v_wo
    FROM work_orders
    WHERE wo_id = p_wo_id;

    IF v_wo IS NULL THEN
        RAISE EXCEPTION 'Work order not found: %', p_wo_id;
    END IF;

    -- Link worksheet to work order
    UPDATE activity_worksheets
    SET wo_id = p_wo_id, updated_at = now()
    WHERE id = p_worksheet_id;

    -- Delete existing budget lines for this work order
    DELETE FROM wo_budget_lines WHERE wo_id = p_wo_id;

    -- Insert aggregated budget lines from worksheet cells
    INSERT INTO wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate)
    SELECT 
        p_wo_id,
        awc.category_id,
        SUM(awc.budget_hours),
        -- Calculate rate based on currency and season
        CASE 
            WHEN v_wo.currency = 'USD' AND v_wo.season_mode = 'High' THEN c.rate_high_usd
            WHEN v_wo.currency = 'USD' AND v_wo.season_mode = 'Low' THEN c.rate_low_usd
            WHEN v_wo.currency = 'BOB' AND v_wo.season_mode = 'High' THEN c.rate_high_bob
            ELSE c.rate_low_bob
        END
    FROM activity_worksheet_cells awc
    JOIN categories c ON c.category_id = awc.category_id
    WHERE awc.worksheet_id = p_worksheet_id
      AND awc.budget_hours > 0
    GROUP BY awc.category_id, c.rate_high_usd, c.rate_low_usd, c.rate_high_bob, c.rate_low_bob;
END;
$$;

-- ============================================
-- 8. RLS Policies
-- ============================================

-- Enable RLS
ALTER TABLE public.activity_worksheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_worksheet_cells ENABLE ROW LEVEL SECURITY;

-- Worksheets: Authenticated users can read
CREATE POLICY "Authenticated users can read worksheets"
ON public.activity_worksheets
FOR SELECT
USING (true);

-- Worksheets: Authenticated users can manage
CREATE POLICY "Authenticated users can manage worksheets"
ON public.activity_worksheets
FOR ALL
USING (true)
WITH CHECK (true);

-- Cells: Authenticated users can read
CREATE POLICY "Authenticated users can read worksheet cells"
ON public.activity_worksheet_cells
FOR SELECT
USING (true);

-- Cells: Authenticated users can manage
CREATE POLICY "Authenticated users can manage worksheet cells"
ON public.activity_worksheet_cells
FOR ALL
USING (true)
WITH CHECK (true);
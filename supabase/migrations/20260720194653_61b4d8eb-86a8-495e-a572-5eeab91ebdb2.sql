-- Corrective migration — converge engagement_assignments to canonical shape.
ALTER TABLE public.engagement_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_firmwide_assignment_visibility()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','partner','director'))
$$;

CREATE OR REPLACE FUNCTION public.has_assignment_on_engagement(p_engagement_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM engagement_assignments ea WHERE ea.engagement_id = p_engagement_id AND ea.staff_id = get_my_staff_id() AND ea.deleted_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.can_read_engagement_assignments(p_engagement_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT has_firmwide_assignment_visibility()
    OR (has_role(auth.uid(),'manager'::app_role) AND is_engagement_team_member(p_engagement_id))
    OR (has_role(auth.uid(),'senior'::app_role)  AND has_assignment_on_engagement(p_engagement_id))
$$;

REVOKE EXECUTE ON FUNCTION public.has_firmwide_assignment_visibility() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_assignment_on_engagement(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_engagement_assignments(uuid) FROM PUBLIC;
DO $$
DECLARE r text; f text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','service_role'] LOOP
    IF to_regrole(r) IS NULL THEN CONTINUE; END IF;
    FOREACH f IN ARRAY ARRAY['has_firmwide_assignment_visibility()','has_assignment_on_engagement(uuid)','can_read_engagement_assignments(uuid)'] LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM %I', f, r);
    END LOOP;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.has_firmwide_assignment_visibility() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_assignment_on_engagement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_engagement_assignments(uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated can read assignments" ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership can insert assignments"  ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership can update assignments"  ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership can delete assignments"  ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership manages assignments"     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select          ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_manage     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_admin_manage    ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select_firmwide ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select_lead     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select_assigned ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_insert     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_update     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_delete     ON public.engagement_assignments;

CREATE POLICY ea_admin_manage ON public.engagement_assignments
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY ea_select_firmwide ON public.engagement_assignments
  FOR SELECT TO authenticated USING (public.has_firmwide_assignment_visibility());
CREATE POLICY ea_select_lead ON public.engagement_assignments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'manager'::app_role) AND public.is_engagement_team_member(engagement_id));
CREATE POLICY ea_select_assigned ON public.engagement_assignments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'senior'::app_role) AND public.has_assignment_on_engagement(engagement_id));
CREATE POLICY ea_team_insert ON public.engagement_assignments
  FOR INSERT TO authenticated WITH CHECK (public.is_engagement_team_member(engagement_id) AND public.can_read_engagement_assignments(engagement_id));
CREATE POLICY ea_team_update ON public.engagement_assignments
  FOR UPDATE TO authenticated USING (public.is_engagement_team_member(engagement_id) AND public.can_read_engagement_assignments(engagement_id))
  WITH CHECK (public.is_engagement_team_member(engagement_id) AND public.can_read_engagement_assignments(engagement_id));
CREATE POLICY ea_team_delete ON public.engagement_assignments
  FOR DELETE TO authenticated USING (public.is_engagement_team_member(engagement_id) AND public.can_read_engagement_assignments(engagement_id));

DO $$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON public.engagement_assignments FROM anon;
  END IF;
END $$;

DO $$
DECLARE v text; api_roles text;
BEGIN
  SELECT string_agg(quote_ident(r), ', ') INTO api_roles
    FROM unnest(ARRAY['anon','authenticated']) AS r WHERE to_regrole(r) IS NOT NULL;
  FOREACH v IN ARRAY ARRAY['vw_engagement_staffing_summary','vw_staffing_alerts','vw_staff_weekly_capacity'] LOOP
    IF to_regclass('public.'||v) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v);
      IF api_roles IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM %s', v, api_roles);
      END IF;
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.engagement_assignments ADD COLUMN IF NOT EXISTS category_id UUID;

UPDATE public.engagement_assignments ea
   SET category_id = s.category_id
  FROM public.staff s
 WHERE ea.staff_id = s.staff_id AND ea.category_id IS NULL;

DO $$
DECLARE missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count FROM public.engagement_assignments WHERE category_id IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce engagement_assignments.category_id NOT NULL: % row(s) remain NULL after staff.category_id backfill.', missing_count;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='engagement_assignments'
               AND column_name='category_id' AND is_nullable='YES') THEN
    ALTER TABLE public.engagement_assignments ALTER COLUMN category_id SET NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='engagement_assignments_category_id_fkey'
                   AND table_schema='public' AND table_name='engagement_assignments') THEN
    ALTER TABLE public.engagement_assignments
      ADD CONSTRAINT engagement_assignments_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
DECLARE bad_dates integer;
BEGIN
  SELECT count(*) INTO bad_dates FROM public.engagement_assignments WHERE end_date < start_date;
  IF bad_dates > 0 THEN
    RAISE EXCEPTION 'Cannot add engagement_assignments date CHECK: % row(s) have end_date < start_date.', bad_dates;
  END IF;
END $$;

ALTER TABLE public.engagement_assignments DROP CONSTRAINT IF EXISTS chk_assignment_dates;
ALTER TABLE public.engagement_assignments DROP CONSTRAINT IF EXISTS engagement_assignments_dates_chk;
ALTER TABLE public.engagement_assignments ADD CONSTRAINT engagement_assignments_dates_chk CHECK (end_date >= start_date);

CREATE INDEX IF NOT EXISTS idx_eng_assign_engagement_active
  ON public.engagement_assignments (engagement_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_eng_assign_staff_dates_active
  ON public.engagement_assignments (staff_id, start_date, end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_eng_assign_category_active
  ON public.engagement_assignments (category_id) WHERE deleted_at IS NULL;

ALTER TABLE public.engagement_assignments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_engagement_assignments_updated_at ON public.engagement_assignments;
DROP TRIGGER IF EXISTS update_engagement_assignments_updated_at ON public.engagement_assignments;
CREATE TRIGGER update_engagement_assignments_updated_at
  BEFORE UPDATE ON public.engagement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

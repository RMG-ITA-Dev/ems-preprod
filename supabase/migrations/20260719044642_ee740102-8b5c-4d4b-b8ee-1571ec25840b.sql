
CREATE TABLE IF NOT EXISTS public.wo_staffing_requirements (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wo_id       UUID        NOT NULL REFERENCES public.work_orders(wo_id)  ON DELETE CASCADE,
  category_id UUID        NOT NULL REFERENCES public.categories(category_id) ON DELETE RESTRICT,
  staff_count INT         NOT NULL CHECK (staff_count BETWEEN 1 AND 999),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wo_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_wo_staffing_requirements_wo
  ON public.wo_staffing_requirements(wo_id);
CREATE INDEX IF NOT EXISTS idx_wo_staffing_requirements_cat
  ON public.wo_staffing_requirements(category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wo_staffing_requirements TO authenticated;
GRANT ALL ON public.wo_staffing_requirements TO service_role;

DROP TRIGGER IF EXISTS update_wo_staffing_requirements_updated_at
  ON public.wo_staffing_requirements;
CREATE TRIGGER update_wo_staffing_requirements_updated_at
  BEFORE UPDATE ON public.wo_staffing_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.wo_staffing_requirement_skills (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requirement_id        UUID        NOT NULL REFERENCES public.wo_staffing_requirements(id) ON DELETE CASCADE,
  skill_id              UUID        NOT NULL REFERENCES public.skills(skill_id) ON DELETE RESTRICT,
  min_proficiency_level TEXT        NOT NULL CHECK (min_proficiency_level IN ('Beginner','Intermediate','Advanced')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_wo_req_skills_req
  ON public.wo_staffing_requirement_skills(requirement_id);
CREATE INDEX IF NOT EXISTS idx_wo_req_skills_skill
  ON public.wo_staffing_requirement_skills(skill_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wo_staffing_requirement_skills TO authenticated;
GRANT ALL ON public.wo_staffing_requirement_skills TO service_role;

ALTER TABLE public.wo_staffing_requirements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_staffing_requirement_skills  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_staffing_req_select ON public.wo_staffing_requirements;
CREATE POLICY wo_staffing_req_select
  ON public.wo_staffing_requirements
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS wo_staffing_req_write ON public.wo_staffing_requirements;
CREATE POLICY wo_staffing_req_write
  ON public.wo_staffing_requirements
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR public.is_engagement_team_member(
      (SELECT engagement_id FROM public.work_orders WHERE wo_id = wo_staffing_requirements.wo_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_engagement_team_member(
      (SELECT engagement_id FROM public.work_orders WHERE wo_id = wo_staffing_requirements.wo_id)
    )
  );

DROP POLICY IF EXISTS wo_staffing_req_skills_select ON public.wo_staffing_requirement_skills;
CREATE POLICY wo_staffing_req_skills_select
  ON public.wo_staffing_requirement_skills
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS wo_staffing_req_skills_write ON public.wo_staffing_requirement_skills;
CREATE POLICY wo_staffing_req_skills_write
  ON public.wo_staffing_requirement_skills
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR public.is_engagement_team_member(
      (SELECT w.engagement_id
         FROM public.wo_staffing_requirements r
         JOIN public.work_orders w ON w.wo_id = r.wo_id
        WHERE r.id = wo_staffing_requirement_skills.requirement_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_engagement_team_member(
      (SELECT w.engagement_id
         FROM public.wo_staffing_requirements r
         JOIN public.work_orders w ON w.wo_id = r.wo_id
        WHERE r.id = wo_staffing_requirement_skills.requirement_id)
    )
  );

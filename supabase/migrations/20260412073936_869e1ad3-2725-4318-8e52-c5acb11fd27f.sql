-- ============================================================
-- Skills Tracking: master taxonomy + staff-skill junction
-- Supports the upcoming GANTT scheduler.
-- ============================================================

-- 1. Create skills table (admin-managed skill taxonomy)
CREATE TABLE public.skills (
  skill_id   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       VARCHAR     NOT NULL,
  category   VARCHAR     NOT NULL,
  is_active  BOOLEAN     DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent blank/whitespace-only entries
  CONSTRAINT chk_skills_name_not_empty     CHECK (TRIM(name) <> ''),
  CONSTRAINT chk_skills_category_not_empty CHECK (TRIM(category) <> '')
);

-- Case-insensitive uniqueness: "IFRS" and "ifrs" cannot coexist
CREATE UNIQUE INDEX idx_skills_name_unique
  ON public.skills (LOWER(TRIM(name)));

-- Auto-update updated_at (reuses existing function)
CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: admins manage, authenticated users read
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage skills"
  ON public.skills FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated users can read skills"
  ON public.skills FOR SELECT TO authenticated
  USING (true);


-- 2. Create staff_skills junction table
CREATE TABLE public.staff_skills (
  staff_skill_id    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id          UUID        NOT NULL REFERENCES public.staff(staff_id)  ON DELETE CASCADE,
  skill_id          UUID        NOT NULL REFERENCES public.skills(skill_id) ON DELETE RESTRICT,
  proficiency_level VARCHAR     NOT NULL CHECK (proficiency_level IN ('Beginner', 'Intermediate', 'Advanced')),
  last_evaluated_date DATE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  -- A staff member can only hold a given skill once
  UNIQUE (staff_id, skill_id)
);

-- FK lookup indexes for JOIN performance
CREATE INDEX idx_staff_skills_staff ON public.staff_skills (staff_id);
CREATE INDEX idx_staff_skills_skill ON public.staff_skills (skill_id);

-- Auto-update updated_at (reuses existing function)
CREATE TRIGGER update_staff_skills_updated_at
  BEFORE UPDATE ON public.staff_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: admins manage, authenticated users read
ALTER TABLE public.staff_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage staff skills"
  ON public.staff_skills FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated users can read staff skills"
  ON public.staff_skills FOR SELECT TO authenticated
  USING (true);
-- Constrain skill categories to a stable code set.
-- Display labels are resolved via i18n, codes stay language-neutral.
ALTER TABLE public.skills
  ADD CONSTRAINT chk_skills_category_code
  CHECK (category IN ('framework', 'industry', 'tool', 'language', 'certification', 'other'));

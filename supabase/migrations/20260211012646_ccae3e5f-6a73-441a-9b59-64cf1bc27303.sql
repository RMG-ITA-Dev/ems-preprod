CREATE UNIQUE INDEX IF NOT EXISTS idx_engagements_code_unique
  ON public.engagements (engagement_code)
  WHERE engagement_code IS NOT NULL;
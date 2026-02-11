-- Bug #12: Add partial unique index on staff.email to prevent duplicate emails
-- Allows multiple NULL emails but prevents two staff records from sharing the same email
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_email_unique
  ON public.staff (email)
  WHERE email IS NOT NULL;
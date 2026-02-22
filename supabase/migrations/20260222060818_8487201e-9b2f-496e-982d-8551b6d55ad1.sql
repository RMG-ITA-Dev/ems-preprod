ALTER TABLE public.timer_entries
  ADD COLUMN has_explicit_times boolean NOT NULL DEFAULT true;
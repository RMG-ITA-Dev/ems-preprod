CREATE UNIQUE INDEX idx_time_entries_unique_entry 
ON public.time_entries (staff_id, engagement_id, activity_id, date_worked, is_forecast);
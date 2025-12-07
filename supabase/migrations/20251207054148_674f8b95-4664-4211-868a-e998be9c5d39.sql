-- Add short_name and initials columns to staff table
ALTER TABLE public.staff 
ADD COLUMN short_name VARCHAR(50),
ADD COLUMN initials VARCHAR(4);
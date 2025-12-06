-- Add new fields to staff table
ALTER TABLE public.staff
ADD COLUMN city character varying CHECK (city IN ('La Paz', 'Santa Cruz')),
ADD COLUMN id_number character varying,
ADD COLUMN aud_reg_number character varying;
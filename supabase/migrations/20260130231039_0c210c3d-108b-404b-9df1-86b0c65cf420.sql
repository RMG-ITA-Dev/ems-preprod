-- ============================================
-- EMS 2.0 Bug Fixes - Database Migration
-- ============================================

-- BUG #26: Add specialist categories
-- First, shift existing display_orders to make room for SQR between Socio and Director
UPDATE categories SET display_order = display_order + 1 WHERE display_order >= 2;

-- Insert new categories
INSERT INTO categories (category_name, display_order, rate_high_usd, rate_low_usd, rate_high_bob, rate_low_bob, can_approve_timesheets, can_approve_wo)
VALUES 
  ('SQR', 2, 150, 120, 1050, 840, true, true),
  ('Especialista IT', 8, 80, 65, 560, 455, false, false),
  ('Especialista TAX', 9, 90, 75, 630, 525, false, false);

-- BUG #36: Add soft delete column to staff
ALTER TABLE staff ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Update staff_directory view to exclude soft-deleted staff
DROP VIEW IF EXISTS staff_directory;
CREATE VIEW staff_directory AS
SELECT 
  staff_id,
  first_name,
  last_name,
  short_name,
  initials,
  city,
  category_id,
  is_active,
  created_at,
  updated_at
FROM staff
WHERE deleted_at IS NULL;

-- BUG #22: Add hire_date column to staff
ALTER TABLE staff ADD COLUMN IF NOT EXISTS hire_date DATE DEFAULT NULL;

-- BUG #34: Add risk assessment columns to work_orders
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS ceac_completed_at DATE DEFAULT NULL;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS ceac_notes TEXT DEFAULT NULL;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS san_completed_at DATE DEFAULT NULL;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS san_notes TEXT DEFAULT NULL;

-- BUG #24: Create storage bucket for expense receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- RLS policies for expense-receipts bucket
CREATE POLICY "Authenticated users can upload expense receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'expense-receipts');

CREATE POLICY "Authenticated users can view expense receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'expense-receipts');

CREATE POLICY "Authenticated users can update their expense receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'expense-receipts');

CREATE POLICY "Authenticated users can delete expense receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'expense-receipts');
-- Add CEAC approval number, SAN approval ID, and risk level to work_orders
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS ceac_number     TEXT,
  ADD COLUMN IF NOT EXISTS san_approval_id TEXT,
  ADD COLUMN IF NOT EXISTS risk_level      TEXT
    CONSTRAINT work_orders_risk_level_check
    CHECK (risk_level IS NULL OR risk_level IN ('Bajo', 'Moderado', 'Alto'));

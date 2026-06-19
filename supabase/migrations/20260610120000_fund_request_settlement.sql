-- Fund Requests — Fase 7: Liquidación
-- ====================================
-- Al cerrar una solicitud en liquidación se guarda un snapshot del cálculo:
--   entregado − gastado(validado) = saldo, y la resolución elegida.
-- El 13% de devoluciones (facturas incorrectas) se guarda informativo (aparte).
-- El sistema solo REGISTRA la resolución (devolución / descuento planilla /
-- pago); no integra planilla ni pagos.
-- Idempotente.

ALTER TABLE public.fund_requests
  ADD COLUMN IF NOT EXISTS settlement_total_spent NUMERIC,
  ADD COLUMN IF NOT EXISTS settlement_balance NUMERIC,
  ADD COLUMN IF NOT EXISTS settlement_iva_total NUMERIC,
  ADD COLUMN IF NOT EXISTS settlement_resolution TEXT,
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS settlement_notes TEXT,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_by_staff_id UUID REFERENCES public.staff(staff_id);

-- Valores válidos de resolución (del diagrama del PDF).
ALTER TABLE public.fund_requests
  DROP CONSTRAINT IF EXISTS fund_requests_settlement_resolution_check;
ALTER TABLE public.fund_requests
  ADD CONSTRAINT fund_requests_settlement_resolution_check
  CHECK (
    settlement_resolution IS NULL
    OR settlement_resolution IN ('sin_saldo', 'devolucion', 'descuento_planilla', 'pago_solicitante')
  );

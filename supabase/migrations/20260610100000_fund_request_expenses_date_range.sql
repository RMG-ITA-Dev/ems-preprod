-- Fund Request Expenses — campos comunes de viáticos/gastos
-- =========================================================
-- Agrega rango de fechas (Del/Al) y tiempo en días, útiles tanto para gastos
-- con factura como para viáticos. `expense_date` se mantiene como la fecha "Del"
-- (inicio); `expense_date_end` es la fecha "Al" (fin, opcional); `days` es el
-- tiempo en días (derivado del rango, pero se guarda para reportes).
--
-- Idempotente.

ALTER TABLE public.fund_request_expenses
  ADD COLUMN IF NOT EXISTS expense_date_end DATE,
  ADD COLUMN IF NOT EXISTS days INTEGER;
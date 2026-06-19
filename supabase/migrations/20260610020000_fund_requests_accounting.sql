-- Fund Requests — Phase 3: Accounting (Disbursement & Closure)
-- Adds columns to capture the disbursement and the closure of a fund request.
-- Admin already has full UPDATE permission via fr_update_admin, so no new
-- RLS policy is needed yet. When dedicated accounting roles exist (e.g.,
-- staff.is_accounting_approver / staff.is_accounting_assistant) we will add
-- more granular policies.

ALTER TABLE public.fund_requests
  ADD COLUMN IF NOT EXISTS total_disbursed_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disbursed_by_staff_id UUID REFERENCES public.staff(staff_id),
  ADD COLUMN IF NOT EXISTS accounting_notes TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Para que no se pueda guardar un desembolso negativo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fund_requests_disbursed_nonneg'
  ) THEN
    ALTER TABLE public.fund_requests
      ADD CONSTRAINT fund_requests_disbursed_nonneg
      CHECK (total_disbursed_amount >= 0);
  END IF;
END $$;

-- Two-step Riesgos approval for the EMERGENCY flow only (0306-78 / 0525-119 / 0526-121).
--
-- The emergency approval now requires two sequential sign-offs before the risk track
-- is considered "Emergency_Approved" (and the 5-business-day / +7-calendar-day deadline starts):
--   1) emergency_review_*  -- Riesgo (assistant)
--   2) emergency_partner_* -- Socio de Riesgos
--
-- The NORMAL flow keeps a single Riesgos approval (risk_approved_by / risk_approved_at
-- + risk_status='Approved'), unchanged.
--
-- For now both emergency sign-offs are performed by the Administrator role
-- (useUserRole().isAdmin); finer role/permission separation is deferred. No RLS change:
-- is_admin() already grants full UPDATE on work_orders (migration 20260107032620).

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS emergency_review_by  UUID REFERENCES public.staff(staff_id),
  ADD COLUMN IF NOT EXISTS emergency_review_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emergency_partner_by UUID REFERENCES public.staff(staff_id),
  ADD COLUMN IF NOT EXISTS emergency_partner_at TIMESTAMPTZ;

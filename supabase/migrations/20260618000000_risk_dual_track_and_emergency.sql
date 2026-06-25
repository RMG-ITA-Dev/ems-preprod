-- Risk dual-track approval + emergency procedure on work_orders (0306-78 / 0525-119 / 0526-121)
-- Adds an independent Riesgos approval track alongside the existing Socio track
-- (approved_by / approved_at) plus the emergency-approval fields.
--
-- approval_status='Approved'  <=>  approved_at IS NOT NULL
--                                   AND risk_status IN ('Approved','Emergency_Approved')
--
-- Note: ceac_number, san_approval_id, risk_level already exist (migration 20260603000000)
-- and are NOT recreated here. No can_approve_risk column is added: the Riesgos approver
-- is the Administrator role, detected client-side via useUserRole().isAdmin.
-- No RLS change is required: is_admin() already grants full UPDATE on work_orders
-- (migration 20260107032620), and RLS is row-level so admins can write the new columns.

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS risk_status TEXT DEFAULT 'Pending'
    CONSTRAINT work_orders_risk_status_check
    CHECK (risk_status IN ('Pending','Approved','Emergency_Approved','Rejected')),
  ADD COLUMN IF NOT EXISTS risk_approved_by        UUID REFERENCES public.staff(staff_id),
  ADD COLUMN IF NOT EXISTS risk_approved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS risk_notes              TEXT,
  ADD COLUMN IF NOT EXISTS emergency_deadline_at   DATE,
  ADD COLUMN IF NOT EXISTS emergency_justification TEXT;

-- Backfill: pre-existing approved work orders must have risk_status='Approved' so that
-- the conditional close (approval_status='Approved' WHERE risk_status IN ('Approved','Emergency_Approved'))
-- keeps working when the Socio approves any WO that was already fully approved before this migration.
-- Pending_Approval WOs keep risk_status='Pending' and will require a manual Risk approval
-- going forward, which is intentional (all new approvals now require the Risk track).
UPDATE public.work_orders
  SET risk_status = 'Approved'
WHERE approval_status = 'Approved';

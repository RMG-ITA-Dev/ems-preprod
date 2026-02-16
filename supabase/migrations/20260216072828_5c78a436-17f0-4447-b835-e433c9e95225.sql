
ALTER TABLE public.expense_logs
  ADD COLUMN created_by_staff_id uuid REFERENCES public.staff(staff_id);

CREATE INDEX idx_expense_logs_created_by ON public.expense_logs (created_by_staff_id);

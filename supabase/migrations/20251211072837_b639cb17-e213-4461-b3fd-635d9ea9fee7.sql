-- Fix Security Definer warnings by setting views to SECURITY INVOKER
ALTER VIEW public.vw_wo_budget_hours_by_category_activity SET (security_invoker = on);
ALTER VIEW public.vw_wo_budget_hours_by_category SET (security_invoker = on);
ALTER VIEW public.vw_actual_hours_by_category_activity SET (security_invoker = on);
ALTER VIEW public.vw_budget_vs_actual_hours_by_category_activity SET (security_invoker = on);
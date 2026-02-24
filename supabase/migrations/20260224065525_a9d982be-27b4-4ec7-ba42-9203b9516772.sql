
-- M2b: Bug 0220-56 — Audit policy hardening (atomic, no interim permissive window)

-- Block all direct DML from client roles
REVOKE INSERT, UPDATE, DELETE ON public.user_lifecycle_audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_lifecycle_audit_log FROM authenticated;

-- Only service_role (edge functions) can INSERT directly
GRANT INSERT ON public.user_lifecycle_audit_log TO service_role;

-- Authenticated users can SELECT (governed by RLS admin-only policy)
GRANT SELECT ON public.user_lifecycle_audit_log TO authenticated;

-- BUG 0514-115 (follow-up): grant secure-signin access to lockout RPCs.
--
-- The previous follow-up migration moved the lockout counter behind the
-- secure-signin edge function and revoked anon/authenticated EXECUTE from the
-- pre-check and record RPCs. secure-signin calls those RPCs with the
-- service-role key, but PostgreSQL still checks function EXECUTE privileges
-- before entering SECURITY DEFINER functions.
--
-- This migration is intentionally separate and idempotent so environments that
-- already applied 20260527000000 receive the missing grants.

GRANT EXECUTE ON FUNCTION public.check_login_allowed(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO service_role;

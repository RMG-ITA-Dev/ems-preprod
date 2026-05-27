-- BUG 0514-115 (follow-up): close the anon-callable DoS vector on the lockout RPCs.
--
-- Context:
--   The original migration (20260521000000_add_account_lockout_policy.sql) granted
--   EXECUTE on `record_failed_login(text)` and `check_login_allowed(text)` to the
--   `anon` role so the SPA could call them directly around `signInWithPassword`.
--
--   Codex review flagged (correctly) that any holder of the public anon key can
--   POST `record_failed_login('victim@...')` five times and lock the account for
--   15 minutes without ever attempting a real login — a DoS vector against any
--   email an attacker can enumerate.
--
-- Fix:
--   Login now runs server-side inside the `secure-signin` edge function using
--   the service-role key. The edge function is the only caller of the lockout
--   RPCs, so we strip EXECUTE from `anon` and `authenticated` for the two
--   mutating/leaking RPCs. The increment now only happens after a real GoTrue
--   credential failure verified inside the edge function — the invariant Codex
--   asked for.
--
--   `reset_login_attempts(text)` keeps its `authenticated`-only grant because
--   the password-recovery flow (`useAuth.updatePassword`) still calls it from
--   the client after a successful `auth.updateUser({password})`. Its existing
--   `auth.jwt() ->> 'email'` guard already restricts authenticated callers to
--   their own counter, which is the correct surface for that flow.
--
-- Idempotent: REVOKE is a no-op when the grant is already absent.

REVOKE EXECUTE ON FUNCTION public.check_login_allowed(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text) FROM anon, authenticated;

-- Defense in depth: re-assert the previous revoke on reset_login_attempts
-- so a future grant-reshuffle can't silently re-open it.
REVOKE EXECUTE ON FUNCTION public.reset_login_attempts(text) FROM public, anon;

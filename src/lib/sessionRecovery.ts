// One-shot, epoch-aware session-recovery coordinator (Fase 7, plan v2 §A.1).
//
// Trigger: a Scheduler Edge Function 401 that carries the EMS envelope
// (SchedulerDataError with code "unauthorized" AND status 401 — see
// mapInvokeFailure in src/hooks/scheduler/schedulerData.ts). That predicate
// is deliberately narrower than `isSchedulerAuthFailure` exported from the
// same module (code === "unauthorized" || status === 401), which exists only
// to suppress retries and stays intentionally broader. Do not reuse it here:
// a bare 401 from an untouched gateway, a 2xx body carrying an "unauthorized"
// envelope, or a 403 (permission denied, not session revocation) must never
// reach this coordinator.
//
// Four guards, all mandatory:
//   - single-flight: concurrent failures collapse into one signOut + one toast.
//   - epoch guard: confirm with the server BEFORE destroying anything — a 401
//     from a request tied to a dead epoch (raced by a token refresh) must not
//     kill a session that is valid right now.
//   - fail-closed: any ambiguity (network failure reaching the auth server,
//     a signOut that itself fails) means we do NOT clear state and do NOT
//     toast — we re-arm and let a future confirmed failure retry.
//   - no loops: once a revocation is confirmed and handled, this module stays
//     disarmed until useAuth re-arms it on a subsequent authenticated event
//     (SIGNED_IN / TOKEN_REFRESHED / INITIAL_SESSION with a session).
import { supabase } from "@/integrations/supabase/client";
import { SchedulerDataError } from "@/hooks/scheduler/schedulerData";
import i18n from "@/i18n";
import { toast } from "sonner";

let armed = true;
let inFlight: Promise<void> | null = null;

/** Called by useAuth after a genuinely authenticated auth event. */
export function rearmSessionRecovery(): void {
  armed = true;
}

function isRevokedSessionFailure(error: unknown): boolean {
  return (
    error instanceof SchedulerDataError &&
    error.code === "unauthorized" &&
    error.status === 401
  );
}

/**
 * Entry point for the global QueryCache/MutationCache error handlers in
 * App.tsx. Safe to call with any thrown value from any query/mutation —
 * only a confirmed Scheduler session-revocation 401 does anything.
 */
export function maybeStartSessionRecovery(error: unknown): void {
  if (!isRevokedSessionFailure(error)) return;
  if (!armed) return;
  if (inFlight) return;

  armed = false;
  inFlight = recoverFromRevokedSession().finally(() => {
    inFlight = null;
  });
}

async function recoverFromRevokedSession(): Promise<void> {
  let sessionConfirmedGone = false;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      // Epoch guard: the server still honors the current session, so this
      // 401 came from a stale/dead epoch. Nothing to clean, nothing to say.
      armed = true;
      return;
    }
    if (error?.name === "AuthSessionMissingError" || error?.name === "AuthApiError") {
      // AuthSessionMissingError: no local session at all (already cleared).
      // AuthApiError: a local session/token exists and the auth server itself
      // rejected it (invalid/expired/revoked JWT) — this is the primary real-world
      // case this coordinator exists for (see module header): the Scheduler backend
      // rejected the token, and getUser() reaching the auth server confirms it's
      // actually gone, not just a dead-epoch race.
      sessionConfirmedGone = true;
    }
    // Any other auth-server error (unrecognized error name) is ambiguous — fall
    // through to fail-closed below rather than treating it as a confirmed revocation.
  } catch {
    // Network-level failure reaching the auth server (e.g.
    // AuthRetryableFetchError). Can't confirm anything — fail-closed.
    armed = true;
    return;
  }

  if (!sessionConfirmedGone) {
    armed = true;
    return;
  }

  const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
  if (signOutError) {
    // Fail-closed: could not confirm local cleanup actually happened.
    armed = true;
    return;
  }

  toast.info(i18n.t("auth.sessionExpiredRevoked"));
  // Stays disarmed until rearmSessionRecovery() runs.
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { SchedulerDataError, SchedulerUnavailableError } from "@/hooks/scheduler/schedulerData";

// Fase 7 (plan v2 §A.1, "Tests to Add"). The global src/test/setup.ts mock of
// "@/integrations/supabase/client" has no `auth` surface — this local vi.mock
// supplies it for this file only, alongside the same functions/rpc shape the
// global mock provides so other modules importing the client stay happy.
const getUser = vi.fn();
const signOut = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser, signOut },
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { maybeStartSessionRecovery, rearmSessionRecovery } from "../sessionRecovery";

function revokedSessionError() {
  return new SchedulerDataError("unauthorized", "Session invalid", 401);
}

async function flush() {
  // Let the microtask chain inside recoverFromRevokedSession() drain.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("sessionRecovery (Fase 7, plan v2 §A.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rearmSessionRecovery();
  });

  afterEach(() => {
    // Leave the module armed for the next test regardless of outcome.
    rearmSessionRecovery();
  });

  describe("predicate — only a confirmed revoked-session 401 triggers anything", () => {
    const negatives: Array<[string, unknown]> = [
      ["bare gateway 401 (code=unknown)", new SchedulerDataError("unknown", "x", 401)],
      ["2xx envelope unauthorized (status undefined)", new SchedulerDataError("unauthorized", "x", undefined)],
      ["403 forbidden", new SchedulerDataError("forbidden", "x", 403)],
      ["structurally-similar non-instance", { code: "unauthorized", status: 401, message: "x" }],
      ["SchedulerUnavailableError (not deployed / network)", new SchedulerUnavailableError()],
      ["plain Error", new Error("boom")],
      ["string", "unauthorized"],
      ["null", null],
      ["undefined", undefined],
      ["unauthorized but status 500", new SchedulerDataError("unauthorized", "x", 500)],
      ["not_found with status 401", new SchedulerDataError("not_found", "x", 401)],
    ];

    for (const [label, error] of negatives) {
      it(`does not start recovery for: ${label}`, async () => {
        maybeStartSessionRecovery(error);
        await flush();
        expect(signOut).not.toHaveBeenCalled();
        expect(getUser).not.toHaveBeenCalled();
        expect(toast.info).not.toHaveBeenCalled();
      });
    }

    it("starts recovery for a confirmed revoked-session 401", async () => {
      getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
      signOut.mockResolvedValue({ error: null });

      maybeStartSessionRecovery(revokedSessionError());
      await flush();

      expect(getUser).toHaveBeenCalledTimes(1);
      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(toast.info).toHaveBeenCalledWith("auth.sessionExpiredRevoked");
    });
  });

  it("epoch guard: a still-valid session server-side aborts destructively and rearms", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    maybeStartSessionRecovery(revokedSessionError());
    await flush();

    expect(signOut).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();

    // Rearmed — a later confirmed failure can still trigger recovery.
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    signOut.mockResolvedValue({ error: null });
    maybeStartSessionRecovery(revokedSessionError());
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("fail-closed: auth server unreachable (getUser throws) does not clean up or toast, and rearms", async () => {
    getUser.mockRejectedValue(Object.assign(new Error("network"), { name: "AuthRetryableFetchError" }));

    maybeStartSessionRecovery(revokedSessionError());
    await flush();

    expect(signOut).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();

    // Rearmed by the fail-closed path — a subsequent call is not a no-op straggler.
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    signOut.mockResolvedValue({ error: null });
    maybeStartSessionRecovery(revokedSessionError());
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("an ambiguous (non-retryable, non-session-missing) getUser error fails closed too", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "SomeOtherAuthError" } });

    maybeStartSessionRecovery(revokedSessionError());
    await flush();

    expect(signOut).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("fail-closed: signOut itself failing does not toast, and rearms", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    signOut.mockResolvedValue({ error: new Error("signout failed") });

    maybeStartSessionRecovery(revokedSessionError());
    await flush();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();

    // Rearmed.
    signOut.mockResolvedValue({ error: null });
    maybeStartSessionRecovery(revokedSessionError());
    await flush();
    expect(signOut).toHaveBeenCalledTimes(2);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it("single-flight: N concurrent confirmed failures collapse into one signOut and one toast", async () => {
    let resolveGetUser: (v: unknown) => void;
    getUser.mockReturnValue(
      new Promise((resolve) => {
        resolveGetUser = resolve;
      }),
    );
    signOut.mockResolvedValue({ error: null });

    maybeStartSessionRecovery(revokedSessionError());
    maybeStartSessionRecovery(revokedSessionError());
    maybeStartSessionRecovery(revokedSessionError());

    resolveGetUser!({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    await flush();

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it("straggler: once disarmed after a completed cycle, a late failure is a no-op until rearm", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    signOut.mockResolvedValue({ error: null });

    maybeStartSessionRecovery(revokedSessionError());
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);

    // Straggler from the dead epoch — module stays disarmed.
    maybeStartSessionRecovery(revokedSessionError());
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledTimes(1);

    // useAuth re-arms on the next authenticated event; only then can recovery restart.
    rearmSessionRecovery();
    maybeStartSessionRecovery(revokedSessionError());
    await flush();
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("App.tsx wiring replica: routes both a query-shaped and mutation-shaped error the same way", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    signOut.mockResolvedValue({ error: null });

    const onCacheError = (error: unknown) => maybeStartSessionRecovery(error);

    onCacheError(revokedSessionError()); // simulates QueryCache.onError
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);

    rearmSessionRecovery();
    onCacheError(revokedSessionError()); // simulates MutationCache.onError
    await flush();
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});

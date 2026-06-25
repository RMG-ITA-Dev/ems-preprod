import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../useAuth";
import { supabase } from "@/integrations/supabase/client";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      setSession: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      if (table === 'staff') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { is_active: true },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (table === 'user_roles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        } as any;
      }
      throw new Error(`Unexpected table in useAuth test: ${table}`);
    }),
  },
}));

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );
}

// BUG 0514-115 (Codex P1 follow-up): signIn no longer calls the lockout RPCs
// from the client; it invokes the `secure-signin` edge function instead. The
// helper below routes mocked invoke calls per function name so each test can
// shape the secure-signin response without disturbing assign-user-role.
function mockInvoke(handlers: {
  "secure-signin"?: () => Promise<{ data: any; error: any }>;
  "assign-user-role"?: () => Promise<{ data: any; error: any }>;
}) {
  vi.mocked(supabase.functions.invoke).mockImplementation((name: string) => {
    const handler = handlers[name as keyof typeof handlers];
    if (handler) return handler() as any;
    return Promise.resolve({ data: null, error: null }) as any;
  });
}

function defaultSecureSigninSuccess() {
  return {
    data: {
      ok: true,
      session: {
        access_token: "token",
        refresh_token: "refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "user-123" },
      },
    },
    error: null,
  };
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: no session
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: {
        subscription: {
          id: "test",
          callback: vi.fn(),
          unsubscribe: vi.fn(),
        },
      },
    });

    // Default setSession: returns a valid session/user so signIn proceeds to
    // the staff/role checks unless a test overrides it.
    vi.mocked(supabase.auth.setSession).mockResolvedValue({
      data: {
        session: { access_token: "token", refresh_token: "refresh" } as any,
        user: { id: "user-123" } as any,
      },
      error: null,
    });

    // updatePassword still calls reset_login_attempts directly (post-recovery,
    // the user is authenticated and clears their own counter via the RPC's
    // jwt-email guard). Default to a no-op.
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
  });

  it("throws error when used outside AuthProvider", () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider");

    spy.mockRestore();
  });

  it("provides initial loading state", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBe(null);
    expect(result.current.session).toBe(null);
  });

  it("updates user state from session", async () => {
    const mockUser = { id: "user-123", email: "test@example.com" };
    const mockSession = {
      user: mockUser,
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 3600,
      token_type: "bearer",
    };

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession as any },
      error: null,
    });

    // Simulate onAuthStateChange callback
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      // Call immediately with session
      setTimeout(() => callback("SIGNED_IN", mockSession as any), 0);
      return {
        data: {
          subscription: {
            id: "test",
            callback,
            unsubscribe: vi.fn(),
          },
        },
      };
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Wait for session to load
    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user?.id).toBe("user-123");
  });

  it("signIn invokes secure-signin, installs the session, and assigns role", async () => {
    mockInvoke({
      "secure-signin": async () => defaultSecureSigninSuccess(),
      "assign-user-role": async () => ({
        data: { role: "staff", isFirstUser: false },
        error: null,
      }),
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Pass a non-normalized email — the client forwards it verbatim to the
    // edge function, which is responsible for normalization server-side.
    await act(async () => {
      const response = await result.current.signIn(" Test@Example.COM ", "password123");
      expect(response.error).toBe(null);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith("secure-signin", {
      body: { email: " Test@Example.COM ", password: "password123" },
    });

    // The session returned by the edge function is installed locally so
    // onAuthStateChange picks it up.
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: "token",
      refresh_token: "refresh",
    });

    // Role assignment still runs after a successful sign in.
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "assign-user-role",
      expect.any(Object),
    );

    // The client must NOT call signInWithPassword directly anymore — the
    // edge function owns that call so the lockout counter can only be
    // incremented in response to a real GoTrue failure.
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    // Same for the lockout RPCs: anon-execute was revoked, so the client
    // must never call them on the sign-in path.
    expect(supabase.rpc).not.toHaveBeenCalledWith("check_login_allowed", expect.anything());
    expect(supabase.rpc).not.toHaveBeenCalledWith("record_failed_login", expect.anything());
    expect(supabase.rpc).not.toHaveBeenCalledWith("reset_login_attempts", expect.anything());
  });

  it("signIn returns error on invalid credentials", async () => {
    mockInvoke({
      "secure-signin": async () => ({
        data: { ok: false, code: "INVALID_CREDENTIALS", message: "Invalid login credentials" },
        error: null,
      }),
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const response = await result.current.signIn("wrong@example.com", "wrong");
      expect(response.error?.message).toBe("Invalid login credentials");
    });

    // Session must not be installed on a failed sign in.
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it("signUp calls supabase signUp with metadata and assigns role", async () => {
    const mockSession = {
      user: { id: "user-123" },
      access_token: "token",
    };

    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: mockSession.user as any, session: mockSession as any },
      error: null,
    });

    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { role: "admin", isFirstUser: true },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const response = await result.current.signUp(
        "new@example.com",
        "password123",
        "John",
        "Doe"
      );
      expect(response.error).toBe(null);
      expect(response.roleData?.isFirstUser).toBe(true);
      expect(response.roleData?.role).toBe("admin");
    });

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "password123",
      options: expect.objectContaining({
        data: {
          first_name: "John",
          last_name: "Doe",
        },
      }),
    });

    // Should call assign-user-role after successful sign up
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "assign-user-role",
      expect.any(Object)
    );
  });

  it("signOut calls supabase signOut", async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("updatePassword calls supabase updateUser", async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const response = await result.current.updatePassword("newPassword123");
      expect(response.error).toBe(null);
    });

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({
      password: "newPassword123",
    });
  });

  it("updatePassword returns error on failure", async () => {
    const mockError = new Error("Password too weak");
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({
      data: { user: null },
      error: mockError as any,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const response = await result.current.updatePassword("weak");
      expect(response.error).toBeTruthy();
    });
  });

  it("updatePassword clears the lockout state on success (BUG 0514-115)", async () => {
    // Pass a non-normalized email on the mocked user to also prove
    // the email is lower-cased + trimmed before reaching the RPC.
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({
      data: { user: { id: "user-123", email: " User@Example.COM " } as any },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const response = await result.current.updatePassword("newPassword123");
      expect(response.error).toBe(null);
    });

    // After a successful password reset, the residual lockout row must be
    // cleared so the user can sign in immediately with the new password.
    // reset_login_attempts is still client-callable for authenticated users
    // (its jwt-email guard prevents abuse).
    expect(supabase.rpc).toHaveBeenCalledWith("reset_login_attempts", {
      p_email: "user@example.com",
    });
  });

  it("updatePassword does NOT clear lockout when the update itself failed (BUG 0514-115)", async () => {
    const mockError = new Error("Password too weak");
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({
      data: { user: null },
      error: mockError as any,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const response = await result.current.updatePassword("weak");
      expect(response.error).toBeTruthy();
    });

    expect(supabase.rpc).not.toHaveBeenCalledWith(
      "reset_login_attempts",
      expect.anything()
    );
  });

  it("resetPasswordForEmail calls supabase resetPasswordForEmail", async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const response = await result.current.resetPasswordForEmail("test@example.com");
      expect(response.error).toBe(null);
    });

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "test@example.com",
      expect.objectContaining({
        redirectTo: expect.stringContaining("/reset-password"),
      })
    );
  });

  it("resetPasswordForEmail returns error on failure", async () => {
    const mockError = new Error("Rate limited");
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: mockError as any,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const response = await result.current.resetPasswordForEmail("test@example.com");
      expect(response.error).toBeTruthy();
    });
  });
});

describe("signIn account lockout (BUG 0514-115)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: {
        subscription: {
          id: "test",
          callback: vi.fn(),
          unsubscribe: vi.fn(),
        },
      },
    });

    vi.mocked(supabase.auth.setSession).mockResolvedValue({
      data: {
        session: { access_token: "token", refresh_token: "refresh" } as any,
        user: { id: "user-123" } as any,
      },
      error: null,
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
  });

  it("AL-1: edge function pre-check surfaces ACCOUNT_LOCKED before any session is installed", async () => {
    mockInvoke({
      "secure-signin": async () => ({
        data: { ok: false, code: "ACCOUNT_LOCKED", remaining_seconds: 600 },
        error: null,
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await act(async () => {
      const response = await result.current.signIn("locked@example.com", "pw");
      expect(response.error?.message).toBe("ACCOUNT_LOCKED:600");
    });

    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it("AL-2: credential failure that trips the counter is reported as ACCOUNT_LOCKED", async () => {
    // The edge function decides whether the failure tripped the counter and
    // collapses both signals (pre-check locked, fail-trip locked) into the
    // same ACCOUNT_LOCKED response. The client just relays the duration.
    mockInvoke({
      "secure-signin": async () => ({
        data: { ok: false, code: "ACCOUNT_LOCKED", remaining_seconds: 900 },
        error: null,
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await act(async () => {
      const response = await result.current.signIn("user@example.com", "wrong");
      expect(response.error?.message).toBe("ACCOUNT_LOCKED:900");
    });

    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it("AL-3: credential failure below the threshold returns INVALID_CREDENTIALS", async () => {
    mockInvoke({
      "secure-signin": async () => ({
        data: { ok: false, code: "INVALID_CREDENTIALS", message: "Invalid login credentials" },
        error: null,
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await act(async () => {
      const response = await result.current.signIn("user@example.com", "wrong");
      expect(response.error?.message).toBe("Invalid login credentials");
    });
  });
});

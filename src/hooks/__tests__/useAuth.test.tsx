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

    // Default account-lockout RPCs to "allowed" / no-op (BUG 0514-115).
    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "check_login_allowed") {
        return Promise.resolve({ data: { allowed: true, remaining_seconds: 0 }, error: null }) as any;
      }
      return Promise.resolve({ data: null, error: null }) as any;
    });
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

  it("signIn calls supabase signInWithPassword and assigns role", async () => {
    const mockSession = {
      user: { id: "user-123" },
      access_token: "token",
    };
    
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: mockSession.user as any, session: mockSession as any },
      error: null,
    });
    
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { role: "staff", isFirstUser: false },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Pass a non-normalized email (with surrounding whitespace + mixed case) to
    // verify that signIn normalizes it before handing it to the lockout RPCs.
    await act(async () => {
      const response = await result.current.signIn(" Test@Example.COM ", "password123");
      expect(response.error).toBe(null);
    });

    // signInWithPassword still receives the raw email (GoTrue handles its own
    // case-folding); useAuth does not pre-trim the input for that call.
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: " Test@Example.COM ",
      password: "password123",
    });

    // Should call assign-user-role after successful sign in
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "assign-user-role",
      expect.any(Object)
    );

    // AL-4 (BUG 0514-115): successful login resets the failure counter
    // using the lower-cased, trimmed email — proves the normalization in signIn.
    expect(supabase.rpc).toHaveBeenCalledWith("reset_login_attempts", {
      p_email: "test@example.com",
    });
  });

  it("signIn returns error on failure", async () => {
    const mockError = new Error("Invalid credentials");
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: mockError as any,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const response = await result.current.signIn("wrong@example.com", "wrong");
      expect(response.error).toBeTruthy();
    });
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

    // Default: allowed + no-op for the other RPCs.
    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "check_login_allowed") {
        return Promise.resolve({ data: { allowed: true, remaining_seconds: 0 }, error: null }) as any;
      }
      return Promise.resolve({ data: null, error: null }) as any;
    });
  });

  it("AL-1: pre-check blocks before GoTrue when account is already locked", async () => {
    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "check_login_allowed") {
        return Promise.resolve({
          data: { allowed: false, remaining_seconds: 600 },
          error: null,
        }) as any;
      }
      return Promise.resolve({ data: null, error: null }) as any;
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await act(async () => {
      const response = await result.current.signIn("locked@example.com", "pw");
      expect(response.error?.message).toBe("ACCOUNT_LOCKED:600");
    });

    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("AL-2: credential failure surfaces lockout when counter trips", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" } as any,
    });

    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "check_login_allowed") {
        return Promise.resolve({ data: { allowed: true, remaining_seconds: 0 }, error: null }) as any;
      }
      if (fn === "record_failed_login") {
        return Promise.resolve({
          data: { locked: true, remaining_seconds: 900 },
          error: null,
        }) as any;
      }
      return Promise.resolve({ data: null, error: null }) as any;
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await act(async () => {
      const response = await result.current.signIn("user@example.com", "wrong");
      expect(response.error?.message).toBe("ACCOUNT_LOCKED:900");
    });
  });

  it("AL-3: credential failure below threshold returns the original error unchanged", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" } as any,
    });

    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "check_login_allowed") {
        return Promise.resolve({ data: { allowed: true, remaining_seconds: 0 }, error: null }) as any;
      }
      if (fn === "record_failed_login") {
        return Promise.resolve({
          data: { locked: false, remaining_seconds: 0 },
          error: null,
        }) as any;
      }
      return Promise.resolve({ data: null, error: null }) as any;
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await act(async () => {
      const response = await result.current.signIn("user@example.com", "wrong");
      expect(response.error?.message).toBe("Invalid login credentials");
    });
  });
});

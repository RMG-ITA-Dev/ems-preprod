import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserRole } from "../useUserRole";
import { supabase } from "@/integrations/supabase/client";

// Mock useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { useAuth } from "@/hooks/useAuth";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useUserRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123" } as any,
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updatePassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    });

    // Mock a pending query
    const mockMaybeSingle = vi.fn().mockImplementation(() => new Promise(() => {}));
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useUserRole(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("returns admin role correctly", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123" } as any,
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updatePassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    });

    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "role-1", user_id: "user-123", role: "admin" },
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useUserRole(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.role).toBe("admin");
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isStaff).toBe(false);
    expect(result.current.isViewer).toBe(false);
  });

  it("returns staff role correctly", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123" } as any,
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updatePassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    });

    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "role-1", user_id: "user-123", role: "staff" },
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useUserRole(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.role).toBe("staff");
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isStaff).toBe(true);
  });

  it("returns viewer role correctly", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123" } as any,
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updatePassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    });

    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "role-1", user_id: "user-123", role: "viewer" },
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useUserRole(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.role).toBe("viewer");
    expect(result.current.isViewer).toBe(true);
  });

  it("defaults to staff when no role found", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123" } as any,
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updatePassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    });

    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useUserRole(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.role).toBe("staff");
    expect(result.current.isRoleMissing).toBe(true);
    expect(result.current.hasError).toBe(false);
  });

  it("does not fetch when no user", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updatePassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    });

    const { result } = renderHook(() => useUserRole(), {
      wrapper: createWrapper(),
    });

    // Query should not be enabled, defaults to staff
    expect(result.current.role).toBe("staff");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

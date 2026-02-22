import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCurrentStaff } from "../useCurrentStaff";
import { supabase } from "@/integrations/supabase/client";

// Mock useAuth
vi.mock("../useAuth", () => ({
  useAuth: vi.fn(),
}));

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { useAuth } from "../useAuth";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCurrentStaff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no user is authenticated", async () => {
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

    const { result } = renderHook(() => useCurrentStaff(), {
      wrapper: createWrapper(),
    });

    // Query should not be enabled
    expect(result.current.staffRecord).toBeUndefined();
  });

  it("fetches staff record when user is authenticated", async () => {
    const mockUser = { id: "user-123", email: "test@example.com" };
    const mockStaff = {
      staff_id: "staff-456",
      first_name: "John",
      last_name: "Doe",
      auth_user_id: "user-123",
      category: { category_id: "1", category_name: "Manager" },
    };

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updatePassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    });

    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: mockStaff,
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useCurrentStaff(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.from).toHaveBeenCalledWith("staff");
    expect(mockEq).toHaveBeenCalledWith("auth_user_id", "user-123");
    expect(result.current.staffRecord?.first_name).toBe("John");
    expect(result.current.staffRecord?.last_name).toBe("Doe");
  });

  it("returns null when staff record not found", async () => {
    const mockUser = { id: "user-123", email: "test@example.com" };

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updatePassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    });

    const primaryMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const fallbackMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

    vi.mocked(supabase.from)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: primaryMaybeSingle }),
        }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({ maybeSingle: fallbackMaybeSingle }),
          }),
        }),
      } as any);

    const { result } = renderHook(() => useCurrentStaff(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.staffRecord).toBeNull();
  });

  it("handles errors gracefully", async () => {
    const mockUser = { id: "user-123", email: "test@example.com" };

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
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
      error: { message: "Database error" },
    });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useCurrentStaff(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("includes category in staff record", async () => {
    const mockUser = { id: "user-123", email: "test@example.com" };
    const mockStaff = {
      staff_id: "staff-456",
      first_name: "Jane",
      last_name: "Smith",
      auth_user_id: "user-123",
      category: {
        category_id: "cat-1",
        category_name: "Partner",
        display_order: 1,
      },
    };

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updatePassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    });

    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: mockStaff,
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useCurrentStaff(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.staffRecord?.category?.category_name).toBe("Partner");
  });
});

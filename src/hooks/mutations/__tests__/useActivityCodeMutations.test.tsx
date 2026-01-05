import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useCreateActivityCode,
  useUpdateActivityCode,
  useDeleteActivityCode,
} from "../useActivityCodeMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useActivityCodeMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateActivityCode", () => {
    it("calls supabase insert with correct data", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { activity_id: "123", activity_code: "AC001", description: "Test" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateActivityCode(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        activity_code: "AC001",
        description: "Test Activity",
        is_active: true,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("activity_codes");
      expect(mockInsert).toHaveBeenCalledWith({
        activity_code: "AC001",
        description: "Test Activity",
        is_active: true,
      });
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useUpdateActivityCode", () => {
    it("calls supabase update with correct id and data", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { activity_id: "123", activity_code: "AC002" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateActivityCode(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: "123",
        data: { activity_code: "AC002", description: "Updated" },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("activity_codes");
      expect(mockUpdate).toHaveBeenCalledWith({
        activity_code: "AC002",
        description: "Updated",
      });
      expect(mockEq).toHaveBeenCalledWith("activity_id", "123");
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useDeleteActivityCode", () => {
    it("calls supabase delete with correct id", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as any);

      const { result } = renderHook(() => useDeleteActivityCode(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("activity_codes");
      expect(mockEq).toHaveBeenCalledWith("activity_id", "123");
      expect(toast.success).toHaveBeenCalled();
    });
  });
});

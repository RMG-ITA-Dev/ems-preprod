import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "../useCategoryMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCategoryMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateCategory", () => {
    it("should create a category with all rate fields", async () => {
      const mockData = {
        category_id: "1",
        category_name: "Manager",
        rate_high_bob: 500,
        rate_low_bob: 300,
        rate_high_usd: 75,
        rate_low_usd: 50,
      };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateCategory(), {
        wrapper: createWrapper(),
      });

      const inputData = {
        category_name: "Manager",
        rate_high_bob: 500,
        rate_low_bob: 300,
        rate_high_usd: 75,
        rate_low_usd: 50,
      };

      result.current.mutate(inputData);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("categories");
      expect(mockInsert).toHaveBeenCalledWith(inputData);
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useUpdateCategory", () => {
    it("should update category fields", async () => {
      const mockData = { category_id: "1", category_name: "Senior Manager" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateCategory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "1", data: { category_name: "Senior Manager" } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("categories");
      expect(mockEq).toHaveBeenCalledWith("category_id", "1");
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useDeleteCategory", () => {
    it("should delete a category by id", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as any);

      const { result } = renderHook(() => useDeleteCategory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("cat-123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("categories");
      expect(mockEq).toHaveBeenCalledWith("category_id", "cat-123");
      expect(toast.success).toHaveBeenCalled();
    });
  });
});

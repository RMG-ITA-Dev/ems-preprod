import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateBudgetLine,
  useUpdateBudgetLine,
  useDeleteBudgetLine,
} from "../useBudgetLineMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useBudgetLineMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateBudgetLine", () => {
    it("calls supabase insert with budget line data", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          wo_line_id: "123",
          wo_id: "wo-1",
          category_id: "cat-1",
          budgeted_hours: 40,
          standard_rate: 100,
        },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateBudgetLine(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        wo_id: "wo-1",
        category_id: "cat-1",
        budgeted_hours: 40,
        standard_rate: 100,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("wo_budget_lines");
      expect(mockInsert).toHaveBeenCalledWith({
        wo_id: "wo-1",
        category_id: "cat-1",
        budgeted_hours: 40,
        standard_rate: 100,
      });
    });
  });

  describe("useUpdateBudgetLine", () => {
    it("calls supabase update with correct id and data", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { wo_line_id: "123", budgeted_hours: 60 },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateBudgetLine(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: "123",
        data: { budgeted_hours: 60, standard_rate: 150 },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("wo_budget_lines");
      expect(mockUpdate).toHaveBeenCalledWith({
        budgeted_hours: 60,
        standard_rate: 150,
      });
      expect(mockEq).toHaveBeenCalledWith("wo_line_id", "123");
    });

    it("updates category_id when provided", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { wo_line_id: "123" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateBudgetLine(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: "123",
        data: { category_id: "new-cat" },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ category_id: "new-cat" });
    });
  });

  describe("useDeleteBudgetLine", () => {
    it("calls supabase delete with correct id", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as any);

      const { result } = renderHook(() => useDeleteBudgetLine(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("line-123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("wo_budget_lines");
      expect(mockEq).toHaveBeenCalledWith("wo_line_id", "line-123");
    });
  });
});

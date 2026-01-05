import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateExpenseBudget,
  useUpdateExpenseBudget,
  useDeleteExpenseBudget,
} from "../useExpenseBudgetMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useExpenseBudgetMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateExpenseBudget", () => {
    it("calls supabase insert with expense budget data", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          wo_exp_id: "123",
          wo_id: "wo-1",
          expense_type_id: "exp-1",
          budgeted_amount: 5000,
        },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateExpenseBudget(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        wo_id: "wo-1",
        expense_type_id: "exp-1",
        budgeted_amount: 5000,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("wo_expense_budget");
      expect(mockInsert).toHaveBeenCalledWith({
        wo_id: "wo-1",
        expense_type_id: "exp-1",
        budgeted_amount: 5000,
      });
    });
  });

  describe("useUpdateExpenseBudget", () => {
    it("calls supabase update with correct id and data", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { wo_exp_id: "123", budgeted_amount: 7500 },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateExpenseBudget(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: "123",
        data: { budgeted_amount: 7500 },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("wo_expense_budget");
      expect(mockUpdate).toHaveBeenCalledWith({ budgeted_amount: 7500 });
      expect(mockEq).toHaveBeenCalledWith("wo_exp_id", "123");
    });

    it("updates expense_type_id when provided", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { wo_exp_id: "123" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateExpenseBudget(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: "123",
        data: { expense_type_id: "new-type" },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ expense_type_id: "new-type" });
    });
  });

  describe("useDeleteExpenseBudget", () => {
    it("calls supabase delete with correct id", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as any);

      const { result } = renderHook(() => useDeleteExpenseBudget(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("exp-123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("wo_expense_budget");
      expect(mockEq).toHaveBeenCalledWith("wo_exp_id", "exp-123");
    });
  });
});

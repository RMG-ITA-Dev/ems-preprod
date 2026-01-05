import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useCreateExpenseType,
  useUpdateExpenseType,
  useDeleteExpenseType,
} from "../useExpenseTypeMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useExpenseTypeMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateExpenseType", () => {
    it("calls supabase insert with expense type data", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { expense_type_id: "123", expense_name: "Travel" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateExpenseType(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        expense_name: "Travel",
        default_unit_cost: 100,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("expense_types");
      expect(mockInsert).toHaveBeenCalledWith({
        expense_name: "Travel",
        default_unit_cost: 100,
      });
      expect(toast.success).toHaveBeenCalled();
    });

    it("handles expense type without default_unit_cost", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { expense_type_id: "123", expense_name: "Other" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateExpenseType(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ expense_name: "Other" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockInsert).toHaveBeenCalledWith({ expense_name: "Other" });
    });
  });

  describe("useUpdateExpenseType", () => {
    it("calls supabase update with correct id and data", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { expense_type_id: "123", expense_name: "Updated" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateExpenseType(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: "123",
        data: { expense_name: "Updated", default_unit_cost: 200 },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("expense_types");
      expect(mockUpdate).toHaveBeenCalledWith({
        expense_name: "Updated",
        default_unit_cost: 200,
      });
      expect(mockEq).toHaveBeenCalledWith("expense_type_id", "123");
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useDeleteExpenseType", () => {
    it("calls supabase delete with correct id", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as any);

      const { result } = renderHook(() => useDeleteExpenseType(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("456");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("expense_types");
      expect(mockEq).toHaveBeenCalledWith("expense_type_id", "456");
      expect(toast.success).toHaveBeenCalled();
    });
  });
});

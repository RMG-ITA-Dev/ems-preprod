import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUpdateTimeEntry, useUpdateExpenseLog } from "../useAdminMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAdminMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useUpdateTimeEntry", () => {
    it("calls supabase update with time entry data", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { time_id: "123", hours_logged: 8 },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateTimeEntry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        time_id: "123",
        hours_logged: 8,
        description: "Updated work",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("time_entries");
      expect(mockUpdate).toHaveBeenCalledWith({
        hours_logged: 8,
        description: "Updated work",
      });
      expect(mockEq).toHaveBeenCalledWith("time_id", "123");
      expect(toast.success).toHaveBeenCalled();
    });

    it("updates date_worked when provided", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { time_id: "123" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateTimeEntry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        time_id: "123",
        date_worked: "2024-01-15",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ date_worked: "2024-01-15" });
    });

    it("handles null description", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { time_id: "123" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateTimeEntry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        time_id: "123",
        description: null,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ description: null });
    });
  });

  describe("useUpdateExpenseLog", () => {
    it("calls supabase update with expense log data", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { expense_log_id: "456", amount: 150 },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateExpenseLog(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        expense_log_id: "456",
        amount: 150,
        currency: "USD",
        description: "Travel expense",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("expense_logs");
      expect(mockUpdate).toHaveBeenCalledWith({
        amount: 150,
        currency: "USD",
        description: "Travel expense",
      });
      expect(mockEq).toHaveBeenCalledWith("expense_log_id", "456");
      expect(toast.success).toHaveBeenCalled();
    });

    it("updates date_incurred when provided", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { expense_log_id: "456" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateExpenseLog(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        expense_log_id: "456",
        date_incurred: "2024-01-15",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ date_incurred: "2024-01-15" });
    });

    it("updates receipt_url when provided", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { expense_log_id: "456" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateExpenseLog(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        expense_log_id: "456",
        receipt_url: "https://storage.example.com/receipt.pdf",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({
        receipt_url: "https://storage.example.com/receipt.pdf",
      });
    });
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateWorkOrder,
  useUpdateWorkOrder,
  useSubmitWorkOrder,
  useApproveWorkOrder,
  useRejectWorkOrder,
} from "../useWorkOrderMutations";

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

describe("useWorkOrderMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateWorkOrder", () => {
    it("should create a work order with required fields", async () => {
      const mockData = {
        wo_id: "wo-1",
        engagement_id: "eng-1",
        currency: "USD",
        season_mode: "high",
        tax_rate: 13,
      };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateWorkOrder(), {
        wrapper: createWrapper(),
      });

      const inputData = {
        engagement_id: "eng-1",
        currency: "USD",
        season_mode: "high",
        tax_rate: 13,
      };

      result.current.mutate(inputData);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("work_orders");
      expect(mockInsert).toHaveBeenCalledWith(inputData);
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useSubmitWorkOrder", () => {
    it("should update approval_status to Pending_Approval", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Pending_Approval" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useSubmitWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("wo-1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("work_orders");
      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Pending_Approval" });
      expect(mockEq).toHaveBeenCalledWith("wo_id", "wo-1");
      expect(toast.success).toHaveBeenCalled();
    });

    it("should not touch notes on resubmit", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Pending_Approval" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useSubmitWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("wo-1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload).toHaveProperty("approval_status", "Pending_Approval");
      expect(payload).not.toHaveProperty("notes");
    });
  });

  describe("useApproveWorkOrder", () => {
    it("should set approval_status to Approved with approver info", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Approved" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useApproveWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", staffId: "staff-1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("work_orders");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          approval_status: "Approved",
          approved_by: "staff-1",
        })
      );
      expect(toast.success).toHaveBeenCalled();
    });

    it("should clear notes on approve", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Approved" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useApproveWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", staffId: "staff-1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ approval_status: "Approved", notes: null })
      );
    });
  });

  describe("useRejectWorkOrder", () => {
    it("should set approval_status to Rejected", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRejectWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("work_orders");
      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Rejected", notes: null });
      expect(toast.success).toHaveBeenCalled();
    });

    it("should save trimmed notes when provided", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRejectWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", notes: "Falta CEAC" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Rejected", notes: "Falta CEAC" });
    });

    it("should set notes to null when note is whitespace-only", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRejectWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", notes: "   " });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Rejected", notes: null });
    });
  });
});

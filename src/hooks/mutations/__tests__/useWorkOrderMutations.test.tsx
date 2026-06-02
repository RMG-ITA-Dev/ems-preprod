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
    it("should update approval_status to Pending_Approval and persist risk fields", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Pending_Approval" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useSubmitWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        woId: "wo-1",
        ceacCompletedAt: "2026-05-01",
        ceacNotes: "OK",
        sanCompletedAt: "2026-04-15",
        sanNotes: null,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("work_orders");
      expect(mockUpdate).toHaveBeenCalledWith({
        approval_status: "Pending_Approval",
        ceac_completed_at: "2026-05-01",
        ceac_notes: "OK",
        san_completed_at: "2026-04-15",
        san_notes: null,
      });
      expect(mockEq).toHaveBeenCalledWith("wo_id", "wo-1");
      expect(toast.success).toHaveBeenCalled();
    });

    it("should persist null risk fields when not provided", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Pending_Approval" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useSubmitWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({
        approval_status: "Pending_Approval",
        ceac_completed_at: null,
        ceac_notes: null,
        san_completed_at: null,
        san_notes: null,
      });
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
      expect(mockUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({ ceac_completed_at: expect.anything() })
      );
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useRejectWorkOrder", () => {
    it("should set approval_status back to Draft", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRejectWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("wo-1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("work_orders");
      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Draft" });
      expect(toast.success).toHaveBeenCalled();
    });
  });
});

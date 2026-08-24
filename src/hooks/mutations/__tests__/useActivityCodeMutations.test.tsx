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
  useDeactivateServiceActivity,
  useReactivateServiceActivity,
  useReorderServiceActivity,
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

  // ── Vinculada (service-linked) path — the only path since 0817-177 ──────
  describe("useCreateActivityCode — vinculada (practica_id required)", () => {
    it("calls supabase.rpc('create_practice_activity') with the required practica_id", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: { activity_id: "456" }, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useCreateActivityCode(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        practica_id: "svc-uuid",
        description: "Audit Planning",
        entity_type: "A",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith("create_practice_activity", {
        p_practice_id:  "svc-uuid",
        p_description: "Audit Planning",
        p_entity_type: "A",
      });
      expect(toast.success).toHaveBeenCalled();
    });

    it("does NOT call supabase.from() when practica_id is provided", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: { activity_id: "456" }, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useCreateActivityCode(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        practica_id: "svc-uuid",
        description: "Review",
        entity_type: "A",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  // ── useUpdateActivityCode ────────────────────────────────────────────────
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
      expect(mockUpdate).toHaveBeenCalledWith({ activity_code: "AC002", description: "Updated" });
      expect(mockEq).toHaveBeenCalledWith("activity_id", "123");
      expect(toast.success).toHaveBeenCalled();
    });
  });

  // ── useDeleteActivityCode ────────────────────────────────────────────────
  describe("useDeleteActivityCode", () => {
    it("calls supabase.delete() with correct id (heredada path)", async () => {
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

  // ── useDeactivateServiceActivity ─────────────────────────────────────────
  describe("useDeactivateServiceActivity", () => {
    it("calls supabase.rpc('deactivate_practice_activity') with the activity id", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useDeactivateServiceActivity(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("activity-uuid");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith("deactivate_practice_activity", {
        p_activity_id: "activity-uuid",
      });
      expect(toast.success).toHaveBeenCalled();
    });
  });

  // ── useReactivateServiceActivity ─────────────────────────────────────────
  describe("useReactivateServiceActivity", () => {
    it("calls supabase.rpc('reactivate_practice_activity') with the activity id", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useReactivateServiceActivity(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("activity-uuid");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith("reactivate_practice_activity", {
        p_activity_id: "activity-uuid",
      });
      expect(toast.success).toHaveBeenCalled();
    });
  });

  // ── useReorderServiceActivity ────────────────────────────────────────────
  describe("useReorderServiceActivity", () => {
    it("calls supabase.rpc('reorder_practice_activity') with activity id and position", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useReorderServiceActivity(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ activityId: "activity-uuid", newPosition: 3 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith("reorder_practice_activity", {
        p_activity_id: "activity-uuid",
        p_new_position: 3,
      });
      expect(toast.success).toHaveBeenCalled();
    });
  });
});

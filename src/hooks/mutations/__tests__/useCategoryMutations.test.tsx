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
  useMoveCategory,
  useCopyCategories,
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
    it("routes to create_category_for_service RPC with service_id and order", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: { category_id: "1" }, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useCreateCategory(), { wrapper: createWrapper() });

      result.current.mutate({
        service_id: "svc-aud",
        category_name: "Manager",
        display_order: 3,
        rate_high_bob: 500,
        rate_low_bob: 300,
        rate_high_usd: 75,
        rate_low_usd: 50,
        can_approve_wo: true,
        can_approve_timesheets: false,
        default_app_role: null,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_category_for_service",
        expect.objectContaining({
          p_service_id: "svc-aud",
          p_category_name: "Manager",
          p_display_order: 3,
          p_rate_high_bob: 500,
          p_can_approve_wo: true,
        })
      );
      expect(toast.success).toHaveBeenCalled();
    });

    it("passes null p_display_order when order is omitted (append)", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: { category_id: "1" }, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useCreateCategory(), { wrapper: createWrapper() });

      result.current.mutate({
        service_id: "svc-aud",
        category_name: "Senior",
        rate_high_bob: 1,
        rate_low_bob: 1,
        rate_high_usd: 1,
        rate_low_usd: 1,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_category_for_service",
        expect.objectContaining({ p_display_order: null })
      );
    });
  });

  describe("useUpdateCategory", () => {
    it("routes to update_category_for_service RPC (never sends a service)", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: { category_id: "1" }, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useUpdateCategory(), { wrapper: createWrapper() });

      result.current.mutate({
        id: "cat-1",
        data: {
          category_name: "Senior Manager",
          display_order: 2,
          rate_high_bob: 500,
          rate_low_bob: 300,
          rate_high_usd: 75,
          rate_low_usd: 50,
          can_approve_wo: false,
          can_approve_timesheets: true,
          default_app_role: null,
        },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith(
        "update_category_for_service",
        expect.objectContaining({
          p_category_id: "cat-1",
          p_category_name: "Senior Manager",
          p_display_order: 2,
        })
      );
      // The service is immutable — no service param may be sent.
      const payload = mockRpc.mock.calls[0][1];
      expect(payload).not.toHaveProperty("p_service_id");
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useDeleteCategory", () => {
    it("routes to delete_category_for_service RPC (compacts order, no hole)", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useDeleteCategory(), { wrapper: createWrapper() });

      result.current.mutate("cat-123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith("delete_category_for_service", {
        p_category_id: "cat-123",
      });
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useMoveCategory", () => {
    it("routes to move_category RPC with id and new position", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useMoveCategory(), { wrapper: createWrapper() });

      result.current.mutate({ categoryId: "cat-1", newPosition: 2 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith("move_category", {
        p_category_id: "cat-1",
        p_new_position: 2,
      });
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useCopyCategories", () => {
    it("routes to copy_categories_between_services with source, target and replace", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: 5, error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useCopyCategories(), { wrapper: createWrapper() });

      result.current.mutate({ sourceServiceId: "svc-aud", targetServiceId: "svc-tax", replace: true });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith("copy_categories_between_services", {
        p_source_service_id: "svc-aud",
        p_target_service_id: "svc-tax",
        p_replace: true,
      });
      expect(toast.success).toHaveBeenCalled();
    });

    it("stays silent (no toast) when the target is not empty", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "target_not_empty" } });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useCopyCategories(), { wrapper: createWrapper() });

      result.current.mutate({ sourceServiceId: "svc-aud", targetServiceId: "svc-tax", replace: false });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("surfaces a specific error when the target is referenced", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "target_referenced" } });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc as any);

      const { result } = renderHook(() => useCopyCategories(), { wrapper: createWrapper() });

      result.current.mutate({ sourceServiceId: "svc-aud", targetServiceId: "svc-tax", replace: true });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("category.targetReferenced");
    });
  });
});

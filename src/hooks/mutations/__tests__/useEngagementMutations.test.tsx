import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateEngagement,
  useUpdateEngagement,
  useDeleteEngagement,
} from "../useEngagementMutations";

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

describe("useEngagementMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateEngagement", () => {
    it("should create an engagement with required fields", async () => {
      const mockData = {
        engagement_id: "eng-1",
        engagement_name: "Audit 2024",
        client_id: "client-1",
      };
      vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

      const { result } = renderHook(() => useCreateEngagement(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        engagement_name: "Audit 2024",
        client_id: "client-1",
        oficina: 1,
        practica: 2,
        funcion: 1,
        society_id: "soc-1",
        anio_fiscal: 2027,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_engagement_with_code",
        expect.objectContaining({
          p_engagement_name: "Audit 2024",
          p_client_id: "client-1",
          p_oficina: 1,
          p_practica: 2,
          p_funcion: 1,
          p_society_id: "soc-1",
          p_anio_fiscal: 2027,
          p_taxonomy_id: null,
        })
      );
      expect(supabase.from).not.toHaveBeenCalledWith("engagements");
      expect(toast.success).toHaveBeenCalled();
    });

    it("should create an engagement with optional fields", async () => {
      const mockData = {
        engagement_id: "eng-1",
        engagement_name: "Audit 2024",
        client_id: "client-1",
        partner_id: "staff-1",
        manager_id: "staff-2",
        status: "active",
      };
      vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

      const { result } = renderHook(() => useCreateEngagement(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        engagement_name: "Audit 2024",
        client_id: "client-1",
        oficina: 1,
        practica: 2,
        funcion: 1,
        society_id: "soc-1",
        anio_fiscal: 2027,
        partner_id: "staff-1",
        manager_id: "staff-2",
        status: "active",
        taxonomy_id: "tax-1",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_engagement_with_code",
        expect.objectContaining({
          p_engagement_name: "Audit 2024",
          p_client_id: "client-1",
          p_oficina: 1,
          p_practica: 2,
          p_funcion: 1,
          p_society_id: "soc-1",
          p_anio_fiscal: 2027,
          p_taxonomy_id: "tax-1",
        })
      );
    });
  });

  describe("useUpdateEngagement", () => {
    it("should update engagement fields", async () => {
      const mockData = { engagement_id: "1", status: "completed" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateEngagement(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "1", data: { status: "completed" } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("engagements");
      expect(mockEq).toHaveBeenCalledWith("engagement_id", "1");
      expect(toast.success).toHaveBeenCalled();
    });

    // 0722-157: Sociedad is now editable by Admin after creation — EngagementForm gates
    // society_id to admin-only, but the mutation itself just passes whatever it's given
    // straight to Supabase (the gate lives in the caller).
    it("passes society_id through unchanged to the update payload", async () => {
      const mockData = { engagement_id: "1", society_id: "soc-2" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateEngagement(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "1", data: { society_id: "soc-2" } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ society_id: "soc-2" }));
    });
  });

  describe("useDeleteEngagement", () => {
    // El delete lleva `.select()` para saber si RLS lo bloqueó: cuando lo hace,
    // Postgres NO devuelve error, simplemente afecta 0 filas.
    const mockDeleteChain = (result: { data: unknown; error: unknown }) => {
      const mockSelect = vi.fn().mockResolvedValue(result);
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as any);
      return { mockEq, mockSelect };
    };

    it("should delete an engagement by id", async () => {
      const { mockEq } = mockDeleteChain({ data: [{ engagement_id: "eng-123" }], error: null });

      const { result } = renderHook(() => useDeleteEngagement(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("eng-123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("engagements");
      expect(mockEq).toHaveBeenCalledWith("engagement_id", "eng-123");
      expect(toast.success).toHaveBeenCalled();
    });

    it("fails instead of reporting success when RLS blocks the delete (0 rows, no error)", async () => {
      mockDeleteChain({ data: [], error: null });

      const { result } = renderHook(() => useDeleteEngagement(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("eng-123");

      await waitFor(() => expect(result.current.isError).toBe(true));

      // El bug original: mostraba "eliminado exitosamente" con el encargo intacto.
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});

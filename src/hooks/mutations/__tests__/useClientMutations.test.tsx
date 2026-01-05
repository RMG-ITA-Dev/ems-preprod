import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
} from "../useClientMutations";

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

describe("useClientMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateClient", () => {
    it("should create a client with required fields", async () => {
      const mockData = {
        client_id: "client-1",
        client_legal_name: "Acme Corp",
        unique_tax_id: "123456789",
      };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateClient(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        client_legal_name: "Acme Corp",
        unique_tax_id: "123456789",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("clients");
      expect(toast.success).toHaveBeenCalled();
    });

    it("should create a client with optional fields", async () => {
      const mockData = {
        client_id: "client-1",
        client_legal_name: "Acme Corp",
        unique_tax_id: "123456789",
        contact_name: "John Doe",
        contact_email: "john@acme.com",
      };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateClient(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        client_legal_name: "Acme Corp",
        unique_tax_id: "123456789",
        contact_name: "John Doe",
        contact_email: "john@acme.com",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("clients");
    });
  });

  describe("useUpdateClient", () => {
    it("should update client fields", async () => {
      const mockData = { client_id: "1", client_legal_name: "Updated Corp" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateClient(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "1", data: { client_legal_name: "Updated Corp" } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("clients");
      expect(mockEq).toHaveBeenCalledWith("client_id", "1");
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useDeleteClient", () => {
    it("should delete a client by id", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as any);

      const { result } = renderHook(() => useDeleteClient(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("client-123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("clients");
      expect(mockEq).toHaveBeenCalledWith("client_id", "client-123");
      expect(toast.success).toHaveBeenCalled();
    });
  });
});

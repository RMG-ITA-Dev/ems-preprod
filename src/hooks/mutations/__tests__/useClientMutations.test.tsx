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
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
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
      // Se envía el payload sin RETURNING: insert() se resuelve solo.
      expect(mockInsert).toHaveBeenCalledWith({
        client_legal_name: "Acme Corp",
        unique_tax_id: "123456789",
      });
      expect(toast.success).toHaveBeenCalled();
    });

    it("should create a client with optional fields", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
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

  describe("duplicate client name handling (BUG 0220-18)", () => {
    it("shows duplicateClientName toast on 23505 with clients_client_legal_name_unique", async () => {
      const error = {
        code: "23505",
        message: "duplicate key value violates unique constraint",
        constraint: "clients_client_legal_name_unique",
      };
      // El insert ya no encadena .select(): el RETURNING hacía fallar la creación
      // para los roles con alcance 'assigned_clients'. Resuelve directo.
      const mockInsert = vi.fn().mockResolvedValue({ error });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateClient(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        client_legal_name: "Duplicate Corp",
        unique_tax_id: "999",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("errors.duplicateClientName");
    });

    it("shows duplicateNit toast on 23505 with clients_unique_tax_id_key", async () => {
      const error = {
        code: "23505",
        message: "duplicate key value violates unique constraint",
        constraint: "clients_unique_tax_id_key",
      };
      // El insert ya no encadena .select(): el RETURNING hacía fallar la creación
      // para los roles con alcance 'assigned_clients'. Resuelve directo.
      const mockInsert = vi.fn().mockResolvedValue({ error });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateClient(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        client_legal_name: "Some Corp",
        unique_tax_id: "DUPLICATE-NIT",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("errors.duplicateNit");
    });

    it("falls back to generic error handler for non-23505 errors", async () => {
      const error = {
        code: "42501",
        message: "permission denied",
      };
      // El insert ya no encadena .select(): el RETURNING hacía fallar la creación
      // para los roles con alcance 'assigned_clients'. Resuelve directo.
      const mockInsert = vi.fn().mockResolvedValue({ error });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateClient(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        client_legal_name: "Test",
        unique_tax_id: "123",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      // Should NOT call toast.error with duplicate-specific messages
      expect(toast.error).not.toHaveBeenCalledWith("errors.duplicateClientName");
      expect(toast.error).not.toHaveBeenCalledWith("errors.duplicateNit");
    });

    it("falls back to generic error handler for 23505 with unknown constraint", async () => {
      const error = {
        code: "23505",
        message: "duplicate key value violates unique constraint",
        constraint: "some_other_constraint",
      };
      // El insert ya no encadena .select(): el RETURNING hacía fallar la creación
      // para los roles con alcance 'assigned_clients'. Resuelve directo.
      const mockInsert = vi.fn().mockResolvedValue({ error });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateClient(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        client_legal_name: "Test",
        unique_tax_id: "123",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).not.toHaveBeenCalledWith("errors.duplicateClientName");
      expect(toast.error).not.toHaveBeenCalledWith("errors.duplicateNit");
    });
  });
});

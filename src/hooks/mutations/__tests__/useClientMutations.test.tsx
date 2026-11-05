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
  useSaveClientWithContacts,
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
        tax_id: "123456789",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("clients");
      // Se envía el payload sin RETURNING: insert() se resuelve solo.
      expect(mockInsert).toHaveBeenCalledWith({
        client_legal_name: "Acme Corp",
        tax_id: "123456789",
      });
      expect(toast.success).toHaveBeenCalled();
    });

    it("should create a client with optional fields", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateClient(), {
        wrapper: createWrapper(),
      });

      // Cobranzas Fase 5: el contacto salió de la ficha (ahora vive en client_contacts y se
      // guarda con save_client_contacts). El alta en cambio ACEPTA client_id, porque no puede
      // devolver la fila creada y quien la llama necesita el id para los contactos.
      result.current.mutate({
        client_id: "11111111-1111-4111-8111-111111111111",
        client_legal_name: "Acme Corp",
        tax_id: "123456789",
        address: "Av. Siempre Viva 742",
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

  // 1028-211: NIT y razón social ya no son únicos (ETL retiró las dos constraints), así que no
  // hay toasts de duplicado: todo error de cliente va al manejador genérico.
  describe("errores de cliente: manejador genérico", () => {
    it("un 23505 (de cualquier constraint) cae en el manejador genérico", async () => {
      const error = {
        code: "23505",
        message: "duplicate key value violates unique constraint",
        constraint: "some_other_constraint",
      };
      const mockInsert = vi.fn().mockResolvedValue({ error });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateClient(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        client_legal_name: "Test",
        tax_id: "123",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("Error creating client", expect.anything());
    });

    it("un error que no es 23505 también cae en el manejador genérico", async () => {
      const error = {
        code: "42501",
        message: "permission denied",
      };
      const mockInsert = vi.fn().mockResolvedValue({ error });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateClient(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        client_legal_name: "Test",
        tax_id: "123",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("Error creating client", expect.anything());
    });
  });

  // 1028-211: en save_client_with_contacts, una clave AUSENTE conserva el valor guardado y `null`
  // lo limpia. El hook tiene que reenviar el payload tal cual, sin rellenar ni quitar claves.
  describe("useSaveClientWithContacts — industry_id", () => {
    const contacts = [
      { contact_type: "general" as const, full_name: "Ana", email: "ana@x.com" },
      { contact_type: "cobranza" as const, full_name: "Luis", email: "luis@x.com" },
    ];

    it("reenvía industry_id = null a la RPC", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
      const { result } = renderHook(() => useSaveClientWithContacts(), { wrapper: createWrapper() });

      result.current.mutate({
        clientId: "c-1",
        isNew: false,
        client: { client_legal_name: "Acme", tax_id: "99001", industry_id: null },
        contacts,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const [fn, args] = vi.mocked(supabase.rpc).mock.calls[0] as [string, Record<string, any>];
      expect(fn).toBe("save_client_with_contacts");
      expect(args.p_client).toHaveProperty("industry_id", null);
    });

    it("no agrega industry_id cuando no viene", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
      const { result } = renderHook(() => useSaveClientWithContacts(), { wrapper: createWrapper() });

      result.current.mutate({
        clientId: "c-1",
        isNew: false,
        client: { client_legal_name: "Acme", tax_id: "99001" },
        contacts,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const [, args] = vi.mocked(supabase.rpc).mock.calls[0] as [string, Record<string, any>];
      expect(args.p_client).not.toHaveProperty("industry_id");
    });
  });
});

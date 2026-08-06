import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler, handleError, ErrorCode } from "@/lib/error-handler";
import i18n from "@/i18n";

// Handle duplicate constraint errors with structured matching
function handleClientError(error: Error, operation: string) {
  const err = error as unknown as {
    code?: string;
    message?: string;
    constraint?: string;
    details?: string;
  };

  if (err.code === "23505") {
    // Prefer err.constraint when available; fall back to message.includes()
    const constraintName = err.constraint || err.message || "";

    if (constraintName.includes("clients_client_legal_name_unique")) {
      toast.error(i18n.t("errors.duplicateClientName"));
      return;
    }
    if (constraintName.includes("clients_unique_tax_id_key")) {
      toast.error(i18n.t("errors.duplicateNit"));
      return;
    }
  }

  createMutationErrorHandler(operation)(error);
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      client_legal_name: string;
      unique_tax_id: string;
      industry_id?: string;
      contact_name?: string;
      contact_email?: string;
      contact_phone?: string;
      address?: string;
      is_active?: boolean;
    }) => {
      // Sin `.select()` a propósito: el RETURNING obliga a que la fila nueva pase
      // la política de LECTURA de clients, que para los roles con alcance
      // 'assigned_clients' exige is_assigned_to_client() — imposible de cumplir
      // para un cliente que acaba de nacer y todavía no tiene ningún encargo.
      // Con RETURNING, la creación fallaba para Socio, SQR, Director, Gerente y
      // los Gerentes Especialistas ITA/TAX. Nadie consume la fila devuelta:
      // ClientForm descarta el resultado y ClientNew navega a /clients.
      const { error } = await supabase.from("clients").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.client") }));
    },
    onError: (error) => handleClientError(error, "creating client"),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        client_legal_name: string;
        unique_tax_id: string;
        industry_id: string;
        contact_name: string;
        contact_email: string;
        contact_phone: string;
        address: string;
        is_active: boolean;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("clients")
        .update(data)
        .eq("client_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.client") }));
    },
    onError: (error) => handleClientError(error, "updating client"),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("client_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.client") }));
    },
    onError: createMutationErrorHandler("deleting client"),
  });
}

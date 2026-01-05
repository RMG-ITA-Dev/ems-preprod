import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

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
      const { data: result, error } = await supabase
        .from("clients")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.client") }));
    },
    onError: createMutationErrorHandler("creating client"),
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
    onError: createMutationErrorHandler("updating client"),
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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useCreateActivityCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { activity_code: string; description: string; is_active?: boolean }) => {
      const { data: result, error } = await supabase
        .from("activity_codes")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity_codes"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.activityCode") }));
    },
    onError: createMutationErrorHandler("creating activity code"),
  });
}

export function useUpdateActivityCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ activity_code: string; description: string; is_active: boolean }>;
    }) => {
      const { data: result, error } = await supabase
        .from("activity_codes")
        .update(data)
        .eq("activity_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity_codes"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.activityCode") }));
    },
    onError: createMutationErrorHandler("updating activity code"),
  });
}

export function useDeleteActivityCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("activity_codes").delete().eq("activity_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity_codes"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.activityCode") }));
    },
    onError: createMutationErrorHandler("deleting activity code"),
  });
}

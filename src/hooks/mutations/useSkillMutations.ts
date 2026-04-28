import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; category: string; is_active?: boolean }) => {
      const { data: result, error } = await supabase
        .from("skills")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.skill") }));
    },
    onError: createMutationErrorHandler("creating skill"),
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ name: string; category: string; is_active: boolean }>;
    }) => {
      const { data: result, error } = await supabase
        .from("skills")
        .update(data)
        .eq("skill_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.skill") }));
    },
    onError: createMutationErrorHandler("updating skill"),
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("skills").delete().eq("skill_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.skill") }));
    },
    onError: createMutationErrorHandler("deleting skill"),
  });
}

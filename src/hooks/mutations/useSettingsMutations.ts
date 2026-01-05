import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useUpdateGlobalSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data: result, error } = await supabase
        .from("global_settings")
        .update({ setting_value: value })
        .eq("setting_key", key)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global_settings"] });
      toast.success(i18n.t("messages.settingsSaved"));
    },
    onError: createMutationErrorHandler("updating setting"),
  });
}

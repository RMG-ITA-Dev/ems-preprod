import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";
import type { StaffSkillInsert, StaffSkillUpdate } from "@/integrations/supabase/customTypes";

function handleCompetencyError(error: Error) {
  const err = error as unknown as { code?: string };
  if (err.code === "23505") {
    toast.error(i18n.t("staff.competencies.errors.alreadyAssigned"));
    return;
  }
  createMutationErrorHandler("managing staff competency")(error);
}

export function useCreateStaffCompetency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: StaffSkillInsert) => {
      const { data: result, error } = await supabase
        .from("staff_skills")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff_full"] });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: handleCompetencyError,
  });
}

export function useUpdateStaffCompetency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: StaffSkillUpdate }) => {
      const { data: result, error } = await supabase
        .from("staff_skills")
        .update(data)
        .eq("staff_skill_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff_full"] });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: handleCompetencyError,
  });
}

export function useDeleteStaffCompetency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (staffSkillId: string) => {
      const { error } = await supabase
        .from("staff_skills")
        .delete()
        .eq("staff_skill_id", staffSkillId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff_full"] });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: createMutationErrorHandler("deleting staff competency"),
  });
}

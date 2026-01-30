import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

// BUG #15: Handle duplicate email error specifically
function handleStaffError(error: Error, operation: string) {
  const err = error as unknown as { code?: string; message?: string };
  
  // Check for unique constraint violation on email
  if (err.code === "23505" && err.message?.includes("email")) {
    toast.error(i18n.t("errors.duplicateEmail"));
    return;
  }
  
  // Fall back to default error handling
  createMutationErrorHandler(operation)(error);
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      first_name: string;
      last_name: string;
      email?: string;
      category_id?: string;
      is_active?: boolean;
    }) => {
      const { data: result, error } = await supabase
        .from("staff")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.staffMember") }));
    },
    onError: (error) => handleStaffError(error, "creating staff member"),
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        first_name: string;
        last_name: string;
        email: string;
        category_id: string;
        is_active: boolean;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("staff")
        .update(data)
        .eq("staff_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.staffMember") }));
    },
    onError: createMutationErrorHandler("updating staff member"),
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").delete().eq("staff_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.staffMember") }));
    },
    onError: createMutationErrorHandler("deleting staff member"),
  });
}

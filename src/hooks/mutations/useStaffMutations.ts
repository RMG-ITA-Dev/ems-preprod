import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

// Constraint-name-based error detection + custom DB trigger exceptions
function handleStaffError(error: Error, operation: string) {
  const err = error as unknown as { code?: string; message?: string };
  const msg = err.message || "";

  // Unique constraint violations (23505) — match index/constraint names
  if (err.code === "23505") {
    if (msg.includes("idx_staff_email_unique") || msg.includes("staff_email_key")) {
      toast.error(i18n.t("errors.duplicateEmail"));
      return;
    }
    if (msg.includes("idx_staff_id_number_unique")) {
      toast.error(i18n.t("errors.duplicateIdNumber"));
      return;
    }
  }

  // Custom DB trigger exceptions
  if (msg.includes("REACTIVATION_BLOCKED")) {
    toast.error(i18n.t("errors.noReingreso"));
    return;
  }
  if (msg.includes("TERMINATION_DATE_BLOCKED")) {
    toast.error(i18n.t("errors.afterTerminationDate"));
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
      short_name?: string;
      initials?: string;
      email?: string;
      category_id?: string;
      city?: string;
      id_number?: string;
      aud_reg_number?: string;
      is_active?: boolean;
      hire_date?: string | null;
      termination_date?: string | null;
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
      queryClient.invalidateQueries({ queryKey: ["staff_full"] });
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
        short_name: string;
        initials: string;
        email: string;
        category_id: string;
        city: string;
        id_number: string;
        aud_reg_number: string;
        is_active: boolean;
        hire_date: string | null;
        termination_date: string | null;
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
      queryClient.invalidateQueries({ queryKey: ["staff_full"] });
      queryClient.invalidateQueries({ queryKey: ["current_staff"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.staffMember") }));
    },
    onError: (error) => handleStaffError(error, "updating staff member"),
  });
}

// BUG #36: Soft delete when staff has related records
export function useDeleteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Check if staff has related records using direct query (since RPC types may be stale)
      const { data: timeEntries } = await supabase
        .from("time_entries")
        .select("time_id")
        .eq("staff_id", id)
        .limit(1);
      
      const { data: timerEntries } = await supabase
        .from("timer_entries")
        .select("timer_id")
        .eq("staff_id", id)
        .limit(1);
        
      const { data: periods } = await supabase
        .from("timesheet_periods")
        .select("period_id")
        .eq("staff_id", id)
        .limit(1);
        
      const { data: engagements } = await supabase
        .from("engagements")
        .select("engagement_id")
        .or(`partner_id.eq.${id},manager_id.eq.${id}`)
        .limit(1);
      
      const hasRecords = 
        (timeEntries && timeEntries.length > 0) ||
        (timerEntries && timerEntries.length > 0) ||
        (periods && periods.length > 0) ||
        (engagements && engagements.length > 0);
      
      if (hasRecords) {
        // Soft delete - set deleted_at timestamp
        const { error } = await supabase
          .from("staff")
          .update({ deleted_at: new Date().toISOString(), is_active: false })
          .eq("staff_id", id);
        if (error) throw error;
        return { softDeleted: true };
      } else {
        // Hard delete - no related records
        const { error } = await supabase
          .from("staff")
          .delete()
          .eq("staff_id", id);
        if (error) throw error;
        return { softDeleted: false };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff_full"] });
      if (result.softDeleted) {
        toast.success(i18n.t("messages.staffDeactivated"));
      } else {
        toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.staffMember") }));
      }
    },
    onError: createMutationErrorHandler("deleting staff member"),
  });
}

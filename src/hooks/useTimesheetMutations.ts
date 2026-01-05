import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toISODateString } from "@/lib/timesheetUtils";
import { createMutationErrorHandler } from "@/lib/error-handler";

// Upsert a time entry (create or update)
export function useUpsertTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      staffId,
      engagementId,
      activityId,
      dateWorked,
      hours,
      periodId,
      existingEntryId,
    }: {
      staffId: string;
      engagementId: string;
      activityId: string;
      dateWorked: Date;
      hours: number;
      periodId: string | null;
      existingEntryId: string | null;
    }) => {
      const dateStr = toISODateString(dateWorked);

      // If hours is 0 and entry exists, delete it
      if (hours === 0 && existingEntryId) {
        const { error } = await supabase
          .from("time_entries")
          .delete()
          .eq("time_id", existingEntryId);
        if (error) throw error;
        return { action: "deleted", time_id: existingEntryId };
      }

      // If hours is 0 and no existing entry, do nothing
      if (hours === 0) {
        return { action: "skipped" };
      }

      // Update existing entry
      if (existingEntryId) {
        const { data, error } = await supabase
          .from("time_entries")
          .update({ hours_logged: hours })
          .eq("time_id", existingEntryId)
          .select()
          .single();
        if (error) throw error;
        return { action: "updated", ...data };
      }

      // Create new entry
      const { data, error } = await supabase
        .from("time_entries")
        .insert({
          staff_id: staffId,
          engagement_id: engagementId,
          activity_id: activityId,
          date_worked: dateStr,
          hours_logged: hours,
          period_id: periodId,
          is_forecast: false,
        })
        .select()
        .single();
      if (error) throw error;
      return { action: "created", ...data };
    },
    onSuccess: (_, variables) => {
      // Invalidate entries query to refetch
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: createMutationErrorHandler("saving time entry"),
  });
}

// Delete a time entry
export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (timeId: string) => {
      const { error } = await supabase
        .from("time_entries")
        .delete()
        .eq("time_id", timeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: createMutationErrorHandler("deleting time entry"),
  });
}

// Update period total hours
export function useUpdatePeriodTotalHours() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      periodId,
      totalHours,
    }: {
      periodId: string;
      totalHours: number;
    }) => {
      const { data, error } = await supabase
        .from("timesheet_periods")
        .update({ total_hours: totalHours })
        .eq("period_id", periodId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-period"] });
    },
    onError: createMutationErrorHandler("updating period total"),
  });
}

// Submit timesheet for approval - creates line approvals for each engagement
export function useSubmitTimesheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      periodId,
      staffId,
      engagementIds,
      isAutoApproved,
    }: {
      periodId: string;
      staffId: string;
      engagementIds: string[];
      isAutoApproved: boolean;
    }) => {
      // First, update the period's submitted_at timestamp
      const { error: periodError } = await supabase
        .from("timesheet_periods")
        .update({
          submitted_at: new Date().toISOString(),
        })
        .eq("period_id", periodId);

      if (periodError) throw periodError;

      // Create line approvals for each unique engagement
      const lineApprovals = engagementIds.map((engagementId) => ({
        period_id: periodId,
        engagement_id: engagementId,
        status: isAutoApproved ? "approved" : "pending",
        approved_by: isAutoApproved ? staffId : null,
        approved_at: isAutoApproved ? new Date().toISOString() : null,
      }));

      // Upsert line approvals (in case some already exist)
      const { error: lineError } = await supabase
        .from("timesheet_line_approvals")
        .upsert(lineApprovals, { 
          onConflict: "period_id,engagement_id",
          ignoreDuplicates: false 
        });

      if (lineError) throw lineError;

      return { periodId, isAutoApproved };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-period"] });
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      toast.success(data.isAutoApproved 
        ? "Timesheet auto-approved" 
        : "Timesheet submitted for approval"
      );
    },
    onError: createMutationErrorHandler("submitting timesheet"),
  });
}

// Note: useSaveTimesheetDraft was removed - draft state is now implicit when submitted_at is null

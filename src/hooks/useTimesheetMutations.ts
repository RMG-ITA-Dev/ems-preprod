import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { toISODateString } from "@/lib/timesheetUtils";

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
      const dateStr = toISODateString(variables.dateWorked);
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: (error) => {
      toast({
        title: "Error saving time entry",
        description: error.message,
        variant: "destructive",
      });
    },
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
    onError: (error) => {
      toast({
        title: "Error deleting time entry",
        description: error.message,
        variant: "destructive",
      });
    },
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
  });
}

// Submit timesheet for approval
export function useSubmitTimesheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (periodId: string) => {
      const { data, error } = await supabase
        .from("timesheet_periods")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
        })
        .eq("period_id", periodId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-period"] });
      toast({ title: "Timesheet submitted successfully" });
    },
    onError: (error) => {
      toast({
        title: "Error submitting timesheet",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Save timesheet as draft
export function useSaveTimesheetDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (periodId: string) => {
      const { data, error } = await supabase
        .from("timesheet_periods")
        .update({ status: "draft" })
        .eq("period_id", periodId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-period"] });
      toast({ title: "Draft saved" });
    },
    onError: (error) => {
      toast({
        title: "Error saving draft",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

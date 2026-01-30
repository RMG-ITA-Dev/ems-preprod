import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toISODateString, getPreviousWeek, getWorkDays } from "@/lib/timesheetUtils";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";
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
        ? i18n.t("timesheet.autoApproved") 
        : i18n.t("timesheet.submitted")
      );
    },
    onError: createMutationErrorHandler("submitting timesheet"),
  });
}

// BUG #32: Unsubmit timesheet to allow corrections before approval
export function useUnsubmitTimesheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      periodId,
    }: {
      periodId: string;
    }) => {
      // Clear submitted_at to revert to draft state
      const { error: periodError } = await supabase
        .from("timesheet_periods")
        .update({
          submitted_at: null,
        })
        .eq("period_id", periodId);

      if (periodError) throw periodError;

      // Delete pending line approvals (keep approved/rejected for record)
      const { error: lineError } = await supabase
        .from("timesheet_line_approvals")
        .delete()
        .eq("period_id", periodId)
        .eq("status", "pending");

      if (lineError) throw lineError;

      return { periodId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-period"] });
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      toast.success(i18n.t("timesheet.unsubmitted"));
    },
    onError: createMutationErrorHandler("unsubmitting timesheet"),
  });
}

// BUG #12: Copy previous week entries to current week
export function useCopyPreviousWeek() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      staffId,
      currentWeekStart,
      periodId,
      workDays,
    }: {
      staffId: string;
      currentWeekStart: Date;
      periodId: string | null;
      workDays: number;
    }) => {
      // Get previous week dates
      const previousWeekStart = getPreviousWeek(currentWeekStart);
      const prevWeekDates = getWorkDays(previousWeekStart, workDays);
      const prevWeekStartStr = toISODateString(prevWeekDates[0]);
      const prevWeekEndStr = toISODateString(prevWeekDates[prevWeekDates.length - 1]);

      // Fetch previous week entries
      const { data: prevEntries, error: fetchError } = await supabase
        .from("time_entries")
        .select("*")
        .eq("staff_id", staffId)
        .gte("date_worked", prevWeekStartStr)
        .lte("date_worked", prevWeekEndStr)
        .eq("is_forecast", false);

      if (fetchError) throw fetchError;
      if (!prevEntries || prevEntries.length === 0) {
        throw new Error("NO_ENTRIES");
      }

      // Get current week dates
      const currentWeekDates = getWorkDays(currentWeekStart, workDays);

      // Map entries to current week (same day offset)
      const newEntries = prevEntries.map((entry) => {
        const prevDate = new Date(entry.date_worked);
        const dayIndex = prevWeekDates.findIndex(
          (d) => toISODateString(d) === entry.date_worked
        );
        
        // Get corresponding day in current week
        const newDate = currentWeekDates[dayIndex] || currentWeekDates[0];

        return {
          staff_id: staffId,
          engagement_id: entry.engagement_id,
          activity_id: entry.activity_id,
          date_worked: toISODateString(newDate),
          hours_logged: entry.hours_logged,
          period_id: periodId,
          is_forecast: false,
          description: entry.description,
        };
      });

      // Insert new entries (upsert to avoid duplicates)
      const { error: insertError } = await supabase
        .from("time_entries")
        .upsert(newEntries, {
          onConflict: "staff_id,engagement_id,activity_id,date_worked",
          ignoreDuplicates: false,
        });

      if (insertError) throw insertError;

      return { copiedCount: newEntries.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      toast.success(i18n.t("timesheet.copiedFromPreviousWeek", { count: data.copiedCount }));
    },
    onError: (error: Error) => {
      if (error.message === "NO_ENTRIES") {
        toast.error(i18n.t("timesheet.noPreviousEntries"));
      } else {
        createMutationErrorHandler("copying previous week")(error);
      }
    },
  });
}

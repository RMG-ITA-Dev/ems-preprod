import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toISODateString, getPreviousWeek, getWorkDays } from "@/lib/timesheetUtils";
import { createMutationErrorHandler } from "@/lib/error-handler";
import { createTimesheetError, isTimesheetError } from "@/lib/timesheetErrors";
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

// Unified destination-period resolution + lock guard
// Fail closed: abort operation if status cannot be verified
async function resolveDestinationPeriod(
  periodId: string | null,
  staffId: string,
  weekStartDate: Date
): Promise<{ resolvedPeriodId: string | null; isLocked: boolean }> {
  const query = periodId
    ? supabase
        .from("timesheet_periods")
        .select("period_id, submitted_at, is_period_locked")
        .eq("period_id", periodId)
        .maybeSingle()
    : supabase
        .from("timesheet_periods")
        .select("period_id, submitted_at, is_period_locked")
        .eq("staff_id", staffId)
        .eq("week_start_date", toISODateString(weekStartDate))
        .maybeSingle();

  const { data, error } = await query;

  // Fail closed: abort operation if status cannot be verified
  if (error) throw error;

  if (!data) {
    // No period record exists -- week is brand new, not locked
    return { resolvedPeriodId: null, isLocked: false };
  }

  return {
    resolvedPeriodId: data.period_id,
    isLocked: !!data.submitted_at || !!data.is_period_locked,
  };
}

// BUG #0213-24: Copy previous week structure to current week (deduplicated insert)
export function useCopyPreviousWeek() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      staffId,
      currentWeekStart,
      periodId,
      workDays,
      holidayDates,
      holidayEngagementId,
    }: {
      staffId: string;
      currentWeekStart: Date;
      periodId: string | null;
      workDays: number;
      holidayDates?: Set<string>;
      holidayEngagementId?: string | null;
    }) => {
      // 1. Resolve destination period + lock guard (unified, fail-closed)
      const { resolvedPeriodId, isLocked } = await resolveDestinationPeriod(
        periodId,
        staffId,
        currentWeekStart
      );

      if (isLocked) {
        throw createTimesheetError("WEEK_LOCKED");
      }

      // 2. Fetch previous week entries (only fields needed for structure copy)
      const previousWeekStart = getPreviousWeek(currentWeekStart);
      const prevWeekDates = getWorkDays(previousWeekStart, workDays);
      const prevWeekStartStr = toISODateString(prevWeekDates[0]);
      const prevWeekEndStr = toISODateString(
        prevWeekDates[prevWeekDates.length - 1]
      );

      const { data: prevEntries, error: fetchError } = await supabase
        .from("time_entries")
        .select("engagement_id, activity_id, date_worked")
        .eq("staff_id", staffId)
        .gte("date_worked", prevWeekStartStr)
        .lte("date_worked", prevWeekEndStr)
        .eq("is_forecast", false);

      if (fetchError) throw fetchError;
      if (!prevEntries || prevEntries.length === 0) {
        throw createTimesheetError("NO_ENTRIES");
      }

      // 3. Compute current week dates
      const currentWeekDates = getWorkDays(currentWeekStart, workDays);

      // 4. Fetch existing entries for current week to deduplicate
      const currentWeekStartStr = toISODateString(currentWeekDates[0]);
      const currentWeekEndStr = toISODateString(
        currentWeekDates[currentWeekDates.length - 1]
      );

      const { data: existingEntries, error: existingError } = await supabase
        .from("time_entries")
        .select("engagement_id, activity_id, date_worked, is_forecast")
        .eq("staff_id", staffId)
        .gte("date_worked", currentWeekStartStr)
        .lte("date_worked", currentWeekEndStr)
        .eq("is_forecast", false);

      if (existingError) throw existingError;

      // 5. Build existingKeys including is_forecast (matches unique index shape)
      const existingKeys = new Set(
        (existingEntries || []).map(
          (e) =>
            `${e.engagement_id}|${e.activity_id}|${e.date_worked}|${e.is_forecast}`
        )
      );

      // 6. Map previous -> current week, skip unmappable + duplicates
      const newEntries = prevEntries
        .map((entry) => {
          const dayIndex = prevWeekDates.findIndex(
            (d) => toISODateString(d) === entry.date_worked
          );
          if (dayIndex < 0) return null;

          const newDate = currentWeekDates[dayIndex];
          if (!newDate) return null; // Defensive: out-of-bounds guard

          const newDateStr = toISODateString(newDate);

          return {
            staff_id: staffId,
            engagement_id: entry.engagement_id,
            activity_id: entry.activity_id,
            date_worked: newDateStr,
            hours_logged: 0, // Structure only, not hours
            period_id: resolvedPeriodId, // Uses resolved period_id (no orphans)
            is_forecast: false,
            description: null, // No stale descriptions
          };
        })
        .filter(
          (entry): entry is NonNullable<typeof entry> =>
            entry !== null &&
            !existingKeys.has(
              `${entry.engagement_id}|${entry.activity_id}|${entry.date_worked}|${entry.is_forecast}`
            )
        );

      // Filter out holiday-blocked entries
      let holidaySkippedCount = 0;
      const filteredEntries = newEntries.filter((entry) => {
        if (
          holidayDates &&
          holidayDates.has(entry.date_worked) &&
          entry.engagement_id !== holidayEngagementId
        ) {
          holidaySkippedCount++;
          return false;
        }
        return true;
      });

      // 7. If nothing to insert, return early
      if (filteredEntries.length === 0) {
        return { copiedCount: 0, holidaySkippedCount };
      }

      // 8. Insert only new entries (NOT upsert -- dedup already done)
      const { error: insertError } = await supabase
        .from("time_entries")
        .insert(filteredEntries);

      if (insertError) throw insertError;

      // 9. Return accurate count
      return { copiedCount: filteredEntries.length, holidaySkippedCount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      if (data.holidaySkippedCount > 0) {
        toast.info(
          i18n.t("timesheet.holidayEntriesSkipped", {
            count: data.holidaySkippedCount,
          })
        );
      }
      if (data.copiedCount === 0 && data.holidaySkippedCount === 0) {
        toast.info(
          i18n.t("timesheet.previousWeekAlreadyCopied")
        );
      } else {
        toast.success(
          i18n.t("timesheet.copiedFromPreviousWeek", {
            count: data.copiedCount,
          })
        );
      }
    },
    onError: (error: unknown) => {
      if (isTimesheetError(error, "NO_ENTRIES")) {
        toast.error(i18n.t("timesheet.noPreviousEntries"));
      } else if (isTimesheetError(error, "WEEK_LOCKED")) {
        toast.error(i18n.t("timesheet.cannotModifyLockedWeek"));
      } else {
        createMutationErrorHandler("copying previous week")(error as Error);
      }
    },
  });
}

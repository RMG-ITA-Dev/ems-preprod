import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toISODateString, getPreviousWeek, getWorkDays, getWeekMonday } from "@/lib/timesheetUtils";
import { parseDateLocal } from "@/lib/timesheetUtils";
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
    onError: (error: Error) => {
      const errorMsg = error.message || '';
      const errorDetails = (error as { details?: string } | null)?.details ?? '';
      if (errorMsg.includes("APPROVED_LINE_LOCKED") || errorDetails.includes("APPROVED_LINE_LOCKED")) {
        toast.error(i18n.t("timesheet.approvedLineCannotEdit"));
        return;
      }
      // BUG 0220-63: Engagement date range guard
      if (errorMsg.includes("ENGAGEMENT_DATE_RANGE")) {
        toast.error(i18n.t("timesheet.dateOutsideEngagementRange"));
        return;
      }
      createMutationErrorHandler("saving time entry")(error);
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
    onError: createMutationErrorHandler("deleting time entry"),
  });
}

// BUG #0213-34: Bulk delete all time entries for a row
export function useDeleteRowEntries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (timeIds: string[]) => {
      const { error } = await supabase
        .from("time_entries")
        .delete()
        .in("time_id", timeIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    // No onError here -- caller handles toast + logging to avoid duplicates
  });
}

// BUG 0227-68: Bulk update activity_id for existing time entries
export function useUpdateEntryActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entryIds,
      newActivityId,
    }: {
      entryIds: string[];
      newActivityId: string;
    }) => {
      const { error } = await supabase
        .from("time_entries")
        .update({ activity_id: newActivityId })
        .in("time_id", entryIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: (error: Error) => {
      const msg = error.message || '';
      if (msg.includes("APPROVED_LINE_LOCKED")) {
        toast.error(i18n.t("timesheet.approvedLineCannotEdit"));
        return;
      }
      createMutationErrorHandler("updating activity")(error);
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
    onError: createMutationErrorHandler("updating period total"),
  });
}

// Submit timesheet for approval - calls backend-authoritative RPC (BUG 0220-51)
export function useSubmitTimesheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      periodId,
      staffId,
      engagementActivityPairs,
      isAutoApproved,
    }: {
      periodId: string;
      staffId: string;
      engagementActivityPairs: Array<{ engagementId: string; activityId: string }>;
      isAutoApproved: boolean;
    }) => {
      // Deduplicate by (engagement, activity) and filter nulls
      const uniquePairs = [
        ...new Map(
          engagementActivityPairs
            .filter(p => p.engagementId && p.activityId)
            .map(p => [`${p.engagementId}:${p.activityId}`, p])
        ).values(),
      ];

      const { data, error } = await supabase.rpc('submit_timesheet_safe', {
        p_period_id:        periodId,
        p_staff_id:         staffId,
        p_engagement_ids:   uniquePairs.map(p => p.engagementId),
        p_activity_ids:     uniquePairs.map(p => p.activityId),
        p_is_auto_approved: isAutoApproved,
      });

      if (error) throw error;
      return { periodId, isAutoApproved, summary: data };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-period"] });
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approval-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["staff-timesheet-for-approval"] });
      toast.success(data.isAutoApproved
        ? i18n.t("timesheet.autoApproved")
        : i18n.t("timesheet.submitted")
      );
    },
    onError: (error: Error) => {
      const msg = error.message || '';
      if (msg.includes('WEEKLY_MIN_NOT_MET')) {
        toast.error(i18n.t("timesheet.weeklyMinNotMet"));
        return;
      }
      if (msg.includes('WEEKLY_MAX_EXCEEDED')) {
        toast.error(i18n.t("timesheet.weeklyMaxExceeded"));
        return;
      }
      if (msg.includes('SUBMIT_NO_ENTRIES')) {
        toast.error(i18n.t("timesheet.submitNoEntries"));
        return;
      }
      // BUG 0220-63: Submit-time engagement date range violation (check _VIOLATION first to avoid false match)
      if (msg.includes('ENGAGEMENT_DATE_RANGE_VIOLATION')) {
        toast.error(i18n.t("timesheet.submitDateRangeViolation"));
        return;
      }
      createMutationErrorHandler("submitting timesheet")(error);
    },
  });
}

// BUG #32 + BUG 0220-51: Unsubmit timesheet (no DELETE on line approvals)
export function useUnsubmitTimesheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ periodId }: { periodId: string }) => {
      const { error } = await supabase.rpc("unsubmit_timesheet_safe", {
        p_period_id: periodId,
      });
      if (error) throw error;
      return { periodId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-period"] });
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approval-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["staff-timesheet-for-approval"] });
      toast.success(i18n.t("timesheet.unsubmitted"));
    },
    onError: (error: Error) => {
      const msg = error.message || "";
      if (msg.includes("UNSUBMIT_NOT_PARTNER")) {
        toast.error(i18n.t("timesheet.unsubmitNotPartner"));
        return;
      }
      if (msg.includes("APPROVED_WEEK_RECALL_WINDOW_CLOSED")) {
        toast.error(i18n.t("timesheet.approvedRecallWindowClosed"));
        return;
      }
      createMutationErrorHandler("unsubmitting timesheet")(error);
    },
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

// Plan v4: Copy WOS entries (with hours) to Current Week with smart holiday remap
export function useCopyToCurrentWeek() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      staffId,
      sourceWeekStart,
      workDays,
      hireDate,
      terminationDate,
      employeeRetroDays,
    }: {
      staffId: string;
      sourceWeekStart: Date;
      workDays: number;
      hireDate?: string | null;
      terminationDate?: string | null;
      employeeRetroDays?: number;
    }) => {
      // Step 1: Compute destination week
      const destWeekStart = getWeekMonday(new Date());
      if (sourceWeekStart.getTime() === destWeekStart.getTime()) {
        return { copiedCount: 0, holidaySkippedCount: 0, holidayAutoCount: 0, engagementSkippedCount: 0 };
      }

      // Step 2: Compute week dates
      const sourceWeekDates = getWorkDays(sourceWeekStart, workDays);
      const destWeekDates = getWorkDays(destWeekStart, workDays);

      const destStartStr = toISODateString(destWeekDates[0]);
      const destEndStr = toISODateString(destWeekDates[destWeekDates.length - 1]);
      const sourceStartStr = toISODateString(sourceWeekDates[0]);
      const sourceEndStr = toISODateString(sourceWeekDates[sourceWeekDates.length - 1]);

      // Step 3: Destination editability checks
      const retroDays = employeeRetroDays ?? 30;
      if (hireDate) {
        const hireDateParsed = parseDateLocal(hireDate);
        const destEnd = destWeekDates[destWeekDates.length - 1];
        if (destEnd < hireDateParsed) {
          throw createTimesheetError("WEEK_LOCKED");
        }
      }
      if (terminationDate) {
        const termDateParsed = parseDateLocal(terminationDate);
        if (destWeekDates[0] > termDateParsed) {
          throw createTimesheetError("WEEK_LOCKED");
        }
      }
      // Editable window check
      const today = new Date();
      const destEnd = destWeekDates[destWeekDates.length - 1];
      const daysSinceDestEnd = Math.floor(
        (today.getTime() - destEnd.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceDestEnd > retroDays) {
        throw createTimesheetError("WEEK_LOCKED");
      }

      // Step 4: Resolve destination period + lock guard
      const { resolvedPeriodId, isLocked } = await resolveDestinationPeriod(
        null,
        staffId,
        destWeekStart
      );
      if (isLocked) {
        throw createTimesheetError("WEEK_LOCKED");
      }

      // Step 5: Check destination has no entries
      const { data: destEntries, error: destError } = await supabase
        .from("time_entries")
        .select("engagement_id, activity_id, date_worked, is_forecast")
        .eq("staff_id", staffId)
        .gte("date_worked", destStartStr)
        .lte("date_worked", destEndStr)
        .eq("is_forecast", false);
      if (destError) throw destError;
      if (destEntries && destEntries.length > 0) {
        throw createTimesheetError("CURRENT_WEEK_HAS_ENTRIES");
      }

      // Step 6: Fetch source entries
      const { data: sourceEntries, error: sourceError } = await supabase
        .from("time_entries")
        .select("engagement_id, activity_id, date_worked, hours_logged")
        .eq("staff_id", staffId)
        .gte("date_worked", sourceStartStr)
        .lte("date_worked", sourceEndStr)
        .eq("is_forecast", false);
      if (sourceError) throw sourceError;
      if (!sourceEntries || sourceEntries.length === 0) {
        throw createTimesheetError("NO_ENTRIES");
      }

      // Step 7: Fetch holidays for both ranges
      const allStartStr = sourceStartStr < destStartStr ? sourceStartStr : destStartStr;
      const allEndStr = sourceEndStr > destEndStr ? sourceEndStr : destEndStr;
      const { data: holidayRows, error: holError } = await supabase
        .from("holidays")
        .select("holiday_date")
        .gte("holiday_date", allStartStr)
        .lte("holiday_date", allEndStr);
      if (holError) throw holError;
      const holidaySet = new Set((holidayRows || []).map((h) => h.holiday_date));

      const sourceHolidayDates = new Set<string>();
      const destHolidayDates = new Set<string>();
      sourceWeekDates.forEach((d) => {
        const s = toISODateString(d);
        if (holidaySet.has(s)) sourceHolidayDates.add(s);
      });
      destWeekDates.forEach((d) => {
        const s = toISODateString(d);
        if (holidaySet.has(s)) destHolidayDates.add(s);
      });

      // Step 8: Fetch settings
      const { data: settingsRows, error: setError } = await supabase
        .from("global_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["HOLIDAY_ENGAGEMENT_ID", "ADM_ACTIVITY_ID", "DAILY_MIN"]);
      if (setError) throw setError;

      const settingsMap = new Map<string, string>();
      (settingsRows || []).forEach((s) => settingsMap.set(s.setting_key, s.setting_value));

      const holidayEngagementId = settingsMap.get("HOLIDAY_ENGAGEMENT_ID")?.trim() || null;
      const adminActivityId = settingsMap.get("ADM_ACTIVITY_ID")?.trim() || null;
      const dailyMin = settingsMap.get("DAILY_MIN")?.trim() || "8";

      if (destHolidayDates.size > 0 && !holidayEngagementId) {
        throw createTimesheetError("HOLIDAY_NOT_CONFIGURED");
      }

      // Step 9: Fetch engagement metadata for date validation
      const uniqueEngIds = [...new Set(sourceEntries.map((e) => e.engagement_id))];
      const { data: engMetadata, error: engError } = await supabase
        .from("engagements")
        .select("engagement_id, start_date, end_date")
        .in("engagement_id", uniqueEngIds);
      if (engError) throw engError;

      const engDateMap = new Map<string, { start_date: string | null; end_date: string | null }>();
      (engMetadata || []).forEach((e) =>
        engDateMap.set(e.engagement_id, { start_date: e.start_date, end_date: e.end_date })
      );

      // Step 10: Smart remap
      let holidaySkippedCount = 0;
      let holidayAutoCount = 0;
      let engagementSkippedCount = 0;
      const destHolidayDaysAutoInserted = new Set<string>();

      const mappedEntries: Array<{
        staff_id: string;
        engagement_id: string;
        activity_id: string;
        date_worked: string;
        hours_logged: number;
        period_id: string | null;
        is_forecast: boolean;
        description: string | null;
      }> = [];

      for (const entry of sourceEntries) {
        const dayIndex = sourceWeekDates.findIndex(
          (d) => toISODateString(d) === entry.date_worked
        );
        if (dayIndex < 0 || dayIndex >= destWeekDates.length) continue;

        const destDate = destWeekDates[dayIndex];
        const destDateStr = toISODateString(destDate);
        const sourceIsHoliday = sourceHolidayDates.has(entry.date_worked);
        const destIsHoliday = destHolidayDates.has(destDateStr);

        // Rule 1: Source holiday + dest NOT holiday → skip
        if (sourceIsHoliday && !destIsHoliday) {
          holidaySkippedCount++;
          continue;
        }

        // Rule 2: Dest holiday + source NOT holiday → skip + auto-insert
        if (destIsHoliday && !sourceIsHoliday) {
          holidaySkippedCount++;
          // Auto-insert holiday row once per dest holiday day
          if (!destHolidayDaysAutoInserted.has(destDateStr)) {
            if (!adminActivityId) {
              throw createTimesheetError("ADM_ACTIVITY_NOT_CONFIGURED");
            }
            destHolidayDaysAutoInserted.add(destDateStr);
            mappedEntries.push({
              staff_id: staffId,
              engagement_id: holidayEngagementId!,
              activity_id: adminActivityId,
              date_worked: destDateStr,
              hours_logged: parseFloat(dailyMin),
              period_id: resolvedPeriodId,
              is_forecast: false,
              description: null,
            });
            holidayAutoCount++;
          }
          continue;
        }

        // Rule 3 & 4: Both holiday → copy as-is; Neither → copy as-is
        // Engagement date validation (Step 9)
        const engDates = engDateMap.get(entry.engagement_id);
        if (engDates) {
          if (engDates.start_date) {
            const startD = parseDateLocal(engDates.start_date);
            if (destDate < startD) {
              engagementSkippedCount++;
              continue;
            }
          }
          if (engDates.end_date) {
            const endD = parseDateLocal(engDates.end_date);
            if (destDate > endD) {
              engagementSkippedCount++;
              continue;
            }
          }
        }

        mappedEntries.push({
          staff_id: staffId,
          engagement_id: entry.engagement_id,
          activity_id: entry.activity_id,
          date_worked: destDateStr,
          hours_logged: entry.hours_logged,
          period_id: resolvedPeriodId,
          is_forecast: false,
          description: null,
        });
      }

      // Step 11: Dedup defense-in-depth
      const existingKeys = new Set(
        (destEntries || []).map(
          (e) => `${e.engagement_id}|${e.activity_id}|${e.date_worked}|${e.is_forecast}`
        )
      );
      const finalEntries = mappedEntries.filter(
        (e) => !existingKeys.has(`${e.engagement_id}|${e.activity_id}|${e.date_worked}|${e.is_forecast}`)
      );

      if (finalEntries.length === 0) {
        return { copiedCount: 0, holidaySkippedCount, holidayAutoCount, engagementSkippedCount };
      }

      // Step 13: Insert
      const { error: insertError } = await supabase
        .from("time_entries")
        .insert(finalEntries);
      if (insertError) throw insertError;

      return {
        copiedCount: finalEntries.length,
        holidaySkippedCount,
        holidayAutoCount,
        engagementSkippedCount,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      if (data.copiedCount > 0) {
        toast.success(
          i18n.t("timesheet.copyToCurrentWeekSuccess", { count: data.copiedCount })
        );
      }
      if (data.holidaySkippedCount > 0) {
        toast.info(
          i18n.t("timesheet.holidayEntriesSkippedOnCopy", { count: data.holidaySkippedCount })
        );
      }
      if (data.holidayAutoCount > 0) {
        toast.info(
          i18n.t("timesheet.holidayAutoInserted", { count: data.holidayAutoCount })
        );
      }
      if (data.engagementSkippedCount > 0) {
        toast.info(
          i18n.t("timesheet.engagementDateSkipped", { count: data.engagementSkippedCount })
        );
      }
    },
    onError: (error: unknown) => {
      // Fix A: CURRENT_WEEK_HAS_ENTRIES handled by call-site onError (dialog)
      if (isTimesheetError(error, "CURRENT_WEEK_HAS_ENTRIES")) return;

      if (isTimesheetError(error, "NO_ENTRIES")) {
        toast.error(i18n.t("timesheet.noSourceEntries"));
      } else if (isTimesheetError(error, "WEEK_LOCKED")) {
        toast.error(i18n.t("timesheet.cannotModifyLockedWeek"));
      } else if (isTimesheetError(error, "HOLIDAY_NOT_CONFIGURED")) {
        toast.error(i18n.t("timesheet.holidayNotConfigured"));
      } else if (isTimesheetError(error, "ADM_ACTIVITY_NOT_CONFIGURED")) {
        toast.error(i18n.t("timesheet.admActivityNotConfigured"));
      } else {
        createMutationErrorHandler("copying to current week")(error as Error);
      }
    },
  });
}

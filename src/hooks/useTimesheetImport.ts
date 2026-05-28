import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO, getYear } from "date-fns";
import { getFiscalWeekNumber } from "@/lib/fiscalCalculations";
import { supabase } from "@/integrations/supabase/client";
import { useMarkTimerEntriesImported, type TimerEntry } from "@/hooks/useTimerEntries";
import { getWeekMonday, toISODateString } from "@/lib/timesheetUtils";
import {
  buildExportGroups,
  detectSplitSelectionConflicts,
  buildConsolidationPreview,
  type PreflightAnalysis,
} from "@/lib/timerExportUtils";

export interface ImportResult {
  newCount: number;
  mergedCount: number;
  blockedCount: number;
  blockedWeeks: string[];
  woBlockedCount: number;
  woBlockedEngagements: string[];
  dbErrorCount: number;
  dbErrorWeeks: string[];
  dbErrorMessages: string[];
}

interface AggregatedGroup {
  engagement_id: string;
  activity_id: string;
  date_worked: string;
  totalMinutes: number;
  timerIds: string[];
  description: string | null;
}

interface ResolvedPeriod {
  period_id: string;
  submitted_at: string | null;
}

function isWoNotApprovedError(message?: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("work order") && lower.includes("not approved");
}

function isApprovedLineLockedError(message?: string): boolean {
  if (!message) return false;
  return message.toUpperCase().includes("APPROVED_LINE_LOCKED");
}

function classifyDbErrorMessage(rawMsg: string): string {
  if (isApprovedLineLockedError(rawMsg)) return "approved_line_locked";
  return rawMsg.length > 0 && rawMsg.length <= 120 ? rawMsg : "";
}

export function useTimesheetImport({ staffId }: { staffId: string }) {
  const [isExporting, setIsExporting] = useState(false);
  const queryClient = useQueryClient();
  const markImported = useMarkTimerEntriesImported();

  const exportEntries = async (entries: TimerEntry[]): Promise<ImportResult> => {
    if (!staffId || entries.length === 0) {
      return {
        newCount: 0, mergedCount: 0, blockedCount: 0, blockedWeeks: [],
        woBlockedCount: 0, woBlockedEngagements: [],
        dbErrorCount: 0, dbErrorWeeks: [], dbErrorMessages: [],
      };
    }

    setIsExporting(true);
    try {
      // Step 1 & 2: Extract dates and aggregate by (engagement, activity, date)
      const grouped = new Map<string, AggregatedGroup>();
      for (const entry of entries) {
        const dateWorked = format(parseISO(entry.started_at), "yyyy-MM-dd");
        const key = `${entry.engagement_id}|${entry.activity_id}|${dateWorked}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.totalMinutes += entry.duration_minutes || 0;
          existing.timerIds.push(entry.timer_id);
          if (!existing.description && entry.description) {
            existing.description = entry.description;
          }
        } else {
          grouped.set(key, {
            engagement_id: entry.engagement_id,
            activity_id: entry.activity_id,
            date_worked: dateWorked,
            totalMinutes: entry.duration_minutes || 0,
            timerIds: [entry.timer_id],
            description: entry.description,
          });
        }
      }

      // Pre-fetch engagement codes for WO-blocked toast display
      const uniqueEngagementIds = Array.from(new Set(Array.from(grouped.values()).map(g => g.engagement_id)));
      const engagementCodeMap = new Map<string, string>();
      if (uniqueEngagementIds.length > 0) {
        const { data: engagements } = await supabase
          .from("engagements")
          .select("engagement_id, engagement_code")
          .in("engagement_id", uniqueEngagementIds);
        if (engagements) {
          for (const eng of engagements) {
            if (eng.engagement_code) {
              engagementCodeMap.set(eng.engagement_id, eng.engagement_code);
            }
          }
        }
      }

      // Step 4 & 5: Resolve periods per unique week
      const weekPeriods = new Map<string, ResolvedPeriod | null>();
      const uniqueWeekStarts = new Set<string>();
      
      for (const group of grouped.values()) {
        const [year, month, day] = group.date_worked.split("-").map(Number);
        const dateObj = new Date(year, month - 1, day);
        const weekMonday = getWeekMonday(dateObj);
        uniqueWeekStarts.add(toISODateString(weekMonday));
      }

      for (const weekStartStr of uniqueWeekStarts) {
        try {
          const { data: existing, error: fetchError } = await supabase
            .from("timesheet_periods")
            .select("period_id, submitted_at")
            .eq("staff_id", staffId)
            .eq("week_start_date", weekStartStr)
            .maybeSingle();

          if (fetchError) throw fetchError;

          if (existing) {
            weekPeriods.set(weekStartStr, existing);
          } else {
            const [y, m, d] = weekStartStr.split("-").map(Number);
            const weekDate = new Date(y, m - 1, d);
            const weekNumber = getFiscalWeekNumber(weekDate);
            const year = getYear(weekDate);

            const { data: newPeriod, error: createError } = await supabase
              .from("timesheet_periods")
              .insert({
                staff_id: staffId,
                week_start_date: weekStartStr,
                week_number: weekNumber,
                year: year,
                total_hours: 0,
              })
              .select("period_id, submitted_at")
              .single();

            if (createError) {
              console.error("Period creation failed for week:", weekStartStr, createError);
              weekPeriods.set(weekStartStr, null);
            } else {
              weekPeriods.set(weekStartStr, newPeriod);
            }
          }
        } catch (err) {
          console.error("Period resolution error for week:", weekStartStr, err);
          weekPeriods.set(weekStartStr, null);
        }
      }

      // Step 6 & 7: Process groups
      let newCount = 0;
      let mergedCount = 0;
      let blockedCount = 0;
      const blockedWeeks: string[] = [];
      let woBlockedCount = 0;
      const woBlockedEngagementsSet = new Set<string>();
      let dbErrorCount = 0;
      const dbErrorWeeks: string[] = [];
      const dbErrorMessages: string[] = [];
      const exportedTimerIds: string[] = [];
      const importedMappings: { timer_id: string; time_id: string }[] = [];

      for (const group of grouped.values()) {
        const [year, month, day] = group.date_worked.split("-").map(Number);
        const dateObj = new Date(year, month - 1, day);
        const weekMonday = getWeekMonday(dateObj);
        const weekStartStr = toISODateString(weekMonday);
        const period = weekPeriods.get(weekStartStr);

        if (!period) {
          blockedCount += group.timerIds.length;
          const formattedWeek = format(dateObj, "dd/MM/yyyy");
          if (!blockedWeeks.includes(formattedWeek)) {
            blockedWeeks.push(formattedWeek);
          }
          continue;
        }

        if (period.submitted_at !== null) {
          blockedCount += group.timerIds.length;
          const [wy, wm, wd] = weekStartStr.split("-").map(Number);
          const formattedWeek = format(new Date(wy, wm - 1, wd), "dd/MM/yyyy");
          if (!blockedWeeks.includes(formattedWeek)) {
            blockedWeeks.push(formattedWeek);
          }
          continue;
        }

        const roundedHours = Math.round((group.totalMinutes / 60) * 10) / 10;

        // Deterministic upsert (SELECT-first)
        const { data: existingEntry, error: selectError } = await supabase
          .from("time_entries")
          .select("time_id, hours_logged")
          .eq("staff_id", staffId)
          .eq("engagement_id", group.engagement_id)
          .eq("activity_id", group.activity_id)
          .eq("date_worked", group.date_worked)
          .eq("is_forecast", false)
          .maybeSingle();

        if (selectError) {
          console.error("Select existing entry error:", selectError);
          dbErrorCount += group.timerIds.length;
          const [wy, wm, wd] = weekStartStr.split("-").map(Number);
          const errWeek = format(new Date(wy, wm - 1, wd), "dd/MM/yyyy");
          const classified = classifyDbErrorMessage((selectError as { message?: string } | undefined)?.message ?? "");
          const weekIndex = dbErrorWeeks.indexOf(errWeek);
          if (weekIndex === -1) {
            dbErrorWeeks.push(errWeek);
            dbErrorMessages.push(classified);
          } else if (!dbErrorMessages[weekIndex] && classified) {
            dbErrorMessages[weekIndex] = classified;
          }
          continue;
        }

        if (existingEntry) {
          // Additive merge
          const newHours = existingEntry.hours_logged + roundedHours;
          const { error: updateError } = await supabase
            .from("time_entries")
            .update({ hours_logged: newHours })
            .eq("time_id", existingEntry.time_id);

          if (updateError) {
            console.error("Update merge error:", updateError);
            if (isWoNotApprovedError(updateError.message)) {
              woBlockedCount += group.timerIds.length;
              const code = engagementCodeMap.get(group.engagement_id)
                || group.engagement_id.slice(0, 8);
              woBlockedEngagementsSet.add(code);
            } else {
              dbErrorCount += group.timerIds.length;
              const [wy, wm, wd] = weekStartStr.split("-").map(Number);
              const errWeek = format(new Date(wy, wm - 1, wd), "dd/MM/yyyy");
              const classified = classifyDbErrorMessage((updateError as { message?: string } | undefined)?.message ?? "");
              const weekIndex = dbErrorWeeks.indexOf(errWeek);
              if (weekIndex === -1) {
                dbErrorWeeks.push(errWeek);
                dbErrorMessages.push(classified);
              } else if (!dbErrorMessages[weekIndex] && classified) {
                dbErrorMessages[weekIndex] = classified;
              }
            }
            continue;
          }

          mergedCount++;
          exportedTimerIds.push(...group.timerIds);
          for (const tid of group.timerIds) {
            importedMappings.push({ timer_id: tid, time_id: existingEntry.time_id });
          }
        } else {
          // Insert new
          const { data: newEntry, error: insertError } = await supabase
            .from("time_entries")
            .insert({
              staff_id: staffId,
              engagement_id: group.engagement_id,
              activity_id: group.activity_id,
              date_worked: group.date_worked,
              hours_logged: roundedHours,
              description: group.description,
              period_id: period.period_id,
              is_forecast: false,
            })
            .select("time_id")
            .single();

          if (insertError) {
            console.error("Insert error:", insertError);
            if (isWoNotApprovedError(insertError.message)) {
              woBlockedCount += group.timerIds.length;
              const code = engagementCodeMap.get(group.engagement_id)
                || group.engagement_id.slice(0, 8);
              woBlockedEngagementsSet.add(code);
            } else {
              dbErrorCount += group.timerIds.length;
              const [wy, wm, wd] = weekStartStr.split("-").map(Number);
              const errWeek = format(new Date(wy, wm - 1, wd), "dd/MM/yyyy");
              const classified = classifyDbErrorMessage((insertError as { message?: string } | undefined)?.message ?? "");
              const weekIndex = dbErrorWeeks.indexOf(errWeek);
              if (weekIndex === -1) {
                dbErrorWeeks.push(errWeek);
                dbErrorMessages.push(classified);
              } else if (!dbErrorMessages[weekIndex] && classified) {
                dbErrorMessages[weekIndex] = classified;
              }
            }
            continue;
          }

          newCount++;
          exportedTimerIds.push(...group.timerIds);
          for (const tid of group.timerIds) {
            importedMappings.push({ timer_id: tid, time_id: newEntry.time_id });
          }
        }
      }

      // Mark only exported entries as imported
      if (importedMappings.length > 0) {
        await markImported.mutateAsync(importedMappings);
      }

      // Bound engagement list for toast readability
      const woEngArr = Array.from(woBlockedEngagementsSet);
      const woBlockedEngagements = woEngArr.length > 3
        ? [...woEngArr.slice(0, 3), `(+${woEngArr.length - 3} más)`]
        : woEngArr;

      // Cache invalidation
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["timesheet-period"] });
      queryClient.invalidateQueries({ queryKey: ["timer_entries"] });
      queryClient.invalidateQueries({ queryKey: ["timer_entries_unimported"] });

      return { newCount, mergedCount, blockedCount, blockedWeeks, woBlockedCount, woBlockedEngagements, dbErrorCount, dbErrorWeeks, dbErrorMessages };
    } finally {
      setIsExporting(false);
    }
  };

  const analyzeExport = (
    allEntries: TimerEntry[],
    selectedIds: Set<string>
  ): PreflightAnalysis => {
    // Defensive re-filter to eligible only
    const eligible = allEntries.filter(
      (e) => e.ended_at != null && !e.is_imported
    );
    const eligibleIds = new Set(eligible.map((e) => e.timer_id));

    const groups = buildExportGroups(eligible);
    const conflicts = detectSplitSelectionConflicts(groups, selectedIds);

    // Determine if any group in the selected set has 2+ entries (consolidation)
    let hasConsolidation = false;
    for (const group of groups.values()) {
      const selectedInGroup = group.entries.filter((e) =>
        selectedIds.has(e.timer_id)
      );
      if (selectedInGroup.length >= 2) {
        hasConsolidation = true;
        break;
      }
    }

    const preview = buildConsolidationPreview(groups, selectedIds);

    return {
      groups,
      conflicts,
      hasConsolidation,
      hasConflicts: conflicts.length > 0,
      preview,
      eligibleIds,
      selectedIdsSnapshot: new Set(selectedIds),
    };
  };

  return { exportEntries, isExporting, analyzeExport };
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toISODateString, getWorkDays } from "@/lib/timesheetUtils";
import { getFiscalWeekNumber } from "@/lib/fiscalCalculations";
import { useCurrentStaff } from "./useCurrentStaff";
import { useLoggableEngagements, type LoggableEngagement } from "./useLoggableEngagements";
import { useEffect } from "react";

// Types
export interface TimesheetPeriod {
  period_id: string;
  staff_id: string;
  week_start_date: string;
  week_number: number;
  year: number;
  total_hours: number;
  deadline: string | null;
  is_period_locked: boolean;
  submitted_at: string | null;
}

export interface TimeEntry {
  time_id: string;
  staff_id: string;
  engagement_id: string;
  activity_id: string;
  date_worked: string;
  hours_logged: number;
  description: string | null;
  period_id: string | null;
  is_forecast: boolean;
}

// BUG 0828-186: tipo movido a useLoggableEngagements.ts (compartido con useApprovedEngagements
// y useManualEntryEngagements); se reexporta con este nombre porque varios módulos ya importan
// `ApprovedEngagement` desde este archivo. Incluye `funcion` (0827-184, ver ese campo en
// LoggableEngagement) para que TimesheetGrid/TimeSheet.tsx sigan funcionando tras el merge.
export type ApprovedEngagement = LoggableEngagement;

export interface ActivityCode {
  activity_id: string;
  activity_code: string;
  description: string;
  is_active: boolean;
  is_system: boolean;
  service?: { code: number } | null;
}

export interface TimesheetWeekData {
  period: TimesheetPeriod | null;
  entries: TimeEntry[];
  engagements: ApprovedEngagement[];
  activities: ActivityCode[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useTimesheetWeek(weekStartDate: Date, workDays: number = 5): TimesheetWeekData {
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const queryClient = useQueryClient();
  const staffId = staffRecord?.staff_id;
  const weekStartStr = toISODateString(weekStartDate);

  // Calculate week end for date range queries
  const weekDates = getWorkDays(weekStartDate, workDays);
  const weekEndStr = toISODateString(weekDates[weekDates.length - 1]);

  // Fetch or create timesheet period
  const periodQuery = useQuery({
    queryKey: ["timesheet-period", staffId, weekStartStr],
    queryFn: async () => {
      if (!staffId) return null;

      // First try to find existing period
      const { data: existing, error: fetchError } = await supabase
        .from("timesheet_periods")
        .select("*")
        .eq("staff_id", staffId)
        .eq("week_start_date", weekStartStr)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (existing) return existing as TimesheetPeriod;

      // Create new period if doesn't exist
      const weekNumber = getFiscalWeekNumber(weekStartDate);

      const { data: newPeriod, error: createError } = await supabase
        .from("timesheet_periods")
        .insert({
          staff_id: staffId,
          week_start_date: weekStartStr,
          week_number: weekNumber,
          year: weekStartDate.getFullYear(),
          total_hours: 0,
        })
        .select()
        .single();

      if (createError) throw createError;
      return newPeriod as TimesheetPeriod;
    },
    enabled: !!staffId && !staffLoading,
  });

  // Fetch time entries for the week
  const entriesQuery = useQuery({
    queryKey: ["time-entries", staffId, weekStartStr, weekEndStr],
    queryFn: async () => {
      if (!staffId) return [];

      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("staff_id", staffId)
        .gte("date_worked", weekStartStr)
        .lte("date_worked", weekEndStr)
        .eq("is_forecast", false);

      if (error) throw error;
      return (data || []) as TimeEntry[];
    },
    enabled: !!staffId && !staffLoading,
  });

  // BUG 0828-186: encargos elegibles para cargar horas, vía el RPC list_loggable_engagements
  // (SECURITY DEFINER, gateado por time_entry.create) -- sin filtro de asignación por diseño.
  const engagementsQuery = useLoggableEngagements(["approved-engagements", staffId], {
    enabled: !!staffId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch active activity codes
  const activitiesQuery = useQuery({
    queryKey: ["activity-codes-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_codes")
        .select("*, service:practicas(code)")
        .eq("is_active", true);

      if (error) throw error;
      const suffix = (code: string) => parseInt(code.match(/(\d+)$/)?.[1] ?? '0', 10);
      const prefix = (code: string) => code.replace(/\d+$/, '');
      return [...(data || []) as ActivityCode[]].sort((a, b) => {
        const pa = prefix(a.activity_code), pb = prefix(b.activity_code);
        if (pa !== pb) return pa.localeCompare(pb);
        return suffix(a.activity_code) - suffix(b.activity_code);
      });
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const refetch = () => {
    periodQuery.refetch();
    entriesQuery.refetch();
    engagementsQuery.refetch();
    activitiesQuery.refetch();
  };

  return {
    period: periodQuery.data || null,
    entries: entriesQuery.data || [],
    engagements: engagementsQuery.data || [],
    activities: activitiesQuery.data || [],
    isLoading:
      staffLoading ||
      periodQuery.isLoading ||
      entriesQuery.isLoading ||
      engagementsQuery.isLoading ||
      activitiesQuery.isLoading,
    isError:
      periodQuery.isError ||
      entriesQuery.isError ||
      engagementsQuery.isError ||
      activitiesQuery.isError,
    error:
      periodQuery.error ||
      entriesQuery.error ||
      engagementsQuery.error ||
      activitiesQuery.error,
    refetch,
  };
}

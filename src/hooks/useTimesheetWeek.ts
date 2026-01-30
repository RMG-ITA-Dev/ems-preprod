import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toISODateString, getWorkDays } from "@/lib/timesheetUtils";
import { useCurrentStaff } from "./useCurrentStaff";
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

export interface ApprovedEngagement {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  client: {
    client_id: string;
    client_legal_name: string;
  } | null;
}

export interface ActivityCode {
  activity_id: string;
  activity_code: string;
  description: string;
  is_active: boolean;
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
      const weekNumber = Math.ceil(
        (weekStartDate.getTime() - new Date(weekStartDate.getFullYear(), 0, 1).getTime()) /
          (7 * 24 * 60 * 60 * 1000)
      ) + 1;

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

  // BUG #19: Fetch engagements assigned to this staff member with approved work orders
  const engagementsQuery = useQuery({
    queryKey: ["approved-engagements", staffId],
    queryFn: async () => {
      if (!staffId) return [];
      
      // First get approved work orders
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select("engagement_id")
        .eq("approval_status", "Approved");

      if (woError) throw woError;

      const approvedEngagementIds = workOrders?.map((wo) => wo.engagement_id) || [];

      if (approvedEngagementIds.length === 0) return [];

      // Get engagements where staff is partner, manager, or has logged time before
      const { data: engagements, error: engError } = await supabase
        .from("engagements")
        .select(`
          engagement_id,
          engagement_code,
          engagement_name,
          partner_id,
          manager_id,
          client:clients!client_id(client_id, client_legal_name)
        `)
        .in("engagement_id", approvedEngagementIds)
        .eq("status", "active");

      if (engError) throw engError;
      
      // Get engagements where staff has logged time before
      const { data: previousTimeEntries, error: teError } = await supabase
        .from("time_entries")
        .select("engagement_id")
        .eq("staff_id", staffId);
      
      if (teError) throw teError;
      
      const engagementsWithPriorTime = new Set(
        previousTimeEntries?.map((te) => te.engagement_id) || []
      );
      
      // Filter to only engagements where staff is assigned or has prior time
      const filteredEngagements = (engagements || []).filter((eng) => 
        eng.partner_id === staffId ||
        eng.manager_id === staffId ||
        engagementsWithPriorTime.has(eng.engagement_id)
      );

      return filteredEngagements as ApprovedEngagement[];
    },
    enabled: !!staffId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch active activity codes
  const activitiesQuery = useQuery({
    queryKey: ["activity-codes-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_codes")
        .select("*")
        .eq("is_active", true)
        .order("activity_code");

      if (error) throw error;
      return (data || []) as ActivityCode[];
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

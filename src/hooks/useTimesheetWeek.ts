import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toISODateString, getWorkDays } from "@/lib/timesheetUtils";
import { getFiscalWeekNumber } from "@/lib/fiscalCalculations";
import { canLogHours, type EngagementState } from "@/lib/engagementStatus";
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
  activity_required: boolean;
  work_order_required: boolean;
  is_internal: boolean;
  practica: number | null;     // service code (matches services.code) — for activity filtering
  start_date: string | null;   // BUG 0220-63
  end_date: string | null;     // BUG 0220-63
  engagement_state_override?: number | null;  // FEAT 0602-135: override manual del estado
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

  // BUG #19: Fetch engagements eligible for timesheet (two-filter: eligibility + visibility)
  const engagementsQuery = useQuery({
    queryKey: ["approved-engagements", staffId],
    queryFn: async () => {
      if (!staffId) return [];

      // Group A: Active engagements with approved WOs (existing logic)
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select("engagement_id")
        .eq("approval_status", "Approved");
      if (woError) throw woError;

      const approvedEngagementIds = workOrders?.map((wo) => wo.engagement_id) || [];

      let groupA: ApprovedEngagement[] = [];
      if (approvedEngagementIds.length > 0) {
        const { data, error } = await supabase
          .from("engagements")
          .select(`
            engagement_id, engagement_code, engagement_name,
            activity_required, work_order_required, is_internal, practica,
            start_date, end_date, engagement_state_override,
            client:clients!client_id(client_id, client_legal_name)
          `)
          .in("engagement_id", approvedEngagementIds)
          .eq("status", "active");
        if (error) throw error;
        groupA = (data || []) as ApprovedEngagement[];
      }

      // Group B: Active engagements where work_order_required = false
      // Visibility: is_internal=true (all staff) OR assigned (partner/manager) OR admin
      const { data: isAdminResult } = await supabase.rpc("is_admin");
      const isAdmin = !!isAdminResult;

      let groupBQuery = supabase
        .from("engagements")
        .select(`
          engagement_id, engagement_code, engagement_name,
          activity_required, work_order_required, is_internal, practica,
          start_date, end_date, engagement_state_override,
          client:clients!client_id(client_id, client_legal_name)
        `)
        // FEAT 0602-135: administrativos (sin OT) O con override manual Aprobado/Emergencia (4/5).
        .or("work_order_required.eq.false,engagement_state_override.in.(4,5)")
        .eq("status", "active");

      if (!isAdmin) {
        // FEAT 0602-135: override 4/5 (aprobado manual) visible para todo el staff, como una OT aprobada.
        groupBQuery = groupBQuery.or(
          `is_internal.eq.true,partner_id.eq.${staffId},manager_id.eq.${staffId},engagement_state_override.in.(4,5)`
        );
      }

      const { data: groupBData, error: groupBError } = await groupBQuery;
      if (groupBError) throw groupBError;
      const groupB = (groupBData || []) as ApprovedEngagement[];

      // Merge and deduplicate by engagement_id
      const merged = new Map<string, ApprovedEngagement>();
      for (const e of groupA) merged.set(e.engagement_id, e);
      for (const e of groupB) merged.set(e.engagement_id, e);

      // FEAT 0602-135: excluir encargos cuyo override manual impide cargar horas
      // (6 Cancelado, 7 Finalizado, 9 Congelado, u otro no-cargable).
      return Array.from(merged.values()).filter(
        (e) => e.engagement_state_override == null || canLogHours(e.engagement_state_override as EngagementState),
      );
    },
    enabled: !!staffId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch active activity codes
  const activitiesQuery = useQuery({
    queryKey: ["activity-codes-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_codes")
        .select("*, service:services(code)")
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

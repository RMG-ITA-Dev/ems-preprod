import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCurrentStaff } from "./useCurrentStaff";
import { createMutationErrorHandler } from "@/lib/error-handler";

export interface LineApproval {
  approval_id: string;
  period_id: string;
  engagement_id: string;
  status: "pending" | "approved" | "rejected";
  approved_by: string | null;
  approved_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  period?: {
    period_id: string;
    week_start_date: string;
    week_number: number;
    year: number;
    staff_id: string;
    staff?: {
      staff_id: string;
      first_name: string;
      last_name: string;
      short_name: string | null;
    };
  };
  engagement?: {
    engagement_id: string;
    engagement_code: string | null;
    engagement_name: string;
  };
}

export interface PendingApprovalSummary {
  period_id: string;
  staff_id: string;
  week_start_date: string;
  week_number: number;
  year: number;
  staff: {
    staff_id: string;
    first_name: string;
    last_name: string;
    short_name: string | null;
  };
  totalPendingHours: number;
  pendingLineCount: number;
}

export interface TimeEntryForApproval {
  time_id: string;
  date_worked: string;
  hours_logged: number;
  description: string | null;
  engagement_id: string;
  activity_id: string;
  engagement?: {
    engagement_id: string;
    engagement_code: string | null;
    engagement_name: string;
  };
  activity?: {
    activity_id: string;
    activity_code: string;
    description: string;
  };
}

export interface StaffTimesheetForApproval {
  period: {
    period_id: string;
    week_start_date: string;
    week_number: number;
    year: number;
    staff_id: string;
  };
  staff: {
    staff_id: string;
    first_name: string;
    last_name: string;
    short_name: string | null;
  };
  timeEntries: TimeEntryForApproval[];
  lineApprovals: LineApproval[];
  approvableEngagementIds: string[];
}

// Fetch pending approval summaries grouped by staff/week with total hours
export function usePendingApprovalSummaries() {
  const { staffRecord } = useCurrentStaff();

  return useQuery({
    queryKey: ["pending-approval-summaries", staffRecord?.staff_id],
    queryFn: async () => {
      if (!staffRecord) return [];

      // First get all pending line approvals
      const { data: approvals, error: approvalsError } = await supabase
        .from("timesheet_line_approvals")
        .select(`
          approval_id,
          period_id,
          engagement_id,
          status,
          period:timesheet_periods(
            period_id,
            week_start_date,
            week_number,
            year,
            staff_id,
            staff:staff!timesheet_periods_staff_id_fkey(
              staff_id,
              first_name,
              last_name,
              short_name
            )
          )
        `)
        .eq("status", "pending");

      if (approvalsError) throw approvalsError;

      // Get unique period IDs
      const periodIds = [...new Set((approvals || []).map((a) => a.period_id))];
      if (periodIds.length === 0) return [];

      // Fetch time entries for these periods to calculate hours
      const { data: timeEntries, error: entriesError } = await supabase
        .from("time_entries")
        .select("period_id, engagement_id, hours_logged")
        .in("period_id", periodIds);

      if (entriesError) throw entriesError;

      // ── Batch eligibility check (single RPC) ─────────────────────────
      // Build parallel arrays of unique (period_id, engagement_id) pairs
      const uniquePairKeys = [...new Set(
        (approvals || []).map((a) => `${a.period_id}:${a.engagement_id}`)
      )];
      const pairPeriodIds = uniquePairKeys.map((k) => k.split(":")[0]);
      const pairEngagementIds = uniquePairKeys.map((k) => k.split(":")[1]);

      // Single RPC replaces N individual can_approve_timesheet_line calls
      const { data: approvablePairs, error: eligibilityError } = await supabase.rpc(
        "get_approvable_pairs",
        {
          p_period_ids: pairPeriodIds,
          p_engagement_ids: pairEngagementIds,
        }
      );

      if (eligibilityError) throw eligibilityError;

      // Build lookup set from returned pairs
      const approvableKeys = new Set<string>(
        (approvablePairs || []).map(
          (p: { period_id: string; engagement_id: string }) =>
            `${p.period_id}:${p.engagement_id}`
        )
      );

      // Rebuild summaries with only approvable lines
      const filteredMap = new Map<string, PendingApprovalSummary>();

      (approvals || []).forEach((approval) => {
        const key = `${approval.period_id}:${approval.engagement_id}`;
        if (!approvableKeys.has(key)) return;

        const periodId = approval.period_id;
        const period = approval.period as any;
        if (!period || !period.staff) return;

        if (!filteredMap.has(periodId)) {
          filteredMap.set(periodId, {
            period_id: periodId,
            staff_id: period.staff_id,
            week_start_date: period.week_start_date,
            week_number: period.week_number,
            year: period.year,
            staff: period.staff,
            totalPendingHours: 0,
            pendingLineCount: 0,
          });
        }

        const summary = filteredMap.get(periodId)!;
        summary.pendingLineCount++;

        const engagementHours = (timeEntries || [])
          .filter(
            (te) =>
              te.period_id === periodId &&
              te.engagement_id === approval.engagement_id
          )
          .reduce((sum, te) => sum + (te.hours_logged || 0), 0);

        summary.totalPendingHours += engagementHours;
      });

      return Array.from(filteredMap.values()).sort((a, b) => {
        const dateCompare = b.week_start_date.localeCompare(a.week_start_date);
        if (dateCompare !== 0) return dateCompare;
        const nameA = a.staff.short_name || `${a.staff.first_name} ${a.staff.last_name}`;
        const nameB = b.staff.short_name || `${b.staff.first_name} ${b.staff.last_name}`;
        return nameA.localeCompare(nameB);
      });
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes — approval eligibility doesn't change within a session
    enabled: !!staffRecord,
  });
}

// Fetch full timesheet data for a specific period (for approval detail view)
export function useStaffTimesheetForApproval(periodId: string | null) {
  const { staffRecord } = useCurrentStaff();

  return useQuery({
    queryKey: ["staff-timesheet-for-approval", periodId, staffRecord?.staff_id],
    queryFn: async (): Promise<StaffTimesheetForApproval | null> => {
      if (!periodId || !staffRecord) return null;

      // Fetch period with staff info
      const { data: period, error: periodError } = await supabase
        .from("timesheet_periods")
        .select(`
          period_id,
          week_start_date,
          week_number,
          year,
          staff_id,
          staff:staff!timesheet_periods_staff_id_fkey(
            staff_id,
            first_name,
            last_name,
            short_name
          )
        `)
        .eq("period_id", periodId)
        .single();

      if (periodError) throw periodError;

      // Fetch all time entries for this period
      const { data: timeEntries, error: entriesError } = await supabase
        .from("time_entries")
        .select(`
          time_id,
          date_worked,
          hours_logged,
          description,
          engagement_id,
          activity_id,
          engagement:engagements(
            engagement_id,
            engagement_code,
            engagement_name
          ),
          activity:activity_codes(
            activity_id,
            activity_code,
            description
          )
        `)
        .eq("period_id", periodId)
        .order("date_worked");

      if (entriesError) throw entriesError;

      // Fetch line approvals for this period
      const { data: lineApprovals, error: approvalsError } = await supabase
        .from("timesheet_line_approvals")
        .select(`
          approval_id,
          period_id,
          engagement_id,
          status,
          approved_by,
          approved_at,
          review_notes,
          created_at,
          updated_at
        `)
        .eq("period_id", periodId);

      if (approvalsError) throw approvalsError;

      // ── Batch eligibility check (single RPC) ─────────────────────────
      const engagementIds = [...new Set((timeEntries || []).map((te) => te.engagement_id))];
      let approvableEngagementIds: string[] = [];

      if (engagementIds.length > 0) {
        // All pairs share the same periodId — build parallel arrays
        const batchPeriodIds = engagementIds.map(() => periodId);

        const { data: approvablePairs, error: eligibilityError } = await supabase.rpc(
          "get_approvable_pairs",
          {
            p_period_ids: batchPeriodIds,
            p_engagement_ids: engagementIds,
          }
        );

        if (eligibilityError) throw eligibilityError;

        approvableEngagementIds = (approvablePairs || []).map(
          (p: { period_id: string; engagement_id: string }) => p.engagement_id
        );
      }

      return {
        period: {
          period_id: period.period_id,
          week_start_date: period.week_start_date,
          week_number: period.week_number,
          year: period.year,
          staff_id: period.staff_id,
        },
        staff: period.staff as any,
        timeEntries: (timeEntries || []).map((te) => ({
          time_id: te.time_id,
          date_worked: te.date_worked,
          hours_logged: te.hours_logged,
          description: te.description,
          engagement_id: te.engagement_id,
          activity_id: te.activity_id,
          engagement: te.engagement as any,
          activity: te.activity as any,
        })),
        lineApprovals: (lineApprovals || []) as LineApproval[],
        approvableEngagementIds,
      };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!periodId && !!staffRecord,
  });
}

// Legacy hook for backward compatibility
export function usePendingApprovals() {
  const { staffRecord } = useCurrentStaff();

  return useQuery({
    queryKey: ["pending-approvals", staffRecord?.staff_id],
    queryFn: async () => {
      if (!staffRecord) return [];

      const { data, error } = await supabase
        .from("timesheet_line_approvals")
        .select(`
          *,
          period:timesheet_periods(
            period_id,
            week_start_date,
            week_number,
            year,
            staff_id,
            staff:staff!timesheet_periods_staff_id_fkey(
              staff_id,
              first_name,
              last_name,
              short_name
            )
          ),
          engagement:engagements(
            engagement_id,
            engagement_code,
            engagement_name
          )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as LineApproval[];
    },
    enabled: !!staffRecord,
  });
}

// Fetch line approvals for a specific period
export function usePeriodLineApprovals(periodId: string | null) {
  return useQuery({
    queryKey: ["period-line-approvals", periodId],
    queryFn: async () => {
      if (!periodId) return [];

      const { data, error } = await supabase
        .from("timesheet_line_approvals")
        .select(`
          *,
          engagement:engagements(
            engagement_id,
            engagement_code,
            engagement_name
          ),
          approver:staff!timesheet_line_approvals_approved_by_fkey(
            staff_id,
            first_name,
            last_name,
            short_name
          )
        `)
        .eq("period_id", periodId);

      if (error) throw error;
      return (data || []) as LineApproval[];
    },
    enabled: !!periodId,
  });
}

// Approve a timesheet line
export function useApproveTimesheetLine() {
  const queryClient = useQueryClient();
  const { staffRecord } = useCurrentStaff();

  return useMutation({
    mutationFn: async (approvalId: string) => {
      if (!staffRecord) throw new Error("No staff record found");

      const { data, error } = await supabase
        .from("timesheet_line_approvals")
        .update({
          status: "approved",
          approved_by: staffRecord.staff_id,
          approved_at: new Date().toISOString(),
        })
        .eq("approval_id", approvalId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approval-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["staff-timesheet-for-approval"] });
      toast.success("Line approved successfully");
    },
    onError: createMutationErrorHandler("approving line"),
  });
}

// Approve multiple timesheet lines
export function useBulkApproveTimesheetLines() {
  const queryClient = useQueryClient();
  const { staffRecord } = useCurrentStaff();

  return useMutation({
    mutationFn: async (approvalIds: string[]) => {
      if (!staffRecord) throw new Error("No staff record found");

      const { data, error } = await supabase
        .from("timesheet_line_approvals")
        .update({
          status: "approved",
          approved_by: staffRecord.staff_id,
          approved_at: new Date().toISOString(),
        })
        .in("approval_id", approvalIds)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approval-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["staff-timesheet-for-approval"] });
      toast.success(`${data?.length || 0} lines approved successfully`);
    },
    onError: createMutationErrorHandler("approving lines"),
  });
}

// Reject a timesheet line
export function useRejectTimesheetLine() {
  const queryClient = useQueryClient();
  const { staffRecord } = useCurrentStaff();

  return useMutation({
    mutationFn: async ({
      approvalId,
      notes,
    }: {
      approvalId: string;
      notes?: string;
    }) => {
      if (!staffRecord) throw new Error("No staff record found");

      const { data, error } = await supabase
        .from("timesheet_line_approvals")
        .update({
          status: "rejected",
          approved_by: staffRecord.staff_id,
          approved_at: new Date().toISOString(),
          review_notes: notes || null,
        })
        .eq("approval_id", approvalId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approval-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["staff-timesheet-for-approval"] });
      toast.success("Line rejected");
    },
    onError: createMutationErrorHandler("rejecting line"),
  });
}

// Reject multiple timesheet lines
export function useBulkRejectTimesheetLines() {
  const queryClient = useQueryClient();
  const { staffRecord } = useCurrentStaff();

  return useMutation({
    mutationFn: async ({
      approvalIds,
      notes,
    }: {
      approvalIds: string[];
      notes?: string;
    }) => {
      if (!staffRecord) throw new Error("No staff record found");

      const { data, error } = await supabase
        .from("timesheet_line_approvals")
        .update({
          status: "rejected",
          approved_by: staffRecord.staff_id,
          approved_at: new Date().toISOString(),
          review_notes: notes || null,
        })
        .in("approval_id", approvalIds)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approval-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["staff-timesheet-for-approval"] });
      toast.success(`${data?.length || 0} lines rejected`);
    },
    onError: createMutationErrorHandler("rejecting lines"),
  });
}

// Request revision - reset approved line back to pending for corrections
export function useRequestRevision() {
  const queryClient = useQueryClient();
  const { staffRecord } = useCurrentStaff();

  return useMutation({
    mutationFn: async ({
      approvalId,
      notes,
    }: {
      approvalId: string;
      notes: string;
    }) => {
      if (!staffRecord) throw new Error("No staff record found");

      const { data, error } = await supabase
        .from("timesheet_line_approvals")
        .update({
          status: "pending",
          approved_by: null,
          approved_at: null,
          review_notes: notes,
        })
        .eq("approval_id", approvalId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approval-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["staff-timesheet-for-approval"] });
      queryClient.invalidateQueries({ queryKey: ["timesheet-week"] });
      toast.success("Revision requested - timesheet returned for correction");
    },
    onError: createMutationErrorHandler("requesting revision"),
  });
}

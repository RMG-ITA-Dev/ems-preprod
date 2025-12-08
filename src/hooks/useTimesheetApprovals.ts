import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCurrentStaff } from "./useCurrentStaff";

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

// Fetch pending approvals for the current approver
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
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      toast({ title: "Line approved successfully" });
    },
    onError: (error) => {
      toast({
        title: "Error approving line",
        description: error.message,
        variant: "destructive",
      });
    },
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
      queryClient.invalidateQueries({ queryKey: ["period-line-approvals"] });
      toast({ title: "Line rejected" });
    },
    onError: (error) => {
      toast({
        title: "Error rejecting line",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

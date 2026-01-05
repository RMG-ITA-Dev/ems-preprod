import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";

// ============= Industries =============
export function useCreateIndustry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { industry_name: string; fiscal_year_end: string }) => {
      const { data: result, error } = await supabase
        .from("industries")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["industries"] });
      toast.success("Industry created successfully");
    },
    onError: createMutationErrorHandler("creating industry"),
  });
}

export function useUpdateIndustry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { industry_name?: string; fiscal_year_end?: string } }) => {
      const { data: result, error } = await supabase
        .from("industries")
        .update(data)
        .eq("industry_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["industries"] });
      toast.success("Industry updated successfully");
    },
    onError: createMutationErrorHandler("updating industry"),
  });
}

export function useDeleteIndustry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("industries").delete().eq("industry_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["industries"] });
      toast.success("Industry deleted successfully");
    },
    onError: createMutationErrorHandler("deleting industry"),
  });
}

// ============= Categories =============
export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      category_name: string;
      display_order?: number;
      rate_high_bob: number;
      rate_low_bob: number;
      rate_high_usd: number;
      rate_low_usd: number;
      can_approve_wo?: boolean;
    }) => {
      const { data: result, error } = await supabase
        .from("categories")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category created successfully");
    },
    onError: createMutationErrorHandler("creating category"),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        category_name: string;
        display_order: number;
        rate_high_bob: number;
        rate_low_bob: number;
        rate_high_usd: number;
        rate_low_usd: number;
        can_approve_wo: boolean;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("categories")
        .update(data)
        .eq("category_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category updated successfully");
    },
    onError: createMutationErrorHandler("updating category"),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("category_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category deleted successfully");
    },
    onError: createMutationErrorHandler("deleting category"),
  });
}

// ============= Activity Codes =============
export function useCreateActivityCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { activity_code: string; description: string; is_active?: boolean }) => {
      const { data: result, error } = await supabase
        .from("activity_codes")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity_codes"] });
      toast.success("Activity code created successfully");
    },
    onError: createMutationErrorHandler("creating activity code"),
  });
}

export function useUpdateActivityCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ activity_code: string; description: string; is_active: boolean }>;
    }) => {
      const { data: result, error } = await supabase
        .from("activity_codes")
        .update(data)
        .eq("activity_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity_codes"] });
      toast.success("Activity code updated successfully");
    },
    onError: createMutationErrorHandler("updating activity code"),
  });
}

export function useDeleteActivityCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("activity_codes").delete().eq("activity_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity_codes"] });
      toast.success("Activity code deleted successfully");
    },
    onError: createMutationErrorHandler("deleting activity code"),
  });
}

// ============= Expense Types =============
export function useCreateExpenseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { expense_name: string; default_unit_cost?: number }) => {
      const { data: result, error } = await supabase
        .from("expense_types")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense_types"] });
      toast.success("Expense type created successfully");
    },
    onError: createMutationErrorHandler("creating expense type"),
  });
}

export function useUpdateExpenseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ expense_name: string; default_unit_cost: number }>;
    }) => {
      const { data: result, error } = await supabase
        .from("expense_types")
        .update(data)
        .eq("expense_type_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense_types"] });
      toast.success("Expense type updated successfully");
    },
    onError: createMutationErrorHandler("updating expense type"),
  });
}

export function useDeleteExpenseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_types").delete().eq("expense_type_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense_types"] });
      toast.success("Expense type deleted successfully");
    },
    onError: createMutationErrorHandler("deleting expense type"),
  });
}

// ============= Staff =============
export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      first_name: string;
      last_name: string;
      email?: string;
      category_id?: string;
      is_active?: boolean;
    }) => {
      const { data: result, error } = await supabase
        .from("staff")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff member created successfully");
    },
    onError: createMutationErrorHandler("creating staff member"),
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        first_name: string;
        last_name: string;
        email: string;
        category_id: string;
        is_active: boolean;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("staff")
        .update(data)
        .eq("staff_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff member updated successfully");
    },
    onError: createMutationErrorHandler("updating staff member"),
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").delete().eq("staff_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff member deleted successfully");
    },
    onError: createMutationErrorHandler("deleting staff member"),
  });
}

// ============= Clients =============
export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      client_legal_name: string;
      unique_tax_id: string;
      industry_id?: string;
      contact_name?: string;
      contact_email?: string;
      contact_phone?: string;
      address?: string;
      is_active?: boolean;
    }) => {
      const { data: result, error } = await supabase
        .from("clients")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client created successfully");
    },
    onError: createMutationErrorHandler("creating client"),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        client_legal_name: string;
        unique_tax_id: string;
        industry_id: string;
        contact_name: string;
        contact_email: string;
        contact_phone: string;
        address: string;
        is_active: boolean;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("clients")
        .update(data)
        .eq("client_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client updated successfully");
    },
    onError: createMutationErrorHandler("updating client"),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("client_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client deleted successfully");
    },
    onError: createMutationErrorHandler("deleting client"),
  });
}

// ============= Engagements =============
export function useCreateEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      engagement_name: string;
      engagement_code?: string;
      client_id: string;
      partner_id?: string;
      manager_id?: string;
      start_date?: string;
      end_date?: string;
      status?: string;
    }) => {
      const { data: result, error } = await supabase
        .from("engagements")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      toast.success("Engagement created successfully");
    },
    onError: createMutationErrorHandler("creating engagement"),
  });
}

export function useUpdateEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        engagement_name: string;
        engagement_code: string;
        client_id: string;
        partner_id: string;
        manager_id: string;
        start_date: string;
        end_date: string;
        status: string;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("engagements")
        .update(data)
        .eq("engagement_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      toast.success("Engagement updated successfully");
    },
    onError: createMutationErrorHandler("updating engagement"),
  });
}

export function useDeleteEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("engagements").delete().eq("engagement_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      toast.success("Engagement deleted successfully");
    },
    onError: createMutationErrorHandler("deleting engagement"),
  });
}

// ============= Global Settings =============
export function useUpdateGlobalSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data: result, error } = await supabase
        .from("global_settings")
        .update({ setting_value: value })
        .eq("setting_key", key)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global_settings"] });
      toast.success("Setting updated successfully");
    },
    onError: createMutationErrorHandler("updating setting"),
  });
}

// ============= Work Orders =============
export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      engagement_id: string;
      currency: string;
      season_mode: string;
      tax_rate: number;
      adjustment_amount?: number;
      approval_status?: string;
    }) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      toast.success("Work order created successfully");
    },
    onError: createMutationErrorHandler("creating work order"),
  });
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        adjustment_amount: number;
        approval_status: string;
        approved_by: string;
        approved_at: string;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update(data)
        .eq("wo_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success("Work order updated successfully");
    },
    onError: createMutationErrorHandler("updating work order"),
  });
}

export function useSubmitWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (woId: string) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({ approval_status: "Pending_Approval" })
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success("Work order submitted for approval");
    },
    onError: createMutationErrorHandler("submitting work order"),
  });
}

export function useApproveWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ woId, staffId }: { woId: string; staffId: string }) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          approval_status: "Approved",
          approved_by: staffId,
          approved_at: new Date().toISOString(),
        })
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success("Work order approved");
    },
    onError: createMutationErrorHandler("approving work order"),
  });
}

export function useRejectWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (woId: string) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({ approval_status: "Draft" })
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success("Work order rejected");
    },
    onError: createMutationErrorHandler("rejecting work order"),
  });
}

// ============= Budget Lines =============
export function useCreateBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      wo_id: string;
      category_id: string;
      budgeted_hours: number;
      standard_rate: number;
    }) => {
      const { data: result, error } = await supabase
        .from("wo_budget_lines")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
    },
    onError: createMutationErrorHandler("creating budget line"),
  });
}

export function useUpdateBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        category_id: string;
        budgeted_hours: number;
        standard_rate: number;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("wo_budget_lines")
        .update(data)
        .eq("wo_line_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
    },
    onError: createMutationErrorHandler("updating budget line"),
  });
}

export function useDeleteBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wo_budget_lines").delete().eq("wo_line_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
    },
    onError: createMutationErrorHandler("deleting budget line"),
  });
}

// ============= Expense Budget =============
export function useCreateExpenseBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      wo_id: string;
      expense_type_id: string;
      budgeted_amount: number;
    }) => {
      const { data: result, error } = await supabase
        .from("wo_expense_budget")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
    },
    onError: createMutationErrorHandler("creating expense budget"),
  });
}

export function useUpdateExpenseBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        expense_type_id: string;
        budgeted_amount: number;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("wo_expense_budget")
        .update(data)
        .eq("wo_exp_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
    },
    onError: createMutationErrorHandler("updating expense budget"),
  });
}

export function useDeleteExpenseBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wo_expense_budget").delete().eq("wo_exp_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
    },
    onError: createMutationErrorHandler("deleting expense budget"),
  });
}

// ============= Admin: Time Entries =============
export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      time_id,
      ...data
    }: {
      time_id: string;
      date_worked?: string;
      hours_logged?: number;
      description?: string | null;
    }) => {
      const { data: result, error } = await supabase
        .from("time_entries")
        .update(data)
        .eq("time_id", time_id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_time_entries"] });
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
      toast.success("Time entry updated successfully");
    },
    onError: createMutationErrorHandler("updating time entry"),
  });
}

// ============= Admin: Expense Logs =============
export function useUpdateExpenseLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      expense_log_id,
      ...data
    }: {
      expense_log_id: string;
      date_incurred?: string;
      amount?: number;
      currency?: string;
      description?: string | null;
      receipt_url?: string | null;
    }) => {
      const { data: result, error } = await supabase
        .from("expense_logs")
        .update(data)
        .eq("expense_log_id", expense_log_id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_expense_logs"] });
      queryClient.invalidateQueries({ queryKey: ["expense_logs"] });
      toast.success("Expense log updated successfully");
    },
    onError: createMutationErrorHandler("updating expense log"),
  });
}

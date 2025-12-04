import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
      toast({ title: "Industry created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating industry", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Industry updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating industry", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Industry deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting industry", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Category created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating category", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Category updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating category", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Category deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting category", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Activity code created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating activity code", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Activity code updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating activity code", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Activity code deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting activity code", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Expense type created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating expense type", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Expense type updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating expense type", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Expense type deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting expense type", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Staff member created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating staff member", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Staff member updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating staff member", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Staff member deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting staff member", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Client created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating client", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Client updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating client", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Client deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting client", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Engagement created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating engagement", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Engagement updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating engagement", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Engagement deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting engagement", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Setting updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating setting", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Work order created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating work order", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Work order updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating work order", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Work order submitted for approval" });
    },
    onError: (error) => {
      toast({ title: "Error submitting work order", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Work order approved" });
    },
    onError: (error) => {
      toast({ title: "Error approving work order", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Work order rejected" });
    },
    onError: (error) => {
      toast({ title: "Error rejecting work order", description: error.message, variant: "destructive" });
    },
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
    onError: (error) => {
      toast({ title: "Error creating budget line", description: error.message, variant: "destructive" });
    },
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
    onError: (error) => {
      toast({ title: "Error updating budget line", description: error.message, variant: "destructive" });
    },
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
    onError: (error) => {
      toast({ title: "Error deleting budget line", description: error.message, variant: "destructive" });
    },
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
    onError: (error) => {
      toast({ title: "Error creating expense budget", description: error.message, variant: "destructive" });
    },
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
    onError: (error) => {
      toast({ title: "Error updating expense budget", description: error.message, variant: "destructive" });
    },
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
    onError: (error) => {
      toast({ title: "Error deleting expense budget", description: error.message, variant: "destructive" });
    },
  });
}

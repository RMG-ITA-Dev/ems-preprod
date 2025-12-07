import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Category {
  category_id: string;
  category_name: string;
  rate_high_bob: number;
  rate_low_bob: number;
  rate_high_usd: number;
  rate_low_usd: number;
  display_order: number;
  can_approve_wo: boolean;
}

export interface Industry {
  industry_id: string;
  industry_name: string;
  fiscal_year_end: string;
}

export interface Staff {
  staff_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  category_id: string | null;
  is_active: boolean;
  city: string | null;
  id_number: string | null;
  aud_reg_number: string | null;
  category?: Category;
}

export interface Client {
  client_id: string;
  client_legal_name: string;
  unique_tax_id: string;
  industry_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  is_active: boolean;
  industry?: Industry;
}

export interface Engagement {
  engagement_id: string;
  client_id: string;
  engagement_name: string;
  engagement_code: string | null;
  partner_id: string | null;
  manager_id: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  client?: Client;
  partner?: Staff;
  manager?: Staff;
}

export interface WorkOrder {
  wo_id: string;
  engagement_id: string;
  currency: 'USD' | 'BOB';
  season_mode: 'High' | 'Low';
  tax_rate: number;
  adjustment_amount: number;
  approval_status: 'Draft' | 'Pending_Approval' | 'Approved' | 'Rejected';
  approved_by: string | null;
  approved_at: string | null;
  engagement?: Engagement;
  budget_lines?: WOBudgetLine[];
  expense_budget?: WOExpenseBudget[];
}

export interface WOExpenseBudget {
  wo_exp_id: string;
  wo_id: string;
  expense_type_id: string;
  budgeted_amount: number;
  expense_type?: ExpenseType;
}

export interface WOBudgetLine {
  wo_line_id: string;
  wo_id: string;
  category_id: string;
  budgeted_hours: number;
  standard_rate: number;
  category?: Category;
}

export interface ActivityCode {
  activity_id: string;
  activity_code: string;
  description: string;
  is_active: boolean;
}

export interface TimeEntry {
  time_id: string;
  date_worked: string;
  hours_logged: number;
  staff_id: string;
  engagement_id: string;
  activity_id: string;
  description: string | null;
  staff?: Staff;
  engagement?: Engagement;
  activity?: ActivityCode;
}

export interface ExpenseType {
  expense_type_id: string;
  expense_name: string;
  default_unit_cost: number;
}

export interface ExpenseLog {
  expense_log_id: string;
  date_incurred: string;
  amount: number;
  currency: 'USD' | 'BOB';
  engagement_id: string;
  expense_type_id: string;
  description: string | null;
  engagement?: Engagement;
  expense_type?: ExpenseType;
}

export interface GlobalSetting {
  setting_key: string;
  setting_value: string;
  description: string | null;
}

// Hooks
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useIndustries() {
  return useQuery({
    queryKey: ['industries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('industries')
        .select('*')
        .order('industry_name');
      if (error) throw error;
      return data as Industry[];
    },
  });
}

export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select(`
          *,
          category:categories(*)
        `)
        .eq('is_active', true)
        .order('last_name');
      if (error) throw error;
      return data as Staff[];
    },
  });
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          industry:industries(*)
        `)
        .order('client_legal_name');
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useEngagements() {
  return useQuery({
    queryKey: ['engagements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('engagements')
        .select(`
          *,
          client:clients(*),
          partner:staff!engagements_partner_id_fkey(*),
          manager:staff!engagements_manager_id_fkey(*)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Engagement[];
    },
  });
}

export function useWorkOrders() {
  return useQuery({
    queryKey: ['work_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          engagement:engagements(
            *,
            client:clients(*),
            partner:staff!engagements_partner_id_fkey(*),
            manager:staff!engagements_manager_id_fkey(*)
          ),
          budget_lines:wo_budget_lines(
            *,
            category:categories(*)
          ),
          expense_budget:wo_expense_budget(
            *,
            expense_type:expense_types(*)
          )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WorkOrder[];
    },
  });
}

export function useWorkOrderById(id: string) {
  return useQuery({
    queryKey: ['work_order', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          engagement:engagements(
            *,
            client:clients(
              *,
              industry:industries(*)
            )
          ),
          budget_lines:wo_budget_lines(
            *,
            category:categories(*)
          ),
          expense_budget:wo_expense_budget(
            *,
            expense_type:expense_types(*)
          )
        `)
        .eq('wo_id', id)
        .maybeSingle();
      if (error) throw error;
      return data as WorkOrder | null;
    },
    enabled: !!id,
  });
}

export function useActivityCodes() {
  return useQuery({
    queryKey: ['activity_codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_codes')
        .select('*')
        .eq('is_active', true)
        .order('activity_code');
      if (error) throw error;
      return data as ActivityCode[];
    },
  });
}

export function useTimeEntries() {
  return useQuery({
    queryKey: ['time_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          staff:staff(*),
          engagement:engagements(*, client:clients(*)),
          activity:activity_codes(*)
        `)
        .order('date_worked', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as TimeEntry[];
    },
  });
}

export function useExpenseTypes() {
  return useQuery({
    queryKey: ['expense_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_types')
        .select('*')
        .order('expense_name');
      if (error) throw error;
      return data as ExpenseType[];
    },
  });
}

export function useExpenseLogs() {
  return useQuery({
    queryKey: ['expense_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_logs')
        .select(`
          *,
          engagement:engagements(*, client:clients(*)),
          expense_type:expense_types(*)
        `)
        .order('date_incurred', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ExpenseLog[];
    },
  });
}

export function useGlobalSettings() {
  return useQuery({
    queryKey: ['global_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_settings')
        .select('*');
      if (error) throw error;
      return data as GlobalSetting[];
    },
  });
}

// Helper to get a specific setting
export function useSetting(key: string) {
  const { data: settings } = useGlobalSettings();
  return settings?.find(s => s.setting_key === key)?.setting_value;
}

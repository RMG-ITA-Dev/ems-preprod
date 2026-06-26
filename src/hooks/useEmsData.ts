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
  can_approve_timesheets: boolean;
  default_app_role: string | null;
}

export interface Industry {
  industry_id: string;
  industry_name: string;
  fiscal_year_end: string;
}

// Staff interface for staff_directory view (non-sensitive fields only)
// PII fields (email, id_number, aud_reg_number, auth_user_id) are NOT included
export interface Staff {
  staff_id: string;
  first_name: string;
  last_name: string;
  short_name: string | null;
  initials: string | null;
  category_id: string | null;
  is_active: boolean;
  city: string | null;
  hire_date?: string | null;
  category?: Category;
}

// Competency assignment row joined with its skill master row
export interface StaffSkillWithSkill {
  staff_skill_id: string;
  skill_id: string;
  proficiency_level: string;
  last_evaluated_date: string | null;
  skill: {
    skill_id: string;
    name: string;
    category: string;
    is_active: boolean | null;
  };
}

// Full staff interface for admin use only
export interface StaffFull extends Staff {
  email: string | null;
  id_number: string | null;
  aud_reg_number: string | null;
  hire_date: string | null;
  auth_user_id: string | null;
  termination_date: string | null;
  is_blocked: boolean | null;
  staff_skills?: StaffSkillWithSkill[];
}

// Client interface - includes unique_tax_id (NIT is public tax ID, not sensitive)
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

// Full client interface for admin use only (includes tax ID)
export interface ClientFull extends Client {
  unique_tax_id: string;
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
  created_at: string | null;
  work_order_required: boolean;
  activity_required: boolean;
  is_internal: boolean;
  approval_required: boolean;
  oficina:     number | null;
  practica:    number | null;
  anio_fiscal: number | null;
  funcion:     number | null;
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
  notes: string | null;
  ceac_completed_at?: string | null;
  ceac_notes?: string | null;
  san_completed_at?: string | null;
  san_notes?: string | null;
  ceac_number?: string | null;
  san_approval_id?: string | null;
  risk_level?: string | null;
  risk_status?: string | null;
  risk_approved_by?: string | null;
  risk_approved_at?: string | null;
  risk_notes?: string | null;
  emergency_deadline_at?: string | null;
  emergency_justification?: string | null;
  emergency_review_by?: string | null;
  emergency_review_at?: string | null;
  emergency_partner_by?: string | null;
  emergency_partner_at?: string | null;
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

export interface Service {
  service_id: string;
  name: string;
  code: number;
  allows_rates_activities: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Skill {
  skill_id: string;
  name: string;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

export interface GlobalSetting {
  setting_key: string;
  setting_value: string;
  description: string | null;
}

// Hooks
export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('services')
        .select('*')
        .order('code');
      if (error) throw error;
      return data as Service[];
    },
  });
}

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

// useStaff returns non-sensitive data (for dropdowns, etc.)
// Queries base table with explicit non-PII columns to allow embedded joins
export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      // Query base table with explicit non-PII columns
      // This allows embedded joins while excluding sensitive fields
      const { data, error } = await supabase
        .from('staff')
        .select(`
          staff_id,
          first_name,
          last_name,
          short_name,
          initials,
          category_id,
          city,
          is_active,
          category:categories(*)
        `)
        .eq('is_active', true)
        .order('last_name');
      if (error) throw error;
      return data as Staff[];
    },
  });
}

// useStaffFull returns all staff data including PII (admin-only, from base staff table)
// This will fail for non-admin users due to RLS policies
export function useStaffFull() {
  return useQuery({
    queryKey: ['staff_full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select(`
          *,
          category:categories(*),
          staff_skills (
            staff_skill_id,
            skill_id,
            proficiency_level,
            last_evaluated_date,
            skill:skills ( skill_id, name, category, is_active )
          )
        `)
        .order('last_name');
      if (error) throw error;
      return data as StaffFull[];
    },
  });
}

// useActiveSkills returns all active competencies from the catalog for dropdown population
export function useActiveSkills() {
  return useQuery({
    queryKey: ['skills', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skills')
        .select('skill_id, name, category')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as { skill_id: string; name: string; category: string }[];
    },
  });
}

// useClients returns client data including NIT (unique_tax_id is public tax ID, not sensitive)
// Queries base table with explicit columns to allow embedded joins
export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          client_id,
          client_legal_name,
          unique_tax_id,
          industry_id,
          contact_name,
          contact_email,
          contact_phone,
          address,
          is_active,
          industry:industries(*)
        `)
        .order('client_legal_name');
      if (error) throw error;
      return data as Client[];
    },
  });
}

// useClientsFull returns all client data including tax ID (admin-only)
// This will fail for non-admin users due to RLS policies
export function useClientsFull() {
  return useQuery({
    queryKey: ['clients_full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          industry:industries(*)
        `)
        .order('client_legal_name');
      if (error) throw error;
      return data as ClientFull[];
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

export function useSkills() {
  return useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Skill[];
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

// Admin hooks for all time entries
export function useAllTimeEntries() {
  return useQuery({
    queryKey: ['all_time_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          staff:staff(staff_id, first_name, last_name, short_name),
          engagement:engagements(engagement_id, engagement_name, engagement_code),
          activity:activity_codes(activity_id, activity_code, description)
        `)
        .order('date_worked', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}


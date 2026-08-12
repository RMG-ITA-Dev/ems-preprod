import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import {
  aggregateRequirements,
  type AggregatedRequirement,
  type WorkOrderRequirementInput,
} from "@/lib/staffingMatch";

// Fase 3 — Work Order Staffing Requirements (esquema canónico de Fase 2).
export type StaffingProficiencyLevel = "Beginner" | "Intermediate" | "Advanced";

export interface Category {
  category_id: string;
  category_name: string;
  service_id: string;
  rate_high_bob: number;
  rate_low_bob: number;
  rate_high_usd: number;
  rate_low_usd: number;
  display_order: number;
  can_approve_wo: boolean;
  can_approve_timesheets: boolean;
  default_app_role: string | null;
  service?: Service;
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
  society_id: string;
  service_id: string;
  is_active: boolean;
  city: string | null;
  hire_date?: string | null;
  category?: Category;
}

// FEAT 0810-173: catálogo interno de sociedades (Ruizmier Pelaez / Ruizmier
// Juaregui), sin ABM — solo lectura.
export interface Society {
  society_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
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
  fecha_cierre: string;
  anio_fiscal_override: boolean;
  sqr_id: string | null;
  encargado_id: string | null;
  specialist_it_id: string | null;
  specialist_tax_id: string | null;
  contract_file_path: string | null;
  // FEAT 0602-135: override manual del estado del encargo (1..9). NULL = derivado de la OT.
  engagement_state_override?: number | null;
  taxonomy_id: string | null;
  client?: Client;
  partner?: Staff;
  manager?: Staff;
  sqr?: Staff;
  encargado?: Staff;
  specialist_it?: Staff;
  specialist_tax?: Staff;
  // FEAT 0602-135: OT asociada (1:1) para derivar el estado efectivo. Normalizada a objeto o null.
  work_order?: {
    approval_status: string | null;
    approved_at: string | null;
    risk_status: string | null;
  } | null;
  taxonomy?: Taxonomy;
}

export interface WOPaymentInstallment {
  installment_id: string;
  plan_id: string;
  wo_id: string;
  installment_number: number;
  agreed_invoice_date: string | null;
  agreed_payment_date: string | null;
  collection_invoice_date: string | null;
  collection_payment_date: string | null;
  payment_date_actual: string | null;
  percentage: number;
  amount: number | null;
  status: string;
}

export interface WOPaymentPlan {
  plan_id: string;
  wo_id: string;
  exchange_rate: number | null;
  payment_days: number;
  installments?: WOPaymentInstallment[];
}

export interface WorkOrder {
  wo_id: string;
  engagement_id: string;
  currency: 'USD' | 'BOB' | 'USDT';
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
  payment_plan?: WOPaymentPlan | null;
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
  service_id: string | null;
  entity_type: string;
  service?: Service;
}

export interface Service {
  service_id: string;
  name: string;
  code: number;
  allows_rates_activities: boolean;
  is_active: boolean;
  created_at: string;
  abbreviation?: string | null;
}

export interface Taxonomy {
  taxonomy_id: string;
  code: string;
  name: string;
  service_id: string | null;
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

// FEAT 0810-173: sociedades activas para el selector de StaffForm. Catálogo
// interno sin ABM — solo lectura (RLS: SELECT-only para authenticated).
export function useSocieties() {
  return useQuery({
    queryKey: ['societies'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('society')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Society[];
    },
  });
}

export function useTaxonomies() {
  return useQuery({
    queryKey: ['taxonomies'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('taxonomies')
        .select('*')
        .order('code');
      if (error) throw error;
      return data as Taxonomy[];
    },
  });
}

// useCategories(serviceId?) — no argument returns ALL categories (Staff / WO
// pickers rely on this). Passing a serviceId scopes the list to one service,
// keyed separately so the Settings rates tab can switch services independently.
export function useCategories(serviceId?: string) {
  return useQuery({
    queryKey: ['categories', serviceId ?? 'all'],
    queryFn: async () => {
      let query = supabase.from('categories').select('*');
      if (serviceId) {
        query = query.eq('service_id', serviceId);
      }
      const { data, error } = await query.order('display_order');
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
          society_id,
          service_id,
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
// Va por RPC, no por `select *`: el SELECT de `staff.id_number` y
// `staff.aud_reg_number` está revocado a `authenticated` (20260730080000), así que
// un `select *` desde el cliente ahora falla con 42501. `get_staff_full()` es
// SECURITY DEFINER y está gateada por has_permission('staff.read'), y devuelve la
// MISMA forma que traía el select (fila + category + staff_skills.skill anidado).
//
// Antes esto sí "fallaba para no-admin" como decía el comentario original, pero
// dejó de ser cierto en junio: la policy de directorio (20260610050000) habilitó
// la lectura de filas del personal activo a cualquier usuario con ficha, y RLS no
// filtra columnas — o sea que el PII venía incluido.
export function useStaffFull() {
  return useQuery({
    queryKey: ['staff_full'],
    queryFn: async () => {
      // NOTA: get_staff_full aún no está en types.ts (se regenera tras aplicar
      // la migración). Hasta entonces casteamos el nombre.
      const { data, error } = await supabase.rpc('get_staff_full' as never);
      if (error) throw error;
      return (data ?? []) as unknown as StaffFull[];
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

// Fase 3 — hooks de lectura de Scheduler L2 (esquema canónico de Fase 2).
// wo_staffing_requirements / wo_staffing_requirement_skills todavía no están
// en src/integrations/supabase/types.ts (se regenera en una fase posterior
// desde el Supabase real) — se consultan con el mismo escape (supabase as
// any) que development ya usa para tablas/vistas aún no tipadas (ver
// useServices/useTaxonomies arriba). engagement_assignments SÍ está tipada
// pero su columna category_id (Fase 2/3) todavía no aparece en ese archivo,
// así que también usa el escape hasta que se regenere.

export interface WorkOrderStaffingRequirementSkill {
  id: string;
  skill_id: string;
  min_proficiency_level: StaffingProficiencyLevel;
  skill: {
    skill_id: string;
    name: string;
    category: string;
    is_active: boolean | null;
  };
}

export interface WorkOrderStaffingRequirementWithSkills {
  id: string;
  wo_id: string;
  category_id: string;
  staff_count: number;
  category: Category;
  requirement_skills: WorkOrderStaffingRequirementSkill[];
}

// Una asignación de staff a un engagement, acotada en el tiempo. Se
// permiten varios segmentos no solapados por (engagement, staff)
// (re-asignación tras un vacío); el Gantt de L2 los renderiza apilados.
export interface EngagementAssignmentRow {
  assignment_id: string;
  engagement_id: string;
  staff_id: string;
  category_id: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  allocation_percent: number;
  notes: string | null;
  status: string;
  staff: {
    staff_id: string;
    first_name: string;
    last_name: string;
    short_name: string | null;
    category_id: string | null;
  };
  category: Category;
}

// Guarda defensiva de esquema: entre el merge del PR y la aplicación de la
// migración en Lovable, la tabla/columna puede no existir todavía (42P01
// tabla, 42703 columna, PGRST200 no puede resolver el embed). Se loguean para
// diagnosticar rollout, pero cada consumidor decide si puede degradar a vacío;
// Work Order staffing debe propagarlos para no guardar un estado incompleto.
const SCHEMA_NOT_READY_CODES = new Set(["42P01", "42703", "PGRST200"]);

function isSchedulerSchemaNotReady(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const notReady = !!code && SCHEMA_NOT_READY_CODES.has(code);
  if (notReady) {
    logger.error(
      `Schema not ready (${code}): propagating read failure instead of fabricating empty data. ` +
        "A migration is likely missing or partially applied for the Scheduler tables.",
      error
    );
  }
  return notReady;
}

// Viewer-keyed (precedente useEngagementAssignments) para que un cambio de
// cuenta en la misma SPA no reutilice la caché del viewer anterior. Columnas
// explícitas (no "*") y orden estable (categoría por display_order, skills
// por nombre) para que el estado sea comparable en el dirty-check de Fase 4.
export function useWorkOrderStaffingRequirements(workOrderId: string | undefined) {
  const { user } = useAuth();
  const viewerId = user?.id;
  return useQuery({
    queryKey: ["workOrderStaffingRequirements", viewerId, workOrderId],
    enabled: Boolean(viewerId && workOrderId),
    queryFn: async ({ signal }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("wo_staffing_requirements")
        .select(
          "id, wo_id, category_id, staff_count, " +
            "category:categories(category_id, category_name, service_id, display_order), " +
            "requirement_skills:wo_staffing_requirement_skills(id, skill_id, min_proficiency_level, skill:skills(skill_id, name, category, is_active))"
        )
        .eq("wo_id", workOrderId)
        .abortSignal(signal);
      if (error) {
        isSchedulerSchemaNotReady(error);
        throw error;
      }
      const rows = (data ?? []) as WorkOrderStaffingRequirementWithSkills[];
      return [...rows]
        .sort((a, b) => (a.category?.display_order ?? 999) - (b.category?.display_order ?? 999))
        .map((row) => ({
          ...row,
          requirement_skills: [...row.requirement_skills].sort((a, b) =>
            (a.skill?.name ?? "").localeCompare(b.skill?.name ?? "")
          ),
        }));
    },
  });
}

// Asignaciones activas (no soft-deleted) de un engagement, con staff y
// categoría embebidos para mostrar. Ordenadas por start_date.
export function useEngagementAssignments(engagementId: string | undefined) {
  const { user } = useAuth();
  const viewerId = user?.id;
  return useQuery({
    queryKey: ["engagementAssignments", viewerId, engagementId],
    enabled: Boolean(viewerId && engagementId),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("engagement_assignments")
        .select(
          "assignment_id, engagement_id, staff_id, category_id, start_date, end_date, hours_per_week, allocation_percent, notes, status, " +
            // Dos FKs apuntan a staff (staff_id, created_by) — desambiguar.
            "staff:staff!engagement_assignments_staff_id_fkey(staff_id, first_name, last_name, short_name, category_id), " +
            "category:categories(*)"
        )
        .eq("engagement_id", engagementId)
        .is("deleted_at", null)
        .order("start_date");
      if (error) {
        if (isSchedulerSchemaNotReady(error)) return [];
        throw error;
      }
      return (data ?? []) as EngagementAssignmentRow[];
    },
  });
}

// Requerimientos de staffing agregados de un engagement: unión de los
// requerimientos de sus work orders, colapsados a uno por categoría vía
// aggregateRequirements() — el min_proficiency_level más estricto gana por
// (categoría, skill).
export function useEngagementAggregatedRequirements(engagementId: string | undefined) {
  const { user } = useAuth();
  const viewerId = user?.id;
  return useQuery({
    queryKey: ["engagementAggregatedReqs", viewerId, engagementId],
    enabled: Boolean(viewerId && engagementId),
    queryFn: async (): Promise<AggregatedRequirement[]> => {
      const { data: wos, error: woError } = await supabase
        .from("work_orders")
        .select("wo_id")
        .eq("engagement_id", engagementId!);
      if (woError) throw woError;
      const woIds = (wos ?? []).map((w) => w.wo_id);
      if (woIds.length === 0) return [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("wo_staffing_requirements")
        .select(
          "category_id, requirement_skills:wo_staffing_requirement_skills(skill_id, min_proficiency_level, skill:skills(name))"
        )
        .in("wo_id", woIds);
      if (error) {
        if (isSchedulerSchemaNotReady(error)) return [];
        throw error;
      }
      return aggregateRequirements((data ?? []) as WorkOrderRequirementInput[]);
    },
  });
}

// Staff activo con sus competencias embebidas, para el selector de
// candidatos (solo lectura en Fase 3 — la escritura es Fase 5). Cliente
// tipado: staff, staff_skills e is_schedulable ya están en types.ts.
export interface StaffWithSkills extends Staff {
  staff_skills: StaffSkillWithSkill[];
  /** El selector de staff del Scheduler solo ofrece staff "schedulable". */
  is_schedulable?: boolean | null;
}

export function useActiveStaffWithSkills() {
  return useQuery({
    queryKey: ["staff", "activeWithSkills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select(
          `
          staff_id,
          first_name,
          last_name,
          short_name,
          initials,
          category_id,
          society_id,
          service_id,
          city,
          is_active,
          is_schedulable,
          category:categories(*),
          staff_skills (
            staff_skill_id,
            skill_id,
            proficiency_level,
            last_evaluated_date,
            skill:skills ( skill_id, name, category, is_active )
          )
        `
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("last_name");
      if (error) throw error;
      return data as unknown as StaffWithSkills[];
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
          partner:staff!engagements_partner_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
          manager:staff!engagements_manager_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
          sqr:staff!engagements_sqr_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
          encargado:staff!engagements_encargado_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
          specialist_it:staff!engagements_specialist_it_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
          specialist_tax:staff!engagements_specialist_tax_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
          taxonomy:taxonomies(*)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // FEAT 0602-135: el estado de la OT para el badge se lee de la vista RLS-safe
      // engagement_wo_state (work_orders SELECT es team/admin-only, pero el listado de encargos
      // es legible por todos; el embed directo devolvía null para no-team → badge Pendiente falso).
      // La vista expone solo los 3 campos de estado.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: woStates, error: woErr } = await (supabase as any)
        .from('engagement_wo_state')
        .select('engagement_id, approval_status, approved_at, risk_status');
      if (woErr) throw woErr;
      const woMap = new Map<string, Engagement['work_order']>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((woStates ?? []) as any[]).map((w) => [
          w.engagement_id,
          { approval_status: w.approval_status, approved_at: w.approved_at, risk_status: w.risk_status },
        ]),
      );
      const rows = (data ?? []).map((row) => ({
        ...row,
        work_order: woMap.get((row as { engagement_id: string }).engagement_id) ?? null,
      }));
      return rows as unknown as Engagement[];
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
            partner:staff!engagements_partner_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
            manager:staff!engagements_manager_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
            sqr:staff!engagements_sqr_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
            encargado:staff!engagements_encargado_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
            specialist_it:staff!engagements_specialist_it_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
            specialist_tax:staff!engagements_specialist_tax_id_fkey(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active)
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
          ),
          payment_plan:wo_payment_plan(
            *,
            installments:wo_payment_installments(*)
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
        .select('*, service:services(code)')
        .eq('is_active', true);
      if (error) throw error;
      const suffix = (code: string) => parseInt(code.match(/(\d+)$/)?.[1] ?? '0', 10);
      const prefix = (code: string) => code.replace(/\d+$/, '');
      return [...(data as ActivityCode[])].sort((a, b) => {
        const pa = prefix(a.activity_code), pb = prefix(b.activity_code);
        if (pa !== pb) return pa.localeCompare(pb);
        return suffix(a.activity_code) - suffix(b.activity_code);
      });
    },
  });
}

export function useAllActivityCodes() {
  return useQuery({
    queryKey: ['activity_codes', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_codes')
        .select('*, service:services(service_id, name, abbreviation)');
      if (error) throw error;
      const suffix = (code: string) => parseInt(code.match(/(\d+)$/)?.[1] ?? '0', 10);
      const prefix = (code: string) => code.replace(/\d+$/, '');
      return [...(data as ActivityCode[])].sort((a, b) => {
        const pa = prefix(a.activity_code), pb = prefix(b.activity_code);
        if (pa !== pb) return pa.localeCompare(pb);
        return suffix(a.activity_code) - suffix(b.activity_code);
      });
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
          staff:staff(staff_id, first_name, last_name, short_name, initials, category_id, city, is_active),
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


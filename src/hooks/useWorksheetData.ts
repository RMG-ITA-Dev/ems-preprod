import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Category, ActivityCode, Engagement } from "./useEmsData";
import { isHiddenFromActivePickers } from "@/lib/engagementStatus";
import { useCurrentStaff } from "./useCurrentStaff";

export interface Worksheet {
  id: string;
  engagement_id: string;
  wo_id: string | null;
  version: number;
  status: 'draft' | 'approved' | 'archived';
  notes: string | null;
  created_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
  engagement?: Engagement;
}

export interface WorksheetCell {
  id: string;
  worksheet_id: string;
  category_id: string;
  activity_id: string;
  budget_hours: number;
  created_at: string;
  updated_at: string;
  category?: Category;
  activity?: ActivityCode;
}

export interface WorksheetWithCells extends Worksheet {
  cells: WorksheetCell[];
}

// Fetch all worksheets with engagement info
export function useWorksheets(enabled: boolean = true) {
  return useQuery({
    queryKey: ["worksheets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_worksheets")
        .select(`
          *,
          engagement:engagements (
            engagement_id,
            engagement_name,
            engagement_code,
            status,
            practica,
            client:clients (
              client_id,
              client_legal_name,
              industry:industries (
                industry_id,
                industry_name,
                fiscal_year_end
              )
            ),
            partner:staff!engagements_partner_id_fkey (
              staff_id,
              first_name,
              last_name,
              short_name
            ),
            manager:staff!engagements_manager_id_fkey (
              staff_id,
              first_name,
              last_name,
              short_name
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Worksheet[];
    },
    enabled,
  });
}

// Fetch single worksheet with all cells
export function useWorksheetById(id: string | undefined) {
  return useQuery({
    queryKey: ["worksheet", id],
    queryFn: async () => {
      if (!id) return null;

      const { data: worksheet, error: wsError } = await supabase
        .from("activity_worksheets")
        .select(`
          *,
          engagement:engagements (
            engagement_id,
            engagement_name,
            engagement_code,
            status,
            practica,
            client:clients (
              client_id,
              client_legal_name,
              industry:industries (
                industry_id,
                industry_name,
                fiscal_year_end
              )
            ),
            partner:staff!engagements_partner_id_fkey (
              staff_id,
              first_name,
              last_name,
              short_name
            ),
            manager:staff!engagements_manager_id_fkey (
              staff_id,
              first_name,
              last_name,
              short_name
            )
          ),
          work_order:work_orders!activity_worksheets_wo_id_fkey (
            wo_id,
            approval_status
          )
        `)
        .eq("id", id)
        .maybeSingle();

      if (wsError) throw wsError;
      if (!worksheet) return null;

      // Fetch cells for this worksheet
      const { data: cells, error: cellsError } = await supabase
        .from("activity_worksheet_cells")
        .select(`
          *,
          category:categories (
            category_id,
            category_name,
            display_order
          ),
          activity:activity_codes (
            activity_id,
            activity_code,
            description
          )
        `)
        .eq("worksheet_id", id);

      if (cellsError) throw cellsError;

      return {
        ...worksheet,
        cells: cells || [],
      } as WorksheetWithCells & {
        work_order: { wo_id: string; approval_status: string } | null;
      };
    },
    enabled: !!id,
  });
}

// Fetch engagements that don't have a worksheet yet, created by the current user
// (BUG 0828-186 Punto D: "creado por mí", no responsable directo).
export function useEngagementsWithoutWorksheet() {
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const staffId = staffRecord?.staff_id;

  return useQuery({
    queryKey: ["engagements-without-worksheet", staffId],
    queryFn: async () => {
      // Get all active engagements created by the current user
      const { data: engagements, error: engError } = await supabase
        .from("engagements")
        .select(`
          engagement_id,
          engagement_name,
          engagement_code,
          status,
          engagement_state_override,
          created_by_staff_id,
          client:clients (
            client_id,
            client_legal_name
          ),
          partner:staff!engagements_partner_id_fkey (
            staff_id,
            first_name,
            last_name,
            short_name
          ),
          manager:staff!engagements_manager_id_fkey (
            staff_id,
            first_name,
            last_name,
            short_name
          )
        `)
        .eq("status", "active")
        .eq("created_by_staff_id", staffId);

      if (engError) throw engError;

      // Get all engagement IDs that already have worksheets
      const { data: worksheets, error: wsError } = await supabase
        .from("activity_worksheets")
        .select("engagement_id");

      if (wsError) throw wsError;

      const worksheetEngagementIds = new Set(worksheets?.map((w) => w.engagement_id) || []);

      // Filter out engagements that already have worksheets, and terminal/frozen states
      // (FEAT 0602-135: override 6/7/9 no aparecen en la Matriz de Trabajo aunque status='active').
      return (engagements || []).filter(
        (e) =>
          !worksheetEngagementIds.has(e.engagement_id) &&
          !isHiddenFromActivePickers((e as { engagement_state_override?: number | null }).engagement_state_override)
      ) as Engagement[];
    },
    enabled: !staffLoading && !!staffId,
  });
}

// Fetch worksheet by engagement ID (to check if one exists)
export function useWorksheetByEngagementId(engagementId: string | undefined) {
  return useQuery({
    queryKey: ["worksheet-by-engagement", engagementId],
    queryFn: async () => {
      if (!engagementId) return null;

      const { data, error } = await supabase
        .from("activity_worksheets")
        .select(`
          id, engagement_id, wo_id, status, version,
          work_order:work_orders!activity_worksheets_wo_id_fkey (
            wo_id,
            approval_status
          )
        `)
        .eq("engagement_id", engagementId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as {
        id: string;
        engagement_id: string;
        wo_id: string | null;
        status: string;
        version: number;
        work_order: { wo_id: string; approval_status: string } | null;
      } | null;
    },
    enabled: !!engagementId,
  });
}

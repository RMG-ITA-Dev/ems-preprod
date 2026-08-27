import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { createMutationErrorHandler } from "@/lib/error-handler";

interface CreateWorksheetInput {
  engagement_id: string;
  notes?: string;
  created_by_staff_id?: string;
}

interface UpdateWorksheetInput {
  id: string;
  status?: 'draft' | 'approved' | 'archived';
  notes?: string;
}

interface UpsertCellInput {
  worksheet_id: string;
  category_id: string;
  activity_id: string;
  budget_hours: number;
}

// 0825-183: the practice-scope trigger/RPC (enforce_worksheet_cell_practice_scope,
// batch_upsert_worksheet_cells) raise these exact codes as MESSAGE, with
// diagnostic ids in DETAIL — never interpolated into MESSAGE. Matched by exact
// equality (after trimming) only, so an unrelated error containing one of these
// strings as a substring doesn't get mismatched (review.md iteración 1, #5).
const WORKSHEET_CELL_ERROR_I18N_KEYS: Record<string, string> = {
  WORKSHEET_PRACTICE_REQUIRED: "workMatrix.errorPracticeRequired",
  WORKSHEET_CATEGORY_OUT_OF_SCOPE: "workMatrix.errorCategoryOutOfScope",
  WORKSHEET_ACTIVITY_OUT_OF_SCOPE: "workMatrix.errorActivityOutOfScope",
};

export function translateWorksheetCellsErrorKey(message: string | undefined | null): string | null {
  if (!message) return null;
  return WORKSHEET_CELL_ERROR_I18N_KEYS[message.trim()] ?? null;
}

interface DeleteCellInput {
  worksheet_id: string;
  category_id: string;
  activity_id: string;
}

export function useCreateWorksheet() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (input: CreateWorksheetInput) => {
      const { data, error } = await supabase
        .from("activity_worksheets")
        .insert({
          engagement_id: input.engagement_id,
          notes: input.notes || null,
          created_by_staff_id: input.created_by_staff_id || null,
          status: 'draft',
          version: 1,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worksheets"] });
      queryClient.invalidateQueries({ queryKey: ["engagements-without-worksheet"] });
      toast.success(t("messages.createSuccess", { entity: t("workMatrix.title") }));
    },
    onError: (error) => {
      logger.error("Error creating worksheet:", error);
      toast.error(t("messages.createError", { entity: t("workMatrix.title") }));
    },
  });
}

export function useUpdateWorksheet() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (input: UpdateWorksheetInput) => {
      const { data, error } = await supabase
        .from("activity_worksheets")
        .update({
          status: input.status,
          notes: input.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["worksheets"] });
      queryClient.invalidateQueries({ queryKey: ["worksheet", variables.id] });
      toast.success(t("messages.updateSuccess", { entity: t("workMatrix.title") }));
    },
    onError: (error) => {
      logger.error("Error updating worksheet:", error);
      toast.error(t("messages.updateError", { entity: t("workMatrix.title") }));
    },
  });
}

export function useDeleteWorksheet() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("activity_worksheets")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worksheets"] });
      queryClient.invalidateQueries({ queryKey: ["engagements-without-worksheet"] });
      toast.success(t("messages.deleteSuccess", { entity: t("workMatrix.title") }));
    },
    onError: (error) => {
      logger.error("Error deleting worksheet:", error);
      toast.error(t("messages.deleteError", { entity: t("workMatrix.title") }));
    },
  });
}

// Upsert a single cell (create or update) using native Postgres upsert
export function useUpsertCell() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertCellInput) => {
      const { error } = await supabase
        .from("activity_worksheet_cells")
        .upsert({
          worksheet_id: input.worksheet_id,
          category_id: input.category_id,
          activity_id: input.activity_id,
          budget_hours: input.budget_hours,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "worksheet_id,category_id,activity_id"
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["worksheet", variables.worksheet_id] });
    },
    onError: createMutationErrorHandler("saving cell"),
  });
}

// Batch upsert multiple cells
export function useBatchUpsertCells() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ worksheetId, cells }: { worksheetId: string; cells: UpsertCellInput[] }) => {
      // Delete-all + reinsert run inside one Postgres transaction via this RPC, so a cell
      // rejected by the service-scope trigger (enforce_worksheet_cell_service_scope) rolls
      // back the delete too, instead of leaving the worksheet emptied (review.md iteración 10).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("batch_upsert_worksheet_cells", {
        p_worksheet_id: worksheetId,
        p_cells: cells.map((c) => ({
          category_id: c.category_id,
          activity_id: c.activity_id,
          budget_hours: c.budget_hours,
        })),
      });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["worksheet", variables.worksheetId] });
      toast.success(t("messages.updateSuccess", { entity: t("workMatrix.title") }));
    },
    onError: (error) => {
      // Log the full error object (not just message) so DETAIL/hint survive for
      // diagnosis, even though only the bare code drives the toast (0825-183).
      logger.error("Error saving worksheet cells:", error);
      const i18nKey = translateWorksheetCellsErrorKey(error.message);
      toast.error(i18nKey ? t(i18nKey) : t("messages.updateError", { entity: t("workMatrix.title") }));
    },
  });
}

// Delete a single cell
export function useDeleteCell() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeleteCellInput) => {
      const { error } = await supabase
        .from("activity_worksheet_cells")
        .delete()
        .eq("worksheet_id", input.worksheet_id)
        .eq("category_id", input.category_id)
        .eq("activity_id", input.activity_id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["worksheet", variables.worksheet_id] });
    },
    onError: createMutationErrorHandler("deleting cell"),
  });
}

// Resync Worksheet to existing Work Order
export function useResyncWorksheetToWorkOrder() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ worksheetId, woId }: { worksheetId: string; woId: string }) => {
      const { error } = await supabase.rpc('sync_worksheet_to_wo_budget', {
        p_worksheet_id: worksheetId,
        p_wo_id: woId,
      });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      toast.success(t("workMatrix.resyncSuccess"));
    },
    onError: (error) => {
      logger.error("Error resyncing worksheet to work order:", error);
      toast.error(t("messages.updateError", { entity: t("entities.workOrder") }));
    },
  });
}

// Create Work Order from Worksheet using sync_worksheet_to_wo_budget RPC
interface CreateWOFromWorksheetInput {
  worksheetId: string;
  engagementId: string;
  currency: 'USD' | 'BOB';
  seasonMode: 'High' | 'Low';
  taxRate: number;
}

export function useCreateWorkOrderFromWorksheet() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (input: CreateWOFromWorksheetInput) => {
      // 1. Create the work order first
      const { data: wo, error: woError } = await supabase
        .from("work_orders")
        .insert({
          engagement_id: input.engagementId,
          currency: input.currency,
          season_mode: input.seasonMode,
          tax_rate: input.taxRate,
          adjustment_amount: 0,
          approval_status: 'Draft',
        })
        .select()
        .single();

      if (woError) throw woError;

      // 2. Call the sync function to populate budget lines from worksheet
      const { error: syncError } = await supabase.rpc('sync_worksheet_to_wo_budget', {
        p_worksheet_id: input.worksheetId,
        p_wo_id: wo.wo_id,
      });

      if (syncError) throw syncError;

      return wo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worksheets"] });
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["engagements-without-worksheet"] });
      toast.success(t("messages.createSuccess", { entity: t("entities.workOrder") }));
    },
    onError: (error) => {
      logger.error("Error creating work order from worksheet:", error);
      toast.error(t("messages.createError", { entity: t("entities.workOrder") }));
    },
  });
}

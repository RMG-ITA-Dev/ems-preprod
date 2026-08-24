import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";
import { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      practica_id: string;
      category_name: string;
      display_order?: number;
      rate_high_bob: number;
      rate_low_bob: number;
      rate_high_usd: number;
      rate_low_usd: number;
      can_approve_wo?: boolean;
      can_approve_timesheets?: boolean;
      default_app_role?: AppRole | null;
    }) => {
      // Position/shift handled transactionally in the DB (service-scoped order).
      const { data: result, error } = await supabase.rpc("create_category_for_practice", {
        p_practice_id: data.practica_id,
        p_category_name: data.category_name,
        p_display_order: data.display_order ?? null,
        p_rate_high_bob: data.rate_high_bob,
        p_rate_low_bob: data.rate_low_bob,
        p_rate_high_usd: data.rate_high_usd,
        p_rate_low_usd: data.rate_low_usd,
        p_can_approve_wo: data.can_approve_wo ?? false,
        p_can_approve_timesheets: data.can_approve_timesheets ?? false,
        p_default_app_role: data.default_app_role ?? null,
      });
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.category") }));
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
      data: {
        category_name: string;
        display_order: number;
        rate_high_bob: number;
        rate_low_bob: number;
        rate_high_usd: number;
        rate_low_usd: number;
        can_approve_wo: boolean;
        can_approve_timesheets: boolean;
        default_app_role: AppRole | null;
      };
    }) => {
      // Service is immutable on edit — never sent. Order changes reorder within
      // the same service transactionally.
      const { data: result, error } = await supabase.rpc("update_category_for_practice", {
        p_category_id: id,
        p_category_name: data.category_name,
        p_display_order: data.display_order,
        p_rate_high_bob: data.rate_high_bob,
        p_rate_low_bob: data.rate_low_bob,
        p_rate_high_usd: data.rate_high_usd,
        p_rate_low_usd: data.rate_low_usd,
        p_can_approve_wo: data.can_approve_wo,
        p_can_approve_timesheets: data.can_approve_timesheets,
        p_default_app_role: data.default_app_role,
      });
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.category") }));
    },
    onError: createMutationErrorHandler("updating category"),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Delete via RPC so the per-service order is compacted (gap-free 1..N).
      // A direct delete would leave a hole at the removed position.
      const { error } = await supabase.rpc("delete_category_for_practice", {
        p_category_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.category") }));
    },
    onError: createMutationErrorHandler("deleting category"),
  });
}

// Position-based reorder within a service (mirrors reorder_practice_activity).
export function useMoveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categoryId,
      newPosition,
    }: {
      categoryId: string;
      newPosition: number;
    }) => {
      const { error } = await supabase.rpc("move_category", {
        p_category_id: categoryId,
        p_new_position: newPosition,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.category") }));
    },
    onError: createMutationErrorHandler("reordering category"),
  });
}

// Copy the full category list of one service into another.
export function useCopyCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sourceServiceId,
      targetServiceId,
      replace,
    }: {
      sourceServiceId: string;
      targetServiceId: string;
      replace?: boolean;
    }) => {
      const { data, error } = await supabase.rpc("copy_categories_between_practices", {
        p_source_practice_id: sourceServiceId,
        p_target_practice_id: targetServiceId,
        p_replace: replace ?? false,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.category") }));
    },
    onError: (error: Error) => {
      const msg = error?.message ?? "";
      // target_not_empty is a control-flow signal: the dialog switches to the
      // replace confirmation, so no toast here.
      if (msg.includes("target_not_empty")) return;
      if (msg.includes("target_referenced")) {
        toast.error(i18n.t("category.targetReferenced"));
        return;
      }
      if (msg.includes("same_practice")) {
        toast.error(i18n.t("category.sameService"));
        return;
      }
      createMutationErrorHandler("copying categories")(error);
    },
  });
}

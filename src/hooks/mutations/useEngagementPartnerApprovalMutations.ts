import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

// 1110-220 (plan_v5 §6.5) — aprobación del Socio de un encargo no-Cliente SIN OT. La autoridad está en la base:
// decide_engagement_partner_approval (solo el Socio asignado; rechazar exige motivo) y
// resubmit_engagement_partner_approval (admin o el Talento Humano que lo creó, tras un rechazo). Las RPC aún no están en
// types.ts (se regenera con la herramienta tras migrar): mismo escape `as never` que el resto de RPC nuevas.

function invalidateEngagementQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["engagements"] });
  queryClient.invalidateQueries({ queryKey: ["engagement"] });
  queryClient.invalidateQueries({ queryKey: ["encargo-engagements"] });
}

export function useDecideEngagementPartnerApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { engagementId: string; approve: boolean; reason?: string }) => {
      const { error } = await supabase.rpc("decide_engagement_partner_approval" as never, {
        p_engagement_id: input.engagementId,
        p_approve: input.approve,
        p_reason: input.reason ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      invalidateEngagementQueries(queryClient);
      toast.success(
        i18n.t(input.approve ? "engagement.partnerApproval.approvedToast" : "engagement.partnerApproval.rejectedToast"),
      );
    },
    onError: createMutationErrorHandler("deciding engagement partner approval"),
  });
}

export function useResubmitEngagementPartnerApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (engagementId: string) => {
      const { error } = await supabase.rpc("resubmit_engagement_partner_approval" as never, {
        p_engagement_id: engagementId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateEngagementQueries(queryClient);
      toast.success(i18n.t("engagement.partnerApproval.resubmittedToast"));
    },
    onError: createMutationErrorHandler("resubmitting engagement partner approval"),
  });
}

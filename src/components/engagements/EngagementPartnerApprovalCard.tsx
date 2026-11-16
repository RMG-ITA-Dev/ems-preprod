import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDecideEngagementPartnerApproval,
  useResubmitEngagementPartnerApproval,
} from "@/hooks/mutations/useEngagementPartnerApprovalMutations";
import { partnerApprovalActions, type PartnerApprovalTarget } from "@/lib/engagementPartnerApproval";

// 1110-220 (plan_v5 §6.5) — aprobación del Socio de un encargo no-Cliente SIN OT, en el detalle del encargo. Muestra el
// estado (Pendiente / Aprobado / Rechazado + motivo) y, según quién mira, Aprobar/Rechazar (Socio asignado) o Reenviar
// (admin o Talento Humano creador, tras un rechazo). La base decide; esto solo ofrece lo que la base va a aceptar.

interface EngagementPartnerApprovalCardProps {
  engagement: PartnerApprovalTarget & { engagement_id: string; partner_approval_reason?: string | null };
  myStaffId: string | null | undefined;
  roleKey: string | null | undefined;
  /** El formulario del encargo tiene cambios sin guardar: reenviar ahora mandaría al Socio la versión vieja, y aprobar o
   *  rechazar decidiría sobre la versión guardada (y aprobar activa el candado: ya no deja guardar lo que se ve). */
  hasUnsavedChanges?: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export function EngagementPartnerApprovalCard({
  engagement,
  myStaffId,
  roleKey,
  hasUnsavedChanges = false,
}: EngagementPartnerApprovalCardProps) {
  const { t } = useTranslation();
  const decide = useDecideEngagementPartnerApproval();
  const resubmit = useResubmitEngagementPartnerApproval();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const status = engagement.partner_approval_status ?? "pending";
  const { canDecide, canResubmit } = partnerApprovalActions({ engagement, myStaffId, roleKey });
  const busy = decide.isPending || resubmit.isPending;

  return (
    <div className="border border-border bg-background/50 rounded-xl p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t(engagement.partner_approval_legacy_source ? "engagement.partnerApproval.legacyTitle" : "engagement.partnerApproval.title")}</h3>
          <p className="text-xs text-muted-foreground">{t(engagement.partner_approval_legacy_source ? "engagement.partnerApproval.legacyHelp" : "engagement.partnerApproval.help")}</p>
        </div>
        <Badge variant="outline" className={STATUS_BADGE[status] ?? STATUS_BADGE.pending}>
          {t(`engagement.partnerApproval.status.${status}`)}
        </Badge>
      </div>

      {status === "rejected" && engagement.partner_approval_reason && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t("engagement.partnerApproval.reasonLabel")}: </span>
          {engagement.partner_approval_reason}
        </p>
      )}

      {/* Rechazado: un solo camino. Primero se corrige y se guarda (botón Guardar Cambios del formulario), después se
          reenvía. Con cambios sin guardar, Reenviar queda deshabilitado y se dice por qué. */}
      {canDecide && hasUnsavedChanges && (
        <p className="text-sm text-muted-foreground">{t("engagement.partnerApproval.saveBeforeDecide")}</p>
      )}

      {canResubmit && (
        <p className="text-sm text-muted-foreground">
          {t(hasUnsavedChanges ? "engagement.partnerApproval.saveBeforeResubmit" : "engagement.partnerApproval.resubmitSteps")}
        </p>
      )}

      {(canDecide || canResubmit) && (
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          {canDecide && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy || hasUnsavedChanges}
                title={hasUnsavedChanges ? t("engagement.partnerApproval.saveBeforeDecide") : undefined}
                onClick={() => setRejectOpen(true)}
              >
                {t("engagement.partnerApproval.reject")}
              </Button>
              <LoadingButton
                type="button"
                loading={decide.isPending}
                // Review de Codex 1110-220: con cambios sin guardar se decidiría sobre la versión guardada, no la que se ve.
                disabled={busy || hasUnsavedChanges}
                title={hasUnsavedChanges ? t("engagement.partnerApproval.saveBeforeDecide") : undefined}
                onClick={() => decide.mutate({ engagementId: engagement.engagement_id, approve: true })}
              >
                {t("engagement.partnerApproval.approve")}
              </LoadingButton>
            </>
          )}
          {canResubmit && (
            <LoadingButton
              type="button"
              variant="outline"
              loading={resubmit.isPending}
              disabled={busy || hasUnsavedChanges}
              title={hasUnsavedChanges ? t("engagement.partnerApproval.saveBeforeResubmit") : undefined}
              onClick={() => resubmit.mutate(engagement.engagement_id)}
            >
              {t("engagement.partnerApproval.resubmit")}
            </LoadingButton>
          )}
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={(open) => { setRejectOpen(open); if (!open) setReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("engagement.partnerApproval.rejectTitle")}</DialogTitle>
            <DialogDescription>{t("engagement.partnerApproval.rejectDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="partner-approval-reason">{t("engagement.partnerApproval.reasonLabel")}</Label>
            <Textarea
              id="partner-approval-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              {t("common.cancel")}
            </Button>
            <LoadingButton
              type="button"
              variant="destructive"
              loading={decide.isPending}
              // También acá: los cambios pueden aparecer con el diálogo ya abierto.
              disabled={!reason.trim() || decide.isPending || hasUnsavedChanges}
              onClick={() =>
                decide.mutate(
                  { engagementId: engagement.engagement_id, approve: false, reason: reason.trim() },
                  { onSuccess: () => { setRejectOpen(false); setReason(""); } },
                )
              }
            >
              {t("engagement.partnerApproval.reject")}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

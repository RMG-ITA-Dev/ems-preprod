import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkOrderTrackStatus } from "@/components/forms/WorkOrderForm";
import {
  WorkOrderRiskNoteBanner,
  WorkOrderRiskSection,
} from "@/components/forms/WorkOrderRiskSection";
import { useRiskWorkOrder } from "@/hooks/useRiskWorkOrders";
import {
  useApproveEmergencyPartner,
  useApproveEmergencyReview,
  useApproveRisk,
  useRejectRisk,
} from "@/hooks/mutations/useWorkOrderMutations";
import { useAuthorization } from "@/hooks/useAuthorization";

type ApprovalStatus = "Draft" | "Pending_Approval" | "Approved" | "Rejected";

/**
 * Detalle de Riesgos de una OT (1028-213, D-14): solo los campos de Riesgos que devuelve
 * `get_risk_work_order` (sin montos, presupuesto, plan de pagos ni horas), con la tarjeta
 * compartida en solo lectura y las acciones de Riesgos conectadas a las funciones del servidor.
 * La emergencia funciona como en la OT: paso 1 revisión de Riesgos, paso 2 firma del Socio de
 * Riesgos (risk_partner o admin, D-38).
 */
const RiskDetail = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { woId } = useParams<{ woId: string }>();
  const { data: wo, isLoading, isError } = useRiskWorkOrder(woId);
  const { can, roleKey } = useAuthorization();
  const isAdmin = roleKey === "admin";

  const approveRisk = useApproveRisk();
  const rejectRisk = useRejectRisk();
  const approveEmergencyReview = useApproveEmergencyReview();
  const approveEmergencyPartner = useApproveEmergencyPartner();
  const isBusy =
    approveRisk.isPending ||
    rejectRisk.isPending ||
    approveEmergencyReview.isPending ||
    approveEmergencyPartner.isPending;

  const backToList = (
    <Button variant="cancel" onClick={() => navigate("/risks")} className="btn-action">
      {t("risks.backToList")}
    </Button>
  );

  if (isLoading) {
    return (
      <AppLayout title={t("workOrders.tabs.risk")} focusMode>
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  // NOT_FOUND del servidor: la OT no existe, es borrador, administrativa o de un encargo cancelado.
  if (isError || !wo) {
    return (
      <AppLayout title={t("workOrders.tabs.risk")} focusMode>
        <div className="space-y-4">
          {backToList}
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("risks.detailNotFound")}</AlertDescription>
          </Alert>
        </div>
      </AppLayout>
    );
  }

  const approvalStatus = (wo.approval_status ?? "Pending_Approval") as ApprovalStatus;
  const actingWoId = wo.wo_id;

  return (
    <AppLayout
      title={`${t("workOrders.tabs.risk")} - ${wo.engagement_code ?? ""}`}
      focusMode
    >
      <div className="space-y-6">
        <div>{backToList}</div>
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t("entities.engagement")}</p>
            <p className="font-semibold">
              {wo.engagement_code} - {wo.engagement_name}
            </p>
            <p className="text-sm text-muted-foreground">{wo.client_name}</p>
            <WorkOrderTrackStatus
              approvalStatus={approvalStatus}
              approvedAt={wo.approved_at}
              riskStatus={wo.risk_status}
              isSubmitting={isBusy}
              className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-2 text-sm"
            />
          </CardContent>
        </Card>

        <WorkOrderRiskSection
          approvalStatus={approvalStatus}
          riskStatus={wo.risk_status}
          ceacCompletedAt={wo.ceac_completed_at}
          sanCompletedAt={wo.san_completed_at}
          ceacNumber={wo.ceac_number}
          sanApprovalId={wo.san_approval_id}
          riskLevel={wo.risk_level}
          emergencyDeadlineAt={wo.emergency_deadline_at}
          emergencyReviewAt={wo.emergency_review_at}
          emergencyPartnerAt={wo.emergency_partner_at}
          emergencyJustification={wo.emergency_justification}
          isSubmitting={isBusy}
          canApproveRisk={isAdmin || can("work_order.risk.approve")}
          canSignEmergency={isAdmin || can("work_order.risk.emergency_sign")}
          onApproveRisk={() => approveRisk.mutate({ woId: actingWoId })}
          onRejectRisk={(riskNotes) => rejectRisk.mutate({ woId: actingWoId, riskNotes })}
          onApproveEmergencyReview={() => approveEmergencyReview.mutate({ woId: actingWoId })}
          onApproveEmergencyPartner={() => approveEmergencyPartner.mutate({ woId: actingWoId })}
        />

        <WorkOrderRiskNoteBanner riskStatus={wo.risk_status} riskNote={wo.risk_notes} />
      </div>
    </AppLayout>
  );
};

export default RiskDetail;

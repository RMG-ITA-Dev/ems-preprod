import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  XCircle,
  Send,
  Eraser,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isEmergencyTrack,
  isRiskAllEmpty,
  isRiskApprovalReady,
  showEmergencyPartner as computeShowEmergencyPartner,
  showEmergencyReview as computeShowEmergencyReview,
  showNormalRiskApprove as computeShowNormalRiskApprove,
} from "@/lib/workOrderRisk";

// Sentinel for the "Ninguno" option: Radix Select forbids an empty-string
// SelectItem value, so this maps back to `null` in onValueChange.
const RISK_LEVEL_NONE = "__none__";

export interface WorkOrderRiskSectionProps {
  approvalStatus: "Draft" | "Pending_Approval" | "Approved" | "Rejected";
  /** Funciones distintas de Cliente: no tienen pista de Riesgos real. */
  isAdministrative?: boolean;
  // Datos de la pista de Riesgos
  riskStatus?: string | null;
  ceacCompletedAt?: string | null;
  sanCompletedAt?: string | null;
  ceacNumber?: string | null;
  sanApprovalId?: string | null;
  riskLevel?: string | null;
  emergencyDeadlineAt?: string | null;
  emergencyReviewAt?: string | null;
  emergencyPartnerAt?: string | null;
  emergencyJustification?: string | null;
  isSubmitting: boolean;
  // Permisos
  canApproveRisk?: boolean;
  /**
   * D-38 / H-6: el paso 2 de emergencia (firma del Socio de Riesgos) es solo de `risk_partner` y
   * admin. Por defecto `true` para no cambiar a los llamadores existentes (WorkOrderEdit y
   * RiskDetail lo pasan explícito; el servidor es quien lo hace cumplir de verdad).
   */
  canSignEmergency?: boolean;
  // Edición del gerente. Sin ellos la tarjeta queda de solo lectura (RiskDetail).
  onRiskAssessmentChange?: (field: string, value: string | null) => void;
  onClearRiskData?: () => void;
  onCompleteRisk?: (emergencyJustification?: string) => void;
  /** Reenvío con los 5 campos vacíos: el diálogo de motivo vive en WorkOrderForm. */
  onRequestEmergencyResend?: () => void;
  // Acciones de Riesgos
  onApproveRisk?: () => void;
  onRejectRisk?: (riskNotes: string | null) => void;
  onApproveEmergencyReview?: () => void;
  onApproveEmergencyPartner?: () => void;
}

const fmtDate = (value: string) =>
  new Date(value + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

/**
 * Nota de rechazo de Riesgos (risk_notes), visible mientras se corrige (risk_status='Rejected').
 * Se exporta aparte porque WorkOrderForm la muestra fuera de las pestañas, y RiskDetail debajo
 * de la tarjeta (D-14).
 */
export function WorkOrderRiskNoteBanner({
  riskStatus,
  riskNote,
}: {
  riskStatus?: string | null;
  riskNote?: string | null;
}) {
  const { t } = useTranslation();
  if (riskStatus !== "Rejected" || !riskNote) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <span className="font-medium">{t("workOrders.riskRejectionNoteLabel")}</span> {riskNote}
    </div>
  );
}

/**
 * 1028-213 (D-16): tarjeta de Riesgos compartida entre la OT (pestaña Riesgos) y `/risks/:woId`.
 * Incluye la caja de acciones de Riesgos y el diálogo de rechazo. Sin callbacks de edición es
 * solo lectura. Las derivaciones de estado viven en `src/lib/workOrderRisk.ts`.
 */
export function WorkOrderRiskSection({
  approvalStatus,
  isAdministrative = false,
  riskStatus,
  ceacCompletedAt,
  sanCompletedAt,
  ceacNumber,
  sanApprovalId,
  riskLevel,
  emergencyDeadlineAt,
  emergencyReviewAt,
  emergencyPartnerAt,
  emergencyJustification,
  isSubmitting,
  canApproveRisk = false,
  canSignEmergency = true,
  onRiskAssessmentChange,
  onClearRiskData,
  onCompleteRisk,
  onRequestEmergencyResend,
  onApproveRisk,
  onRejectRisk,
  onApproveEmergencyReview,
  onApproveEmergencyPartner,
}: WorkOrderRiskSectionProps) {
  const { t } = useTranslation();
  const [rejectRiskDialogOpen, setRejectRiskDialogOpen] = useState(false);
  const [rejectRiskNotes, setRejectRiskNotes] = useState("");
  // Risk fields stay locked after an emergency approval until the Manager explicitly
  // opts to add the data via the "Agregar datos de Riesgo" button.
  const [addingRiskData, setAddingRiskData] = useState(false);

  const isDraft = approvalStatus === "Draft";
  const track = {
    riskStatus,
    ceacCompletedAt,
    ceacNumber,
    sanCompletedAt,
    sanApprovalId,
    riskLevel,
    emergencyReviewAt,
    emergencyPartnerAt,
  };
  const riskApproved =
    !isAdministrative && (riskStatus === "Approved" || riskStatus === "Emergency_Approved");
  const riskApprovalReady = isRiskApprovalReady(track);
  const riskAllEmpty = isRiskAllEmpty(track);
  const isEmergencyApproved = riskStatus === "Emergency_Approved";
  // Riesgos rejected its track: the OT stays Pending/Approved (Socio untouched); the
  // Manager corrects the risk data and re-sends only the Risk track.
  const isRiskRejected = riskStatus === "Rejected";
  const showEmergencyReason = !!emergencyJustification && isEmergencyTrack(track);
  // After an emergency approval the Manager must click "Agregar datos de Riesgo"
  // before the fields unlock for completion. Gate on the risk track only (isEmergencyApproved),
  // not on the global approval_status: the deadline starts when the risk track is signed off,
  // which can happen before the Socio track completes.
  const canCompleteRiskData = isEmergencyApproved && !!onCompleteRisk;
  // Risk fields are editable by the creator/Manager in Draft, again when an
  // emergency-approved OT completes its data, and when Riesgos rejected (to correct).
  // Una pista de Riesgos aprobada (Approved/Emergency_Approved) queda bloqueada aunque la
  // OT vuelva a Draft por "Retirar": al retirar solo se corrige lo que NO está aprobado.
  const riskFieldsEditable =
    (isDraft && !riskApproved && !!onRiskAssessmentChange) ||
    (canCompleteRiskData && addingRiskData) ||
    (isRiskRejected && !!onRiskAssessmentChange);
  // "Limpiar" en Draft normal (primera carga, sin rechazo aún): scoped al primer
  // disyunto de riskFieldsEditable para no duplicar el botón del bloque isRiskRejected.
  const showDraftClearRiskData =
    isDraft && !riskApproved && !isRiskRejected && !!onRiskAssessmentChange && !!onClearRiskData;
  // The Riesgos approver acts while risk is pending review — never on a rejected risk
  // track (waits for re-submission). The Socio and Riesgos tracks are independent, so a
  // Socio rejection must NOT hide the Risk actions: Riesgos can still sign off on its own
  // track even when the Socio has rejected the OT.
  const showRiskActions =
    canApproveRisk && !isDraft && riskStatus !== "Approved" && riskStatus !== "Rejected";
  const showNormalRiskApprove = computeShowNormalRiskApprove(track, !!onApproveRisk);
  const showEmergencyReview = computeShowEmergencyReview(track, !!onApproveEmergencyReview);
  // El predicado de la caja NO depende de `canSignEmergency`: un supervisor de Riesgos que no
  // puede firmar el paso 2 igual conserva "Rechazar" (AC-17). Solo el botón del paso 2 se gatea.
  const emergencyPartnerPending = computeShowEmergencyPartner(track, !!onApproveEmergencyPartner);
  const showEmergencyPartner = emergencyPartnerPending && canSignEmergency;
  const hasRiskAction = showNormalRiskApprove || showEmergencyReview || emergencyPartnerPending;

  // Risk-level color: Alto=red, Moderado=yellow, Bajo=green.
  const riskLevelColorClass =
    riskLevel === "Alto"
      ? "text-destructive"
      : riskLevel === "Moderado"
        ? "text-warning"
        : riskLevel === "Bajo"
          ? "text-success"
          : "text-muted-foreground";

  return (
    <>
      {/* Risk Assessment Section - editable by creator/Manager in Draft (or emergency
          completion); read-only for the Riesgos approver in Pending/Approved */}
      <Card
        className={cn(
          "transition-all duration-500",
          riskLevel === "Alto" &&
            "border-destructive/60 bg-destructive/5 shadow-[0_0_16px_hsl(var(--destructive)/0.25)]",
          riskLevel === "Moderado" &&
            "border-warning/60 bg-warning/5 shadow-[0_0_16px_hsl(var(--warning)/0.25)]",
          riskLevel === "Bajo" &&
            "border-success/60 bg-success/5 shadow-[0_0_16px_hsl(var(--success)/0.25)]",
          !riskLevel && "border-info/30 bg-info/5",
        )}
      >
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-info" />
                {t("workOrders.riskAssessment")}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t("workOrders.riskAssessmentDescription")}
              </p>
              {riskFieldsEditable && (
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="text-destructive">*</span>{" "}
                  {t("workOrders.riskRequiredHint")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label className="text-sm whitespace-nowrap">
                {t("workOrders.riskLevel")}:
                {riskFieldsEditable && <span className="text-destructive"> *</span>}
              </Label>
              {riskFieldsEditable ? (
                <Select
                  value={riskLevel || ""}
                  onValueChange={(value) =>
                    onRiskAssessmentChange?.(
                      "riskLevel",
                      value === RISK_LEVEL_NONE ? null : value || null,
                    )
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RISK_LEVEL_NONE}>
                      {t("workOrders.riskLevelNone")}
                    </SelectItem>
                    <SelectItem value="Bajo">{t("workOrders.riskLevelBajo")}</SelectItem>
                    <SelectItem value="Moderado">{t("workOrders.riskLevelModerado")}</SelectItem>
                    <SelectItem value="Alto">{t("workOrders.riskLevelAlto")}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className={cn("text-sm font-semibold", riskLevelColorClass)}>
                  {riskLevel ? (
                    t(`workOrders.riskLevel${riskLevel}`)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {showEmergencyReason && (
            <div className="flex items-start gap-3 rounded-md border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-orange-500" />
              <p>
                <span className="font-medium">{t("workOrders.emergencyReasonLabel")}</span>{" "}
                {emergencyJustification}
              </p>
            </div>
          )}
          {isEmergencyApproved && (
            <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-warning">
                  {t("workOrders.riskApprovedEmergency")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("workOrders.emergencyDeadlineBanner", {
                    date: emergencyDeadlineAt ? fmtDate(emergencyDeadlineAt) : "—",
                  })}
                </p>
              </div>
            </div>
          )}
          {/* D-04: SAN va primero (izquierda) y CEAC segundo, en fechas y en códigos. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                {t("workOrders.sanDate")}
                {riskFieldsEditable && <span className="text-destructive"> *</span>}
              </Label>
              {riskFieldsEditable ? (
                <Input
                  type="date"
                  value={sanCompletedAt ? sanCompletedAt.split("T")[0] : ""}
                  onChange={(e) =>
                    onRiskAssessmentChange?.("sanCompletedAt", e.target.value || null)
                  }
                />
              ) : (
                <p className="text-sm py-2">
                  {sanCompletedAt ? (
                    fmtDate(sanCompletedAt)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>
                {t("workOrders.ceacDate")}
                {riskFieldsEditable && <span className="text-destructive"> *</span>}
              </Label>
              {riskFieldsEditable ? (
                <Input
                  type="date"
                  value={ceacCompletedAt ? ceacCompletedAt.split("T")[0] : ""}
                  onChange={(e) =>
                    onRiskAssessmentChange?.("ceacCompletedAt", e.target.value || null)
                  }
                />
              ) : (
                <p className="text-sm py-2">
                  {ceacCompletedAt ? (
                    fmtDate(ceacCompletedAt)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                {t("workOrders.sanApprovalId")}
                {riskFieldsEditable && <span className="text-destructive"> *</span>}
              </Label>
              {riskFieldsEditable ? (
                <Input
                  type="text"
                  value={sanApprovalId || ""}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\s/g, "");
                    onRiskAssessmentChange?.("sanApprovalId", val || null);
                  }}
                />
              ) : (
                <p className="text-sm py-2">
                  {sanApprovalId || <span className="text-muted-foreground">—</span>}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>
                {t("workOrders.ceacNumber")}
                {riskFieldsEditable && <span className="text-destructive"> *</span>}
              </Label>
              {riskFieldsEditable ? (
                <Input
                  type="text"
                  value={ceacNumber || ""}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\s/g, "");
                    onRiskAssessmentChange?.("ceacNumber", val || null);
                  }}
                />
              ) : (
                <p className="text-sm py-2">
                  {ceacNumber || <span className="text-muted-foreground">—</span>}
                </p>
              )}
            </div>
          </div>
          {/* Notas CEAC/SAN retiradas del formulario (0306-78): las observaciones de
              rechazo se capturan en el diálogo de rechazo de Riesgos (risk_notes). */}
          {/* "Limpiar" en Draft normal: permite reiniciar los 5 campos para el envío
              de emergencia sin tener que borrar cada uno a mano. */}
          {showDraftClearRiskData && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={onClearRiskData}
                disabled={riskAllEmpty || isSubmitting}
                className="btn-action"
              >
                <Eraser className="h-4 w-4 mr-2" />
                {t("workOrders.clearRiskData")}
              </Button>
            </div>
          )}
          {/* Manager completes risk data after an emergency approval. Fields stay
              locked until "Agregar datos de Riesgo" is pressed; then the data is
              sent back to Riesgos for a single approval. */}
          {canCompleteRiskData && (
            <div className="flex justify-end">
              {!addingRiskData ? (
                <Button
                  onClick={() => setAddingRiskData(true)}
                  className="bg-info hover:bg-info/90 btn-action"
                  disabled={isSubmitting}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {t("workOrders.addRiskData")}
                </Button>
              ) : (
                <LoadingButton
                  onClick={() => onCompleteRisk?.()}
                  className="bg-info hover:bg-info/90 btn-action"
                  loading={isSubmitting}
                  disabled={!riskApprovalReady || isSubmitting}
                  title={!riskApprovalReady ? t("workOrders.riskAssessmentRequired") : undefined}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t("workOrders.sendRiskForApproval")}
                </LoadingButton>
              )}
            </div>
          )}
          {/* Riesgos rejected its track: correct the data and re-send only to Riesgos.
              Todo-o-nada: 5 campos completos → reenvío normal; 5 vacíos → emergencia (modal).
              Parcial → deshabilitado. Botón Limpiar para facilitar el path de emergencia. */}
          {isRiskRejected && onCompleteRisk && (
            <div className="flex justify-end gap-2">
              {onClearRiskData && (
                <Button
                  variant="outline"
                  onClick={onClearRiskData}
                  disabled={riskAllEmpty || isSubmitting}
                  className="btn-action"
                >
                  <Eraser className="h-4 w-4 mr-2" />
                  {t("workOrders.clearRiskData")}
                </Button>
              )}
              <LoadingButton
                onClick={() => {
                  if (riskAllEmpty) {
                    onRequestEmergencyResend?.();
                  } else {
                    onCompleteRisk();
                  }
                }}
                className="bg-info hover:bg-info/90 btn-action"
                loading={isSubmitting}
                disabled={!(riskApprovalReady || riskAllEmpty) || isSubmitting}
                title={
                  !(riskApprovalReady || riskAllEmpty)
                    ? t("workOrders.riskAssessmentRequiredOrEmpty")
                    : undefined
                }
              >
                <Send className="h-4 w-4 mr-2" />
                {t("workOrders.sendRiskForReapproval")}
              </LoadingButton>
            </div>
          )}
        </CardContent>
      </Card>

      {showRiskActions && hasRiskAction && (
        <div className="flex flex-col items-end gap-3">
          {/* Emergencia con el paso 1 hecho y el paso 2 pendiente, para quien NO puede firmarlo
              (risk_supervisor): falta la firma del Socio de Riesgos, pero puede rechazar igual. */}
          {emergencyPartnerPending && !canSignEmergency && (
            <Alert className="border-warning/40 bg-warning/10" data-testid="risk-emergency-awaiting-partner">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription>{t("workOrders.emergencyAwaitingPartner")}</AlertDescription>
            </Alert>
          )}
          <div className="relative rounded-md border p-3 pt-4">
            <span className="absolute -top-2 left-3 bg-background px-1 text-xs font-medium text-muted-foreground">
              {t("workOrders.riskActionsLabel")}
            </span>
            <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
              {onRejectRisk && (
                <LoadingButton
                  variant="outline"
                  onClick={() => {
                    setRejectRiskNotes("");
                    setRejectRiskDialogOpen(true);
                  }}
                  className="text-destructive border-destructive btn-action"
                  loading={isSubmitting}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {t("workOrders.rejectRisk")}
                </LoadingButton>
              )}
              {showNormalRiskApprove && (
                <LoadingButton
                  onClick={onApproveRisk}
                  className="bg-success hover:bg-success/90 btn-action"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {t("workOrders.approveRisk")}
                </LoadingButton>
              )}
              {showEmergencyReview && (
                <LoadingButton
                  onClick={onApproveEmergencyReview}
                  className="bg-orange-500 hover:bg-orange-600 text-white btn-action"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  <ShieldAlert className="h-4 w-4 mr-2" />
                  {t("workOrders.approveRiskAssistant")}
                </LoadingButton>
              )}
              {showEmergencyPartner && (
                <LoadingButton
                  onClick={onApproveEmergencyPartner}
                  className="bg-orange-500 hover:bg-orange-600 text-white btn-action"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  <ShieldAlert className="h-4 w-4 mr-2" />
                  {t("workOrders.approveRiskPartner")}
                </LoadingButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject risk dialog — optional notes */}
      <AlertDialog open={rejectRiskDialogOpen} onOpenChange={setRejectRiskDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workOrders.rejectRiskDialogTitle")}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label>{t("workOrders.riskRejectionNoteLabel")}</Label>
            <Textarea
              value={rejectRiskNotes}
              onChange={(e) => setRejectRiskNotes(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                onRejectRisk?.(rejectRiskNotes.trim() || null);
                setRejectRiskDialogOpen(false);
              }}
            >
              {t("workOrders.rejectRisk")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Plus,
  Lock,
  CheckCircle,
  XCircle,
  Send,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Undo2,
  Eraser,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useCategories,
  useExpenseTypes,
  useSetting,
  Category,
  ExpenseType,
  type WorkOrder,
  type WOBudgetLine,
} from "@/hooks/useEmsData";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

export interface BudgetLineInput {
  id: string;
  category_id: string;
  budgeted_hours: number;
  standard_rate: number;
}

export interface ExpenseBudgetInput {
  id: string;
  expense_type_id: string;
  budgeted_amount: number;
}

interface WorkOrderFormProps {
  currency: "USD" | "BOB";
  seasonMode: "High" | "Low";
  approvalStatus: "Draft" | "Pending_Approval" | "Approved" | "Rejected";
  // Socio approval timestamp — drives the track status indicator.
  approvedAt?: string | null;
  adjustmentAmount: number;
  taxRate: number;
  budgetLines: BudgetLineInput[];
  expenseBudget: ExpenseBudgetInput[];
  // Risk assessment fields
  ceacCompletedAt?: string | null;
  ceacNotes?: string | null;
  sanCompletedAt?: string | null;
  sanNotes?: string | null;
  ceacNumber?: string | null;
  sanApprovalId?: string | null;
  riskLevel?: string | null;
  // Risk dual-track + emergency
  riskStatus?: string | null;
  emergencyDeadlineAt?: string | null;
  // Emergency two-step sign-offs (Riesgo assistant -> Socio de Riesgos)
  emergencyReviewAt?: string | null;
  emergencyPartnerAt?: string | null;
  // New props for create/edit mode and dirty state
  isNew?: boolean;
  isDirty?: boolean;
  hasNonRiskDirty?: boolean;
  rejectionNote?: string | null;
  onCurrencyChange: (currency: "USD" | "BOB") => void;
  onSeasonChange: (season: "High" | "Low") => void;
  onAdjustmentChange: (amount: number) => void;
  onBudgetLinesChange: (lines: BudgetLineInput[]) => void;
  onExpenseBudgetChange: (expenses: ExpenseBudgetInput[]) => void;
  onRiskAssessmentChange?: (field: string, value: string | null) => void;
  onSubmit: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  // Emergency justification is captured here (at submit) when risk data is empty.
  onSubmitForApproval?: (emergencyJustification?: string) => void;
  onUnsubmit?: () => void;
  onCancel?: () => void;
  // Riesgos (Administrator) track
  canApproveRisk?: boolean;
  onApproveRisk?: () => void;
  onRejectRisk?: (riskNotes: string | null) => void;
  onApproveEmergencyReview?: () => void;
  onApproveEmergencyPartner?: () => void;
  onCompleteRisk?: (emergencyJustification?: string) => void;
  // Limpia los 5 campos de riesgo (estado local) para habilitar reenvío de emergencia.
  onClearRiskData?: () => void;
  // Nota de rechazo de Riesgos (risk_notes), mostrada al corregir.
  riskNote?: string | null;
  // Admin-only: revertir aprobaciones accidentales (ambas pistas).
  canRevert?: boolean;
  onRevertSocio?: () => void;
  onRevertRisk?: () => void;
  isLocked: boolean;
  canApprove: boolean;
  isSubmitting: boolean;
}

const statusColors = {
  Draft: "bg-warning/10 text-warning border-warning/20",
  Pending_Approval: "bg-info/10 text-info border-info/20",
  Approved: "bg-success/10 text-success border-success/20",
  Rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabels = {
  Draft: "workOrders.status.draft",
  Pending_Approval: "workOrders.status.pending",
  Approved: "workOrders.status.approved",
  Rejected: "workOrders.status.rejected",
};

export function WorkOrderForm({
  currency,
  seasonMode,
  approvalStatus,
  approvedAt,
  adjustmentAmount,
  taxRate,
  budgetLines,
  expenseBudget,
  ceacCompletedAt,
  ceacNotes,
  sanCompletedAt,
  sanNotes,
  ceacNumber,
  sanApprovalId,
  riskLevel,
  riskStatus,
  emergencyDeadlineAt,
  emergencyReviewAt,
  emergencyPartnerAt,
  isNew = false,
  isDirty = false,
  hasNonRiskDirty = false,
  rejectionNote,
  onCurrencyChange,
  onSeasonChange,
  onAdjustmentChange,
  onBudgetLinesChange,
  onExpenseBudgetChange,
  onRiskAssessmentChange,
  onSubmit,
  onApprove,
  onReject,
  onSubmitForApproval,
  onUnsubmit,
  onCancel,
  canApproveRisk = false,
  onApproveRisk,
  onRejectRisk,
  onApproveEmergencyReview,
  onApproveEmergencyPartner,
  onCompleteRisk,
  onClearRiskData,
  riskNote,
  canRevert = false,
  onRevertSocio,
  onRevertRisk,
  isLocked,
  canApprove,
  isSubmitting,
}: WorkOrderFormProps) {
  const { t } = useTranslation();
  // Emergency confirmation now lives at submit time (Manager), capturing a mandatory
  // motive/reference into emergency_justification. Riesgos approvers enter nothing.
  const [submitEmergencyDialogOpen, setSubmitEmergencyDialogOpen] = useState(false);
  const [submitJustification, setSubmitJustification] = useState("");
  // "submit" = Draft con campos vacíos → onSubmitForApproval; "resend" = Rechazado con campos vacíos → onCompleteRisk.
  const [emergencyDialogMode, setEmergencyDialogMode] = useState<"submit" | "resend">("submit");
  const [rejectRiskDialogOpen, setRejectRiskDialogOpen] = useState(false);
  const [rejectRiskNotes, setRejectRiskNotes] = useState("");
  // Risk fields stay locked after an emergency approval until the Manager explicitly
  // opts to add the data via the "Agregar datos de Riesgo" button.
  const [addingRiskData, setAddingRiskData] = useState(false);
  const { currentLanguage } = useLanguage();
  const { data: categories } = useCategories();
  const { data: expenseTypes } = useExpenseTypes();
  const realizationLimitSetting = useSetting("REALIZATION_LIMIT");
  const realizationLimitValue = parseFloat(realizationLimitSetting || "75");

  // Get the appropriate rate based on currency and season
  const getRate = (category: Category) => {
    const key =
      `rate_${seasonMode.toLowerCase()}_${currency.toLowerCase()}` as keyof Category;
    return Number(category[key]) || 0;
  };

  // Calculations
  const totalStandardFee = useMemo(() => {
    return budgetLines.reduce(
      (sum, line) => sum + line.budgeted_hours * line.standard_rate,
      0,
    );
  }, [budgetLines]);

  const totalBudgetedHours = useMemo(() => {
    return budgetLines.reduce((sum, line) => sum + line.budgeted_hours, 0);
  }, [budgetLines]);

  const realizationPercent = useMemo(() => {
    if (totalStandardFee === 0) return 100;
    return ((totalStandardFee + adjustmentAmount) / totalStandardFee) * 100;
  }, [totalStandardFee, adjustmentAmount]);

  const totalAdjustedFee = totalStandardFee + adjustmentAmount;

  const totalExpenses = useMemo(() => {
    return expenseBudget.reduce((sum, exp) => sum + exp.budgeted_amount, 0);
  }, [expenseBudget]);

  const feeWithTax = (totalAdjustedFee + totalExpenses) / (1 - taxRate);

  // Average rates for subtotal row
  const avgStandardRate = useMemo(() => {
    return totalBudgetedHours > 0 ? totalStandardFee / totalBudgetedHours : 0;
  }, [totalStandardFee, totalBudgetedHours]);

  const avgAdjustedRate = useMemo(() => {
    return totalBudgetedHours > 0 ? totalAdjustedFee / totalBudgetedHours : 0;
  }, [totalAdjustedFee, totalBudgetedHours]);

  // Add expense budget
  const addExpenseBudget = () => {
    const newExpense: ExpenseBudgetInput = {
      id: crypto.randomUUID(),
      expense_type_id: "",
      budgeted_amount: 0,
    };
    onExpenseBudgetChange([...expenseBudget, newExpense]);
  };

  // Update expense budget
  const updateExpenseBudget = (
    id: string,
    field: keyof ExpenseBudgetInput,
    value: string | number,
  ) => {
    onExpenseBudgetChange(
      expenseBudget.map((exp) =>
        exp.id === id ? { ...exp, [field]: value } : exp,
      ),
    );
  };

  // Remove expense budget
  const removeExpenseBudget = (id: string) => {
    onExpenseBudgetChange(expenseBudget.filter((exp) => exp.id !== id));
  };

  // Format number without currency sign (for line items) - no decimals
  const formatNumber = (amount: number) => {
    const rounded = Math.round(amount);
    if (currency === "BOB") {
      return rounded.toLocaleString("es-BO", { maximumFractionDigits: 0 });
    }
    return rounded.toLocaleString("en-US", { maximumFractionDigits: 0 });
  };

  // Format with currency code on LEFT (for summary totals - allows right-aligned numbers)
  const formatCurrencyWithCode = (amount: number) => {
    return { currencyCode: currency, value: formatNumber(amount) };
  };

  // Legacy format for inline values
  const formatCurrency = (amount: number) => {
    return formatNumber(amount);
  };

  const isDraft = approvalStatus === "Draft";
  const isPending = approvalStatus === "Pending_Approval";
  const isApproved = approvalStatus === "Approved";
  const isRejected = approvalStatus === "Rejected";
  // Estado por pista (independiente). Pista Socio = approved_at; pista Riesgos = risk_status.
  // La editabilidad y la visibilidad del estado se derivan por pista, no del approval_status
  // global, para que la pista aprobada nunca se edite ni pierda su indicador "Aprobado".
  const socioApproved = !!approvedAt;
  const socioRejected = isRejected;
  const riskApproved =
    riskStatus === "Approved" || riskStatus === "Emergency_Approved";
  // Pista Socio en modo corrección tras un rechazo (gastos/ajuste vuelven a editarse).
  const socioCorrecting = socioRejected;
  // gastos/ajuste editables (la matriz/grid sigue siempre read-only). La pista Socio
  // aprobada (approved_at) NUNCA es editable; en Draft o en corrección tras rechazo sí.
  const isEditable = ((isDraft && !isLocked) || socioCorrecting) && !socioApproved;

  const CEAC_NUM_RE = /^\d{10}$/;
  const SAN_ID_RE = /^\d{10}$|^\d{5}-\d{5}$/;
  const RISK_LEVELS = ["Bajo", "Moderado", "Alto"] as const;

  const ceacNumberValid = CEAC_NUM_RE.test(ceacNumber ?? "");
  const sanApprovalValid = SAN_ID_RE.test(sanApprovalId ?? "");
  const riskLevelValid = RISK_LEVELS.includes(
    riskLevel as (typeof RISK_LEVELS)[number],
  );
  const riskApprovalReady =
    !!ceacCompletedAt &&
    ceacNumberValid &&
    !!sanCompletedAt &&
    sanApprovalValid &&
    riskLevelValid;
  // Emergency: all 5 risk fields left empty so the OT can be submitted before
  // Riesgos provides the data (the request to Riesgos happens externally by email).
  const riskAllEmpty =
    !ceacCompletedAt &&
    !ceacNumber &&
    !sanCompletedAt &&
    !sanApprovalId &&
    !riskLevel;
  // Submit is all-or-nothing: fully complete (normal) or fully empty (emergency).
  // Partial risk data is blocked.
  const canSubmitForApproval = riskApprovalReady || riskAllEmpty;

  const isEmergencyApproved = riskStatus === "Emergency_Approved";
  // Riesgos rejected its track: the OT stays Pending/Approved (Socio untouched); the
  // Manager corrects the risk data and re-sends only the Risk track.
  const isRiskRejected = riskStatus === "Rejected";
  const hasRiskData = !!(ceacCompletedAt || sanCompletedAt);
  // After an emergency approval the Manager must click "Agregar datos de Riesgo"
  // before the fields unlock for completion.
  const canCompleteRiskData = isApproved && isEmergencyApproved && !!onCompleteRisk;
  // Risk fields are editable by the creator/Manager in Draft, again when an
  // emergency-approved OT completes its data, and when Riesgos rejected (to correct).
  // Una pista de Riesgos aprobada (Approved/Emergency_Approved) queda bloqueada aunque la
  // OT vuelva a Draft por "Retirar": al retirar solo se corrige lo que NO está aprobado.
  const riskFieldsEditable =
    (isDraft && !riskApproved && !!onRiskAssessmentChange) ||
    (canCompleteRiskData && addingRiskData) ||
    (isRiskRejected && !!onRiskAssessmentChange);
  // Risk section visibility.
  const showRiskSection =
    (isDraft && !!onRiskAssessmentChange) ||
    ((isPending || isApproved || isRejected) &&
      (canApproveRisk || hasRiskData || isEmergencyApproved || isRiskRejected));
  // The Riesgos approver acts while risk is pending review — never on a rejected risk
  // track (waits for re-submission). The Socio and Riesgos tracks are independent, so a
  // Socio rejection must NOT hide the Risk actions: Riesgos can still sign off on its own
  // track even when the Socio has rejected the OT.
  const showRiskActions =
    canApproveRisk &&
    !isDraft &&
    riskStatus !== "Approved" &&
    riskStatus !== "Rejected";
  // Emergency (risk data empty) requires two sequential sign-offs. Normal/post-completion
  // (data present) requires a single approval — but only once the data has been SENT for
  // review (risk_status back to Pending), never while still Emergency_Approved (i.e. while
  // the Manager is still completing the data).
  const showNormalRiskApprove =
    riskApprovalReady && !isEmergencyApproved && !!onApproveRisk;
  const showEmergencyReview =
    !riskApprovalReady &&
    !isEmergencyApproved &&
    !emergencyReviewAt &&
    !!onApproveEmergencyReview;
  const showEmergencyPartner =
    !riskApprovalReady &&
    !isEmergencyApproved &&
    !!emergencyReviewAt &&
    !emergencyPartnerAt &&
    !!onApproveEmergencyPartner;
  const hasRiskAction =
    showNormalRiskApprove || showEmergencyReview || showEmergencyPartner;
  // Socio can act only while pending AND not yet approved (once approved, the button is
  // replaced by the track status indicator below).
  const socioCanAct = isPending && canApprove && !approvedAt;
  // "Retirar de Aprobación": visible solo cuando hay una pista a la espera de decisión.
  // Se evalúa a nivel de pista (no del approval_status global, que sigue en
  // Pending_Approval aun con el Socio ya aprobado). Si ambas pistas están rechazadas
  // —o una aprobada y la otra rechazada— no hay pendiente => no se muestra (se corrige
  // en sitio). El guard !isDraft evita mostrarlo en una OT nueva en borrador.
  const socioPending = isPending && !socioApproved;
  const riskPending = !isDraft && (riskStatus === "Pending" || !riskStatus);
  const showWithdraw = !!onUnsubmit && (socioPending || riskPending);
  // True when the Socio/Riesgos labeled boxes are shown — used to vertically align
  // the standalone Cancel/Save/Unsubmit buttons with the buttons inside those boxes.
  const hasActionBoxes = socioCanAct || (showRiskActions && hasRiskAction);
  // Risk-level color: Alto=red, Moderado=yellow, Bajo=green.
  const riskLevelColorClass =
    riskLevel === "Alto"
      ? "text-destructive"
      : riskLevel === "Moderado"
        ? "text-warning"
        : riskLevel === "Bajo"
          ? "text-success"
          : "text-muted-foreground";

  // Per-track approval status (Socio / Riesgos), shown both in the header and the
  // bottom action area. Visible once the OT leaves Draft (Pending/Approved/Rejected),
  // so the Socio sign-off stays visible even after a rejection.
  // Visible mientras cualquiera de las dos pistas tenga un estado decidido — incluido
  // tras retirar (la OT vuelve a Draft pero approved_at/risk_status persisten), de modo
  // que la pista aprobada nunca pierde su indicador "Aprobado".
  const showTrackStatus =
    socioApproved ||
    socioRejected ||
    riskApproved ||
    isRiskRejected ||
    isPending ||
    isApproved ||
    isRejected;
  const renderTrackStatus = () => (
    <>
      <span className="flex items-center gap-1.5">
        <span className="text-muted-foreground">
          {t("workOrders.partnerActionsLabel")}:
        </span>
        {socioApproved ? (
          <span className="flex items-center gap-1 font-medium text-success">
            <CheckCircle className="h-3.5 w-3.5" />
            {t("workOrders.trackApproved")}
          </span>
        ) : socioRejected ? (
          <span className="flex items-center gap-1 font-medium text-destructive">
            <XCircle className="h-3.5 w-3.5" />
            {t("workOrders.trackRejected")}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {t("workOrders.trackPending")}
          </span>
        )}
        {canRevert && approvedAt && onRevertSocio && (
          <button
            type="button"
            onClick={onRevertSocio}
            disabled={isSubmitting}
            title={t("workOrders.revertApproval")}
            className="ml-0.5 inline-flex items-center text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-muted-foreground">
          {t("workOrders.riskActionsLabel")}:
        </span>
        {riskStatus === "Approved" ? (
          <span className="flex items-center gap-1 font-medium text-success">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("workOrders.trackApproved")}
          </span>
        ) : riskStatus === "Emergency_Approved" ? (
          <span className="flex items-center gap-1 font-medium text-orange-500">
            <ShieldAlert className="h-3.5 w-3.5" />
            {t("workOrders.trackEmergency")}
          </span>
        ) : riskStatus === "Rejected" ? (
          <span className="flex items-center gap-1 font-medium text-destructive">
            <XCircle className="h-3.5 w-3.5" />
            {t("workOrders.trackRejected")}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {t("workOrders.trackPending")}
          </span>
        )}
        {canRevert &&
          (riskStatus === "Approved" || riskStatus === "Emergency_Approved") &&
          onRevertRisk && (
            <button
              type="button"
              onClick={onRevertRisk}
              disabled={isSubmitting}
              title={t("workOrders.revertApproval")}
              className="ml-0.5 inline-flex items-center text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          )}
      </span>
    </>
  );

  // Get category name by ID
  const getCategoryName = (categoryId: string) => {
    const category = categories?.find((c) => c.category_id === categoryId);
    return category?.category_name || "-";
  };

  return (
    <div className="space-y-4">
      {/* Zone A: Header */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs px-2.5 py-1",
                  statusColors[approvalStatus],
                )}
              >
                {isLocked && <Lock className="h-3 w-3 mr-1" />}
                {t(statusLabels[approvalStatus])}
              </Badge>
              {/* Dirty indicator - same size as status badge, purple to match Guardar button */}
              {isDirty && (
                <Badge
                  variant="outline"
                  className="text-xs px-2.5 py-1 bg-brand-purple/10 text-brand-purple border-brand-purple/20"
                >
                  {t("common.unsavedChanges")}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Currency - styled chip, editable only on new */}
              {isNew ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("workOrders.currency")}:
                  </Label>
                  <Select
                    value={currency}
                    onValueChange={(v) => onCurrencyChange(v as "USD" | "BOB")}
                  >
                    <SelectTrigger className="w-20 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOB">BOB</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1">
                  <span className="text-xs text-muted-foreground">
                    {t("workOrders.currency")}:
                  </span>
                  <span className="text-sm font-semibold">{currency}</span>
                </div>
              )}
              {/* Season - styled chip, editable only on new */}
              {isNew ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("workOrders.season")}:
                  </Label>
                  <Select
                    value={seasonMode}
                    onValueChange={(v) => onSeasonChange(v as "High" | "Low")}
                  >
                    <SelectTrigger className="w-20 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">{t("industry.high")}</SelectItem>
                      <SelectItem value="Low">{t("industry.low")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1">
                  <span className="text-xs text-muted-foreground">
                    {t("workOrders.season")}:
                  </span>
                  <span className="text-sm font-semibold">
                    {seasonMode === "High"
                      ? t("industry.high")
                      : t("industry.low")}
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* Estado por pista (Socio / Riesgos) — visible en el encabezado. */}
          {showTrackStatus && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-2 pt-2 border-t">
              {renderTrackStatus()}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Zone B: Budget Grid - Read-only, managed via Work Matrix */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">
            {t("workOrders.budgetLines")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-dense">
              <thead>
                <tr className="border-b border-border">
                  <th
                    className="text-left py-1.5 px-2 font-medium text-muted-foreground"
                    colSpan={4}
                  >
                    {t("workOrders.standard")}
                  </th>
                  <th className="py-1.5 px-2 border-l border-border"></th>
                  <th
                    className="text-left py-1.5 px-2 font-medium text-muted-foreground border-l border-border"
                    colSpan={2}
                  >
                    {t("workOrders.adjusted")}
                  </th>
                </tr>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border">
                    {t("entities.category")}
                  </th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-24">
                    {t("workOrders.hours")}
                  </th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-28">
                    {t("workOrders.rate")} ({currency})
                  </th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-32">
                    {t("workOrders.total")} ({currency})
                  </th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-20">
                    %
                  </th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-28">
                    {t("workOrders.adjRate")} ({currency})
                  </th>
                  <th className="text-center py-1.5 px-2 font-medium w-32">
                    {t("workOrders.adjTotal")} ({currency})
                  </th>
                </tr>
              </thead>
              <tbody>
                {budgetLines.map((line) => {
                  const lineTotal = line.budgeted_hours * line.standard_rate;
                  const adjustedRate =
                    line.standard_rate * (realizationPercent / 100);
                  const adjustedTotal = line.budgeted_hours * adjustedRate;
                  const hoursPercent =
                    totalBudgetedHours > 0
                      ? (line.budgeted_hours / totalBudgetedHours) * 100
                      : 0;

                  return (
                    <tr
                      key={line.id}
                      className="border-b border-border hover:bg-muted/20"
                    >
                      {/* Category - always read-only text */}
                      <td className="py-1.5 px-2 text-left border-r border-border">
                        {getCategoryName(line.category_id)}
                      </td>
                      {/* Hours - always read-only */}
                      <td className="py-1.5 px-2 text-right font-mono border-r border-border">
                        {line.budgeted_hours.toLocaleString(
                          currency === "BOB" ? "es-BO" : "en-US",
                          {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          },
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-muted-foreground border-r border-border">
                        {formatNumber(line.standard_rate)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-medium border-r border-border">
                        {formatNumber(lineTotal)}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono text-muted-foreground border-r border-border">
                        {hoursPercent.toFixed(1)}%
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-muted-foreground border-r border-border">
                        {formatNumber(adjustedRate)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-medium">
                        {formatNumber(adjustedTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-medium">
                  <td className="py-2 px-2 text-left border-r border-border">
                    {t("workOrders.subtotal")}
                  </td>
                  <td className="py-2 px-2 text-right font-mono border-r border-border">
                    {formatNumber(totalBudgetedHours)}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-muted-foreground border-r border-border">
                    {formatNumber(avgStandardRate)}
                  </td>
                  <td className="py-2 px-2 text-right font-mono border-r border-border">
                    {formatNumber(totalStandardFee)}
                  </td>
                  <td className="py-2 px-2 text-center font-mono border-r border-border">
                    100.0%
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-muted-foreground border-r border-border">
                    {formatNumber(avgAdjustedRate)}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {formatNumber(totalAdjustedFee)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* No "Add Line" button - budget lines are managed via Work Matrix */}
        </CardContent>
      </Card>

      {/* Zone C: Footer - Expenses, Adjustment, Tax */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expenses Section - Editable in Draft mode */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">
              {t("workOrders.expenses")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 form-dense">
            <div className="space-y-2">
              {expenseBudget.map((exp) => (
                <div key={exp.id} className="flex items-center gap-2">
                  <Select
                    value={exp.expense_type_id}
                    onValueChange={(v) =>
                      updateExpenseBudget(exp.id, "expense_type_id", v)
                    }
                    disabled={!isEditable}
                  >
                    <SelectTrigger className="flex-1 h-8">
                      <SelectValue
                        placeholder={t("workOrders.selectExpense")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseTypes?.map((type) => (
                        <SelectItem
                          key={type.expense_type_id}
                          value={type.expense_type_id}
                        >
                          {type.expense_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <NumericInput
                    decimals={2}
                    locale={currentLanguage as "es" | "en"}
                    min={0}
                    value={exp.budgeted_amount || ""}
                    onChange={(val) =>
                      updateExpenseBudget(exp.id, "budgeted_amount", val)
                    }
                    className="w-28 text-right h-8"
                    disabled={!isEditable}
                  />
                  {isEditable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeExpenseBudget(exp.id)}
                      className="h-7 w-7 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {isEditable && (
                <Button
                  variant="outline"
                  onClick={addExpenseBudget}
                  size="sm"
                  className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("workOrders.addExpense")}
                </Button>
              )}
              <div className="flex justify-between pt-2 border-t border-border font-medium">
                <span>{t("workOrders.totalExpenses")}</span>
                <span className="font-mono">
                  <span className="text-sm text-muted-foreground mr-2">
                    {currency}
                  </span>
                  {formatNumber(totalExpenses)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Section - With currency codes */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">
              {t("workOrders.summary")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 form-dense">
            <div className="space-y-2">
              {/* Standard Fee - full label on desktop, abbreviated on mobile */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  <span className="hidden sm:inline">
                    {t("workOrders.standardFeeFull")}
                  </span>
                  <span className="sm:hidden">
                    {t("workOrders.standardFee")}
                  </span>
                </span>
                <span className="font-mono">
                  <span className="text-muted-foreground mr-2">{currency}</span>
                  {formatNumber(totalStandardFee)}
                </span>
              </div>
              {/* Adjustment - styled to match other rows, negative in red */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {t("workOrders.adjustment")}
                </span>
                <div className="flex items-center">
                  <span className="text-muted-foreground mr-2">{currency}</span>
                  <NumericInput
                    decimals={0}
                    locale={currentLanguage as "es" | "en"}
                    value={adjustmentAmount || ""}
                    onChange={(val) => onAdjustmentChange(val)}
                    className={cn(
                      "w-24 text-right h-8 font-mono !text-[length:inherit]",
                      isEditable
                        ? "border border-input bg-background px-2 rounded-md focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                        : "border-0 bg-transparent px-0",
                      adjustmentAmount < 0 && "text-destructive",
                    )}
                    disabled={!isEditable}
                  />
                </div>
              </div>
              {/* Realization - full label on desktop, abbreviated on mobile, color coded */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  <span className="hidden sm:inline">
                    {t("workOrders.realizationFull")}
                  </span>
                  <span className="sm:hidden">
                    {t("workOrders.realization")}
                  </span>
                </span>
                <span
                  className={cn(
                    "font-mono font-medium",
                    realizationPercent >= realizationLimitValue
                      ? "text-success"
                      : "text-destructive",
                  )}
                >
                  {realizationPercent.toLocaleString(
                    currency === "BOB" ? "es-BO" : "en-US",
                    {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    },
                  )}
                  %
                </span>
              </div>
              {/* Adjusted Fee - full label on desktop, abbreviated on mobile */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  <span className="hidden sm:inline">
                    {t("workOrders.adjustedFeeFull")}
                  </span>
                  <span className="sm:hidden">
                    {t("workOrders.adjustedFee")}
                  </span>
                </span>
                <span className="font-mono">
                  <span className="text-muted-foreground mr-2">{currency}</span>
                  {formatNumber(totalAdjustedFee)}
                </span>
              </div>
              {/* Expenses */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {t("workOrders.expenses")}
                </span>
                <span className="font-mono">
                  <span className="text-muted-foreground mr-2">{currency}</span>
                  {formatNumber(totalExpenses)}
                </span>
              </div>
              {/* IVA */}
              <div className="border-t border-border pt-2">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>
                    {t("workOrders.iva")} ({(taxRate * 100).toFixed(0)}%)
                  </span>
                  <span className="font-mono">
                    <span className="text-sm mr-2">{currency}</span>
                    {formatNumber(
                      feeWithTax - totalAdjustedFee - totalExpenses,
                    )}
                  </span>
                </div>
              </div>
              {/* Fee with Tax */}
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-semibold">
                  {t("workOrders.feeWithTax")}
                </span>
                <span className="font-mono font-bold text-accent">
                  <span className="text-sm font-normal text-muted-foreground mr-2">
                    {currency}
                  </span>
                  {formatNumber(feeWithTax)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Assessment Section - editable by creator/Manager in Draft (or emergency
          completion); read-only for the Riesgos approver in Pending/Approved */}
      {showRiskSection && (
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
                  {riskFieldsEditable && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                {riskFieldsEditable ? (
                  <Select
                    value={riskLevel || ""}
                    onValueChange={(value) =>
                      onRiskAssessmentChange?.("riskLevel", value || null)
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bajo">
                        {t("workOrders.riskLevelBajo")}
                      </SelectItem>
                      <SelectItem value="Moderado">
                        {t("workOrders.riskLevelModerado")}
                      </SelectItem>
                      <SelectItem value="Alto">
                        {t("workOrders.riskLevelAlto")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className={cn("text-sm font-semibold", riskLevelColorClass)}>
                    {riskLevel || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {isEmergencyApproved && (
              <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-warning">
                    {t("workOrders.riskApprovedEmergency")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("workOrders.emergencyDeadlineBanner", {
                      date: emergencyDeadlineAt
                        ? new Date(
                            emergencyDeadlineAt + "T00:00:00",
                          ).toLocaleDateString("es-BO", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })
                        : "—",
                    })}
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  {t("workOrders.ceacDate")}
                  {riskFieldsEditable && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                {riskFieldsEditable ? (
                  <Input
                    type="date"
                    value={ceacCompletedAt ? ceacCompletedAt.split("T")[0] : ""}
                    onChange={(e) =>
                      onRiskAssessmentChange?.(
                        "ceacCompletedAt",
                        e.target.value || null,
                      )
                    }
                  />
                ) : (
                  <p className="text-sm py-2">
                    {ceacCompletedAt ? (
                      new Date(
                        ceacCompletedAt + "T00:00:00",
                      ).toLocaleDateString("es-BO", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>
                  {t("workOrders.sanDate")}
                  {riskFieldsEditable && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                {riskFieldsEditable ? (
                  <Input
                    type="date"
                    value={sanCompletedAt ? sanCompletedAt.split("T")[0] : ""}
                    onChange={(e) =>
                      onRiskAssessmentChange?.(
                        "sanCompletedAt",
                        e.target.value || null,
                      )
                    }
                  />
                ) : (
                  <p className="text-sm py-2">
                    {sanCompletedAt ? (
                      new Date(sanCompletedAt + "T00:00:00").toLocaleDateString(
                        "es-BO",
                        { day: "2-digit", month: "2-digit", year: "numeric" },
                      )
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
                  {t("workOrders.ceacNumber")}
                  {riskFieldsEditable && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                {riskFieldsEditable ? (
                  <>
                    <Input
                      type="text"
                      placeholder={t("workOrders.ceacNumberPlaceholder")}
                      value={ceacNumber || ""}
                      onChange={(e) => {
                        const val = e.target.value
                          .replace(/[^\d]/g, "")
                          .slice(0, 10);
                        onRiskAssessmentChange?.("ceacNumber", val || null);
                      }}
                    />
                    {(ceacNumber?.length ?? 0) > 0 &&
                      !CEAC_NUM_RE.test(ceacNumber ?? "") && (
                        <p className="text-xs text-destructive">
                          {t("workOrders.ceacNumberInvalid")}
                        </p>
                      )}
                  </>
                ) : (
                  <p className="text-sm py-2">
                    {ceacNumber || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>
                  {t("workOrders.sanApprovalId")}
                  {riskFieldsEditable && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                {riskFieldsEditable ? (
                  <>
                    <Input
                      type="text"
                      placeholder={t("workOrders.sanApprovalIdPlaceholder")}
                      value={sanApprovalId || ""}
                      onChange={(e) => {
                        const val = e.target.value
                          .replace(/[^\d-]/g, "")
                          .replace(/(.*-.*)-/g, "$1")
                          .slice(0, 11);
                        onRiskAssessmentChange?.("sanApprovalId", val || null);
                      }}
                    />
                    {(sanApprovalId?.length ?? 0) > 0 &&
                      !SAN_ID_RE.test(sanApprovalId ?? "") && (
                        <p className="text-xs text-destructive">
                          {t("workOrders.sanApprovalIdInvalid")}
                        </p>
                      )}
                  </>
                ) : (
                  <p className="text-sm py-2">
                    {sanApprovalId || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                )}
              </div>
            </div>
            {/* Notas CEAC/SAN retiradas del formulario (0306-78): las observaciones de
                rechazo se capturan en el diálogo de rechazo de Riesgos (risk_notes). */}
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
                    onClick={onCompleteRisk}
                    className="bg-info hover:bg-info/90 btn-action"
                    loading={isSubmitting}
                    disabled={!riskApprovalReady || isSubmitting}
                    title={
                      !riskApprovalReady
                        ? t("workOrders.riskAssessmentRequired")
                        : undefined
                    }
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
                      setSubmitJustification("");
                      setEmergencyDialogMode("resend");
                      setSubmitEmergencyDialogOpen(true);
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
      )}

      {/* Approval track status (fila inferior) — espejo del indicador del encabezado. */}
      {showTrackStatus && (
        <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
          {renderTrackStatus()}
        </div>
      )}
      {/* Rejection note banner (de 0527-126): rojo en Rechazado, naranja en Draft. */}
      {isRejected && rejectionNote && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="font-medium">{t("workOrders.rejectionNoteLabel")}</span>{" "}
          {rejectionNote}
        </div>
      )}
      {isDraft && rejectionNote && (
        <div className="rounded-md border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <span className="font-medium">{t("workOrders.rejectionNoteLabel")}</span>{" "}
          {rejectionNote}
        </div>
      )}
      {/* Nota de rechazo de Riesgos — visible mientras se corrige (risk_status='Rejected'). */}
      {isRiskRejected && riskNote && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="font-medium">{t("workOrders.riskRejectionNoteLabel")}</span>{" "}
          {riskNote}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 items-start">
        {/* Standalone buttons. When the Socio/Riesgos boxes are shown they are taller
            (border + top label), so pad the top here to keep all buttons aligned. */}
        <div className={cn("flex gap-3", hasActionBoxes && "pt-4")}>
          {onCancel && (
            <Button
              variant="cancel"
              onClick={onCancel}
              disabled={isSubmitting}
              className="btn-action"
            >
              {t("common.cancel")}
            </Button>
          )}
          {isDraft && (
            <>
              <LoadingButton
                onClick={onSubmit}
                loading={isSubmitting}
                className="btn-action"
              >
                {t("common.save")}
              </LoadingButton>
              {onSubmitForApproval && (
                <LoadingButton
                  onClick={() => {
                    // Empty risk data => emergency: confirm + capture motive first.
                    if (riskAllEmpty) {
                      setSubmitJustification("");
                      setEmergencyDialogMode("submit");
                      setSubmitEmergencyDialogOpen(true);
                    } else {
                      onSubmitForApproval();
                    }
                  }}
                  className="bg-info hover:bg-info/90 btn-action"
                  loading={isSubmitting}
                  disabled={hasNonRiskDirty || !canSubmitForApproval}
                  title={
                    hasNonRiskDirty
                      ? t("workOrders.saveBeforeSubmit")
                      : !canSubmitForApproval
                        ? t("workOrders.riskAssessmentRequired")
                        : undefined
                  }
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t("workOrders.submitForApproval")}
                </LoadingButton>
              )}
            </>
          )}
          {/* Corrección de la pista Socio en sitio (Rechazado): gastos/ajuste editables;
              Guardar persiste los cambios y "Enviar para Aprobación" reenvía SOLO la pista
              Socio (el riesgo decidido permanece bloqueado y visible). No usa el flujo de
              emergencia (riesgo ya resuelto), por eso el guard es solo hasNonRiskDirty. */}
          {socioCorrecting && (
            <>
              <LoadingButton
                onClick={onSubmit}
                loading={isSubmitting}
                className="btn-action"
              >
                {t("common.save")}
              </LoadingButton>
              {onSubmitForApproval && (
                <LoadingButton
                  onClick={() => onSubmitForApproval()}
                  className="bg-info hover:bg-info/90 btn-action"
                  loading={isSubmitting}
                  disabled={hasNonRiskDirty}
                  title={
                    hasNonRiskDirty
                      ? t("workOrders.saveBeforeSubmit")
                      : undefined
                  }
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t("workOrders.sendForPartnerApproval")}
                </LoadingButton>
              )}
            </>
          )}
          {/* Retirar de Aprobación: solo cuando hay una pista pendiente (socioPending ||
              riskPending). Devuelve la OT a Draft; al editar, solo se corrige la pista no
              aprobada. Con ambas pistas rechazadas (o una aprobada + otra rechazada) no hay
              pendiente => no se muestra: la corrección se hace en sitio. */}
          {showWithdraw && (
            <LoadingButton
              variant="outline"
              onClick={onUnsubmit}
              loading={isSubmitting}
              className="bg-warning hover:bg-warning/90 text-warning-foreground btn-action"
            >
              <Undo2 className="h-4 w-4 mr-2" />
              {t("workOrders.unsubmit")}
            </LoadingButton>
          )}
        </div>
        {/* Socio track: business approval. Hidden once the Socio has approved (the track
            status indicator above then shows "Aprobado"). */}
        {socioCanAct && (
          <div className="relative rounded-md border p-3 pt-4">
            <span className="absolute -top-2 left-3 bg-background px-1 text-xs font-medium text-muted-foreground">
              {t("workOrders.partnerActionsLabel")}
            </span>
            <div className="flex justify-end gap-3">
              {onReject && (
                <LoadingButton
                  variant="outline"
                  onClick={onReject}
                  className="text-destructive border-destructive btn-action"
                  loading={isSubmitting}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {t("workOrders.reject")}
                </LoadingButton>
              )}
              <LoadingButton
                onClick={onApprove}
                className="bg-success hover:bg-success/90 btn-action"
                loading={isSubmitting}
                disabled={isSubmitting}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {t("workOrders.approve")}
              </LoadingButton>
            </div>
          </div>
        )}
        {/* Riesgos track: Administrator (roles split later). Normal flow / post-completion
            => single "Aprobar Riesgo". Emergency (risk empty) => two sequential orange
            sign-offs: Riesgo (assistant) then Socio de Riesgos. */}
        {showRiskActions && hasRiskAction && (
          <div className="relative rounded-md border p-3 pt-4">
            <span className="absolute -top-2 left-3 bg-background px-1 text-xs font-medium text-muted-foreground">
              {t("workOrders.riskActionsLabel")}
            </span>
            <div className="flex justify-end gap-3">
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
        )}
      </div>

      {/* Submit-time emergency dialog — Manager confirms sending without risk data and
          records a mandatory motive/reference (stored in emergency_justification). */}
      <AlertDialog
        open={submitEmergencyDialogOpen}
        onOpenChange={setSubmitEmergencyDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workOrders.submitEmergencyTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workOrders.submitEmergencyMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label>{t("workOrders.submitEmergencyJustificationLabel")}</Label>
            <Textarea
              value={submitJustification}
              onChange={(e) => setSubmitJustification(e.target.value)}
              rows={3}
            />
            {submitJustification.trim().length === 0 && (
              <p className="text-xs text-destructive">
                {t("workOrders.submitEmergencyJustificationRequired")}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitJustification.trim().length === 0}
              onClick={() => {
                const justif = submitJustification.trim();
                if (emergencyDialogMode === "resend") {
                  onCompleteRisk?.(justif);
                } else {
                  onSubmitForApproval?.(justif);
                }
                setSubmitEmergencyDialogOpen(false);
              }}
            >
              {t("workOrders.submitForApproval")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject risk dialog — optional notes */}
      <AlertDialog open={rejectRiskDialogOpen} onOpenChange={setRejectRiskDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workOrders.rejectRiskDialogTitle")}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label>{t("workOrders.sanNotes")}</Label>
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
    </div>
  );
}

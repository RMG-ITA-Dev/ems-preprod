import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
  AlertCircle,
  Undo2,
  Eraser,
  Users,
  Sun,
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
import { isSchedulerEnabled } from "@/lib/schedulerFeature";
import { useLanguage } from "@/hooks/useLanguage";
import { WorkOrderPaymentPlanSection } from "./WorkOrderPaymentPlanSection";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { computeBillingIndicator } from "@/lib/workOrderPaymentPlan";
import {
  STAFFING_PROFICIENCY_LEVELS,
  createEmptyRequirement,
  createEmptySkill,
  type StaffingProficiencyLevel,
  type StaffingRequirementInput,
} from "@/lib/workOrderStaffing";

export interface StaffingActiveSkillOption {
  skill_id: string;
  name: string;
  category: string;
}

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

// Fase 8 (0817-176): pestañas de la Orden de Trabajo (solo cuando !isNew).
type WorkOrderFormTabId = "budget" | "payment" | "risk" | "staffing";

interface WorkOrderFormProps {
  currency: "USD" | "BOB" | "USDT";
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
  emergencyJustification?: string | null;
  // New props for create/edit mode and dirty state
  isNew?: boolean;
  /** Funciones distintas de Cliente: no facturan ni requieren evaluación de riesgo. */
  isAdministrative?: boolean;
  isDirty?: boolean;
  hasNonRiskDirty?: boolean;
  rejectionNote?: string | null;
  onCurrencyChange: (currency: "USD" | "BOB" | "USDT") => void;
  // Payment plan
  woId?: string;
  paymentPlan?: import("@/types/workOrderPaymentPlan").PaymentPlanInput | null;
  paymentInstallments?: import("@/types/workOrderPaymentPlan").PaymentInstallmentInput[];
  isAdminDateEditable?: boolean;
  isStatusEditable?: boolean;
  canEditPaymentPlan?: boolean;
  isPaymentPlanDirty?: boolean;
  onPaymentPlanChange?: (plan: import("@/types/workOrderPaymentPlan").PaymentPlanInput) => void;
  onPaymentInstallmentsChange?: (rows: import("@/types/workOrderPaymentPlan").PaymentInstallmentInput[]) => void;
  // Staffing Requirements (Fase 4). Undefined onStaffingRequirementsChange (e.g. WorkOrderNew)
  // renders nothing for !isNew callers; isNew always shows the disabled "available after create" card.
  staffingRequirements?: StaffingRequirementInput[];
  onStaffingRequirementsChange?: (reqs: StaffingRequirementInput[]) => void;
  staffingCategories?: Category[];
  activeSkills?: StaffingActiveSkillOption[];
  staffingLoading?: boolean;
  staffingError?: boolean;
  staffingServiceResolved?: boolean;
  staffingServiceId?: string | null;
  /** Incremented by the parent to scroll the Staffing section into view after a validation error. */
  staffingFocusSignal?: number;
  /** Incremented by the parent to switch to the Risk tab after a submit-time risk validation error. */
  riskFocusSignal?: number;
  /** Incremented by the parent to switch to the Payment tab after a percentage validation error. */
  paymentFocusSignal?: number;
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

// 0819-181: extraído para reutilizarlo desde la tarjeta "Encargo" de WorkOrderEdit
// (fusión de la barra Estado/Moneda/Temporada) sin duplicar la lógica de color/label.
export interface WorkOrderStatusBadgeProps {
  approvalStatus: "Draft" | "Pending_Approval" | "Approved" | "Rejected";
  isLocked: boolean;
  isDirty?: boolean;
}

export function WorkOrderStatusBadge({
  approvalStatus,
  isLocked,
  isDirty = false,
}: WorkOrderStatusBadgeProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <Badge
        variant="outline"
        className={cn("text-xs px-2.5 py-1", statusColors[approvalStatus])}
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
  );
}

// 0819-181: idem — la fila "Socio: .../Riesgos: ..." (con sus íconos y el botón de
// deshacer aprobación) se reutiliza tanto en el encabezado de WorkOrderForm (isNew)
// como fusionada dentro de la tarjeta "Encargo" de WorkOrderEdit (!isNew).
export interface WorkOrderTrackStatusProps {
  approvalStatus: "Draft" | "Pending_Approval" | "Approved" | "Rejected";
  approvedAt?: string | null;
  riskStatus?: string | null;
  canRevert?: boolean;
  onRevertSocio?: () => void;
  onRevertRisk?: () => void;
  isSubmitting: boolean;
  isAdministrative?: boolean;
  className?: string;
}

export function WorkOrderTrackStatus({
  approvalStatus,
  approvedAt,
  riskStatus,
  canRevert = false,
  onRevertSocio,
  onRevertRisk,
  isSubmitting,
  isAdministrative = false,
  className,
}: WorkOrderTrackStatusProps) {
  const { t } = useTranslation();
  const isPending = approvalStatus === "Pending_Approval";
  const isApproved = approvalStatus === "Approved";
  const isRejected = approvalStatus === "Rejected";
  const socioApproved = !!approvedAt;
  const socioRejected = isRejected;
  const riskApproved = !isAdministrative && (riskStatus === "Approved" || riskStatus === "Emergency_Approved");
  const isRiskRejected = riskStatus === "Rejected";
  // Visible mientras cualquiera de las dos pistas tenga un estado decidido — incluido
  // tras retirar (la OT vuelve a Draft pero approved_at/risk_status persisten), de modo
  // que la pista aprobada nunca pierde su indicador "Aprobado".
  const showTrackStatus =
    socioApproved ||
    socioRejected ||
    riskApproved ||
    (!isAdministrative && isRiskRejected) ||
    isPending ||
    isApproved ||
    isRejected;
  if (!showTrackStatus) return null;
  return (
    <div className={className}>
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
      {!isAdministrative && <span className="flex items-center gap-1.5">
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
      </span>}
    </div>
  );
}

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
  emergencyJustification,
  isNew = false,
  isAdministrative = false,
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
  woId = "",
  paymentPlan = null,
  paymentInstallments = [],
  isAdminDateEditable = false,
  isStatusEditable = false,
  canEditPaymentPlan = false,
  isPaymentPlanDirty = false,
  onPaymentPlanChange,
  onPaymentInstallmentsChange,
  staffingRequirements = [],
  onStaffingRequirementsChange,
  staffingCategories = [],
  activeSkills = [],
  staffingLoading = false,
  staffingError = false,
  staffingServiceResolved = true,
  staffingServiceId = null,
  staffingFocusSignal = 0,
  riskFocusSignal = 0,
  paymentFocusSignal = 0,
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
  // Fase 8 (0817-176): pestaña activa + pestañas "visitadas" (para el "!" de aún-no-
  // revisada en pest. 1/4, que se limpia al visitar la pestaña o al enviar). Abre la
  // pista rechazada al montar (operador #4): Socio rechazado -> pest.1; si no, Riesgos
  // rechazado -> pest.3; si no, pest.1 por defecto.
  const [activeTab, setActiveTab] = useState<WorkOrderFormTabId>(() => {
    if (isAdministrative) return "budget";
    if (approvalStatus === "Rejected") return "budget";
    if (riskStatus === "Rejected") return "risk";
    return "budget";
  });
  const [visitedTabs, setVisitedTabs] = useState<Set<WorkOrderFormTabId>>(() => new Set([activeTab]));
  const { currentLanguage } = useLanguage();
  const { data: categories } = useCategories();
  const { data: expenseTypes } = useExpenseTypes();
  const realizationLimitSetting = useSetting("REALIZATION_LIMIT");
  const realizationLimitValue = parseFloat(realizationLimitSetting || "75");

  // Get the appropriate rate based on currency and season.
  // USDT uses USD rates (USDT budget rate system is out of scope).
  const getRate = (category: Category) => {
    const effectiveCurrency = currency === "USDT" ? "usd" : currency.toLowerCase();
    const key = `rate_${seasonMode.toLowerCase()}_${effectiveCurrency}` as keyof Category;
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
  const riskApproved = !isAdministrative && (
    riskStatus === "Approved" || riskStatus === "Emergency_Approved"
  );
  // Pista Socio en modo corrección tras un rechazo (gastos/ajuste vuelven a editarse).
  const socioCorrecting = socioRejected;
  // gastos/ajuste editables (la matriz/grid sigue siempre read-only). La pista Socio
  // aprobada (approved_at) NUNCA es editable; en Draft o en corrección tras rechazo sí.
  const isEditable = ((isDraft && !isLocked) || socioCorrecting) && !socioApproved;
  // Staffing is persisted by save_wo_staffing, whose state contract is Draft-only.
  // This deliberately does not inherit the Socio correction exception used by gastos.
  const isStaffingEditable = isDraft && !isLocked && !socioApproved &&
    !staffingLoading && !staffingError && staffingServiceResolved;

  const CEAC_NUM_RE = /^\d{10}$/;
  const SAN_ID_RE = /^\d{10}$|^\d{5}-\d{5}$/;
  const RISK_LEVELS = ["Bajo", "Moderado", "Alto"] as const;
  // Sentinel for the "Ninguno" option: Radix Select forbids an empty-string
  // SelectItem value, so this maps back to `null` in onValueChange.
  const RISK_LEVEL_NONE = "__none__";

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
  const canSubmitForApproval = isAdministrative || riskApprovalReady || riskAllEmpty;

  const isEmergencyApproved = riskStatus === "Emergency_Approved";
  // Riesgos rejected its track: the OT stays Pending/Approved (Socio untouched); the
  // Manager corrects the risk data and re-sends only the Risk track.
  const isRiskRejected = riskStatus === "Rejected";
  // The track is (or was) going through emergency: pending sign-offs, already approved in
  // emergency mode, or pending with empty risk data (just submitted).
  // Once risk_status reaches "Approved" (post-emergency normalization), the emergency
  // track is fully resolved — banner and emergency-specific UI must not persist.
  const isEmergencyTrack =
    (isEmergencyApproved || !!emergencyReviewAt || !!emergencyPartnerAt || (riskStatus === "Pending" && riskAllEmpty))
    && riskStatus !== "Approved";
  const showEmergencyReason = !!emergencyJustification && isEmergencyTrack;
  const hasRiskData = !!(ceacCompletedAt || sanCompletedAt);
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
  // Risk section visibility.
  const showRiskSection =
    (isDraft && !!onRiskAssessmentChange) ||
    showEmergencyReason ||
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
    riskAllEmpty &&
    !isEmergencyApproved &&
    !emergencyReviewAt &&
    !!onApproveEmergencyReview;
  const showEmergencyPartner =
    riskAllEmpty &&
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
  // Administrativa no tiene pista de Riesgos real (risk_status queda fijo en 'Pending' como
  // sentinela de "no aplica", nunca se aprueba/rechaza) — riskPending debe ser siempre false para
  // que "Retirar de Aprobación" no reaparezca sobre una OT ya cerrada por la firma del Socio. El
  // trigger administrativo solo auto-cierra en la transición null→no-null de approved_at, así que
  // un "Retirar" + reenvío posterior dejaría la OT varada en Pending_Approval sin forma de volver
  // a Approved.
  const riskPending = !isAdministrative && !isDraft && (riskStatus === "Pending" || !riskStatus);
  // 0923-196: save_wo_staffing exige approval_status='Draft' a nivel de base de datos
  // (WOS_WO_LOCKED) — la corrección "en sitio" de una OT Rechazada no puede cargar
  // Staffing. Si además el nuevo gate de envío exige >=1 requisito, la OT queda sin
  // ninguna salida. Se habilita "Retirar" en ese caso puntual para devolverla a Draft.
  const staffingBlockedInRejected =
    isRejected && isSchedulerEnabled() && staffingRequirements.length === 0;
  const showWithdraw = !!onUnsubmit && (socioPending || riskPending || staffingBlockedInRejected);

  // ── Indicadores por pestaña (0817-176 §Indicadores) ──────────────────────────
  // Todo derivado de flags/props ya existentes; sin datos ni reglas de negocio nuevas.
  type TabIndicatorKind =
    | "approved"
    | "rejected"
    | "warning"
    | "billing-green"
    | "billing-red"
    | "billing-complete"
    | "billing-unconfigured";
  const otFullyApproved = socioApproved && (isAdministrative || riskApproved);

  // Pestaña 1 (Presupuesto, pista Socio): terminal > "!" no revisada > sin indicador.
  const budgetIndicatorKind: TabIndicatorKind | null = socioRejected
    ? "rejected"
    : socioApproved
      ? "approved"
      : isPending
        ? null
        : visitedTabs.has("budget")
          ? null
          : "warning";

  // Pestaña 2 (Pagos y Facturación): completitud en borrador; ☼ tras aprobación total.
  const paymentPlanComplete = useMemo(() => {
    if (!paymentPlan) return false;
    if (!paymentPlan.payment_days || paymentPlan.payment_days <= 0) return false;
    if (paymentInstallments.length === 0) return false;
    const pctSum = paymentInstallments.reduce((sum, inst) => sum + inst.percentage, 0);
    if (Math.abs(pctSum - 100) > 0.01) return false;
    return paymentInstallments.every(
      (inst) => !!inst.agreed_invoice_date && !!inst.agreed_payment_date && inst.percentage > 0,
    );
  }, [paymentPlan, paymentInstallments]);
  const paymentIndicatorKind: TabIndicatorKind | null = otFullyApproved
    ? ((): TabIndicatorKind => {
        const billing = computeBillingIndicator(paymentInstallments);
        return billing === "red"
          ? "billing-red"
          : billing === "complete"
            ? "billing-complete"
            : billing === "unconfigured"
              ? "billing-unconfigured"
              : "billing-green";
      })()
    : isPending
      ? null
      : paymentPlanComplete
        ? "approved"
        : "warning";

  // Pestaña 3 (Evaluación de Riesgos, pista Riesgos): terminal > "!" datos incompletos.
  const riskIndicatorKind: TabIndicatorKind | null = isRiskRejected
    ? "rejected"
    : riskApproved
      ? "approved"
      : isDraft && !riskApprovalReady
        ? "warning"
        : null;

  // Pestaña 4 (Staffing, sin pista propia): ✓ solo con OT totalmente aprobada.
  const staffingIndicatorKind: TabIndicatorKind | null = otFullyApproved
    ? "approved"
    : isPending
      ? null
      : visitedTabs.has("staffing")
        ? null
        : "warning";

  const renderTabIndicator = (kind: TabIndicatorKind | null, ariaLabel: string) => {
    if (!kind) return null;
    const Icon =
      kind === "approved" || kind === "billing-complete"
        ? CheckCircle
        : kind === "rejected"
          ? XCircle
          : kind === "warning" || kind === "billing-unconfigured"
            ? AlertCircle
            : Sun;
    const colorClass =
      kind === "approved" || kind === "billing-green" || kind === "billing-complete"
        ? "text-success"
        : kind === "rejected" || kind === "billing-red"
          ? "text-destructive"
          : "text-warning";
    return <Icon className={cn("ml-1.5 h-3.5 w-3.5 shrink-0", colorClass)} aria-label={ariaLabel} />;
  };
  const ariaLabelForIndicator = (kind: TabIndicatorKind | null, incompleteKey: string): string => {
    switch (kind) {
      case "approved":
        return t("workOrders.tabs.status.approved");
      case "rejected":
        return t("workOrders.tabs.status.rejected");
      case "warning":
        return t(incompleteKey);
      case "billing-green":
        return t("workOrders.tabs.status.billingOk");
      case "billing-red":
        return t("workOrders.tabs.status.billingAlert");
      case "billing-complete":
        return t("workOrders.tabs.status.billingComplete");
      case "billing-unconfigured":
        return t("workOrders.tabs.status.billingUnconfigured");
      default:
        return "";
    }
  };

  // Pestaña requerida más próxima que aún no fue visitada (0923-196). Administrativa
  // no tiene pestañas payment/risk (no se renderizan, ver TabsTrigger condicionales
  // abajo), así que se excluyen de lo exigido — de lo contrario el envío quedaría
  // bloqueado para siempre en esas OT. Determina tanto el color "gris" del botón
  // "Enviar para Aprobación" como el bloqueo al hacer clic.
  const requiredTabsForSubmit: WorkOrderFormTabId[] = [
    "budget",
    ...(!isAdministrative ? (["payment", "risk"] as WorkOrderFormTabId[]) : []),
    ...(isSchedulerEnabled() ? (["staffing"] as WorkOrderFormTabId[]) : []),
  ];
  const missingRequiredTab = requiredTabsForSubmit.find((tab) => !visitedTabs.has(tab)) ?? null;

  // Si falta visitar una pestaña: toast + salto a esa pestaña, sin ejecutar la acción
  // de envío. Se llama ANTES de decidir si corresponde el diálogo de emergencia (los 3
  // call-sites de abajo), para no ofrecer ese diálogo sobre una OT que igual va a
  // bloquearse por pestañas.
  const blockIfTabsMissing = (): boolean => {
    if (!missingRequiredTab) return false;
    toast.error(t("workOrders.tabsNotVisited"));
    setActiveTab(missingRequiredTab);
    setVisitedTabs((prev) => (prev.has(missingRequiredTab) ? prev : new Set(prev).add(missingRequiredTab)));
    return true;
  };

  const attemptSubmitForApproval = (justification?: string) => {
    if (blockIfTabsMissing()) return;
    onSubmitForApproval?.(justification);
  };
  const handleTabChange = (value: string) => {
    const tab = value as WorkOrderFormTabId;
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  };

  // Risk-level color: Alto=red, Moderado=yellow, Bajo=green.
  const riskLevelColorClass =
    riskLevel === "Alto"
      ? "text-destructive"
      : riskLevel === "Moderado"
        ? "text-warning"
        : riskLevel === "Bajo"
          ? "text-success"
          : "text-muted-foreground";

  // Get category name by ID
  const getCategoryName = (categoryId: string) => {
    const category = categories?.find((c) => c.category_id === categoryId);
    return category?.category_name || "-";
  };

  // ── Staffing Requirements (Fase 4) ───────────────────────────────────────
  const staffingSectionRef = useRef<HTMLDivElement>(null);
  // Two-phase auto-switch (0817-176 §Indicadores): activate the offending tab first,
  // then scroll — the section is hidden (display:none) while its tab is inactive, so
  // scrolling before activation would be a no-op in a real browser.
  useEffect(() => {
    if (staffingFocusSignal > 0) {
      setActiveTab("staffing");
      // Review iteración 2 #4: el usuario queda forzosamente mirando la pestaña que
      // falló, así que cuenta como "revisada" igual que un click manual — si no, el
      // "!" de "aún no revisada" (pest.4) podía quedar pegado mientras la corrige.
      setVisitedTabs((prev) => (prev.has("staffing") ? prev : new Set(prev).add("staffing")));
    }
  }, [staffingFocusSignal]);
  const scrolledStaffingSignalRef = useRef(0);
  useEffect(() => {
    if (
      staffingFocusSignal > 0 &&
      activeTab === "staffing" &&
      scrolledStaffingSignalRef.current !== staffingFocusSignal
    ) {
      scrolledStaffingSignalRef.current = staffingFocusSignal;
      staffingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeTab, staffingFocusSignal]);

  // Riesgos: al fallar la validación de riesgo en "Enviar para Aprobación", activar
  // la pestaña 3 (operador §Proposed Fix #5).
  useEffect(() => {
    if (!isAdministrative && riskFocusSignal > 0) {
      setActiveTab("risk");
    }
  }, [isAdministrative, riskFocusSignal]);

  // Pagos: al fallar la validación de porcentajes en persistNonRiskChanges, activar
  // la pestaña 2 (Decisión del operador #4: auto-switch ante fallo de validación al
  // guardar/enviar, generalizado igual que staffing/riesgo).
  useEffect(() => {
    if (!isAdministrative && paymentFocusSignal > 0) {
      setActiveTab("payment");
    }
  }, [isAdministrative, paymentFocusSignal]);

  useEffect(() => {
    if (isAdministrative) setActiveTab("budget");
  }, [isAdministrative]);

  // Al montar/actualizar: abrir la pestaña de la pista rechazada (operador #4). Solo
  // reacciona a cambios reales de estado (no en cada render) — el mount ya queda
  // cubierto por el inicializador de `activeTab` arriba.
  const prevTrackStatusRef = useRef({ approvalStatus, riskStatus });
  useEffect(() => {
    const prev = prevTrackStatusRef.current;
    prevTrackStatusRef.current = { approvalStatus, riskStatus };
    if (prev.approvalStatus === approvalStatus && prev.riskStatus === riskStatus) return;
    if (approvalStatus === "Rejected") {
      setActiveTab("budget");
    } else if (riskStatus === "Rejected") {
      setActiveTab("risk");
    }
  }, [approvalStatus, riskStatus]);

  // Categories already selected by OTHER requirement rows are excluded from
  // every row's options (a category cannot repeat within the same OT), but a
  // row's own current selection always stays in its own options list.
  const availableCategoriesForNewStaffingRequirement = useMemo(() => {
    const used = new Set(staffingRequirements.map((r) => r.categoryId).filter(Boolean));
    return staffingCategories.filter((c) => !used.has(c.category_id));
  }, [staffingCategories, staffingRequirements]);

  const updateStaffingRequirements = (
    updater: (reqs: StaffingRequirementInput[]) => StaffingRequirementInput[],
  ) => {
    onStaffingRequirementsChange?.(updater(staffingRequirements));
  };

  const addStaffingRequirement = () => {
    updateStaffingRequirements((reqs) => [...reqs, createEmptyRequirement()]);
  };

  const removeStaffingRequirement = (clientKey: string) => {
    updateStaffingRequirements((reqs) => reqs.filter((r) => r.clientKey !== clientKey));
  };

  const updateStaffingCategory = (clientKey: string, categoryId: string) => {
    const category = staffingCategories.find((item) => item.category_id === categoryId);
    updateStaffingRequirements((reqs) =>
      reqs.map((r) => (
        r.clientKey === clientKey
          ? {
              ...r,
              categoryId,
              categoryName: category?.category_name ?? null,
              categoryServiceId: category?.practica_id ?? null,
            }
          : r
      )),
    );
  };

  const updateStaffingCount = (clientKey: string, staffCount: number) => {
    updateStaffingRequirements((reqs) =>
      reqs.map((r) => (r.clientKey === clientKey ? { ...r, staffCount } : r)),
    );
  };

  const addStaffingSkill = (reqClientKey: string) => {
    updateStaffingRequirements((reqs) =>
      reqs.map((r) =>
        r.clientKey === reqClientKey ? { ...r, skills: [...r.skills, createEmptySkill()] } : r,
      ),
    );
  };

  const removeStaffingSkill = (reqClientKey: string, skillClientKey: string) => {
    updateStaffingRequirements((reqs) =>
      reqs.map((r) =>
        r.clientKey === reqClientKey
          ? { ...r, skills: r.skills.filter((s) => s.clientKey !== skillClientKey) }
          : r,
      ),
    );
  };

  const updateStaffingSkillId = (reqClientKey: string, skillClientKey: string, skillId: string) => {
    const known = activeSkills.find((s) => s.skill_id === skillId);
    updateStaffingRequirements((reqs) =>
      reqs.map((r) => {
        if (r.clientKey !== reqClientKey) return r;
        return {
          ...r,
          skills: r.skills.map((s) =>
            s.clientKey === skillClientKey
              ? { ...s, skillId, skillName: known?.name ?? s.skillName, isActive: known ? true : s.isActive }
              : s,
          ),
        };
      }),
    );
  };

  const updateStaffingSkillProficiency = (
    reqClientKey: string,
    skillClientKey: string,
    minProficiencyLevel: StaffingProficiencyLevel,
  ) => {
    updateStaffingRequirements((reqs) =>
      reqs.map((r) => {
        if (r.clientKey !== reqClientKey) return r;
        return {
          ...r,
          skills: r.skills.map((s) =>
            s.clientKey === skillClientKey ? { ...s, minProficiencyLevel } : s,
          ),
        };
      }),
    );
  };

  const budgetGridCard = (
    <>
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

    </>
  );

  const expensesSummaryGrid = (
    <>
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
              {expenseBudget.map((exp) => {
                const usedByOtherExpenses = new Set(
                  expenseBudget
                    .filter((e) => e.id !== exp.id)
                    .map((e) => e.expense_type_id)
                    .filter(Boolean),
                );
                const expenseTypeOptions = (expenseTypes ?? []).filter(
                  (type) =>
                    type.expense_type_id === exp.expense_type_id ||
                    !usedByOtherExpenses.has(type.expense_type_id),
                );
                return (
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
                        {expenseTypeOptions.map((type) => (
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
                );
              })}
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

    </>
  );

  const paymentPlanSection = (
    <>
      {/* Plan de Pagos */}
      {onPaymentPlanChange && onPaymentInstallmentsChange && (
        <WorkOrderPaymentPlanSection
          woId={woId}
          currency={currency}
          feeWithTax={feeWithTax}
          plan={paymentPlan ?? null}
          installments={paymentInstallments}
          isEditable={isEditable}
          isStatusEditable={isStatusEditable}
          isAdminDateEditable={isAdminDateEditable}
          canEditPaymentPlan={canEditPaymentPlan}
          isPaymentPlanDirty={isPaymentPlanDirty}
          onPlanChange={onPaymentPlanChange}
          onInstallmentsChange={onPaymentInstallmentsChange}
        />
      )}

    </>
  );

  const staffingSection = (
    <>
      {/* Staffing Requirements Section (Fase 4). During creation (no wo_id yet) the
          section is shown disabled with an explanatory message — staffing is only
          configurable from the edit page, once the Work Order has a wo_id.
          Fase 7 (plan v2 §B.4#5): con el flag apagado se omite toda la sección —
          el chokepoint gemelo es WorkOrderEdit.tsx (§B.4#6, validateStaffing). */}
      {isSchedulerEnabled() && (isNew ? (
        <Card className="border-dashed">
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              {t("workOrders.staffingRequirements.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">
              {t("workOrders.staffingRequirements.availableAfterCreate")}
            </p>
          </CardContent>
        </Card>
      ) : (
        onStaffingRequirementsChange && (
          <Card ref={staffingSectionRef}>
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-info" />
                {t("workOrders.staffingRequirements.title")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("workOrders.staffingRequirements.description")}
              </p>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {staffingLoading ? (
                <p className="text-sm text-muted-foreground">
                  {t("workOrders.staffingRequirements.loading")}
                </p>
              ) : staffingError ? (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {t("workOrders.staffingRequirements.errorLoading")}
                </p>
              ) : (
                <>
                  {!staffingServiceResolved && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      {t("workOrders.staffingRequirements.serviceNotResolved")}
                    </div>
                  )}
                  {staffingServiceResolved && staffingCategories.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("workOrders.staffingRequirements.noCategoriesForService")}
                    </p>
                  )}
                  {staffingRequirements.length === 0 && staffingCategories.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("workOrders.staffingRequirements.empty")}
                    </p>
                  )}
                  <div className="space-y-3">
                    {staffingRequirements.map((req) => {
                      const usedByOthers = new Set(
                        staffingRequirements
                          .filter((r) => r.clientKey !== req.clientKey)
                          .map((r) => r.categoryId),
                      );
                      const isHistoricalIncompatible = Boolean(
                        staffingServiceId &&
                        req.categoryServiceId &&
                        req.categoryServiceId !== staffingServiceId,
                      );
                      const currentCategoryIsMissing = Boolean(
                        req.categoryId && !staffingCategories.some((c) => c.category_id === req.categoryId),
                      );
                      const historicalCurrentCategory = currentCategoryIsMissing
                        ? {
                            category_id: req.categoryId as string,
                            category_name: req.categoryName ?? req.categoryId ?? "",
                            practica_id: req.categoryServiceId ?? "",
                            display_order: Number.MAX_SAFE_INTEGER,
                          } as Category
                        : null;
                      const categoryOptions = [...staffingCategories, ...(historicalCurrentCategory ? [historicalCurrentCategory] : [])].filter(
                        (c) => c.category_id === req.categoryId || !usedByOthers.has(c.category_id),
                      );
                      return (
                        <div
                          key={req.clientKey}
                          data-testid={`staffing-requirement-${req.clientKey}`}
                          className="rounded-md border border-border p-3 space-y-3"
                        >
                          {isHistoricalIncompatible && (
                            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                              {t("workOrders.staffingRequirements.historicalCategoryIncompatible")}
                            </div>
                          )}
                          <div className="flex flex-col md:flex-row gap-2 md:items-center">
                            <div className="flex-1">
                              <Select
                                value={req.categoryId ?? ""}
                                onValueChange={(v) => updateStaffingCategory(req.clientKey, v)}
                                disabled={!isStaffingEditable}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder={t("workOrders.staffingRequirements.selectCategory")} />
                                </SelectTrigger>
                                <SelectContent>
                                  {categoryOptions.map((c) => (
                                  <SelectItem
                                    key={c.category_id}
                                    value={c.category_id}
                                    disabled={isHistoricalIncompatible && c.category_id === req.categoryId}
                                  >
                                      {c.category_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                                {t("workOrders.staffingRequirements.staffCount")}
                              </Label>
                              <NumericInput
                                decimals={0}
                                min={1}
                                max={999}
                                value={req.staffCount ?? ""}
                                onChange={(val) => updateStaffingCount(req.clientKey, val)}
                                disabled={!isStaffingEditable}
                                className="w-20 h-9"
                                data-testid={`staffing-count-${req.clientKey}`}
                              />
                            </div>
                            {isStaffingEditable && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeStaffingRequirement(req.clientKey)}
                                className="h-8 w-8 text-destructive shrink-0"
                                title={t("workOrders.staffingRequirements.removeCategory")}
                                data-testid={`staffing-remove-requirement-${req.clientKey}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>

                          <div className="space-y-2 md:pl-2">
                            {req.skills.map((skill) => {
                              const isKnownActive = activeSkills.some((s) => s.skill_id === skill.skillId);
                              const availableSkillOptions =
                                isKnownActive || !skill.skillId
                                  ? activeSkills
                                  : [
                                      ...activeSkills,
                                      { skill_id: skill.skillId, name: skill.skillName ?? skill.skillId, category: "" },
                                    ];
                              const usedSkillIds = new Set(
                                req.skills
                                  .filter((s) => s.clientKey !== skill.clientKey)
                                  .map((s) => s.skillId)
                                  .filter(Boolean),
                              );
                              const skillOptions = availableSkillOptions.filter(
                                (option) => option.skill_id === skill.skillId || !usedSkillIds.has(option.skill_id),
                              );
                              return (
                                <div
                                  key={skill.clientKey}
                                  data-testid={`staffing-skill-${skill.clientKey}`}
                                  className="flex flex-col md:flex-row gap-2 md:items-center"
                                >
                                  <div className="flex-1 flex items-center gap-2">
                                    <Select
                                      value={skill.skillId || ""}
                                      onValueChange={(v) => updateStaffingSkillId(req.clientKey, skill.clientKey, v)}
                                      disabled={!isStaffingEditable}
                                    >
                                      <SelectTrigger className="h-8 text-sm">
                                        <SelectValue placeholder={t("workOrders.staffingRequirements.selectSkill")} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {skillOptions.map((s) => (
                                          <SelectItem key={s.skill_id} value={s.skill_id}>
                                            {s.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {!isKnownActive && skill.skillId && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs px-1.5 py-0 shrink-0 bg-muted text-muted-foreground"
                                      >
                                        {t("workOrders.staffingRequirements.inactiveSkillBadge")}
                                      </Badge>
                                    )}
                                  </div>
                                  <Select
                                    value={skill.minProficiencyLevel ?? ""}
                                    onValueChange={(v) =>
                                      updateStaffingSkillProficiency(
                                        req.clientKey,
                                        skill.clientKey,
                                        v as StaffingProficiencyLevel,
                                      )
                                    }
                                    disabled={!isStaffingEditable}
                                  >
                                    <SelectTrigger className="h-8 text-sm w-full md:w-40">
                                      <SelectValue placeholder={t("workOrders.staffingRequirements.selectProficiency")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {STAFFING_PROFICIENCY_LEVELS.map((level) => (
                                        <SelectItem key={level} value={level}>
                                          {t(`staff.competencies.levels.${level.toLowerCase()}`)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {isStaffingEditable && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeStaffingSkill(req.clientKey, skill.clientKey)}
                                      className="h-7 w-7 text-destructive shrink-0"
                                      title={t("workOrders.staffingRequirements.removeSkill")}
                                      data-testid={`staffing-remove-skill-${skill.clientKey}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                            {isStaffingEditable && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addStaffingSkill(req.clientKey)}
                                className="h-7 text-xs"
                                data-testid={`staffing-add-skill-${req.clientKey}`}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                {t("workOrders.staffingRequirements.addSkill")}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {isStaffingEditable && (
                    <Button
                      variant="outline"
                      onClick={addStaffingRequirement}
                      size="sm"
                      disabled={availableCategoriesForNewStaffingRequirement.length === 0}
                      className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                      data-testid="staffing-add-category"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t("workOrders.staffingRequirements.addCategory")}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )
      ))}

    </>
  );

  const riskAssessmentCard = (
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
                  {riskFieldsEditable && (
                    <span className="text-destructive"> *</span>
                  )}
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
                    {riskLevel
                      ? t(`workOrders.riskLevel${riskLevel}`)
                      : <span className="text-muted-foreground">—</span>
                    }
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

    </>
  );

  return (
    <div className="space-y-4">
      {/* Zone A: Header — solo para isNew (creación). En edición (!isNew), Estado/
          Moneda/Temporada/Pistas viven fusionados en la tarjeta "Encargo" de
          WorkOrderEdit.tsx (0819-181), vía WorkOrderStatusBadge/WorkOrderTrackStatus. */}
      {isNew && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <WorkOrderStatusBadge approvalStatus={approvalStatus} isLocked={isLocked} isDirty={isDirty} />
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("workOrders.currency")}:
                  </Label>
                  <Select
                    value={currency}
                    onValueChange={(v) => onCurrencyChange(v as "USD" | "BOB" | "USDT")}
                  >
                    <SelectTrigger className="w-24 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOB">BOB</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="USDT">USDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              </div>
            </div>
            <WorkOrderTrackStatus
              approvalStatus={approvalStatus}
              approvedAt={approvedAt}
              riskStatus={riskStatus}
              isAdministrative={isAdministrative}
              canRevert={canRevert}
              onRevertSocio={onRevertSocio}
              onRevertRisk={onRevertRisk}
              isSubmitting={isSubmitting}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-2 pt-2 border-t"
            />
          </CardHeader>
        </Card>
      )}

      {isNew && !isAdministrative ? (
        <>
          {budgetGridCard}
          {expensesSummaryGrid}
          {paymentPlanSection}
          {staffingSection}
          {showRiskSection && riskAssessmentCard}
        </>
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="flex w-full justify-start overflow-x-auto">
            <TabsTrigger value="budget" className="shrink-0">
              {t("workOrders.tabs.budget")}
              {renderTabIndicator(
                budgetIndicatorKind,
                ariaLabelForIndicator(budgetIndicatorKind, "workOrders.tabs.status.notReviewed"),
              )}
            </TabsTrigger>
            {!isAdministrative && (
              <TabsTrigger value="payment" className="shrink-0">
                {t("workOrders.tabs.payment")}
                {renderTabIndicator(
                  paymentIndicatorKind,
                  ariaLabelForIndicator(paymentIndicatorKind, "workOrders.tabs.status.incomplete"),
                )}
              </TabsTrigger>
            )}
            {!isAdministrative && (
              <TabsTrigger value="risk" className="shrink-0">
                {t("workOrders.tabs.risk")}
                {renderTabIndicator(
                  riskIndicatorKind,
                  ariaLabelForIndicator(riskIndicatorKind, "workOrders.tabs.status.incomplete"),
                )}
              </TabsTrigger>
            )}
            {isSchedulerEnabled() && (
              <TabsTrigger value="staffing" className="shrink-0">
                {t("workOrders.tabs.staffing")}
                {renderTabIndicator(
                  staffingIndicatorKind,
                  ariaLabelForIndicator(staffingIndicatorKind, "workOrders.tabs.status.notReviewed"),
                )}
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="budget" forceMount className="mt-4 space-y-4 data-[state=inactive]:hidden">
            {budgetGridCard}
            {expensesSummaryGrid}
            {socioCanAct && (
              <div className="flex justify-end">
          <div className="relative rounded-md border p-3 pt-4">
            <span className="absolute -top-2 left-3 bg-background px-1 text-xs font-medium text-muted-foreground">
              {t("workOrders.partnerActionsLabel")}
            </span>
            <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
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
              </div>
            )}
          </TabsContent>
          {!isAdministrative && (
            <TabsContent value="payment" forceMount className="mt-4 data-[state=inactive]:hidden">
              {paymentPlanSection}
            </TabsContent>
          )}
          {!isAdministrative && (
            <TabsContent value="risk" forceMount className="mt-4 space-y-4 data-[state=inactive]:hidden">
              {riskAssessmentCard}
              {showRiskActions && hasRiskAction && (
              <div className="flex justify-end">
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
            </TabsContent>
          )}
          {isSchedulerEnabled() && (
            <TabsContent value="staffing" forceMount className="mt-4 data-[state=inactive]:hidden">
              {staffingSection}
            </TabsContent>
          )}
        </Tabs>
      )}


      {/* Approval track status (fila inferior) — espejo del indicador de arriba (Zone
          A en isNew; la tarjeta "Encargo" fusionada de WorkOrderEdit en !isNew). */}
      <WorkOrderTrackStatus
        approvalStatus={approvalStatus}
        approvedAt={approvedAt}
        riskStatus={riskStatus}
        isAdministrative={isAdministrative}
        canRevert={canRevert}
        onRevertSocio={onRevertSocio}
        onRevertRisk={onRevertRisk}
        isSubmitting={isSubmitting}
        className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm"
      />
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

      {/* Actions: botones globales transversales. Las cajas de acción de Socio y
          Riesgos viven ahora dentro de sus pestañas (pest. 1 y 3). */}
      <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
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
                disabled={isDirty && !hasNonRiskDirty}
                title={
                  isDirty && !hasNonRiskDirty
                    ? t("workOrders.riskSavedOnSubmit")
                    : undefined
                }
              >
                {t("common.save")}
              </LoadingButton>
              {onSubmitForApproval && (
                <LoadingButton
                  onClick={() => {
                    // 0923-196: si falta visitar una pestaña, bloquea acá — antes de
                    // ofrecer el diálogo de emergencia — para no pedirle un motivo al
                    // usuario y bloquearlo recién después de escribirlo.
                    if (blockIfTabsMissing()) return;
                    // Empty risk data + risk NOT yet approved => new emergency: capture motive.
                    // If risk is already Emergency_Approved (re-submitting Socio track only),
                    // skip the modal — no new justification needed.
                    if (!isAdministrative && riskAllEmpty && !riskApproved) {
                      setSubmitJustification("");
                      setEmergencyDialogMode("submit");
                      setSubmitEmergencyDialogOpen(true);
                    } else {
                      attemptSubmitForApproval();
                    }
                  }}
                  className={cn(
                    "btn-action",
                    // Celeste apagado (no deshabilitado): el clic sigue disponible para
                    // disparar el toast + salto a la pestaña faltante en vez de quedar
                    // inerte; se evita el gris (reservado para "pending, inactive" en el
                    // sistema de diseño) para no sugerir que el botón está inactivo.
                    missingRequiredTab
                      ? "bg-info/60 text-info-foreground hover:bg-info/80"
                      : "bg-info hover:bg-info/90",
                  )}
                  loading={isSubmitting}
                  disabled={!canSubmitForApproval}
                  title={
                    !canSubmitForApproval
                      ? t("workOrders.riskAssessmentRequired")
                      : missingRequiredTab
                        ? t("workOrders.tabsNotVisited")
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
              "Enviar para Aprobación" guarda esos cambios pendientes (si los hay) y luego
              reenvía SOLO la pista Socio (el riesgo decidido permanece bloqueado y visible).
              No usa el flujo de emergencia (riesgo ya resuelto). "Guardar" sigue disponible
              para quien prefiera guardar sin reenviar todavía. */}
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
                  onClick={() => attemptSubmitForApproval()}
                  className={cn(
                    "btn-action",
                    missingRequiredTab
                      ? "bg-info/60 text-info-foreground hover:bg-info/80"
                      : "bg-info hover:bg-info/90",
                  )}
                  loading={isSubmitting}
                  title={missingRequiredTab ? t("workOrders.tabsNotVisited") : undefined}
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
                  attemptSubmitForApproval(justif);
                }
                setSubmitEmergencyDialogOpen(false);
              }}
            >
              {emergencyDialogMode === "resend"
                ? t("workOrders.sendRiskForReapproval")
                : t("workOrders.submitForApproval")}
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
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { WorkOrderForm, BudgetLineInput, ExpenseBudgetInput } from "@/components/forms/WorkOrderForm";
import {
  useWorkOrderById,
  useSetting,
  useCategories,
  useServices,
  useActiveSkills,
  useWorkOrderStaffingRequirements,
} from "@/hooks/useEmsData";
import {
  useUpdateWorkOrder,
  useCreateBudgetLine,
  useUpdateBudgetLine,
  useDeleteBudgetLine,
  useCreateExpenseBudget,
  useUpdateExpenseBudget,
  useDeleteExpenseBudget,
  useSubmitWorkOrder,
  useApproveWorkOrder,
  useApproveRisk,
  useApproveEmergencyReview,
  useApproveEmergencyPartner,
  useRejectRisk,
  useRevertSocioApproval,
  useRevertRiskApproval,
  useCompleteRiskAssessment,
  useRejectWorkOrder,
  useUnsubmitWorkOrder,
  useUpsertPaymentPlan,
  useBatchUpsertInstallments,
  useDeletePaymentPlan,
  useSaveWorkOrderStaffing,
} from "@/hooks/mutations";
import {
  hydrateFromPersisted,
  isStaffingDirty,
  validateStaffing,
  STAFFING_VALIDATION_ERROR_I18N_KEY,
  type StaffingRequirementInput,
} from "@/lib/workOrderStaffing";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useUserRole } from "@/hooks/useUserRole";
import type { PaymentPlanInput, PaymentInstallmentInput } from "@/types/workOrderPaymentPlan";
import { useWorksheetByEngagementId } from "@/hooks/useWorksheetData";
import { useResyncWorksheetToWorkOrder } from "@/hooks/useWorksheetMutations";
import { toast } from "sonner";
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

const WorkOrderEdit = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: workOrder, isLoading } = useWorkOrderById(id || "");
  const { data: categories } = useCategories();
  const { staffRecord } = useCurrentStaff();
  const globalTaxRate = useSetting("TAX_RATE");

  // Check if this WO has a linked worksheet
  const { data: linkedWorksheet } = useWorksheetByEngagementId(workOrder?.engagement_id);

  // Staffing Requirements (Fase 4) — data sources
  const { data: services } = useServices();
  const { data: activeSkills } = useActiveSkills();
  const {
    data: staffingRows,
    isLoading: staffingLoading,
    isError: staffingIsError,
  } = useWorkOrderStaffingRequirements(workOrder?.wo_id);

  const updateWorkOrder = useUpdateWorkOrder();
  const createBudgetLine = useCreateBudgetLine();
  const updateBudgetLine = useUpdateBudgetLine();
  const deleteBudgetLine = useDeleteBudgetLine();
  const createExpenseBudget = useCreateExpenseBudget();
  const updateExpenseBudget = useUpdateExpenseBudget();
  const deleteExpenseBudget = useDeleteExpenseBudget();
  const submitWorkOrder = useSubmitWorkOrder();
  const approveWorkOrder = useApproveWorkOrder();
  const approveRisk = useApproveRisk();
  const approveEmergencyReview = useApproveEmergencyReview();
  const approveEmergencyPartner = useApproveEmergencyPartner();
  const rejectRisk = useRejectRisk();
  const revertSocioApproval = useRevertSocioApproval();
  const revertRiskApproval = useRevertRiskApproval();
  const completeRiskAssessment = useCompleteRiskAssessment();
  const rejectWorkOrder = useRejectWorkOrder();
  const unsubmitWorkOrder = useUnsubmitWorkOrder();
  const resyncWorksheet = useResyncWorksheetToWorkOrder();
  const upsertPaymentPlan = useUpsertPaymentPlan();
  const batchUpsertInstallments = useBatchUpsertInstallments();
  const deletePaymentPlan = useDeletePaymentPlan();
  const saveWorkOrderStaffing = useSaveWorkOrderStaffing();
  const { isAdmin, isPartner, isDirector, isManager } = useUserRole();

  const [currency, setCurrency] = useState<"USD" | "BOB" | "USDT">("BOB");
  const [seasonMode, setSeasonMode] = useState<"High" | "Low">("High");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [budgetLines, setBudgetLines] = useState<BudgetLineInput[]>([]);
  const [expenseBudget, setExpenseBudget] = useState<ExpenseBudgetInput[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanInput | null>(null);
  const [paymentInstallments, setPaymentInstallments] = useState<PaymentInstallmentInput[]>([]);
  const [originalPaymentPlan, setOriginalPaymentPlan] = useState<PaymentPlanInput | null>(null);
  const [originalInstallments, setOriginalInstallments] = useState<PaymentInstallmentInput[]>([]);
  const [originalBudgetLines, setOriginalBudgetLines] = useState<string[]>([]);
  const [originalExpenses, setOriginalExpenses] = useState<string[]>([]);
  const [showResyncDialog, setShowResyncDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  const [ceacCompletedAt, setCeacCompletedAt] = useState<string | null>(null);
  const [ceacNotes, setCeacNotes] = useState<string | null>(null);
  const [sanCompletedAt, setSanCompletedAt] = useState<string | null>(null);
  const [sanNotes, setSanNotes] = useState<string | null>(null);
  const [ceacNumber, setCeacNumber] = useState<string | null>(null);
  const [sanApprovalId, setSanApprovalId] = useState<string | null>(null);
  const [riskLevel, setRiskLevel] = useState<string | null>(null);
  const [originalCeacCompletedAt, setOriginalCeacCompletedAt] = useState<string | null>(null);
  const [originalSanCompletedAt, setOriginalSanCompletedAt] = useState<string | null>(null);
  const [originalCeacNotes, setOriginalCeacNotes] = useState<string | null>(null);
  const [originalSanNotes, setOriginalSanNotes] = useState<string | null>(null);
  const [originalCeacNumber, setOriginalCeacNumber] = useState<string | null>(null);
  const [originalSanApprovalId, setOriginalSanApprovalId] = useState<string | null>(null);
  const [originalRiskLevel, setOriginalRiskLevel] = useState<string | null>(null);

  // Prevents the useEffect from clobbering in-progress risk edits when a non-risk save triggers a refetch.
  // Set to true on any user edit; reset to false after risk data is persisted to DB.
  const riskEditedRef = useRef(false);

  // Staffing Requirements (Fase 4)
  const [staffing, setStaffing] = useState<StaffingRequirementInput[]>([]);
  const [originalStaffing, setOriginalStaffing] = useState<StaffingRequirementInput[]>([]);
  // Same guard as riskEditedRef: a refetch (e.g. after a non-staffing save) must not
  // clobber in-progress staffing edits. Reset to false only after a successful save,
  // right before the invalidated query re-hydrates the fresh persisted baseline.
  const staffingEditedRef = useRef(false);
  const [staffingFocusSignal, setStaffingFocusSignal] = useState(0);

  // Track original values for dirty check
  const [originalAdjustment, setOriginalAdjustment] = useState(0);
  const [originalExpenseData, setOriginalExpenseData] = useState<ExpenseBudgetInput[]>([]);

  const taxRate = parseFloat(globalTaxRate || "0.13");

  // Load work order data
  useEffect(() => {
    if (workOrder) {
      setCurrency(workOrder.currency);
      setSeasonMode(workOrder.season_mode);
      const adj = Number(workOrder.adjustment_amount) || 0;
      setAdjustmentAmount(adj);
      setOriginalAdjustment(adj);

      // Load budget lines - sorted by category display_order
      const lines: BudgetLineInput[] = (workOrder.budget_lines || [])
        .sort((a, b) => {
          const orderA = a.category?.display_order ?? 999;
          const orderB = b.category?.display_order ?? 999;
          return orderA - orderB;
        })
        .map((bl) => ({
          id: bl.wo_line_id,
          category_id: bl.category_id,
          budgeted_hours: Number(bl.budgeted_hours),
          standard_rate: Number(bl.standard_rate),
        }));
      setBudgetLines(lines);
      setOriginalBudgetLines(lines.map((l) => l.id));

      // Load expense budgets
      const expenses: ExpenseBudgetInput[] = (workOrder.expense_budget || []).map((exp) => ({
        id: exp.wo_exp_id,
        expense_type_id: exp.expense_type_id,
        budgeted_amount: Number(exp.budgeted_amount),
      }));
      setExpenseBudget(expenses);
      setOriginalExpenses(expenses.map((e) => e.id));
      setOriginalExpenseData(JSON.parse(JSON.stringify(expenses))); // Deep copy

      // Load payment plan
      if (workOrder.payment_plan) {
        const plan: PaymentPlanInput = {
          plan_id: workOrder.payment_plan.plan_id,
          wo_id: workOrder.payment_plan.wo_id,
          exchange_rate: workOrder.payment_plan.exchange_rate,
          payment_days: workOrder.payment_plan.payment_days,
        };
        const installs: PaymentInstallmentInput[] = (workOrder.payment_plan.installments ?? [])
          .sort((a, b) => a.installment_number - b.installment_number)
          .map((i) => ({
            installment_id: i.installment_id,
            plan_id: i.plan_id,
            wo_id: i.wo_id,
            installment_number: i.installment_number,
            agreed_invoice_date: i.agreed_invoice_date,
            agreed_payment_date: i.agreed_payment_date,
            collection_invoice_date: i.collection_invoice_date,
            collection_payment_date: i.collection_payment_date,
            payment_date_actual: i.payment_date_actual,
            percentage: Number(i.percentage),
            amount: i.amount !== null ? Number(i.amount) : null,
            status: i.status as PaymentInstallmentInput["status"],
          }));
        setPaymentPlan(plan);
        setPaymentInstallments(installs);
        setOriginalPaymentPlan(plan);
        setOriginalInstallments(JSON.parse(JSON.stringify(installs)));
      } else {
        setPaymentPlan(null);
        setPaymentInstallments([]);
        setOriginalPaymentPlan(null);
        setOriginalInstallments([]);
      }

      const riskCeac = workOrder.ceac_completed_at ?? null;
      const riskSan = workOrder.san_completed_at ?? null;
      // Only reset current risk state from DB when the user hasn't edited them locally.
      // Prevents non-risk saves (handleSubmit) from clobbering in-progress risk edits via refetch.
      if (!riskEditedRef.current) {
        setCeacCompletedAt(riskCeac);
        setCeacNotes(workOrder.ceac_notes ?? null);
        setSanCompletedAt(riskSan);
        setSanNotes(workOrder.san_notes ?? null);
        setCeacNumber(workOrder.ceac_number ?? null);
        setSanApprovalId(workOrder.san_approval_id ?? null);
        setRiskLevel(workOrder.risk_level ?? null);
      }
      setOriginalCeacCompletedAt(riskCeac);
      setOriginalSanCompletedAt(riskSan);
      setOriginalCeacNotes(workOrder.ceac_notes ?? null);
      setOriginalSanNotes(workOrder.san_notes ?? null);
      setOriginalCeacNumber(workOrder.ceac_number ?? null);
      setOriginalSanApprovalId(workOrder.san_approval_id ?? null);
      setOriginalRiskLevel(workOrder.risk_level ?? null);
    }
  }, [workOrder]);

  // Load staffing requirements once the query resolves. Skipped while the user has
  // in-progress edits (staffingEditedRef) so a non-staffing save's refetch doesn't
  // clobber them; the ref is reset to false only after a successful staffing save,
  // so the invalidated refetch below re-hydrates both `staffing` and `originalStaffing`
  // from the freshly persisted state.
  useEffect(() => {
    if (staffingRows && !staffingEditedRef.current) {
      const hydrated = hydrateFromPersisted(staffingRows);
      setStaffing(hydrated);
      setOriginalStaffing(hydrated);
    }
  }, [staffingRows]);

  // Engagement's service, resolved the same way as WorksheetEdit.tsx: practica ->
  // services.code -> service_id. practica === null (legacy engagement, no service
  // assigned) intentionally leaves staffing unscoped (matches save_wo_staffing,
  // which skips the cross-service check when the engagement has no practica).
  const practica = workOrder?.engagement?.practica ?? null;
  const engagementService = useMemo(
    () => (services ?? []).find((s) => s.code === practica),
    [services, practica],
  );
  // False only when practica IS set but doesn't resolve to any service — a genuine
  // data issue that must block staffing saves with a translated error.
  const staffingServiceResolved = practica === null || !!engagementService;
  const staffingCategories = useMemo(() => {
    if (!categories) return [];
    if (practica === null) return categories;
    return categories.filter((c) => c.service_id === engagementService?.service_id);
  }, [categories, practica, engagementService]);
  // null = no cross-service check (practica === null, see above). Otherwise the
  // exact allow-list validateStaffing enforces, including for historical rows
  // whose category no longer belongs to the engagement's current service.
  const staffingServiceCategoryIds = useMemo(
    () => (practica === null ? null : new Set(staffingCategories.map((c) => c.category_id))),
    [practica, staffingCategories],
  );

  const staffingDirty = useMemo(
    () => isStaffingDirty(originalStaffing, staffing),
    [originalStaffing, staffing],
  );

  const handleStaffingRequirementsChange = (reqs: StaffingRequirementInput[]) => {
    staffingEditedRef.current = true;
    setStaffing(reqs);
  };

  // Compute dirty state - only for expenses and adjustment (budget lines are read-only)
  const isDirty = useMemo(() => {
    if (!workOrder) return false;

    // Compare adjustment amount
    if (adjustmentAmount !== originalAdjustment) return true;

    // Compare expense count
    if (expenseBudget.length !== originalExpenseData.length) return true;

    // Compare expense IDs
    const currentExpIds = expenseBudget.map((e) => e.id).sort();
    const originalExpIds = originalExpenseData.map((e) => e.id).sort();
    if (JSON.stringify(currentExpIds) !== JSON.stringify(originalExpIds)) return true;

    // Compare expense values
    for (const exp of expenseBudget) {
      const orig = originalExpenseData.find((e) => e.id === exp.id);
      if (!orig) return true;
      if (orig.expense_type_id !== exp.expense_type_id) return true;
      if (orig.budgeted_amount !== exp.budgeted_amount) return true;
    }

    if (ceacCompletedAt !== originalCeacCompletedAt) return true;
    if (sanCompletedAt !== originalSanCompletedAt) return true;
    if ((ceacNotes ?? null) !== originalCeacNotes) return true;
    if ((sanNotes ?? null) !== originalSanNotes) return true;
    if ((ceacNumber ?? null) !== originalCeacNumber) return true;
    if ((sanApprovalId ?? null) !== originalSanApprovalId) return true;
    if ((riskLevel ?? null) !== originalRiskLevel) return true;

    // Payment plan
    if (JSON.stringify(paymentPlan) !== JSON.stringify(originalPaymentPlan)) return true;
    if (JSON.stringify(paymentInstallments) !== JSON.stringify(originalInstallments)) return true;

    // Staffing Requirements (Fase 4)
    if (staffingDirty) return true;

    return false;
  }, [workOrder, adjustmentAmount, originalAdjustment, expenseBudget, originalExpenseData, ceacCompletedAt, originalCeacCompletedAt, sanCompletedAt, originalSanCompletedAt, ceacNotes, originalCeacNotes, sanNotes, originalSanNotes, ceacNumber, originalCeacNumber, sanApprovalId, originalSanApprovalId, riskLevel, originalRiskLevel, paymentPlan, originalPaymentPlan, paymentInstallments, originalInstallments, staffingDirty]);

  // Tracks only fields that handleSubmit persists (not risk fields — those are saved atomically by submitWorkOrder)
  const hasNonRiskDirty = useMemo(() => {
    if (!workOrder) return false;
    if (adjustmentAmount !== originalAdjustment) return true;
    if (expenseBudget.length !== originalExpenseData.length) return true;
    const currentExpIds = expenseBudget.map((e) => e.id).sort();
    const originalExpIds = originalExpenseData.map((e) => e.id).sort();
    if (JSON.stringify(currentExpIds) !== JSON.stringify(originalExpIds)) return true;
    for (const exp of expenseBudget) {
      const orig = originalExpenseData.find((e) => e.id === exp.id);
      if (!orig) return true;
      if (orig.expense_type_id !== exp.expense_type_id) return true;
      if (orig.budgeted_amount !== exp.budgeted_amount) return true;
    }
    // Payment plan
    if (JSON.stringify(paymentPlan) !== JSON.stringify(originalPaymentPlan)) return true;
    if (JSON.stringify(paymentInstallments) !== JSON.stringify(originalInstallments)) return true;
    // Staffing Requirements (Fase 4) — persisted by handleSubmit, like expenses/payment plan.
    if (staffingDirty) return true;
    return false;
  }, [workOrder, adjustmentAmount, originalAdjustment, expenseBudget, originalExpenseData, paymentPlan, originalPaymentPlan, paymentInstallments, originalInstallments, staffingDirty]);

  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  // Check if user can approve
  const canApprove = staffRecord?.category?.can_approve_wo || false;
  // FEAT 0602-135: el aprobador de Riesgos es el SQR ASIGNADO al encargo (engagement.sqr_id),
  // con el Admin como respaldo. El selector de SQR admite CUALQUIER staff activo (p. ej. un
  // partner/director designado como revisor de calidad) y la RLS autoriza por sqr_id SOLO —sin
  // exigir el rol global `sqr`—, así que el gate se basa en la asignación, no en el rol; de lo
  // contrario un SQR asignado sin rol `sqr` vería los botones ocultos pese a estar autorizado en BD.
  // Necesita staff record porque risk_approved_by referencia staff(staff_id).
  const isAssignedSqr =
    !!staffRecord && workOrder?.engagement?.sqr_id === staffRecord.staff_id;
  const canApproveRisk = (isAdmin || isAssignedSqr) && !!staffRecord;

  const approvalStatus = workOrder?.approval_status as "Draft" | "Pending_Approval" | "Approved" | "Rejected" || "Draft";
  const isLocked = approvalStatus === "Approved" || approvalStatus === "Pending_Approval" || approvalStatus === "Rejected";

  // Persists everything "Enviar para Aprobación" doesn't otherwise touch (adjustment,
  // expenses, payment plan, staffing) — the same steps handleSubmit ("Guardar") runs.
  // Shared so a single click on either button can both save and proceed, instead of
  // forcing a separate Guardar first. Returns false (already toasted) on a validation
  // failure; lets a mutation failure propagate (its own onError already toasted) so
  // the caller aborts without marking anything as submitted.
  const persistNonRiskChanges = async (): Promise<boolean> => {
    if (!workOrder) return false;

    // Validate before any mutations to avoid partial saves
    if (paymentInstallments.length > 0) {
      if (paymentInstallments.some((i) => i.percentage < 0 || i.percentage > 100)) {
        toast.error(t("workOrders.paymentPlan.validationPercentageRange"));
        return false;
      }
      const pctSum = paymentInstallments.reduce((s, i) => s + i.percentage, 0);
      if (Math.abs(pctSum - 100) > 0.01) {
        toast.error(t("workOrders.paymentPlan.validationPercentageSum"));
        return false;
      }
    }

    // Staffing must validate before ANY mutation runs (todo-o-nada) — including the
    // read query having actually loaded OK, so a schema/network error is never
    // mistaken for "no staffing" and saved as a silent wipe.
    if (staffingDirty) {
      if (staffingLoading || staffingIsError) {
        toast.error(t("workOrders.staffingRequirements.errorLoading"));
        return false;
      }
      const staffingValidationError = validateStaffing(staffing, {
        serviceCategoryIds: staffingServiceCategoryIds,
      });
      if (staffingValidationError) {
        toast.error(t(STAFFING_VALIDATION_ERROR_I18N_KEY[staffingValidationError.code]));
        setStaffingFocusSignal((n) => n + 1);
        return false;
      }
    }

    // Update work order
    await updateWorkOrder.mutateAsync({
      id: workOrder.wo_id,
      data: {
        adjustment_amount: adjustmentAmount,
      },
    });

    // Handle budget lines - now read-only, so skip budget line updates
    // Budget lines are only modified via Resync from Work Matrix

    // Handle expense budgets
    const currentExpIds = expenseBudget.map((e) => e.id);
    const deletedExpIds = originalExpenses.filter((id) => !currentExpIds.includes(id));

    for (const expId of deletedExpIds) {
      await deleteExpenseBudget.mutateAsync(expId);
    }

    for (const exp of expenseBudget) {
      if (exp.expense_type_id && exp.budgeted_amount > 0) {
        if (originalExpenses.includes(exp.id)) {
          await updateExpenseBudget.mutateAsync({
            id: exp.id,
            data: {
              expense_type_id: exp.expense_type_id,
              budgeted_amount: exp.budgeted_amount,
            },
          });
        } else {
          await createExpenseBudget.mutateAsync({
            wo_id: workOrder.wo_id,
            expense_type_id: exp.expense_type_id,
            budgeted_amount: exp.budgeted_amount,
          });
        }
      }
    }

    // Persist payment plan
    if (paymentInstallments.length > 0) {
      const savedPlan = await upsertPaymentPlan.mutateAsync({
        plan_id: paymentPlan?.plan_id,
        wo_id: workOrder.wo_id,
        exchange_rate: paymentPlan?.exchange_rate ?? null,
        payment_days: paymentPlan?.payment_days ?? 30,
      });
      await batchUpsertInstallments.mutateAsync({
        planId: savedPlan.plan_id,
        woId: workOrder.wo_id,
        installments: paymentInstallments,
      });
      const updatedPlan: PaymentPlanInput = {
        plan_id: savedPlan.plan_id,
        wo_id: savedPlan.wo_id,
        exchange_rate: savedPlan.exchange_rate,
        payment_days: savedPlan.payment_days,
      };
      setOriginalPaymentPlan(updatedPlan);
      setOriginalInstallments(JSON.parse(JSON.stringify(paymentInstallments)));
    } else if (paymentPlan?.plan_id) {
      // All installments removed → delete the plan (cascades to installments)
      await deletePaymentPlan.mutateAsync({
        planId: paymentPlan.plan_id,
        woId: workOrder.wo_id,
      });
      setOriginalPaymentPlan(null);
      setOriginalInstallments([]);
    }

    // Reset dirty state tracking after successful save
    setOriginalAdjustment(adjustmentAmount);
    setOriginalExpenses(expenseBudget.map((e) => e.id));
    setOriginalExpenseData(JSON.parse(JSON.stringify(expenseBudget)));

    // Staffing: invoked last, only when dirty, in a single RPC call. A failure here
    // propagates (the caller's try/catch aborts) and must leave staffing dirty + the
    // form open so the user can retry (the RPC is transactional — retrying never
    // creates duplicates).
    if (staffingDirty) {
      await saveWorkOrderStaffing.mutateAsync({ woId: workOrder.wo_id, requirements: staffing });
      // Reset BEFORE the query-invalidation refetch lands, so the hydration effect
      // re-hydrates staffing/originalStaffing from the freshly persisted state.
      staffingEditedRef.current = false;
    }

    return true;
  };

  const handleSubmit = async () => {
    try {
      const persisted = await persistNonRiskChanges();
      if (!persisted) return;
      toast.success(t("messages.updateSuccess", { entity: t("entities.workOrder") }));
    } catch (error) {
      // Error handled by mutations
    }
  };

  const handleSubmitForApproval = async (emergencyJustification?: string) => {
    if (!workOrder) return;

    // Enviar para Aprobación now saves any pending non-risk edits (ajuste/gastos/plan
    // de pagos/staffing) first, in the same click — no separate "Guardar" required.
    // A validation failure or a mutation failure here must cancel the submission
    // entirely (no partial "saved but not submitted, or submitted but not saved").
    try {
      const persisted = await persistNonRiskChanges();
      if (!persisted) return;
    } catch (error) {
      // Error already toasted by the failing mutation's own onError; abort the submit.
      return;
    }

    // Reenvío de la pista Socio en corrección (estado Rejected): no se re-evalúa ni se
    // reescribe Riesgos; solo se reabre la pista Socio a Pending_Approval. La pista de
    // Riesgos conserva su estado (aprobada, o rechazada y corregida por separado).
    if (workOrder.approval_status === "Rejected") {
      await updateWorkOrder.mutateAsync({
        id: workOrder.wo_id,
        data: { approval_status: "Pending_Approval" },
      });
      return;
    }
    const CEAC_NUM_RE = /^\d{10}$/;
    const SAN_ID_RE = /^\d{10}$|^\d{5}-\d{5}$/;
    const allComplete =
      !!ceacCompletedAt && CEAC_NUM_RE.test(ceacNumber ?? '')
      && !!sanCompletedAt && SAN_ID_RE.test(sanApprovalId ?? '')
      && !!riskLevel;
    const allEmpty =
      !ceacCompletedAt && !ceacNumber && !sanCompletedAt && !sanApprovalId && !riskLevel;
    // All-or-nothing: complete (normal) or empty (emergency). Partial is blocked.
    if (!allComplete && !allEmpty) {
      toast.error(t("workOrders.riskAssessmentRequired"));
      return;
    }
    await submitWorkOrder.mutateAsync({
      woId: workOrder.wo_id,
      ceacCompletedAt,
      ceacNotes,
      sanCompletedAt,
      sanNotes,
      ceacNumber,
      sanApprovalId,
      riskLevel,
      // Emergency justification:
      //   null  → normal submit with data (clear any stale value).
      //   value → new emergency submit (from modal).
      //   undefined → Risk track already Emergency_Approved, re-submitting Socio only;
      //               useSubmitWorkOrder will skip writing the key, preserving DB value.
      emergencyJustification: !allEmpty
        ? null
        : workOrder.risk_status === "Emergency_Approved"
          ? undefined
          : (emergencyJustification ?? null),
      // Reset Risk track from Rejected → Pending so the Risk team gets a fresh review
      // signal. Approved/Emergency_Approved are preserved (independent tracks, A1).
      resetRiskToPending: workOrder.risk_status === "Rejected",
    });
    riskEditedRef.current = false;
  };

  const handleApprove = async () => {
    if (!workOrder || !staffRecord) return;
    await approveWorkOrder.mutateAsync({
      woId: workOrder.wo_id,
      staffId: staffRecord.staff_id,
    });
  };

  const handleApproveRisk = async () => {
    if (!workOrder || !staffRecord) return;
    await approveRisk.mutateAsync({
      woId: workOrder.wo_id,
      staffId: staffRecord.staff_id,
    });
  };

  // Emergency step 1: Riesgo (assistant).
  const handleApproveEmergencyReview = async () => {
    if (!workOrder || !staffRecord) return;
    await approveEmergencyReview.mutateAsync({
      woId: workOrder.wo_id,
      staffId: staffRecord.staff_id,
    });
  };

  // Emergency step 2: Socio de Riesgos (starts the deadline, closes the OT).
  const handleApproveEmergencyPartner = async () => {
    if (!workOrder || !staffRecord) return;
    await approveEmergencyPartner.mutateAsync({
      woId: workOrder.wo_id,
      staffId: staffRecord.staff_id,
    });
  };

  const handleRejectRisk = async (riskNotes: string | null) => {
    if (!workOrder) return;
    await rejectRisk.mutateAsync({ woId: workOrder.wo_id, riskNotes });
  };

  // Admin-only: revertir aprobaciones accidentales.
  const handleRevertSocio = async () => {
    if (!workOrder) return;
    await revertSocioApproval.mutateAsync({ woId: workOrder.wo_id });
  };

  const handleRevertRisk = async () => {
    if (!workOrder) return;
    await revertRiskApproval.mutateAsync({ woId: workOrder.wo_id });
  };

  const handleCompleteRisk = async (emergencyJustification?: string) => {
    if (!workOrder) return;
    const justification =
      typeof emergencyJustification === "string" ? emergencyJustification : undefined;
    await completeRiskAssessment.mutateAsync({
      woId: workOrder.wo_id,
      ceacCompletedAt,
      ceacNotes,
      sanCompletedAt,
      sanNotes,
      ceacNumber,
      sanApprovalId,
      riskLevel,
      emergencyJustification: justification,
      // FEAT 0602-135: reenvío tras RECHAZO de Riesgos de una OT ya cerrada → bajar el Socio a
      // Pending_Approval para que NO sea cargable hasta que Riesgos vuelva a aprobar. La
      // compleción de emergencia (risk no rechazado) no lo activa y sigue cargable.
      resetSocioToPending:
        workOrder.approval_status === "Approved" && workOrder.risk_status === "Rejected",
    });
    riskEditedRef.current = false;
  };

  const handleClearRiskData = () => {
    riskEditedRef.current = true;
    setCeacCompletedAt(null);
    setCeacNumber(null);
    setSanCompletedAt(null);
    setSanApprovalId(null);
    setRiskLevel(null);
  };

  const handleReject = () => {
    setShowRejectDialog(true);
  };

  const handleRejectConfirm = async () => {
    if (!workOrder) return;
    await rejectWorkOrder.mutateAsync({ woId: workOrder.wo_id, notes: rejectNotes });
    setShowRejectDialog(false);
    setRejectNotes("");
  };

  const handleUnsubmit = async () => {
    if (!workOrder) return;
    await unsubmitWorkOrder.mutateAsync({
      woId: workOrder.wo_id,
      currentRiskStatus: workOrder.risk_status,
    });
  };

  const handleResync = async () => {
    if (!workOrder || !linkedWorksheet) return;
    await resyncWorksheet.mutateAsync({
      worksheetId: linkedWorksheet.id,
      woId: workOrder.wo_id,
    });
    setShowResyncDialog(false);
  };

  const handleRiskAssessmentChange = (field: string, value: string | null) => {
    riskEditedRef.current = true;
    if (field === 'ceacCompletedAt') setCeacCompletedAt(value);
    else if (field === 'ceacNotes') setCeacNotes(value);
    else if (field === 'sanCompletedAt') setSanCompletedAt(value);
    else if (field === 'sanNotes') setSanNotes(value);
    else if (field === 'ceacNumber') setCeacNumber(value);
    else if (field === 'sanApprovalId') setSanApprovalId(value);
    else if (field === 'riskLevel') setRiskLevel(value);
  };

  if (isLoading) {
    return (
      <AppLayout title={t("entities.workOrder")} focusMode>
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!workOrder) {
    return (
      <AppLayout title={t("entities.workOrder")} focusMode>
        <div className="text-center py-12 text-muted-foreground">
          {t("common.noResults")}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`${t("entities.workOrder")} - ${workOrder.engagement?.engagement_code || ""}`} focusMode>
      <div className="space-y-6">
        {/* Engagement Info */}
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("entities.engagement")}</p>
                <p className="font-semibold">
                  {workOrder.engagement?.engagement_code} - {workOrder.engagement?.engagement_name}
                </p>
                <p className="text-sm text-muted-foreground">{workOrder.engagement?.client?.client_legal_name}</p>
              </div>
              {/* Show linked worksheet buttons if exists - always in same position */}
              {linkedWorksheet?.wo_id === workOrder.wo_id && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResyncDialog(true)}
                    disabled={isLocked || resyncWorksheet.isPending || currency === "USDT"}
                    className="gap-2 bg-info/10 hover:bg-info/20 text-info border-info/30"
                  >
                    <RefreshCw className={`h-4 w-4 ${resyncWorksheet.isPending ? "animate-spin" : ""}`} />
                    {t("workMatrix.resyncToWorkOrder")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { allowNextNavigation(); navigate(`/worksheets/${linkedWorksheet.id}`); }}
                    className="gap-2 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    {t("workMatrix.viewWorksheet")}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Work Order Form */}
        <WorkOrderForm
          currency={currency}
          seasonMode={seasonMode}
          approvalStatus={approvalStatus}
          approvedAt={workOrder.approved_at}
          adjustmentAmount={adjustmentAmount}
          taxRate={workOrder.tax_rate || taxRate}
          budgetLines={budgetLines}
          expenseBudget={expenseBudget}
          isNew={false}
          isDirty={isDirty}
          hasNonRiskDirty={hasNonRiskDirty}
          onCurrencyChange={setCurrency}
          onSeasonChange={setSeasonMode}
          onAdjustmentChange={setAdjustmentAmount}
          onBudgetLinesChange={setBudgetLines}
          onExpenseBudgetChange={setExpenseBudget}
          onSubmit={handleSubmit}
          onSubmitForApproval={handleSubmitForApproval}
          onApprove={handleApprove}
          onReject={handleReject}
          onUnsubmit={handleUnsubmit}
          onCancel={() => { allowNextNavigation(); navigate("/work-orders"); }}
          rejectionNote={workOrder?.notes ?? null}
          isLocked={isLocked}
          canApprove={canApprove}
          canApproveRisk={canApproveRisk}
          riskStatus={workOrder.risk_status}
          emergencyDeadlineAt={workOrder.emergency_deadline_at}
          emergencyReviewAt={workOrder.emergency_review_at}
          emergencyPartnerAt={workOrder.emergency_partner_at}
          emergencyJustification={workOrder.emergency_justification}
          onApproveRisk={handleApproveRisk}
          onRejectRisk={handleRejectRisk}
          onApproveEmergencyReview={handleApproveEmergencyReview}
          onApproveEmergencyPartner={handleApproveEmergencyPartner}
          onCompleteRisk={handleCompleteRisk}
          onClearRiskData={handleClearRiskData}
          riskNote={workOrder.risk_notes}
          canRevert={isAdmin}
          onRevertSocio={handleRevertSocio}
          onRevertRisk={handleRevertRisk}
          ceacCompletedAt={ceacCompletedAt}
          ceacNotes={ceacNotes}
          sanCompletedAt={sanCompletedAt}
          sanNotes={sanNotes}
          ceacNumber={ceacNumber}
          sanApprovalId={sanApprovalId}
          riskLevel={riskLevel}
          onRiskAssessmentChange={handleRiskAssessmentChange}
          woId={workOrder.wo_id}
          paymentPlan={paymentPlan}
          paymentInstallments={paymentInstallments}
          isAdminDateEditable={(approvalStatus === "Draft" || approvalStatus === "Rejected") && (isAdmin || isPartner || isDirector || isManager)}
          isStatusEditable={isAdmin}
          isPaymentPlanDirty={
            JSON.stringify(paymentInstallments) !== JSON.stringify(originalInstallments) ||
            JSON.stringify(paymentPlan) !== JSON.stringify(originalPaymentPlan)
          }
          onPaymentPlanChange={setPaymentPlan}
          onPaymentInstallmentsChange={setPaymentInstallments}
          staffingRequirements={staffing}
          onStaffingRequirementsChange={handleStaffingRequirementsChange}
          staffingCategories={staffingCategories}
          activeSkills={activeSkills ?? []}
          staffingLoading={staffingLoading}
          staffingError={staffingIsError}
          staffingServiceResolved={staffingServiceResolved}
          staffingFocusSignal={staffingFocusSignal}
          isSubmitting={
            updateWorkOrder.isPending ||
            submitWorkOrder.isPending ||
            approveWorkOrder.isPending ||
            approveRisk.isPending ||
            approveEmergencyReview.isPending ||
            approveEmergencyPartner.isPending ||
            rejectRisk.isPending ||
            revertSocioApproval.isPending ||
            revertRiskApproval.isPending ||
            completeRiskAssessment.isPending ||
            rejectWorkOrder.isPending ||
            unsubmitWorkOrder.isPending ||
            saveWorkOrderStaffing.isPending
          }
        />
      </div>

      {/* Resync Confirmation Dialog */}
      <AlertDialog open={showResyncDialog} onOpenChange={setShowResyncDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workMatrix.resyncConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workMatrix.resyncConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleResync}
              disabled={resyncWorksheet.isPending}
            >
              {resyncWorksheet.isPending ? t("common.loading") : t("workMatrix.resyncToWorkOrder")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Rejection Note Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workOrders.rejectDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workOrders.rejectDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={t("workOrders.rejectNotePlaceholder")}
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectNotes("")}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRejectConfirm}
              disabled={rejectWorkOrder.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t("workOrders.rejectDialogConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default WorkOrderEdit;

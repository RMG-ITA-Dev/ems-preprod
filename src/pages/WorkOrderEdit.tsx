import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { WorkOrderForm, BudgetLineInput, ExpenseBudgetInput } from "@/components/forms/WorkOrderForm";
import { useWorkOrderById, useSetting, useCategories } from "@/hooks/useEmsData";
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
  useRejectWorkOrder,
  useUnsubmitWorkOrder,
} from "@/hooks/mutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
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
import { Textarea } from "@/components/ui/textarea";

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

  const updateWorkOrder = useUpdateWorkOrder();
  const createBudgetLine = useCreateBudgetLine();
  const updateBudgetLine = useUpdateBudgetLine();
  const deleteBudgetLine = useDeleteBudgetLine();
  const createExpenseBudget = useCreateExpenseBudget();
  const updateExpenseBudget = useUpdateExpenseBudget();
  const deleteExpenseBudget = useDeleteExpenseBudget();
  const submitWorkOrder = useSubmitWorkOrder();
  const approveWorkOrder = useApproveWorkOrder();
  const rejectWorkOrder = useRejectWorkOrder();
  const unsubmitWorkOrder = useUnsubmitWorkOrder();
  const resyncWorksheet = useResyncWorksheetToWorkOrder();

  const [currency, setCurrency] = useState<"USD" | "BOB">("BOB");
  const [seasonMode, setSeasonMode] = useState<"High" | "Low">("High");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [budgetLines, setBudgetLines] = useState<BudgetLineInput[]>([]);
  const [expenseBudget, setExpenseBudget] = useState<ExpenseBudgetInput[]>([]);
  const [originalBudgetLines, setOriginalBudgetLines] = useState<string[]>([]);
  const [originalExpenses, setOriginalExpenses] = useState<string[]>([]);
  const [showResyncDialog, setShowResyncDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

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
    }
  }, [workOrder]);

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

    return false;
  }, [workOrder, adjustmentAmount, originalAdjustment, expenseBudget, originalExpenseData]);

  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  // Check if user can approve
  const canApprove = staffRecord?.category?.can_approve_wo || false;

  const approvalStatus = workOrder?.approval_status as "Draft" | "Pending_Approval" | "Approved" | "Rejected" || "Draft";
  const isLocked = approvalStatus === "Approved" || approvalStatus === "Pending_Approval" || approvalStatus === "Rejected";

  const handleSubmit = async () => {
    if (!workOrder) return;

    try {
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

      // Reset dirty state tracking after successful save
      setOriginalAdjustment(adjustmentAmount);
      setOriginalExpenses(expenseBudget.map((e) => e.id));
      setOriginalExpenseData(JSON.parse(JSON.stringify(expenseBudget)));

      toast.success(t("messages.updateSuccess", { entity: t("entities.workOrder") }));
    } catch (error) {
      // Error handled by mutations
    }
  };

  const handleSubmitForApproval = async () => {
    if (!workOrder) return;
    await submitWorkOrder.mutateAsync(workOrder.wo_id);
  };

  const handleApprove = async () => {
    if (!workOrder || !staffRecord) return;
    await approveWorkOrder.mutateAsync({ woId: workOrder.wo_id, staffId: staffRecord.staff_id });
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
    await unsubmitWorkOrder.mutateAsync(workOrder.wo_id);
  };

  const handleResync = async () => {
    if (!workOrder || !linkedWorksheet) return;
    await resyncWorksheet.mutateAsync({
      worksheetId: linkedWorksheet.id,
      woId: workOrder.wo_id,
    });
    setShowResyncDialog(false);
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
                    disabled={isLocked || resyncWorksheet.isPending}
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
          adjustmentAmount={adjustmentAmount}
          taxRate={workOrder.tax_rate || taxRate}
          budgetLines={budgetLines}
          expenseBudget={expenseBudget}
          isNew={false}
          isDirty={isDirty}
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
          isLocked={isLocked}
          canApprove={canApprove}
          rejectionNote={workOrder?.notes ?? null}
          isSubmitting={
            updateWorkOrder.isPending ||
            submitWorkOrder.isPending ||
            approveWorkOrder.isPending ||
            rejectWorkOrder.isPending ||
            unsubmitWorkOrder.isPending
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

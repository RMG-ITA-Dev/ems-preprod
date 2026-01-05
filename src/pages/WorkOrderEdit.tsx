import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSpreadsheet } from "lucide-react";
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
} from "@/hooks/useEmsMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useWorksheetByEngagementId } from "@/hooks/useWorksheetData";
import { toast } from "sonner";

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

  const [currency, setCurrency] = useState<"USD" | "BOB">("BOB");
  const [seasonMode, setSeasonMode] = useState<"High" | "Low">("High");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [budgetLines, setBudgetLines] = useState<BudgetLineInput[]>([]);
  const [expenseBudget, setExpenseBudget] = useState<ExpenseBudgetInput[]>([]);
  const [originalBudgetLines, setOriginalBudgetLines] = useState<string[]>([]);
  const [originalExpenses, setOriginalExpenses] = useState<string[]>([]);

  const taxRate = parseFloat(globalTaxRate || "0.13");

  // Load work order data
  useEffect(() => {
    if (workOrder) {
      setCurrency(workOrder.currency);
      setSeasonMode(workOrder.season_mode);
      setAdjustmentAmount(Number(workOrder.adjustment_amount) || 0);

      // Load budget lines
      const lines: BudgetLineInput[] = (workOrder.budget_lines || []).map((bl) => ({
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
    }
  }, [workOrder]);

  // Check if user can approve
  const canApprove = staffRecord?.category?.can_approve_wo || false;

  const approvalStatus = workOrder?.approval_status as "Draft" | "Pending_Approval" | "Approved" | "Rejected" || "Draft";
  const isLocked = approvalStatus === "Approved" || approvalStatus === "Pending_Approval";

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

      // Handle budget lines
      const currentIds = budgetLines.map((l) => l.id);
      const deletedIds = originalBudgetLines.filter((id) => !currentIds.includes(id));

      // Delete removed lines
      for (const lineId of deletedIds) {
        await deleteBudgetLine.mutateAsync(lineId);
      }

      // Update or create lines
      for (const line of budgetLines) {
        if (line.category_id && line.budgeted_hours > 0) {
          if (originalBudgetLines.includes(line.id)) {
            await updateBudgetLine.mutateAsync({
              id: line.id,
              data: {
                category_id: line.category_id,
                budgeted_hours: line.budgeted_hours,
                standard_rate: line.standard_rate,
              },
            });
          } else {
            await createBudgetLine.mutateAsync({
              wo_id: workOrder.wo_id,
              category_id: line.category_id,
              budgeted_hours: line.budgeted_hours,
              standard_rate: line.standard_rate,
            });
          }
        }
      }

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

  const handleReject = async () => {
    if (!workOrder) return;
    await rejectWorkOrder.mutateAsync(workOrder.wo_id);
  };

  if (isLoading) {
    return (
      <AppLayout title={t("entities.workOrder")}>
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!workOrder) {
    return (
      <AppLayout title={t("entities.workOrder")}>
        <div className="text-center py-12 text-muted-foreground">
          {t("common.noResults")}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`${t("entities.workOrder")} - ${workOrder.engagement?.engagement_code || ""}`}>
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
              {/* Show linked worksheet badge if exists */}
              {linkedWorksheet?.wo_id === workOrder.wo_id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/worksheets/${linkedWorksheet.id}`)}
                  className="gap-2"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {t("workMatrix.viewWorksheet")}
                </Button>
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
          onCurrencyChange={setCurrency}
          onSeasonChange={setSeasonMode}
          onAdjustmentChange={setAdjustmentAmount}
          onBudgetLinesChange={setBudgetLines}
          onExpenseBudgetChange={setExpenseBudget}
          onSubmit={handleSubmit}
          onSubmitForApproval={handleSubmitForApproval}
          onApprove={handleApprove}
          onReject={handleReject}
          onCancel={() => navigate("/work-orders")}
          isLocked={isLocked}
          canApprove={canApprove}
          isSubmitting={
            updateWorkOrder.isPending ||
            submitWorkOrder.isPending ||
            approveWorkOrder.isPending ||
            rejectWorkOrder.isPending
          }
        />
      </div>
    </AppLayout>
  );
};

export default WorkOrderEdit;

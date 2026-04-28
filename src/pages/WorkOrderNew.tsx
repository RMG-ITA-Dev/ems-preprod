import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { WorkOrderForm, BudgetLineInput, ExpenseBudgetInput } from "@/components/forms/WorkOrderForm";
import { useEngagements, useSetting, useCategories, useWorkOrders } from "@/hooks/useEmsData";
import { useUserRole } from "@/hooks/useUserRole";
import { useWorksheetByEngagementId } from "@/hooks/useWorksheetData";
import { useCreateWorkOrder, useCreateBudgetLine, useCreateExpenseBudget } from "@/hooks/mutations";
import { toast } from "sonner";

const WorkOrderNew = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const engagementIdParam = searchParams.get("engagement");
  const { isAdmin, isPartner, isDirector, isManager, isLoading: roleLoading } = useUserRole();
  const canCreate = isAdmin || isPartner || isDirector || isManager;

  const { data: engagements } = useEngagements();
  const { data: categories } = useCategories();
  const { data: workOrders } = useWorkOrders();
  const globalTaxRate = useSetting("TAX_RATE");

  const createWorkOrder = useCreateWorkOrder();
  const createBudgetLine = useCreateBudgetLine();
  const createExpenseBudget = useCreateExpenseBudget();

  const [selectedEngagementId, setSelectedEngagementId] = useState(engagementIdParam || "");
  const [currency, setCurrency] = useState<"USD" | "BOB">("BOB");
  const [seasonMode, setSeasonMode] = useState<"High" | "Low">("High");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [budgetLines, setBudgetLines] = useState<BudgetLineInput[]>([]);
  const [expenseBudget, setExpenseBudget] = useState<ExpenseBudgetInput[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const woIsDirty = !!(selectedEngagementId || budgetLines.length > 0 || expenseBudget.length > 0);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: woIsDirty });
  const taxRate = parseFloat(globalTaxRate || "0.13");

  useEffect(() => {
    if (!roleLoading && !canCreate) {
      allowNextNavigation();
      navigate("/work-orders", { replace: true });
    }
  }, [roleLoading, canCreate, allowNextNavigation, navigate]);

  // Get list of engagement IDs that already have work orders
  const engagementsWithWorkOrders = workOrders?.map((wo) => wo.engagement_id) || [];

  // Filter to active engagements WITHOUT existing work orders
  const availableEngagements = engagements?.filter(
    (e) => e.status === "active" && !engagementsWithWorkOrders.includes(e.engagement_id)
  );
  
  const selectedEngagement = engagements?.find((e) => e.engagement_id === selectedEngagementId);

  // Check if selected engagement has a worksheet
  const { data: existingWorksheet } = useWorksheetByEngagementId(selectedEngagementId || undefined);

  // Auto-detect season based on client's industry fiscal year end
  useEffect(() => {
    if (selectedEngagement?.client?.industry) {
      const fiscalYearEnd = selectedEngagement.client.industry.fiscal_year_end;
      const isHighSeason = fiscalYearEnd?.includes("December") || fiscalYearEnd?.includes("31 de diciembre");
      setSeasonMode(isHighSeason ? "High" : "Low");
    }
  }, [selectedEngagement]);

  // Update rates when currency or season changes
  useEffect(() => {
    if (!categories) return;
    
    setBudgetLines((prev) =>
      prev.map((line) => {
        const category = categories.find((c) => c.category_id === line.category_id);
        if (!category) return line;
        const rateKey = `rate_${seasonMode.toLowerCase()}_${currency.toLowerCase()}` as keyof typeof category;
        return { ...line, standard_rate: Number(category[rateKey]) || 0 };
      })
    );
  }, [currency, seasonMode, categories]);

  if (roleLoading || !canCreate) return null;

  const handleSubmitClick = () => {
    if (!selectedEngagementId) {
      toast.error(t("workOrders.selectEngagementFirst"));
      return;
    }
    // Show confirmation dialog before creating
    setShowConfirmDialog(true);
  };

  const handleConfirmCreate = async () => {
    setShowConfirmDialog(false);
    
    try {
      // Create work order
      const wo = await createWorkOrder.mutateAsync({
        engagement_id: selectedEngagementId,
        currency,
        season_mode: seasonMode,
        tax_rate: taxRate,
        adjustment_amount: adjustmentAmount,
        approval_status: "Draft",
      });

      // Create budget lines
      for (const line of budgetLines) {
        if (line.category_id && line.budgeted_hours > 0) {
          await createBudgetLine.mutateAsync({
            wo_id: wo.wo_id,
            category_id: line.category_id,
            budgeted_hours: line.budgeted_hours,
            standard_rate: line.standard_rate,
          });
        }
      }

      // Create expense budgets
      for (const exp of expenseBudget) {
        if (exp.expense_type_id && exp.budgeted_amount > 0) {
          await createExpenseBudget.mutateAsync({
            wo_id: wo.wo_id,
            expense_type_id: exp.expense_type_id,
            budgeted_amount: exp.budgeted_amount,
          });
        }
      }

      toast.success(t("messages.createSuccess", { entity: t("entities.workOrder") }));
      allowNextNavigation();
      navigate(`/work-orders/${wo.wo_id}`);
    } catch (error) {
      // Error handled by mutations
    }
  };

  return (
    <AppLayout title={t("workOrders.newWorkOrder")} focusMode>
      <div className="space-y-6">
        {/* Engagement Selection */}
        {!selectedEngagementId && (
          <Card>
            <CardHeader>
              <CardTitle>{t("workOrders.selectEngagement")}</CardTitle>
            </CardHeader>
            <CardContent>
              {availableEngagements?.length === 0 ? (
                <Alert>
                  <AlertDescription className="flex flex-col gap-2">
                    <span>{t("workOrders.allEngagementsHaveWorkOrders")}</span>
                    <Link to="/engagements/new" className="text-primary hover:underline font-medium">
                      {t("workOrders.createEngagementFirst")}
                    </Link>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="max-w-md">
                  <Label>{t("entities.engagement")}</Label>
                  <Select value={selectedEngagementId} onValueChange={setSelectedEngagementId}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder={t("engagement.selectClient")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEngagements?.map((eng) => (
                        <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                          {eng.engagement_code} - {eng.engagement_name} ({eng.client?.client_legal_name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex justify-end mt-4">
                <Button
                  variant="cancel"
                  onClick={() => { allowNextNavigation(); navigate("/work-orders"); }}
                  className="btn-action"
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show engagement info */}
        {selectedEngagement && (
          <>
            <Card className="bg-muted/30">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("entities.engagement")}</p>
                    <p className="font-semibold">{selectedEngagement.engagement_code} - {selectedEngagement.engagement_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedEngagement.client?.client_legal_name}</p>
                  </div>
                  {selectedEngagement.client?.industry && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{t("industry.fiscalYearEnd")}</p>
                      <p className="font-medium">{selectedEngagement.client.industry.fiscal_year_end}</p>
                      <p className="text-xs text-muted-foreground">
                        {seasonMode === "High" ? t("industry.highSeason") : t("industry.lowSeason")} ({t("workOrders.autoDetected")})
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Show worksheet recommendation if one exists */}
            {existingWorksheet && !existingWorksheet.wo_id && (
              <Card className="border-primary/50 bg-primary/5">
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    {t("workMatrix.worksheetExists")}
                  </CardTitle>
                  <CardDescription>
                    {t("workMatrix.worksheetExistsDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-2">
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/worksheets/${existingWorksheet.id}`)}
                  >
                    {t("workMatrix.useWorksheet")}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Work Order Form */}
        {selectedEngagementId && (
          <WorkOrderForm
            currency={currency}
            seasonMode={seasonMode}
            approvalStatus="Draft"
            adjustmentAmount={adjustmentAmount}
            taxRate={taxRate}
            budgetLines={budgetLines}
            expenseBudget={expenseBudget}
            isNew={true}
            isDirty={false}
            onCurrencyChange={setCurrency}
            onSeasonChange={setSeasonMode}
            onAdjustmentChange={setAdjustmentAmount}
            onBudgetLinesChange={setBudgetLines}
            onExpenseBudgetChange={setExpenseBudget}
            onSubmit={handleSubmitClick}
            onCancel={() => { allowNextNavigation(); navigate("/work-orders"); }}
            isLocked={false}
            canApprove={false}
            isSubmitting={createWorkOrder.isPending}
          />
        )}
      </div>

      {/* Confirmation Dialog for Currency/Season */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workOrders.confirmParametersTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workOrders.confirmParametersDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("workOrders.selectedCurrency")}:</span>
              <span className="font-medium">{currency}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("workOrders.selectedSeason")}:</span>
              <span className="font-medium">
                {seasonMode === "High" ? t("industry.high") : t("industry.low")}
              </span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCreate}>
              {t("workOrders.confirmAndCreate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <LeavePageDialog blocker={blocker} isDirty={woIsDirty} />
    </AppLayout>
  );
};

export default WorkOrderNew;

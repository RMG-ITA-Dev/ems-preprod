import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkOrderForm, BudgetLineInput, ExpenseBudgetInput } from "@/components/forms/WorkOrderForm";
import { useEngagements, useSetting, useCategories } from "@/hooks/useEmsData";
import { useCreateWorkOrder, useCreateBudgetLine, useCreateExpenseBudget } from "@/hooks/useEmsMutations";
import { toast } from "@/hooks/use-toast";

const WorkOrderNew = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const engagementIdParam = searchParams.get("engagement");

  const { data: engagements } = useEngagements();
  const { data: categories } = useCategories();
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

  const taxRate = parseFloat(globalTaxRate || "0.13");

  // Get available engagements without work orders
  const availableEngagements = engagements?.filter((e) => e.status === "active");
  
  const selectedEngagement = engagements?.find((e) => e.engagement_id === selectedEngagementId);

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

  const handleSubmit = async () => {
    if (!selectedEngagementId) {
      toast({ title: t("workOrders.selectEngagementFirst"), variant: "destructive" });
      return;
    }

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

      toast({ title: t("messages.createSuccess", { entity: t("entities.workOrder") }) });
      navigate(`/work-orders/${wo.wo_id}`);
    } catch (error) {
      // Error handled by mutations
    }
  };

  return (
    <AppLayout title={t("workOrders.newWorkOrder")}>
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/work-orders")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("workOrders.backToList")}
        </Button>

        {/* Engagement Selection */}
        {!selectedEngagementId && (
          <Card>
            <CardHeader>
              <CardTitle>{t("workOrders.selectEngagement")}</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        )}

        {/* Show engagement info */}
        {selectedEngagement && (
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
            onCurrencyChange={setCurrency}
            onSeasonChange={setSeasonMode}
            onAdjustmentChange={setAdjustmentAmount}
            onBudgetLinesChange={setBudgetLines}
            onExpenseBudgetChange={setExpenseBudget}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/work-orders")}
            isLocked={false}
            canApprove={false}
            isSubmitting={createWorkOrder.isPending}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default WorkOrderNew;
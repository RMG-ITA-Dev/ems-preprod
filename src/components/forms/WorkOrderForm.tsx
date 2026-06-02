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
import { Trash2, Plus, Lock, CheckCircle, XCircle, Send, ShieldCheck, Undo2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCategories, useExpenseTypes, useSetting, Category, ExpenseType, type WorkOrder, type WOBudgetLine } from "@/hooks/useEmsData";
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
  adjustmentAmount: number;
  taxRate: number;
  budgetLines: BudgetLineInput[];
  expenseBudget: ExpenseBudgetInput[];
  // Risk assessment fields
  ceacCompletedAt?: string | null;
  ceacNotes?: string | null;
  sanCompletedAt?: string | null;
  sanNotes?: string | null;
  // New props for create/edit mode and dirty state
  isNew?: boolean;
  isDirty?: boolean;
  onCurrencyChange: (currency: "USD" | "BOB") => void;
  onSeasonChange: (season: "High" | "Low") => void;
  onAdjustmentChange: (amount: number) => void;
  onBudgetLinesChange: (lines: BudgetLineInput[]) => void;
  onExpenseBudgetChange: (expenses: ExpenseBudgetInput[]) => void;
  onRiskAssessmentChange?: (field: string, value: string | null) => void;
  onSubmit: () => void;
  onApprove?: () => void;
  onEmergencyApprove?: () => void;
  onReject?: () => void;
  onSubmitForApproval?: () => void;
  onUnsubmit?: () => void;
  onCancel?: () => void;
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
  adjustmentAmount,
  taxRate,
  budgetLines,
  expenseBudget,
  ceacCompletedAt,
  ceacNotes,
  sanCompletedAt,
  sanNotes,
  isNew = false,
  isDirty = false,
  onCurrencyChange,
  onSeasonChange,
  onAdjustmentChange,
  onBudgetLinesChange,
  onExpenseBudgetChange,
  onRiskAssessmentChange,
  onSubmit,
  onApprove,
  onEmergencyApprove,
  onReject,
  onSubmitForApproval,
  onUnsubmit,
  onCancel,
  isLocked,
  canApprove,
  isSubmitting,
}: WorkOrderFormProps) {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguage();
  const { data: categories } = useCategories();
  const { data: expenseTypes } = useExpenseTypes();
  const realizationLimitSetting = useSetting("REALIZATION_LIMIT");
  const realizationLimitValue = parseFloat(realizationLimitSetting || "75");

  // Get the appropriate rate based on currency and season
  const getRate = (category: Category) => {
    const key = `rate_${seasonMode.toLowerCase()}_${currency.toLowerCase()}` as keyof Category;
    return Number(category[key]) || 0;
  };

  // Calculations
  const totalStandardFee = useMemo(() => {
    return budgetLines.reduce((sum, line) => sum + line.budgeted_hours * line.standard_rate, 0);
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
  const updateExpenseBudget = (id: string, field: keyof ExpenseBudgetInput, value: string | number) => {
    onExpenseBudgetChange(
      expenseBudget.map((exp) => (exp.id === id ? { ...exp, [field]: value } : exp))
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
  const isEditable = !isLocked && isDraft;

  const isEmergency = !ceacCompletedAt && !!sanCompletedAt;
  const canEmergencyApprove = isEmergency && !!ceacNotes?.trim();
  const riskApprovalReady = (!!ceacCompletedAt && !!sanCompletedAt) || canEmergencyApprove;

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
              <Badge variant="outline" className={cn("text-xs px-2.5 py-1", statusColors[approvalStatus])}>
                {isLocked && <Lock className="h-3 w-3 mr-1" />}
                {t(statusLabels[approvalStatus])}
              </Badge>
              {/* Dirty indicator - same size as status badge, purple to match Guardar button */}
              {isDirty && (
                <Badge variant="outline" className="text-xs px-2.5 py-1 bg-brand-purple/10 text-brand-purple border-brand-purple/20">
                  {t("common.unsavedChanges")}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Currency - styled chip, editable only on new */}
              {isNew ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">{t("workOrders.currency")}:</Label>
                  <Select value={currency} onValueChange={(v) => onCurrencyChange(v as "USD" | "BOB")}>
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
                  <span className="text-xs text-muted-foreground">{t("workOrders.currency")}:</span>
                  <span className="text-sm font-semibold">{currency}</span>
                </div>
              )}
              {/* Season - styled chip, editable only on new */}
              {isNew ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">{t("workOrders.season")}:</Label>
                  <Select value={seasonMode} onValueChange={(v) => onSeasonChange(v as "High" | "Low")}>
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
                  <span className="text-xs text-muted-foreground">{t("workOrders.season")}:</span>
                  <span className="text-sm font-semibold">
                    {seasonMode === "High" ? t("industry.high") : t("industry.low")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Zone B: Budget Grid - Read-only, managed via Work Matrix */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">{t("workOrders.budgetLines")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-dense">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground" colSpan={4}>
                    {t("workOrders.standard")}
                  </th>
                  <th className="py-1.5 px-2 border-l border-border"></th>
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground border-l border-border" colSpan={2}>
                    {t("workOrders.adjusted")}
                  </th>
                </tr>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border">{t("entities.category")}</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-24">{t("workOrders.hours")}</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-28">{t("workOrders.rate")} ({currency})</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-32">{t("workOrders.total")} ({currency})</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-20">%</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-28">{t("workOrders.adjRate")} ({currency})</th>
                  <th className="text-center py-1.5 px-2 font-medium w-32">{t("workOrders.adjTotal")} ({currency})</th>
                </tr>
              </thead>
              <tbody>
                {budgetLines.map((line) => {
                  const lineTotal = line.budgeted_hours * line.standard_rate;
                  const adjustedRate = line.standard_rate * (realizationPercent / 100);
                  const adjustedTotal = line.budgeted_hours * adjustedRate;
                  const hoursPercent = totalBudgetedHours > 0 ? (line.budgeted_hours / totalBudgetedHours * 100) : 0;
                  
                  return (
                    <tr key={line.id} className="border-b border-border hover:bg-muted/20">
                      {/* Category - always read-only text */}
                      <td className="py-1.5 px-2 text-left border-r border-border">
                        {getCategoryName(line.category_id)}
                      </td>
                      {/* Hours - always read-only */}
                      <td className="py-1.5 px-2 text-right font-mono border-r border-border">
                        {line.budgeted_hours.toLocaleString(currency === "BOB" ? "es-BO" : "en-US", { 
                          minimumFractionDigits: 1, 
                          maximumFractionDigits: 1 
                        })}
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
            <CardTitle className="text-base">{t("workOrders.expenses")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 form-dense">
            <div className="space-y-2">
              {expenseBudget.map((exp) => (
                <div key={exp.id} className="flex items-center gap-2">
                  <Select
                    value={exp.expense_type_id}
                    onValueChange={(v) => updateExpenseBudget(exp.id, "expense_type_id", v)}
                    disabled={!isEditable}
                  >
                    <SelectTrigger className="flex-1 h-8">
                      <SelectValue placeholder={t("workOrders.selectExpense")} />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseTypes?.map((type) => (
                        <SelectItem key={type.expense_type_id} value={type.expense_type_id}>
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
                    onChange={(val) => updateExpenseBudget(exp.id, "budgeted_amount", val)}
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
                  <span className="text-sm text-muted-foreground mr-2">{currency}</span>
                  {formatNumber(totalExpenses)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Section - With currency codes */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">{t("workOrders.summary")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 form-dense">
            <div className="space-y-2">
              {/* Standard Fee - full label on desktop, abbreviated on mobile */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  <span className="hidden sm:inline">{t("workOrders.standardFeeFull")}</span>
                  <span className="sm:hidden">{t("workOrders.standardFee")}</span>
                </span>
                <span className="font-mono">
                  <span className="text-muted-foreground mr-2">{currency}</span>
                  {formatNumber(totalStandardFee)}
                </span>
              </div>
              {/* Adjustment - styled to match other rows, negative in red */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("workOrders.adjustment")}</span>
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
                      adjustmentAmount < 0 && "text-destructive"
                    )}
                    disabled={!isEditable}
                  />
                </div>
              </div>
              {/* Realization - full label on desktop, abbreviated on mobile, color coded */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  <span className="hidden sm:inline">{t("workOrders.realizationFull")}</span>
                  <span className="sm:hidden">{t("workOrders.realization")}</span>
                </span>
              <span className={cn(
                  "font-mono font-medium",
                  realizationPercent >= realizationLimitValue ? "text-success" : "text-destructive"
                )}>
                  {realizationPercent.toLocaleString(currency === "BOB" ? "es-BO" : "en-US", { 
                    minimumFractionDigits: 1, 
                    maximumFractionDigits: 1 
                  })}%
                </span>
              </div>
              {/* Adjusted Fee - full label on desktop, abbreviated on mobile */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  <span className="hidden sm:inline">{t("workOrders.adjustedFeeFull")}</span>
                  <span className="sm:hidden">{t("workOrders.adjustedFee")}</span>
                </span>
                <span className="font-mono">
                  <span className="text-muted-foreground mr-2">{currency}</span>
                  {formatNumber(totalAdjustedFee)}
                </span>
              </div>
              {/* Expenses */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("workOrders.expenses")}</span>
                <span className="font-mono">
                  <span className="text-muted-foreground mr-2">{currency}</span>
                  {formatNumber(totalExpenses)}
                </span>
              </div>
              {/* IVA */}
              <div className="border-t border-border pt-2">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>{t("workOrders.iva")} ({(taxRate * 100).toFixed(0)}%)</span>
                  <span className="font-mono">
                    <span className="text-sm mr-2">{currency}</span>
                    {formatNumber(feeWithTax - totalAdjustedFee - totalExpenses)}
                  </span>
                </div>
              </div>
              {/* Fee with Tax */}
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-semibold">{t("workOrders.feeWithTax")}</span>
                <span className="font-mono font-bold text-accent">
                  <span className="text-sm font-normal text-muted-foreground mr-2">{currency}</span>
                  {formatNumber(feeWithTax)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Assessment Section - Editable for approver in Pending; read-only in Approved if data exists */}
      {((isPending && canApprove && onRiskAssessmentChange) ||
        (isApproved && (ceacCompletedAt || sanCompletedAt))) && (
        <Card className="border-info/30 bg-info/5">
          {isApproved && !ceacCompletedAt && (
            <div className="flex items-center gap-2 px-4 pt-3 pb-0">
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {t("workOrders.approvedEmergency")}
              </Badge>
            </div>
          )}
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-info" />
              {t("workOrders.riskAssessment")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("workOrders.riskAssessmentDescription")}</p>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("workOrders.ceacDate")}</Label>
                <Input
                  type="date"
                  value={ceacCompletedAt ? ceacCompletedAt.split('T')[0] : ''}
                  onChange={(e) => onRiskAssessmentChange?.('ceacCompletedAt', e.target.value || null)}
                  readOnly={isApproved}
                />
                {isEmergency && !isApproved && (
                  <p className="text-xs text-warning">{t("workOrders.ceacEmergencyHint")}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("workOrders.sanDate")}</Label>
                <Input
                  type="date"
                  value={sanCompletedAt ? sanCompletedAt.split('T')[0] : ''}
                  onChange={(e) => onRiskAssessmentChange?.('sanCompletedAt', e.target.value || null)}
                  readOnly={isApproved}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("workOrders.ceacNotes")}</Label>
                <Textarea
                  value={ceacNotes || ''}
                  onChange={(e) => onRiskAssessmentChange?.('ceacNotes', e.target.value || null)}
                  readOnly={isApproved}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("workOrders.sanNotes")}</Label>
                <Textarea
                  value={sanNotes || ''}
                  onChange={(e) => onRiskAssessmentChange?.('sanNotes', e.target.value || null)}
                  readOnly={isApproved}
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button variant="cancel" onClick={onCancel} disabled={isSubmitting} className="btn-action">
            {t("common.cancel")}
          </Button>
        )}
        {isDraft && (
          <>
            <LoadingButton onClick={onSubmit} loading={isSubmitting} className="btn-action">
              {t("common.save")}
            </LoadingButton>
            {onSubmitForApproval && (
              <LoadingButton 
                onClick={onSubmitForApproval} 
                className="bg-info hover:bg-info/90 btn-action" 
                loading={isSubmitting}
                disabled={isDirty}
                title={isDirty ? t("workOrders.saveBeforeSubmit") : undefined}
              >
                <Send className="h-4 w-4 mr-2" />
                {t("workOrders.submitForApproval")}
              </LoadingButton>
            )}
          </>
        )}
        {/* Unsubmit button for Pending status - shown to any user */}
        {isPending && onUnsubmit && (
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
        {isPending && canApprove && (
          <>
            {onReject && (
              <LoadingButton variant="outline" onClick={onReject} className="text-destructive border-destructive btn-action" loading={isSubmitting}>
                <XCircle className="h-4 w-4 mr-2" />
                {t("workOrders.reject")}
              </LoadingButton>
            )}
            {!isEmergency && (
              <LoadingButton
                onClick={onApprove}
                className="bg-success hover:bg-success/90 btn-action"
                loading={isSubmitting}
                disabled={!riskApprovalReady || isSubmitting}
                title={!riskApprovalReady ? t("workOrders.riskApprovalPending") : undefined}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {t("workOrders.approve")}
              </LoadingButton>
            )}
            {isEmergency && (
              <LoadingButton
                onClick={onEmergencyApprove}
                className="bg-warning hover:bg-warning/90 text-warning-foreground btn-action"
                loading={isSubmitting}
                disabled={!canEmergencyApprove || isSubmitting}
                title={!canEmergencyApprove ? t("workOrders.ceacEmergencyHint") : undefined}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                {t("workOrders.approveEmergency")}
              </LoadingButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

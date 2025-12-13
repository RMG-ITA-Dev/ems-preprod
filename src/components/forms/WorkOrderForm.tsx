import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Lock, CheckCircle, XCircle, Send } from "lucide-react";
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
  onCurrencyChange: (currency: "USD" | "BOB") => void;
  onSeasonChange: (season: "High" | "Low") => void;
  onAdjustmentChange: (amount: number) => void;
  onBudgetLinesChange: (lines: BudgetLineInput[]) => void;
  onExpenseBudgetChange: (expenses: ExpenseBudgetInput[]) => void;
  onSubmit: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onSubmitForApproval?: () => void;
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
  onCurrencyChange,
  onSeasonChange,
  onAdjustmentChange,
  onBudgetLinesChange,
  onExpenseBudgetChange,
  onSubmit,
  onApprove,
  onReject,
  onSubmitForApproval,
  onCancel,
  isLocked,
  canApprove,
  isSubmitting,
}: WorkOrderFormProps) {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguage();
  const { data: categories } = useCategories();
  const { data: expenseTypes } = useExpenseTypes();

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

  // Add budget line
  const addBudgetLine = () => {
    if (!categories?.length) return;
    const newLine: BudgetLineInput = {
      id: crypto.randomUUID(),
      category_id: "",
      budgeted_hours: 0,
      standard_rate: 0,
    };
    onBudgetLinesChange([...budgetLines, newLine]);
  };

  // Update budget line
  const updateBudgetLine = (id: string, field: keyof BudgetLineInput, value: string | number) => {
    onBudgetLinesChange(
      budgetLines.map((line) => {
        if (line.id !== id) return line;
        
        if (field === "category_id") {
          const category = categories?.find((c) => c.category_id === value);
          return {
            ...line,
            category_id: value as string,
            standard_rate: category ? getRate(category) : 0,
          };
        }
        return { ...line, [field]: value };
      })
    );
  };

  // Remove budget line
  const removeBudgetLine = (id: string) => {
    onBudgetLinesChange(budgetLines.filter((line) => line.id !== id));
  };

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

  // Format with currency code (for totals only) - no decimals
  const formatCurrencyTotal = (amount: number) => {
    return formatNumber(amount);
  };

  // Legacy format for expenses and summary sections
  const formatCurrency = (amount: number) => {
    return formatNumber(amount);
  };

  const isDraft = approvalStatus === "Draft";
  const isPending = approvalStatus === "Pending_Approval";
  const isEditable = !isLocked && isDraft;

  return (
    <div className="space-y-4">
      {/* Zone A: Header */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant="outline" className={cn("text-sm px-3 py-1", statusColors[approvalStatus])}>
                {isLocked && <Lock className="h-3 w-3 mr-1" />}
                {t(statusLabels[approvalStatus])}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              {/* Currency */}
              <div className="flex items-center gap-2">
                <Label className="text-sm">{t("workOrders.currency")}</Label>
                <Select value={currency} onValueChange={(v) => onCurrencyChange(v as "USD" | "BOB")} disabled={isLocked}>
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOB">BOB</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Season Toggle */}
              <div className="flex items-center gap-2">
                <Label className="text-sm">{t("workOrders.season")}</Label>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm", seasonMode === "Low" ? "text-foreground" : "text-muted-foreground")}>
                    {t("industry.low")}
                  </span>
                  <Switch
                    checked={seasonMode === "High"}
                    onCheckedChange={(checked) => onSeasonChange(checked ? "High" : "Low")}
                    disabled={isLocked}
                  />
                  <span className={cn("text-sm", seasonMode === "High" ? "text-accent font-medium" : "text-muted-foreground")}>
                    {t("industry.high")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Zone B: Budget Grid */}
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
                  <th className="w-10"></th>
                </tr>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border">{t("entities.category")}</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-24">{t("workOrders.hours")}</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-28">{t("workOrders.rate")} ({currency})</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-32">{t("workOrders.total")} ({currency})</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-20">%</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-28">{t("workOrders.adjRate")} ({currency})</th>
                  <th className="text-center py-1.5 px-2 font-medium border-r border-border w-32">{t("workOrders.adjTotal")} ({currency})</th>
                  <th className="w-10"></th>
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
                      <td className="py-1.5 px-2 text-left border-r border-border">
                        <Select
                          value={line.category_id}
                          onValueChange={(v) => updateBudgetLine(line.id, "category_id", v)}
                          disabled={!isEditable}
                        >
                          <SelectTrigger className="w-full h-8">
                            <SelectValue placeholder={t("form.selectCategory")} />
                          </SelectTrigger>
                          <SelectContent>
                            {categories?.map((cat) => (
                              <SelectItem key={cat.category_id} value={cat.category_id}>
                                {cat.category_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 px-2 border-r border-border">
                        <NumericInput
                          decimals={1}
                          locale={currentLanguage as "es" | "en"}
                          min={0}
                          value={line.budgeted_hours || ""}
                          onChange={(val) => updateBudgetLine(line.id, "budgeted_hours", val)}
                          className="text-right h-8"
                          disabled={!isEditable}
                        />
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
                      <td className="py-1.5 px-2 text-right font-mono font-medium border-r border-border">
                        {formatNumber(adjustedTotal)}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {isEditable && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeBudgetLine(line.id)}
                            className="h-7 w-7 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
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
                  <td className="py-2 px-2 text-right font-mono border-r border-border">
                    {formatNumber(totalAdjustedFee)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {isEditable && (
            <Button variant="outline" onClick={addBudgetLine} className="mt-3" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t("workOrders.addLine")}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Zone C: Footer - Expenses, Adjustment, Tax */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expenses Section */}
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
                <Button variant="outline" onClick={addExpenseBudget} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("workOrders.addExpense")}
                </Button>
              )}
              <div className="flex justify-between pt-2 border-t border-border font-medium">
                <span>{t("workOrders.totalExpenses")}</span>
                <span className="font-mono">{formatCurrency(totalExpenses)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Section */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">{t("workOrders.summary")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 form-dense">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("workOrders.standardFee")}</span>
                <span className="font-mono">{formatCurrency(totalStandardFee)}</span>
              </div>
              <div className="flex justify-between items-center">
                <Label className="text-sm">{t("workOrders.adjustment")}</Label>
                <NumericInput
                  decimals={2}
                  locale={currentLanguage as "es" | "en"}
                  value={adjustmentAmount || ""}
                  onChange={(val) => onAdjustmentChange(val)}
                  className="w-36 text-right h-8"
                  disabled={!isEditable}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("workOrders.realization")}</span>
                <span className={cn("font-mono font-medium", realizationPercent < 100 ? "text-warning" : "text-foreground")}>
                  {realizationPercent.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("workOrders.adjustedFee")}</span>
                <span className="font-mono">{formatCurrency(totalAdjustedFee)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("workOrders.expenses")}</span>
                <span className="font-mono">{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="border-t border-border pt-2">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>{t("workOrders.iva")} ({(taxRate * 100).toFixed(0)}%)</span>
                  <span className="font-mono">{formatCurrency(feeWithTax - totalAdjustedFee - totalExpenses)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-semibold">{t("workOrders.feeWithTax")}</span>
                <span className="font-mono font-bold text-accent">{formatCurrency(feeWithTax)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="btn-action">
            {t("common.cancel")}
          </Button>
        )}
        {isDraft && (
          <>
            <Button onClick={onSubmit} disabled={isSubmitting} className="btn-action">
              {t("common.save")}
            </Button>
            {onSubmitForApproval && (
              <Button onClick={onSubmitForApproval} className="bg-info hover:bg-info/90 btn-action" disabled={isSubmitting}>
                <Send className="h-4 w-4 mr-2" />
                {t("workOrders.submitForApproval")}
              </Button>
            )}
          </>
        )}
        {isPending && canApprove && (
          <>
            {onReject && (
              <Button variant="outline" onClick={onReject} className="text-destructive border-destructive btn-action" disabled={isSubmitting}>
                <XCircle className="h-4 w-4 mr-2" />
                {t("workOrders.reject")}
              </Button>
            )}
            {onApprove && (
              <Button onClick={onApprove} className="bg-success hover:bg-success/90 btn-action" disabled={isSubmitting}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {t("workOrders.approve")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

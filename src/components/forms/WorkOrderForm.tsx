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
import { Trash2, Plus, Lock, CheckCircle, XCircle, Send, ShieldCheck, Undo2 } from "lucide-react";
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

  // ============================================
  // FIX: Local state for adjustment input to handle 
  // intermediate states like "-" when typing negative numbers
  // ============================================
  const [adjustmentInputValue, setAdjustmentInputValue] = useState<string>("");

  // Sync local input value with prop when prop changes externally
  useEffect(() => {
    // Format the adjustment amount for display
    const formattedValue = adjustmentAmount === 0 ? "" : formatAdjustmentForInput(adjustmentAmount);
    // Only update if different to avoid cursor position issues
    const currentParsedValue = parseAdjustmentValue(adjustmentInputValue);
    if (currentParsedValue !== adjustmentAmount) {
      setAdjustmentInputValue(formattedValue);
    }
  }, [adjustmentAmount]);

  // Format number for display in input (respecting locale)
  const formatAdjustmentForInput = (value: number): string => {
    if (value === 0) return "";
    const locale = currentLanguage === "es" ? "es-BO" : "en-US";
    return Math.round(value).toLocaleString(locale, { maximumFractionDigits: 0 });
  };

  // Parse the input value to a number
  const parseAdjustmentValue = (value: string): number => {
    if (value === "" || value === "-") return 0;
    // Remove thousand separators (both . and , depending on locale)
    // Spanish uses . for thousands, English uses ,
    const cleanValue = value.replace(/[.\s]/g, "").replace(",", ".");
    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? 0 : Math.round(parsed);
  };

  // Handle adjustment input change
  const handleAdjustmentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Allow empty string, minus sign alone, or valid number patterns
    // This regex allows: digits, minus sign, dots (thousand sep), commas, spaces
    const isValidPattern = /^-?[\d.,\s]*$/.test(inputValue);
    
    if (!isValidPattern) return;
    
    setAdjustmentInputValue(inputValue);
    
    // Only update parent if we have a valid number (not just "-")
    if (inputValue !== "-" && inputValue !== "") {
      const numericValue = parseAdjustmentValue(inputValue);
      onAdjustmentChange(numericValue);
    } else if (inputValue === "") {
      onAdjustmentChange(0);
    }
    // If it's just "-", don't update parent yet - wait for the number
  };

  // Handle blur to format the value properly
  const handleAdjustmentBlur = () => {
    const numericValue = parseAdjustmentValue(adjustmentInputValue);
    onAdjustmentChange(numericValue);
    setAdjustmentInputValue(numericValue === 0 ? "" : formatAdjustmentForInput(numericValue));
  };
  // ============================================
  // END OF FIX
  // ============================================

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
  const isEditable = !isLocked && isDraft;

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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Badge className={cn("text-xs", statusColors[approvalStatus])}>
                {t(statusLabels[approvalStatus])}
              </Badge>
              {isLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-4">
              {/* Currency selector */}
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">{t("workOrders.currency")}</Label>
                <Select
                  value={currency}
                  onValueChange={(val) => onCurrencyChange(val as "USD" | "BOB")}
                  disabled={!isNew}
                >
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOB">BOB</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Season selector */}
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">{t("workOrders.season")}</Label>
                <Select
                  value={seasonMode}
                  onValueChange={(val) => onSeasonChange(val as "High" | "Low")}
                  disabled={!isNew}
                >
                  <SelectTrigger className="w-24 h-8">
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
        </CardHeader>
      </Card>

      {/* Zone B: Budget Lines Table - Read Only for Edit mode */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("workOrders.budgetLines")}</CardTitle>
            {isNew && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!categories?.length) return;
                  const unusedCategories = categories.filter(
                    (c) => !budgetLines.some((bl) => bl.category_id === c.category_id)
                  );
                  if (unusedCategories.length === 0) return;
                  const firstUnused = unusedCategories[0];
                  const newLine: BudgetLineInput = {
                    id: crypto.randomUUID(),
                    category_id: firstUnused.category_id,
                    budgeted_hours: 0,
                    standard_rate: getRate(firstUnused),
                  };
                  onBudgetLinesChange([...budgetLines, newLine]);
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                {t("workOrders.addLine")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">{t("workOrders.category")}</th>
                  <th className="text-right py-2 font-medium w-24">{t("workOrders.hours")}</th>
                  <th className="text-right py-2 font-medium w-28">{t("workOrders.rate")}</th>
                  <th className="text-right py-2 font-medium w-32">{t("workOrders.total")}</th>
                  {isNew && <th className="w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {budgetLines.map((line) => {
                  const lineTotal = line.budgeted_hours * line.standard_rate;
                  return (
                    <tr key={line.id} className="border-b border-border/50">
                      <td className="py-2">
                        {isNew ? (
                          <Select
                            value={line.category_id}
                            onValueChange={(val) => {
                              const category = categories?.find((c) => c.category_id === val);
                              onBudgetLinesChange(
                                budgetLines.map((bl) =>
                                  bl.id === line.id
                                    ? { ...bl, category_id: val, standard_rate: category ? getRate(category) : 0 }
                                    : bl
                                )
                              );
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {categories?.map((cat) => (
                                <SelectItem key={cat.category_id} value={cat.category_id}>
                                  {cat.category_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span>{getCategoryName(line.category_id)}</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {isNew ? (
                          <NumericInput
                            decimals={1}
                            locale={currentLanguage as "es" | "en"}
                            value={line.budgeted_hours || ""}
                            onChange={(val) =>
                              onBudgetLinesChange(
                                budgetLines.map((bl) =>
                                  bl.id === line.id ? { ...bl, budgeted_hours: val } : bl
                                )
                              )
                            }
                            className="w-20 text-right h-8 font-mono"
                          />
                        ) : (
                          <span className="font-mono">{line.budgeted_hours.toFixed(1)}</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono">{formatNumber(line.standard_rate)}</td>
                      <td className="py-2 text-right font-mono">{formatNumber(lineTotal)}</td>
                      {isNew && (
                        <td className="py-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              onBudgetLinesChange(budgetLines.filter((bl) => bl.id !== line.id))
                            }
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {/* Subtotal row */}
                <tr className="bg-muted/30 font-medium">
                  <td className="py-2">{t("workOrders.subtotal")}</td>
                  <td className="py-2 text-right font-mono">{totalBudgetedHours.toFixed(1)}</td>
                  <td className="py-2 text-right font-mono">{formatNumber(avgStandardRate)}</td>
                  <td className="py-2 text-right font-mono">{formatNumber(totalStandardFee)}</td>
                  {isNew && <td></td>}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Zone C: Expense Budget and Summary side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expense Budget */}
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("workOrders.expenseBudget")}</CardTitle>
              {isEditable && (
                <Button variant="outline" size="sm" onClick={addExpenseBudget} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("workOrders.addExpense")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0 form-dense">
            <div className="space-y-2">
              {expenseBudget.map((exp) => (
                <div key={exp.id} className="flex items-center gap-2">
                  <Select
                    value={exp.expense_type_id}
                    onValueChange={(val) => updateExpenseBudget(exp.id, "expense_type_id", val)}
                    disabled={!isEditable}
                  >
                    <SelectTrigger className="flex-1 h-8">
                      <SelectValue placeholder={t("workOrders.selectExpenseType")} />
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
                    decimals={0}
                    locale={currentLanguage as "es" | "en"}
                    value={exp.budgeted_amount || ""}
                    onChange={(val) => updateExpenseBudget(exp.id, "budgeted_amount", val)}
                    className="w-24 text-right h-8 font-mono"
                    disabled={!isEditable}
                  />
                  {isEditable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeExpenseBudget(exp.id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {expenseBudget.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">{t("workOrders.noExpenses")}</p>
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
              {/* Standard Fee */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("workOrders.standardFee")}</span>
                <span className="font-mono">
                  <span className="text-sm text-muted-foreground mr-2">{currency}</span>
                  {formatNumber(totalStandardFee)}
                </span>
              </div>
              {/* Adjustment - FIXED: Now uses text input with proper negative number handling */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("workOrders.adjustment")}</span>
                <div className="flex items-center">
                  <span className="text-sm text-muted-foreground mr-2">{currency}</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={adjustmentInputValue}
                    onChange={handleAdjustmentInputChange}
                    onBlur={handleAdjustmentBlur}
                    className={cn(
                      "w-24 text-right h-8 font-mono",
                      adjustmentAmount < 0 && "text-destructive"
                    )}
                    disabled={!isEditable}
                    placeholder="0"
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
                  realizationPercent >= 75 ? "text-success" : "text-destructive"
                )}>
                  {realizationPercent.toLocaleString(currency === "BOB" ? "es-BO" : "en-US", { 
                    minimumFractionDigits: 1, 
                    maximumFractionDigits: 1 
                  })}%
                </span>
              </div>
              {/* Adjusted Fee */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("workOrders.adjustedFee")}</span>
                <span className="font-mono">
                  <span className="text-sm text-muted-foreground mr-2">{currency}</span>
                  {formatNumber(totalAdjustedFee)}
                </span>
              </div>
              {/* Expenses */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("workOrders.expenses")}</span>
                <span className="font-mono">
                  <span className="text-sm text-muted-foreground mr-2">{currency}</span>
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

      {/* Risk Assessment Section - Visible for approval */}
      {isPending && canApprove && onRiskAssessmentChange && (
        <Card className="border-info/30 bg-info/5">
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
                  onChange={(e) => onRiskAssessmentChange('ceacCompletedAt', e.target.value || null)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("workOrders.sanDate")}</Label>
                <Input
                  type="date"
                  value={sanCompletedAt ? sanCompletedAt.split('T')[0] : ''}
                  onChange={(e) => onRiskAssessmentChange('sanCompletedAt', e.target.value || null)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("workOrders.ceacNotes")}</Label>
                <Textarea
                  value={ceacNotes || ''}
                  onChange={(e) => onRiskAssessmentChange('ceacNotes', e.target.value || null)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("workOrders.sanNotes")}</Label>
                <Textarea
                  value={sanNotes || ''}
                  onChange={(e) => onRiskAssessmentChange('sanNotes', e.target.value || null)}
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
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="btn-action">
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
            {onApprove && (
              <LoadingButton onClick={onApprove} className="bg-success hover:bg-success/90 btn-action" loading={isSubmitting}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {t("workOrders.approve")}
              </LoadingButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

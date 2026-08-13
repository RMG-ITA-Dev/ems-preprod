import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Plus, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NumericInput } from "@/components/ui/numeric-input";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useUpdateInstallmentStatus, useUpdateCollectionDate } from "@/hooks/mutations";
import {
  distributePercentages,
  computeAmount,
  computePaymentDate,
  isAlertDue,
} from "@/lib/workOrderPaymentPlan";
import type {
  PaymentPlanInput,
  PaymentInstallmentInput,
  PaymentInstallmentStatus,
} from "@/types/workOrderPaymentPlan";

interface WorkOrderPaymentPlanSectionProps {
  woId: string;
  currency: "BOB" | "USD" | "USDT";
  feeWithTax: number;
  plan: PaymentPlanInput | null;
  installments: PaymentInstallmentInput[];
  isEditable: boolean;
  isStatusEditable: boolean;
  isAdminDateEditable: boolean;
  isPaymentPlanDirty?: boolean;
  onPlanChange: (plan: PaymentPlanInput) => void;
  onInstallmentsChange: (rows: PaymentInstallmentInput[]) => void;
}

const STATUS_COLORS: Record<PaymentInstallmentStatus, string> = {
  Pending:   "text-muted-foreground",
  Invoiced:  "text-info",
  Completed: "text-success",
  Overdue:   "text-destructive",
};

const STATUS_CHIP_CLASSES: Record<PaymentInstallmentStatus, string> = {
  Pending:   "bg-muted/60 text-muted-foreground",
  Invoiced:  "bg-info/15 text-info",
  Completed: "bg-success/15 text-success",
  Overdue:   "bg-destructive/15 text-destructive",
};

// Options available per effective status (state machine)
const STATUS_TRANSITIONS: Record<PaymentInstallmentStatus, PaymentInstallmentStatus[]> = {
  Pending:   ["Invoiced"],
  Overdue:   ["Invoiced"],
  Invoiced:  ["Completed", "Overdue"],
  Completed: [],
};

const fmtDate = (d: string | null): string => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export function WorkOrderPaymentPlanSection({
  woId,
  currency,
  feeWithTax,
  plan,
  installments,
  isEditable,
  isStatusEditable,
  isAdminDateEditable,
  isPaymentPlanDirty = false,
  onPlanChange,
  onInstallmentsChange,
}: WorkOrderPaymentPlanSectionProps) {
  const { t, i18n } = useTranslation();
  const numericLocale = i18n.language?.startsWith("es") ? "es" : "en";
  const updateStatus = useUpdateInstallmentStatus();
  const updateCollectionDate = useUpdateCollectionDate();
  const [pendingChange, setPendingChange] = useState<{
    idx: number;
    newStatus: "Invoiced" | "Completed" | "Overdue";
  } | null>(null);
  const [pendingCollectionDate, setPendingCollectionDate] = useState<{
    installmentId: string;
    newDate: string;
  } | null>(null);

  const currentPlan = plan ?? { wo_id: woId, exchange_rate: null, payment_days: 30 };
  const numInstallments = installments.length;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());

  const getEffectiveStatus = (inst: PaymentInstallmentInput): PaymentInstallmentStatus => {
    if (inst.status === "Pending" && inst.agreed_invoice_date && inst.agreed_invoice_date < today) return "Overdue";
    return inst.status as PaymentInstallmentStatus;
  };

  const hasAlert = installments.some((inst) => isAlertDue(inst));

  const percentageSum = installments.reduce((s, i) => s + i.percentage, 0);
  const percentageSumDisplay = parseFloat(percentageSum.toFixed(2));
  const percentageValid = Math.abs(percentageSum - 100) <= 0.01;

  const totalAmount = installments.reduce((s, i) => {
    return s + computeAmount(i.percentage, feeWithTax);
  }, 0);

  // ----- Plan header handlers -----

  const handlePaymentDaysChange = (val: number) => {
    const updated = { ...currentPlan, payment_days: val };
    onPlanChange(updated);
    // Recalculate agreed_payment_date for any row that has agreed_invoice_date
    onInstallmentsChange(
      installments.map((inst) =>
        inst.agreed_invoice_date
          ? { ...inst, agreed_payment_date: computePaymentDate(inst.agreed_invoice_date, val) }
          : inst,
      ),
    );
  };

  const handleExchangeRateChange = (val: number) => {
    onPlanChange({ ...currentPlan, exchange_rate: val > 0 ? val : null });
  };

  // Auto-initialize to 1 installment only for brand-new WOs (woId is empty string).
  // For existing WOs (woId is a UUID), data comes from DB hydration — don't override.
  useEffect(() => {
    if (!woId && installments.length === 0 && isEditable) {
      handleNumInstallmentsChange(1);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When feeWithTax changes (e.g. adjustment edited), recompute stored amounts so
  // the saved value matches what the table displays. Guard via ref to avoid loops.
  const prevFeeWithTax = useRef(feeWithTax);
  useEffect(() => {
    if (prevFeeWithTax.current === feeWithTax || installments.length === 0) {
      prevFeeWithTax.current = feeWithTax;
      return;
    }
    prevFeeWithTax.current = feeWithTax;
    onInstallmentsChange(
      installments.map((inst) => ({
        ...inst,
        amount: computeAmount(inst.percentage, feeWithTax),
      })),
    );
  }, [feeWithTax]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Installment count handler -----

  const handleNumInstallmentsChange = (count: number) => {
    if (count < 0 || count > 24) return;
    // count === 0 clears all installments (user removes the plan)
    if (count === 0) {
      onInstallmentsChange([]);
      return;
    }
    const current = installments.length;
    if (count === current) return;

    if (count > current) {
      const percentages = distributePercentages(count);
      const added: PaymentInstallmentInput[] = Array.from(
        { length: count - current },
        (_, i) => ({
          wo_id: woId,
          plan_id: plan?.plan_id,
          installment_number: current + i + 1,
          agreed_invoice_date: null,
          agreed_payment_date: null,
          collection_invoice_date: null,
          collection_payment_date: null,
          payment_date_actual: null,
          percentage: percentages[current + i],
          amount: computeAmount(percentages[current + i], feeWithTax),
          status: "Pending" as PaymentInstallmentStatus,
        }),
      );
      // Redistribute existing percentages and append new ones
      const newPercentages = distributePercentages(count);
      const updated = [
        ...installments.map((inst, idx) => ({
          ...inst,
          percentage: newPercentages[idx],
          amount: computeAmount(newPercentages[idx], feeWithTax),
        })),
        ...added.map((inst, i) => ({
          ...inst,
          percentage: newPercentages[current + i],
          amount: computeAmount(newPercentages[current + i], feeWithTax),
        })),
      ];
      onInstallmentsChange(updated);
    } else {
      // Reducing: redistribute percentages for remaining rows
      const newPercentages = distributePercentages(count);
      onInstallmentsChange(
        installments.slice(0, count).map((inst, idx) => ({
          ...inst,
          percentage: newPercentages[idx],
          amount: computeAmount(newPercentages[idx], feeWithTax),
        })),
      );
    }
  };

  // ----- Row handlers -----

  const handleInvoiceDateChange = (idx: number, value: string) => {
    const updated = installments.map((inst, i) => {
      if (i !== idx) return inst;
      const newPaymentDate = value
        ? computePaymentDate(value, currentPlan.payment_days)
        : null;
      return { ...inst, agreed_invoice_date: value || null, agreed_payment_date: newPaymentDate };
    });
    onInstallmentsChange(updated);
  };

  const handlePercentageChange = (idx: number, val: number) => {
    onInstallmentsChange(
      installments.map((inst, i) =>
        i === idx
          ? { ...inst, percentage: val, amount: computeAmount(val, feeWithTax) }
          : inst,
      ),
    );
  };

  const handleCollectionInvoiceDateChange = (idx: number, value: string) => {
    onInstallmentsChange(
      installments.map((inst, i) => {
        if (i !== idx) return inst;
        const newPaymentDate = value
          ? computePaymentDate(value, currentPlan.payment_days)
          : null;
        return { ...inst, collection_invoice_date: value || null, collection_payment_date: newPaymentDate };
      }),
    );
  };

  const handleStatusChange = (idx: number, newStatus: PaymentInstallmentStatus) => {
    const inst = installments[idx];
    const updates: Partial<PaymentInstallmentInput> = { status: newStatus };

    if (newStatus === "Invoiced") {
      if (inst.status !== "Overdue") {
        // First invoice (Pending / auto-Overdue→Invoiced): set collection dates
        updates.collection_invoice_date = today;
        updates.collection_payment_date = computePaymentDate(today, currentPlan.payment_days);
      }
      // Manual Overdue→Invoiced revert: keep existing collection dates
      updates.payment_date_actual = null;
    }
    if (newStatus === "Completed") {
      updates.payment_date_actual = today;
    }
    // Overdue (manual from Invoiced): keep existing collection dates, just change status

    const updated = installments.map((r, i) => (i === idx ? { ...r, ...updates } : r));
    onInstallmentsChange(updated);

    if (inst.installment_id) {
      updateStatus.mutate({
        installmentId: inst.installment_id,
        newStatus,
        prevStatus: inst.status as PaymentInstallmentStatus,
        woId,
        paymentDays: currentPlan.payment_days,
      });
    }
  };

  const handleDeleteRow = (idx: number) => {
    const remaining = installments.filter((_, i) => i !== idx);
    if (remaining.length === 0) {
      onInstallmentsChange([]);
      return;
    }
    const newPercentages = distributePercentages(remaining.length);
    onInstallmentsChange(
      remaining.map((inst, i) => ({
        ...inst,
        installment_number: i + 1,
        percentage: newPercentages[i],
        amount: computeAmount(newPercentages[i], feeWithTax),
      })),
    );
  };

  // ----- Formatting -----

  const formatAmount = (amount: number) => {
    const rounded = Math.round(amount);
    if (currency === "BOB") {
      return rounded.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return rounded.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  return (
    <>
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">
            {t("workOrders.paymentPlan.title")}
          </CardTitle>
          {hasAlert && (
            <Alert className="py-2 px-3 w-auto border-warning/50 bg-warning/10 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <AlertDescription className="text-warning text-sm">
                {t("workOrders.paymentPlan.alertBanner")}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Header fields */}
        <div className="flex flex-wrap gap-4">
          {/* Tipo de Cambio — only for non-BOB currencies */}
          {currency !== "BOB" && (
            <div className="flex flex-col gap-1 min-w-[150px]">
              <Label>{t("workOrders.paymentPlan.exchangeRate")}</Label>
              <NumericInput
                decimals={6}
                locale={numericLocale}
                min={0}
                value={currentPlan.exchange_rate ?? 0}
                onChange={handleExchangeRateChange}
                disabled={!isEditable}
                className="w-full"
                data-testid="payment-plan-exchange-rate"
              />
            </div>
          )}

          {/* Días Hábiles */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <Label>{t("workOrders.paymentPlan.paymentDays")}</Label>
            <NumericInput
              value={currentPlan.payment_days}
              onChange={handlePaymentDaysChange}
              disabled={!isEditable}
              decimals={0}
              min={1}
              className="w-full"
            />
          </div>

          {/* Número de Cuotas */}
          <div className="flex flex-col gap-1">
            <Label>{t("workOrders.paymentPlan.numInstallments")}</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => handleNumInstallmentsChange(numInstallments - 1)}
                disabled={!isEditable || numInstallments <= 0}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center font-semibold text-base tabular-nums">
                {numInstallments}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => handleNumInstallmentsChange(numInstallments + 1)}
                disabled={!isEditable || numInstallments >= 24}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Installments table */}
        {installments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-muted-foreground">
                  <th rowSpan={2} className="text-left py-3 px-3 font-medium w-10 align-bottom border-b">
                    {t("workOrders.paymentPlan.installmentNumber")}
                  </th>
                  <th rowSpan={2} className="text-left py-3 px-3 font-medium min-w-[150px] align-bottom border-b">
                    {t("workOrders.paymentPlan.agreedInvoiceDate")}
                  </th>
                  <th rowSpan={2} className="text-left py-3 px-3 font-medium min-w-[115px] align-bottom border-b">
                    {t("workOrders.paymentPlan.agreedPaymentDate")}
                  </th>
                  <th rowSpan={2} className="text-left py-3 px-3 font-medium w-28 align-bottom border-b">
                    {t("workOrders.paymentPlan.percentage")}
                  </th>
                  <th rowSpan={2} className="text-right py-3 px-3 font-medium min-w-[115px] align-bottom border-b">
                    {t("workOrders.paymentPlan.amount")} ({currency})
                  </th>
                  <th colSpan={3} className="text-center py-2 px-3 font-medium border-b border-l border-r border-border/50 bg-muted/20 text-muted-foreground text-xs uppercase tracking-wide">
                    {t("workOrders.paymentPlan.collectionTitle")}
                  </th>
                  <th rowSpan={2} className="w-8 border-b" />
                </tr>
                <tr className="text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium text-xs min-w-[120px] border-b border-l border-border/50 bg-muted/10">
                    {t("workOrders.paymentPlan.collectionInvoiceDate")}
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-xs min-w-[115px] border-b border-border/50 bg-muted/10">
                    {t("workOrders.paymentPlan.collectionPaymentDate")}
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-xs min-w-[135px] border-b border-r border-border/50 bg-muted/10">
                    {t("workOrders.paymentPlan.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {installments.map((inst, idx) => {
                  const instAmount = computeAmount(inst.percentage, feeWithTax);
                  const dateEditable = isEditable || isAdminDateEditable;
                  const effectiveStatus = getEffectiveStatus(inst);
                  const availableOptions = STATUS_TRANSITIONS[effectiveStatus];

                  return (
                    <tr key={inst.installment_id ?? inst.installment_number} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-3 text-muted-foreground font-medium border-b border-border/50">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3 border-b border-border/50">
                        <Input
                          type="date"
                          value={inst.agreed_invoice_date ?? ""}
                          onChange={(e) => handleInvoiceDateChange(idx, e.target.value)}
                          disabled={!dateEditable}
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="py-3 px-3 text-muted-foreground font-mono text-xs border-b border-border/50">
                        {fmtDate(inst.agreed_payment_date)}
                      </td>
                      <td className="py-3 px-3 border-b border-border/50">
                        <NumericInput
                          locale={numericLocale}
                          value={inst.percentage}
                          onChange={(val) => handlePercentageChange(idx, val)}
                          disabled={!isEditable}
                          min={0}
                          max={100}
                          className="w-full h-8"
                        />
                      </td>
                      <td className="py-3 px-3 text-right font-mono border-b border-border/50">
                        {formatAmount(instAmount)}
                      </td>
                      {/* Cobranza group */}
                      <td className="py-3 px-3 border-b border-l border-border/50 bg-muted/10">
                        {isStatusEditable ? (
                          <Input
                            type="date"
                            value={inst.collection_invoice_date ?? ""}
                            onChange={(e) => {
                              if (inst.installment_id && e.target.value) {
                                if (isPaymentPlanDirty) {
                                  toast.error(t("workOrders.paymentPlan.validationSavePlanFirst"));
                                  return;
                                }
                                setPendingCollectionDate({ installmentId: inst.installment_id, newDate: e.target.value });
                              } else {
                                handleCollectionInvoiceDateChange(idx, e.target.value);
                              }
                            }}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="text-muted-foreground font-mono text-xs">
                            {fmtDate(inst.collection_invoice_date)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground font-mono text-xs border-b border-border/50 bg-muted/10">
                        {fmtDate(inst.collection_payment_date)}
                      </td>
                      <td className="py-3 px-3 border-b border-r border-border/50 bg-muted/10">
                        {isStatusEditable && availableOptions.length > 0 ? (
                          <Select
                            value={effectiveStatus}
                            onValueChange={(val) => {
                              const s = val as PaymentInstallmentStatus;
                              if (isPaymentPlanDirty && inst.installment_id) {
                                toast.error(t("workOrders.paymentPlan.validationSavePlanFirst"));
                                return;
                              }
                              if (s === "Invoiced" || s === "Completed" || s === "Overdue") {
                                setPendingChange({ idx, newStatus: s });
                              } else {
                                handleStatusChange(idx, s);
                              }
                            }}
                          >
                            <SelectTrigger className={cn("h-8 text-sm", STATUS_COLORS[effectiveStatus])}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Current state shown as disabled so SelectValue has text to display */}
                              <SelectItem value={effectiveStatus} disabled className={cn("opacity-50", STATUS_COLORS[effectiveStatus])}>
                                {t(`workOrders.paymentPlan.status${effectiveStatus}`)}
                              </SelectItem>
                              {availableOptions.map((val) => (
                                <SelectItem
                                  key={val}
                                  value={val}
                                  className={STATUS_COLORS[val]}
                                >
                                  {t(`workOrders.paymentPlan.status${val}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            title={effectiveStatus === "Overdue" ? t("workOrders.paymentPlan.statusOverdueLong") : undefined}
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              STATUS_CHIP_CLASSES[effectiveStatus],
                            )}
                          >
                            {t(`workOrders.paymentPlan.status${effectiveStatus}`)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-1 border-b border-border/50">
                        {isEditable && installments.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRow(idx)}
                            type="button"
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
                <tr className="border-t font-semibold">
                  <td className="py-3 px-3 text-muted-foreground uppercase text-xs tracking-wide" colSpan={3}>
                    {t("workOrders.paymentPlan.total")}
                  </td>
                  <td className="py-3 px-3">
                    <span className={cn(!percentageValid && "text-destructive font-bold")}>
                      {percentageSumDisplay}%
                    </span>
                    {!percentageValid && (
                      <p className="text-xs text-destructive mt-0.5">
                        {t("workOrders.paymentPlan.validationPercentageSum")}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatAmount(totalAmount)}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Confirmation dialog for status changes that record a date */}
    <Dialog open={!!pendingChange} onOpenChange={(open) => { if (!open) setPendingChange(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {pendingChange?.newStatus === "Invoiced" && t("workOrders.paymentPlan.confirmInvoicedTitle")}
            {pendingChange?.newStatus === "Completed" && t("workOrders.paymentPlan.confirmCompletedTitle")}
            {pendingChange?.newStatus === "Overdue" && t("workOrders.paymentPlan.confirmOverdueTitle")}
          </DialogTitle>
          <DialogDescription className="pt-2 space-y-2">
            <span className="block">
              {pendingChange?.newStatus === "Invoiced" && t("workOrders.paymentPlan.confirmInvoicedDesc", { date: today })}
              {pendingChange?.newStatus === "Completed" && t("workOrders.paymentPlan.confirmCompletedDesc", { date: today })}
              {pendingChange?.newStatus === "Overdue" && t("workOrders.paymentPlan.confirmOverdueDesc")}
            </span>
            {pendingChange?.newStatus !== "Overdue" && (
              <span className="block text-destructive/80 text-xs font-medium">
                {t("workOrders.paymentPlan.confirmIrreversible")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingChange(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={pendingChange?.newStatus === "Overdue" ? "destructive" : "default"}
            onClick={() => {
              if (pendingChange) {
                handleStatusChange(pendingChange.idx, pendingChange.newStatus);
                setPendingChange(null);
              }
            }}
          >
            {pendingChange?.newStatus === "Invoiced" && t("workOrders.paymentPlan.confirmInvoicedAction")}
            {pendingChange?.newStatus === "Completed" && t("workOrders.paymentPlan.confirmCompletedAction")}
            {pendingChange?.newStatus === "Overdue" && t("workOrders.paymentPlan.confirmOverdueAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Collection invoice date correction dialog (admin direct-save) */}
    <Dialog open={!!pendingCollectionDate} onOpenChange={(open) => { if (!open) setPendingCollectionDate(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workOrders.paymentPlan.confirmCollectionDateTitle")}</DialogTitle>
          <DialogDescription>
            {t("workOrders.paymentPlan.confirmCollectionDateDesc", { date: fmtDate(pendingCollectionDate?.newDate ?? null) })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingCollectionDate(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={async () => {
              if (pendingCollectionDate) {
                await updateCollectionDate.mutateAsync({
                  installmentId: pendingCollectionDate.installmentId,
                  collectionInvoiceDate: pendingCollectionDate.newDate,
                  paymentDays: currentPlan.payment_days,
                  woId,
                });
                setPendingCollectionDate(null);
              }
            }}
          >
            {t("workOrders.paymentPlan.confirmCollectionDateAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

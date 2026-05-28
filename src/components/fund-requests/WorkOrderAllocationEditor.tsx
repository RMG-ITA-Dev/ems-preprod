import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumericInput } from "@/components/ui/numeric-input";
import { cn } from "@/lib/utils";
import { useWorkOrders } from "@/hooks/useEmsData";
import type { AllocationInput } from "@/hooks/mutations/useFundRequestMutations";

interface Props {
  currency: "BOB" | "USD";
  totalRequested: number;
  allocations: AllocationInput[];
  onChange: (allocations: AllocationInput[]) => void;
  disabled?: boolean;
}

const formatCurrency = (n: number, currency: "BOB" | "USD") =>
  Math.round(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    maximumFractionDigits: 0,
  });

export function WorkOrderAllocationEditor({
  currency,
  totalRequested,
  allocations,
  onChange,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const { data: workOrders } = useWorkOrders();

  // Solo OTs aprobadas en la moneda de la solicitud
  const availableWorkOrders = useMemo(
    () =>
      (workOrders ?? []).filter(
        (wo) => wo.approval_status === "Approved" && wo.currency === currency,
      ),
    [workOrders, currency],
  );

  const allocatedTotal = allocations.reduce(
    (sum, a) => sum + (Number(a.allocated_amount) || 0),
    0,
  );
  const diff = totalRequested - allocatedTotal;
  const mismatch = Math.abs(diff) > 0.01;

  const usedIds = new Set(allocations.map((a) => a.wo_id).filter(Boolean));

  const addRow = () => {
    onChange([...allocations, { wo_id: "", allocated_amount: 0 }]);
  };

  const updateRow = (index: number, patch: Partial<AllocationInput>) => {
    const next = allocations.map((a, i) => (i === index ? { ...a, ...patch } : a));
    onChange(next);
  };

  const removeRow = (index: number) => {
    onChange(allocations.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {t("fundRequest.allocations")}
        </Label>
        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={availableWorkOrders.length === 0}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("fundRequest.addAllocation")}
          </Button>
        )}
      </div>

      {availableWorkOrders.length === 0 && allocations.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {t("fundRequest.noApprovedWorkOrders", { currency })}
        </p>
      ) : allocations.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {t("fundRequest.noAllocationsYet")}
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t("fundRequest.workOrder")}</th>
                <th className="text-right px-3 py-2 font-medium w-40">
                  {t("fundRequest.amount")} ({currency})
                </th>
                {!disabled && <th className="w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {allocations.map((alloc, idx) => {
                const selectable = availableWorkOrders.filter(
                  (wo) => wo.wo_id === alloc.wo_id || !usedIds.has(wo.wo_id),
                );
                return (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Select
                        value={alloc.wo_id || undefined}
                        onValueChange={(v) => updateRow(idx, { wo_id: v })}
                        disabled={disabled}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("fundRequest.selectWorkOrder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectable.map((wo) => (
                            <SelectItem key={wo.wo_id} value={wo.wo_id}>
                              {wo.engagement?.engagement_code} —{" "}
                              {wo.engagement?.engagement_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <NumericInput
                        decimals={0}
                        min={0}
                        value={alloc.allocated_amount || ""}
                        onChange={(v) => updateRow(idx, { allocated_amount: v })}
                        disabled={disabled}
                        className="text-right font-mono"
                      />
                    </td>
                    {!disabled && (
                      <td className="px-2 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(idx)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td className="px-3 py-2 font-medium text-right">
                  {t("fundRequest.totalAllocated")}:
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold">
                  {formatCurrency(allocatedTotal, currency)}
                </td>
                {!disabled && <td></td>}
              </tr>
              {mismatch && totalRequested > 0 && (
                <tr className="border-t border-border bg-destructive/5">
                  <td className="px-3 py-2 text-right text-destructive text-xs">
                    {diff > 0
                      ? t("fundRequest.missingToAllocate")
                      : t("fundRequest.overAllocated")}
                    :
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono text-xs",
                      "text-destructive font-semibold",
                    )}
                  >
                    {formatCurrency(Math.abs(diff), currency)}
                  </td>
                  {!disabled && <td></td>}
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

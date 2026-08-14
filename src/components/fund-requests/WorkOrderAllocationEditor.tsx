import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NumericInput } from "@/components/ui/numeric-input";
import { cn } from "@/lib/utils";
import { useSelectableWorkOrders } from "@/hooks/useFundRequests";
import type { AllocationInput } from "@/hooks/mutations/useFundRequestMutations";

interface Props {
  currency: "BOB" | "USD";
  totalRequested: number;
  allocations: AllocationInput[];
  onChange: (allocations: AllocationInput[]) => void;
  disabled?: boolean;
}

const formatCurrency = (n: number, currency: "BOB" | "USD") =>
  Number(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    maximumFractionDigits: 2,
  });

// Monedas de OT admitidas en solicitudes de fondos (0722-164). La asignación va
// SIEMPRE en la moneda de la solicitud (BOB): es el efectivo que se entrega y se
// rinde con facturas bolivianas. La moneda de la OT es la del contrato con el
// cliente, así que una OT en USD puede recibir una asignación en BOB sin
// conversión. USDT queda fuera: el módulo de fondos no lo modela.
const FUND_REQUEST_WO_CURRENCIES: readonly string[] = ["BOB", "USD"];

export function WorkOrderAllocationEditor({
  currency,
  totalRequested,
  allocations,
  onChange,
  disabled = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const numericLocale = i18n.language?.startsWith("es") ? "es" : "en";
  const { data: workOrders } = useSelectableWorkOrders();

  const staffName = (s?: { first_name?: string; last_name?: string; short_name?: string | null }) =>
    s ? s.short_name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "-";

  // OTs aprobadas en una moneda que el módulo admite (BOB o USD), sin importar si
  // coincide con la de la solicitud: el monto asignado va en la moneda de la
  // solicitud (0722-164).
  const approvedWorkOrders = useMemo(
    () =>
      (workOrders ?? []).filter(
        (wo) =>
          wo.approval_status === "Approved" &&
          FUND_REQUEST_WO_CURRENCIES.includes(wo.currency),
      ),
    [workOrders],
  );
  // Solo seleccionables las que tienen gerente en su engagement: la aprobación
  // de la solicitud se deriva de ese gerente, así que una OT sin gerente no sirve.
  const availableWorkOrders = useMemo(
    () => approvedWorkOrders.filter((wo) => !!wo.engagement?.manager_id),
    [approvedWorkOrders],
  );
  const blockedNoManager = approvedWorkOrders.length - availableWorkOrders.length;

  const allocatedTotal = allocations.reduce(
    (sum, a) => sum + (Number(a.allocated_amount) || 0),
    0,
  );
  const diff = totalRequested - allocatedTotal;
  // Comparado al centavo, igual que el gate de la RPC de envio
  // (round(v_alloc, 2) <> round(v_total, 2)): una tolerancia de 0.01 dejaba
  // pasar un descuadre que el servidor despues rechazaba con un error crudo.
  const mismatch = Math.round(totalRequested * 100) !== Math.round(allocatedTotal * 100);

  const usedIds = new Set(allocations.map((a) => a.wo_id).filter(Boolean));

  const addRow = () => {
    // La nueva fila se prellena con lo que falta por distribuir: la primera OT
    // toma el total; las siguientes quedan en 0 (vacías) si ya está repartido.
    const remaining = Math.max(totalRequested - allocatedTotal, 0);
    onChange([...allocations, { wo_id: "", allocated_amount: remaining }]);
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

      {!disabled && blockedNoManager > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            {t("fundRequest.otsBlockedNoManager", { count: blockedNoManager })}
          </AlertDescription>
        </Alert>
      )}

      {availableWorkOrders.length === 0 && allocations.length === 0 ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-1">
              {t("fundRequest.noApprovedWorkOrders")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("fundRequest.noApprovedWorkOrdersHelp")}
            </p>
          </AlertDescription>
        </Alert>
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
                <th className="text-left px-3 py-2 font-medium">{t("fundRequest.manager")}</th>
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
                const selectedWo = approvedWorkOrders.find((wo) => wo.wo_id === alloc.wo_id);
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
                              {/* La moneda de la OT va en el texto del ítem: el
                                  trigger del Select lo reproduce, así queda claro
                                  que el monto de al lado es de la solicitud (BOB)
                                  y no de la OT (0722-164). */}
                              {wo.engagement?.engagement_code} —{" "}
                              {wo.engagement?.engagement_name} · {wo.currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {staffName(selectedWo?.engagement?.manager)}
                    </td>
                    <td className="px-3 py-2">
                      <NumericInput
                        decimals={2}
                        locale={numericLocale}
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
                <td className="px-3 py-2 font-medium text-right" colSpan={2}>
                  {t("fundRequest.totalAllocated")}:
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold">
                  {formatCurrency(allocatedTotal, currency)}
                </td>
                {!disabled && <td></td>}
              </tr>
              {mismatch && totalRequested > 0 && (
                <tr className="border-t border-border bg-destructive/5">
                  <td className="px-3 py-2 text-right text-destructive text-xs" colSpan={2}>
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

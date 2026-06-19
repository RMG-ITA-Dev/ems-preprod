import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { NumericInput } from "@/components/ui/numeric-input";
import { WorkOrderAllocationEditor } from "@/components/fund-requests/WorkOrderAllocationEditor";
import type { AllocationInput } from "@/hooks/mutations/useFundRequestMutations";

export interface FundRequestFormValues {
  total_requested_amount: number;
  currency: "BOB" | "USD";
  purpose: string;
  due_back_date: string; // YYYY-MM-DD
  allocations: AllocationInput[];
}

interface Props {
  values: FundRequestFormValues;
  onChange: (patch: Partial<FundRequestFormValues>) => void;
  disabled?: boolean;
  /** Oculta la tabla "Distribución por OT" (se usa la de "Aprobación por OT" en su lugar) */
  hideAllocations?: boolean;
}

export function FundRequestForm({
  values,
  onChange,
  disabled = false,
  hideAllocations = false,
}: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        {/* Datos generales — moneda siempre BOB; el gerente se deriva de cada OT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fr-amount">{t("fundRequest.totalRequested")} (BOB) *</Label>
            <NumericInput
              id="fr-amount"
              decimals={0}
              min={0}
              value={values.total_requested_amount || ""}
              onChange={(v) => {
                const patch: Partial<FundRequestFormValues> = { total_requested_amount: v };
                // Con una sola OT, su monto refleja el total solicitado.
                if (values.allocations.length === 1) {
                  patch.allocations = [{ ...values.allocations[0], allocated_amount: v }];
                }
                onChange(patch);
              }}
              disabled={disabled}
              className="text-right font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fr-due-back">{t("fundRequest.dueBackDate")}</Label>
            <Input
              id="fr-due-back"
              type="date"
              value={values.due_back_date || ""}
              onChange={(e) => onChange({ due_back_date: e.target.value })}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fr-purpose">{t("fundRequest.purpose")}</Label>
          <Textarea
            id="fr-purpose"
            value={values.purpose}
            onChange={(e) => onChange({ purpose: e.target.value })}
            disabled={disabled}
            rows={3}
            placeholder={t("fundRequest.purposePlaceholder")}
          />
        </div>

        {/* Distribución por OT — cada OT muestra su gerente aprobador */}
        {!hideAllocations && (
          <WorkOrderAllocationEditor
            currency={values.currency}
            totalRequested={values.total_requested_amount}
            allocations={values.allocations}
            onChange={(allocations) => onChange({ allocations })}
            disabled={disabled}
          />
        )}
      </CardContent>
    </Card>
  );
}

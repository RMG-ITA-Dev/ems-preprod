import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { NumericInput } from "@/components/ui/numeric-input";
import { WorkOrderAllocationEditor } from "@/components/fund-requests/WorkOrderAllocationEditor";
import type { AllocationInput } from "@/hooks/mutations/useFundRequestMutations";
import {
  formatDateDMY,
  formatMonthLabel,
  fundRequestDeadline,
  laPazToday,
  selectableMonths,
} from "@/lib/fundRequestCalendar";

export interface FundRequestFormValues {
  total_requested_amount: number;
  currency: "BOB" | "USD";
  purpose: string;
  /** Mes de la solicitud ('YYYY-MM-01'). La fecha fin es el día 3 del mes siguiente. */
  expense_period_month: string;
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
  const { t, i18n } = useTranslation();
  const numericLocale = i18n.language?.startsWith("es") ? "es" : "en";
  const dateLocale = numericLocale === "es" ? "es-BO" : "en-US";
  // El actual y hasta 5 meses adelante. Si la solicitud ya tiene un mes fuera de ese rango
  // (un borrador viejo), se muestra igual para no perder el valor al abrirla.
  const months = selectableMonths(laPazToday());
  const monthOptions =
    values.expense_period_month && !months.includes(values.expense_period_month)
      ? [values.expense_period_month, ...months]
      : months;

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        {/* Datos generales — moneda siempre BOB; el gerente se deriva de cada OT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fr-amount">{t("fundRequest.totalRequested")} (BOB) *</Label>
            <NumericInput
              id="fr-amount"
              decimals={2}
              locale={numericLocale}
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
            <Label htmlFor="fr-period-month">{t("fundRequest.periodMonth")} *</Label>
            <Select
              value={values.expense_period_month || undefined}
              onValueChange={(v) => onChange({ expense_period_month: v })}
              disabled={disabled}
            >
              <SelectTrigger id="fr-period-month">
                <SelectValue placeholder={t("fundRequest.periodMonthPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">
                    {formatMonthLabel(m, dateLocale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {values.expense_period_month && (
              <p className="text-xs text-muted-foreground">
                {t("fundRequest.periodMonthHelp", {
                  date: formatDateDMY(fundRequestDeadline(values.expense_period_month)),
                })}
              </p>
            )}
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

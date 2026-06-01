import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { NumericInput } from "@/components/ui/numeric-input";
import { useExpenseTypes } from "@/hooks/useEmsData";
import type { FundRequestWorkOrder } from "@/hooks/useFundRequests";

export interface FundRequestExpenseFormValues {
  wo_id: string;
  expense_type_id: string;
  expense_date: string; // YYYY-MM-DD
  amount: number;
  description: string;
  document_number: string;
  supplier_name: string;
  supplier_tax_id: string;
  attachment_url: string;
}

interface Props {
  values: FundRequestExpenseFormValues;
  onChange: (patch: Partial<FundRequestExpenseFormValues>) => void;
  /** OTs asociadas a la solicitud de fondos — son las únicas seleccionables */
  workOrders: FundRequestWorkOrder[];
  currency: "BOB" | "USD";
  disabled?: boolean;
  /** Renderiza sin la Card contenedora (para usar dentro de un modal) */
  bare?: boolean;
}

export function FundRequestExpenseForm({
  values,
  onChange,
  workOrders,
  currency,
  disabled = false,
  bare = false,
}: Props) {
  const { t } = useTranslation();
  const { data: expenseTypes } = useExpenseTypes();

  const inner = (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* OT */}
          <div className="space-y-2">
            <Label htmlFor="fre-wo">{t("fundRequestExpense.workOrder")} *</Label>
            <Select
              value={values.wo_id || undefined}
              onValueChange={(v) => onChange({ wo_id: v })}
              disabled={disabled || workOrders.length === 0}
            >
              <SelectTrigger id="fre-wo">
                <SelectValue placeholder={t("fundRequestExpense.selectWorkOrder")} />
              </SelectTrigger>
              <SelectContent>
                {workOrders.map((frwo) => (
                  <SelectItem key={frwo.wo_id} value={frwo.wo_id}>
                    {frwo.work_order?.engagement?.engagement_code} —{" "}
                    {frwo.work_order?.engagement?.engagement_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de gasto */}
          <div className="space-y-2">
            <Label htmlFor="fre-type">{t("fundRequestExpense.expenseType")}</Label>
            <Select
              value={values.expense_type_id || undefined}
              onValueChange={(v) => onChange({ expense_type_id: v })}
              disabled={disabled}
            >
              <SelectTrigger id="fre-type">
                <SelectValue placeholder={t("fundRequestExpense.selectExpenseType")} />
              </SelectTrigger>
              <SelectContent>
                {(expenseTypes ?? []).map((et) => (
                  <SelectItem key={et.expense_type_id} value={et.expense_type_id}>
                    {et.expense_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha */}
          <div className="space-y-2">
            <Label htmlFor="fre-date">{t("fundRequestExpense.expenseDate")} *</Label>
            <Input
              id="fre-date"
              type="date"
              value={values.expense_date || ""}
              onChange={(e) => onChange({ expense_date: e.target.value })}
              disabled={disabled}
            />
          </div>

          {/* Monto */}
          <div className="space-y-2">
            <Label htmlFor="fre-amount">
              {t("fundRequestExpense.amount")} ({currency}) *
            </Label>
            <NumericInput
              id="fre-amount"
              decimals={2}
              min={0}
              value={values.amount || ""}
              onChange={(v) => onChange({ amount: v })}
              disabled={disabled}
              className="text-right font-mono"
            />
          </div>

          {/* N° de documento / factura */}
          <div className="space-y-2">
            <Label htmlFor="fre-doc">{t("fundRequestExpense.documentNumber")}</Label>
            <Input
              id="fre-doc"
              value={values.document_number || ""}
              onChange={(e) => onChange({ document_number: e.target.value })}
              disabled={disabled}
              placeholder={t("fundRequestExpense.documentNumberPlaceholder")}
            />
          </div>

          {/* Proveedor */}
          <div className="space-y-2">
            <Label htmlFor="fre-supplier">{t("fundRequestExpense.supplierName")}</Label>
            <Input
              id="fre-supplier"
              value={values.supplier_name || ""}
              onChange={(e) => onChange({ supplier_name: e.target.value })}
              disabled={disabled}
            />
          </div>

          {/* NIT del proveedor */}
          <div className="space-y-2">
            <Label htmlFor="fre-tax">{t("fundRequestExpense.supplierTaxId")}</Label>
            <Input
              id="fre-tax"
              value={values.supplier_tax_id || ""}
              onChange={(e) => onChange({ supplier_tax_id: e.target.value })}
              disabled={disabled}
              placeholder={t("fundRequestExpense.supplierTaxIdPlaceholder")}
            />
          </div>

          {/* Respaldo (URL) */}
          <div className="space-y-2">
            <Label htmlFor="fre-attachment">{t("fundRequestExpense.attachmentUrl")}</Label>
            <Input
              id="fre-attachment"
              value={values.attachment_url || ""}
              onChange={(e) => onChange({ attachment_url: e.target.value })}
              disabled={disabled}
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Descripción */}
        <div className="space-y-2">
          <Label htmlFor="fre-description">{t("fundRequestExpense.description")}</Label>
          <Textarea
            id="fre-description"
            value={values.description}
            onChange={(e) => onChange({ description: e.target.value })}
            disabled={disabled}
            rows={3}
            placeholder={t("fundRequestExpense.descriptionPlaceholder")}
          />
        </div>
    </div>
  );

  if (bare) return inner;

  return (
    <Card>
      <CardContent className="pt-6">{inner}</CardContent>
    </Card>
  );
}

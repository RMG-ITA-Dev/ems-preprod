import { useMemo } from "react";
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
import { WorkOrderAllocationEditor } from "@/components/fund-requests/WorkOrderAllocationEditor";
import { useCategoryStaff } from "@/hooks/useCategoryStaff";
import type { AllocationInput } from "@/hooks/mutations/useFundRequestMutations";

export interface FundRequestFormValues {
  approver_manager_staff_id: string;
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
}

export function FundRequestForm({ values, onChange, disabled = false }: Props) {
  const { t } = useTranslation();
  const { managerOptions } = useCategoryStaff();

  const managerSelectOptions = useMemo(() => managerOptions ?? [], [managerOptions]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        {/* Datos generales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fr-approver">{t("fundRequest.approver")} *</Label>
            <Select
              value={values.approver_manager_staff_id || undefined}
              onValueChange={(v) => onChange({ approver_manager_staff_id: v })}
              disabled={disabled}
            >
              <SelectTrigger id="fr-approver">
                <SelectValue placeholder={t("fundRequest.selectApprover")} />
              </SelectTrigger>
              <SelectContent>
                {managerSelectOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("fundRequest.currency")} *</Label>
            <Select
              value={values.currency}
              onValueChange={(v) =>
                onChange({ currency: v as "BOB" | "USD", allocations: [] })
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOB">BOB</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fr-amount">{t("fundRequest.totalRequested")} *</Label>
            <NumericInput
              id="fr-amount"
              decimals={0}
              min={0}
              value={values.total_requested_amount || ""}
              onChange={(v) => onChange({ total_requested_amount: v })}
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

        {/* Distribución por OT */}
        <WorkOrderAllocationEditor
          currency={values.currency}
          totalRequested={values.total_requested_amount}
          allocations={values.allocations}
          onChange={(allocations) => onChange({ allocations })}
          disabled={disabled}
        />
      </CardContent>
    </Card>
  );
}

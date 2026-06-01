import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Card, CardContent } from "@/components/ui/card";
import { NumericInput } from "@/components/ui/numeric-input";
import { WorkOrderAllocationEditor } from "@/components/fund-requests/WorkOrderAllocationEditor";
import { useCategoryStaff } from "@/hooks/useCategoryStaff";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { cn } from "@/lib/utils";
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
  const { staffRecord } = useCurrentStaff();
  const [managerOpen, setManagerOpen] = useState(false);

  // En modo edición excluimos al usuario actual (no puede auto-aprobarse).
  // En modo lectura mostramos todos para que el valor seleccionado se muestre
  // aunque el aprobador sea el mismo usuario que está viendo la solicitud.
  const managerSelectOptions = useMemo(
    () =>
      disabled
        ? (managerOptions ?? [])
        : (managerOptions ?? []).filter((m) => m.value !== staffRecord?.staff_id),
    [managerOptions, staffRecord, disabled],
  );

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        {/* Datos generales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fr-approver">{t("fundRequest.approver")} *</Label>
            <Popover open={managerOpen && !disabled} onOpenChange={(o) => !disabled && setManagerOpen(o)}>
              <PopoverTrigger asChild>
                <Button
                  id="fr-approver"
                  variant="outline"
                  role="combobox"
                  disabled={disabled || managerSelectOptions.length === 0}
                  className={cn(
                    "w-full justify-between font-normal",
                    !values.approver_manager_staff_id && "text-muted-foreground",
                  )}
                >
                  <span className="truncate">
                    {managerSelectOptions.find((m) => m.value === values.approver_manager_staff_id)
                      ?.label ?? t("fundRequest.selectApprover")}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("fundRequest.searchApprover")} />
                  <CommandList>
                    <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                    <CommandGroup>
                      {managerSelectOptions.map((m) => (
                        <CommandItem
                          key={m.value}
                          value={m.label}
                          onSelect={() => {
                            onChange({ approver_manager_staff_id: m.value });
                            setManagerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              values.approver_manager_staff_id === m.value
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {m.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {managerSelectOptions.length === 0 && !disabled && (
              <p className="text-xs text-warning">
                {t("fundRequest.noManagersAvailable")}
              </p>
            )}
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

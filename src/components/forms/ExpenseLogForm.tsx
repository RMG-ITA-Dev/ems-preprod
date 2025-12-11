import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useEngagements, useExpenseTypes } from "@/hooks/useEmsData";
import { useState, useEffect } from "react";

interface ExpenseLogFormData {
  expense_log_id?: string;
  engagement_id: string;
  expense_type_id: string;
  date_incurred: string;
  amount: number;
  currency: string;
  description: string | null;
  receipt_url?: string | null;
}

interface ExpenseLogFormProps {
  initialData?: ExpenseLogFormData | null;
  onSubmit: (data: {
    engagement_id: string;
    expense_type_id: string;
    date_incurred: string;
    amount: number;
    currency: string;
    description: string | null;
    receipt_url: string | null;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ExpenseLogForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: ExpenseLogFormProps) {
  const { t } = useTranslation();
  const { data: engagements = [] } = useEngagements();
  const { data: expenseTypes = [] } = useExpenseTypes();

  // Filter only active engagements with approved work orders for selection
  const activeEngagements = engagements.filter(e => e.status === "active");

  const [formData, setFormData] = useState({
    engagement_id: initialData?.engagement_id || "",
    expense_type_id: initialData?.expense_type_id || "",
    date_incurred: initialData?.date_incurred || "",
    amount: initialData?.amount || 0,
    currency: (initialData?.currency || "BOB") as "BOB" | "USD",
    description: initialData?.description || "",
    receipt_url: "",
  });

  const [date, setDate] = useState<Date | undefined>(
    initialData?.date_incurred ? new Date(initialData.date_incurred + "T12:00:00") : undefined
  );

  useEffect(() => {
    if (initialData) {
      setFormData({
        engagement_id: initialData.engagement_id,
        expense_type_id: initialData.expense_type_id,
        date_incurred: initialData.date_incurred,
        amount: initialData.amount,
        currency: initialData.currency as "BOB" | "USD",
        description: initialData.description || "",
        receipt_url: "",
      });
      if (initialData.date_incurred) {
        setDate(new Date(initialData.date_incurred + "T12:00:00"));
      }
    }
  }, [initialData]);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
      setFormData((prev) => ({
        ...prev,
        date_incurred: format(selectedDate, "yyyy-MM-dd"),
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      engagement_id: formData.engagement_id,
      expense_type_id: formData.expense_type_id,
      date_incurred: formData.date_incurred,
      amount: formData.amount,
      currency: formData.currency,
      description: formData.description || null,
      receipt_url: formData.receipt_url || null,
    });
  };

  const isValid =
    formData.engagement_id &&
    formData.expense_type_id &&
    formData.date_incurred &&
    formData.amount > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 form-dense">
      <div className="grid grid-cols-2 gap-4">
        {/* Engagement */}
        <div className="space-y-1.5">
          <Label>{t("expenses.engagement")} *</Label>
          <Select
            value={formData.engagement_id}
            onValueChange={(val) => setFormData((prev) => ({ ...prev, engagement_id: val }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("engagement.selectClient")} />
            </SelectTrigger>
            <SelectContent>
              {activeEngagements.map((eng) => (
                <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                  {eng.engagement_code ? `${eng.engagement_code} - ` : ""}{eng.engagement_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Expense Type */}
        <div className="space-y-1.5">
          <Label>{t("expenses.expenseType")} *</Label>
          <Select
            value={formData.expense_type_id}
            onValueChange={(val) => setFormData((prev) => ({ ...prev, expense_type_id: val }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("form.selectOption")} />
            </SelectTrigger>
            <SelectContent>
              {expenseTypes.map((type) => (
                <SelectItem key={type.expense_type_id} value={type.expense_type_id}>
                  {type.expense_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date */}
        <div className="space-y-1.5">
          <Label>{t("expenses.date")} *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "dd/MM/yyyy") : t("common.pickDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleDateSelect}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Currency */}
        <div className="space-y-1.5">
          <Label>{t("expenses.currency")} *</Label>
          <Select
            value={formData.currency}
            onValueChange={(val) => setFormData((prev) => ({ ...prev, currency: val as "BOB" | "USD" }))}
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

        {/* Amount */}
        <div className="space-y-1.5">
          <Label>{t("expenses.amount")} *</Label>
          <NumericInput
            decimals={2}
            locale={formData.currency === "BOB" ? "es" : "en"}
            min={0}
            value={formData.amount || ""}
            onChange={(val) =>
              setFormData((prev) => ({ ...prev, amount: val }))
            }
            placeholder="0.00"
          />
        </div>

        {/* Receipt URL */}
        <div className="space-y-1.5">
          <Label>{t("expenses.receiptUrl")}</Label>
          <Input
            type="url"
            value={formData.receipt_url}
            onChange={(e) => setFormData((prev) => ({ ...prev, receipt_url: e.target.value }))}
            placeholder="https://..."
          />
        </div>
      </div>

      {/* Description - full width */}
      <div className="space-y-1.5">
        <Label>{t("expenses.description")}</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder={t("expenses.description")}
          rows={2}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="btn-action">
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!isValid || isLoading} className="btn-action">
          {isLoading ? t("common.loading") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

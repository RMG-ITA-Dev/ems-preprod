import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumericInput } from "@/components/ui/numeric-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import {
  formatDateDMY,
  formatMonthLabel,
  fundRequestDeadline,
  isDeadlinePassed,
  laPazToday,
  selectableMonths,
} from "@/lib/fundRequestCalendar";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestedAmount: number;
  currency: "BOB" | "USD";
  /** Mes de la solicitud ('YYYY-MM-01'): de él sale la fecha fin. */
  periodMonth: string;
  isSubmitting?: boolean;
  onConfirm: (payload: { amount: number; notes: string; newMonth: string | null }) => void;
}

export function DisbursementDialog({
  open,
  onOpenChange,
  requestedAmount,
  currency,
  periodMonth,
  isSubmitting,
  onConfirm,
}: Props) {
  const { t, i18n } = useTranslation();
  const numericLocale = i18n.language?.startsWith("es") ? "es" : "en";
  const dateLocale = numericLocale === "es" ? "es-BO" : "en-US";
  // Calendario (U1): con la fecha fin vencida el solicitante no tendría plazo para rendir, así
  // que hay que elegir un mes nuevo antes de desembolsar. El servidor lo exige igual.
  const today = laPazToday();
  const expired = isDeadlinePassed(periodMonth, today);
  const [newMonth, setNewMonth] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(requestedAmount);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(requestedAmount);
      setNotes("");
      setNewMonth(null);
      setError(null);
    }
  }, [open, requestedAmount]);

  const handleConfirm = (e: React.MouseEvent) => {
    if (!amount || amount <= 0) {
      e.preventDefault();
      setError(t("fundRequest.errors.disbursedAmountInvalid"));
      return;
    }
    if (amount > requestedAmount) {
      e.preventDefault();
      setError(t("fundRequest.errors.disbursedAmountExceedsRequested"));
      return;
    }
    if (expired && !newMonth) {
      e.preventDefault();
      setError(t("fundRequest.errors.newMonthRequired"));
      return;
    }
    onConfirm({ amount, notes, newMonth: expired ? newMonth : null });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("fundRequest.dialog.disburseTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("fundRequest.dialog.disburseBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          {expired ? (
            <Alert className="border-warning/50 text-warning [&>svg]:text-warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <p>
                  {t("fundRequest.dialog.disburseExpired", {
                    date: formatDateDMY(fundRequestDeadline(periodMonth)),
                  })}
                </p>
                <Select
                  value={newMonth ?? undefined}
                  onValueChange={(v) => {
                    setNewMonth(v);
                    if (error) setError(null);
                  }}
                >
                  <SelectTrigger aria-label={t("fundRequest.dialog.newMonth")}>
                    <SelectValue placeholder={t("fundRequest.dialog.newMonth")} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableMonths(today).map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">
                        {formatMonthLabel(m, dateLocale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newMonth && (
                  <p className="text-xs">
                    {t("fundRequest.periodMonthHelp", {
                      date: formatDateDMY(fundRequestDeadline(newMonth)),
                    })}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("fundRequest.periodMonthHelp", {
                date: formatDateDMY(fundRequestDeadline(periodMonth)),
              })}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="disbursed-amount">
              {t("fundRequest.totalDisbursed")} ({currency}) *
            </Label>
            <NumericInput
              id="disbursed-amount"
              decimals={2}
              locale={numericLocale}
              min={0}
              value={amount || ""}
              onChange={(v) => {
                setAmount(v);
                if (error) setError(null);
              }}
              className="text-right font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t("fundRequest.requestedHint", {
                amount: Number(requestedAmount).toLocaleString(
                  currency === "BOB" ? "es-BO" : "en-US",
                  { maximumFractionDigits: 2 },
                ),
                currency,
              })}
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="disbursement-notes">{t("fundRequest.accountingNotes")}</Label>
            <Textarea
              id="disbursement-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("fundRequest.dialog.notesPlaceholderOptional")}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? t("common.saving") : t("fundRequest.actions.disburse")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

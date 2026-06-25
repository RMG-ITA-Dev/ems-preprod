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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestedAmount: number;
  currency: "BOB" | "USD";
  isSubmitting?: boolean;
  onConfirm: (payload: { amount: number; notes: string }) => void;
}

export function DisbursementDialog({
  open,
  onOpenChange,
  requestedAmount,
  currency,
  isSubmitting,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState<number>(requestedAmount);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(requestedAmount);
      setNotes("");
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
    onConfirm({ amount, notes });
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
          <div className="space-y-2">
            <Label htmlFor="disbursed-amount">
              {t("fundRequest.totalDisbursed")} ({currency}) *
            </Label>
            <NumericInput
              id="disbursed-amount"
              decimals={0}
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
                amount: Math.round(requestedAmount).toLocaleString(
                  currency === "BOB" ? "es-BO" : "en-US",
                  { maximumFractionDigits: 0 },
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

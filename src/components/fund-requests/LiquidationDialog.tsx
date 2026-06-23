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
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/ui/numeric-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeSettlement } from "@/lib/fundRequest";
import type { SettlementResolution } from "@/hooks/useFundRequests";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: "BOB" | "USD";
  disbursed: number;
  spent: number;
  ivaTotal: number;
  /** No hay gastos registrados → liquidar devolvería todo. Exige confirmación. */
  hasNoExpenses?: boolean;
  isSubmitting?: boolean;
  onConfirm: (payload: {
    resolution: SettlementResolution;
    amount: number;
    notes: string;
  }) => void;
}

const fmt = (n: number, currency: "BOB" | "USD") =>
  Number(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function LiquidationDialog({
  open,
  onOpenChange,
  currency,
  disbursed,
  spent,
  ivaTotal,
  hasNoExpenses = false,
  isSubmitting,
  onConfirm,
}: Props) {
  const { t } = useTranslation();

  // > 0 sobró (a favor de la firma) · < 0 gastó de más (a favor del solicitante)
  const { balance, favorsFirm, favorsRequester, noBalance } = computeSettlement(disbursed, spent);

  // Resolución: con saldo a favor de la firma el admin elige; en los otros casos
  // queda determinada.
  const [firmChoice, setFirmChoice] = useState<"devolucion" | "descuento_planilla" | null>(null);
  const [amount, setAmount] = useState<number>(Math.abs(balance));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Confirmación explícita cuando no hay gastos registrados (devolución total).
  const [ackNoExpenses, setAckNoExpenses] = useState(false);

  useEffect(() => {
    if (open) {
      setFirmChoice(null);
      setAmount(Math.abs(balance));
      setNotes("");
      setError(null);
      setAckNoExpenses(false);
    }
  }, [open, balance]);

  const resolution: SettlementResolution | null = noBalance
    ? "sin_saldo"
    : favorsRequester
      ? "pago_solicitante"
      : firmChoice; // a favor de la firma → requiere elección

  const handleConfirm = (e: React.MouseEvent) => {
    if (hasNoExpenses && !ackNoExpenses) {
      e.preventDefault();
      setError(t("fundRequest.settlement.noExpensesConfirmRequired"));
      return;
    }
    if (!resolution) {
      e.preventDefault();
      setError(t("fundRequest.settlement.chooseResolution"));
      return;
    }
    onConfirm({ resolution, amount, notes });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("fundRequest.settlement.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("fundRequest.settlement.body")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Resumen del cálculo */}
        <div className="rounded-md border divide-y text-sm">
          <div className="flex justify-between px-3 py-2">
            <span className="text-muted-foreground">{t("fundRequest.totalDisbursed")}</span>
            <span className="font-mono">{fmt(disbursed, currency)} {currency}</span>
          </div>
          <div className="flex justify-between px-3 py-2">
            <span className="text-muted-foreground">{t("fundRequestExpense.totalSpent")}</span>
            <span className="font-mono">{fmt(spent, currency)} {currency}</span>
          </div>
          <div className="flex justify-between px-3 py-2 bg-muted/30">
            <span className="font-medium">{t("fundRequestExpense.balance")}</span>
            <span
              className={cn(
                "font-mono font-semibold",
                favorsRequester ? "text-destructive" : "text-success",
              )}
            >
              {fmt(Math.abs(balance), currency)} {currency}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {noBalance
                  ? t("fundRequest.settlement.noBalance")
                  : favorsFirm
                    ? t("fundRequest.settlement.favorsFirm")
                    : t("fundRequest.settlement.favorsRequester")}
              </span>
            </span>
          </div>
          {ivaTotal > 0 && (
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">{t("fundRequestExpense.totalIvaPenalty")}</span>
              <span className="font-mono text-warning">{fmt(ivaTotal, currency)} {currency}</span>
            </div>
          )}
        </div>

        {/* Aviso: sin gastos registrados (devolución total) → confirmar */}
        {hasNoExpenses && (
          <Alert className="border-warning/50 text-warning [&>svg]:text-warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>{t("fundRequest.settlement.noExpensesWarning")}</p>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={ackNoExpenses}
                  onCheckedChange={(v) => {
                    setAckNoExpenses(v === true);
                    if (error) setError(null);
                  }}
                />
                {t("fundRequest.settlement.noExpensesConfirm")}
              </label>
            </AlertDescription>
          </Alert>
        )}

        {/* Resolución */}
        <div className="space-y-3 py-1">
          {noBalance && (
            <p className="text-sm text-muted-foreground">
              {t("fundRequest.settlement.noBalanceHelp")}
            </p>
          )}

          {favorsRequester && (
            <p className="text-sm">{t("fundRequest.settlement.payRequesterHelp")}</p>
          )}

          {favorsFirm && (
            <div className="space-y-2">
              <Label>{t("fundRequest.settlement.firmQuestion")}</Label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant={firmChoice === "devolucion" ? "default" : "outline"}
                  onClick={() => {
                    setFirmChoice("devolucion");
                    if (error) setError(null);
                  }}
                >
                  {t("fundRequest.settlement.resolution.devolucion")}
                </Button>
                <Button
                  type="button"
                  variant={firmChoice === "descuento_planilla" ? "default" : "outline"}
                  onClick={() => {
                    setFirmChoice("descuento_planilla");
                    if (error) setError(null);
                  }}
                >
                  {t("fundRequest.settlement.resolution.descuento_planilla")}
                </Button>
              </div>
            </div>
          )}

          {!noBalance && (
            <div className="space-y-2">
              <Label htmlFor="settle-amount">
                {t("fundRequest.settlement.amount")} ({currency})
              </Label>
              <NumericInput
                id="settle-amount"
                decimals={2}
                min={0}
                value={amount || ""}
                onChange={(v) => setAmount(v)}
                className="text-right font-mono"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="settle-notes">{t("fundRequest.accountingNotes")}</Label>
            <Textarea
              id="settle-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t("fundRequest.settlement.notesPlaceholder")}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? t("common.saving") : t("fundRequest.settlement.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

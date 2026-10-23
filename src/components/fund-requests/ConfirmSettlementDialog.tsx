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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { SettlementMovementKind } from "@/lib/fundRequest";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: SettlementMovementKind;
  amount: number;
  currency: "BOB" | "USD";
  employeeName: string;
  isSubmitting?: boolean;
  onConfirm: (payload: { reference: string; notes: string }) => void;
}

const fmt = (n: number, currency: "BOB" | "USD") =>
  Number(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Confirmar el movimiento de dinero de una liquidación (Fase 4): el reembolso se pagó, la
 * devolución se recibió o el descuento se aplicó en planilla. Cierra la solicitud y NO se
 * revierte, por eso pide una segunda confirmación explícita (N6), con el mismo patrón que
 * LiquidationDialog usa para liquidar sin gastos.
 */
export function ConfirmSettlementDialog({
  open,
  onOpenChange,
  kind,
  amount,
  currency,
  employeeName,
  isSubmitting,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReference("");
      setNotes("");
      setAck(false);
      setError(null);
    }
  }, [open]);

  const handleConfirm = (e: React.MouseEvent) => {
    if (!ack) {
      e.preventDefault();
      setError(t("fundRequest.movement.ackRequired"));
      return;
    }
    onConfirm({ reference, notes });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`fundRequest.movement.confirmTitle.${kind}`)}</AlertDialogTitle>
          <AlertDialogDescription>{t("fundRequest.movement.confirmBody")}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border divide-y text-sm">
          <div className="flex justify-between px-3 py-2">
            <span className="text-muted-foreground">{t("fundRequest.movement.type")}</span>
            <span>{t(`fundRequest.movement.kind.${kind}`)}</span>
          </div>
          <div className="flex justify-between px-3 py-2">
            <span className="text-muted-foreground">{t("fundRequest.requester")}</span>
            <span>{employeeName}</span>
          </div>
          <div className="flex justify-between px-3 py-2 bg-muted/30">
            <span className="font-medium">{t("fundRequest.settlement.amount")}</span>
            <span className="font-mono font-semibold">
              {fmt(amount, currency)} {currency}
            </span>
          </div>
        </div>

        <div className="space-y-3 py-1">
          <div className="space-y-2">
            <Label htmlFor="movement-reference">{t("fundRequest.movement.reference")}</Label>
            <Input
              id="movement-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t("fundRequest.movement.referencePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="movement-notes">{t("fundRequest.accountingNotes")}</Label>
            <Textarea
              id="movement-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <label className="flex items-start gap-2 text-sm font-medium">
            <Checkbox
              checked={ack}
              onCheckedChange={(v) => {
                setAck(v === true);
                if (error) setError(null);
              }}
              aria-label={t(`fundRequest.movement.ack.${kind}`)}
            />
            <span>{t(`fundRequest.movement.ack.${kind}`)}</span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isSubmitting || !ack}>
            {isSubmitting ? t("common.saving") : t(`fundRequest.movement.confirmAction.${kind}`)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

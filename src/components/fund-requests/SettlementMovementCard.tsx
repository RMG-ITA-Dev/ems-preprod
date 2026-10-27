import { useTranslation } from "react-i18next";
import { CheckCircle2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SettlementMovement } from "@/lib/fundRequest";

interface Props {
  movement: SettlementMovement;
  currency: "BOB" | "USD";
  employeeName: string;
  /** Quién confirmó (solo cuando ya está confirmado). */
  confirmedByName?: string;
  reference?: string | null;
  /** El que mira es el solicitante: el texto le habla a él. */
  isRequester: boolean;
  /** Contabilidad puede confirmar (fund_disbursement.update) y está pendiente. */
  canConfirm: boolean;
  disabled?: boolean;
  onConfirmClick: () => void;
}

const fmt = (n: number, currency: "BOB" | "USD") =>
  `${Number(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
};

/**
 * Estado del movimiento de dinero de la liquidación (Fase 4, P3/P8): pendiente (badge ámbar y,
 * para Contabilidad, el botón para confirmarlo) o confirmado (badge verde con fecha, hora y
 * quién). El solicitante ve lo mismo, redactado para él, sin tener que preguntar.
 */
export function SettlementMovementCard({
  movement,
  currency,
  employeeName,
  confirmedByName,
  reference,
  isRequester,
  canConfirm,
  disabled,
  onConfirmClick,
}: Props) {
  const { t } = useTranslation();
  const amount = fmt(movement.amount, currency);
  const viewer = isRequester ? "requester" : "staff";

  return (
    <Card className={movement.pending ? "border-warning/40 bg-warning/5" : "border-success/30 bg-success/5"}>
      <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              movement.pending
                ? "bg-warning/15 text-warning border-warning/30"
                : "bg-success/15 text-success border-success/30",
            )}
          >
            {movement.pending ? <Wallet className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {movement.pending
              ? t(`fundRequest.movement.pendingBadge.${movement.kind}`)
              : t(`fundRequest.movement.doneBadge.${movement.kind}`)}
          </span>
          <p className="text-sm">
            {movement.pending
              ? t(`fundRequest.movement.pendingText.${viewer}.${movement.kind}`, { amount, name: employeeName })
              : t(`fundRequest.movement.doneText.${viewer}.${movement.kind}`, { amount, name: employeeName })}
          </p>
          {!movement.pending && movement.confirmedAt && (
            <p className="text-xs text-muted-foreground">
              {formatDateTime(movement.confirmedAt)}
              {confirmedByName ? ` · ${t("fundRequestEvent.by", { name: confirmedByName })}` : ""}
              {reference ? ` · ${t("fundRequest.movement.reference")}: ${reference}` : ""}
            </p>
          )}
        </div>
        {movement.pending && canConfirm && (
          <Button onClick={onConfirmClick} disabled={disabled}>
            {t(`fundRequest.movement.confirmAction.${movement.kind}`)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

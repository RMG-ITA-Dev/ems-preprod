import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  CircleDot,
  RotateCcw,
  Send,
  Wallet,
  XCircle,
  AlertTriangle,
  FileCheck2,
  Lock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FundRequestEvent } from "@/hooks/useFundRequestEvents";

type Tone = "success" | "warning" | "destructive" | "info" | "muted";

// Ícono y tono por acción de la bitácora (fr_log_event / fr_wo_log_event / fre_log_event).
const ACTION_STYLE: Record<string, { icon: LucideIcon; tone: Tone }> = {
  created: { icon: CircleDot, tone: "muted" },
  submitted: { icon: Send, tone: "info" },
  approved: { icon: CheckCircle2, tone: "success" },
  observed: { icon: AlertTriangle, tone: "warning" },
  rejected: { icon: XCircle, tone: "destructive" },
  disbursed: { icon: Wallet, tone: "success" },
  settled: { icon: FileCheck2, tone: "info" },
  closed: { icon: Lock, tone: "success" },
  cancelled: { icon: XCircle, tone: "destructive" },
  wo_approved: { icon: CheckCircle2, tone: "success" },
  wo_observed: { icon: AlertTriangle, tone: "warning" },
  wo_rejected: { icon: XCircle, tone: "destructive" },
  expense_submitted: { icon: Send, tone: "info" },
  expense_manager_approved: { icon: CheckCircle2, tone: "success" },
  expense_manager_observed: { icon: AlertTriangle, tone: "warning" },
  expense_manager_rejected: { icon: XCircle, tone: "destructive" },
  expense_returned_by_accounting: { icon: RotateCcw, tone: "warning" },
  expense_resubmitted_to_accounting: { icon: Send, tone: "info" },
  expense_reviewed: { icon: FileCheck2, tone: "success" },
};

const toneStyles: Record<Tone, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  info: "bg-info/10 text-info border-info/30",
  muted: "bg-muted text-muted-foreground border-border",
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
};

const formatAmount = (n: number) =>
  Number(n).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  events: FundRequestEvent[];
  /** Código visible de una OT (p. ej. el código del encargo) a partir de su wo_id. */
  workOrderLabel?: (woId: string) => string | undefined;
  className?: string;
}

/**
 * Historial de una solicitud de fondos o de un gasto: qué pasó, quién lo hizo y cuándo.
 * El actor sale de la bitácora; si es NULL, lo hizo el sistema.
 */
export function FundRequestTimeline({ events, workOrderLabel, className }: Props) {
  const { t } = useTranslation();

  if (events.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t("fundRequestEvent.empty")}
      </p>
    );
  }

  return (
    <ol className={cn("space-y-3", className)}>
      {events.map((ev) => {
        const style = ACTION_STYLE[ev.action] ?? { icon: CircleDot, tone: "muted" as Tone };
        const Icon = style.icon;
        const actorName = ev.actor
          ? ev.actor.short_name || `${ev.actor.first_name ?? ""} ${ev.actor.last_name ?? ""}`.trim()
          : t("fundRequestEvent.system");
        const woCode = ev.wo_id && ev.entity === "work_order" ? workOrderLabel?.(ev.wo_id) : undefined;
        return (
          <li key={ev.event_id} className="flex gap-3" data-testid="fund-request-event">
            <span
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                toneStyles[style.tone],
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-medium">
                {t(`fundRequestEvent.actions.${ev.action}`, { defaultValue: ev.action })}
                {woCode && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{woCode}</span>
                )}
                {ev.amount != null && (
                  <span className="ml-2 font-mono text-xs">{formatAmount(ev.amount)} BOB</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("fundRequestEvent.by", { name: actorName })} · {formatDateTime(ev.created_at)}
              </p>
              {ev.notes && <p className="text-sm text-muted-foreground break-words">{ev.notes}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

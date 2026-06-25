import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { FundRequestStatus } from "@/hooks/useFundRequests";

const statusStyles: Record<FundRequestStatus, string> = {
  borrador: "bg-muted text-muted-foreground border-border",
  pendiente_aprobacion: "bg-warning/15 text-warning border-warning/30",
  aprobado_gerente: "bg-info/15 text-info border-info/30",
  observado: "bg-warning/10 text-warning border-warning/40",
  rechazado: "bg-destructive/15 text-destructive border-destructive/30",
  fondos_entregados: "bg-accent/15 text-accent-foreground border-accent/40",
  en_liquidacion: "bg-primary/10 text-primary border-primary/30",
  cerrado: "bg-success/15 text-success border-success/30",
  cancelado: "bg-muted text-muted-foreground border-border line-through",
};

interface Props {
  status: FundRequestStatus;
  className?: string;
}

export function FundRequestStatusBadge({ status, className }: Props) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status],
        className,
      )}
    >
      {t(`fundRequest.status.${status}`)}
    </span>
  );
}

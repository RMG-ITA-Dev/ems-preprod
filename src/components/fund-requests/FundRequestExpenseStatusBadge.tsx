import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { FundRequestExpenseStatus } from "@/hooks/useFundRequestExpenses";

const statusStyles: Record<FundRequestExpenseStatus, string> = {
  borrador: "bg-muted text-muted-foreground border-border",
  pendiente_aprobacion: "bg-warning/15 text-warning border-warning/30",
  aprobado_gerente: "bg-info/15 text-info border-info/30",
  observado: "bg-warning/10 text-warning border-warning/40",
  rechazado: "bg-destructive/15 text-destructive border-destructive/30",
  revisado_asistente: "bg-success/15 text-success border-success/30",
};

interface Props {
  status: FundRequestExpenseStatus;
  className?: string;
}

export function FundRequestExpenseStatusBadge({ status, className }: Props) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status],
        className,
      )}
    >
      {t(`fundRequestExpense.status.${status}`)}
    </span>
  );
}

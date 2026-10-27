import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { FUND_REQUEST_STEPS, fundRequestStepIndex } from "@/lib/fundRequest";

interface Props {
  status: string;
  className?: string;
}

/**
 * Línea de pasos de la solicitud (Fase 4.4): Solicitada → Aprobada → Desembolsada → Liquidada →
 * Cerrada, con el paso actual resaltado. Así el solicitante ve dónde está sin preguntar.
 * No se muestra para borradores ni canceladas, que no recorren el flujo.
 */
export function FundRequestProgress({ status, className }: Props) {
  const { t } = useTranslation();
  const current = fundRequestStepIndex(status);
  if (current === null) return null;

  return (
    <ol className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", className)} aria-label={t("fundRequest.progress.label")}>
      {FUND_REQUEST_STEPS.map((step, i) => {
        const done = i < current || (i === current && status === "cerrado");
        const active = i === current && status !== "cerrado";
        return (
          <li key={step} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium",
                done && "bg-success/10 text-success border-success/20",
                active && "bg-info/15 text-info border-info/30",
                !done && !active && "bg-muted text-muted-foreground border-border",
              )}
            >
              {done && <Check className="h-3 w-3" />}
              {t(`fundRequest.progress.steps.${step}`)}
            </span>
            {i < FUND_REQUEST_STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

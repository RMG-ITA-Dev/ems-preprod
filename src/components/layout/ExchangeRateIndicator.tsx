import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLatestExchangeRate } from "@/hooks/useExchangeRate";

function formatRate(value: number, locale: string): string {
  return value.toLocaleString(locale === "es" ? "es-BO" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatEffectiveDate(fechaVigencia: string): string {
  const [y, m, d] = fechaVigencia.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Navbar chip: purchase ("compra") rate always visible, with a Tooltip revealing venta/
 * fecha de vigencia/fuente/estado. Bug 0722-156 (Fase 1) — visual design approved on
 * feat/tc-ui (commit 920501d0), adapted per operator decision 2026-09-05: visible on every
 * breakpoint (not hidden on mobile) and the trigger is a focusable/tappable <button>, not a
 * bare <div>, so touch users can reach the tooltip detail too (the mockup's hover-only
 * trigger would have left it unreachable on mobile).
 *
 * Never throws: renders a compact translated "unavailable" state on error/empty instead of
 * propagating, since AppHeader is app-wide (incl. focusMode) — mirrors RunningTimerChip.
 */
export function ExchangeRateIndicator() {
  const { t, i18n } = useTranslation();
  const { data: rate, isLoading, isError } = useLatestExchangeRate();
  const [open, setOpen] = useState(false);

  if (isLoading) return null;

  if (isError || !rate) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
        <span>{t("header.exchangeRate.unavailable")}</span>
      </div>
    );
  }

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground cursor-default hover:bg-muted/60 transition-colors"
        >
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{t("header.exchangeRate.compra", { value: formatRate(rate.compra, i18n.language) })}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="space-y-0.5">
        <p className="text-xs">{t("header.exchangeRate.venta", { value: formatRate(rate.venta, i18n.language) })}</p>
        <p className="text-xs text-muted-foreground">
          {t("header.exchangeRate.effectiveDate", { date: formatEffectiveDate(rate.fecha_vigencia) })} · {rate.fuente}
        </p>
        <p className="text-xs text-muted-foreground">{t(`header.exchangeRate.status.${rate.estado}`)}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Phase 6 — persistent KPI strip (plan §5/§6): four cards on the
// dashboard KPI idiom. Values arrive raw and render zero-decimal
// (Math.round at the presentation layer only — the aggregation keeps
// full precision so totals don't drift). Basis tooltips hang off a REAL
// labeled info button with the repo's token focus ring — a card <div>
// as TooltipTrigger has no tab stop, so the explanation would be
// pointer-only (GPT-5.6 revalidation P3-01).

import { Clock, GraduationCap, Info, UserCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  tooltip?: string;
}

function KpiCard({ label, value, icon, tooltip }: KpiCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
            {tooltip && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={tooltip}
                    className="shrink-0 rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{tooltip}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="mt-1 text-right text-2xl font-bold font-mono text-foreground">
            {Math.round(value)}
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          {icon}
        </div>
      </div>
    </Card>
  );
}

export interface GapKpiStripProps {
  /** Σ max(gapFteDays, 0) ÷ window days — average unfilled seats (D-P6-16). */
  headcountGap: number;
  /** Σ max(gapHours, 0) over the window (D-P6-11). */
  hoursGap: number;
  /** The response's UNCAPPED deficitRowCount — never a count of the
   *  capped row list, which saturates at 500 (§2.6). */
  skillsUnderSupplied: number;
  benchCount: number;
}

export function GapKpiStrip({
  headcountGap,
  hoursGap,
  skillsUnderSupplied,
  benchCount,
}: GapKpiStripProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiCard
        label={t("scheduler.gaps.kpi.headcountGap")}
        value={headcountGap}
        icon={<Users className="h-4 w-4" />}
        tooltip={t("scheduler.gaps.headcountBasisTooltip")}
      />
      <KpiCard
        label={t("scheduler.gaps.kpi.hoursGap")}
        value={hoursGap}
        icon={<Clock className="h-4 w-4" />}
        tooltip={t("scheduler.gaps.hoursProjectionTooltip")}
      />
      <KpiCard
        label={t("scheduler.gaps.kpi.skillsUnderSupplied")}
        value={skillsUnderSupplied}
        icon={<GraduationCap className="h-4 w-4" />}
      />
      <KpiCard
        label={t("scheduler.gaps.kpi.bench")}
        value={benchCount}
        icon={<UserCheck className="h-4 w-4" />}
      />
    </div>
  );
}

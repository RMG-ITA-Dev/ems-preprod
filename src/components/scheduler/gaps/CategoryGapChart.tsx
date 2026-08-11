// Phase 6 — demand-vs-supply horizontal bar chart (plan §6). Recharts is
// an existing dependency (Sparkline / PersonalTab precedent). Colors are
// design tokens ONLY — no HEX in JSX: demand wears
// hsl(var(--muted-foreground)), supply hsl(var(--success)), and positive
// gaps get an hsl(var(--destructive)) accent label. One axis; series
// identity carried by the legend plus color, never color alone (the
// legend text is plain ink).

import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { gapLabel, type CategoryGapDatum } from "./gapChartLabel";

const DEMAND_COLOR = "hsl(var(--muted-foreground))";
const SUPPLY_COLOR = "hsl(var(--success))";

export interface CategoryGapChartProps {
  data: CategoryGapDatum[];
  /** i18n key content for the unit/basis tooltip on the chart header
   *  (headcountBasisTooltip or hoursProjectionTooltip — D-P6-16/11). */
  basisTooltip: string;
  title: string;
}

export function CategoryGapChart({ data, basisTooltip, title }: CategoryGapChartProps) {
  const { t } = useTranslation();
  const height = Math.max(160, data.length * 56 + 24);
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={basisTooltip}
              className="rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{basisTooltip}</TooltipContent>
        </Tooltip>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
            barGap={2}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="categoryName"
              width={110}
              tick={{ fontSize: 11, fill: DEMAND_COLOR }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              formatter={(value: number, name: string) => [
                String(Math.round(value)),
                name,
              ]}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Bar
              dataKey="demand"
              name={t("scheduler.gaps.table.demand")}
              fill={DEMAND_COLOR}
              radius={[0, 4, 4, 0]}
              barSize={12}
              isAnimationActive={false}
            />
            <Bar
              dataKey="supply"
              name={t("scheduler.gaps.table.supply")}
              fill={SUPPLY_COLOR}
              radius={[0, 4, 4, 0]}
              barSize={12}
              isAnimationActive={false}
            >
              <LabelList content={(p) => gapLabel({ ...p, data })} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: DEMAND_COLOR }}
            aria-hidden="true"
          />
          {t("scheduler.gaps.table.demand")}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: SUPPLY_COLOR }}
            aria-hidden="true"
          />
          {t("scheduler.gaps.table.supply")}
        </span>
      </div>
    </div>
  );
}

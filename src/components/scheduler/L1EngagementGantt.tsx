// Level-1 composition layer: engagement rows around GanttCanvas. Left
// rail: code (mono), name + client, status chip, staffing-health dot. Bar
// fill = engagement effective-state color. Click → L2.
//
// Fase 3 (plan v2 §1): el chip de estado y el color de barra usan el
// ESTADO EFECTIVO numérico (`engagement_status`, 1-9), reusando
// `engagementStateI18nKey`/`engagementStateBadgeClass` de
// `@/lib/engagementStatus.ts` (fuente de verdad de development) — nunca la
// columna legacy `status`.

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { engagementTaskType, type SchedulerZoom } from "@/lib/schedulerGantt";
import {
  engagementStateBadgeClass,
  engagementStateI18nKey,
  type EngagementState,
} from "@/lib/engagementStatus";
import type { SchedulerL1Row, StaffingHealth } from "@/hooks/scheduler/schedulerData";
import { GanttCanvas, type GanttCanvasRow, type GanttColumn } from "./GanttCanvas";
import { cn } from "@/lib/utils";

// Health dot tones (precedent: PendingHoursAlert).
const HEALTH_DOT_CLASS: Record<StaffingHealth, string> = {
  under: "bg-destructive",
  on_target: "bg-success",
  over: "bg-warning",
  unknown: "bg-muted-foreground/40",
};

const HEALTH_LABEL_KEY: Record<StaffingHealth, string> = {
  under: "scheduler.l1.healthUnder",
  on_target: "scheduler.l1.healthOnTarget",
  over: "scheduler.l1.healthOver",
  unknown: "scheduler.l1.healthUnknown",
};

interface L1EngagementGanttProps {
  rows: SchedulerL1Row[];
  from: string;
  to: string;
  zoom: SchedulerZoom;
}

export function L1EngagementGantt({ rows, from, to, zoom }: L1EngagementGanttProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const byId = useMemo(
    () => new Map(rows.map((r) => [r.engagement_id, r])),
    [rows]
  );

  // NULL-dated engagements never reach the client (excluded server-side),
  // so start/end are safe to assert here.
  const ganttRows = useMemo<GanttCanvasRow[]>(
    () =>
      rows
        .filter((r) => r.start_date && r.end_date)
        .map((r) => ({
          id: r.engagement_id,
          label: r.engagement_name,
          start: r.start_date!,
          end: r.end_date!,
          type: engagementTaskType(r.engagement_status as EngagementState | null),
        })),
    [rows]
  );

  const columns = useMemo<GanttColumn[]>(
    () => [
      {
        id: "engagement",
        header: t("scheduler.title"),
        flexgrow: 1,
        cell: ({ row }) => {
          const e = byId.get(String(row.id));
          if (!e) return null;
          const health = e.staffing_health;
          return (
            <div className="flex items-center gap-2 w-full min-w-0 pr-1">
              <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-28 truncate">
                {e.engagement_code ?? "—"}
              </span>
              {/* Semantic row action: Tab-reachable, Enter/Space drills into
                  L2 (SVAR bars are not tab stops). */}
              <button
                type="button"
                onClick={() => navigate(`/scheduler/engagement/${e.engagement_id}`)}
                className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                {e.engagement_name}
                {e.client_name && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    · {e.client_name}
                  </span>
                )}
              </button>
              {e.engagement_status != null && (
                <span
                  className={cn(
                    "shrink-0 rounded border px-1 py-0 text-[10px] leading-4",
                    engagementStateBadgeClass(e.engagement_status as EngagementState)
                  )}
                >
                  {t(engagementStateI18nKey(e.engagement_status as EngagementState))}
                </span>
              )}
              {/* Health is "active today" (server UTC) — tooltip says so,
                  because a user viewing a past/future window would
                  otherwise misread today's staffing as that period's. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
                      HEALTH_DOT_CLASS[health]
                    )}
                    aria-label={t(HEALTH_LABEL_KEY[health])}
                  />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-56">
                  <p className="text-xs font-medium">{t(HEALTH_LABEL_KEY[health])}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.assignment_count}/{e.demand_count || "—"} ·{" "}
                    {t("scheduler.l1.healthAsOfToday")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [byId, navigate, t]
  );

  const barTitle = useCallback(
    (id: string) => {
      const e = byId.get(id);
      if (!e) return undefined;
      const people = [e.partner_short_name, e.manager_short_name]
        .filter(Boolean)
        .join(" / ");
      return [
        `${e.assignment_count}/${e.demand_count || "—"} · ${t(HEALTH_LABEL_KEY[e.staffing_health])} (${t("scheduler.l1.healthAsOfToday")})`,
        people,
      ]
        .filter(Boolean)
        .join("\n");
    },
    [byId, t]
  );

  return (
    <GanttCanvas
      rows={ganttRows}
      columns={columns}
      from={from}
      to={to}
      zoom={zoom}
      readonly
      cellHeight={38}
      onBarOpen={(id) => navigate(`/scheduler/engagement/${id}`)}
      barTitle={barTitle}
    />
  );
}

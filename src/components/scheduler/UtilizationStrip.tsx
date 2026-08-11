// Phase 7b — Employee-Gantt total line (D-P7-18/D-P7-20): a pinned strip
// under the chart showing the target's TOTAL booking level per date
// stretch — under / properly / over-booked (metric 1a: summed
// allocation% vs 100; banding 2a: 90–110 tolerance). Bands arrive from
// the server computed over ALL segments (visible + hidden), so the line
// is TRUE for every viewer.
//
// EMS-OWNED overlay, the TodayLine precedent: SVAR's summary/rollup rows
// are excluded from the vendored bundle and one task = one row, so a
// multi-colored total row cannot be a Gantt task. Geometry reuses the
// pure dayStartOffsetPx mapping; the label gutter mirrors the grid
// pane's width and the band area mirrors the chart pane's scroll, both
// read from the vendor DOM inside the host (as TodayLine does).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays } from "date-fns";
import type { UtilizationBand } from "@/hooks/scheduler/schedulerData";
import {
  dayStartOffsetPx,
  toDateString,
  toLocalDate,
  utilizationLevel,
  ZOOM_CONFIG,
  type SchedulerZoom,
  type UtilizationLevel,
} from "@/lib/schedulerGantt";
import { cn } from "@/lib/utils";

const LEVEL_CLASS: Record<UtilizationLevel, string> = {
  under: "bg-warning/60 text-foreground",
  ok: "bg-success/60 text-foreground",
  over: "bg-destructive/70 text-destructive-foreground",
};

interface UtilizationStripProps {
  bands: UtilizationBand[];
  from: string;
  to: string;
  zoom: SchedulerZoom;
  /** staff.weekly_capacity_hours — tooltip context only (metric is 1a). */
  capacityHours: number | null;
  /** The wrapper around GanttCanvas — pane geometry is read inside it. */
  ganttHostRef: React.RefObject<HTMLDivElement>;
}

export function UtilizationStrip({
  bands,
  from,
  to,
  zoom,
  capacityHours,
  ganttHostRef,
}: UtilizationStripProps) {
  const { t } = useTranslation();
  const [gutterWidth, setGutterWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Mirror the vendor panes: gutter = grid width (0 in the compact chart
  // pane), band area translate = chart scrollLeft. Re-queried per
  // zoom/pane remount; ResizeObserver tracks grid resizes.
  const sync = useCallback(() => {
    const host = ganttHostRef.current;
    if (!host) return;
    const grid = host.querySelector<HTMLElement>(".wx-table-container");
    const chart = host.querySelector<HTMLElement>(".wx-chart");
    setGutterWidth(grid ? grid.getBoundingClientRect().width : 0);
    setScrollLeft(chart ? chart.scrollLeft : 0);
  }, [ganttHostRef]);

  // TodayLine's lifecycle discipline (PR #234 review P1): SVAR rebuilds
  // its internal DOM on theme swaps and data changes, so a one-shot bind
  // can leave the scroll listener on a DETACHED chart — bands would stop
  // following the scroll and sit under the wrong dates. A
  // MutationObserver re-locates `.wx-chart` and re-binds whenever the
  // vendor subtree changes; a ResizeObserver re-syncs the gutter.
  useEffect(() => {
    const host = ganttHostRef.current;
    if (!host) return;
    let chart: HTMLElement | null = null;
    const rebind = () => {
      const next = host.querySelector<HTMLElement>(".wx-chart");
      if (next !== chart) {
        chart?.removeEventListener("scroll", sync);
        chart = next;
        chart?.addEventListener("scroll", sync, { passive: true });
      }
      sync();
    };
    rebind();
    let mutations: MutationObserver | undefined;
    if (typeof MutationObserver !== "undefined") {
      mutations = new MutationObserver(rebind);
      mutations.observe(host, { childList: true, subtree: true });
    }
    let resize: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resize = new ResizeObserver(sync);
      resize.observe(host);
    }
    return () => {
      chart?.removeEventListener("scroll", sync);
      mutations?.disconnect();
      resize?.disconnect();
    };
  }, [sync, ganttHostRef]);

  const cellWidth = ZOOM_CONFIG[zoom].cellWidth;
  const positioned = useMemo(
    () =>
      bands.map((band) => {
        const left = Math.max(0, dayStartOffsetPx(zoom, from, band.start_date, cellWidth));
        const right = dayStartOffsetPx(
          zoom,
          from,
          toDateString(addDays(toLocalDate(band.end_date), 1)),
          cellWidth
        );
        const level = utilizationLevel(band.total_allocation_percent);
        return { band, left, width: Math.max(0, right - left), level };
      }),
    [bands, zoom, from, cellWidth]
  );
  const contentWidth = positioned.length
    ? Math.max(...positioned.map((p) => p.left + p.width))
    : 0;

  if (bands.length === 0) return null; // series unknown (schema window)

  return (
    <div
      className="flex h-6 shrink-0 items-stretch border-t border-border"
      data-testid="utilization-strip"
    >
      <div
        style={{ width: gutterWidth }}
        className="flex shrink-0 items-center truncate px-2 text-xs font-medium text-muted-foreground"
      >
        {t("scheduler.staff.total")}
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          className="relative h-full"
          style={{ width: contentWidth, transform: `translateX(${-scrollLeft}px)` }}
        >
          {positioned.map(({ band, left, width, level }) => {
            // Measured-fit labeling (PR #234 review P1): full "N%" when
            // it fits, bare "N" on narrow bands (the % unit stays in the
            // tooltip and aria-label), and only for slivers physically
            // smaller than a numeral (a 1-day band at quarters zoom is
            // ~3px) does the inline text disappear — the value remains
            // reachable via title and aria-label.
            const full = `${band.total_allocation_percent}%`;
            const compact = String(band.total_allocation_percent);
            const inline =
              width >= full.length * 6 + 6
                ? full
                : width >= compact.length * 6 + 6
                  ? compact
                  : "";
            return (
              <div
                key={band.start_date}
                role="img"
                aria-label={`${t(`scheduler.staff.utilization.${level}`)} — ${t("scheduler.staff.utilization.tooltip", { n: band.total_allocation_percent })}`}
                title={[
                  t(`scheduler.staff.utilization.${level}`),
                  t("scheduler.staff.utilization.tooltip", { n: band.total_allocation_percent }),
                  t("scheduler.staff.utilization.hours", { n: band.total_hours_per_week }) +
                    (capacityHours != null
                      ? ` / ${t("scheduler.staff.utilization.capacity", { n: capacityHours })}`
                      : ""),
                ].join("\n")}
                className={cn(
                  "absolute top-0 flex h-full items-center justify-center overflow-hidden whitespace-nowrap text-[10px] font-medium leading-none",
                  LEVEL_CLASS[level]
                )}
                style={{ left, width }}
              >
                {inline}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

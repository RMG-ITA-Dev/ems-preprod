// Phase 7 — Employee Gantt composition layer (plan §4): read-only
// engagement rows around GanttCanvas for ONE staff member — L2's D4 row
// model flipped. ONE ROW PER ASSIGNMENT SEGMENT, grouped by engagement;
// the group's first row carries the engagement identity, continuation
// rows the indent tick. Bars span the ASSIGNMENT dates and wear the
// engagement's status color (L1 convention). Everything navigates to the
// engagement's L2 — editing lives there (D-P7-5); returnTo state lets its
// Cancel come back here (D-P7-8).

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CornerDownRight } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  StaffTimelineSegmentRow,
  UtilizationBand,
} from "@/hooks/scheduler/schedulerData";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import { UtilizationStrip } from "./UtilizationStrip";
import { onwardReturnState, type ReturnNavState } from "@/lib/returnNav";
import {
  engagementTaskType,
  SVAR_COMPACT_THRESHOLD_PX,
  type SchedulerZoom,
} from "@/lib/schedulerGantt";
import { parseDateLocal } from "@/lib/timesheetUtils";
import {
  GanttCanvas,
  type GanttCanvasRow,
  type GanttColumn,
} from "./GanttCanvas";

interface StaffEngagementGanttProps {
  /** Server-ordered segments (engagement groups are contiguous, §1). */
  rows: StaffTimelineSegmentRow[];
  from: string;
  to: string;
  zoom: SchedulerZoom;
  /** Phase 7b (D-P7-18): server-computed total booking series. */
  utilization: UtilizationBand[];
  capacityHours: number | null;
  /** The page's captured Cancel chain (D-P7-17) — threaded through the
   *  L2 hop so the engagement page's Cancel can restore it. Must come
   *  from the page's mount-time capture, never read from location.state
   *  here (search-param navigations null it, D-P7-12). */
  returnNav: ReturnNavState | null;
}

export function StaffEngagementGantt({
  rows,
  from,
  to,
  zoom,
  utilization,
  capacityHours,
  returnNav,
}: StaffEngagementGanttProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // Compact composition (D-P7-11/D-P7-15; R2 review P1-01): below SVAR's
  // hardcoded 650px compact threshold the vendor COERCES displayMode
  // "all" → "grid", so dual panes are impossible — the flexible split
  // left a 0px-wide timeline. The intended vendor pattern is one pane at
  // a time with an app-provided toggle; the TIMELINE is this page's
  // purpose, so it is the compact default. The decision is made from the
  // CONTAINER width the Gantt actually occupies (ResizeObserver), never
  // the viewport: with the expanded sidebar and padding layers, a
  // 768–1000px viewport leaves a sub-650px host that a viewport
  // breakpoint calls "desktop". Verified across real layout widths by
  // tools/scheduler-fixture/assert-offline.mjs.
  const [hostRef, hostWidth] = useContainerWidth<HTMLDivElement>();
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const compact = hostWidth !== null && hostWidth <= SVAR_COMPACT_THRESHOLD_PX;
  const [compactPane, setCompactPane] = useState<"chart" | "grid">("chart");
  const displayMode = compact ? compactPane : "all";

  const rowById = useMemo(
    () => new Map(rows.map((r) => [r.assignment_id, r])),
    [rows]
  );

  // First row of each contiguous engagement group (server ordering §1).
  const firstOfGroup = useMemo(() => {
    const set = new Set<string>();
    let prev: string | null = null;
    for (const row of rows) {
      if (row.engagement_id !== prev) set.add(row.assignment_id);
      prev = row.engagement_id;
    }
    return set;
  }, [rows]);

  const openEngagement = useCallback(
    (engagementId: string) => {
      // The onward state carries this page's own captured chain
      // (D-P7-17) so the L2's Cancel restores it — otherwise the full
      // L2 → Employee → L2 → Cancel loop remounts this page with null
      // state and its next Cancel forgets the original caller.
      navigate(`/scheduler/engagement/${engagementId}`, {
        state: onwardReturnState(location.pathname + location.search, returnNav),
      });
    },
    [navigate, location.pathname, location.search, returnNav]
  );

  const ganttRows = useMemo<GanttCanvasRow[]>(
    () =>
      rows.map((row) => ({
        id: row.assignment_id,
        label: row.engagement_name,
        start: row.start_date,
        end: row.end_date,
        // D-P7-19: out-of-scope engagements wear purple, not status colors.
        type: row.out_of_scope
          ? "ems-out-of-scope"
          : engagementTaskType(row.engagement_status),
      })),
    [rows]
  );

  const columns = useMemo<GanttColumn[]>(
    () => [
      {
        id: "engagement",
        header: t("scheduler.staff.engagements"),
        flexgrow: 1,
        cell: ({ row: task }) => {
          const row = rowById.get(String(task.id));
          if (!row) return null;
          const isFirst = firstOfGroup.has(row.assignment_id);
          // dd/MM/yyyy per the repository-wide date rule (P1-08).
          const segmentDates = `${format(parseDateLocal(row.start_date), "dd/MM/yyyy")} → ${format(parseDateLocal(row.end_date), "dd/MM/yyyy")}`;
          // D-P7-19: out-of-scope rows are INFORMATIONAL — the viewer
          // cannot open that engagement's L2 (the preflight would 403),
          // so the label is a span, not a button, and shows the
          // engagement's manager instead of the client.
          if (row.out_of_scope) {
            return (
              <div
                className="flex w-full min-w-0 items-center gap-2 pr-1"
                title={t("scheduler.staff.outOfScope")}
              >
                {isFirst ? (
                  <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-brand-purple">
                    {row.engagement_code && (
                      <span className="mr-1 font-mono">{row.engagement_code}</span>
                    )}
                    {row.engagement_name}
                    {row.manager_name && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        · {t("scheduler.staff.managedBy", { name: row.manager_name })}
                      </span>
                    )}
                  </span>
                ) : (
                  <>
                    <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                    <span className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">
                      {segmentDates}
                    </span>
                  </>
                )}
              </div>
            );
          }
          return (
            <div className="flex w-full min-w-0 items-center gap-2 pr-1">
              {isFirst ? (
                // Tab-reachable equivalent of the bar (P1-05 pattern):
                // Enter/Space navigates to the engagement's L2.
                <button
                  type="button"
                  onClick={() => openEngagement(row.engagement_id)}
                  className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {row.engagement_code && (
                    <span className="mr-1 font-mono text-muted-foreground">
                      {row.engagement_code}
                    </span>
                  )}
                  {row.engagement_name}
                  {row.client_name && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      · {row.client_name}
                    </span>
                  )}
                </button>
              ) : (
                <>
                  {/* Continuation row of the same engagement group (D-P7-4). */}
                  <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                  <button
                    type="button"
                    onClick={() => openEngagement(row.engagement_id)}
                    className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    {segmentDates}
                  </button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [rowById, firstOfGroup, openEngagement, t]
  );

  const barTitle = useCallback(
    (id: string) => {
      const row = rowById.get(id);
      if (!row) return undefined;
      const segmentDates = `${format(parseDateLocal(row.start_date), "dd/MM/yyyy")} → ${format(parseDateLocal(row.end_date), "dd/MM/yyyy")}`;
      return [
        [row.engagement_code, row.engagement_name].filter(Boolean).join(" "),
        row.out_of_scope
          ? row.manager_name
            ? t("scheduler.staff.managedBy", { name: row.manager_name })
            : ""
          : row.client_name ?? "",
        segmentDates,
        `${t("scheduler.gantt.tooltip.hours", { n: row.hours_per_week })} · ${t("scheduler.gantt.tooltip.allocation", { n: row.allocation_percent })}`,
        row.out_of_scope ? t("scheduler.staff.outOfScope") : "",
      ]
        .filter(Boolean)
        .join("\n");
    },
    [rowById, t]
  );

  return (
    <div ref={hostRef} className="flex h-full min-h-0 flex-col gap-2">
      {compact && (
        <ToggleGroup
          type="single"
          size="sm"
          value={compactPane}
          onValueChange={(v) => v && setCompactPane(v as "chart" | "grid")}
          aria-label={t("scheduler.staff.title")}
        >
          <ToggleGroupItem value="chart">{t("scheduler.staff.timeline")}</ToggleGroupItem>
          <ToggleGroupItem value="grid">{t("scheduler.staff.engagements")}</ToggleGroupItem>
        </ToggleGroup>
      )}
      {/* Mount only after the first width measurement: committing to a
          composition before knowing the host width would let SVAR's
          compact coercion blank the timeline until the remount. */}
      {hostWidth !== null && (
        <div key={displayMode} className="flex min-h-0 flex-1 flex-col">
          <div ref={canvasWrapRef} className="min-h-0 flex-1">
            <GanttCanvas
            // SVAR applies displayMode/column configs at MOUNT — a
            // changed prop alone is ignored (verified by the offline
            // fixture), so pane switches (and the first width
            // measurement) must remount the canvas. In the compact
            // timeline pane the grid is dropped entirely
            // (columns={false}) — the vendor's compact-mode coercion
            // cannot resurrect a grid that has no columns, and the
            // timeline gets the full host width.
            key={displayMode}
            rows={ganttRows}
            columns={displayMode === "chart" ? false : columns}
            from={from}
            to={to}
            zoom={zoom}
            readonly
            cellHeight={34}
            displayMode={displayMode}
            onBarOpen={(id) => {
              const row = rowById.get(id);
              // D-P7-19: out-of-scope bars are informational only — the
              // viewer cannot open that engagement's L2.
              if (row && !row.out_of_scope) openEngagement(row.engagement_id);
            }}
            barTitle={barTitle}
          />
          </div>
          {/* Phase 7b (D-P7-18): the total line accompanies the TIMELINE
              panes; the list pane has no chart to align to. */}
          {displayMode !== "grid" && (
            <UtilizationStrip
              bands={utilization}
              from={from}
              to={to}
              zoom={zoom}
              capacityHours={capacityHours}
              ganttHostRef={canvasWrapRef}
            />
          )}
        </div>
      )}
    </div>
  );
}

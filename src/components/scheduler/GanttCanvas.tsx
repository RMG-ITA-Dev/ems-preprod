// Phase 4 — GanttCanvas: the SINGLE chokepoint for the vendored SVAR
// bundle (plan §1.4). No other module may import from ./vendor/ (ESLint
// no-restricted-imports boundary). L1EngagementGantt / L2StaffGantt feed
// EMS-shaped rows in; committed drag/resize changes come back out as
// yyyy-MM-dd strings — all date conversion happens here via
// src/lib/schedulerGantt (no one-day drift, §9).

import "./vendor/svar-gantt/svar-gantt.es.css"; // vendor first
import "./gantt-theme.css"; // EMS bridge second — wins ties
import { Gantt, Willow, WillowDark } from "./vendor/svar-gantt";
import type {
  GanttApi,
  GanttColumn,
  GanttTask,
  GanttUpdateTaskEvent,
} from "./vendor/svar-gantt";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  dateStringFromSvarEnd,
  svarEndFromDateString,
  toDateString,
  toLocalDate,
  weekendCellCss,
  ZOOM_CONFIG,
  zoomScalesFor,
  type SchedulerZoom,
} from "@/lib/schedulerGantt";
import { TodayLine } from "./TodayLine";

// The composition layers (L1/L2) consume vendor TYPES through this
// chokepoint — they never touch ./vendor/ directly (ESLint boundary).
export type { GanttColumn, GanttColumnCellProps } from "./vendor/svar-gantt";

export interface GanttCanvasRow {
  id: string;
  label: string;
  /** yyyy-MM-dd, INCLUSIVE — the EMS convention. */
  start: string;
  end: string;
  /** ems-* bar type (schedulerGantt.ts color logic → gantt-theme.css). */
  type: string;
  parent?: string;
  open?: boolean;
}

export interface GanttBarChange {
  id: string;
  start: string; // yyyy-MM-dd inclusive
  end: string; // yyyy-MM-dd inclusive
}

export interface GanttCanvasProps {
  rows: GanttCanvasRow[];
  /** false hides the left grid; otherwise EMS column configs (§5/§6). */
  columns?: false | GanttColumn[];
  from: string;
  to: string;
  zoom: SchedulerZoom;
  readonly?: boolean;
  cellHeight?: number;
  showToday?: boolean;
  /** Committed drag/resize (inProgress moves are ignored). The CALLER
   *  validates via engagementAssignments.ts before persisting (§7). */
  onBarCommit?: (change: GanttBarChange) => void;
  /** Click on a bar or Enter on a focused row (I-2). */
  onBarOpen?: (id: string) => void;
  /** Hover text per bar (I-1). Advisory only — the Sheet shows everything
   *  a tooltip shows (a11y floor: never hover-only). */
  barTitle?: (id: string) => string | undefined;
  /** Pane selection (Phase 7 D-P7-11). Below SVAR's hardcoded 650px
   *  compact threshold "all" is coerced to "grid" by the vendor — dual
   *  panes are impossible there, so mobile compositions must pick
   *  "chart" or "grid" explicitly. SVAR applies this at MOUNT: callers
   *  changing it must remount (key) the canvas. */
  displayMode?: "all" | "grid" | "chart";
}

// All EMS bar types known to gantt-theme.css.
export const EMS_TASK_TYPES = [
  "ems-status-active",
  "ems-status-pending",
  "ems-status-completed",
  "ems-status-cancelled",
  "ems-status-frozen",
  "ems-load-1",
  "ems-load-2",
  "ems-load-4",
  "ems-leader-manager",
  "ems-leader-firm",
  "ems-out-of-scope",
  "ems-neutral",
].map((id) => ({ id }));

const CLICK_DRAG_TOLERANCE_PX = 4;

// SVAR's setID prefixes STRING task ids with ":" in DOM data-id
// attributes (verified against the artifact); store-level event payloads
// carry the raw id. Strip the prefix when reading from the DOM.
const domTaskId = (raw: string) => (raw.startsWith(":") ? raw.slice(1) : raw);

export function GanttCanvas({
  rows,
  columns,
  from,
  to,
  zoom,
  readonly = false,
  cellHeight = 34,
  showToday = true,
  onBarCommit,
  onBarOpen,
  barTitle,
  displayMode = "all",
}: GanttCanvasProps) {
  const { resolvedTheme } = useTheme();
  const { i18n } = useTranslation();
  const localeCode = i18n.language?.startsWith("es") ? ("es" as const) : ("en" as const);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pointerDown = useRef<{ x: number; y: number; id: string } | null>(null);

  // SVAR invokes `init` ONCE per mount and never re-registers listeners
  // on prop updates — a closure captured at first render would go stale
  // and could rebuild drafts from outdated rows, silently reverting newer
  // Sheet edits on the next drag (PR #214 adversarial review P1-03).
  // Registration stays stable; the refs always point at the current
  // callbacks.
  const onBarCommitRef = useRef(onBarCommit);
  const onBarOpenRef = useRef(onBarOpen);
  useEffect(() => {
    onBarCommitRef.current = onBarCommit;
    onBarOpenRef.current = onBarOpen;
  });

  const tasks = useMemo<GanttTask[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        text: r.label,
        start: toLocalDate(r.start),
        end: svarEndFromDateString(r.end),
        type: r.type,
        ...(r.parent ? { parent: r.parent } : {}),
        ...(r.open !== undefined ? { open: r.open } : {}),
      })),
    [rows]
  );

  const zoomConfig = ZOOM_CONFIG[zoom];
  // Scale labels follow the active language (P1-08); geometry (cellWidth,
  // bottom unit) is locale-independent.
  const scales = useMemo(() => zoomScalesFor(zoom, localeCode), [zoom, localeCode]);

  const init = useCallback((api: GanttApi) => {
    // SVAR's own editor is excluded from the bundle; Enter/dbl-click
    // intent routes to the EMS Sheet instead (I-2).
    api.intercept("show-editor", (ev) => {
      onBarOpenRef.current?.(String(ev.id));
      return false;
    });
    api.on("update-task", (ev: GanttUpdateTaskEvent) => {
      if (ev.inProgress || !onBarCommitRef.current) return;
      const start = ev.task.start;
      const end = ev.task.end;
      if (!(start instanceof Date) || !(end instanceof Date)) return;
      onBarCommitRef.current({
        id: String(ev.id),
        start: toDateString(start),
        end: dateStringFromSvarEnd(end),
      });
    });
  }, []);

  // Click-vs-drag discrimination at the DOM level: a click (pointer
  // travel under the tolerance) opens the Sheet; larger travel is a
  // drag/resize and is handled by update-task.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const bar = (e.target as HTMLElement).closest<HTMLElement>(".wx-bar[data-id]");
    pointerDown.current = bar
      ? { x: e.clientX, y: e.clientY, id: domTaskId(bar.dataset.id!) }
      : null;
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const down = pointerDown.current;
      pointerDown.current = null;
      if (!down || !onBarOpen) return;
      if (
        Math.abs(e.clientX - down.x) <= CLICK_DRAG_TOLERANCE_PX &&
        Math.abs(e.clientY - down.y) <= CLICK_DRAG_TOLERANCE_PX
      ) {
        onBarOpen(down.id);
      }
    },
    [onBarOpen]
  );

  // SVAR owns the bar DOM, so hover text is applied by delegation: on
  // pointerover, stamp the native title from the caller's map.
  const handlePointerOver = useCallback(
    (e: React.PointerEvent) => {
      if (!barTitle) return;
      const bar = (e.target as HTMLElement).closest<HTMLElement>(".wx-bar[data-id]");
      if (!bar || bar.title) return;
      const title = barTitle(domTaskId(bar.dataset.id!));
      if (title) bar.title = title;
    },
    [barTitle]
  );

  const Theme = resolvedTheme === "dark" ? WillowDark : Willow;
  const refreshKey = [zoom, from, to, resolvedTheme, localeCode, rows.length].join("|");

  return (
    <div className="sch-gantt-host" ref={hostRef}>
      {/* fonts={false} always — and after transform T1 the CDN branch no
          longer exists in the artifact, so no prop mistake can reach a
          SVAR origin. */}
      <Theme fonts={false}>
        <div
          className="sch-gantt"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerOver={handlePointerOver}
        >
          <Gantt
            tasks={tasks}
            taskTypes={EMS_TASK_TYPES}
            columns={columns}
            scales={scales}
            start={toLocalDate(from)}
            end={svarEndFromDateString(to)}
            cellWidth={zoomConfig.cellWidth}
            cellHeight={cellHeight}
            scaleHeight={32}
            lengthUnit="day"
            durationUnit="day"
            readonly={readonly}
            zoom={false}
            autoScale={false}
            highlightTime={weekendCellCss}
            init={init}
            displayMode={displayMode}
          />
          {showToday && (
            <TodayLine
              hostRef={hostRef}
              zoom={zoom}
              from={from}
              to={to}
              refreshKey={refreshKey}
            />
          )}
        </div>
      </Theme>
    </div>
  );
}

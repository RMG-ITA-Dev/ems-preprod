// EMS adapter contract typings for the generated SVAR React Gantt bundle
// (Phase 4 plan §1.3). EMS-OWNED — not generated, not upstream's typings.
//
// Upstream `types/index.d.ts` imports @svar-ui/gantt-store types and is
// unusable standalone; its broad `on*` index signatures also let a
// misspelled event compile and silently never fire. This file instead
// declares ONLY the props and events `GanttCanvas` actually uses; each is
// exercised against the artifact by the offline browser fixture (drag,
// resize, readonly, theme, custom rendering, date mapping, init/api).
//
// Deliberately ABSENT from this contract:
//   - `markers` (Today line): PRO-only — the MIT store force-clears it.
//     The Today line is EMS-owned (TodayLine.tsx overlay).
//   - `splitTasks`: PRO-only — one row per assignment instead (plan D4).
//   - Editor / Toolbar / ContextMenu components: excluded from the bundle.
//
// The upstream typings remain available as audit material inside the
// committed tarball archive (tools/vendor/svar-gantt/tarballs/).

declare module "*/svar-gantt.es.js" {
  import type { FC, ReactNode } from "react";

  export type GanttTaskId = string | number;

  export interface GanttTask {
    id: GanttTaskId;
    /** Bar label (EMS renders its own cells; keep for tooltips/a11y). */
    text?: string;
    start: Date;
    end: Date;
    /** Matches a GanttTaskType id; styled via gantt-theme.css classes. */
    type?: string;
    parent?: GanttTaskId;
    open?: boolean;
    /** Hierarchical child rows (L2 staff groups). */
    data?: GanttTask[];
    /** EMS payload — carried through untouched by SVAR. */
    [extra: string]: unknown;
  }

  export interface GanttTaskType {
    id: string;
    label?: string;
  }

  export interface GanttScale {
    unit: "hour" | "day" | "week" | "month" | "quarter" | "year";
    step: number;
    format: string | ((date: Date) => string);
    /** css class getter per scale cell (weekend shading). */
    css?: (date: Date) => string;
  }

  export interface GanttColumnCellProps {
    row: GanttTask;
    column?: unknown;
    api?: unknown;
    onaction?: (ev: { action?: string; data?: Record<string, unknown> }) => void;
  }

  export interface GanttColumn {
    id: string;
    header?: string;
    width?: number;
    flexgrow?: number;
    align?: "left" | "center" | "right";
    cell?: FC<GanttColumnCellProps>;
  }

  /** `update-task` event payload (fires during and after drag/resize). */
  export interface GanttUpdateTaskEvent {
    id: GanttTaskId;
    task: Partial<GanttTask> & { [extra: string]: unknown };
    /** true while the pointer is still down; commit only when falsy. */
    inProgress?: boolean;
    eventSource?: string;
  }

  export interface GanttSelectTaskEvent {
    id: GanttTaskId;
    toggle?: boolean;
    show?: boolean;
  }

  /** Narrow slice of the SVAR api object the adapter consumes. */
  export interface GanttApi {
    on(action: "update-task", cb: (ev: GanttUpdateTaskEvent) => void): void;
    on(action: "select-task", cb: (ev: GanttSelectTaskEvent) => void): void;
    intercept(
      action: "show-editor",
      cb: (ev: { id: GanttTaskId }) => boolean | void
    ): void;
    intercept(
      action: "update-task",
      cb: (ev: GanttUpdateTaskEvent) => boolean | void
    ): void;
    exec(action: string, params?: Record<string, unknown>): Promise<unknown>;
    getState(): Record<string, unknown>;
  }

  export interface GanttProps {
    tasks?: GanttTask[];
    taskTypes?: GanttTaskType[];
    scales?: GanttScale[];
    /** false hides the left grid entirely. */
    columns?: false | GanttColumn[];
    start?: Date;
    end?: Date;
    cellWidth?: number;
    cellHeight?: number;
    scaleHeight?: number;
    readonly?: boolean;
    zoom?: boolean;
    autoScale?: boolean;
    lengthUnit?: "hour" | "day" | "week" | "month";
    durationUnit?: "hour" | "day";
    highlightTime?: (date: Date, unit: "day" | "hour") => string;
    init?: (api: GanttApi) => void;
    /**
     * Pane selection (present in the artifact: `displayMode: G3 = "all"`).
     * Below the vendor's hardcoded 650px compact threshold "all" is
     * COERCED to "grid" — dual panes are impossible there; the app must
     * choose "grid" or "chart" (Phase 7 D-P7-11 mobile composition).
     */
    displayMode?: "all" | "grid" | "chart";
  }

  export const Gantt: FC<GanttProps>;

  export interface GanttThemeProps {
    /** Always false in EMS; T1 removed the CDN branch from the artifact. */
    fonts?: boolean;
    children?: ReactNode;
  }

  export const Willow: FC<GanttThemeProps>;
  export const WillowDark: FC<GanttThemeProps>;
}

// Single typed entry to the vendored SVAR React Gantt bundle.
// GanttCanvas.tsx is the ONLY permitted importer (ESLint
// no-restricted-imports boundary). Types come from the EMS adapter
// contract in ./svar-gantt.d.ts — never from upstream typings.
export { Gantt, Willow, WillowDark } from "./svar-gantt.es.js";
export type {
  GanttApi,
  GanttColumn,
  GanttColumnCellProps,
  GanttProps,
  GanttScale,
  GanttSelectTaskEvent,
  GanttTask,
  GanttTaskId,
  GanttTaskType,
  GanttThemeProps,
  GanttUpdateTaskEvent,
} from "./svar-gantt.es.js";

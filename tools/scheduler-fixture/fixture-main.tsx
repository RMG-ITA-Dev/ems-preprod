// One-time offline runtime assertion + adapter contract fixture
// (plan §1.3 / §13.0d). Mounts GanttCanvas directly with fixture data —
// no auth, no backend — inside the real ThemeProvider + i18n + app CSS.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import "@/index.css";
import { ThemeProvider, useTheme } from "@/components/theme/ThemeProvider";
import { GanttCanvas, type GanttBarChange } from "@/components/scheduler/GanttCanvas";
import { StaffEngagementGantt } from "@/components/scheduler/StaffEngagementGantt";
import type { StaffTimelineSegmentRow } from "@/hooks/scheduler/schedulerData";
import { todayOffsetPx, toDateString, ZOOM_CONFIG, type SchedulerZoom } from "@/lib/schedulerGantt";
import { format, addDays, subDays } from "date-fns";

declare global {
  interface Window {
    __commits: Array<GanttBarChange & { v: number }>;
    __opens: string[];
    __fixture: {
      setZoom: (z: SchedulerZoom) => void;
      setReadonly: (r: boolean) => void;
      setDark: (d: boolean) => void;
      /** P1-03 proof: replaces the commit callback identity; a stale
       *  SVAR-registered closure would keep reporting the old version. */
      bumpVersion: () => void;
      expectedTodayOffset: (z: SchedulerZoom) => number | null;
      window: { from: string; to: string };
      /** Phase 7 (D-P7-11): drive the compact-mode pane selection the
       *  Employee Gantt uses below md, for the 390x844 assertions. */
      setDisplayMode: (mode: "all" | "grid" | "chart") => void;
      /** Phase 7 R2 (D-P7-15): mount the REAL StaffEngagementGantt inside
       *  a harness replicating the production width layers (sidebar +
       *  AppLayout main padding + page padding) so container-aware pane
       *  selection is asserted against real layout widths. null restores
       *  the plain GanttCanvas fixture. */
      setStaffLayout: (layout: { sidebar: number } | null) => void;
    };
  }
}

const today = new Date();
const from = toDateString(subDays(today, 45));
const to = toDateString(addDays(today, 120));

const ROWS = [
  { id: "a1", label: "Ana Alvarez", start: toDateString(subDays(today, 30)), end: toDateString(addDays(today, 30)), type: "ems-load-1" },
  { id: "a2", label: "Bruno Barrios", start: toDateString(subDays(today, 20)), end: toDateString(addDays(today, 10)), type: "ems-load-2" },
  // Multi-segment staff (D4 fixture): two non-overlapping rows.
  { id: "a3", label: "Carla Castro", start: toDateString(subDays(today, 40)), end: toDateString(subDays(today, 10)), type: "ems-leader-manager" },
  { id: "a4", label: "Carla Castro", start: toDateString(addDays(today, 5)), end: toDateString(addDays(today, 60)), type: "ems-leader-manager" },
  { id: "a5", label: "Diego Duran", start: toDateString(subDays(today, 5)), end: toDateString(addDays(today, 90)), type: "ems-leader-firm" },
];

window.__commits = [];
window.__opens = [];

// Phase 7 R2 (D-P7-15): segments for the REAL StaffEngagementGantt —
// two engagements, one with a continuation segment (D-P7-4 grouping),
// plus an OUT-OF-SCOPE purple context row (Phase 7b, D-P7-19).
const STAFF_ROWS: StaffTimelineSegmentRow[] = [
  // s1 starts AT the window origin so a bar is genuinely inside the
  // initial scroll view of even the narrowest pane.
  { assignment_id: "s1", engagement_id: "eng-1", start_date: toDateString(subDays(today, 45)), end_date: toDateString(addDays(today, 20)), hours_per_week: 40, allocation_percent: 100, status: "PROPOSED", engagement_code: "A-001", engagement_name: "Auditoría Uno", engagement_status: "active", client_name: "Cliente Uno", out_of_scope: false, manager_name: null },
  { assignment_id: "s2", engagement_id: "eng-1", start_date: toDateString(addDays(today, 30)), end_date: toDateString(addDays(today, 60)), hours_per_week: 20, allocation_percent: 50, status: "PROPOSED", engagement_code: "A-001", engagement_name: "Auditoría Uno", engagement_status: "active", client_name: "Cliente Uno", out_of_scope: false, manager_name: null },
  { assignment_id: "s3", engagement_id: "eng-2", start_date: toDateString(subDays(today, 10)), end_date: toDateString(addDays(today, 45)), hours_per_week: 40, allocation_percent: 100, status: "PROPOSED", engagement_code: null, engagement_name: "Consultoría Dos", engagement_status: "pending", client_name: null, out_of_scope: false, manager_name: null },
  { assignment_id: "s4", engagement_id: "eng-3", start_date: toDateString(subDays(today, 40)), end_date: toDateString(addDays(today, 10)), hours_per_week: 20, allocation_percent: 50, status: "PROPOSED", engagement_code: "X-777", engagement_name: "Encargo Ajeno", engagement_status: "active", client_name: null, out_of_scope: true, manager_name: "Abraham Mamani" },
];

// Phase 7b (D-P7-18): a band per level — under (amber), ok (green),
// over (red) — so every color is asserted in a real browser.
const STAFF_BANDS = [
  { start_date: from, end_date: toDateString(subDays(today, 21)), total_allocation_percent: 50, total_hours_per_week: 20 },
  { start_date: toDateString(subDays(today, 20)), end_date: toDateString(addDays(today, 20)), total_allocation_percent: 100, total_hours_per_week: 40 },
  { start_date: toDateString(addDays(today, 21)), end_date: to, total_allocation_percent: 150, total_hours_per_week: 60 },
];

/** Replicates the production width layers around the Employee Gantt:
 *  fixed sidebar + AppLayout main padding (24px) + page padding (24px).
 *  At a 768px viewport with the expanded 256px sidebar this leaves the
 *  416px host the R2 review measured. */
function StaffLayoutHarness({ sidebar }: { sidebar: number }) {
  return (
    <MemoryRouter initialEntries={["/scheduler/staff/s-1"]}>
      <div style={{ display: "flex", width: "100%", minHeight: "100vh" }} data-testid="staff-harness">
        {sidebar > 0 && <div style={{ width: sidebar, flexShrink: 0 }} />}
        <main style={{ flex: 1, minWidth: 0, padding: 24 }}>
          <div style={{ padding: 24, height: 560, display: "flex", flexDirection: "column" }}>
            <div style={{ minHeight: 0, flex: 1 }}>
              <StaffEngagementGantt
                rows={STAFF_ROWS}
                from={from}
                to={to}
                zoom="weeks"
                utilization={STAFF_BANDS}
                capacityHours={40}
                returnNav={null}
              />
            </div>
          </div>
        </main>
      </div>
    </MemoryRouter>
  );
}

function Fixture() {
  const [zoom, setZoom] = useState<SchedulerZoom>("weeks");
  const [readonly, setReadonly] = useState(false);
  const [version, setVersion] = useState(1);
  const [displayMode, setDisplayMode] = useState<"all" | "grid" | "chart">("all");
  const [staffLayout, setStaffLayout] = useState<{ sidebar: number } | null>(null);
  const { setTheme } = useTheme();
  window.__fixture = {
    setZoom,
    setReadonly,
    setDark: (d) => setTheme(d ? "dark" : "light"),
    bumpVersion: () => setVersion((v) => v + 1),
    expectedTodayOffset: (z) => todayOffsetPx(z, from, new Date(), ZOOM_CONFIG[z].cellWidth),
    window: { from, to },
    setDisplayMode,
    setStaffLayout,
  };
  if (staffLayout) {
    // key: fresh mount per scenario so useContainerWidth re-measures.
    return <StaffLayoutHarness key={staffLayout.sidebar} sidebar={staffLayout.sidebar} />;
  }
  return (
    <GanttCanvas
      // SVAR applies displayMode at MOUNT — mirror StaffEngagementGantt's
      // remount-on-pane-switch so the selection actually applies.
      key={displayMode}
      displayMode={displayMode}
      rows={ROWS}
      columns={displayMode === "chart" ? false : [
        {
          id: "who",
          header: "Staff",
          flexgrow: 1,
          // Semantic row action — the same mechanism L1/L2 use for the
          // keyboard a11y floor (P1-05): Tab-reachable, Enter/Space fires.
          cell: ({ row }) => (
            <button
              type="button"
              data-testid="ems-cell"
              onClick={() => window.__opens.push(`cell:${String(row.id)}`)}
            >
              {String(row.text ?? "")}
            </button>
          ),
        },
      ]}
      from={from}
      to={to}
      zoom={zoom}
      readonly={readonly}
      // A NEW closure identity every render — the adapter must always
      // invoke the CURRENT one, never the closure captured at init (P1-03).
      onBarCommit={(c) => window.__commits.push({ ...c, v: version })}
      onBarOpen={(id) => window.__opens.push(id)}
      barTitle={() => "fixture-title"}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <Fixture />
  </ThemeProvider>
);
console.log("fixture ready", format(today, "yyyy-MM-dd"));

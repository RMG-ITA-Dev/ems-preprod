// Level-2 composition layer: staff-assignment rows around GanttCanvas for
// ONE engagement.
//
// Fase 3 (plan v2 §2 — Decisión #1, L2 solo lectura): variante READ-ONLY.
// Se retiraron drag/resize commit, el menú "Edit"/"Delete", el hook de
// mutación `useSaveEngagementAssignments` y los validadores de escritura
// (`validateAssignmentDrafts`/`findStaffSegmentOverlap`, src/lib/
// engagementAssignments.ts) — todo eso es Fase 5 (ver contrato de handoff
// en docs/scheduler/scheduler-fase-3-integracion.md). Se conserva la
// composición de filas (una fila por assignment agrupada por staff),
// MatchDot (indicador de matching, solo lectura) y el menú de fila con
// "Open engagement"/"Employee Gantt".
//
// Row model: ONE ROW PER ASSIGNMENT, grouped by staff. Groups ordered
// leaders-first (categories.display_order ascending), then staff last
// name; the staff label (name, category, load dot) renders on the
// group's first row only; continuation rows show an indent tick.

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CornerDownRight, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  Category,
  Engagement,
  EngagementAssignmentRow,
  StaffWithSkills,
} from "@/hooks/useEmsData";
import { onwardReturnState, type ReturnNavState } from "@/lib/returnNav";
import { parseDateLocal } from "@/lib/timesheetUtils";
import {
  rankCandidateForCategory,
  type AggregatedRequirement,
  type MatchResult,
  type ProficiencyLevel,
  type StaffCandidate,
} from "@/lib/staffingMatch";
import { staffTaskType, type SchedulerZoom } from "@/lib/schedulerGantt";
import {
  GanttCanvas,
  type GanttCanvasRow,
  type GanttColumn,
} from "./GanttCanvas";
import { MatchDot } from "./MatchDot";
import { cn } from "@/lib/utils";

const VALID_LEVELS = new Set<string>(["Beginner", "Intermediate", "Advanced"]);

function toCandidate(staff: StaffWithSkills): StaffCandidate {
  return {
    staff_id: staff.staff_id,
    category_id: staff.category_id,
    skills: (staff.staff_skills ?? [])
      .filter((ss) => VALID_LEVELS.has(ss.proficiency_level))
      .map((ss) => ({
        skill_id: ss.skill_id,
        level: ss.proficiency_level as ProficiencyLevel,
      })),
  };
}

const LOAD_DOT_CLASS = (count: number) =>
  count >= 4
    ? "bg-destructive/80"
    : count >= 2
      ? "bg-warning/80"
      : count === 1
        ? "bg-success/80"
        : "bg-muted-foreground/40";

interface L2StaffGanttProps {
  engagement: Engagement;
  /** Rows to DISPLAY (may be narrowed by the page's category/search filters). */
  assignments: EngagementAssignmentRow[];
  staffOptions: StaffWithSkills[];
  categories: Category[];
  requirements: AggregatedRequirement[];
  /** staff_id → firmwide active engagement count. */
  loadByStaff: Map<string, number>;
  from: string;
  to: string;
  zoom: SchedulerZoom;
  /** The page's captured Cancel chain, threaded through the Employee-Gantt
   *  hop so its Cancel restores this L2's own caller. */
  returnNav: ReturnNavState | null;
}

export function L2StaffGantt({
  engagement,
  assignments,
  staffOptions,
  categories,
  requirements,
  loadByStaff,
  from,
  to,
  zoom,
  returnNav,
}: L2StaffGanttProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const openStaffGantt = useCallback(
    (staffId: string) => {
      navigate(`/scheduler/staff/${staffId}`, {
        state: onwardReturnState(location.pathname + location.search, returnNav),
      });
    },
    [navigate, location.pathname, location.search, returnNav]
  );

  const displayOrderByCategory = useMemo(
    () => new Map(categories.map((c) => [c.category_id, c.display_order])),
    [categories]
  );
  const staffById = useMemo(
    () => new Map(staffOptions.map((s) => [s.staff_id, s])),
    [staffOptions]
  );

  // Group by staff: leaders first (display_order of the STAFF's own
  // category — identity, not the assignment's role on this engagement),
  // then last name; segments by start_date with assignment_id tiebreaker.
  const orderedRows = useMemo(() => {
    const staffOrder = (row: EngagementAssignmentRow) => {
      const catId = row.staff?.category_id ?? row.category_id;
      return displayOrderByCategory.get(catId ?? "") ?? 99;
    };
    const staffName = (row: EngagementAssignmentRow) =>
      row.staff ? `${row.staff.last_name} ${row.staff.first_name}` : "";
    return [...assignments].sort((a, b) => {
      const oa = staffOrder(a);
      const ob = staffOrder(b);
      if (oa !== ob) return oa - ob;
      const na = staffName(a);
      const nb = staffName(b);
      if (na !== nb) return na.localeCompare(nb);
      if (a.staff_id !== b.staff_id) return a.staff_id.localeCompare(b.staff_id);
      if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1;
      return a.assignment_id.localeCompare(b.assignment_id);
    });
  }, [assignments, displayOrderByCategory]);

  const firstOfGroup = useMemo(() => {
    const set = new Set<string>();
    let prevStaff: string | null = null;
    for (const row of orderedRows) {
      if (row.staff_id !== prevStaff) set.add(row.assignment_id);
      prevStaff = row.staff_id;
    }
    return set;
  }, [orderedRows]);

  const rowById = useMemo(
    () => new Map(orderedRows.map((r) => [r.assignment_id, r])),
    [orderedRows]
  );

  const matchFor = useCallback(
    (row: EngagementAssignmentRow): MatchResult | null => {
      const staff = staffById.get(row.staff_id);
      // Assignments referencing inactive/absent staff → neutral dot.
      if (!staff) return null;
      return rankCandidateForCategory(toCandidate(staff), requirements, row.category_id);
    },
    [staffById, requirements]
  );

  const ganttRows = useMemo<GanttCanvasRow[]>(
    () =>
      orderedRows.map((row) => {
        const staffCatId = row.staff?.category_id ?? row.category_id;
        const displayOrder = displayOrderByCategory.get(staffCatId ?? "");
        return {
          id: row.assignment_id,
          label: row.staff ? `${row.staff.first_name} ${row.staff.last_name}` : "",
          start: row.start_date,
          end: row.end_date,
          type: staffTaskType(displayOrder, loadByStaff.get(row.staff_id)),
        };
      }),
    [orderedRows, displayOrderByCategory, loadByStaff]
  );

  const columns = useMemo<GanttColumn[]>(
    () => [
      {
        id: "staff",
        header: t("scheduler.l2.title"),
        flexgrow: 1,
        cell: ({ row: task }) => {
          const row = rowById.get(String(task.id));
          if (!row) return null;
          const isFirst = firstOfGroup.has(row.assignment_id);
          const load = loadByStaff.get(row.staff_id) ?? 0;
          // dd/MM/yyyy per the repository-wide date rule.
          const segmentDates = `${format(parseDateLocal(row.start_date), "dd/MM/yyyy")} → ${format(parseDateLocal(row.end_date), "dd/MM/yyyy")}`;
          return (
            <div className="flex w-full min-w-0 items-center gap-2 pr-1">
              {isFirst ? (
                <>
                  {/* Workload is not color-only: localized count in the
                      accessible name. */}
                  <span
                    role="img"
                    aria-label={t("scheduler.l2.workload", { n: load })}
                    title={t("scheduler.l2.workload", { n: load })}
                    className={cn(
                      "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
                      LOAD_DOT_CLASS(load)
                    )}
                  />
                  {/* The NAME opens the employee's cross-engagement Gantt. */}
                  <button
                    type="button"
                    onClick={() => openStaffGantt(row.staff_id)}
                    className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    {row.staff
                      ? `${row.staff.first_name} ${row.staff.last_name}`
                      : "—"}
                    {row.category?.category_name && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        · {row.category.category_name}
                      </span>
                    )}
                  </button>
                </>
              ) : (
                <>
                  {/* Continuation row of the same staff group — read-only:
                      plain text, no edit destination in this phase. */}
                  <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                  <span className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">
                    {segmentDates}
                  </span>
                </>
              )}
              <MatchDot result={matchFor(row)} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground"
                    aria-label={t("scheduler.actions.rowMenu")}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                {/* Solo navegación en esta fase — sin Edit/Delete (Fase 5). */}
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => navigate(`/engagements/${engagement.engagement_id}`)}
                  >
                    {t("scheduler.actions.openEngagement")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openStaffGantt(row.staff_id)}>
                    {t("scheduler.actions.openStaffGantt")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [rowById, firstOfGroup, loadByStaff, matchFor, openStaffGantt, navigate, engagement.engagement_id, t]
  );

  const barTitle = useCallback(
    (id: string) => {
      const row = rowById.get(id);
      if (!row) return undefined;
      const match = matchFor(row);
      const levelLabel = (level: ProficiencyLevel) =>
        t(`staff.competencies.levels.${level.toLowerCase()}`);
      const skillList = (skills: MatchResult["missing"]) =>
        skills.map((s) => `${s.skill_name} (${levelLabel(s.min_level)})`).join(", ");
      const lines = [
        row.staff ? `${row.staff.first_name} ${row.staff.last_name}` : "",
        row.category?.category_name ?? "",
        // Workload count travels with the tooltip too.
        t("scheduler.l2.workload", { n: loadByStaff.get(row.staff_id) ?? 0 }),
        `${t("scheduler.gantt.tooltip.hours", { n: row.hours_per_week })} · ${t("scheduler.gantt.tooltip.allocation", { n: row.allocation_percent })}`,
        match
          ? t(`engagement.assignments.match.${match.tier === "category_only" ? "categoryOnly" : match.tier}`)
          : t("engagement.assignments.match.noRequirement"),
      ];
      if (match?.tier === "none") {
        lines.push(t("engagement.assignments.match.categoryMismatch"));
      }
      if (match && match.missing.length > 0) {
        lines.push(
          t("engagement.assignments.match.missingSkills", { list: skillList(match.missing) })
        );
      }
      if (match && match.belowLevel.length > 0) {
        lines.push(
          t("engagement.assignments.match.belowLevel", { list: skillList(match.belowLevel) })
        );
      }
      return lines.filter(Boolean).join("\n");
    },
    [rowById, matchFor, loadByStaff, t]
  );

  return (
    <GanttCanvas
      rows={ganttRows}
      columns={columns}
      from={from}
      to={to}
      zoom={zoom}
      readonly
      cellHeight={34}
      barTitle={barTitle}
    />
  );
}

// Level-2 composition layer: staff-assignment rows around GanttCanvas for
// ONE engagement.
//
// Fase 5 (bugs/scheduler/fase_5/plan_v2.md §5, Decisión #1): superficie de
// escritura vía Sheet/menú — click en la barra abre el Sheet; menú de fila
// con "Edit"/"Delete", ambos gated por `canWrite`, también abren el Sheet
// (el borrado vive en el footer del Sheet, no se duplica lógica de
// soft-delete aquí).
//
// Fase 5 (bugs/scheduler/fase_5/plan_v2.md §5, Decisión #1 — guardia de drag/resize): el canvas
// se habilitó tras demostrar el rollback transaccional completo (ver
// L2StaffGantt.dragResize.test.tsx) — handleBarCommit valida contra `allAssignments` (nunca la
// vista filtrada), aplica el cambio optimista SOLO sobre la key exacta viewer-scoped, y en fallo
// restaura la caché y remonta el canvas (resetNonce). `readonly` ahora refleja
// `!canWrite || isSaving`; RLS/RPC siguen siendo la autoridad final.
//
// Row model: ONE ROW PER ASSIGNMENT, grouped by staff. Groups ordered
// leaders-first (categories.display_order ascending), then staff last
// name; the staff label (name, category, load dot) renders on the
// group's first row only; continuation rows show an indent tick.

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CornerDownRight, MoreVertical } from "lucide-react";
import { toast } from "sonner";
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
import { useAuth } from "@/hooks/useAuth";
import { useSaveEngagementAssignments } from "@/hooks/mutations";
import { onwardReturnState, type ReturnNavState } from "@/lib/returnNav";
import { parseDateLocal } from "@/lib/timesheetUtils";
import {
  findOutOfEngagementRangeKeys,
  findStaffSegmentOverlap,
  validateAssignmentDrafts,
  type AssignmentDraft,
} from "@/lib/engagementAssignments";
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
  type GanttBarChange,
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
  /** Snapshot COMPLETO (no la vista filtrada) — el commit de drag/resize valida overlap contra
   *  esto, igual que AssignmentSheet (issue/plan §9). */
  allAssignments: EngagementAssignmentRow[];
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
  /** Fase 5 — mirror del D5 write rule (is_engagement_responsible). Gates the row menu's
   *  Edit/Delete items; RLS/RPC remain the real authority. */
  canWrite: boolean;
  /** Fase 5 — clicking a bar (or the row menu) opens the Sheet. null row would mean "add", but
   *  this component only ever opens existing rows — "+ Agregar staff" lives on the page. */
  onOpenSheet: (row: EngagementAssignmentRow) => void;
}

export function L2StaffGantt({
  engagement,
  assignments,
  allAssignments,
  staffOptions,
  categories,
  requirements,
  loadByStaff,
  from,
  to,
  zoom,
  returnNav,
  canWrite,
  onOpenSheet,
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

  // Fase 5 — drag/resize commit: key EXACTA viewer-scoped (igual a
  // useEngagementAssignments) para que el optimismo/rollback nunca toque la
  // caché de otro viewer.
  const { user } = useAuth();
  const viewerId = user?.id;
  const queryClient = useQueryClient();
  const { saveAssignments, isSaving } = useSaveEngagementAssignments();
  const assignmentsKey = useMemo(
    () => ["engagementAssignments", viewerId, engagement.engagement_id] as const,
    [viewerId, engagement.engagement_id]
  );
  // Incrementa en cada aborto/rollback para remontar el canvas (nueva key) y
  // descartar la posición interna de SVAR — nunca en éxito.
  const [resetNonce, setResetNonce] = useState(0);
  // Cierra la ventana entre un commit y el próximo render con isSaving=true.
  const commitInFlightRef = useRef(false);
  const allAssignmentsById = useMemo(
    () => new Map(allAssignments.map((r) => [r.assignment_id, r])),
    [allAssignments]
  );

  const handleBarCommit = useCallback(
    async ({ id, start, end }: GanttBarChange) => {
      if (!canWrite || isSaving || commitInFlightRef.current) return;
      const row = allAssignmentsById.get(id);
      const snapshot = queryClient.getQueryData<EngagementAssignmentRow[]>(assignmentsKey);
      if (!viewerId || !row || !snapshot) {
        setResetNonce((n) => n + 1);
        toast.error(t("scheduler.errors.partialSave"));
        return;
      }

      const draft: AssignmentDraft = {
        key: row.assignment_id,
        assignment_id: row.assignment_id,
        staff_id: row.staff_id,
        category_id: row.category_id,
        start_date: start,
        end_date: end,
        hours_per_week: row.hours_per_week,
        allocation_percent: row.allocation_percent,
        notes: row.notes ?? "",
      };

      const validation = validateAssignmentDrafts([draft]);
      if (!validation.valid) {
        toast.error(
          t(
            validation.badDates.size > 0
              ? "engagement.assignments.errors.dateRange"
              : "scheduler.errors.partialSave"
          )
        );
        setResetNonce((n) => n + 1);
        return;
      }
      // O4 — el drag/resize tampoco puede dejar el segmento fuera del rango del Engagement (la
      // RPC lo re-valida como EAS_ENGAGEMENT_RANGE de todas formas).
      if (findOutOfEngagementRangeKeys([draft], engagement.start_date, engagement.end_date).size > 0) {
        toast.error(t("engagement.assignments.errors.outOfEngagementRange"));
        setResetNonce((n) => n + 1);
        return;
      }
      // Overlap contra el snapshot COMPLETO — una fila oculta por el filtro de la página igual
      // cuenta (issue/plan §9).
      if (findStaffSegmentOverlap(draft, allAssignments)) {
        toast.error(t("scheduler.errors.overlap"));
        setResetNonce((n) => n + 1);
        return;
      }

      commitInFlightRef.current = true;
      queryClient.setQueryData<EngagementAssignmentRow[]>(assignmentsKey, (prev) =>
        (prev ?? snapshot).map((r) =>
          r.assignment_id === row.assignment_id
            ? { ...r, start_date: start, end_date: end }
            : r
        )
      );
      try {
        await saveAssignments({
          engagementId: engagement.engagement_id,
          current: [draft],
          original: allAssignments,
          deletedIds: [],
        });
        // Éxito: las fechas optimistas se mantienen; la invalidación central (onSettled del hook)
        // reconcilia con la respuesta del servidor. Sin resetNonce — el canvas no remonta.
      } catch {
        // El hook central ya mostró su propio toast (mapeo EAS_* o el manejador centralizado) —
        // acá solo se restaura la caché exacta y se remonta el canvas para descartar la posición
        // interna de SVAR.
        queryClient.setQueryData(assignmentsKey, snapshot);
        setResetNonce((n) => n + 1);
      } finally {
        commitInFlightRef.current = false;
      }
    },
    [
      canWrite,
      isSaving,
      allAssignmentsById,
      queryClient,
      assignmentsKey,
      viewerId,
      allAssignments,
      saveAssignments,
      engagement.engagement_id,
      engagement.start_date,
      engagement.end_date,
      t,
    ]
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
                <DropdownMenuContent align="end">
                  {canWrite && (
                    <>
                      <DropdownMenuItem onClick={() => onOpenSheet(row)}>
                        {t("scheduler.actions.edit")}
                      </DropdownMenuItem>
                      {/* Delete lives in the Sheet's own confirmed footer action — no
                          duplicated soft-delete logic here (issue: "evitar lógica duplicada"). */}
                      <DropdownMenuItem onClick={() => onOpenSheet(row)}>
                        {t("scheduler.actions.delete")}
                      </DropdownMenuItem>
                    </>
                  )}
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
    [rowById, firstOfGroup, loadByStaff, matchFor, openStaffGantt, navigate, engagement.engagement_id, t, canWrite, onOpenSheet]
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

  const handleBarOpen = useCallback(
    (id: string) => {
      const row = rowById.get(id);
      if (row) onOpenSheet(row);
    },
    [rowById, onOpenSheet]
  );

  return (
    <GanttCanvas
      // Fase 5: remonta SOLO en aborto/rollback (resetNonce) — descarta la posición interna de
      // SVAR tras un commit rechazado, nunca en un guardado exitoso.
      key={`gantt-${resetNonce}`}
      rows={ganttRows}
      columns={columns}
      from={from}
      to={to}
      zoom={zoom}
      // canWrite gatea el permiso; isSaving bloquea nuevos movimientos mientras un commit está en
      // curso. RLS/RPC siguen siendo la autoridad final (un EAS_DENIED revierte igual).
      readonly={!canWrite || isSaving}
      cellHeight={34}
      barTitle={barTitle}
      onBarOpen={handleBarOpen}
      onBarCommit={handleBarCommit}
    />
  );
}

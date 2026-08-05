// Scheduler Level 2: engagement staffing Gantt. Thin wrapper: role gate +
// URL state + the six data hooks; L2StaffGantt composes the grouped rows.
//
// Fase 5 (bugs/scheduler/fase_5/plan_v2.md §5): superficie de escritura
// completa vía AssignmentSheet — botón "+ Agregar staff", atajo de teclado
// "n" (ignorado con foco en un control de formulario), y
// usePageLeaveLock/LeavePageDialog para no perder ediciones del Sheet al
// navegar fuera. `canWrite` ahora GATEA controles reales (antes solo
// informaba la nota "solo lectura"): espeja `is_engagement_responsible`
// exacto (admin OR responsable estructural), sin el caso "senior con
// assignment propio" (Decisión #2 del operador — RLS/RPC no lo autoriza).
//
// Fase 3 (plan v2 §3, issue §11): las categorías se resuelven por el
// SERVICIO del engagement (services.code === engagement.practica), nunca
// como lista global sin contexto — practica IS NULL se trata como "sin
// scope" (todas las categorías), igual que el resto de development.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Plus } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { canWriteEngagementAssignments } from "@/lib/schedulerAssignmentAuthz";
import {
  useActiveStaffWithSkills,
  useCategories,
  useEngagementAggregatedRequirements,
  useEngagementAssignments,
  useEngagements,
  useServices,
  type EngagementAssignmentRow,
} from "@/hooks/useEmsData";
import { useStaffFirmwideAssignmentCounts } from "@/hooks/scheduler/useStaffFirmwideAssignmentCounts";
import {
  SchedulerDataError,
  SchedulerUnavailableError,
} from "@/hooks/scheduler/schedulerData";
import { isSchedulerZoom, type SchedulerZoom } from "@/lib/schedulerGantt";
import { captureReturnNav } from "@/lib/returnNav";
import { AUDITORIA_SERVICE_CODE } from "@/lib/engagementAssignments";
import { L2StaffGantt } from "@/components/scheduler/L2StaffGantt";
import { AssignmentSheet } from "@/components/scheduler/AssignmentSheet";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import { format, addYears, subYears } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";

// Foco en un control de formulario -> el atajo "n" no debe interceptar la tecla (issue: no
// robarle "n" a un campo de texto/búsqueda).
function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

const ALL_CATEGORIES = "__all__"; // Radix Select sentinel

const SchedulerL2 = () => {
  const { t } = useTranslation();
  const { id: engagementId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Captured ONCE on mount: the zoom/search/category setSearchParams(...,
  // { replace: true }) calls create replacement locations with
  // state:null — reading location.state at Cancel time would lose an
  // Employee-Gantt caller after any of them.
  const [returnNav] = useState(() => captureReturnNav(location.state));

  const { isAdmin, isPartner, isDirector, isManager, isSenior } = useUserRole();
  const canView = isAdmin || isPartner || isDirector || isManager || isSenior;
  const { staffRecord } = useCurrentStaff();

  const [searchParams, setSearchParams] = useSearchParams();
  const zoomParam = searchParams.get("zoom");
  const zoom: SchedulerZoom = isSchedulerZoom(zoomParam) ? zoomParam : "months";
  const search = searchParams.get("q") ?? "";
  const categoryFilter = searchParams.get("category") ?? "";

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // scheduler-staff-load doubles as the L2 AUTHORIZATION PREFLIGHT: the
  // server verifies the caller may view THIS engagement under the D5
  // rules before any engagement-scoped PostgREST query runs, and a
  // 403/404/Unavailable outcome is terminal — no schedule renders.
  const loadQuery = useStaffFirmwideAssignmentCounts(engagementId);
  const authorizedEngagementId = loadQuery.isSuccess ? engagementId : undefined;

  // The data hooks. The PostgREST hooks already swallow schema-not-ready;
  // anything else must SURFACE — an ignored assignment failure would
  // render as "no assignments" and an ignored requirements failure as
  // fake-neutral match dots.
  const engagementsQuery = useEngagements();
  const engagements = engagementsQuery.data;
  const engagement = useMemo(
    () => (engagements ?? []).find((e) => e.engagement_id === engagementId),
    [engagements, engagementId]
  );
  const assignmentsQuery = useEngagementAssignments(authorizedEngagementId);
  const assignments = assignmentsQuery.data;
  const requirementsQuery = useEngagementAggregatedRequirements(authorizedEngagementId);
  const requirements = requirementsQuery.data;
  const staffQuery = useActiveStaffWithSkills();
  const staffOptions = staffQuery.data;
  const servicesQuery = useServices();
  const services = servicesQuery.data;
  // Categorías por SERVICIO del engagement (issue §11). O6 (CERRADA) prohíbe el fallback "sin
  // scope: todas las categorías": practica nula o sin match resuelve a Auditoría, igual que el
  // backfill de la migración de convergencia — nunca al catálogo global (review de Fase 5 #M1).
  const engagementServiceId = useMemo(() => {
    if (!services) return undefined;
    return (
      services.find((s) => s.code === engagement?.practica)?.service_id ??
      services.find((s) => s.code === AUDITORIA_SERVICE_CODE)?.service_id
    );
  }, [services, engagement?.practica]);
  const categoriesQuery = useCategories(engagementServiceId);
  // "Resuelto" solo si además se encontró un service_id real (match directo o Auditoría) — nunca
  // se cae al resultado sin filtrar de useCategories(undefined) como catálogo mostrado.
  const categories = engagementServiceId !== undefined ? categoriesQuery.data : undefined;

  const dataQueries = [
    engagementsQuery,
    assignmentsQuery,
    requirementsQuery,
    staffQuery,
    servicesQuery,
    categoriesQuery,
  ];
  const dataError = dataQueries.some((q) => q.isError);
  // The first usable render waits for ALL queries: requirements can
  // legitimately finish after assignments (it makes two sequential
  // PostgREST calls), and rendering early would show fake-neutral match
  // dots and an incomplete picker. Disabled (not yet authorized) queries
  // report isLoading=false, so the preflight gating is unaffected.
  const isLoading = dataQueries.some((q) => q.isLoading);
  const retryDataQueries = useCallback(() => {
    for (const q of dataQueries) if (q.isError) void q.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagementsQuery, assignmentsQuery, requirementsQuery, staffQuery, servicesQuery, categoriesQuery]);

  const loadByStaff = useMemo(
    () =>
      new Map(
        (loadQuery.data?.rows ?? []).map((r) => [r.staff_id, r.active_engagement_count])
      ),
    [loadQuery.data]
  );

  // Fase 5 — mirror EXACTO de is_engagement_responsible: admin OR el caller es manager/partner/
  // sqr/encargado/specialist_it/specialist_tax del engagement. Gatea controles reales; RLS/RPC
  // siguen siendo la autoridad (un EAS_DENIED se maneja si la responsabilidad cambió entre el
  // render y el guardado).
  const myStaffId = staffRecord?.staff_id ?? null;
  const canWrite = canWriteEngagementAssignments({
    isAdmin,
    myStaffId,
    responsibleStaffIds: engagement
      ? [
          engagement.manager_id,
          engagement.partner_id,
          engagement.sqr_id,
          engagement.encargado_id,
          engagement.specialist_it_id,
          engagement.specialist_tax_id,
        ]
      : [],
  });

  // Snapshot COMPLETO (no la vista filtrada por categoría/búsqueda) — el Sheet valida overlap
  // contra esto, nunca contra `filteredAssignments`.
  const allAssignments = assignments ?? [];

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetRow, setSheetRow] = useState<EngagementAssignmentRow | null>(null);
  const [sheetDirty, setSheetDirty] = useState(false);
  const { blocker } = usePageLeaveLock({ locked: sheetDirty, isDirty: sheetDirty });

  const openAddSheet = useCallback(() => {
    if (!canWrite) return;
    setSheetRow(null);
    setSheetOpen(true);
  }, [canWrite]);
  const openEditSheet = useCallback((row: EngagementAssignmentRow) => {
    setSheetRow(row);
    setSheetOpen(true);
  }, []);

  // Atajo "n": abre "+ Agregar staff" — ignorado con foco en un control de formulario.
  useEffect(() => {
    if (!canWrite) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;
      e.preventDefault();
      openAddSheet();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canWrite, openAddSheet]);

  const filteredAssignments = useMemo(() => {
    let rows = assignments ?? [];
    if (categoryFilter) {
      rows = rows.filter((r) => r.category_id === categoryFilter);
    }
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter((r) =>
        r.staff
          ? `${r.staff.first_name} ${r.staff.last_name}`.toLowerCase().includes(needle)
          : false
      );
    }
    return rows;
  }, [assignments, categoryFilter, search]);

  // L2 window: engagement start→end clipped ±1 year.
  const window_ = useMemo(() => {
    const today = new Date();
    const min = subYears(today, 1);
    const max = addYears(today, 1);
    let from = engagement?.start_date ? parseDateLocal(engagement.start_date) : min;
    let to = engagement?.end_date ? parseDateLocal(engagement.end_date) : max;
    if (from < min) from = min;
    if (to > max) to = max;
    if (from >= to) return { from: format(min, "yyyy-MM-dd"), to: format(max, "yyyy-MM-dd") };
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }, [engagement?.start_date, engagement?.end_date]);

  // Terminal preflight outcomes: a denied, missing, unavailable, or
  // failed authorization NEVER renders the schedule.
  const preflightDenied =
    loadQuery.error instanceof SchedulerDataError &&
    (loadQuery.error.code === "forbidden" || loadQuery.error.code === "not_found");
  const preflightUnavailable = loadQuery.error instanceof SchedulerUnavailableError;

  return (
    <AppLayout>
      <div className="flex h-full flex-col gap-3 p-4 md:p-6">
        {/* Return to the caller. Gray Cancel button, no back-arrow icon.
            Rendered above the conditional so it is present in every state
            — incl. error/forbidden/unavailable — where the user would
            otherwise be stuck. An Employee-Gantt caller passes
            state.returnTo so Cancel goes back there; the default stays
            the L1 Gantt. */}
        <Button
          variant="cancel"
          size="sm"
          className="w-fit self-start"
          onClick={() =>
            navigate(returnNav?.returnTo ?? "/scheduler", {
              state: returnNav?.returnState ?? null,
            })
          }
        >
          {t("common.cancel")}
        </Button>
        {!canView || preflightDenied ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("scheduler.errors.forbidden")}</AlertDescription>
          </Alert>
        ) : preflightUnavailable ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("scheduler.errors.unavailable")}</AlertDescription>
          </Alert>
        ) : loadQuery.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              {t("scheduler.errors.loadFailed")}
              <Button variant="outline" size="sm" onClick={() => loadQuery.refetch()}>
                {t("scheduler.errors.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : dataError ? (
          // A failed PostgREST query is an ERROR, never an empty schedule
          // or neutral match dots.
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              {t("scheduler.errors.loadFailed")}
              <Button variant="outline" size="sm" onClick={retryDataQueries}>
                {t("scheduler.errors.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : loadQuery.isLoading || isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-72" />
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : !engagement ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("scheduler.errors.loadFailed")}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">
                  {engagement.engagement_code && (
                    <span className="mr-2 font-mono text-base text-muted-foreground">
                      {engagement.engagement_code}
                    </span>
                  )}
                  {engagement.engagement_name}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("scheduler.l2.title")}
                  {engagement.client?.client_legal_name &&
                    ` · ${engagement.client.client_legal_name}`}
                  {engagement.start_date &&
                    engagement.end_date &&
                    // dd/MM/yyyy per the repository-wide rule.
                    ` · ${format(parseDateLocal(engagement.start_date), "dd/MM/yyyy")} → ${format(parseDateLocal(engagement.end_date), "dd/MM/yyyy")}`}
                  {/* Fase 5: la nota "solo lectura" ahora refleja el mirror real — RLS/RPC
                      siguen siendo la autoridad final. */}
                  {!canWrite && ` · ${t("scheduler.readOnly")}`}
                </p>
              </div>
              {canWrite && (
                <Button size="sm" onClick={openAddSheet}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("scheduler.l2.addStaff")}
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                size="sm"
                value={zoom}
                onValueChange={(v) => v && setParam("zoom", v)}
                aria-label={t("scheduler.title")}
              >
                <ToggleGroupItem value="weeks">{t("scheduler.gantt.zoom.weeks")}</ToggleGroupItem>
                <ToggleGroupItem value="months">{t("scheduler.gantt.zoom.months")}</ToggleGroupItem>
                <ToggleGroupItem value="quarters">{t("scheduler.gantt.zoom.quarters")}</ToggleGroupItem>
              </ToggleGroup>
              <Input
                value={search}
                onChange={(e) => setParam("q", e.target.value)}
                placeholder={t("engagement.assignments.searchStaff")}
                className="h-8 w-48"
              />
              <Select
                value={categoryFilter || ALL_CATEGORIES}
                onValueChange={(v) => setParam("category", v === ALL_CATEGORIES ? "" : v)}
              >
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder={t("engagement.assignments.category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CATEGORIES}>{t("common.allStatus")}</SelectItem>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c.category_id} value={c.category_id}>
                      {c.category_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filteredAssignments.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {t("engagement.assignments.empty")}
              </p>
            ) : (
              <div className="min-h-0 flex-1">
                <L2StaffGantt
                  engagement={engagement}
                  assignments={filteredAssignments}
                  allAssignments={allAssignments}
                  staffOptions={staffOptions ?? []}
                  categories={categories ?? []}
                  requirements={requirements ?? []}
                  loadByStaff={loadByStaff}
                  from={window_.from}
                  to={window_.to}
                  zoom={zoom}
                  returnNav={returnNav}
                  canWrite={canWrite}
                  onOpenSheet={openEditSheet}
                />
              </div>
            )}

            <AssignmentSheet
              engagement={engagement}
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              row={sheetRow}
              canWrite={canWrite}
              requirements={requirements ?? []}
              staffOptions={staffOptions ?? []}
              categories={categories ?? []}
              assignments={allAssignments}
              onDirtyChange={setSheetDirty}
            />
          </>
        )}
      </div>
      <LeavePageDialog blocker={blocker} isDirty={sheetDirty} />
    </AppLayout>
  );
};

export default SchedulerL2;

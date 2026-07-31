// Scheduler Level 2: engagement staffing Gantt. Thin wrapper: role gate +
// URL state + the four data hooks; L2StaffGantt composes the grouped
// rows.
//
// Fase 3 (plan v2 §2 — Decisión #1, L2 solo lectura): NO se monta
// AssignmentSheet, no hay atajo de teclado "n", no hay bloqueo de salida
// de página ni botón "+ Agregar staff" — todo eso es Fase 5 (ver contrato
// de handoff en docs/scheduler/scheduler-fase-3-integracion.md). `canWrite`
// se sigue calculando con el mismo mirror puro (`canWriteEngagementAssignments`)
// únicamente para mostrar la nota "solo lectura"; en esta fase la
// escritura está deshabilitada para todos los roles.
//
// Fase 3 (plan v2 §3, issue §11): las categorías se resuelven por el
// SERVICIO del engagement (services.code === engagement.practica), nunca
// como lista global sin contexto — practica IS NULL se trata como "sin
// scope" (todas las categorías), igual que el resto de development.

import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
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
} from "@/hooks/useEmsData";
import { useStaffFirmwideAssignmentCounts } from "@/hooks/scheduler/useStaffFirmwideAssignmentCounts";
import {
  SchedulerDataError,
  SchedulerUnavailableError,
} from "@/hooks/scheduler/schedulerData";
import { isSchedulerZoom, type SchedulerZoom } from "@/lib/schedulerGantt";
import { captureReturnNav } from "@/lib/returnNav";
import { L2StaffGantt } from "@/components/scheduler/L2StaffGantt";
import { format, addYears, subYears } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";

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
  // Categorías por SERVICIO del engagement (issue §11) — practica IS NULL
  // (o sin match) se trata como "sin scope": todas las categorías.
  const engagementServiceId = useMemo(
    () => services?.find((s) => s.code === engagement?.practica)?.service_id,
    [services, engagement?.practica]
  );
  const categoriesQuery = useCategories(engagementServiceId);
  const categories = categoriesQuery.data;

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

  // Fase 5 preview only (mirror del D5 write rule) — no gatea ningún
  // control de escritura en esta fase; solo informa la nota "solo
  // lectura" del encabezado.
  const me = staffRecord?.staff_id;
  const isStructuralLead =
    !!me && (engagement?.manager_id === me || engagement?.partner_id === me);
  const hasOwnAssignment = !!me && (assignments ?? []).some((a) => a.staff_id === me);
  const canWrite = canWriteEngagementAssignments({
    isAdmin,
    isPartner,
    isDirector,
    isManager,
    isSenior,
    isStructuralLead,
    hasOwnAssignment,
  });
  void canWrite; // reservado para Fase 5; ver docs/scheduler/scheduler-fase-3-integracion.md

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
                  {/* Fase 3: la escritura está deshabilitada para todos los
                      roles — Fase 5 la habilita según canWrite. */}
                  {` · ${t("scheduler.readOnly")}`}
                </p>
              </div>
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
                  staffOptions={staffOptions ?? []}
                  categories={categories ?? []}
                  requirements={requirements ?? []}
                  loadByStaff={loadByStaff}
                  from={window_.from}
                  to={window_.to}
                  zoom={zoom}
                  returnNav={returnNav}
                />
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default SchedulerL2;

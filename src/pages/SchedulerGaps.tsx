// Staffing & Competency Gaps: firmwide read-only aggregate at
// /scheduler/gaps. KPI strip above three tabs; window state is
// URL-canonical (?from=&to=), replicating SchedulerL1's pattern WITHOUT
// importing from or modifying it (deliberate duplication; a shared helper
// would edit shipped Phase 4 code).
//
// Role gate is presentation-layer only; the server 403 is the control.
// useAuthorization's roleKey is null while loading and after a query
// error (fail-closed), so canView is MEANINGLESS until the role query
// settles — the Forbidden verdict waits for authoritative resolution, and
// all four gaps hooks take enabled = roleResolved && canView.
//
// Fase 3 (plan v2 §3, §4): `canView` usa el predicado compartido
// `canSeeGaps` (firmwide-only); las categorías de los gráficos incluyen
// el servicio para distinguir homónimas.

import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format, addMonths, endOfQuarter, startOfQuarter, differenceInCalendarDays } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { AlertTriangle, CalendarIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuthorization } from "@/hooks/useAuthorization";
import {
  useBenchVsPipeline,
  useCategoryHeadcountGap,
  useCategoryHoursGap,
  useCompetencyShortage,
} from "@/hooks/scheduler/useSchedulerGaps";
import {
  SchedulerDataError,
  SchedulerUnavailableError,
} from "@/hooks/scheduler/schedulerData";
import { isStrictIsoDate } from "@/lib/schedulerGantt";
import { canSeeGaps } from "@/lib/schedulerAccess";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { GapKpiStrip } from "@/components/scheduler/gaps/GapKpiStrip";
import { CategoryGapChart } from "@/components/scheduler/gaps/CategoryGapChart";
import { SkillShortageTable } from "@/components/scheduler/gaps/SkillShortageTable";
import { BenchTable } from "@/components/scheduler/gaps/BenchTable";

// Client telemetry shim (cross-cutting concern): named events, IDs and
// counts only, no PII — a no-op v1 that matches the server-side
// console.info discipline.
function track(_event: string, _props?: Record<string, string | number>): void {
  // no-op v1
}

// Kept in sync with supabase/functions/scheduler-gaps/handler.ts
// MAX_RANGE_DAYS — the client gate must match the server's limit so an
// overlong window never dispatches guaranteed-400 requests.
const MAX_RANGE_DAYS = 730;

// Harmonized with SchedulerL1: the two scheduler surfaces share period
// semantics — current quarter ± 3 months.
function defaultWindow(): { from: string; to: string } {
  const today = new Date();
  return {
    from: format(addMonths(startOfQuarter(today), -3), "yyyy-MM-dd"),
    to: format(addMonths(endOfQuarter(today), 3), "yyyy-MM-dd"),
  };
}

function categoryChartLabel(categoryName: string, serviceName: string): string {
  return serviceName ? `${categoryName} · ${serviceName}` : categoryName;
}

function WindowDatePicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const { i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("es") ? es : enUS;
  const selected = value ? parseDateLocal(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          // Dense desktop sizing, but the design-system 44px mobile
          // touch-target minimum below sm.
          className="h-8 min-h-[44px] font-normal sm:min-h-0"
          aria-label={ariaLabel}
        >
          {selected ? format(selected, "dd/MM/yyyy") : "—"}
          <CalendarIcon className="ml-2 h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={dateLocale}
          selected={selected}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          defaultMonth={selected}
          initialFocus
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

const SchedulerGaps = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    roleKey,
    isLoading: roleLoading,
    isError: roleError,
    refetch: refetchRole,
  } = useAuthorization();
  const isAdmin = roleKey === "admin";
  const canView = canSeeGaps(roleKey);
  const roleResolved = !roleLoading && !roleError;

  const [searchParams, setSearchParams] = useSearchParams();
  const fallback = useMemo(defaultWindow, []);
  // Strict canonical dates only: a malformed or impossible bookmarked
  // value recovers to the default window, never reaches the server, and
  // is scrubbed from the address bar.
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = isStrictIsoDate(fromParam) ? fromParam : fallback.from;
  const to = isStrictIsoDate(toParam) ? toParam : fallback.to;

  useEffect(() => {
    const fromInvalid = fromParam !== null && !isStrictIsoDate(fromParam);
    const toInvalid = toParam !== null && !isStrictIsoDate(toParam);
    if (!fromInvalid && !toInvalid) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (fromInvalid) next.delete("from");
        if (toInvalid) next.delete("to");
        return next;
      },
      { replace: true }
    );
  }, [fromParam, toParam, setSearchParams]);

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
      track("scheduler_gaps_window_change");
    },
    [setSearchParams]
  );

  useEffect(() => {
    track("scheduler_gaps_page_view");
  }, []);

  // Client-side range sanity: a reversed OR overlong window is a
  // deterministic user-input state, not an error — gate the queries (the
  // server would 400 them) and show an inline notice instead of the
  // generic error ladder with a Retry that cannot succeed. String compare
  // is safe on strict-ISO dates; the day arithmetic mirrors the server's
  // dayOrdinal difference.
  const windowOrdered = from <= to;
  const windowDays =
    differenceInCalendarDays(parseDateLocal(to), parseDateLocal(from)) + 1;
  const windowWithinMax = windowDays - 1 <= MAX_RANGE_DAYS;
  const windowValid = windowOrdered && windowWithinMax;

  const enabled = roleResolved && canView && windowValid;
  const headcount = useCategoryHeadcountGap({ from, to, enabled });
  const hours = useCategoryHoursGap({ from, to, enabled });
  const shortage = useCompetencyShortage({ from, to, enabled });
  const bench = useBenchVsPipeline({ enabled });
  const queries = [headcount, hours, shortage, bench] as const;

  const errors = queries.map((q) => q.error).filter(Boolean) as Error[];
  const serverForbidden = errors.some(
    (e) => e instanceof SchedulerDataError && e.code === "forbidden"
  );
  const unavailable = errors.some((e) => e instanceof SchedulerUnavailableError);
  const otherError = errors.some(
    (e) =>
      !(e instanceof SchedulerUnavailableError) &&
      !(e instanceof SchedulerDataError && e.code === "forbidden")
  );
  const anyLoading = enabled && queries.some((q) => q.isLoading);
  const allEmpty =
    queries.every((q) => q.data !== undefined) &&
    (headcount.data?.rows.length ?? 0) === 0 &&
    (hours.data?.rows.length ?? 0) === 0 &&
    (shortage.data?.rows.length ?? 0) === 0 &&
    (bench.data?.rows.length ?? 0) === 0;

  // KPI derivations — from the four row sets, client-side. The skills KPI
  // reads the UNCAPPED deficitRowCount, never the capped row list.
  const headcountGapKpi =
    (headcount.data?.rows ?? []).reduce((acc, r) => acc + Math.max(r.gapFteDays, 0), 0) /
    Math.max(windowDays, 1);
  const hoursGapKpi = (hours.data?.rows ?? []).reduce(
    (acc, r) => acc + Math.max(r.gapHours, 0),
    0
  );
  const skillsKpi = shortage.data?.deficitRowCount ?? 0;
  const benchKpi = bench.data?.rows.length ?? 0;

  // State ladder — order matters; each state exclusive.
  let content: React.ReactNode;
  if (roleLoading) {
    // 1 — role not yet authoritative: never a Forbidden flash.
    content = <LadderSkeleton />;
  } else if (roleError) {
    // 2 — a role-read failure is an ERROR, not a permission verdict.
    content = (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-2">
          {t("scheduler.errors.loadFailed")}
          <Button variant="outline" size="sm" onClick={() => refetchRole()}>
            {t("scheduler.errors.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (!canView || serverForbidden) {
    // 3 — terminal, no retry.
    content = (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{t("scheduler.gaps.forbidden")}</AlertDescription>
      </Alert>
    );
  } else if (!windowValid) {
    // 3bis — reversed or overlong picker state: informational, not an
    // error; the queries above are disabled so nothing fired.
    content = (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {t(
            windowOrdered
              ? "scheduler.gaps.rangeTooLong"
              : "scheduler.gaps.invalidRange"
          )}
        </AlertDescription>
      </Alert>
    );
  } else if (unavailable) {
    // 4 — deployment gap or pre-apply schema window.
    content = (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{t("scheduler.errors.unavailable")}</AlertDescription>
      </Alert>
    );
  } else if (anyLoading) {
    // 5
    content = <LadderSkeleton />;
  } else if (otherError) {
    // 6
    content = (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-2">
          {t("scheduler.errors.loadFailed")}
          <Button
            variant="outline"
            size="sm"
            onClick={() => queries.forEach((q) => q.refetch())}
          >
            {t("scheduler.errors.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (allEmpty) {
    // 7
    content = (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t("scheduler.gaps.empty")}
      </p>
    );
  } else {
    // 8 — data.
    content = (
      <>
        <GapKpiStrip
          headcountGap={headcountGapKpi}
          hoursGap={hoursGapKpi}
          skillsUnderSupplied={skillsKpi}
          benchCount={benchKpi}
        />
        <Tabs
          defaultValue="byCategory"
          className="mt-4"
          onValueChange={(tab) => track("scheduler_gaps_tab_switch", { tab })}
        >
          <TabsList>
            <TabsTrigger value="byCategory">
              {t("scheduler.gaps.tabs.byCategory")}
            </TabsTrigger>
            <TabsTrigger value="bySkill">{t("scheduler.gaps.tabs.bySkill")}</TabsTrigger>
            <TabsTrigger value="bench">{t("scheduler.gaps.tabs.bench")}</TabsTrigger>
          </TabsList>
          <TabsContent value="byCategory" className="mt-4 space-y-6">
            <CategoryGapChart
              title={t("scheduler.gaps.kpi.headcountGap")}
              basisTooltip={t("scheduler.gaps.headcountBasisTooltip")}
              data={(headcount.data?.rows ?? []).map((r) => ({
                categoryId: r.categoryId,
                categoryName: categoryChartLabel(r.categoryName, r.serviceName),
                // Chart in average seats (FteDays ÷ window days).
                demand: r.demandFteDays / Math.max(windowDays, 1),
                supply: r.suppliedFteDays / Math.max(windowDays, 1),
                gap: r.gapFteDays / Math.max(windowDays, 1),
              }))}
            />
            <CategoryGapChart
              title={t("scheduler.gaps.kpi.hoursGap")}
              basisTooltip={t("scheduler.gaps.hoursProjectionTooltip")}
              data={(hours.data?.rows ?? []).map((r) => ({
                categoryId: r.categoryId,
                categoryName: categoryChartLabel(r.categoryName, r.serviceName),
                demand: r.demandHours,
                supply: r.projectedSupplyHours,
                gap: r.gapHours,
              }))}
            />
          </TabsContent>
          <TabsContent value="bySkill" className="mt-4">
            <SkillShortageTable
              rows={shortage.data?.rows ?? []}
              truncated={shortage.data?.truncated ?? false}
            />
          </TabsContent>
          <TabsContent value="bench" className="mt-4">
            <BenchTable rows={bench.data?.rows ?? []} canNavigate={isAdmin} />
          </TabsContent>
        </Tabs>
      </>
    );
  }

  return (
    <AppLayout title={t("scheduler.gaps.title")} focusMode>
      <div className="flex h-full flex-col gap-3 p-4 md:p-6">
        <Button variant="cancel" size="sm" className="w-fit self-start" onClick={() => navigate("/")}>
          {t("common.cancel")}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{t("scheduler.gaps.title")}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <WindowDatePicker
              value={from}
              onChange={(v) => setParam("from", v)}
              ariaLabel={t("engagement.startDate")}
            />
            <span className="text-sm text-muted-foreground">–</span>
            <WindowDatePicker
              value={to}
              onChange={(v) => setParam("to", v)}
              ariaLabel={t("engagement.endDate")}
            />
          </div>
        </div>
        {content}
      </div>
    </AppLayout>
  );
};

function LadderSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

export default SchedulerGaps;

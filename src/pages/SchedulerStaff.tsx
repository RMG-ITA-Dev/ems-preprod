// Phase 7 — Employee Gantt: viewer-scoped cross-engagement timeline for
// one staff member at /scheduler/staff/:id (plan §3). Thin wrapper: role
// gate + URL state + ONE hook; StaffEngagementGantt composes the rows.
// URL is canon (?from&to&zoom, L1 semantics); Cancel returns to the L2
// that opened this page via location.state.returnTo, falling back to
// /scheduler for bookmarked URLs (D-P7-8, AGENTS.md rule 2).
//
// Role ladder follows the Phase 6 refinement (D-P6-19): useAuthorization's
// roleKey is null while loading and after an error (fail-closed), so the
// Forbidden verdict waits for authoritative resolution. The server 403 is
// the real control (D-P7-2) — this gate is presentation only.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  format,
  addMonths,
  differenceInCalendarDays,
  endOfQuarter,
  startOfQuarter,
} from "date-fns";
import { enUS, es } from "date-fns/locale";
import { AlertTriangle, CalendarIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuthorization } from "@/hooks/useAuthorization";
import { canSeePlanning } from "@/lib/schedulerAccess";
import { useSchedulerStaffTimeline } from "@/hooks/scheduler/useSchedulerStaffTimeline";
import {
  SchedulerDataError,
  SchedulerUnavailableError,
} from "@/hooks/scheduler/schedulerData";
import { isSchedulerZoom, isStrictIsoDate, type SchedulerZoom } from "@/lib/schedulerGantt";
import { captureReturnNav } from "@/lib/returnNav";
import { StaffEngagementGantt } from "@/components/scheduler/StaffEngagementGantt";
import { parseDateLocal } from "@/lib/timesheetUtils";

// Kept in sync with supabase/functions/scheduler-data/handler.ts
// MAX_RANGE_DAYS — the client gate must match the server's limit so an
// overlong window never dispatches guaranteed-400 requests (Phase 6
// refinement, GPT-5.6 P2-02 on PR #227).
const MAX_RANGE_DAYS = 730;

// Harmonized scheduler period semantics (D-P6-4): current quarter ± 3 months.
function defaultWindow(): { from: string; to: string } {
  const today = new Date();
  return {
    from: format(addMonths(startOfQuarter(today), -3), "yyyy-MM-dd"),
    to: format(addMonths(endOfQuarter(today), 3), "yyyy-MM-dd"),
  };
}

// Deliberate duplication of the L1/Gaps picker (D-P6-3): a shared helper
// would edit shipped pages.
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
          className="h-8 font-normal"
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

const SchedulerStaff = () => {
  const { t } = useTranslation();
  const { id: staffId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Captured ONCE on mount (D-P7-12; adversarial review P2-01): every
  // setSearchParams(..., { replace: true }) below creates a replacement
  // location with state:null, so reading location.state at Cancel time
  // would lose the caller after any window/zoom change. The FULL chain
  // (returnTo + returnState) is kept so Cancel can restore the caller's
  // own captured state (D-P7-17; R2 review P2-01 — the nested
  // L2 → Employee → L2 → Cancel loop must not forget the original L2).
  const [returnNav] = useState(() => captureReturnNav(location.state));

  const {
    roleKey,
    isLoading: roleLoading,
    isError: roleError,
    refetch: refetchRole,
  } = useAuthorization();
  const canView = canSeePlanning(roleKey);
  const roleResolved = !roleLoading && !roleError;

  const [searchParams, setSearchParams] = useSearchParams();
  const fallback = useMemo(defaultWindow, []);
  // Strict canonical dates only (PR #214 P1-07): malformed bookmarked
  // values recover to the default window and are scrubbed from the URL.
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

  const zoomParam = searchParams.get("zoom");
  const zoom: SchedulerZoom = isSchedulerZoom(zoomParam) ? zoomParam : "months";

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

  // Reversed/overlong windows are user-input states, not errors — gate
  // the query and show an inline notice instead of a Retry that cannot
  // succeed (Phase 6 refinement). Generic gaps copy is safe to reuse.
  const windowOrdered = from <= to;
  const windowDays =
    differenceInCalendarDays(parseDateLocal(to), parseDateLocal(from)) + 1;
  const windowValid = windowOrdered && windowDays - 1 <= MAX_RANGE_DAYS;

  const query = useSchedulerStaffTimeline({
    staffId: roleResolved && canView && windowValid ? staffId : undefined,
    from,
    to,
  });

  const forbidden =
    query.error instanceof SchedulerDataError && query.error.code === "forbidden";
  const notFound =
    query.error instanceof SchedulerDataError && query.error.code === "not_found";
  const unavailable = query.error instanceof SchedulerUnavailableError;

  const data = query.data;
  const staffName = data?.staff
    ? `${data.staff.first_name} ${data.staff.last_name}`
    : "";

  return (
    <AppLayout>
      <div className="flex h-full flex-col gap-3 p-4 md:p-6">
        {/* Gray Cancel button, no back arrow (AGENTS.md rule 2), present
            in EVERY state. Returns to the L2 that opened this page;
            bookmarked/shared URLs fall back to L1 (D-P7-8). */}
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

        {roleError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              {t("scheduler.errors.loadFailed")}
              <Button variant="outline" size="sm" onClick={() => refetchRole()}>
                {t("scheduler.errors.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : roleLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-72" />
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : !canView || forbidden ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("scheduler.staff.forbidden")}</AlertDescription>
          </Alert>
        ) : notFound ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("scheduler.staff.notFound")}</AlertDescription>
          </Alert>
        ) : unavailable ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("scheduler.errors.unavailable")}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">
                  {staffName || t("scheduler.staff.title")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("scheduler.staff.title")}
                  {data?.staff?.short_name && ` · ${data.staff.short_name}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <WindowDatePicker
                  value={from}
                  onChange={(v) => setParam("from", v)}
                  ariaLabel={t("engagement.startDate")}
                />
                <span className="text-muted-foreground text-sm">–</span>
                <WindowDatePicker
                  value={to}
                  onChange={(v) => setParam("to", v)}
                  ariaLabel={t("engagement.endDate")}
                />
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={zoom}
                  onValueChange={(v) => v && setParam("zoom", v)}
                  aria-label={t("scheduler.staff.title")}
                >
                  <ToggleGroupItem value="weeks" aria-label={t("scheduler.gantt.zoom.weeks")}>
                    {t("scheduler.gantt.zoom.weeks")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="months" aria-label={t("scheduler.gantt.zoom.months")}>
                    {t("scheduler.gantt.zoom.months")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="quarters" aria-label={t("scheduler.gantt.zoom.quarters")}>
                    {t("scheduler.gantt.zoom.quarters")}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>

            {!windowValid ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {windowOrdered
                    ? t("scheduler.gaps.rangeTooLong")
                    : t("scheduler.gaps.invalidRange")}
                </AlertDescription>
              </Alert>
            ) : query.isError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between gap-2">
                  {t("scheduler.errors.loadFailed")}
                  <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                    {t("scheduler.errors.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : query.isLoading || !data ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : (
              <>
                {/* An "empty" view with hidden engagements must not read
                    as idle — the count notice renders in BOTH branches
                    (plan §3). */}
                {data.hiddenEngagementCount > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {t("scheduler.staff.hidden", { n: data.hiddenEngagementCount })}
                    </AlertDescription>
                  </Alert>
                )}
                {data.truncated && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{t("scheduler.staff.truncated")}</AlertDescription>
                  </Alert>
                )}
                {data.rows.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {t("scheduler.staff.empty")}
                  </p>
                ) : (
                  <div className="min-h-0 flex-1">
                    <StaffEngagementGantt
                      rows={data.rows}
                      from={from}
                      to={to}
                      zoom={zoom}
                      utilization={data.utilization ?? []}
                      capacityHours={data.staff?.weekly_capacity_hours ?? null}
                      returnNav={returnNav}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default SchedulerStaff;

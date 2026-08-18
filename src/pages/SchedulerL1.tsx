// Scheduler Level 1: firmwide engagement Gantt. Thin wrapper: role gate +
// URL state + hooks; L1EngagementGantt is the composition layer. URL is
// canon (?status&partner&manager&client&from&to&zoom); the default
// window is the current quarter ± 3 months.
//
// Fase 3 (plan v2 §1, §4): statusFilter usa el bucket del estado
// efectivo (incluye "frozen" para Congelado, sin equivalente legacy).
// `canView` usa el predicado compartido `canSeePlanning`.

import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format, addMonths, endOfQuarter, startOfQuarter } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { AlertTriangle, CalendarIcon, Check, ChevronsUpDown, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useCategoryStaff } from "@/hooks/useCategoryStaff";
import { useClients } from "@/hooks/useEmsData";
import { useSchedulerL1Rows, type SchedulerL1StatusFilter } from "@/hooks/scheduler/useSchedulerL1";
import { SchedulerUnavailableError } from "@/hooks/scheduler/schedulerData";
import { canSeePlanning } from "@/lib/schedulerAccess";
import {
  isSchedulerZoom,
  isStrictIsoDate,
  type SchedulerZoom,
} from "@/lib/schedulerGantt";
import { L1EngagementGantt } from "@/components/scheduler/L1EngagementGantt";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { cn } from "@/lib/utils";

const STATUS_VALUES = [
  "all",
  "active",
  "pending",
  "completed",
  "cancelled",
  "frozen",
] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

function defaultWindow(): { from: string; to: string } {
  const today = new Date();
  return {
    from: format(addMonths(startOfQuarter(today), -3), "yyyy-MM-dd"),
    to: format(addMonths(endOfQuarter(today), 3), "yyyy-MM-dd"),
  };
}

// Minimal searchable single-select (command + popover — the
// EngagementCombobox pattern; no generic <Combobox> exists in the repo).
function FilterCombobox({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const selected = options.find((o) => o.value === value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          size="sm"
          className={cn(
            "h-8 justify-between font-normal min-w-32",
            !selected && "text-muted-foreground"
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => onChange(o.value === value ? "" : o.value)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === o.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
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
  // Calendar month/weekday names follow the language — the shared
  // Calendar defaults to enUS.
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

const SchedulerL1 = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    roleKey,
    isLoading: roleLoading,
    isError: roleError,
    refetch: refetchRole,
  } = useAuthorization();
  const canView = canSeePlanning(roleKey);
  // roleKey is null while useAuthorization is loading and after a query error
  // (fail-closed) — canView is meaningless until the role query resolves, same
  // gotcha documented in SchedulerGaps.tsx. Don't fold either into `unavailable`.
  const roleResolved = !roleLoading && !roleError;

  const [searchParams, setSearchParams] = useSearchParams();
  const fallback = useMemo(defaultWindow, []);
  // Strict canonical dates only: a malformed or impossible bookmarked
  // value (?from=invalid, ?to=2026-02-31) must recover to the default
  // window, never reach format()/SVAR as an Invalid Date, and never be
  // sent to the server.
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = isStrictIsoDate(fromParam) ? fromParam : fallback.from;
  const to = isStrictIsoDate(toParam) ? toParam : fallback.to;

  // Canonicalize: an invalid bookmarked param is REMOVED from the URL
  // (history-replace) so the address bar reflects the window actually
  // shown and re-shares cleanly.
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
  const statusParam = searchParams.get("status");
  const status: StatusFilter = (STATUS_VALUES as readonly string[]).includes(
    statusParam ?? ""
  )
    ? (statusParam as StatusFilter)
    : "all";
  const partner = searchParams.get("partner") ?? "";
  const manager = searchParams.get("manager") ?? "";
  const client = searchParams.get("client") ?? "";

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

  const clearFilters = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of ["status", "partner", "manager", "client"]) next.delete(k);
        return next;
      },
      { replace: true }
    );
  };

  const hasFilters = status !== "all" || !!partner || !!manager || !!client;

  const { partnerOptions, managerOptions } = useCategoryStaff();
  const { data: clients } = useClients();
  const clientOptions = useMemo(
    () =>
      (clients ?? []).map((c) => ({
        value: c.client_id,
        label: c.client_legal_name,
      })),
    [clients]
  );

  const query = useSchedulerL1Rows({
    from,
    to,
    statusFilter: status as SchedulerL1StatusFilter,
    partnerFilter: partner || undefined,
    managerFilter: manager || undefined,
    clientFilter: client || undefined,
  });

  const backendUnavailable = query.error instanceof SchedulerUnavailableError;
  const unavailable = roleResolved && (!canView || backendUnavailable);
  const showFilters = roleResolved && canView && !backendUnavailable;

  return (
    <AppLayout title={t("scheduler.title")} focusMode>
      <div className="flex h-full flex-col gap-3 p-4 md:p-6">
        <Button variant="cancel" size="sm" className="w-fit self-start" onClick={() => navigate("/")}>
          {t("common.cancel")}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{t("scheduler.title")}</h1>
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
              aria-label={t("scheduler.title")}
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

        {showFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              value={status}
              onValueChange={(v) => v && setParam("status", v === "all" ? "" : v)}
              aria-label={t("scheduler.filters.status")}
            >
              <ToggleGroupItem value="all">{t("common.allStatus")}</ToggleGroupItem>
              <ToggleGroupItem value="active">{t("status.active")}</ToggleGroupItem>
              <ToggleGroupItem value="pending">{t("status.pending")}</ToggleGroupItem>
              <ToggleGroupItem value="completed">{t("status.completed")}</ToggleGroupItem>
              <ToggleGroupItem value="cancelled">{t("status.cancelled")}</ToggleGroupItem>
              <ToggleGroupItem value="frozen">{t("status.frozen")}</ToggleGroupItem>
            </ToggleGroup>
            <FilterCombobox
              options={partnerOptions}
              value={partner}
              onChange={(v) => setParam("partner", v)}
              placeholder={t("scheduler.filters.partner")}
            />
            <FilterCombobox
              options={managerOptions}
              value={manager}
              onChange={(v) => setParam("manager", v)}
              placeholder={t("scheduler.filters.manager")}
            />
            <FilterCombobox
              options={clientOptions}
              value={client}
              onChange={(v) => setParam("client", v)}
              placeholder={t("scheduler.filters.client")}
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8" onClick={clearFilters}>
                <X className="mr-1 h-3.5 w-3.5" />
                {t("scheduler.filters.clear")}
              </Button>
            )}
          </div>
        )}

        {/* States: role loading/error ≠ Unavailable ≠ Empty ≠ Error. */}
        {roleLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : roleError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              {t("scheduler.errors.loadFailed")}
              <Button variant="outline" size="sm" onClick={() => refetchRole()}>
                {t("scheduler.errors.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : unavailable ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("scheduler.errors.unavailable")}</AlertDescription>
          </Alert>
        ) : query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
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
        ) : (query.data?.rows.length ?? 0) === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t("scheduler.l1.empty")}
          </p>
        ) : (
          <>
            {query.data!.truncated && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t("scheduler.l1.truncated")}</AlertDescription>
              </Alert>
            )}
            <div className="min-h-0 flex-1">
              <L1EngagementGantt
                rows={query.data!.rows}
                from={from}
                to={to}
                zoom={zoom}
              />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default SchedulerL1;

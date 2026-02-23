import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isSameDay,
} from "date-fns";
import {
  WeekInfo,
  DeadlineInfo,
  formatFullDate,
  isDeadlineToday,
  isDeadlinePassed,
  getWeekMonday,
} from "@/lib/timesheetUtils";
import { useWeekStatuses, WeekStatusCode } from "@/hooks/useWeekStatuses";

interface WeekNavigatorProps {
  weekInfo: WeekInfo;
  deadlineInfo: DeadlineInfo;
  currentWeekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onWeekSelect: (date: Date) => void;
  earliestWeekStart?: Date;
  latestWeekStart?: Date;
  staffId?: string;
}

export const WeekNavigator = ({
  weekInfo,
  deadlineInfo,
  currentWeekStart,
  onPreviousWeek,
  onNextWeek,
  onWeekSelect,
  earliestWeekStart,
  latestWeekStart,
  staffId,
}: WeekNavigatorProps) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [displayedMonth, setDisplayedMonth] = useState(currentWeekStart);

  // Sync displayedMonth when currentWeekStart changes (prev/next week nav)
  useEffect(() => {
    setDisplayedMonth(currentWeekStart);
  }, [currentWeekStart]);

  const deadlinePassed = isDeadlinePassed(deadlineInfo.deadline);
  const deadlineIsToday = isDeadlineToday(deadlineInfo.deadline);

  // Disable backward navigation past hire date
  const canGoPrevious = !earliestWeekStart || 
    currentWeekStart.getTime() > earliestWeekStart.getTime();

  // Disable forward navigation past termination date
  const canGoNext = !latestWeekStart ||
    currentWeekStart.getTime() < latestWeekStart.getTime();

  // Compute visible grid range for DayPicker (Sun-Sat grid)
  const gridStart = useMemo(
    () => startOfWeek(startOfMonth(displayedMonth), { weekStartsOn: 0 }),
    [displayedMonth]
  );
  const gridEnd = useMemo(
    () => endOfWeek(endOfMonth(displayedMonth), { weekStartsOn: 0 }),
    [displayedMonth]
  );
  const gridStartISO = format(gridStart, "yyyy-MM-dd");
  const gridEndISO = format(gridEnd, "yyyy-MM-dd");

  // Fetch week statuses for the visible grid
  const { data: weekStatuses } = useWeekStatuses(staffId, gridStartISO, gridEndISO);

  // Build modifiers from week statuses
  const { modifiers, modifiersClassNames } = useMemo(() => {
    if (!weekStatuses?.length) return { modifiers: {}, modifiersClassNames: {} };

    // Build week_start -> status map
    const statusMap = new Map<string, WeekStatusCode>();
    weekStatuses.forEach((ws) => statusMap.set(ws.week_start, ws.status));

    const groups: Record<string, Date[]> = {
      approved: [],
      pending: [],
      rejected: [],
      notReported: [],
      currentWeekStart: [],
      currentWeek: [],
    };

    const today = new Date();
    const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

    allDays.forEach((day) => {
      // Layer 1: exclude today from all modifiers so day_today styling wins
      if (isSameDay(day, today)) return;
      // Skip weekends — Sat/Sun remain untinted
      if (day.getDay() === 0 || day.getDay() === 6) return;

      const monday = getWeekMonday(day);
      const key = format(monday, "yyyy-MM-dd");
      const status = statusMap.get(key);

      if (!status || status === "FUTURE") return;

      if (status === "APPROVED") groups.approved.push(day);
      else if (status === "PENDING_APPROVAL") groups.pending.push(day);
      else if (status === "REJECTED") groups.rejected.push(day);
      else if (status === "CURRENT") {
        if (day.getDay() === 1) groups.currentWeekStart.push(day);
        else groups.currentWeek.push(day);
      }
      else groups.notReported.push(day); // DRAFT, NOT_SUBMITTED, NOT_LOGGED
    });

    return {
      modifiers: {
        approved: groups.approved,
        pending: groups.pending,
        rejected: groups.rejected,
        notReported: groups.notReported,
        currentWeekStart: groups.currentWeekStart,
        currentWeek: groups.currentWeek,
      },
      modifiersClassNames: {
        approved: "bg-success/30",
        pending: "bg-warning/35",
        rejected: "bg-[hsl(var(--week-rejected))]/30",
        notReported: "bg-destructive/25",
        currentWeekStart: "bg-[hsl(var(--brand-purple))]/35",
        currentWeek: "bg-[hsl(var(--brand-purple))]/15",
      },
    };
  }, [weekStatuses, gridStart, gridEnd]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const weekMonday = getWeekMonday(date);
      onWeekSelect(weekMonday);
      setCalendarOpen(false);
    }
  };

  return (
    <div className="flex items-center justify-between bg-card rounded-xl border border-border p-4">
      {/* Previous Week Button */}
      <Button variant="ghost" size="sm" onClick={onPreviousWeek} disabled={!canGoPrevious}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        {t("timesheet.previous")}
      </Button>

      {/* Week Info Center - Clickable to open calendar */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            className="text-center space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg px-4 py-2 transition-colors"
            title={t("timesheet.selectWeek")}
          >
            <p className="font-semibold text-foreground">
              {weekInfo.formattedRange}
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>{t("timesheet.week")} {weekInfo.weekNumber}</span>
              </div>

              {/* Month-End Indicator */}
              {deadlineInfo.isMonthEnd && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={`text-xs flex items-center gap-1 ${
                          deadlinePassed
                            ? "border-destructive text-destructive"
                            : deadlineIsToday
                            ? "border-warning text-warning"
                            : "border-info text-info"
                        }`}
                      >
                        <Calendar className="h-3 w-3" />
                        {t("timesheet.monthEnd")}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {t("timesheet.monthEndDeadline")}:{" "}
                        {formatFullDate(deadlineInfo.deadline, lang)}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <CalendarComponent
            mode="single"
            selected={currentWeekStart}
            onSelect={handleDateSelect}
            month={displayedMonth}
            onMonthChange={setDisplayedMonth}
            fromDate={earliestWeekStart}
            toDate={latestWeekStart ? new Date(latestWeekStart.getTime() + 6 * 86400000) : undefined}
            className="pointer-events-auto week-status-calendar"
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
          />
          {/* Compact legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-3 pt-1 text-[0.65rem] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success/40" />
              {t("timesheet.legend.approved")}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-warning/40" />
              {t("timesheet.legend.pending")}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[hsl(var(--week-rejected))]/40" />
              {t("timesheet.legend.rejected")}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-destructive/40" />
              {t("timesheet.legend.notReported")}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[hsl(var(--brand-purple))]/40" />
              {t("timesheet.legend.currentWeek")}
            </span>
          </div>
        </PopoverContent>
      </Popover>

      {/* Next Week Button */}
      <Button variant="ghost" size="sm" onClick={onNextWeek} disabled={!canGoNext}>
        {t("timesheet.next")}
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
};

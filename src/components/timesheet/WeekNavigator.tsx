import { useState } from "react";
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
  WeekInfo,
  DeadlineInfo,
  formatFullDate,
  isDeadlineToday,
  isDeadlinePassed,
  getWeekMonday,
} from "@/lib/timesheetUtils";

interface WeekNavigatorProps {
  weekInfo: WeekInfo;
  deadlineInfo: DeadlineInfo;
  currentWeekStart: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onWeekSelect: (date: Date) => void;
  earliestWeekStart?: Date;
}

export const WeekNavigator = ({
  weekInfo,
  deadlineInfo,
  currentWeekStart,
  onPreviousWeek,
  onNextWeek,
  onWeekSelect,
  earliestWeekStart,
}: WeekNavigatorProps) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [calendarOpen, setCalendarOpen] = useState(false);

  const deadlinePassed = isDeadlinePassed(deadlineInfo.deadline);
  const deadlineIsToday = isDeadlineToday(deadlineInfo.deadline);

  // BUG #5: Disable backward navigation past hire date
  const canGoPrevious = !earliestWeekStart || 
    currentWeekStart.getTime() > earliestWeekStart.getTime();

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
            defaultMonth={currentWeekStart}
            fromDate={earliestWeekStart}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Next Week Button */}
      <Button variant="ghost" size="sm" onClick={onNextWeek}>
        {t("timesheet.next")}
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
};

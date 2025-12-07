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
  WeekInfo,
  DeadlineInfo,
  formatFullDate,
  isDeadlineToday,
  isDeadlinePassed,
} from "@/lib/timesheetUtils";

interface WeekNavigatorProps {
  weekInfo: WeekInfo;
  deadlineInfo: DeadlineInfo;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
}

export const WeekNavigator = ({
  weekInfo,
  deadlineInfo,
  onPreviousWeek,
  onNextWeek,
}: WeekNavigatorProps) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const deadlinePassed = isDeadlinePassed(deadlineInfo.deadline);
  const deadlineIsToday = isDeadlineToday(deadlineInfo.deadline);

  return (
    <div className="flex items-center justify-between bg-card rounded-xl border border-border p-4">
      {/* Previous Week Button */}
      <Button variant="ghost" size="sm" onClick={onPreviousWeek}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        {t("timesheet.previous")}
      </Button>

      {/* Week Info Center */}
      <div className="text-center space-y-1">
        <p className="font-semibold text-foreground font-mono">
          {weekInfo.formattedRange}
        </p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-sm text-muted-foreground">
            {t("timesheet.week")} {weekInfo.weekNumber}
          </p>

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
      </div>

      {/* Next Week Button */}
      <Button variant="ghost" size="sm" onClick={onNextWeek}>
        {t("timesheet.next")}
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
};

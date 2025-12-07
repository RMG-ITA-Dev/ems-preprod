import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WeekNavigator } from "@/components/timesheet/WeekNavigator";
import { useTimesheetPolicies } from "@/hooks/useTimesheetPolicies";
import {
  getWeekInfo,
  getWeekMonday,
  getPreviousWeek,
  getNextWeek,
  calculateDeadline,
  getDayName,
  formatDayMonth,
} from "@/lib/timesheetUtils";

// Mock data (will be replaced in Step 3)
const mockEngagements = [
  { id: "1", code: "MSC-2024", name: "Minera San Cristóbal - 2024 Audit" },
  { id: "2", code: "BNB-Q4", name: "Banco Nacional - Q4 Tax Review" },
  { id: "3", code: "YPFB-IC", name: "YPFB - Internal Controls" },
];

const mockActivities = [
  { id: "1", code: "PLN", name: "Planning" },
  { id: "2", code: "FLD", name: "Fieldwork" },
  { id: "3", code: "REV", name: "Review" },
  { id: "4", code: "DOC", name: "Documentation" },
  { id: "5", code: "ADM", name: "Administration" },
];

interface TimeEntry {
  engagement: string;
  activity: string;
  hours: number[];
}

const TimeSheet = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  
  // Get policies
  const { data: policies } = useTimesheetPolicies();
  const workDays = policies?.workDays ?? 5;
  const monthEndRule = policies?.monthEndRule ?? "COMPLETE_SPANNING_WEEK";

  // Week navigation state - start with current week
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekMonday(new Date()));

  // Compute week info and deadline
  const weekInfo = useMemo(
    () => getWeekInfo(currentWeekStart, workDays, lang),
    [currentWeekStart, workDays, lang]
  );

  const deadlineInfo = useMemo(
    () => calculateDeadline(currentWeekStart, workDays, monthEndRule),
    [currentWeekStart, workDays, monthEndRule]
  );

  // Mock entries (will be replaced in Step 3)
  const [entries, setEntries] = useState<TimeEntry[]>([
    { engagement: "1", activity: "2", hours: [8, 7.5, 8, 6, 4] },
    { engagement: "2", activity: "1", hours: [0, 0.5, 0, 2, 4] },
  ]);

  // Week navigation handlers
  const handlePreviousWeek = () => {
    setCurrentWeekStart(getPreviousWeek(currentWeekStart));
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(getNextWeek(currentWeekStart));
  };

  const addNewRow = () => {
    const emptyHours = Array(workDays).fill(0);
    setEntries([...entries, { engagement: "", activity: "", hours: emptyHours }]);
  };

  const calculateRowTotal = (hours: number[]) => hours.reduce((a, b) => a + b, 0);
  
  const calculateColumnTotal = (dayIndex: number) => 
    entries.reduce((sum, entry) => sum + (entry.hours[dayIndex] || 0), 0);

  const calculateGrandTotal = () => 
    entries.reduce((sum, entry) => sum + calculateRowTotal(entry.hours), 0);

  return (
    <AppLayout title={t("timesheet.title")}>
      <div className="space-y-6">
        {/* Week Navigation */}
        <WeekNavigator
          weekInfo={weekInfo}
          deadlineInfo={deadlineInfo}
          onPreviousWeek={handlePreviousWeek}
          onNextWeek={handleNextWeek}
        />

        {/* Time Entry Grid */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left p-4 font-semibold text-foreground min-w-[200px]">
                    {t("timesheet.engagement")}
                  </th>
                  <th className="text-left p-4 font-semibold text-foreground min-w-[140px]">
                    {t("timesheet.activity")}
                  </th>
                  {weekInfo.weekDates.map((date, index) => (
                    <th key={index} className="text-center p-4 font-semibold text-foreground w-20">
                      <div className="capitalize">{getDayName(date, lang)}</div>
                      <div className="text-xs text-muted-foreground font-normal font-mono">
                        {formatDayMonth(date, lang)}
                      </div>
                    </th>
                  ))}
                  <th className="text-center p-4 font-semibold text-foreground w-20 bg-muted">
                    {t("timesheet.total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border hover:bg-muted/30">
                    <td className="p-2">
                      <Select value={entry.engagement}>
                        <SelectTrigger className="border-0 bg-transparent focus:ring-1">
                          <SelectValue placeholder={t("timesheet.selectEngagement")} />
                        </SelectTrigger>
                        <SelectContent>
                          {mockEngagements.map((eng) => (
                            <SelectItem key={eng.id} value={eng.id}>
                              <span className="font-mono text-xs text-muted-foreground mr-2">
                                {eng.code}
                              </span>
                              {eng.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select value={entry.activity}>
                        <SelectTrigger className="border-0 bg-transparent focus:ring-1">
                          <SelectValue placeholder={t("timesheet.selectActivity")} />
                        </SelectTrigger>
                        <SelectContent>
                          {mockActivities.map((act) => (
                            <SelectItem key={act.id} value={act.id}>
                              <span className="font-mono text-xs text-muted-foreground mr-2">
                                {act.code}
                              </span>
                              {act.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    {entry.hours.map((hours, dayIndex) => (
                      <td key={dayIndex} className="p-2">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={hours || ""}
                          className="w-16 text-center mx-auto border-0 bg-transparent focus:bg-background focus:border font-mono"
                        />
                      </td>
                    ))}
                    <td className="p-2 text-center font-semibold bg-muted/50 font-mono">
                      {calculateRowTotal(entry.hours)}h
                    </td>
                  </tr>
                ))}
                {/* Add Row Button */}
                <tr className="border-b border-border">
                  <td colSpan={workDays + 3} className="p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={addNewRow}
                      className="w-full text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t("timesheet.addRow")}
                    </Button>
                  </td>
                </tr>
                {/* Totals Row */}
                <tr className="bg-primary/5 font-semibold">
                  <td colSpan={2} className="p-4 text-foreground">
                    {t("timesheet.dailyTotals")}
                  </td>
                  {weekInfo.weekDates.map((_, index) => (
                    <td key={index} className="p-4 text-center text-foreground font-mono">
                      {calculateColumnTotal(index)}h
                    </td>
                  ))}
                  <td className="p-4 text-center text-foreground bg-primary/10 font-mono">
                    {calculateGrandTotal()}h
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" className="btn-action">
            {t("timesheet.saveDraft")}
          </Button>
          <Button className="bg-brand-purple hover:bg-brand-purple/90 text-primary-foreground btn-action">
            {t("timesheet.submitWeek")}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default TimeSheet;

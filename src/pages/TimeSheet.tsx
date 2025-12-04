import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Mock data
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
  const { t } = useTranslation();
  const [currentWeek, setCurrentWeek] = useState("02/12/2024 - 06/12/2024");
  const [entries, setEntries] = useState<TimeEntry[]>([
    { engagement: "1", activity: "2", hours: [8, 7.5, 8, 6, 4] },
    { engagement: "2", activity: "1", hours: [0, 0.5, 0, 2, 4] },
  ]);

  const weekDays = [
    t("timesheet.weekDays.mon"),
    t("timesheet.weekDays.tue"),
    t("timesheet.weekDays.wed"),
    t("timesheet.weekDays.thu"),
    t("timesheet.weekDays.fri"),
  ];

  const addNewRow = () => {
    setEntries([...entries, { engagement: "", activity: "", hours: [0, 0, 0, 0, 0] }]);
  };

  const calculateRowTotal = (hours: number[]) => hours.reduce((a, b) => a + b, 0);
  
  const calculateColumnTotal = (dayIndex: number) => 
    entries.reduce((sum, entry) => sum + entry.hours[dayIndex], 0);

  const calculateGrandTotal = () => 
    entries.reduce((sum, entry) => sum + calculateRowTotal(entry.hours), 0);

  return (
    <AppLayout title={t("timesheet.title")}>
      <div className="space-y-6">
        {/* Week Navigation */}
        <div className="flex items-center justify-between bg-card rounded-xl border border-border p-4">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t("timesheet.previous")}
          </Button>
          <div className="text-center">
            <p className="font-semibold text-foreground">{currentWeek}</p>
            <p className="text-sm text-muted-foreground">{t("timesheet.week")} 49</p>
          </div>
          <Button variant="ghost" size="sm">
            {t("timesheet.next")}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {/* Time Entry Grid */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left p-4 font-semibold text-foreground min-w-[200px]">{t("timesheet.engagement")}</th>
                  <th className="text-left p-4 font-semibold text-foreground min-w-[140px]">{t("timesheet.activity")}</th>
                  {weekDays.map((day, index) => (
                    <th key={day} className="text-center p-4 font-semibold text-foreground w-20">
                      <div>{day}</div>
                      <div className="text-xs text-muted-foreground font-normal">
                        {String(2 + index).padStart(2, "0")}/12
                      </div>
                    </th>
                  ))}
                  <th className="text-center p-4 font-semibold text-foreground w-20 bg-muted">{t("timesheet.total")}</th>
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
                              <span className="font-mono text-xs text-muted-foreground mr-2">{eng.code}</span>
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
                              <span className="font-mono text-xs text-muted-foreground mr-2">{act.code}</span>
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
                          className="w-16 text-center mx-auto border-0 bg-transparent focus:bg-background focus:border"
                        />
                      </td>
                    ))}
                    <td className="p-2 text-center font-semibold bg-muted/50">
                      {calculateRowTotal(entry.hours)}h
                    </td>
                  </tr>
                ))}
                {/* Add Row Button */}
                <tr className="border-b border-border">
                  <td colSpan={8} className="p-2">
                    <Button variant="ghost" size="sm" onClick={addNewRow} className="w-full text-muted-foreground hover:text-foreground">
                      <Plus className="h-4 w-4 mr-2" />
                      {t("timesheet.addRow")}
                    </Button>
                  </td>
                </tr>
                {/* Totals Row */}
                <tr className="bg-primary/5 font-semibold">
                  <td colSpan={2} className="p-4 text-foreground">{t("timesheet.dailyTotals")}</td>
                  {weekDays.map((_, index) => (
                    <td key={index} className="p-4 text-center text-foreground">
                      {calculateColumnTotal(index)}h
                    </td>
                  ))}
                  <td className="p-4 text-center text-foreground bg-primary/10">
                    {calculateGrandTotal()}h
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline">{t("timesheet.saveDraft")}</Button>
          <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">{t("timesheet.submitWeek")}</Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default TimeSheet;

import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertTriangle, Search, CalendarIcon, X } from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { parseDateLocal, getWeekMonday } from "@/lib/timesheetUtils";

// 0923-209: helpers compartidos por ApprovedLinesTab y ReversalRequestsTab (review iteración 1,
// nice-to-have #1) -- ambos formateaban la semana y renderizaban la misma barra de filtros por
// separado.

export function formatReversalWeekRange(weekStartDate: string) {
  const startDate = parseDateLocal(weekStartDate);
  const endDate = addDays(startDate, 4);
  return `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
}

export interface ReversalFilterBarProps {
  staffSearch: string;
  setStaffSearch: (v: string) => void;
  engagementSearch: string;
  setEngagementSearch: (v: string) => void;
  weekFilter: string;
  setWeekFilter: (v: string) => void;
}

export function ReversalFiltersBar({
  staffSearch,
  setStaffSearch,
  engagementSearch,
  setEngagementSearch,
  weekFilter,
  setWeekFilter,
}: ReversalFilterBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("approval.searchPlaceholder")}
          value={staffSearch}
          onChange={(e) => setStaffSearch(e.target.value)}
          className="pl-10"
        />
      </div>
      <Input
        placeholder={t("timesheet.engagement")}
        value={engagementSearch}
        onChange={(e) => setEngagementSearch(e.target.value)}
        className="max-w-xs"
      />
      <WeekFilterDatePicker value={weekFilter} onChange={setWeekFilter} />
    </div>
  );
}

// `<input type="date">` delega el formato mostrado al locale del navegador -- en un navegador
// en inglés se ve MM/DD/YYYY, justo al lado de rangos de semana que siempre están en DD/MM/YYYY
// (review iteración 5, hallazgo #4). Mismo patrón `Popover` + `Calendar` + `common.pickDate` que
// ya usa el resto del repo (p. ej. StaffAssignmentsCard.tsx, EngagementForm.tsx) para forzar
// DD/MM/YYYY sin importar el locale del SO.
function WeekFilterDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const selected = value ? parseDateLocal(value) : undefined;

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-[180px] justify-start text-left font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            {selected ? format(selected, "dd/MM/yyyy") : t("common.pickDate")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) =>
              // `week_start_date` es siempre lunes y los filtros comparan igualdad exacta: cualquier
              // día elegido se normaliza a su lunes (review iteración 10, hallazgo #3).
              onChange(date ? format(getWeekMonday(date), "yyyy-MM-dd") : "")
            }
            defaultMonth={selected}
            initialFocus
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      {selected && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label={t("common.clear")}
          onClick={() => onChange("")}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// Fallo de query (isError): antes se mostraba como "sin datos", indistinguible de una lista
// vacía real (review iteración 1, SHOULD FIX #1).
export function ReversalErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="text-sm text-muted-foreground">{t("approval.loadError")}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("approval.retry")}
      </Button>
    </div>
  );
}

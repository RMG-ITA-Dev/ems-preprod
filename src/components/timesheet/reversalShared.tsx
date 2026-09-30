import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Search } from "lucide-react";
import { format, addDays } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";

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
      <Input
        type="date"
        value={weekFilter}
        onChange={(e) => setWeekFilter(e.target.value)}
        className="max-w-[180px]"
      />
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

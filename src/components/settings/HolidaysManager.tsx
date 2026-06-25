import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Wand2 } from "lucide-react";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useHolidays, type Holiday } from "@/hooks/useHolidays";
import { useStaff } from "@/hooks/useEmsData";
import { HolidayForm } from "@/components/forms/HolidayForm";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useGenerateNationalHolidays } from "@/hooks/mutations/useHolidayMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { getBoliviaNationalHolidays, NATIONAL_HOLIDAY_NAMES, normalizeHolidayName } from "@/lib/boliviaHolidays";

export function HolidaysManager() {
  const { t } = useTranslation();
  const { data: holidays, isLoading } = useHolidays();
  const { data: staffList } = useStaff();

  const [formOpen, setFormOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const generateMutation = useGenerateNationalHolidays();
  const { staffRecord } = useCurrentStaff();

  const currentYear = new Date().getFullYear();
  const [targetYear, setTargetYear] = useState(currentYear + 1);
  const minYear = currentYear;
  const maxYear = currentYear + 5;
  const generatedList = getBoliviaNationalHolidays(targetYear);
  const generatedDates = new Set(generatedList.map((g) => g.date));
  const targetYearHolidays = (holidays ?? []).filter((h) =>
    h.holiday_date.startsWith(`${targetYear}-`)
  );
  const exactMatch = targetYearHolidays.filter((h) => generatedDates.has(h.holiday_date)).length;
  const staleToReplace = targetYearHolidays.filter(
    (h) =>
      !generatedDates.has(h.holiday_date) &&
      NATIONAL_HOLIDAY_NAMES.has(normalizeHolidayName(h.holiday_name))
  ).length;
  const toInsertCount = generatedList.length - exactMatch;

  const getStaffName = (staffId: string) => {
    const s = staffList?.find((st) => st.staff_id === staffId);
    return s ? `${s.first_name} ${s.last_name}` : "—";
  };

  const columns: Column<Holiday>[] = [
    {
      key: "holiday_date",
      label: t("holiday.date"),
      sortable: true,
      mobilePriority: "primary" as const,
      render: (row) => {
        const d = new Date(row.holiday_date + "T12:00:00");
        return format(d, "dd/MM/yyyy");
      },
    },
    {
      key: "holiday_name",
      label: t("holiday.name"),
      sortable: true,
      mobilePriority: "primary" as const,
    },
    {
      key: "created_by",
      label: t("holiday.createdBy"),
      sortable: false,
      mobilePriority: "secondary" as const,
      render: (row) => getStaffName(row.created_by),
    },
    {
      key: "created_at",
      label: t("common.createdAt"),
      sortable: true,
      mobilePriority: "secondary" as const,
      render: (row) =>
        row.created_at ? format(new Date(row.created_at), "dd/MM/yyyy") : "—",
    },
  ];

  return (
    <>
      <div className="flex justify-end items-center gap-2 mb-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={targetYear <= minYear}
            onClick={() => setTargetYear((y) => y - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center font-medium tabular-nums">{targetYear}</span>
          <Button
            variant="ghost"
            size="icon"
            disabled={targetYear >= maxYear}
            onClick={() => setTargetYear((y) => y + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          disabled={generateMutation.isPending || !staffRecord}
          onClick={() => setGenerateOpen(true)}
        >
          <Wand2 className="h-4 w-4 mr-2" />
          {t("holiday.generateButton", { year: targetYear })}
        </Button>
        <Button
          variant="default"
          onClick={() => {
            setSelectedHoliday(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("holiday.addHoliday")}
        </Button>
      </div>

      <DataTable
        data={holidays || []}
        columns={columns}
        searchPlaceholder={t("common.search")}
        searchKeys={["holiday_name"]}
        isLoading={isLoading}
        onRowClick={(row) => {
          setSelectedHoliday(row);
          setFormOpen(true);
        }}
        getRowId={(row) => row.holiday_id}
      />

      <HolidayForm
        open={formOpen}
        onOpenChange={setFormOpen}
        holiday={selectedHoliday}
      />

      <AlertDialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("holiday.generateConfirmTitle", { year: targetYear })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("holiday.generateConfirmDesc", {
                year: targetYear,
                total: generatedList.length,
                alreadyExist: exactMatch,
                staleToReplace,
                toInsert: toInsertCount,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (staffRecord) {
                  generateMutation.mutate({ created_by: staffRecord.staff_id, year: targetYear });
                }
                setGenerateOpen(false);
              }}
            >
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

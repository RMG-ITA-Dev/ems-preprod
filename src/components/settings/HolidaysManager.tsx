import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Wand2 } from "lucide-react";
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
  const minTargetYear = currentYear;
  const maxTargetYear = currentYear + 5;
  const [targetYear, setTargetYear] = useState(currentYear + 1);
  const generatedList = getBoliviaNationalHolidays(targetYear);
  // Composite key mirrors the mutation's dedup logic (UNIQUE(holiday_date, oficina)) —
  // a national and a departmental holiday may legitimately share a date.
  const holidayKey = (date: string, oficina: number) => `${date}:${oficina}`;
  const generatedByKey = new Map(generatedList.map((g) => [holidayKey(g.date, g.oficina), g.name]));
  const targetYearHolidays = (holidays ?? []).filter((h) =>
    h.holiday_date.startsWith(`${targetYear}-`)
  );
  const existingByKey = new Map(targetYearHolidays.map((h) => [holidayKey(h.holiday_date, h.oficina), h]));
  const exactMatch = targetYearHolidays.filter(
    (h) => generatedByKey.get(holidayKey(h.holiday_date, h.oficina)) === normalizeHolidayName(h.holiday_name)
  ).length;
  const crossedStale = targetYearHolidays.filter((h) => {
    const n = normalizeHolidayName(h.holiday_name);
    const key = holidayKey(h.holiday_date, h.oficina);
    return NATIONAL_HOLIDAY_NAMES.has(n) && generatedByKey.has(key) && generatedByKey.get(key) !== n;
  });
  const regularStale = targetYearHolidays.filter((h) => {
    const n = normalizeHolidayName(h.holiday_name);
    return NATIONAL_HOLIDAY_NAMES.has(n) && !generatedByKey.has(holidayKey(h.holiday_date, h.oficina));
  });
  const staleToReplace = crossedStale.length + regularStale.length;
  // Regular stale entries sit at wrong (date, oficina) slots; their generated slots are
  // free and WILL be inserted. Only crossed stale (UPDATE in-place) don't produce a new
  // row, so only those reduce toInsertCount.
  const toInsertCount = generatedList.length - exactMatch - crossedStale.length;

  // Per-date/office preview shown in the confirmation dialog — mirrors exactly what the
  // mutation will do with each generated slot (Plan v2 §c: preview must include oficina).
  type PreviewStatus = "exact" | "update" | "new";
  const previewRows: { date: string; name: string; oficina: 0 | 1 | 2; status: PreviewStatus }[] =
    generatedList.map((g) => {
      const key = holidayKey(g.date, g.oficina);
      const existing = existingByKey.get(key);
      const isCrossedStale = crossedStale.some((h) => holidayKey(h.holiday_date, h.oficina) === key);
      const status: PreviewStatus =
        existing && normalizeHolidayName(existing.holiday_name) === g.name
          ? "exact"
          : isCrossedStale
            ? "update"
            : "new";
      return { date: g.date, name: g.name, oficina: g.oficina, status };
    });

  const getStaffName = (staffId: string) => {
    const s = staffList?.find((st) => st.staff_id === staffId);
    return s ? `${s.first_name} ${s.last_name}` : "—";
  };

  const getOficinaLabel = (oficina: number | undefined) => {
    switch (oficina) {
      case 1:
        return t("engagement.oficina_laPaz");
      case 2:
        return t("engagement.oficina_santaCruz");
      default:
        return t("engagement.oficina_ambos");
    }
  };

  const getPreviewStatusLabel = (status: "exact" | "update" | "new") => {
    switch (status) {
      case "exact":
        return t("holiday.generatePreviewExact");
      case "update":
        return t("holiday.generatePreviewUpdate");
      case "new":
        return t("holiday.generatePreviewNew");
    }
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
      key: "oficina",
      label: t("holiday.oficina"),
      sortable: true,
      mobilePriority: "secondary" as const,
      render: (row) => getOficinaLabel(row.oficina),
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
      <DataTable
        data={holidays || []}
        columns={columns}
        searchPlaceholder={t("common.search")}
        searchKeys={["holiday_name"]}
        isLoading={isLoading}
        headerActions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={targetYear <= minTargetYear}
              onClick={() => setTargetYear((y) => y - 1)}
              aria-label={t("holiday.previousYear")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              disabled={generateMutation.isPending || !staffRecord}
              onClick={() => setGenerateOpen(true)}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              {t("holiday.generateButton", { year: targetYear })}
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={targetYear >= maxTargetYear}
              onClick={() => setTargetYear((y) => y + 1)}
              aria-label={t("holiday.nextYear")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
        newButtonLabel={t("holiday.addHoliday")}
        onNewClick={() => {
          setSelectedHoliday(null);
          setFormOpen(true);
        }}
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
          <div className="max-h-64 overflow-y-auto rounded-md border divide-y text-sm">
            {previewRows.map((row) => (
              <div
                key={`${row.date}:${row.oficina}`}
                className="flex items-center justify-between gap-2 px-3 py-1.5"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 tabular-nums">
                    {format(new Date(row.date + "T12:00:00"), "dd/MM/yyyy")}
                  </span>
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-muted-foreground">
                  <span>{getOficinaLabel(row.oficina)}</span>
                  <span>·</span>
                  <span>{getPreviewStatusLabel(row.status)}</span>
                </span>
              </div>
            ))}
          </div>
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

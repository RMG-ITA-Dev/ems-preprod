import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Copy } from "lucide-react";
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
import { useReplicateHolidaysToNextYear } from "@/hooks/mutations/useHolidayMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

export function HolidaysManager() {
  const { t } = useTranslation();
  const { data: holidays, isLoading } = useHolidays();
  const { data: staffList } = useStaff();

  const [formOpen, setFormOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
  const [replicateOpen, setReplicateOpen] = useState(false);
  const replicateMutation = useReplicateHolidaysToNextYear();
  const { staffRecord } = useCurrentStaff();

  const currentYear = new Date().getFullYear();
  const sourceCount = (holidays ?? []).filter((h) =>
    h.holiday_date.startsWith(`${currentYear}-`)
  ).length;
  const hasSource = sourceCount > 0;

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
      <div className="flex justify-end mb-2">
        <Button
          variant="outline"
          disabled={!hasSource || replicateMutation.isPending || !staffRecord}
          onClick={() => setReplicateOpen(true)}
        >
          <Copy className="h-4 w-4 mr-2" />
          {t("holiday.replicateButton")}
        </Button>
      </div>

      <DataTable
        data={holidays || []}
        columns={columns}
        searchPlaceholder={t("common.search")}
        searchKeys={["holiday_name"]}
        isLoading={isLoading}
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

      <AlertDialog open={replicateOpen} onOpenChange={setReplicateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("holiday.replicateConfirmTitle", {
                fromYear: currentYear,
                toYear: currentYear + 1,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("holiday.replicateConfirmDesc", {
                count: sourceCount,
                fromYear: currentYear,
                toYear: currentYear + 1,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (staffRecord) {
                  replicateMutation.mutate({ created_by: staffRecord.staff_id });
                }
                setReplicateOpen(false);
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

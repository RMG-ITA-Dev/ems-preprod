import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useHolidays, type Holiday } from "@/hooks/useHolidays";
import { useStaff } from "@/hooks/useEmsData";
import { HolidayForm } from "@/components/forms/HolidayForm";

export function HolidaysManager() {
  const { t } = useTranslation();
  const { data: holidays, isLoading } = useHolidays();
  const { data: staffList } = useStaff();

  const [formOpen, setFormOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);

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
    </>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { Lock, AlertTriangle } from "lucide-react";
import { useHolidays, useHolidayEngagementId, type Holiday } from "@/hooks/useHolidays";
import { useDeleteHoliday } from "@/hooks/mutations/useHolidayMutations";
import { useUpdateGlobalSetting } from "@/hooks/mutations";
import { useEngagements, useStaff } from "@/hooks/useEmsData";
import { HolidayForm } from "@/components/forms/HolidayForm";

export function HolidaysManager() {
  const { t } = useTranslation();
  const { data: holidays, isLoading } = useHolidays();
  const { data: engagements } = useEngagements();
  const { data: staffList } = useStaff();
  const holidayEngagementId = useHolidayEngagementId();
  const updateSetting = useUpdateGlobalSetting();
  const deleteHoliday = useDeleteHoliday();

  const [formOpen, setFormOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [selectedEngagementId, setSelectedEngagementId] = useState<string>(
    holidayEngagementId ?? ""
  );

  const handleSaveEngagement = () => {
    updateSetting.mutate({ key: "HOLIDAY_ENGAGEMENT_ID", value: selectedEngagementId });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteHoliday.mutate(deleteTarget.holiday_id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

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
      label: t("common.dates"),
      sortable: true,
      mobilePriority: "secondary" as const,
      render: (row) =>
        row.created_at ? format(new Date(row.created_at), "dd/MM/yyyy") : "—",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Holiday Engagement Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("settings.holidayEngagement")}
            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
              <Lock className="h-3 w-3 mr-1" />
              {t("settings.adminOnly")}
            </Badge>
          </CardTitle>
          <CardDescription>{t("settings.holidayEngagementHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!holidayEngagementId && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t("settings.holidayNotConfigured")}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-md">
              <Select value={selectedEngagementId} onValueChange={setSelectedEngagementId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("timesheet.selectEngagement")} />
                </SelectTrigger>
                <SelectContent>
                  {engagements?.map((eng) => (
                    <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                      <span className="font-mono text-xs opacity-60 mr-2">
                        {eng.engagement_code}
                      </span>
                      {eng.engagement_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSaveEngagement}
              disabled={updateSetting.isPending || !selectedEngagementId}
            >
              {t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Holidays Table */}
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("holiday.deleteHoliday")}</AlertDialogTitle>
            <AlertDialogDescription>{t("holiday.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive/80 text-destructive-foreground hover:bg-destructive">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

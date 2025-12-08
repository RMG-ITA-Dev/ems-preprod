import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { Badge } from "@/components/ui/badge";
import { useTimerEntries, TimerEntry } from "@/hooks/useTimerEntries";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const TrackerList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentLanguage } = useLanguage();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { data: entries, isLoading: entriesLoading } = useTimerEntries();

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "—";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins.toString().padStart(2, "0")}m`;
    }
    return `${mins}m`;
  };

  const formatTimeRange = (startedAt: string, endedAt: string | null) => {
    const startDate = new Date(startedAt);
    const startTime = format(startDate, "HH:mm");
    if (!endedAt) return `${startTime} - ...`;
    const endDate = new Date(endedAt);
    const endTime = format(endDate, "HH:mm");
    return `${startTime} - ${endTime}`;
  };

  const columns: Column<TimerEntry>[] = [
    {
      key: "started_at",
      label: t("tracker.date"),
      sortable: true,
      className: "w-28",
      render: (row) => {
        const date = new Date(row.started_at);
        return format(date, "dd/MM/yyyy", { locale: currentLanguage === "es" ? es : undefined });
      },
    },
    {
      key: "time",
      label: t("tracker.time"),
      sortable: false,
      className: "w-28",
      render: (row) => formatTimeRange(row.started_at, row.ended_at),
    },
    {
      key: "duration_minutes",
      label: t("tracker.duration"),
      sortable: true,
      className: "w-24 text-right font-mono",
      render: (row) => formatDuration(row.duration_minutes),
    },
    {
      key: "engagement_id",
      label: t("tracker.engagement"),
      sortable: true,
      render: (row) => (
        <span className="font-medium">
          {row.engagement?.engagement_code || "—"} - {row.engagement?.engagement_name || ""}
        </span>
      ),
    },
    {
      key: "activity_id",
      label: t("tracker.activity"),
      sortable: true,
      render: (row) => (
        <span>
          {row.activity?.activity_code || "—"} - {row.activity?.description || ""}
        </span>
      ),
    },
    {
      key: "description",
      label: t("tracker.description"),
      sortable: false,
      className: "max-w-48 truncate",
      render: (row) => row.description || "—",
    },
    {
      key: "is_imported",
      label: t("tracker.status"),
      sortable: true,
      className: "w-28",
      render: (row) => {
        if (!row.ended_at) {
          return (
            <Badge className="bg-success/10 text-success border-success/20 animate-pulse">
              {t("tracker.running")}
            </Badge>
          );
        }
        if (row.is_imported) {
          return (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {t("tracker.imported")}
            </Badge>
          );
        }
        return (
          <Badge className="bg-info/10 text-info border-info/20">
            {t("tracker.ready")}
          </Badge>
        );
      },
    },
  ];

  // Calculate totals for footer
  const totalMinutes = entries?.reduce((sum, e) => sum + (e.duration_minutes || 0), 0) || 0;
  const totalHours = (totalMinutes / 60).toFixed(1);

  if (staffLoading) {
    return (
      <AppLayout title={t("tracker.title")}>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </AppLayout>
    );
  }

  if (!staffRecord) {
    return (
      <AppLayout title={t("tracker.title")}>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("timesheet.noStaffRecord")}</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("tracker.listTitle")}>
      <div className="space-y-4">
        <DataTable
          data={entries || []}
          columns={columns}
          searchPlaceholder={t("tracker.searchPlaceholder")}
          searchKeys={["description", "engagement.engagement_name", "engagement.engagement_code", "activity.activity_code"]}
          isLoading={entriesLoading}
          newButtonLabel={t("tracker.newEntry")}
          onNewClick={() => navigate("/tracker/new")}
          onRowClick={(row) => navigate(`/tracker/${row.timer_id}`)}
          getRowId={(row) => row.timer_id}
          statusFilter={{
            key: "is_imported",
            options: [
              { value: "ready", label: t("tracker.ready") },
              { value: "imported", label: t("tracker.imported") },
            ],
          }}
        />
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border rounded-lg">
          <span className="text-sm font-medium text-muted-foreground">
            {t("tracker.totalTime")}
          </span>
          <span className="font-mono font-bold">
            {totalHours} {t("tracker.hours")}
          </span>
        </div>
      </div>
    </AppLayout>
  );
};

export default TrackerList;

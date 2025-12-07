import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { useUserRole } from "@/hooks/useUserRole";
import { useAllTimeEntries, useStaff, useEngagements } from "@/hooks/useEmsData";
import { useUpdateTimeEntry } from "@/hooks/useEmsMutations";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface TimeEntryRow {
  time_id: string;
  date_worked: string;
  hours_logged: number;
  description: string | null;
  is_forecast: boolean | null;
  staff: { staff_id: string; first_name: string; last_name: string; short_name: string | null } | null;
  engagement: { engagement_id: string; engagement_name: string; engagement_code: string | null } | null;
  activity: { activity_id: string; activity_code: string; description: string } | null;
}

export default function AdminTimeEntries() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const { data: timeEntries, isLoading } = useAllTimeEntries();
  const { data: staffList } = useStaff();
  const { data: engagements } = useEngagements();
  const updateTimeEntry = useUpdateTimeEntry();

  const [search, setSearch] = useState("");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [engagementFilter, setEngagementFilter] = useState<string>("all");
  const [editEntry, setEditEntry] = useState<TimeEntryRow | null>(null);
  const [editForm, setEditForm] = useState({
    date_worked: "",
    hours_logged: 0,
    description: "",
  });

  // Redirect non-admins
  if (!roleLoading && !isAdmin) {
    navigate("/");
    return null;
  }

  const filteredData = useMemo(() => {
    if (!timeEntries) return [];
    return (timeEntries as TimeEntryRow[]).filter((entry) => {
      const searchLower = search.toLowerCase();
      const staffName = entry.staff
        ? `${entry.staff.first_name} ${entry.staff.last_name}`.toLowerCase()
        : "";
      const engName = entry.engagement?.engagement_name?.toLowerCase() || "";
      const actCode = entry.activity?.activity_code?.toLowerCase() || "";

      const matchesSearch =
        !search ||
        staffName.includes(searchLower) ||
        engName.includes(searchLower) ||
        actCode.includes(searchLower);

      const matchesStaff =
        staffFilter === "all" || entry.staff?.staff_id === staffFilter;
      const matchesEngagement =
        engagementFilter === "all" ||
        entry.engagement?.engagement_id === engagementFilter;

      return matchesSearch && matchesStaff && matchesEngagement;
    });
  }, [timeEntries, search, staffFilter, engagementFilter]);

  const handleRowClick = (entry: TimeEntryRow) => {
    setEditEntry(entry);
    setEditForm({
      date_worked: entry.date_worked,
      hours_logged: entry.hours_logged,
      description: entry.description || "",
    });
  };

  const handleSave = async () => {
    if (!editEntry) return;
    await updateTimeEntry.mutateAsync({
      time_id: editEntry.time_id,
      date_worked: editForm.date_worked,
      hours_logged: editForm.hours_logged,
      description: editForm.description || null,
    });
    setEditEntry(null);
  };

  const getStaffDisplay = (staff: TimeEntryRow["staff"]) => {
    if (!staff) return "-";
    return staff.short_name || `${staff.first_name} ${staff.last_name}`;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">
          {t("adminTimeEntries.title")}
        </h1>

        <div className="flex flex-wrap gap-4">
          <Input
            placeholder={t("adminTimeEntries.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("adminTimeEntries.filterByStaff")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adminTimeEntries.allStaff")}</SelectItem>
              {staffList?.map((s) => (
                <SelectItem key={s.staff_id} value={s.staff_id}>
                  {s.short_name || `${s.first_name} ${s.last_name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={engagementFilter} onValueChange={setEngagementFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("adminTimeEntries.filterByEngagement")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adminTimeEntries.allEngagements")}</SelectItem>
              {engagements?.map((e) => (
                <SelectItem key={e.engagement_id} value={e.engagement_id}>
                  {e.engagement_code || e.engagement_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-28">{t("adminTimeEntries.date")}</TableHead>
                <TableHead>{t("adminTimeEntries.staff")}</TableHead>
                <TableHead>{t("adminTimeEntries.engagement")}</TableHead>
                <TableHead>{t("adminTimeEntries.activity")}</TableHead>
                <TableHead className="w-20 text-right">{t("adminTimeEntries.hours")}</TableHead>
                <TableHead className="max-w-xs">{t("adminTimeEntries.description")}</TableHead>
                <TableHead className="w-20">{t("adminTimeEntries.isForecast")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t("common.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((entry) => (
                  <TableRow
                    key={entry.time_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(entry)}
                  >
                    <TableCell className="font-mono text-sm">
                      {format(new Date(entry.date_worked), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>{getStaffDisplay(entry.staff)}</TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {entry.engagement?.engagement_code || "-"}
                      </span>{" "}
                      {entry.engagement?.engagement_name}
                    </TableCell>
                    <TableCell>{entry.activity?.activity_code || "-"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.hours_logged.toFixed(1)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {entry.description || "-"}
                    </TableCell>
                    <TableCell>
                      {entry.is_forecast && (
                        <Badge variant="outline" className="text-xs">
                          {t("adminTimeEntries.isForecast")}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!editEntry} onOpenChange={() => setEditEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("adminTimeEntries.editEntry")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("adminTimeEntries.staff")}</Label>
              <Input
                value={getStaffDisplay(editEntry?.staff || null)}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adminTimeEntries.engagement")}</Label>
              <Input
                value={editEntry?.engagement?.engagement_name || "-"}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adminTimeEntries.activity")}</Label>
              <Input
                value={editEntry?.activity?.activity_code || "-"}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("adminTimeEntries.date")}</Label>
                <Input
                  type="date"
                  value={editForm.date_worked}
                  onChange={(e) =>
                    setEditForm({ ...editForm, date_worked: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("adminTimeEntries.hours")}</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={editForm.hours_logged}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      hours_logged: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("adminTimeEntries.description")}</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={updateTimeEntry.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

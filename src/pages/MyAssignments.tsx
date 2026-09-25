import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, StickyNote } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useMyAssignments,
  clampProgressForBar,
  progressPercent,
  type MyAssignmentRow,
} from "@/hooks/useMyAssignments";

type ToggleValue = "current" | "historical" | "all";

function isHistorical(row: MyAssignmentRow): boolean {
  return row.deleted_at !== null || row.status === "CANCELLED";
}

function formatDate(dateString: string): string {
  try {
    return format(new Date(`${dateString}T00:00:00`), "dd/MM/yyyy");
  } catch {
    return "-";
  }
}

const MyAssignments = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const engagementIdParam = searchParams.get("engagementId");

  const { data: rows, isLoading, isError, refetch } = useMyAssignments();

  // Deep-link de notificación (engagement.staffing.changed, context assigned/unassigned):
  // la fila puede haber quedado histórica (baja) si el hecho fue una baja, así que el toggle
  // arranca en "all" cuando llega con engagementId — plan_v2.md §"Notificaciones".
  const [toggle, setToggle] = useState<ToggleValue>(engagementIdParam ? "all" : "current");
  const [engagementFilter, setEngagementFilter] = useState<string>(engagementIdParam ?? "all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const currentYear = new Date().getFullYear();
  const [dateFrom, setDateFrom] = useState(`${currentYear}-01-01`);
  const [dateTo, setDateTo] = useState(`${currentYear}-12-31`);

  const [notesRow, setNotesRow] = useState<MyAssignmentRow | null>(null);

  const engagementOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows ?? []) {
      if (row.engagement) {
        map.set(row.engagement_id, row.engagement.engagement_code ?? row.engagement.engagement_name);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows ?? []) {
      if (row.category) map.set(row.category_id, row.category.category_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return (rows ?? []).filter((row) => {
      const historical = isHistorical(row);
      if (toggle === "current" && historical) return false;
      if (toggle === "historical" && !historical) return false;
      // Acotador de año calendario: solo narrow en Históricas/Todas (rendimiento), nunca en
      // Vigentes — plan_v2.md §"Filtro de fecha por defecto".
      if (toggle !== "current" && (row.end_date < dateFrom || row.start_date > dateTo)) {
        return false;
      }
      if (engagementFilter !== "all" && row.engagement_id !== engagementFilter) return false;
      if (categoryFilter !== "all" && row.category_id !== categoryFilter) return false;
      return true;
    });
  }, [rows, toggle, dateFrom, dateTo, engagementFilter, categoryFilter]);

  const renderProgress = (row: MyAssignmentRow) => {
    const pct = progressPercent(row.loaded_hours, row.assigned_hours);
    const approvedPct = row.assigned_hours > 0 ? (row.approved_hours / row.assigned_hours) * 100 : 0;
    const pendingPct = row.assigned_hours > 0 ? (row.pending_hours / row.assigned_hours) * 100 : 0;
    const isOver = pct > 100;
    const approvedWidth = Math.min(approvedPct, 100);
    const pendingWidth = Math.min(pendingPct, 100 - approvedWidth);
    return (
      <div className="flex items-center gap-2">
        <div
          className="h-2 w-24 rounded-full bg-muted overflow-hidden flex shrink-0"
          role="progressbar"
          aria-valuenow={clampProgressForBar(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {isOver ? (
            <div className="h-full w-full bg-destructive" title={t("myAssignments.progress.over")} />
          ) : (
            <>
              <div
                className="h-full bg-primary"
                style={{ width: `${approvedWidth}%` }}
                title={t("myAssignments.progress.approved")}
              />
              <div
                className="h-full bg-primary/40"
                style={{ width: `${pendingWidth}%` }}
                title={t("myAssignments.progress.pending")}
              />
            </>
          )}
        </div>
        <span className="text-xs font-mono whitespace-nowrap">
          {t("myAssignments.progressText", {
            approved: Math.round(row.approved_hours),
            pending: Math.round(row.pending_hours),
            assigned: Math.round(row.assigned_hours),
            pct,
          })}
        </span>
      </div>
    );
  };

  const renderNotesButton = (row: MyAssignmentRow) => {
    if (!row.notes || !row.notes.trim()) return null;
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label={t("myAssignments.notesModal.title")}
        data-testid={`notes-button-${row.assignment_id}`}
        onClick={() => setNotesRow(row)}
      >
        <StickyNote className="h-4 w-4" />
      </Button>
    );
  };

  return (
    <AppLayout title={t("myAssignments.title")}>
      <div className="space-y-4">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={engagementFilter} onValueChange={setEngagementFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder={t("myAssignments.filters.engagement")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("myAssignments.filters.allEngagements")}</SelectItem>
              {engagementOptions.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t("myAssignments.filters.category")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("myAssignments.filters.allCategories")}</SelectItem>
              {categoryOptions.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ToggleGroup
            type="single"
            value={toggle}
            onValueChange={(v) => v && setToggle(v as ToggleValue)}
            className="justify-start"
          >
            <ToggleGroupItem value="current" aria-label={t("myAssignments.filters.toggle.current")}>
              {t("myAssignments.filters.toggle.current")}
            </ToggleGroupItem>
            <ToggleGroupItem value="historical" aria-label={t("myAssignments.filters.toggle.historical")}>
              {t("myAssignments.filters.toggle.historical")}
            </ToggleGroupItem>
            <ToggleGroupItem value="all" aria-label={t("myAssignments.filters.toggle.all")}>
              {t("myAssignments.filters.toggle.all")}
            </ToggleGroupItem>
          </ToggleGroup>

          {toggle !== "current" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
                aria-label={t("myAssignments.filters.dateRange")}
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2" data-testid="my-assignments-loading">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <Alert variant="destructive" data-testid="my-assignments-error">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{t("myAssignments.loadError")}</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t("myAssignments.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : filteredRows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm" data-testid="my-assignments-empty">
            {rows?.length === 0 ? t("myAssignments.empty") : t("common.noResults")}
          </p>
        ) : (
          <>
            {/* Tabla (>= md) */}
            <div className="hidden md:block border border-border rounded-lg overflow-hidden" data-testid="my-assignments-table">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t("myAssignments.table.engagement")}</TableHead>
                    <TableHead>{t("myAssignments.table.client")}</TableHead>
                    <TableHead>{t("myAssignments.table.role")}</TableHead>
                    <TableHead>{t("myAssignments.table.period")}</TableHead>
                    <TableHead>{t("myAssignments.table.status")}</TableHead>
                    <TableHead>{t("myAssignments.table.progress")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.assignment_id}>
                      <TableCell>
                        <div className="font-medium">{row.engagement?.engagement_code ?? row.engagement?.engagement_name ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">{row.engagement?.engagement_name}</div>
                      </TableCell>
                      <TableCell>{row.engagement?.client?.client_legal_name ?? "-"}</TableCell>
                      <TableCell>{row.category?.category_name ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.start_date)} – {formatDate(row.end_date)}
                      </TableCell>
                      <TableCell>{t(`myAssignments.status.${row.status}`)}</TableCell>
                      <TableCell>{renderProgress(row)}</TableCell>
                      <TableCell>{renderNotesButton(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Tarjetas (< md) */}
            <div className="md:hidden space-y-2" data-testid="my-assignments-cards">
              {filteredRows.map((row) => (
                <div key={row.assignment_id} className="rounded-md border border-border p-3 text-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{row.engagement?.engagement_code ?? row.engagement?.engagement_name ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{row.engagement?.client?.client_legal_name ?? "-"}</div>
                    </div>
                    {renderNotesButton(row)}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{row.category?.category_name ?? "-"}</span>
                    <span>{t(`myAssignments.status.${row.status}`)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(row.start_date)} – {formatDate(row.end_date)}
                  </div>
                  {renderProgress(row)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={notesRow !== null} onOpenChange={(open) => !open && setNotesRow(null)}>
        <DialogContent data-testid="my-assignments-notes-modal">
          <DialogHeader>
            <DialogTitle>{t("myAssignments.notesModal.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">{notesRow?.notes}</p>
          {notesRow && (
            <p className="text-xs text-muted-foreground">
              {t("myAssignments.allocation", { percent: Math.round(notesRow.allocation_percent) })}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default MyAssignments;

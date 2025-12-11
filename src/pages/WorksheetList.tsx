import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { useWorksheets } from "@/hooks/useWorksheetData";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-warning text-warning-foreground",
  approved: "bg-success text-success-foreground",
  archived: "bg-muted text-muted-foreground",
};

const WorksheetList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: worksheets, isLoading } = useWorksheets();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Filter worksheets
  const filteredWorksheets = useMemo(() => {
    return worksheets?.filter((ws) => {
      const matchesSearch =
        !searchQuery ||
        ws.engagement?.engagement_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ws.engagement?.engagement_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ws.engagement?.client?.client_legal_name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || ws.status === statusFilter;

      return matchesSearch && matchesStatus;
    }) || [];
  }, [worksheets, searchQuery, statusFilter]);

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy");
    } catch {
      return "-";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("workMatrix.title")}
          </h1>
          <Button
            onClick={() => navigate("/worksheets/new")}
            className="btn-action shrink-0"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("workMatrix.newWorksheet")}
          </Button>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("engagement.searchPlaceholder")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t("common.allStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allStatus")}</SelectItem>
              <SelectItem value="draft">{t("workMatrix.status.draft")}</SelectItem>
              <SelectItem value="approved">{t("workMatrix.status.approved")}</SelectItem>
              <SelectItem value="archived">{t("workMatrix.status.archived")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Data Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="table-dense">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-28">{t("engagement.code")}</TableHead>
                  <TableHead className="min-w-[200px]">{t("engagement.name")}</TableHead>
                  <TableHead className="min-w-[180px]">{t("engagement.client")}</TableHead>
                  <TableHead className="w-32">{t("engagement.partner")}</TableHead>
                  <TableHead className="w-32">{t("engagement.manager")}</TableHead>
                  <TableHead className="w-24 text-center">{t("common.status")}</TableHead>
                  <TableHead className="w-24">{t("tracker.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredWorksheets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {worksheets?.length === 0
                        ? t("workMatrix.emptyState")
                        : t("common.noResults")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredWorksheets.map((ws) => (
                    <TableRow
                      key={ws.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/worksheets/${ws.id}`)}
                    >
                      <TableCell className="font-mono text-muted-foreground">
                        {ws.engagement?.engagement_code || "-"}
                      </TableCell>
                      <TableCell className="font-medium truncate max-w-[220px]">
                        {ws.engagement?.engagement_name || "-"}
                      </TableCell>
                      <TableCell className="truncate max-w-[200px]">
                        {ws.engagement?.client?.client_legal_name || "-"}
                      </TableCell>
                      <TableCell>
                        {ws.engagement?.partner
                          ? ws.engagement.partner.short_name ||
                            `${ws.engagement.partner.first_name} ${ws.engagement.partner.last_name}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {ws.engagement?.manager
                          ? ws.engagement.manager.short_name ||
                            `${ws.engagement.manager.first_name} ${ws.engagement.manager.last_name}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={cn(
                            "text-xs",
                            statusColors[ws.status] || statusColors.draft
                          )}
                        >
                          {t(`workMatrix.status.${ws.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(ws.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default WorksheetList;

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import { useWorksheets } from "@/hooks/useWorksheetData";
import { useAuthorization } from "@/hooks/useAuthorization";
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

type SortDirection = "asc" | "desc" | null;
type SortColumn = "code" | "name" | "client" | "partner" | "manager" | "status" | "date" | null;

const WorksheetList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: worksheets, isLoading } = useWorksheets();
  const { can } = useAuthorization();
  const canCreate = can("worksheet.create");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    }
    if (sortDirection === "asc") {
      return <ArrowUp className="h-3 w-3 text-accent" />;
    }
    return <ArrowDown className="h-3 w-3 text-accent" />;
  };

  // Filter and sort worksheets
  const filteredWorksheets = useMemo(() => {
    let result = worksheets?.filter((ws) => {
      const matchesSearch =
        !searchQuery ||
        ws.engagement?.engagement_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ws.engagement?.engagement_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ws.engagement?.client?.client_legal_name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || ws.status === statusFilter;

      return matchesSearch && matchesStatus;
    }) || [];

    // Apply sorting
    if (sortColumn && sortDirection) {
      result = [...result].sort((a, b) => {
        let comparison = 0;
        switch (sortColumn) {
          case "code":
            comparison = (a.engagement?.engagement_code || "").localeCompare(b.engagement?.engagement_code || "");
            break;
          case "name":
            comparison = (a.engagement?.engagement_name || "").localeCompare(b.engagement?.engagement_name || "");
            break;
          case "client":
            comparison = (a.engagement?.client?.client_legal_name || "").localeCompare(b.engagement?.client?.client_legal_name || "");
            break;
          case "partner": {
            const pA = a.engagement?.partner?.short_name || `${a.engagement?.partner?.first_name || ""} ${a.engagement?.partner?.last_name || ""}`;
            const pB = b.engagement?.partner?.short_name || `${b.engagement?.partner?.first_name || ""} ${b.engagement?.partner?.last_name || ""}`;
            comparison = pA.localeCompare(pB);
            break;
          }
          case "manager": {
            const mA = a.engagement?.manager?.short_name || `${a.engagement?.manager?.first_name || ""} ${a.engagement?.manager?.last_name || ""}`;
            const mB = b.engagement?.manager?.short_name || `${b.engagement?.manager?.first_name || ""} ${b.engagement?.manager?.last_name || ""}`;
            comparison = mA.localeCompare(mB);
            break;
          }
          case "status":
            comparison = (a.status || "").localeCompare(b.status || "");
            break;
          case "date":
            comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            break;
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [worksheets, searchQuery, statusFilter, sortColumn, sortDirection]);

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy");
    } catch {
      return "-";
    }
  };

  return (
    <AppLayout title={t("workMatrix.title")}>
      <div className="space-y-4">
        {/* Header - Search + Button */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("engagement.searchPlaceholder")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {canCreate && (
            <Button
              variant="default"
              onClick={() => navigate("/worksheets/new")}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("workMatrix.newWorksheet")}
            </Button>
          )}
        </div>

        {/* Data Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="table-dense">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-28 text-center border-r border-border">
                    <span
                      className="cursor-pointer hover:text-foreground flex items-center justify-center gap-1"
                      onClick={() => handleSort("code")}
                    >
                      {t("engagement.code")}
                      {getSortIcon("code")}
                    </span>
                  </TableHead>
                  <TableHead className="min-w-[200px] text-center border-r border-border">
                    <span
                      className="cursor-pointer hover:text-foreground flex items-center justify-center gap-1"
                      onClick={() => handleSort("name")}
                    >
                      {t("engagement.name")}
                      {getSortIcon("name")}
                    </span>
                  </TableHead>
                  <TableHead className="min-w-[180px] text-center border-r border-border">
                    <span
                      className="cursor-pointer hover:text-foreground flex items-center justify-center gap-1"
                      onClick={() => handleSort("client")}
                    >
                      {t("engagement.client")}
                      {getSortIcon("client")}
                    </span>
                  </TableHead>
                  <TableHead className="w-32 text-center border-r border-border">
                    <span
                      className="cursor-pointer hover:text-foreground flex items-center justify-center gap-1"
                      onClick={() => handleSort("partner")}
                    >
                      {t("engagement.partner")}
                      {getSortIcon("partner")}
                    </span>
                  </TableHead>
                  <TableHead className="w-32 text-center border-r border-border">
                    <span
                      className="cursor-pointer hover:text-foreground flex items-center justify-center gap-1"
                      onClick={() => handleSort("manager")}
                    >
                      {t("engagement.manager")}
                      {getSortIcon("manager")}
                    </span>
                  </TableHead>
                  <TableHead className="w-24 text-center border-r border-border">
                    <div className="flex items-center justify-center gap-1">
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-1"
                        onClick={() => handleSort("status")}
                      >
                        {t("common.status")}
                        {getSortIcon("status")}
                      </span>
                      <Popover open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
                        <PopoverTrigger asChild>
                          <button className="p-0.5 hover:bg-muted rounded">
                            <Filter className={`h-3 w-3 ${statusFilter !== "all" ? "text-accent" : "opacity-50"}`} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-2" align="start">
                          <Select value={statusFilter} onValueChange={(val) => {
                            setStatusFilter(val);
                            setStatusFilterOpen(false);
                          }}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">{t("common.allStatus")}</SelectItem>
                              <SelectItem value="draft">{t("workMatrix.status.draft")}</SelectItem>
                              <SelectItem value="approved">{t("workMatrix.status.approved")}</SelectItem>
                              <SelectItem value="archived">{t("workMatrix.status.archived")}</SelectItem>
                            </SelectContent>
                          </Select>
                          {statusFilter !== "all" && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              setStatusFilter("all");
                              setStatusFilterOpen(false);
                            }} className="w-full mt-2">
                              {t("common.clear")}
                            </Button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableHead>
                  <TableHead className="w-24 text-center">
                    <span
                      className="cursor-pointer hover:text-foreground flex items-center justify-center gap-1"
                      onClick={() => handleSort("date")}
                    >
                      {t("tracker.date")}
                      {getSortIcon("date")}
                    </span>
                  </TableHead>
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
                      <TableCell className="font-mono text-muted-foreground text-left border-r border-border">
                        {ws.engagement?.engagement_code || "-"}
                      </TableCell>
                      <TableCell className="font-medium truncate max-w-[220px] text-left border-r border-border">
                        {ws.engagement?.engagement_name || "-"}
                      </TableCell>
                      <TableCell className="truncate max-w-[200px] text-left border-r border-border">
                        {ws.engagement?.client?.client_legal_name || "-"}
                      </TableCell>
                      <TableCell className="text-left border-r border-border">
                        {ws.engagement?.partner
                          ? ws.engagement.partner.short_name ||
                            `${ws.engagement.partner.first_name} ${ws.engagement.partner.last_name}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-left border-r border-border">
                        {ws.engagement?.manager
                          ? ws.engagement.manager.short_name ||
                            `${ws.engagement.manager.first_name} ${ws.engagement.manager.last_name}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center border-r border-border">
                        <Badge
                          className={cn(
                            "text-xs",
                            statusColors[ws.status] || statusColors.draft
                          )}
                        >
                          {t(`workMatrix.status.${ws.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-center">
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

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useEngagements, useStaff } from "@/hooks/useEmsData";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import { format } from "date-fns";

interface ClientEngagementsTableProps {
  clientId: string;
}

type SortField = "engagement_code" | "engagement_name" | "partner" | "manager" | "start_date" | "end_date" | "status";
type SortDirection = "asc" | "desc" | null;

export function ClientEngagementsTable({ clientId }: ClientEngagementsTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: engagements, isLoading } = useEngagements();
  const { data: staff } = useStaff();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [managerFilter, setManagerFilter] = useState<string>("all");

  // Filter engagements for this client
  const clientEngagements = useMemo(() => {
    if (!engagements) return [];
    return engagements.filter((e) => e.client_id === clientId);
  }, [engagements, clientId]);

  // Get unique partners and managers from staff for filters
  const partners = useMemo(() => {
    if (!staff) return [];
    return staff.filter((s) => s.category?.category_name?.toLowerCase() === "socio");
  }, [staff]);

  const managers = useMemo(() => {
    if (!staff) return [];
    return staff.filter((s) => s.category?.category_name?.toLowerCase() === "gerente");
  }, [staff]);

  // Get staff name by ID
  const getStaffName = (staffId: string | null) => {
    if (!staffId || !staff) return "-";
    const member = staff.find((s) => s.staff_id === staffId);
    return member ? `${member.first_name} ${member.last_name}` : "-";
  };

  // Apply filters and sorting
  const filteredAndSorted = useMemo(() => {
    let result = [...clientEngagements];

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.engagement_name.toLowerCase().includes(searchLower) ||
          e.engagement_code?.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((e) => e.status === statusFilter);
    }

    // Partner filter
    if (partnerFilter !== "all") {
      result = result.filter((e) => e.partner_id === partnerFilter);
    }

    // Manager filter
    if (managerFilter !== "all") {
      result = result.filter((e) => e.manager_id === managerFilter);
    }

    // Sorting
    if (sortField && sortDirection) {
      result.sort((a, b) => {
        let aVal: string | null = "";
        let bVal: string | null = "";

        switch (sortField) {
          case "engagement_code":
            aVal = a.engagement_code || "";
            bVal = b.engagement_code || "";
            break;
          case "engagement_name":
            aVal = a.engagement_name;
            bVal = b.engagement_name;
            break;
          case "partner":
            aVal = getStaffName(a.partner_id);
            bVal = getStaffName(b.partner_id);
            break;
          case "manager":
            aVal = getStaffName(a.manager_id);
            bVal = getStaffName(b.manager_id);
            break;
          case "start_date":
            aVal = a.start_date || "";
            bVal = b.start_date || "";
            break;
          case "end_date":
            aVal = a.end_date || "";
            bVal = b.end_date || "";
            break;
          case "status":
            aVal = a.status || "";
            bVal = b.status || "";
            break;
        }

        const comparison = aVal.localeCompare(bVal);
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [clientEngagements, search, statusFilter, partnerFilter, managerFilter, sortField, sortDirection, staff]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1" />;
    if (sortDirection === "asc") return <ArrowUp className="h-3 w-3 ml-1" />;
    return <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const getStatusBadge = (status: string | null) => {
    const statusMap: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      active: { variant: "default", label: t("status.active") },
      pending: { variant: "secondary", label: t("status.pending") },
      completed: { variant: "outline", label: t("status.completed") },
      cancelled: { variant: "destructive", label: t("status.cancelled") },
    };
    const config = statusMap[status || "active"] || statusMap.active;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd/MM/yyyy");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with filters */}
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-medium text-base">{t("client.clientEngagements")}</h3>
        <div className="flex-1" />
        <Input
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48 h-8 text-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue placeholder={t("common.allStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allStatus")}</SelectItem>
            <SelectItem value="active">{t("status.active")}</SelectItem>
            <SelectItem value="pending">{t("status.pending")}</SelectItem>
            <SelectItem value="completed">{t("status.completed")}</SelectItem>
            <SelectItem value="cancelled">{t("status.cancelled")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={partnerFilter} onValueChange={setPartnerFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <Filter className={`h-3 w-3 mr-1 ${partnerFilter !== "all" ? "text-accent" : ""}`} />
            <SelectValue placeholder={t("engagement.partner")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")} {t("engagement.partner")}</SelectItem>
            {partners.map((p) => (
              <SelectItem key={p.staff_id} value={p.staff_id}>
                {p.first_name} {p.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={managerFilter} onValueChange={setManagerFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <Filter className={`h-3 w-3 mr-1 ${managerFilter !== "all" ? "text-accent" : ""}`} />
            <SelectValue placeholder={t("engagement.manager")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")} {t("engagement.manager")}</SelectItem>
            {managers.map((m) => (
              <SelectItem key={m.staff_id} value={m.staff_id}>
                {m.first_name} {m.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8"
          onClick={() => navigate(`/engagements/new?client_id=${clientId}`)}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("engagement.newEngagement")}
        </Button>
      </div>

      {/* Scrollable table */}
      <ScrollArea className="flex-1 border rounded-lg">
        <Table className="table-dense">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead
                className="cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("engagement_code")}
              >
                <div className="flex items-center">
                  {t("engagement.code")}
                  {getSortIcon("engagement_code")}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("engagement_name")}
              >
                <div className="flex items-center">
                  {t("engagement.name")}
                  {getSortIcon("engagement_name")}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("partner")}
              >
                <div className="flex items-center">
                  {t("engagement.partner")}
                  {getSortIcon("partner")}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("manager")}
              >
                <div className="flex items-center">
                  {t("engagement.manager")}
                  {getSortIcon("manager")}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("start_date")}
              >
                <div className="flex items-center">
                  {t("engagement.startDate")}
                  {getSortIcon("start_date")}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("end_date")}
              >
                <div className="flex items-center">
                  {t("engagement.endDate")}
                  {getSortIcon("end_date")}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center">
                  {t("engagement.status")}
                  {getSortIcon("status")}
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : filteredAndSorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {t("client.noEngagements")}
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSorted.map((engagement) => (
                <TableRow
                  key={engagement.engagement_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/engagements/${engagement.engagement_id}`)}
                >
                  <TableCell className="font-mono text-sm">{engagement.engagement_code || "-"}</TableCell>
                  <TableCell>{engagement.engagement_name}</TableCell>
                  <TableCell>{getStaffName(engagement.partner_id)}</TableCell>
                  <TableCell>{getStaffName(engagement.manager_id)}</TableCell>
                  <TableCell>{formatDate(engagement.start_date)}</TableCell>
                  <TableCell>{formatDate(engagement.end_date)}</TableCell>
                  <TableCell>{getStatusBadge(engagement.status)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

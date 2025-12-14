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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Sun, Snowflake, ArrowUpDown, ArrowUp, ArrowDown, Filter, ChevronDown } from "lucide-react";
import { useWorkOrders, WorkOrder } from "@/hooks/useEmsData";
import { useCategoryStaff } from "@/hooks/useCategoryStaff";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const statusDotColors: Record<string, string> = {
  Draft: "bg-warning",
  Pending_Approval: "bg-info",
  Approved: "bg-success",
  Rejected: "bg-destructive",
};

type SortDirection = "asc" | "desc" | null;
type SortColumn = "code" | "name" | "client" | "partner" | "manager" | "hours" | "standardFee" | "realization" | "adjustedFee" | "expenses" | "totalNoVAT" | "totalVAT" | null;

const WorkOrders = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: workOrders, isLoading } = useWorkOrders();
  const { partnerOptions, managerOptions } = useCategoryStaff();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [currencyTab, setCurrencyTab] = useState<"BOB" | "USD">("BOB");
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();
  
  // Filter popover states
  const [partnerFilterOpen, setPartnerFilterOpen] = useState(false);
  const [managerFilterOpen, setManagerFilterOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);

  const toggleRowExpanded = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const formatCurrency = (amount: number) => {
    const rounded = Math.round(amount);
    return currencyTab === "BOB" 
      ? rounded.toLocaleString("es-BO", { maximumFractionDigits: 0 })
      : rounded.toLocaleString("en-US", { maximumFractionDigits: 0 });
  };

  const calculateTotals = (wo: WorkOrder) => {
    const totalHours = wo.budget_lines?.reduce(
      (sum, bl) => sum + Number(bl.budgeted_hours), 0
    ) || 0;
    
    const standardFee = wo.budget_lines?.reduce(
      (sum, bl) => sum + Number(bl.budgeted_hours) * Number(bl.standard_rate), 0
    ) || 0;
    
    const adjustment = Number(wo.adjustment_amount) || 0;
    const adjustedFee = standardFee + adjustment;
    const realizationPercent = standardFee > 0 ? (adjustedFee / standardFee) * 100 : 100;
    
    const totalExpenses = wo.expense_budget?.reduce(
      (sum, exp) => sum + Number(exp.budgeted_amount), 0
    ) || 0;
    
    const totalWithoutVAT = adjustedFee + totalExpenses;
    const taxRate = Number(wo.tax_rate) || 0.13;
    const totalWithVAT = totalWithoutVAT / (1 - taxRate);

    return { totalHours, standardFee, realizationPercent, adjustedFee, totalExpenses, totalWithoutVAT, totalWithVAT };
  };

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

  // Filter and sort work orders
  const filteredWorkOrders = useMemo(() => {
    let result = workOrders?.filter((wo) => {
      // Currency filter (tab)
      if (wo.currency !== currencyTab) return false;

      const matchesSearch =
        !searchQuery ||
        wo.engagement?.engagement_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wo.engagement?.engagement_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wo.engagement?.client?.client_legal_name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || wo.approval_status === statusFilter;
      const matchesPartner = partnerFilter === "all" || wo.engagement?.partner_id === partnerFilter;
      const matchesManager = managerFilter === "all" || wo.engagement?.manager_id === managerFilter;

      return matchesSearch && matchesStatus && matchesPartner && matchesManager;
    }) || [];

    // Apply sorting
    if (sortColumn && sortDirection) {
      result = [...result].sort((a, b) => {
        const totalsA = calculateTotals(a);
        const totalsB = calculateTotals(b);
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
          case "partner":
            const pA = a.engagement?.partner?.short_name || `${a.engagement?.partner?.first_name || ""} ${a.engagement?.partner?.last_name || ""}`;
            const pB = b.engagement?.partner?.short_name || `${b.engagement?.partner?.first_name || ""} ${b.engagement?.partner?.last_name || ""}`;
            comparison = pA.localeCompare(pB);
            break;
          case "manager":
            const mA = a.engagement?.manager?.short_name || `${a.engagement?.manager?.first_name || ""} ${a.engagement?.manager?.last_name || ""}`;
            const mB = b.engagement?.manager?.short_name || `${b.engagement?.manager?.first_name || ""} ${b.engagement?.manager?.last_name || ""}`;
            comparison = mA.localeCompare(mB);
            break;
          case "hours":
            comparison = totalsA.totalHours - totalsB.totalHours;
            break;
          case "standardFee":
            comparison = totalsA.standardFee - totalsB.standardFee;
            break;
          case "realization":
            comparison = totalsA.realizationPercent - totalsB.realizationPercent;
            break;
          case "adjustedFee":
            comparison = totalsA.adjustedFee - totalsB.adjustedFee;
            break;
          case "expenses":
            comparison = totalsA.totalExpenses - totalsB.totalExpenses;
            break;
          case "totalNoVAT":
            comparison = totalsA.totalWithoutVAT - totalsB.totalWithoutVAT;
            break;
          case "totalVAT":
            comparison = totalsA.totalWithVAT - totalsB.totalWithVAT;
            break;
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [workOrders, currencyTab, searchQuery, statusFilter, partnerFilter, managerFilter, sortColumn, sortDirection]);

  return (
    <AppLayout title={t("workOrders.title")}>
      <div className="space-y-4">
        {/* Currency Tabs + Search + Add Button */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Tabs value={currencyTab} onValueChange={(v) => setCurrencyTab(v as "BOB" | "USD")}>
              <TabsList>
                <TabsTrigger value="BOB">BOB</TabsTrigger>
                <TabsTrigger value="USD">USD</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("workOrders.searchPlaceholder")}
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <Button
            variant="default"
            onClick={() => navigate("/work-orders/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("workOrders.newWorkOrder")}
          </Button>
        </div>

        {/* Mobile Cards View */}
        {isMobile ? (
          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="p-4">
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-3 w-full" />
                </Card>
              ))
            ) : filteredWorkOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t("common.noResults")}
              </div>
            ) : (
              filteredWorkOrders.map((wo) => {
                const { totalHours, standardFee, realizationPercent, adjustedFee, totalExpenses, totalWithoutVAT, totalWithVAT } = calculateTotals(wo);
                const status = wo.approval_status || "Draft";

                return (
                  <Card
                    key={wo.wo_id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/work-orders/${wo.wo_id}`)}
                  >
                    <CardContent className="p-4 space-y-2">
                      {/* Primary info */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {wo.season_mode === "High" ? (
                            <Sun className="h-4 w-4 text-warning shrink-0" />
                          ) : (
                            <Snowflake className="h-4 w-4 text-info shrink-0" />
                          )}
                          <div
                            className={cn(
                              "h-2.5 w-2.5 rounded-full shrink-0",
                              statusDotColors[status]
                            )}
                          />
                          <span className="font-medium truncate">{wo.engagement?.engagement_name}</span>
                        </div>
                        <span className="font-mono font-semibold shrink-0">
                          {formatCurrency(totalWithVAT)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{wo.engagement?.engagement_code}</span>
                        <span>{wo.engagement?.client?.client_legal_name}</span>
                      </div>
                      
                      {/* Collapsible secondary info */}
                      <Collapsible open={expandedRows.has(wo.wo_id)}>
                        <CollapsibleTrigger
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowExpanded(wo.wo_id);
                          }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full justify-center pt-1"
                        >
                          <ChevronDown className={cn(
                            "h-3 w-3 transition-transform",
                            expandedRows.has(wo.wo_id) && "rotate-180"
                          )} />
                          {expandedRows.has(wo.wo_id) ? t("common.showLess") : t("common.showMore")}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2 space-y-1 text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-muted-foreground text-xs">{t("engagement.partner")}</span>
                              <div>{wo.engagement?.partner?.short_name || `${wo.engagement?.partner?.first_name || ""} ${wo.engagement?.partner?.last_name || ""}`}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">{t("engagement.manager")}</span>
                              <div>{wo.engagement?.manager?.short_name || `${wo.engagement?.manager?.first_name || ""} ${wo.engagement?.manager?.last_name || ""}`}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">{t("workOrders.hours")}</span>
                              <div className="font-mono">{totalHours.toFixed(1)}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">{t("workOrders.standardFee")}</span>
                              <div className="font-mono">{formatCurrency(standardFee)}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">%</span>
                              <div className={cn("font-mono", realizationPercent < 100 && "text-warning")}>
                                {realizationPercent.toFixed(1)}%
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">{t("workOrders.adjustedFee")}</span>
                              <div className="font-mono">{formatCurrency(adjustedFee)}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">{t("workOrders.expenses")}</span>
                              <div className="font-mono">{formatCurrency(totalExpenses)}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">{t("workOrders.totalWithoutVAT")}</span>
                              <div className="font-mono">{formatCurrency(totalWithoutVAT)}</div>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        ) : (
          /* Desktop Table */
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="table-dense">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10 text-center border-r border-border"></TableHead>
                    <TableHead className="w-10 text-center border-r border-border"></TableHead>
                    <TableHead className="w-28 text-center border-r border-border">
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-1 justify-center"
                        onClick={() => handleSort("code")}
                      >
                        {t("engagement.code")}
                        {getSortIcon("code")}
                      </span>
                    </TableHead>
                    <TableHead className="min-w-[180px] text-center border-r border-border">
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-1 justify-center"
                        onClick={() => handleSort("name")}
                      >
                        {t("engagement.name")}
                        {getSortIcon("name")}
                      </span>
                    </TableHead>
                    <TableHead className="min-w-[160px] text-center border-r border-border">
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-1 justify-center"
                        onClick={() => handleSort("client")}
                      >
                        {t("engagement.client")}
                        {getSortIcon("client")}
                      </span>
                    </TableHead>
                    <TableHead className="w-28 text-center border-r border-border">
                      <div className="flex items-center gap-1 justify-center">
                        <span
                          className="cursor-pointer hover:text-foreground flex items-center gap-1"
                          onClick={() => handleSort("partner")}
                        >
                          {t("engagement.partner")}
                          {getSortIcon("partner")}
                        </span>
                        <Popover open={partnerFilterOpen} onOpenChange={setPartnerFilterOpen}>
                          <PopoverTrigger asChild>
                            <button className="p-0.5 hover:bg-muted rounded">
                              <Filter className={`h-3 w-3 ${partnerFilter !== "all" ? "text-accent" : "opacity-50"}`} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" align="start">
                            <Select value={partnerFilter} onValueChange={(val) => {
                              setPartnerFilter(val);
                              setPartnerFilterOpen(false);
                            }}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t("common.all")}</SelectItem>
                                {partnerOptions.map((p) => (
                                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {partnerFilter !== "all" && (
                              <Button variant="ghost" size="sm" onClick={() => {
                                setPartnerFilter("all");
                                setPartnerFilterOpen(false);
                              }} className="w-full mt-2">
                                {t("common.clear")}
                              </Button>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableHead>
                    <TableHead className="w-28 text-center border-r border-border">
                      <div className="flex items-center gap-1 justify-center">
                        <span
                          className="cursor-pointer hover:text-foreground flex items-center gap-1"
                          onClick={() => handleSort("manager")}
                        >
                          {t("engagement.manager")}
                          {getSortIcon("manager")}
                        </span>
                        <Popover open={managerFilterOpen} onOpenChange={setManagerFilterOpen}>
                          <PopoverTrigger asChild>
                            <button className="p-0.5 hover:bg-muted rounded">
                              <Filter className={`h-3 w-3 ${managerFilter !== "all" ? "text-accent" : "opacity-50"}`} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" align="start">
                            <Select value={managerFilter} onValueChange={(val) => {
                              setManagerFilter(val);
                              setManagerFilterOpen(false);
                            }}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t("common.all")}</SelectItem>
                                {managerOptions.map((m) => (
                                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {managerFilter !== "all" && (
                              <Button variant="ghost" size="sm" onClick={() => {
                                setManagerFilter("all");
                                setManagerFilterOpen(false);
                              }} className="w-full mt-2">
                                {t("common.clear")}
                              </Button>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableHead>
                    <TableHead className="w-20 text-center border-r border-border">
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-1 justify-center"
                        onClick={() => handleSort("hours")}
                      >
                        {t("workOrders.hours")}
                        {getSortIcon("hours")}
                      </span>
                    </TableHead>
                    <TableHead className="w-28 text-center border-r border-border">
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-1 justify-center"
                        onClick={() => handleSort("standardFee")}
                      >
                        {t("workOrders.standardFee")} ({currencyTab})
                        {getSortIcon("standardFee")}
                      </span>
                    </TableHead>
                    <TableHead className="w-20 text-center border-r border-border">
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-1 justify-center"
                        onClick={() => handleSort("realization")}
                      >
                        %
                        {getSortIcon("realization")}
                      </span>
                    </TableHead>
                    <TableHead className="w-28 text-center border-r border-border">
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-1 justify-center"
                        onClick={() => handleSort("adjustedFee")}
                      >
                        {t("workOrders.adjustedFee")} ({currencyTab})
                        {getSortIcon("adjustedFee")}
                      </span>
                    </TableHead>
                    <TableHead className="w-24 text-center border-r border-border">
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-1 justify-center"
                        onClick={() => handleSort("expenses")}
                      >
                        {t("workOrders.expenses")} ({currencyTab})
                        {getSortIcon("expenses")}
                      </span>
                    </TableHead>
                    <TableHead className="w-28 text-center border-r border-border">
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-1 justify-center"
                        onClick={() => handleSort("totalNoVAT")}
                      >
                        {t("workOrders.totalWithoutVAT")} ({currencyTab})
                        {getSortIcon("totalNoVAT")}
                      </span>
                    </TableHead>
                    <TableHead className="w-28 text-center border-r border-border">
                      <div className="flex items-center gap-1 justify-center">
                        <span
                          className="cursor-pointer hover:text-foreground flex items-center gap-1"
                          onClick={() => handleSort("totalVAT")}
                        >
                          {t("workOrders.totalWithVAT")} ({currencyTab})
                          {getSortIcon("totalVAT")}
                        </span>
                        <Popover open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
                          <PopoverTrigger asChild>
                            <button className="p-0.5 hover:bg-muted rounded">
                              <Filter className={`h-3 w-3 ${statusFilter !== "all" ? "text-accent" : "opacity-50"}`} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2" align="end">
                            <Select value={statusFilter} onValueChange={(val) => {
                              setStatusFilter(val);
                              setStatusFilterOpen(false);
                            }}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t("workOrders.allStatuses")}</SelectItem>
                                <SelectItem value="Draft">{t("workOrders.status.draft")}</SelectItem>
                                <SelectItem value="Pending_Approval">{t("workOrders.status.pending")}</SelectItem>
                                <SelectItem value="Approved">{t("workOrders.status.approved")}</SelectItem>
                                <SelectItem value="Rejected">{t("workOrders.status.rejected")}</SelectItem>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 14 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredWorkOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                        {t("common.noResults")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredWorkOrders.map((wo) => {
                      const { totalHours, standardFee, realizationPercent, adjustedFee, totalExpenses, totalWithoutVAT, totalWithVAT } = calculateTotals(wo);
                      const status = wo.approval_status || "Draft";

                      return (
                        <TableRow
                          key={wo.wo_id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/work-orders/${wo.wo_id}`)}
                        >
                          {/* Season Icon */}
                          <TableCell className="text-center border-r border-border">
                            {wo.season_mode === "High" ? (
                              <Sun className="h-4 w-4 text-warning mx-auto" />
                            ) : (
                              <Snowflake className="h-4 w-4 text-info mx-auto" />
                            )}
                          </TableCell>
                          {/* Status Dot */}
                          <TableCell className="text-center border-r border-border">
                            <div
                              className={cn(
                                "h-2.5 w-2.5 rounded-full mx-auto",
                                statusDotColors[status]
                              )}
                              title={t(`workOrders.status.${status.toLowerCase().replace("_", "")}`)}
                            />
                          </TableCell>
                          {/* Engagement Code */}
                          <TableCell className="text-muted-foreground text-left border-r border-border">
                            {wo.engagement?.engagement_code || "-"}
                          </TableCell>
                          {/* Engagement Name */}
                          <TableCell className="font-medium truncate max-w-[200px] text-left border-r border-border">
                            {wo.engagement?.engagement_name}
                          </TableCell>
                          {/* Client */}
                          <TableCell className="truncate max-w-[180px] text-left border-r border-border">
                            {wo.engagement?.client?.client_legal_name || "-"}
                          </TableCell>
                          {/* Partner */}
                          <TableCell className="text-left border-r border-border">
                            {wo.engagement?.partner 
                              ? wo.engagement.partner.short_name || `${wo.engagement.partner.first_name} ${wo.engagement.partner.last_name}`
                              : "-"}
                          </TableCell>
                          {/* Manager */}
                          <TableCell className="text-left border-r border-border">
                            {wo.engagement?.manager
                              ? wo.engagement.manager.short_name || `${wo.engagement.manager.first_name} ${wo.engagement.manager.last_name}`
                              : "-"}
                          </TableCell>
                          {/* Total Hours */}
                          <TableCell className="text-right font-mono border-r border-border">
                            {totalHours.toFixed(1)}
                          </TableCell>
                          {/* Standard Fee */}
                          <TableCell className="text-right font-mono border-r border-border">
                            {formatCurrency(standardFee)}
                          </TableCell>
                          {/* Realization % */}
                          <TableCell className={cn(
                            "text-center font-mono border-r border-border",
                            realizationPercent < 100 && "text-warning"
                          )}>
                            {realizationPercent.toFixed(1)}%
                          </TableCell>
                          {/* Adjusted Fee */}
                          <TableCell className="text-right font-mono border-r border-border">
                            {formatCurrency(adjustedFee)}
                          </TableCell>
                          {/* Expenses */}
                          <TableCell className="text-right font-mono border-r border-border">
                            {formatCurrency(totalExpenses)}
                          </TableCell>
                          {/* Total without VAT */}
                          <TableCell className="text-right font-mono border-r border-border">
                            {formatCurrency(totalWithoutVAT)}
                          </TableCell>
                          {/* Total with VAT */}
                          <TableCell className="text-right font-mono font-medium">
                            {formatCurrency(totalWithVAT)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default WorkOrders;

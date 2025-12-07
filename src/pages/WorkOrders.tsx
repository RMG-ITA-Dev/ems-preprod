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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Sun, Snowflake } from "lucide-react";
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
import { cn } from "@/lib/utils";

const statusDotColors: Record<string, string> = {
  Draft: "bg-warning",
  Pending_Approval: "bg-info",
  Approved: "bg-success",
  Rejected: "bg-destructive",
};

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

  const formatCurrency = (amount: number, currency: string) => {
    const formatted = amount.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currency === "BOB" ? "Bs" : "$"} ${formatted}`;
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

  // Filter work orders
  const filteredWorkOrders = useMemo(() => {
    return workOrders?.filter((wo) => {
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
  }, [workOrders, currencyTab, searchQuery, statusFilter, partnerFilter, managerFilter]);

  return (
    <AppLayout title={t("workOrders.title")}>
      <div className="space-y-4">
        {/* Currency Tabs */}
        <div className="flex items-center justify-between">
          <Tabs value={currencyTab} onValueChange={(v) => setCurrencyTab(v as "BOB" | "USD")}>
            <TabsList>
              <TabsTrigger value="BOB">BOB</TabsTrigger>
              <TabsTrigger value="USD">USD</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            onClick={() => navigate("/work-orders/new")}
            className="btn-action"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("workOrders.newWorkOrder")}
          </Button>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("workOrders.searchPlaceholder")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={partnerFilter} onValueChange={setPartnerFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t("engagement.partner")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")} {t("engagement.partner")}</SelectItem>
              {partnerOptions.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={managerFilter} onValueChange={setManagerFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t("engagement.manager")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")} {t("engagement.manager")}</SelectItem>
              {managerOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("workOrders.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("workOrders.allStatuses")}</SelectItem>
              <SelectItem value="Draft">{t("workOrders.status.draft")}</SelectItem>
              <SelectItem value="Pending_Approval">{t("workOrders.status.pending")}</SelectItem>
              <SelectItem value="Approved">{t("workOrders.status.approved")}</SelectItem>
              <SelectItem value="Rejected">{t("workOrders.status.rejected")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Data Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="table-dense">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10 text-center"></TableHead>
                  <TableHead className="w-10 text-center"></TableHead>
                  <TableHead className="w-28">{t("engagement.code")}</TableHead>
                  <TableHead className="min-w-[180px]">{t("engagement.name")}</TableHead>
                  <TableHead className="min-w-[160px]">{t("engagement.client")}</TableHead>
                  <TableHead className="w-28">{t("engagement.partner")}</TableHead>
                  <TableHead className="w-28">{t("engagement.manager")}</TableHead>
                  <TableHead className="w-20 text-right">{t("workOrders.hours")}</TableHead>
                  <TableHead className="w-28 text-right">{t("workOrders.standardFee")}</TableHead>
                  <TableHead className="w-20 text-right">{t("workOrders.realization")}</TableHead>
                  <TableHead className="w-28 text-right">{t("workOrders.adjustedFee")}</TableHead>
                  <TableHead className="w-24 text-right">{t("workOrders.expenses")}</TableHead>
                  <TableHead className="w-28 text-right">{t("workOrders.totalWithoutVAT")}</TableHead>
                  <TableHead className="w-28 text-right">{t("workOrders.totalWithVAT")}</TableHead>
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
                        <TableCell className="text-center">
                          {wo.season_mode === "High" ? (
                            <Sun className="h-4 w-4 text-warning mx-auto" />
                          ) : (
                            <Snowflake className="h-4 w-4 text-info mx-auto" />
                          )}
                        </TableCell>
                        {/* Status Dot */}
                        <TableCell className="text-center">
                          <div
                            className={cn(
                              "h-2.5 w-2.5 rounded-full mx-auto",
                              statusDotColors[status]
                            )}
                            title={t(`workOrders.status.${status.toLowerCase().replace("_", "")}`)}
                          />
                        </TableCell>
                        {/* Engagement Code */}
                        <TableCell className="font-mono text-muted-foreground">
                          {wo.engagement?.engagement_code || "-"}
                        </TableCell>
                        {/* Engagement Name */}
                        <TableCell className="font-medium truncate max-w-[200px]">
                          {wo.engagement?.engagement_name}
                        </TableCell>
                        {/* Client */}
                        <TableCell className="truncate max-w-[180px]">
                          {wo.engagement?.client?.client_legal_name || "-"}
                        </TableCell>
                        {/* Partner */}
                        <TableCell>
                          {wo.engagement?.partner 
                            ? `${wo.engagement.partner.first_name} ${wo.engagement.partner.last_name}`
                            : "-"}
                        </TableCell>
                        {/* Manager */}
                        <TableCell>
                          {wo.engagement?.manager
                            ? `${wo.engagement.manager.first_name} ${wo.engagement.manager.last_name}`
                            : "-"}
                        </TableCell>
                        {/* Total Hours */}
                        <TableCell className="text-right font-mono">
                          {totalHours.toFixed(1)}
                        </TableCell>
                        {/* Standard Fee */}
                        <TableCell className="text-right font-mono">
                          {formatCurrency(standardFee, wo.currency)}
                        </TableCell>
                        {/* Realization % */}
                        <TableCell className={cn(
                          "text-right font-mono",
                          realizationPercent < 100 && "text-warning"
                        )}>
                          {realizationPercent.toFixed(1)}%
                        </TableCell>
                        {/* Adjusted Fee */}
                        <TableCell className="text-right font-mono">
                          {formatCurrency(adjustedFee, wo.currency)}
                        </TableCell>
                        {/* Expenses */}
                        <TableCell className="text-right font-mono">
                          {formatCurrency(totalExpenses, wo.currency)}
                        </TableCell>
                        {/* Total without VAT */}
                        <TableCell className="text-right font-mono">
                          {formatCurrency(totalWithoutVAT, wo.currency)}
                        </TableCell>
                        {/* Total with VAT */}
                        <TableCell className="text-right font-mono font-medium">
                          {formatCurrency(totalWithVAT, wo.currency)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default WorkOrders;
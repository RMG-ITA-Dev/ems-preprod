import { useState } from "react";
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
import { Plus, Search, FileText, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useWorkOrders } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const statusColors = {
  Draft: "bg-warning/10 text-warning border-warning/20",
  Pending_Approval: "bg-info/10 text-info border-info/20",
  Approved: "bg-success/10 text-success border-success/20",
  Rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const WorkOrders = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: workOrders, isLoading } = useWorkOrders();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === "BOB") {
      return `Bs ${amount.toLocaleString("es-BO", { minimumFractionDigits: 2 })}`;
    }
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  };

  const calculateTotals = (wo: NonNullable<typeof workOrders>[number]) => {
    const standardFee = wo.budget_lines?.reduce(
      (sum, bl) => sum + Number(bl.budgeted_hours) * Number(bl.standard_rate), 0
    ) || 0;
    
    const adjustment = Number(wo.adjustment_amount) || 0;
    const adjustedFee = standardFee + adjustment;
    const realizationPercent = standardFee > 0 ? (adjustedFee / standardFee) * 100 : 100;
    const taxRate = Number(wo.tax_rate) || 0.13;
    const feeWithTax = adjustedFee / (1 - taxRate);

    return { standardFee, adjustment, realizationPercent, feeWithTax };
  };

  // Filter work orders
  const filteredWorkOrders = workOrders?.filter((wo) => {
    const matchesSearch =
      !searchQuery ||
      wo.engagement?.engagement_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.engagement?.engagement_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.engagement?.client?.client_legal_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || wo.approval_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <AppLayout title={t("workOrders.title")}>
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex flex-1 gap-4 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("workOrders.searchPlaceholder")}
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
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
          <Button
            onClick={() => navigate("/work-orders/new")}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("workOrders.newWorkOrder")}
          </Button>
        </div>

        {/* Work Orders List */}
        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-5">
                <Skeleton className="h-24 w-full" />
              </div>
            ))
          ) : filteredWorkOrders?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t("common.noResults")}
            </div>
          ) : filteredWorkOrders?.map((wo) => {
            const { standardFee, adjustment, realizationPercent, feeWithTax } = calculateTotals(wo);
            const status = wo.approval_status || "Draft";

            return (
              <div 
                key={wo.wo_id} 
                className="bg-card rounded-xl border border-border p-5 hover:border-accent/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/work-orders/${wo.wo_id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-muted-foreground">
                          {wo.engagement?.engagement_code || wo.wo_id.slice(0, 8).toUpperCase()}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={cn(statusColors[status as keyof typeof statusColors])}
                        >
                          {t(`workOrders.status.${status.toLowerCase().replace("_", "")}`)}
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-foreground mt-1">{wo.engagement?.engagement_name}</h3>
                      <p className="text-sm text-muted-foreground">{wo.engagement?.client?.client_legal_name}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-6 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("workOrders.standardFee")}</p>
                      <p className="font-semibold text-foreground">{formatCurrency(standardFee, wo.currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("workOrders.adjustment")}</p>
                      <p className={`font-semibold flex items-center justify-end gap-1 ${adjustment < 0 ? "text-destructive" : adjustment > 0 ? "text-success" : "text-muted-foreground"}`}>
                        {adjustment !== 0 && (
                          adjustment < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />
                        )}
                        {formatCurrency(adjustment, wo.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("workOrders.realization")}</p>
                      <p className={`font-semibold ${realizationPercent < 100 ? "text-warning" : "text-foreground"}`}>
                        {realizationPercent.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("workOrders.feeWithTax")}</p>
                      <p className="font-bold text-foreground">{formatCurrency(feeWithTax, wo.currency)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                  <Badge variant="outline" className="text-xs">{wo.currency}</Badge>
                  <Badge variant="outline" className="text-xs">{wo.season_mode} {t("workOrders.season")}</Badge>
                  <Badge variant="outline" className="text-xs">{t("workOrders.iva")} {(Number(wo.tax_rate) * 100).toFixed(0)}%</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
};

export default WorkOrders;

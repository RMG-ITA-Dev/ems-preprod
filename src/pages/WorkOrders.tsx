import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useWorkOrders } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";

const WorkOrders = () => {
  const { data: workOrders, isLoading } = useWorkOrders();

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === "BOB") {
      return `Bs ${amount.toLocaleString("es-BO", { minimumFractionDigits: 2 })}`;
    }
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  };

  const calculateTotals = (wo: typeof workOrders extends (infer T)[] | undefined ? T : never) => {
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

  return (
    <AppLayout title="Work Orders">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search work orders..." className="pl-9" />
          </div>
          <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="h-4 w-4 mr-2" />
            New Work Order
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
          ) : workOrders?.map((wo) => {
            const { standardFee, adjustment, realizationPercent, feeWithTax } = calculateTotals(wo);
            const status = wo.engagement?.status === 'completed' ? 'completed' : 'active';

            return (
              <div 
                key={wo.wo_id} 
                className="bg-card rounded-xl border border-border p-5 hover:border-accent/30 transition-colors cursor-pointer"
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
                          className={status === "active" 
                            ? "bg-success/10 text-success border-success/20" 
                            : "bg-muted text-muted-foreground"
                          }
                        >
                          {status === "active" ? "Active" : "Completed"}
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-foreground mt-1">{wo.engagement?.engagement_name}</h3>
                      <p className="text-sm text-muted-foreground">{wo.engagement?.client?.client_legal_name}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-6 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Standard Fee</p>
                      <p className="font-semibold text-foreground">{formatCurrency(standardFee, wo.currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Adjustment</p>
                      <p className={`font-semibold flex items-center justify-end gap-1 ${adjustment < 0 ? "text-destructive" : adjustment > 0 ? "text-success" : "text-muted-foreground"}`}>
                        {adjustment !== 0 && (
                          adjustment < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />
                        )}
                        {formatCurrency(adjustment, wo.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Realization</p>
                      <p className={`font-semibold ${realizationPercent < 100 ? "text-warning" : "text-foreground"}`}>
                        {realizationPercent.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Fee w/Tax</p>
                      <p className="font-bold text-foreground">{formatCurrency(feeWithTax, wo.currency)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                  <Badge variant="outline" className="text-xs">{wo.currency}</Badge>
                  <Badge variant="outline" className="text-xs">{wo.season_mode} Season</Badge>
                  <Badge variant="outline" className="text-xs">IVA {(Number(wo.tax_rate) * 100).toFixed(0)}%</Badge>
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

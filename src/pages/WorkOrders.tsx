import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Mock data
const mockWorkOrders = [
  { 
    id: "WO-2024-001",
    engagement: "2024 Financial Audit",
    client: "Minera San Cristóbal S.A.",
    currency: "USD",
    season: "Low",
    standardFee: 67200,
    adjustment: -2000,
    realizationPercent: 97.02,
    feeWithTax: 74943,
    status: "active"
  },
  { 
    id: "WO-2024-002",
    engagement: "Q4 Tax Review",
    client: "Banco Nacional de Bolivia",
    currency: "BOB",
    season: "High",
    standardFee: 140000,
    adjustment: 0,
    realizationPercent: 100,
    feeWithTax: 160920,
    status: "active"
  },
  { 
    id: "WO-2024-003",
    engagement: "Internal Controls Assessment",
    client: "YPFB Corporación",
    currency: "USD",
    season: "High",
    standardFee: 48960,
    adjustment: -5000,
    realizationPercent: 89.79,
    feeWithTax: 50529,
    status: "completed"
  },
];

const WorkOrders = () => {
  const formatCurrency = (amount: number, currency: string) => {
    if (currency === "BOB") {
      return `Bs ${amount.toLocaleString("es-BO")}`;
    }
    return `$${amount.toLocaleString("en-US")}`;
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
          {mockWorkOrders.map((wo) => (
            <div 
              key={wo.id} 
              className="bg-card rounded-xl border border-border p-5 hover:border-accent/30 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-muted-foreground">{wo.id}</span>
                      <Badge 
                        variant="outline" 
                        className={wo.status === "active" 
                          ? "bg-success/10 text-success border-success/20" 
                          : "bg-muted text-muted-foreground"
                        }
                      >
                        {wo.status === "active" ? "Active" : "Completed"}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-foreground mt-1">{wo.engagement}</h3>
                    <p className="text-sm text-muted-foreground">{wo.client}</p>
                  </div>
                </div>
                
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Standard Fee</p>
                    <p className="font-semibold text-foreground">{formatCurrency(wo.standardFee, wo.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Adjustment</p>
                    <p className={`font-semibold flex items-center justify-end gap-1 ${wo.adjustment < 0 ? "text-destructive" : wo.adjustment > 0 ? "text-success" : "text-muted-foreground"}`}>
                      {wo.adjustment !== 0 && (
                        wo.adjustment < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />
                      )}
                      {formatCurrency(wo.adjustment, wo.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Realization</p>
                    <p className={`font-semibold ${wo.realizationPercent < 100 ? "text-warning" : "text-foreground"}`}>
                      {wo.realizationPercent.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Fee w/Tax</p>
                    <p className="font-bold text-foreground">{formatCurrency(wo.feeWithTax, wo.currency)}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                <Badge variant="outline" className="text-xs">{wo.currency}</Badge>
                <Badge variant="outline" className="text-xs">{wo.season} Season</Badge>
                <Badge variant="outline" className="text-xs">IVA 13%</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default WorkOrders;

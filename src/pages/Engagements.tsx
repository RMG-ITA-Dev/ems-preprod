import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Briefcase, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// Mock data
const mockEngagements = [
  { 
    id: 1, 
    name: "2024 Financial Audit", 
    client: "Minera San Cristóbal S.A.",
    partner: "Carlos Mendoza",
    manager: "Ana Gutiérrez",
    currency: "USD",
    season: "Low",
    budgetedHours: 480,
    actualHours: 312,
    status: "in-progress"
  },
  { 
    id: 2, 
    name: "Q4 Tax Review", 
    client: "Banco Nacional de Bolivia",
    partner: "María Torres",
    manager: "Roberto Silva",
    currency: "BOB",
    season: "High",
    budgetedHours: 200,
    actualHours: 60,
    status: "in-progress"
  },
  { 
    id: 3, 
    name: "Internal Controls Assessment", 
    client: "YPFB Corporación",
    partner: "Carlos Mendoza",
    manager: "Ana Gutiérrez",
    currency: "USD",
    season: "High",
    budgetedHours: 320,
    actualHours: 318,
    status: "completed"
  },
];

const Engagements = () => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "in-progress":
        return <Badge className="bg-accent/10 text-accent border-accent/20">In Progress</Badge>;
      case "completed":
        return <Badge className="bg-success/10 text-success border-success/20">Completed</Badge>;
      case "pending":
        return <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <AppLayout title="Engagements">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search engagements..." className="pl-9" />
          </div>
          <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="h-4 w-4 mr-2" />
            New Engagement
          </Button>
        </div>

        {/* Engagements List */}
        <div className="space-y-4">
          {mockEngagements.map((engagement) => (
            <div 
              key={engagement.id} 
              className="bg-card rounded-xl border border-border p-5 hover:border-accent/30 transition-colors cursor-pointer group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-foreground">{engagement.name}</h3>
                      {getStatusBadge(engagement.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{engagement.client}</p>
                    <div className="flex items-center gap-4 mt-3 text-sm">
                      <span className="text-muted-foreground">
                        Partner: <span className="text-foreground">{engagement.partner}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Manager: <span className="text-foreground">{engagement.manager}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        {engagement.currency}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {engagement.season} Season
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {engagement.actualHours} / {engagement.budgetedHours}h
                    </p>
                    <Progress 
                      value={(engagement.actualHours / engagement.budgetedHours) * 100} 
                      className="h-1.5 w-32 mt-1"
                    />
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Engagements;

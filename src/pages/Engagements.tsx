import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Briefcase, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useEngagements, useWorkOrders, useTimeEntries } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";

const Engagements = () => {
  const { data: engagements, isLoading } = useEngagements();
  const { data: workOrders } = useWorkOrders();
  const { data: timeEntries } = useTimeEntries();

  const getWorkOrder = (engagementId: string) => {
    return workOrders?.find(wo => wo.engagement_id === engagementId);
  };

  const getActualHours = (engagementId: string) => {
    return timeEntries
      ?.filter(te => te.engagement_id === engagementId)
      .reduce((sum, te) => sum + Number(te.hours_logged), 0) || 0;
  };

  const getBudgetedHours = (engagementId: string) => {
    const wo = getWorkOrder(engagementId);
    return wo?.budget_lines?.reduce((sum, bl) => sum + Number(bl.budgeted_hours), 0) || 0;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-accent/10 text-accent border-accent/20">Active</Badge>;
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
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-5">
                <Skeleton className="h-20 w-full" />
              </div>
            ))
          ) : engagements?.map((engagement) => {
            const wo = getWorkOrder(engagement.engagement_id);
            const actualHours = getActualHours(engagement.engagement_id);
            const budgetedHours = getBudgetedHours(engagement.engagement_id);
            const progress = budgetedHours > 0 ? (actualHours / budgetedHours) * 100 : 0;

            return (
              <div 
                key={engagement.engagement_id} 
                className="bg-card rounded-xl border border-border p-5 hover:border-accent/30 transition-colors cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Briefcase className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-foreground">{engagement.engagement_name}</h3>
                        {getStatusBadge(engagement.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{engagement.client?.client_legal_name}</p>
                      <div className="flex items-center gap-4 mt-3 text-sm">
                        <span className="text-muted-foreground">
                          Partner: <span className="text-foreground">{engagement.partner?.first_name} {engagement.partner?.last_name}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Manager: <span className="text-foreground">{engagement.manager?.first_name} {engagement.manager?.last_name}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      {wo && (
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            {wo.currency}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {wo.season_mode} Season
                          </Badge>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {actualHours.toFixed(1)} / {budgetedHours}h
                      </p>
                      <Progress 
                        value={Math.min(progress, 100)} 
                        className="h-1.5 w-32 mt-1"
                      />
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
};

export default Engagements;

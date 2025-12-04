import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface EngagementCardProps {
  clientName: string;
  engagementName: string;
  partner: string;
  progress: number;
  budgetedHours: number;
  actualHours: number;
  status: "active" | "pending" | "completed";
}

export function EngagementCard({
  clientName,
  engagementName,
  partner,
  progress,
  budgetedHours,
  actualHours,
  status,
}: EngagementCardProps) {
  const { t } = useTranslation();

  const statusConfig = {
    active: { label: t("status.active"), className: "bg-success/10 text-success border-success/20" },
    pending: { label: t("status.pending"), className: "bg-warning/10 text-warning border-warning/20" },
    completed: { label: t("status.completed"), className: "bg-muted text-muted-foreground border-border" },
  };

  return (
    <div className="bg-card rounded-xl p-5 border border-border hover:border-accent/30 transition-colors animate-fade-in">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{clientName}</p>
          <h3 className="text-base font-semibold text-foreground mt-0.5">{engagementName}</h3>
        </div>
        <Badge variant="outline" className={cn("text-xs", statusConfig[status].className)}>
          {statusConfig[status].label}
        </Badge>
      </div>
      
      <p className="text-sm text-muted-foreground mb-4">{t("engagement.partner")}: {partner}</p>
      
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("dashboard.hoursProgress")}</span>
          <span className="font-medium text-foreground">{actualHours} / {budgetedHours}h</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>
    </div>
  );
}

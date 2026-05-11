import { Bell } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useStaffingAlerts } from "@/hooks/useStaffingAlerts";
import { cn } from "@/lib/utils";

function priorityBadge(level: string | null) {
  switch (level?.toLowerCase()) {
    case "high":
      return <Badge variant="destructive">{level}</Badge>;
    case "medium":
      return (
        <Badge className="bg-warning/10 text-warning border-warning/30 hover:bg-warning/20">
          {level}
        </Badge>
      );
    case "low":
      return <Badge variant="secondary">{level}</Badge>;
    default:
      return <Badge variant="outline">{level ?? "—"}</Badge>;
  }
}

export function NotificationsPanel() {
  const { t } = useTranslation();
  const { data: alerts, isPending, isError } = useStaffingAlerts();

  const count = alerts?.length ?? 0;
  const hasAlerts = count > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative flex-shrink-0">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {hasAlerts && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-accent rounded-full" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">
            {t("notifications.title")}
          </span>
          {hasAlerts && (
            <Badge variant="secondary" className="text-xs">
              {t("notifications.count", { count })}
            </Badge>
          )}
        </div>

        <Separator />

        <ScrollArea className="max-h-96">
          {isPending && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("notifications.loading")}
            </p>
          )}

          {isError && (
            <p className="px-4 py-6 text-center text-sm text-destructive">
              {t("notifications.error")}
            </p>
          )}

          {!isPending && !isError && !hasAlerts && (
            <div className="px-4 py-8 text-center space-y-1">
              <p className="text-sm font-medium">{t("notifications.emptyTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("notifications.emptyDescription")}
              </p>
            </div>
          )}

          {!isPending && !isError && hasAlerts &&
            alerts.map((alert, idx) => (
              <div
                key={alert.entity_id ?? idx}
                className={cn(
                  "px-4 py-3 space-y-1",
                  idx < count - 1 && "border-b border-border"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  {priorityBadge(alert.priority_level)}
                  {alert.detected_at && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(alert.detected_at), "dd/MM/yyyy")}
                    </span>
                  )}
                </div>
                {alert.description && (
                  <p className="text-sm leading-snug">{alert.description}</p>
                )}
                {alert.alert_type && (
                  <p className="text-xs text-muted-foreground">{alert.alert_type}</p>
                )}
              </div>
            ))
          }
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

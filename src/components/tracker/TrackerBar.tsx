import { useTranslation } from "react-i18next";
import { Play, Save, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActivityCodes } from "@/hooks/useEmsData";
import { useApprovedEngagements } from "@/hooks/useApprovedEngagements";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const MAX_DISPLAY_SECONDS = 28800; // 8h

interface TrackerBarProps {
  isRunning: boolean;
  elapsedSeconds: number;
  engagementId: string | null;
  activityId: string | null;
  remainingHours: number | null;
  // Handlers
  onStart: () => void;
  onSaveAndReset: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onEngagementChange: (id: string | null) => void;
  onActivityChange: (id: string | null) => void;
}

function formatTime(seconds: number): string {
  const clamped = Math.min(seconds, MAX_DISPLAY_SECONDS);
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function TrackerBar({
  isRunning,
  elapsedSeconds,
  engagementId,
  activityId,
  remainingHours,
  onStart,
  onSaveAndReset,
  onCancel,
  onDelete,
  onEngagementChange,
  onActivityChange,
}: TrackerBarProps) {
  const { t } = useTranslation();
  const { data: engagements = [] } = useApprovedEngagements();
  const { data: activityCodes = [] } = useActivityCodes();

  const activeActivities = activityCodes.filter((a) => a.is_active);

  const selectedEngagement = engagements.find(e => e.engagement_id === engagementId);
  const selectedActivity = activeActivities.find(a => a.activity_id === activityId);

  const isEngagementApproved = engagements.some(e => e.engagement_id === engagementId);
  const canStart = engagementId && activityId && isEngagementApproved && (remainingHours === null || remainingHours > 0);
  const hasTime = elapsedSeconds > 0;

  const showStartButton = !isRunning;
  const showSaveButton = isRunning || hasTime;
  const showCancelButton = true;
  const showDeleteButton = isRunning || hasTime;

  const formattedTime = formatTime(elapsedSeconds);

  return (
    <div className="space-y-4">
      {engagements.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("tracker.noApprovedEngagements")}</AlertDescription>
        </Alert>
      )}

      {/* BOX A: SELECTORS */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground mb-1.5 block">{t("tracker.engagement")}</Label>
            <Select
              value={engagementId || ""}
              onValueChange={(val) => onEngagementChange(val || null)}
              disabled={isRunning}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder={t("tracker.selectEngagement")}>
                  {selectedEngagement 
                    ? `${selectedEngagement.engagement_code} - ${selectedEngagement.engagement_name}` 
                    : t("tracker.selectEngagement")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {engagements.map((eng) => (
                  <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                    <span className="font-medium">{eng.engagement_code}</span>
                    <span className="text-muted-foreground ml-2">- {eng.engagement_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <Label className="text-xs text-muted-foreground mb-1.5 block">{t("tracker.activity")}</Label>
            <Select
              value={engagementId ? (activityId || "") : ""}
              onValueChange={(val) => onActivityChange(val || null)}
              disabled={isRunning || !engagementId}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder={t("tracker.selectActivity")}>
                  {engagementId && selectedActivity 
                    ? `${selectedActivity.activity_code} - ${selectedActivity.description}` 
                    : t("tracker.selectActivity")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {activeActivities.map((act) => (
                  <SelectItem key={act.activity_id} value={act.activity_id}>
                    <span className="font-medium">{act.activity_code}</span>
                    <span className="text-muted-foreground ml-2">- {act.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* BOX B: TIMER CONTROLS */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "font-mono text-3xl font-bold px-4 py-3 rounded-lg min-w-[160px] text-center",
                isRunning ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
              )}
            >
              {formattedTime}
            </div>
            
            {remainingHours !== null && (
              <div className={cn(
                "text-sm px-3 py-2 rounded-lg whitespace-nowrap",
                remainingHours <= 1 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              )}>
                {t("tracker.remainingToday")}: <span className="font-semibold">{remainingHours.toFixed(1)}h</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showStartButton && (
              <Button
                onClick={onStart}
                disabled={!canStart}
                className="h-9 px-4 text-sm font-semibold bg-tracker-start hover:bg-tracker-start/90 text-primary-foreground"
              >
                <Play className="h-4 w-4 mr-1.5" />
                {t("tracker.start")}
              </Button>
            )}

            {showSaveButton && (
              <Button
                onClick={onSaveAndReset}
                className="h-9 px-4 text-sm font-semibold bg-tracker-save hover:bg-tracker-save/90 text-foreground"
              >
                <Save className="h-4 w-4 mr-1.5" />
                {t("tracker.saveAndReset")}
              </Button>
            )}

            {showCancelButton && (
              <Button
                onClick={onCancel}
                className="h-9 px-4 text-sm font-semibold bg-tracker-cancel hover:bg-tracker-cancel/90 text-primary-foreground"
              >
                <X className="h-4 w-4 mr-1.5" />
                {t("common.cancel")}
              </Button>
            )}

            {showDeleteButton && (
              <Button
                onClick={onDelete}
                variant="destructive"
                className="h-9 px-4 text-sm font-semibold"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                {t("common.delete")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

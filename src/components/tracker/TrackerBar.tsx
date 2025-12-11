import { useTranslation } from "react-i18next";
import { Play, Pause, Save, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEngagements, useActivityCodes } from "@/hooks/useEmsData";
import { cn } from "@/lib/utils";

interface TrackerBarProps {
  isRunning: boolean;
  isPaused: boolean;
  formattedTime: string;
  engagementId: string | null;
  activityId: string | null;
  remainingHours: number | null;
  isEditMode?: boolean;
  // Handlers
  onStart: () => void;
  onPause: () => void;
  onSaveAndReset: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onEngagementChange: (id: string | null) => void;
  onActivityChange: (id: string | null) => void;
}

export function TrackerBar({
  isRunning,
  isPaused,
  formattedTime,
  engagementId,
  activityId,
  remainingHours,
  isEditMode = false,
  onStart,
  onPause,
  onSaveAndReset,
  onCancel,
  onDelete,
  onEngagementChange,
  onActivityChange,
}: TrackerBarProps) {
  const { t } = useTranslation();
  const { data: engagements = [] } = useEngagements();
  const { data: activityCodes = [] } = useActivityCodes();

  const activeEngagements = engagements.filter((e) => e.status === "active");
  const activeActivities = activityCodes.filter((a) => a.is_active);

  const selectedEngagement = activeEngagements.find(e => e.engagement_id === engagementId);
  const selectedActivity = activeActivities.find(a => a.activity_id === activityId);

  const canStart = engagementId && activityId && (remainingHours === null || remainingHours > 0);
  const hasTime = formattedTime !== "00:00:00";

  // Button visibility logic
  const showStartButton = !isRunning;
  const showPauseButton = isRunning;
  const showSaveButton = hasTime;
  const showCancelButton = true;
  const showDeleteButton = hasTime || isEditMode;

  return (
    <div className="space-y-4">
      {/* BOX A: SELECTORS */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Engagement Selector */}
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
                {activeEngagements.map((eng) => (
                  <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                    <span className="font-medium">{eng.engagement_code}</span>
                    <span className="text-muted-foreground ml-2">- {eng.engagement_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Activity Selector */}
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground mb-1.5 block">{t("tracker.activity")}</Label>
            <Select
              value={activityId || ""}
              onValueChange={(val) => onActivityChange(val || null)}
              disabled={isRunning}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder={t("tracker.selectActivity")}>
                  {selectedActivity 
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
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <div className="flex flex-col items-center gap-6">
          {/* Timer Display */}
          <div className="flex items-center gap-6">
            <div
              className={cn(
                "font-mono text-5xl font-bold px-8 py-6 rounded-lg min-w-[280px] text-center",
                isRunning ? "bg-success/10 text-success" : 
                isPaused ? "bg-warning/10 text-warning" : 
                "bg-muted text-muted-foreground"
              )}
            >
              {formattedTime}
            </div>
            
            {/* Remaining Hours Indicator */}
            {remainingHours !== null && (
              <div className={cn(
                "text-sm px-4 py-3 rounded-lg whitespace-nowrap",
                remainingHours <= 1 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              )}>
                {t("tracker.remainingToday")}: <span className="font-semibold">{remainingHours.toFixed(1)}h</span>
              </div>
            )}
          </div>

          {/* Control Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* START Button - Teal #008795 */}
            {showStartButton && (
              <Button
                onClick={onStart}
                disabled={!canStart}
                className="h-12 px-6 text-base font-semibold bg-tracker-start hover:bg-tracker-start/90 text-primary-foreground"
              >
                <Play className="h-5 w-5 mr-2" />
                {t("tracker.start")}
              </Button>
            )}

            {/* PAUSE Button - Blue-gray #5e7eb9 */}
            {showPauseButton && (
              <Button
                onClick={onPause}
                className="h-12 px-6 text-base font-semibold bg-tracker-pause hover:bg-tracker-pause/90 text-primary-foreground"
              >
                <Pause className="h-5 w-5 mr-2" />
                {t("tracker.pause")}
              </Button>
            )}

            {/* SAVE & RESET Button - Gold #e7b952 */}
            {showSaveButton && (
              <Button
                onClick={onSaveAndReset}
                className="h-12 px-6 text-base font-semibold bg-tracker-save hover:bg-tracker-save/90 text-foreground"
              >
                <Save className="h-5 w-5 mr-2" />
                {t("tracker.saveAndReset")}
              </Button>
            )}

            {/* CANCEL Button - Gray #727176 */}
            {showCancelButton && (
              <Button
                onClick={onCancel}
                className="h-12 px-6 text-base font-semibold bg-tracker-cancel hover:bg-tracker-cancel/90 text-primary-foreground"
              >
                <X className="h-5 w-5 mr-2" />
                {t("common.cancel")}
              </Button>
            )}

            {/* DELETE Button - Crimson */}
            {showDeleteButton && (
              <Button
                onClick={onDelete}
                variant="destructive"
                className="h-12 px-6 text-base font-semibold"
              >
                <Trash2 className="h-5 w-5 mr-2" />
                {t("common.delete")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

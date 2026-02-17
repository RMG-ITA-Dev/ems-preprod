import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Blocker } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "ems_skipTimerLeaveConfirm";

interface LeaveStopwatchDialogProps {
  blocker: Blocker;
}

export function LeaveStopwatchDialog({ blocker }: LeaveStopwatchDialogProps) {
  const { t } = useTranslation();
  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (blocker.state !== "blocked") return null;

  const handleLeave = () => {
    if (dontAskAgain) {
      localStorage.setItem(STORAGE_KEY, "true");
    }
    blocker.proceed?.();
  };

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("tracker.timerRunningTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("tracker.timerRunningBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="dontAskAgain"
            checked={dontAskAgain}
            onCheckedChange={(checked) => setDontAskAgain(!!checked)}
          />
          <Label htmlFor="dontAskAgain" className="text-sm cursor-pointer">
            {t("tracker.dontAskAgain")}
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>
            {t("tracker.stay")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleLeave}>
            {t("tracker.leave")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function shouldSkipTimerLeaveConfirm(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

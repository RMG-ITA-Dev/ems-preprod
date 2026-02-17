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

interface LeavePageDialogProps {
  blocker: Blocker;
  isDirty: boolean;
}

export function LeavePageDialog({ blocker, isDirty }: LeavePageDialogProps) {
  const { t } = useTranslation();

  if (blocker.state !== "blocked") return null;

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDirty
              ? t("common.leavePageDirtyTitle")
              : t("common.leavePageTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDirty
              ? t("common.leavePageDirtyBody")
              : t("common.leavePageLockedBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>
            {t("common.stay")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => blocker.proceed?.()}
            className={isDirty ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {t("common.leaveAnyway")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

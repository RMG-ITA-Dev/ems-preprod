import { useTranslation } from "react-i18next";
import { Pause, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StopActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formattedTime: string;
  onPause: () => void;
  onLogAndReset: () => void;
}

export function StopActionDialog({
  open,
  onOpenChange,
  formattedTime,
  onPause,
  onLogAndReset,
}: StopActionDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tracker.stopDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("tracker.stopDialog.description", { time: formattedTime })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-4">
          <Button
            variant="outline"
            className="justify-start h-auto py-3 px-4"
            onClick={() => {
              onPause();
              onOpenChange(false);
            }}
          >
            <Pause className="h-4 w-4 mr-3 text-warning" />
            <div className="text-left">
              <div className="font-medium">{t("tracker.stopDialog.pause")}</div>
              <div className="text-xs text-muted-foreground">{t("tracker.stopDialog.pauseDesc")}</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="justify-start h-auto py-3 px-4"
            onClick={() => {
              onLogAndReset();
              onOpenChange(false);
            }}
          >
            <Save className="h-4 w-4 mr-3 text-brand-purple" />
            <div className="text-left">
              <div className="font-medium">{t("tracker.stopDialog.logAndReset")}</div>
              <div className="text-xs text-muted-foreground">{t("tracker.stopDialog.logAndResetDesc")}</div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  notesLabel?: string;
  notesRequired?: boolean;
  destructive?: boolean;
  isSubmitting?: boolean;
  onConfirm: (notes: string) => void;
}

export function SimpleConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  notesLabel,
  notesRequired = false,
  destructive = false,
  isSubmitting,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNotes("");
      setError(null);
    }
  }, [open]);

  const handleConfirm = (e: React.MouseEvent) => {
    if (notesRequired && notes.trim().length === 0) {
      e.preventDefault();
      setError(t("fundRequest.errors.notesRequired"));
      return;
    }
    onConfirm(notes);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>

        {notesLabel && (
          <div className="space-y-2 py-2">
            <Label htmlFor="simple-confirm-notes">
              {notesLabel}
              {notesRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id="simple-confirm-notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (error) setError(null);
              }}
              rows={3}
              placeholder={
                notesRequired
                  ? t("fundRequest.dialog.notesPlaceholderRequired")
                  : t("fundRequest.dialog.notesPlaceholderOptional")
              }
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {isSubmitting ? t("common.saving") : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

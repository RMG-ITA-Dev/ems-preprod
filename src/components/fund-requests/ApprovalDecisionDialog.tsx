import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Eye, XCircle } from "lucide-react";
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

export type DecisionMode = "approve" | "observe" | "reject";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DecisionMode;
  isSubmitting?: boolean;
  onConfirm: (notes: string) => void;
  /** "request" (default) = aprobar la solicitud/OT; "expense" = aprobar gastos en lote */
  entity?: "request" | "expense";
}

export function ApprovalDecisionDialog({
  open,
  onOpenChange,
  mode,
  isSubmitting,
  onConfirm,
  entity = "request",
}: Props) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNotes("");
      setError(null);
    }
  }, [open, mode]);

  const notesRequired = mode === "observe" || mode === "reject";
  const showNotes = mode === "observe" || mode === "reject";

  const modeIcon =
    mode === "approve" ? (
      <CheckCircle2 className="inline-block mr-2 h-5 w-5 align-middle text-success" />
    ) : mode === "observe" ? (
      <Eye className="inline-block mr-2 h-5 w-5 align-middle text-warning" />
    ) : (
      <XCircle className="inline-block mr-2 h-5 w-5 align-middle text-destructive" />
    );

  const prefix = entity === "expense" ? "fundRequestExpense.dialog" : "fundRequest.dialog";

  const titleKey =
    mode === "approve"
      ? `${prefix}.approveTitle`
      : mode === "observe"
        ? `${prefix}.observeTitle`
        : `${prefix}.rejectTitle`;

  const bodyKey =
    mode === "approve"
      ? `${prefix}.approveBody`
      : mode === "observe"
        ? `${prefix}.observeBody`
        : `${prefix}.rejectBody`;

  const notesLabelKey =
    mode === "reject" ? "fundRequest.rejectionReason" : "fundRequest.approvalNotes";

  const confirmLabelKey =
    mode === "approve"
      ? "fundRequest.actions.approve"
      : mode === "observe"
        ? "fundRequest.actions.observe"
        : "fundRequest.actions.reject";

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
          <AlertDialogTitle>
            {modeIcon}
            {t(titleKey)}
          </AlertDialogTitle>
          <AlertDialogDescription>{t(bodyKey)}</AlertDialogDescription>
        </AlertDialogHeader>

        {showNotes && (
          <div className="space-y-2 py-2">
            <Label htmlFor="decision-notes">
              {t(notesLabelKey)}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Textarea
              id="decision-notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (error) setError(null);
              }}
              rows={4}
              placeholder={t("fundRequest.dialog.notesPlaceholderRequired")}
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
              mode === "reject"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {isSubmitting ? t("common.saving") : t(confirmLabelKey)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

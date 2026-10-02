import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface TimesheetReversalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
  /** Etiqueta del botón de confirmar. Default: solicitar (uso de /timesheet). */
  confirmLabel?: string;
  /** Título del diálogo. Default: solicitar (uso de /timesheet). */
  title?: string;
  /** Descripción del diálogo. Default: solicitar (uso de /timesheet). */
  description?: string;
}

// 0923-209: razón obligatoria para solicitar/ejecutar/rechazar una reversión. Calcado del
// Reject Dialog de TimesheetApprovalDetail.tsx, salvo que acá la razón es obligatoria (no
// opcional). Un solo componente cubre las 4 acciones (solicitar, revertir directo, ejecutar
// solicitud, rechazar solicitud) -- el título, la descripción y la etiqueta del botón de
// confirmar cambian según la acción (review iteración 4, hallazgo #2): antes eran fijos
// ("Request Reversal" / "An administrator will review your request") aunque el diálogo se
// usara para revertir, ejecutar o rechazar, lo cual podía confundir al admin justo antes de
// un cambio de estado irreversible.
export function TimesheetReversalDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  confirmLabel,
  title,
  description,
}: TimesheetReversalDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");

  // Reinicia la razón cada vez que el diálogo se cierra, sin importar la causa: un cierre por
  // éxito (el padre pone `open=false` directo, sin pasar por `onOpenChange`) dejaba el texto
  // anterior pre-cargado -- y el botón ya habilitado -- la próxima vez que se abría para OTRA
  // fila (review iteración 1, hallazgo #8).
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const trimmedReason = reason.trim();

  const handleConfirm = () => {
    if (!trimmedReason) return;
    onConfirm(trimmedReason);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? t("timesheet.reversalDialogTitle")}</DialogTitle>
          <DialogDescription>{description ?? t("timesheet.reversalDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder={t("approval.notesPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="cancel" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="submit" onClick={handleConfirm} disabled={isPending || !trimmedReason}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel ?? t("timesheet.requestReversal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

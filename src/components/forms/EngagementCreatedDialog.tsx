import { useTranslation } from "react-i18next";
import { CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * BUG 0603-140 (enhancement): post-creation confirmation modal for a new engagement.
 * Presentational and self-contained (owns its copy-to-clipboard); the parent passes
 * already-translated summary values and the three navigation callbacks.
 */
export interface EngagementCreatedDialogProps {
  open: boolean;
  code: string;
  name: string;
  clientName: string;
  anioFiscal: number | string;
  service: string; // already-translated label (engagement.practica_*)
  funcion: string; // already-translated label (engagement.funcion_*)
  status: string;  // already-translated label (status.*)
  onClose: () => void;          // Close / X → engagements list
  onCreateAnother: () => void;  // Create another → reset form, no navigation
  onGoToWorkMatrix: () => void; // Go to Work Matrix → /worksheets
}

export function EngagementCreatedDialog({
  open,
  code,
  name,
  clientName,
  anioFiscal,
  service,
  funcion,
  status,
  onClose,
  onCreateAnother,
  onGoToWorkMatrix,
}: EngagementCreatedDialogProps) {
  const { t } = useTranslation();

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("engagement.codeCopied"));
    } catch {
      toast.error(t("engagement.codeCopyError"));
    }
  };

  const summaryRows: { label: string; value: string }[] = [
    { label: t("engagement.name"), value: name },
    { label: t("engagement.client"), value: clientName },
    { label: t("engagement.anioFiscal"), value: String(anioFiscal) },
    { label: t("engagement.practica"), value: service },
    { label: t("engagement.funcion"), value: funcion },
    { label: t("engagement.status"), value: status },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <DialogTitle>{t("engagement.codeCreatedTitle")}</DialogTitle>
          </div>
          <DialogDescription>{t("engagement.codeCreatedDescription")}</DialogDescription>
        </DialogHeader>

        {/* Generated code — highlighted with the semantic warning token */}
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
          <p className="text-xs font-medium text-muted-foreground">{t("engagement.codeGeneratedLabel")}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-mono text-2xl font-semibold text-warning">{code}</span>
            <Button type="button" variant="outline" size="sm" onClick={handleCopyCode}>
              <Copy className="h-4 w-4 mr-2" />
              {t("engagement.copyCode")}
            </Button>
          </div>
        </div>

        {/* Engagement summary */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("engagement.summaryTitle")}</p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {summaryRows.map((row) => (
              <div key={row.label} className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="text-sm">{row.value || t("common.notAvailable")}</dd>
              </div>
            ))}
          </dl>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="cancel" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button type="button" variant="outline" onClick={onGoToWorkMatrix}>
            {t("engagement.goToWorkMatrix")}
          </Button>
          <Button type="button" variant="default" onClick={onCreateAnother}>
            {t("engagement.createAnother")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

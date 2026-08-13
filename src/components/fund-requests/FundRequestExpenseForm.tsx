import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, X, FileText, ExternalLink } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { NumericInput } from "@/components/ui/numeric-input";
import { useExpenseTypes } from "@/hooks/useEmsData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { computeExpenseDays } from "@/lib/fundRequest";
import type { FundRequestWorkOrder } from "@/hooks/useFundRequests";

export interface FundRequestExpenseFormValues {
  wo_id: string;
  expense_type_id: string;
  expense_date: string; // YYYY-MM-DD ("Del" / inicio)
  expense_date_end: string; // YYYY-MM-DD ("Al" / fin, opcional)
  amount: number;
  description: string;
  document_number: string;
  supplier_name: string;
  supplier_tax_id: string;
  attachment_url: string;
}

interface Props {
  values: FundRequestExpenseFormValues;
  onChange: (patch: Partial<FundRequestExpenseFormValues>) => void;
  /** OTs asociadas a la solicitud de fondos — son las únicas seleccionables */
  workOrders: FundRequestWorkOrder[];
  currency: "BOB" | "USD";
  disabled?: boolean;
  /** Renderiza sin la Card contenedora (para usar dentro de un modal) */
  bare?: boolean;
  /** Solo el Respaldo editable; el resto en solo lectura (gasto devuelto por contabilidad) */
  onlyAttachment?: boolean;
}

export function FundRequestExpenseForm({
  values,
  onChange,
  workOrders,
  currency,
  disabled = false,
  bare = false,
  onlyAttachment = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const numericLocale = i18n.language?.startsWith("es") ? "es" : "en";
  const { data: expenseTypes } = useExpenseTypes();

  // En modo "solo respaldo" se deshabilitan todos los campos menos el adjunto.
  const fieldsDisabled = disabled || onlyAttachment;

  // ── Carga de archivos (misma lógica que el módulo de Gastos) ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("fundRequestExpense.fileTooLarge", "El archivo debe pesar menos de 5MB"));
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("expenses.invalidFileType", "Solo se permiten JPG, PNG, WebP y PDF"));
      return;
    }

    setUploading(true);
    setProgress(0);
    setFileName(file.name);

    try {
      const fileExt = file.name.split(".").pop();
      const path = `receipts/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 10, 90));
      }, 100);

      const { data, error } = await supabase.storage
        .from("expense-receipts")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      clearInterval(progressInterval);
      if (error) throw error;

      const { data: signed, error: urlError } = await supabase.storage
        .from("expense-receipts")
        .createSignedUrl(data.path, 60 * 60 * 24 * 365);
      if (urlError) throw urlError;

      setProgress(100);
      onChange({ attachment_url: signed.signedUrl });
      toast.success(t("expenses.fileUploaded", "Archivo subido correctamente"));
    } catch (err) {
      console.error("Upload error:", err);
      toast.error(t("expenses.uploadFailed", "No se pudo subir el archivo"));
      setFileName(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = () => {
    onChange({ attachment_url: "" });
    setFileName(null);
    setProgress(0);
  };

  const inner = (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* OT */}
          <div className="space-y-2">
            <Label htmlFor="fre-wo">{t("fundRequestExpense.workOrder")} *</Label>
            <Select
              value={values.wo_id || undefined}
              onValueChange={(v) => onChange({ wo_id: v })}
              disabled={fieldsDisabled || workOrders.length === 0}
            >
              <SelectTrigger id="fre-wo">
                <SelectValue placeholder={t("fundRequestExpense.selectWorkOrder")} />
              </SelectTrigger>
              <SelectContent>
                {workOrders.map((frwo) => {
                  // El encargo llega por un embed anidado
                  // (fund_request_work_orders → work_orders → engagements) y RLS
                  // puede devolverlo vacío. Antes se concatenaba directo, así que la
                  // etiqueta colapsaba al separador literal y la opción se veía como
                  // un simple "—" (reportado 2026-07-31; la causa de fondo la
                  // corrige 20260731000000). El fallback deja la opción usable e
                  // identificable en vez de mostrar un guion suelto.
                  const eng = frwo.work_order?.engagement;
                  const label = [eng?.engagement_code, eng?.engagement_name]
                    .filter(Boolean)
                    .join(" — ");
                  return (
                    <SelectItem key={frwo.wo_id} value={frwo.wo_id}>
                      {label || t("fundRequestExpense.workOrderNoAccess")}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de gasto */}
          <div className="space-y-2">
            <Label htmlFor="fre-type">{t("fundRequestExpense.expenseType")}</Label>
            <Select
              value={values.expense_type_id || undefined}
              onValueChange={(v) => onChange({ expense_type_id: v })}
              disabled={fieldsDisabled}
            >
              <SelectTrigger id="fre-type">
                <SelectValue placeholder={t("fundRequestExpense.selectExpenseType")} />
              </SelectTrigger>
              <SelectContent>
                {(expenseTypes ?? []).map((et) => (
                  <SelectItem key={et.expense_type_id} value={et.expense_type_id}>
                    {et.expense_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha (Del) */}
          <div className="space-y-2">
            <Label htmlFor="fre-date">{t("fundRequestExpense.expenseDateStart")} *</Label>
            <Input
              id="fre-date"
              type="date"
              value={values.expense_date || ""}
              onChange={(e) => onChange({ expense_date: e.target.value })}
              disabled={fieldsDisabled}
            />
          </div>

          {/* Fecha (Al) */}
          <div className="space-y-2">
            <Label htmlFor="fre-date-end">{t("fundRequestExpense.expenseDateEnd")}</Label>
            <Input
              id="fre-date-end"
              type="date"
              value={values.expense_date_end || ""}
              min={values.expense_date || undefined}
              onChange={(e) => onChange({ expense_date_end: e.target.value })}
              disabled={fieldsDisabled}
            />
          </div>

          {/* Días (derivado — display de solo lectura, no enfocable) */}
          <div className="space-y-2">
            <Label htmlFor="fre-days">{t("fundRequestExpense.days")}</Label>
            <div
              id="fre-days"
              className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
            >
              {computeExpenseDays(values.expense_date, values.expense_date_end) ?? "—"}
            </div>
          </div>

          {/* Monto */}
          <div className="space-y-2">
            <Label htmlFor="fre-amount">
              {t("fundRequestExpense.amount")} ({currency}) *
            </Label>
            <NumericInput
              id="fre-amount"
              decimals={2}
              locale={numericLocale}
              min={0}
              value={values.amount || ""}
              onChange={(v) => onChange({ amount: v })}
              disabled={fieldsDisabled}
              className="text-right font-mono"
            />
          </div>

          {/* N° de documento / factura */}
          <div className="space-y-2">
            <Label htmlFor="fre-doc">{t("fundRequestExpense.documentNumber")}</Label>
            <Input
              id="fre-doc"
              value={values.document_number || ""}
              onChange={(e) => onChange({ document_number: e.target.value })}
              disabled={fieldsDisabled}
              placeholder={t("fundRequestExpense.documentNumberPlaceholder")}
            />
          </div>

          {/* Proveedor */}
          <div className="space-y-2">
            <Label htmlFor="fre-supplier">{t("fundRequestExpense.supplierName")}</Label>
            <Input
              id="fre-supplier"
              value={values.supplier_name || ""}
              onChange={(e) => onChange({ supplier_name: e.target.value })}
              disabled={fieldsDisabled}
            />
          </div>

          {/* NIT del proveedor */}
          <div className="space-y-2">
            <Label htmlFor="fre-tax">{t("fundRequestExpense.supplierTaxId")}</Label>
            <Input
              id="fre-tax"
              value={values.supplier_tax_id || ""}
              onChange={(e) => onChange({ supplier_tax_id: e.target.value })}
              disabled={fieldsDisabled}
              placeholder={t("fundRequestExpense.supplierTaxIdPlaceholder")}
            />
          </div>

          {/* Respaldo (archivo) */}
          <div className="space-y-2">
            <Label>{t("fundRequestExpense.attachmentUrl")}</Label>

            {values.attachment_url ? (
              <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm truncate flex-1">
                  {fileName || t("expenses.receiptAttached", "Respaldo adjunto")}
                </span>
                <a
                  href={values.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-muted rounded"
                >
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleRemoveFile}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              !disabled && (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="fre-attachment-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading
                      ? t("expenses.uploading", "Subiendo...")
                      : t("expenses.uploadReceipt", "Subir Respaldo")}
                  </Button>
                  {uploading && <Progress value={progress} className="h-2" />}
                  <p className="text-xs text-muted-foreground">
                    {t("fundRequestExpense.fileTypes", "JPG, PNG, WebP o PDF (máx 5MB)")}
                  </p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Descripción */}
        <div className="space-y-2">
          <Label htmlFor="fre-description">{t("fundRequestExpense.description")}</Label>
          <Textarea
            id="fre-description"
            value={values.description}
            onChange={(e) => onChange({ description: e.target.value })}
            disabled={fieldsDisabled}
            rows={3}
            placeholder={t("fundRequestExpense.descriptionPlaceholder")}
          />
        </div>
    </div>
  );

  if (bare) return inner;

  return (
    <Card>
      <CardContent className="pt-6">{inner}</CardContent>
    </Card>
  );
}

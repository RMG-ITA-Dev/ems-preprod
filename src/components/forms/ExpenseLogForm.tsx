import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Upload, X, FileText, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useEngagements, useExpenseTypes } from "@/hooks/useEmsData";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ExpenseLogFormData {
  expense_log_id?: string;
  engagement_id: string;
  expense_type_id: string;
  date_incurred: string;
  amount: number;
  currency: string;
  description: string | null;
  receipt_url?: string | null;
  created_by_staff?: {
    first_name: string;
    last_name: string;
    initials: string | null;
  } | null;
}

interface ExpenseLogFormProps {
  initialData?: ExpenseLogFormData | null;
  onSubmit: (data: {
    engagement_id: string;
    expense_type_id: string;
    date_incurred: string;
    amount: number;
    currency: string;
    description: string | null;
    receipt_url: string | null;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ExpenseLogForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: ExpenseLogFormProps) {
  const { t } = useTranslation();
  const { data: engagements = [] } = useEngagements();
  const { data: expenseTypes = [] } = useExpenseTypes();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter only active engagements with approved work orders for selection
  const activeEngagements = engagements.filter(e => e.status === "active");

  const [formData, setFormData] = useState({
    engagement_id: initialData?.engagement_id || "",
    expense_type_id: initialData?.expense_type_id || "",
    date_incurred: initialData?.date_incurred || "",
    amount: initialData?.amount || 0,
    currency: (initialData?.currency || "BOB") as "BOB" | "USD",
    description: initialData?.description || "",
  });

  const [date, setDate] = useState<Date | undefined>(
    initialData?.date_incurred ? new Date(initialData.date_incurred + "T12:00:00") : undefined
  );

  // File upload state
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(initialData?.receipt_url || null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        engagement_id: initialData.engagement_id,
        expense_type_id: initialData.expense_type_id,
        date_incurred: initialData.date_incurred,
        amount: initialData.amount,
        currency: initialData.currency as "BOB" | "USD",
        description: initialData.description || "",
      });
      if (initialData.date_incurred) {
        setDate(new Date(initialData.date_incurred + "T12:00:00"));
      }
      if (initialData.receipt_url) {
        setUploadedFileUrl(initialData.receipt_url);
      }
    }
  }, [initialData]);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
      setFormData((prev) => ({
        ...prev,
        date_incurred: format(selectedDate, "yyyy-MM-dd"),
      }));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("expenses.fileTooLarge", "File size must be less than 10MB"));
      return;
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("expenses.invalidFileType", "Only JPG, PNG, WebP and PDF files are allowed"));
      return;
    }

    setUploadingFile(true);
    setUploadProgress(0);
    setSelectedFileName(file.name);

    try {
      // Generate unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `receipts/${fileName}`;

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const { data, error } = await supabase.storage
        .from("expense-receipts")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      clearInterval(progressInterval);

      if (error) {
        throw error;
      }

      // Get signed URL for the uploaded file (valid for 1 year)
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from("expense-receipts")
        .createSignedUrl(data.path, 60 * 60 * 24 * 365);

      if (urlError) {
        throw urlError;
      }

      setUploadProgress(100);
      setUploadedFileUrl(signedUrlData.signedUrl);
      toast.success(t("expenses.fileUploaded", "File uploaded successfully"));
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(t("expenses.uploadFailed", "Failed to upload file"));
      setSelectedFileName(null);
    } finally {
      setUploadingFile(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveFile = () => {
    setUploadedFileUrl(null);
    setSelectedFileName(null);
    setUploadProgress(0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onSubmit({
      engagement_id: formData.engagement_id,
      expense_type_id: formData.expense_type_id,
      date_incurred: formData.date_incurred,
      amount: formData.amount,
      currency: formData.currency,
      description: formData.description || null,
      receipt_url: uploadedFileUrl,
    });
  };

  const isValid =
    formData.engagement_id &&
    formData.expense_type_id &&
    formData.date_incurred &&
    formData.amount > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 form-dense">
      {initialData?.created_by_staff && (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">{t("expenses.loggedBy")}:</span>{" "}
          {initialData.created_by_staff.first_name} {initialData.created_by_staff.last_name}
          {initialData.created_by_staff.initials && (
            <span className="ml-1">({initialData.created_by_staff.initials})</span>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Engagement */}
        <div className="space-y-1.5">
          <Label>{t("expenses.engagement")} *</Label>
          <Select
            value={formData.engagement_id}
            onValueChange={(val) => setFormData((prev) => ({ ...prev, engagement_id: val }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("engagement.selectClient")} />
            </SelectTrigger>
            <SelectContent>
              {activeEngagements.map((eng) => (
                <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                  {eng.engagement_code ? `${eng.engagement_code} - ` : ""}{eng.engagement_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Expense Type */}
        <div className="space-y-1.5">
          <Label>{t("expenses.expenseType")} *</Label>
          <Select
            value={formData.expense_type_id}
            onValueChange={(val) => setFormData((prev) => ({ ...prev, expense_type_id: val }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("form.selectOption")} />
            </SelectTrigger>
            <SelectContent>
              {expenseTypes.map((type) => (
                <SelectItem key={type.expense_type_id} value={type.expense_type_id}>
                  {type.expense_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date */}
        <div className="space-y-1.5">
          <Label>{t("expenses.date")} *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "dd/MM/yyyy") : t("common.pickDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleDateSelect}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Currency */}
        <div className="space-y-1.5">
          <Label>{t("expenses.currency")} *</Label>
          <Select
            value={formData.currency}
            onValueChange={(val) => setFormData((prev) => ({ ...prev, currency: val as "BOB" | "USD" }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BOB">BOB</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <Label>{t("expenses.amount")} *</Label>
          <NumericInput
            decimals={2}
            locale={formData.currency === "BOB" ? "es" : "en"}
            min={0}
            value={formData.amount || ""}
            onChange={(val) =>
              setFormData((prev) => ({ ...prev, amount: val }))
            }
            placeholder="0.00"
          />
        </div>

        {/* Receipt File Upload */}
        <div className="space-y-1.5">
          <Label>{t("expenses.receiptUrl")}</Label>
          
          {!uploadedFileUrl ? (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="receipt-upload"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadingFile ? t("expenses.uploading", "Uploading...") : t("expenses.uploadReceipt", "Upload Receipt")}
              </Button>
              {uploadingFile && (
                <Progress value={uploadProgress} className="h-2" />
              )}
              <p className="text-xs text-muted-foreground">
                {t("expenses.fileTypes", "JPG, PNG, WebP or PDF (max 10MB)")}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm truncate flex-1">
                {selectedFileName || t("expenses.receiptAttached", "Receipt attached")}
              </span>
              <a
                href={uploadedFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-muted rounded"
              >
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleRemoveFile}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Description - full width */}
      <div className="space-y-1.5">
        <Label>{t("expenses.description")}</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder={t("expenses.description")}
          rows={2}
        />
      </div>

      {/* Actions - stack on mobile */}
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
          {t("common.cancel")}
        </Button>
        <LoadingButton
          type="submit"
          loading={isLoading}
          disabled={!isValid || uploadingFile}
          className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
        >
          {t("common.save")}
        </LoadingButton>
      </div>
    </form>
  );
}

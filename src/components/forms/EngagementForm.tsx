import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, startOfDay, isBefore } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EngagementCreatedDialog } from "@/components/forms/EngagementCreatedDialog";
import { Engagement, useClients } from "@/hooks/useEmsData";
import { useCategoryStaff } from "@/hooks/useCategoryStaff";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useCreateEngagement, useUpdateEngagement, useDeleteEngagement } from "@/hooks/mutations";
import { Trash2, CalendarIcon, AlertCircle, ChevronsUpDown, Check, Upload, X, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useUserRole } from "@/hooks/useUserRole";
import { formatClosingDateLabel } from "@/lib/fiscalYearDisplay";
import { getUpcomingClosingDates, getFiscalYearForDate } from "@/lib/fiscalCalculations";

interface StaffComboboxProps {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  noResultsText: string;
  noAplicaText: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  showNoAplica?: boolean;
}

function StaffCombobox({
  label,
  placeholder,
  searchPlaceholder,
  noResultsText,
  noAplicaText,
  options = [],
  value,
  onChange,
  showNoAplica = true,
}: StaffComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = value ? options.find((o) => o.value === value)?.label : null;

  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <FormControl>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className={cn("w-full justify-between font-normal", !selectedLabel && "text-muted-foreground")}
            >
              {selectedLabel ?? placeholder}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </FormControl>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{noResultsText}</CommandEmpty>
              <CommandGroup>
                {showNoAplica && (
                  <CommandItem
                    value="__no_aplica__"
                    onSelect={() => { onChange(null); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === null ? "opacity-100" : "opacity-0")} />
                    {noAplicaText}
                  </CommandItem>
                )}
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => { onChange(opt.value); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === opt.value ? "opacity-100" : "opacity-0")} />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <FormMessage />
    </FormItem>
  );
}

const suggestFiscalYear = (): number => {
  const now = new Date()
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
}
const FISCAL_YEAR_START = 2025
const FISCAL_YEAR_LOOKAHEAD = 3

// BUG #0603-140: reuse the same i18n keys as the form's SelectItems to label the
// created-engagement summary in the confirmation modal.
const PRACTICA_LABEL_KEYS: Record<number, string> = {
  0: "engagement.practica_firmwide",
  1: "engagement.practica_auditoria",
  2: "engagement.practica_consultoria",
  3: "engagement.practica_tax",
  4: "engagement.practica_growthStrategy",
}
const FUNCION_LABEL_KEYS: Record<number, string> = {
  0: "engagement.funcion_adm",
  1: "engagement.funcion_cli",
  2: "engagement.funcion_cap",
  3: "engagement.funcion_calidad",
}

const formSchema = z.object({
  engagement_name: z.string()
    .min(5, "Engagement name must be at least 5 characters")
    .max(200, "Engagement name cannot exceed 200 characters"),
  anio_fiscal: z.number().int().min(2020).max(2100, "Invalid fiscal year").optional(),
  oficina:     z.number().int().min(0).max(2,   "Invalid office").optional(),
  practica:    z.number().int().min(0).max(4,   "Invalid practice").optional(),
  funcion:     z.number().int().min(0).max(3,   "Invalid function").optional(),
  client_id: z.string().min(1, "Client is required"),
  partner_id: z.string().min(1, "Partner/Director is required"),
  manager_id: z.string().min(1, "Manager is required"),
  start_date: z.date({ required_error: "Start date is required" }),
  end_date: z.date({ required_error: "End date is required" }),
  status: z.string(),
  sqr_id: z.string().nullable().optional(),
  encargado_id: z.string().nullable().optional(),
  specialist_it_id: z.string().nullable().optional(),
  specialist_tax_id: z.string().nullable().optional(),
  closing_date_option: z.string().optional(), // "yyyy-MM-dd" of a standard close, or "Otro"
  closing_date_custom: z.date().optional(),
}).refine((data) => {
  if (data.start_date && data.end_date) {
    return data.end_date >= data.start_date;
  }
  return true;
}, {
  message: "End date must be on or after the start date",
  path: ["end_date"],
});

type FormData = z.infer<typeof formSchema>;

interface EngagementFormProps {
  engagement?: Engagement | null;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel?: () => void;
  onSaveSuccess?: () => void;
  onGoToWorkMatrix?: () => void;
}

export function EngagementForm({ engagement, onDirtyChange, onCancel, onSaveSuccess, onGoToWorkMatrix }: EngagementFormProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin, isManager, isPartner } = useUserRole();
  const isEdit = !!engagement;
  // BUG #0604-143: closing date (and the FY it derives) may be edited by Admin/Gerente/Socio;
  // oficina/practica/funcion/engagement_code remain fully immutable after create.
  const canEditClosing = isAdmin || isManager || isPartner;

  const { data: clients } = useClients();
  const { partnerOptions, managerOptions, hasPartnerCategory, hasManagerCategory, allActiveStaff } = useCategoryStaff();
  const { staffRecord } = useCurrentStaff();
  const createMutation = useCreateEngagement();
  const updateMutation = useUpdateEngagement();
  const deleteMutation = useDeleteEngagement();

  // BUG #0625-151: contrato escaneado — solo se sube en modo creación, antes de guardar el
  // encargo (permite cancelar/reseleccionar con el botón X). No se edita/reemplaza en isEdit.
  const contractFileInputRef = useRef<HTMLInputElement>(null);
  const [contractFilePath, setContractFilePath] = useState<string | null>(null);
  const [contractFileName, setContractFileName] = useState<string | null>(null);
  const [contractUploading, setContractUploading] = useState(false);
  const [contractProgress, setContractProgress] = useState(0);
  const [contractError, setContractError] = useState<string | null>(null);
  const [downloadingContract, setDownloadingContract] = useState(false);

  const clientOptions = useMemo(
    () => clients?.filter(c => c.is_active || c.client_id === engagement?.client_id) ?? [],
    [clients, engagement?.client_id]
  );

  const initializedEngagementIdRef = useRef<string | null>(null);

  // Build missing categories message
  const missingCategories: string[] = [];
  if (!hasPartnerCategory) missingCategories.push(t("engagement.partner"));
  if (!hasManagerCategory) missingCategories.push(t("engagement.manager"));
  const hasMissingCategories = missingCategories.length > 0;

  const statusOptions = [
    { value: "active", label: t("status.active") },
    { value: "pending", label: t("status.pending") },
    { value: "completed", label: t("status.completed") },
    { value: "cancelled", label: t("status.cancelled") },
  ];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      engagement_name: "",
      anio_fiscal: suggestFiscalYear(),
      oficina: undefined,
      practica: undefined,
      funcion: undefined,
      client_id: "",
      partner_id: "",
      manager_id: "",
      status: "active",
      sqr_id: null,
      encargado_id: null,
      specialist_it_id: null,
      specialist_tax_id: null,
      closing_date_option: undefined,
      closing_date_custom: undefined,
    },
  });

  // BUG #0603-140: data assigned by the server, shown in a confirmation modal after create
  const [createdInfo, setCreatedInfo] = useState<{
    code: string;
    name: string;
    clientName: string;
    anioFiscal: number;
    service: string;
    funcion: string;
    status: string;
  } | null>(null);

  // Policy flags state (outside react-hook-form since they're admin-only)
  const [workOrderRequired, setWorkOrderRequired] = useState(engagement?.work_order_required ?? true);
  const [activityRequired, setActivityRequired] = useState(engagement?.activity_required ?? true);
  const [isInternal, setIsInternal] = useState(engagement?.is_internal ?? false);
  const [approvalRequired, setApprovalRequired] = useState(engagement?.approval_required ?? true);
  // BUG #0604-143: admin-only manual override of the derived Año Fiscal.
  const [overrideOn, setOverrideOn] = useState(engagement?.anio_fiscal_override ?? false);
  // BUG #0604-143: dated closing-date options (upcoming quarter-ends, each carrying its full
  // date so the derived FY is unambiguous). "Otro" reveals a calendar for client-specific dates.
  const closingDateOptions = useMemo(() => getUpcomingClosingDates(), []);

  // BUG #0206-19 + #0220-48: Minimum allowed start date (bypassed for internal)
  const minStartDate = useMemo(() => {
    if (isInternal) return undefined;
    if (isEdit && engagement?.created_at) {
      return startOfDay(new Date(engagement.created_at));
    }
    return startOfDay(new Date());
  }, [isInternal, isEdit, engagement?.created_at]);

  // Destructure isDirty before effects that depend on it
  const { isDirty } = form.formState;

  useEffect(() => {
    if (
      engagement &&
      clients &&
      !isDirty &&
      initializedEngagementIdRef.current !== engagement.engagement_id
    ) {
      initializedEngagementIdRef.current = engagement.engagement_id;
      // Reconstruct the closing-date control: if the stored date is one of the offered dated
      // options select it; otherwise (past close or client-specific date) fall back to "Otro"
      // with the date prefilled.
      const storedClosing = engagement.fecha_cierre || undefined;
      const closingInWindow = storedClosing != null && closingDateOptions.some((o) => o.value === storedClosing);
      const closingDateOption = storedClosing ? (closingInWindow ? storedClosing : "Otro") : undefined;
      form.reset({
        engagement_name: engagement.engagement_name,
        anio_fiscal: engagement.anio_fiscal ?? undefined,
        oficina:     engagement.oficina     ?? undefined,
        practica:    engagement.practica    ?? undefined,
        funcion:     engagement.funcion     ?? undefined,
        client_id: engagement.client_id,
        partner_id: engagement.partner_id || "",
        manager_id: engagement.manager_id || "",
        status: engagement.status,
        start_date: engagement.start_date ? parseDateLocal(engagement.start_date) : undefined,
        end_date: engagement.end_date ? parseDateLocal(engagement.end_date) : undefined,
        sqr_id: engagement.sqr_id ?? null,
        encargado_id: engagement.encargado_id ?? null,
        specialist_it_id: engagement.specialist_it_id ?? null,
        specialist_tax_id: engagement.specialist_tax_id ?? null,
        closing_date_option: closingDateOption,
        closing_date_custom: closingDateOption === "Otro" && storedClosing ? parseDateLocal(storedClosing) : undefined,
      });
      setWorkOrderRequired(engagement.work_order_required ?? true);
      setActivityRequired(engagement.activity_required ?? true);
      setIsInternal(engagement.is_internal ?? false);
      setApprovalRequired(engagement.approval_required ?? true);
      setOverrideOn(engagement.anio_fiscal_override ?? false);
    }
  }, [engagement, clients, form, isDirty, closingDateOptions]);

  // Report dirty state to parent
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // BUG #0604-143: derive Año Fiscal from the closing date in real time. Standard options
  // carry their full "yyyy-MM-dd" value; "Otro" carries its own picked date.
  const [wClosingOption, wClosingCustom] = form.watch(["closing_date_option", "closing_date_custom"]);
  const resolvedClosingDate = useMemo(() => {
    if (wClosingOption === "Otro") return wClosingCustom ?? null;
    return wClosingOption ? parseDateLocal(wClosingOption) : null;
  }, [wClosingOption, wClosingCustom]);
  const derivedFiscalYear = resolvedClosingDate ? getFiscalYearForDate(resolvedClosingDate) : null;
  // REVIEW FIX (0604-143 it.1): `overrideOn` already reflects the persisted anio_fiscal_override —
  // only an admin can flip it via the Switch below, non-admins simply inherit it on load — so the
  // *effective* override must not depend on the current viewer's role. Gating it on `isAdmin` here
  // made a Manager/Partner save silently discard an admin's override (it forced the derived value
  // and wrote anio_fiscal_override: false). `isAdmin` still gates whether the editable Select
  // (vs. the read-only Input) is rendered.
  const effectiveOverride = overrideOn;
  const showOverrideSelect = isAdmin && overrideOn;

  // Keep the effective anio_fiscal in sync with the derived value unless an override is active.
  useEffect(() => {
    if (!effectiveOverride) {
      form.setValue("anio_fiscal", derivedFiscalYear ?? undefined, { shouldValidate: false, shouldDirty: false });
    }
  }, [derivedFiscalYear, effectiveOverride, form]);

  const handleOverrideToggle = (checked: boolean) => {
    setOverrideOn(checked);
    if (checked && form.getValues("anio_fiscal") == null) {
      form.setValue("anio_fiscal", suggestFiscalYear());
    }
  };

  // BUG #0625-151: solo Admin o el Socio/Gerente asignado al encargo pueden ver/descargar
  // el contrato escaneado. La restricción real ocurre en la política de Storage; esto solo
  // controla si se muestra el botón.
  const canViewContract =
    isAdmin ||
    (!!staffRecord?.staff_id &&
      (staffRecord.staff_id === engagement?.partner_id || staffRecord.staff_id === engagement?.manager_id));

  const showContractSection = isEdit
    ? !!engagement?.contract_file_path && canViewContract
    : !isInternal;

  const handleContractFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error(t("engagement.invalidContractFileType"));
      if (contractFileInputRef.current) contractFileInputRef.current.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("engagement.contractFileTooLarge"));
      if (contractFileInputRef.current) contractFileInputRef.current.value = "";
      return;
    }

    setContractUploading(true);
    setContractProgress(0);

    try {
      const path = `contracts/${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`;

      const progressInterval = setInterval(() => {
        setContractProgress((p) => Math.min(p + 10, 90));
      }, 100);

      const { data, error } = await supabase.storage
        .from("engagement-contracts")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      clearInterval(progressInterval);
      if (error) throw error;

      setContractProgress(100);
      setContractFilePath(data.path);
      setContractFileName(file.name);
      setContractError(null);
      toast.success(t("engagement.contractUploaded"));
    } catch (err) {
      console.error("Contract upload error:", err);
      toast.error(t("engagement.contractUploadFailed"));
    } finally {
      setContractUploading(false);
      if (contractFileInputRef.current) contractFileInputRef.current.value = "";
    }
  };

  const handleRemoveContractFile = async () => {
    if (contractFilePath) {
      const { error } = await supabase.storage.from("engagement-contracts").remove([contractFilePath]);
      if (error) console.error("Contract remove error:", error);
    }
    setContractFilePath(null);
    setContractFileName(null);
    setContractProgress(0);
  };

  const handleDownloadContract = async () => {
    if (!engagement?.contract_file_path) return;
    setDownloadingContract(true);
    try {
      const { data, error } = await supabase.storage
        .from("engagement-contracts")
        .createSignedUrl(engagement.contract_file_path, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Contract download error:", err);
      toast.error(t("engagement.contractDownloadFailed"));
    } finally {
      setDownloadingContract(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    // BUG #0206-19 + #0220-48: skip for internal engagements
    if (!isInternal && minStartDate && data.start_date && isBefore(startOfDay(data.start_date), minStartDate)) {
      form.setError("start_date", {
        message: t("engagement.startDateBeforeCreation"),
      });
      return;
    }

    // REVIEW FIX (0604-143 it.1): moved out of the Zod schema (which has no access to `t()`, so it
    // could only carry a hardcoded English string) into a localized setError, mirroring the
    // required-code-field checks below.
    if (data.closing_date_option === "Otro" && !data.closing_date_custom) {
      form.setError("closing_date_custom", { message: t("engagement.requiredClosingDateCustom") });
      return;
    }

    if (!isEdit) {
      let missingCodeField = false;
      if (data.anio_fiscal === undefined) { form.setError("anio_fiscal", { message: t("engagement.requiredAnioFiscal") }); missingCodeField = true; }
      if (data.oficina    === undefined) { form.setError("oficina",     { message: t("engagement.requiredOficina")    }); missingCodeField = true; }
      if (data.practica   === undefined) { form.setError("practica",    { message: t("engagement.requiredPractica")   }); missingCodeField = true; }
      if (data.funcion    === undefined) { form.setError("funcion",     { message: t("engagement.requiredFuncion")    }); missingCodeField = true; }
      if (data.closing_date_option === undefined) { form.setError("closing_date_option", { message: t("engagement.requiredClosingDate") }); missingCodeField = true; }
      if (missingCodeField) return;
    }

    // BUG #0625-151: el contrato escaneado es obligatorio solo para encargos de cliente
    // (no aplica a internos). El archivo ya se subió a Storage al seleccionarlo, así que
    // solo validamos que exista una ruta antes de crear el encargo.
    if (!isEdit && !isInternal && !contractFilePath) {
      setContractError(t("engagement.contractRequired"));
      return;
    }
    setContractError(null);

    // BUG #0625-151: el contrato escaneado es obligatorio solo para encargos de cliente
    // (no aplica a internos). El archivo ya se subió a Storage al seleccionarlo, así que
    // solo validamos que exista una ruta antes de crear el encargo.
    if (!isEdit && !isInternal && !contractFilePath) {
      setContractError(t("engagement.contractRequired"));
      return;
    }
    setContractError(null);

    // Resolve the closing date from the submitted values: standard option carries its
    // "yyyy-MM-dd" value; "Otro" carries the picked custom date.
    const resolveClosing = (): Date | null =>
      data.closing_date_option === "Otro"
        ? (data.closing_date_custom ?? null)
        : (data.closing_date_option ? parseDateLocal(data.closing_date_option) : null);

    if (isEdit && engagement) {
      const closingDateResolved = canEditClosing ? resolveClosing() : null;
      await updateMutation.mutateAsync({
        id: engagement.engagement_id,
        data: {
          engagement_name:     data.engagement_name,
          client_id:           data.client_id,
          partner_id:          data.partner_id || undefined,
          manager_id:          data.manager_id || undefined,
          start_date:          data.start_date ? format(data.start_date, "yyyy-MM-dd") : undefined,
          end_date:            data.end_date   ? format(data.end_date,   "yyyy-MM-dd") : undefined,
          status:              data.status,
          work_order_required: workOrderRequired,
          activity_required:   activityRequired,
          is_internal:         isInternal,
          approval_required:   approvalRequired,
          sqr_id:              data.sqr_id ?? null,
          encargado_id:        data.encargado_id ?? null,
          specialist_it_id:    data.specialist_it_id ?? null,
          specialist_tax_id:   data.specialist_tax_id ?? null,
          // oficina, practica, funcion, engagement_code intentionally omitted — immutable after create
          ...(canEditClosing && closingDateResolved
            ? {
                anio_fiscal:          data.anio_fiscal as number,
                fecha_cierre:         format(closingDateResolved, "yyyy-MM-dd"),
                anio_fiscal_override: effectiveOverride,
              }
            : {}),
        },
      });
      if (onSaveSuccess) {
        onSaveSuccess();
      } else {
        navigate("/engagements");
      }
      return;
    }

    const closingDateResolved = resolveClosing() as Date;
    const created = await createMutation.mutateAsync({
      engagement_name:     data.engagement_name,
      client_id:           data.client_id,
      partner_id:          data.partner_id || undefined,
      manager_id:          data.manager_id || undefined,
      start_date:          data.start_date ? format(data.start_date, "yyyy-MM-dd") : undefined,
      end_date:            data.end_date   ? format(data.end_date,   "yyyy-MM-dd") : undefined,
      status:              data.status,
      oficina:             data.oficina    as number,
      practica:            data.practica   as number,
      funcion:             data.funcion    as number,
      anio_fiscal:         data.anio_fiscal as number,
      fecha_cierre:        format(closingDateResolved, "yyyy-MM-dd"),
      anio_fiscal_override: effectiveOverride,
      work_order_required: workOrderRequired,
      activity_required:   activityRequired,
      is_internal:         isInternal,
      approval_required:   approvalRequired,
      sqr_id:              data.sqr_id ?? null,
      encargado_id:        data.encargado_id ?? null,
      specialist_it_id:    data.specialist_it_id ?? null,
      specialist_tax_id:   data.specialist_tax_id ?? null,
    });

    // BUG #0625-151: el archivo ya está en Storage; solo falta enlazarlo al encargo recién
    // creado con un update simple (mucho menos riesgoso que subir el archivo después de
    // crear). Si falla, el archivo sigue a salvo en Storage — se avisa para reintentar.
    if (!isInternal && contractFilePath && created?.engagement_id) {
      const { error: linkError } = await supabase
        .from("engagements")
        .update({ contract_file_path: contractFilePath })
        .eq("engagement_id", created.engagement_id);
      if (linkError) {
        console.error("Contract link error:", linkError);
        toast.error(t("engagement.contractUploadFailed"));
      }
    }

    // BUG #0603-140: the engagement is now persisted, so clear the dirty state before the
    // confirmation modal opens. Otherwise isDirty stays true while the modal is up and a
    // browser back-button would trigger a misleading "unsaved changes" warning.
    form.reset(data);

    // BUG #0603-140: show the assigned code in a confirmation modal; navigation is
    // deferred until it closes. Defensive fallback: if no code came back, navigate as before.
    if (created?.engagement_code) {
      const clientName = clientOptions.find((c) => c.client_id === data.client_id)?.client_legal_name ?? "";
      setCreatedInfo({
        code: created.engagement_code,
        name: data.engagement_name,
        clientName,
        anioFiscal: data.anio_fiscal as number,
        service: data.practica != null ? t(PRACTICA_LABEL_KEYS[data.practica]) : "",
        funcion: data.funcion != null ? t(FUNCION_LABEL_KEYS[data.funcion]) : "",
        status: t(`status.${data.status}`),
      });
      return;
    }
    if (onSaveSuccess) {
      onSaveSuccess();
    } else {
      navigate("/engagements");
    }
  };

  const handleDelete = async () => {
    if (engagement) {
      await deleteMutation.mutateAsync(engagement.engagement_id);
      if (onSaveSuccess) {
        onSaveSuccess();
      } else {
        navigate("/engagements");
      }
    }
  };

  const fiscalYearOptions = Array.from(
    { length: new Date().getFullYear() + FISCAL_YEAR_LOOKAHEAD - FISCAL_YEAR_START + 1 },
    (_, i) => FISCAL_YEAR_START + i
  )

  // BUG #0603-140: live code preview during creation. Mirrors the server format
  // FY.[oficina][practica][funcion].[correlativo] (migration 20260601100000, lines 113-115);
  // the correlativo is unknown until insert, so it shows as the placeholder `---`.
  const [wAnio, wOficina, wPractica, wFuncion] = form.watch(["anio_fiscal", "oficina", "practica", "funcion"]);
  // REVIEW FIX (0604-143 it.1): fecha_cierre is always required (NOT NULL), independent of an
  // admin override on anio_fiscal, so the preview must not look "complete" without a closing date.
  const previewIncomplete =
    wAnio == null || wOficina == null || wPractica == null || wFuncion == null ||
    wClosingOption == null;
  const previewCodePrefix = previewIncomplete
    ? null
    : `${wAnio}.${wOficina}${wPractica}${wFuncion}.`;

  // Defer navigation until the success modal is dismissed (Close button or `X`), so
  // the user always sees the assigned code before leaving the form.
  const handleSuccessDialogClose = () => {
    setCreatedInfo(null);
    if (onSaveSuccess) {
      onSaveSuccess();
    } else {
      navigate("/engagements");
    }
  };

  // Create another: clear the modal, reset the form to creation defaults and policy
  // flags, and stay on the page. form.reset() clears isDirty, so no LeavePageDialog fires.
  const handleCreateAnother = () => {
    setCreatedInfo(null);
    form.reset({
      engagement_name: "",
      anio_fiscal: suggestFiscalYear(),
      oficina: undefined,
      practica: undefined,
      funcion: undefined,
      client_id: "",
      partner_id: "",
      manager_id: "",
      status: "active",
      sqr_id: null,
      encargado_id: null,
      specialist_it_id: null,
      specialist_tax_id: null,
      closing_date_option: undefined,
      closing_date_custom: undefined,
    });
    setWorkOrderRequired(true);
    setActivityRequired(true);
    setIsInternal(false);
    setApprovalRequired(true);
    setOverrideOn(false);
  };

  const handleGoToWorkMatrix = () => {
    setCreatedInfo(null);
    if (onGoToWorkMatrix) {
      onGoToWorkMatrix();
    } else {
      navigate("/worksheets");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          {isEdit ? t("engagement.editEngagement") : t("engagement.newEngagement")}
        </h1>
        {isEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                {t("common.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("engagement.deleteEngagement")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("common.confirmDelete", { name: engagement?.engagement_name })} {t("common.deleteWarning")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive/70 text-destructive-foreground hover:bg-destructive">
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {hasMissingCategories && !isEdit && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t("messages.missingCategories", { categories: missingCategories.join(", ") })}
          </AlertDescription>
        </Alert>
      )}

      <div className="bg-card rounded-xl border border-border p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            <div className="border border-border bg-background/50 rounded-xl p-8">
              <div className="space-y-4">
              <h3 className="font-medium text-lg">{t("common.basicInfo")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="engagement_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("engagement.name")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="Annual Audit 2024" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isEdit ? (
                  <FormItem>
                    <FormLabel>{t("engagement.engagementCode")}</FormLabel>
                    <Input
                      data-testid="engagement-code-readonly"
                      value={engagement?.engagement_code ?? ""}
                      readOnly
                      disabled
                      className="font-mono border-warning/40"
                    />
                  </FormItem>
                ) : (
                  <FormItem>
                    <FormLabel>{t("engagement.engagementCode")}</FormLabel>
                    <div
                      data-testid="engagement-code-preview"
                      className="flex h-10 items-center rounded-md border border-warning/30 bg-warning/10 px-3 text-sm"
                    >
                      {previewIncomplete ? (
                        <span className="text-muted-foreground">{t("engagement.codePreviewIncomplete")}</span>
                      ) : (
                        <span className="font-mono text-warning">
                          {previewCodePrefix}
                          <span className="text-warning/60">---</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("engagement.codePreviewHelp")}</p>
                  </FormItem>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="anio_fiscal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("engagement.anioFiscal")} *</FormLabel>
                    {showOverrideSelect ? (
                      <Select
                        onValueChange={(v) => field.onChange(Number(v))}
                        value={field.value ? String(field.value) : ""}
                      >
                        <FormControl><SelectTrigger><SelectValue placeholder={t("engagement.selectAnioFiscal")} /></SelectTrigger></FormControl>
                        <SelectContent>
                          {fiscalYearOptions.map((fy) => (
                            <SelectItem key={fy} value={String(fy)}>{fy}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        data-testid="anio-fiscal-derived"
                        readOnly
                        disabled
                        value={field.value ?? ""}
                        className="font-mono"
                      />
                    )}
                    {isAdmin && (
                      <div className="flex items-center gap-2 pt-1">
                        <Switch checked={overrideOn} onCheckedChange={handleOverrideToggle} />
                        <span className="text-xs text-muted-foreground">{t("engagement.fiscalYearOverride")}</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{t("engagement.fiscalYearHelper")}</p>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="oficina" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("engagement.oficina")} *</FormLabel>
                    <Select
                      disabled={isEdit}
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value != null ? String(field.value) : ""}
                    >
                      <FormControl><SelectTrigger><SelectValue placeholder={t("engagement.selectOficina")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="0">{t("engagement.oficina_ambos")}</SelectItem>
                        <SelectItem value="1">{t("engagement.oficina_laPaz")}</SelectItem>
                        <SelectItem value="2">{t("engagement.oficina_santaCruz")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="practica" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("engagement.practica")} *</FormLabel>
                    <Select
                      disabled={isEdit}
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value != null ? String(field.value) : ""}
                    >
                      <FormControl><SelectTrigger><SelectValue placeholder={t("engagement.selectPractica")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="0">{t("engagement.practica_firmwide")}</SelectItem>
                        <SelectItem value="1">{t("engagement.practica_auditoria")}</SelectItem>
                        <SelectItem value="2">{t("engagement.practica_consultoria")}</SelectItem>
                        <SelectItem value="3">{t("engagement.practica_tax")}</SelectItem>
                        <SelectItem value="4">{t("engagement.practica_growthStrategy")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="funcion" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("engagement.funcion")} *</FormLabel>
                    <Select
                      disabled={isEdit}
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value !== undefined ? String(field.value) : ""}
                    >
                      <FormControl><SelectTrigger><SelectValue placeholder={t("engagement.selectFuncion")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="0">{t("engagement.funcion_adm")}</SelectItem>
                        <SelectItem value="1">{t("engagement.funcion_cli")}</SelectItem>
                        <SelectItem value="2">{t("engagement.funcion_cap")}</SelectItem>
                        <SelectItem value="3">{t("engagement.funcion_calidad")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("engagement.client")} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("engagement.selectClient")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clientOptions.map((client) => (
                            <SelectItem key={client.client_id} value={client.client_id}>
                              {client.client_legal_name}
                              {!client.is_active && ` (${t("status.inactive")})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("engagement.status")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("engagement.selectStatus")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {statusOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              </div>

              <div className="space-y-4">
              <h3 className="font-medium text-lg">{t("common.dates")}</h3>
              <div className={cn(
                "grid grid-cols-1 sm:grid-cols-2 gap-4",
                wClosingOption === "Otro" ? "md:grid-cols-4" : "md:grid-cols-3"
              )}>
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t("engagement.startDate")} *</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "dd/MM/yyyy") : t("common.pickDate")}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={minStartDate ? (date) => isBefore(startOfDay(date), minStartDate) : undefined}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t("engagement.endDate")} *</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "dd/MM/yyyy") : t("common.pickDate")}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const startDate = form.getValues("start_date");
                              if (startDate) return isBefore(startOfDay(date), startOfDay(startDate));
                              if (minStartDate) return isBefore(startOfDay(date), minStartDate);
                              return false;
                            }}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField control={form.control} name="closing_date_option" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("engagement.closingDate")} *</FormLabel>
                    <Select
                      disabled={isEdit && !canEditClosing}
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl><SelectTrigger><SelectValue placeholder={t("engagement.selectClosingDate")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {closingDateOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {formatClosingDateLabel(opt.key, opt.year, i18n.language)}
                          </SelectItem>
                        ))}
                        <SelectItem value="Otro">{t("engagement.closingDate_otro")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {wClosingOption === "Otro" && (
                  <FormField
                    control={form.control}
                    name="closing_date_custom"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("engagement.closingDateCustom")} *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={isEdit && !canEditClosing}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? format(field.value, "dd/MM/yyyy") : t("common.pickDate")}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              </div>

               {showContractSection && (
              
                <div className="mt-4">
                  <h3 className="font-medium text-lg">
                    {t("engagement.contractScanned")}{!isEdit && " *"}
                  </h3>

                  {!isEdit ? (
                    <div className="">
                      {contractFilePath ? (
                        <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50 max-w-md">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate flex-1">{contractFileName}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={handleRemoveContractFile}
                            aria-label={t("engagement.removeContract")}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2 max-w-md">
                          <input
                            ref={contractFileInputRef}
                            type="file"
                            accept="application/pdf"
                            onChange={handleContractFileSelect}
                            className="hidden"
                            id="engagement-contract-upload"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => contractFileInputRef.current?.click()}
                            disabled={contractUploading}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {t("engagement.uploadContract")}
                          </Button>
                          {contractUploading && <Progress value={contractProgress} className="h-2" />}
                        </div>
                      )}
                      {contractError && (
                        <p className="text-sm font-medium text-destructive">{contractError}</p>
                      )}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDownloadContract}
                      disabled={downloadingContract}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      {t("engagement.downloadContract")}
                    </Button>
                  )}
                </div>
            )}
            </div>

            <div className="border border-border bg-background/50 rounded-xl p-8">
              <div className="space-y-4">
              <h3 className="font-medium text-lg">{t("common.team")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="partner_id"
                  render={({ field }) => (
                    <StaffCombobox
                      label={`${t("engagement.partner")} *`}
                      placeholder={t("engagement.selectPartner")}
                      searchPlaceholder={t("engagement.searchStaff")}
                      noResultsText={t("engagement.noStaffFound")}
                      noAplicaText={t("engagement.noAplica")}
                      options={partnerOptions}
                      value={field.value || null}
                      onChange={(v) => field.onChange(v ?? "")}
                      showNoAplica={false}
                    />
                  )}
                />

                <FormField
                  control={form.control}
                  name="sqr_id"
                  render={({ field }) => (
                    <StaffCombobox
                      label={t("engagement.sqr")}
                      placeholder={t("engagement.selectSqr")}
                      searchPlaceholder={t("engagement.searchStaff")}
                      noResultsText={t("engagement.noStaffFound")}
                      noAplicaText={t("engagement.noAplica")}
                      options={allActiveStaff}
                      value={field.value ?? null}
                      onChange={field.onChange}
                    />
                  )}
                />

                <FormField
                  control={form.control}
                  name="manager_id"
                  render={({ field }) => (
                    <StaffCombobox
                      label={`${t("engagement.manager")} *`}
                      placeholder={t("engagement.selectManager")}
                      searchPlaceholder={t("engagement.searchStaff")}
                      noResultsText={t("engagement.noStaffFound")}
                      noAplicaText={t("engagement.noAplica")}
                      options={managerOptions}
                      value={field.value || null}
                      onChange={(v) => field.onChange(v ?? "")}
                      showNoAplica={false}
                    />
                  )}
                />

                <FormField
                  control={form.control}
                  name="encargado_id"
                  render={({ field }) => (
                    <StaffCombobox
                      label={t("engagement.encargado")}
                      placeholder={t("engagement.selectEncargado")}
                      searchPlaceholder={t("engagement.searchStaff")}
                      noResultsText={t("engagement.noStaffFound")}
                      noAplicaText={t("engagement.noAplica")}
                      options={allActiveStaff}
                      value={field.value ?? null}
                      onChange={field.onChange}
                    />
                  )}
                />

                <FormField
                  control={form.control}
                  name="specialist_it_id"
                  render={({ field }) => (
                    <StaffCombobox
                      label={t("engagement.specialistIt1")}
                      placeholder={t("engagement.selectSpecialistIt1")}
                      searchPlaceholder={t("engagement.searchStaff")}
                      noResultsText={t("engagement.noStaffFound")}
                      noAplicaText={t("engagement.noAplica")}
                      options={allActiveStaff}
                      value={field.value ?? null}
                      onChange={field.onChange}
                    />
                  )}
                />

                <FormField
                  control={form.control}
                  name="specialist_tax_id"
                  render={({ field }) => (
                    <StaffCombobox
                      label={t("engagement.specialistTax1")}
                      placeholder={t("engagement.selectSpecialistTax1")}
                      searchPlaceholder={t("engagement.searchStaff")}
                      noResultsText={t("engagement.noStaffFound")}
                      noAplicaText={t("engagement.noAplica")}
                      options={allActiveStaff}
                      value={field.value ?? null}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
              </div>
            </div>

           

            {isAdmin && (
              <div className="border border-border bg-background/50 rounded-xl p-8">
                <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">{t("engagement.timesheetPolicy")}</h3>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{t("engagement.workOrderRequired")}</p>
                    <p className="text-xs text-muted-foreground">{t("engagement.workOrderRequiredHelp")}</p>
                  </div>
                  <Switch checked={workOrderRequired} onCheckedChange={setWorkOrderRequired} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{t("engagement.activityRequired")}</p>
                    <p className="text-xs text-muted-foreground">{t("engagement.activityRequiredHelp")}</p>
                  </div>
                  <Switch checked={activityRequired} onCheckedChange={setActivityRequired} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{t("engagement.isInternal")}</p>
                    <p className="text-xs text-muted-foreground">{t("engagement.isInternalHelp")}</p>
                  </div>
                  <Switch checked={isInternal} onCheckedChange={setIsInternal} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{t("engagement.approvalRequired")}</p>
                    <p className="text-xs text-muted-foreground">{t("engagement.approvalRequiredHelp")}</p>
                  </div>
                  <Switch checked={approvalRequired} onCheckedChange={setApprovalRequired} />
                </div>
                </div>
              </div>
            )}

            {!isEdit && (
              <p className="text-xs text-muted-foreground">{t("engagement.immutabilityHint")}</p>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
              <Button type="button" variant="cancel" onClick={() => onCancel ? onCancel() : navigate("/engagements")} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                {t("common.cancel")}
              </Button>
              <LoadingButton
                type="submit"
                variant="default"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                loading={createMutation.isPending || updateMutation.isPending}
                disabled={hasMissingCategories && !isEdit}
              >
                {isEdit ? t("common.saveChanges") : t("engagement.createEngagement")}
              </LoadingButton>
            </div>
          </form>
        </Form>
      </div>

      {/* BUG #0603-140: confirmation modal showing the server-assigned code */}
      <EngagementCreatedDialog
        open={!!createdInfo}
        code={createdInfo?.code ?? ""}
        name={createdInfo?.name ?? ""}
        clientName={createdInfo?.clientName ?? ""}
        anioFiscal={createdInfo?.anioFiscal ?? ""}
        service={createdInfo?.service ?? ""}
        funcion={createdInfo?.funcion ?? ""}
        status={createdInfo?.status ?? ""}
        onClose={handleSuccessDialogClose}
        onCreateAnother={handleCreateAnother}
        onGoToWorkMatrix={handleGoToWorkMatrix}
      />
    </div>
  );
}
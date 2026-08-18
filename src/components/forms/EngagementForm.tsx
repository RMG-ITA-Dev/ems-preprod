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
import { Label } from "@/components/ui/label";
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
import { StaffAssignmentsCard } from "@/components/engagements/StaffAssignmentsCard";
import { isSchedulerEnabled } from "@/lib/schedulerFeature";
import { TaxonomyCombobox, NO_APLICA_VALUE } from "@/components/forms/TaxonomyCombobox";
import { Engagement, useClients, useServices, useTaxonomies, useSocieties } from "@/hooks/useEmsData";
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
import { Badge } from "@/components/ui/badge";
import { useAuthorization } from "@/hooks/useAuthorization";
import {
  ENGAGEMENT_STATES,
  engagementStateI18nKey,
  engagementStateBadgeClass,
  effectiveEngagementState,
  EngagementState,
} from "@/lib/engagementStatus";
import { getUpcomingClosingDates, getFiscalYearForDate } from "@/lib/fiscalCalculations";

interface StaffComboboxProps {
  label: string;
  required?: boolean;
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
  required = false,
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
      <FormLabel>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </FormLabel>
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
              {/* 0722-157 (feedback): azul de acento para distinguir de un vistazo que este
                  control es un combobox de búsqueda (mismo tratamiento que TaxonomyCombobox). */}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-info" />
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

const FUNCION_LABEL_KEYS: Record<number, string> = {
  0: "engagement.funcion_adm",
  1: "engagement.funcion_cli",
  2: "engagement.funcion_cap",
  3: "engagement.funcion_calidad",
}
const FUNCION_CLIENTE = 1

const formSchema = z.object({
  engagement_name: z.string()
    .min(5, "Engagement name must be at least 5 characters")
    .max(200, "Engagement name cannot exceed 200 characters"),
  anio_fiscal: z.number().int().min(2020).max(2100, "Invalid fiscal year").optional(),
  oficina:     z.number().int().min(0).max(2,   "Invalid office").optional(),
  practica:    z.number().int().min(0).max(9,   "Invalid practice").optional(),
  funcion:     z.number().int().min(0).max(3,   "Invalid function").optional(),
  taxonomy_id: z.string().optional(),
  // FEAT 0714-155: sociedad interna (firma) del encargo — optional at the Zod level;
  // required-in-creation is validated manually, mirroring oficina/practica/funcion.
  society_id:  z.string().optional(),
  client_id: z.string().min(1, "Client is required"),
  partner_id: z.string().min(1, "Partner/Director is required"),
  manager_id: z.string().min(1, "Manager is required"),
  start_date: z.date({ required_error: "Start date is required" }),
  end_date: z.date({ required_error: "End date is required" }),
  status: z.string(),
  // FEAT 0602-135: override manual del estado del encargo. "auto" = derivado de la OT; "1".."9" = override.
  engagement_state_override: z.string().optional(),
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
  onGoToWorkMatrix?: (engagementId?: string) => void;
}

const AUDITORIA_SERVICE_CODE = 1;

export function EngagementForm({ engagement, onDirtyChange, onCancel, onSaveSuccess, onGoToWorkMatrix }: EngagementFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // `isAdmin` ya NO sale del enum legacy: se deriva de `role_key`, que es la
  // autoridad del motor de autorización. Los 12 gates de solo-admin de este
  // archivo (selección de servicio, override de año fiscal, piso de fecha de
  // inicio, práctica por defecto, bloques de UI) quedan cubiertos con este único
  // cambio, sin tocar cada sitio.
  //
  // Este archivo ya NO usa el enum legacy: todo sale de `role_key` y de los
  // permisos. El último resto era `isManager` para el toggle de congelamiento, que
  // ahora se resuelve por asignación (ver `canFreezeAsManager` más abajo).
  const { can, roleKey, isLoading: roleLoading } = useAuthorization();
  const isAdmin = roleKey === "admin";
  const isEdit = !!engagement;
  // Al editar, el guardado exige engagement.update; al crear, la ruta ya gatea engagement.create.
  const canSave = !isEdit || can("engagement.update");
  // BUG #0604-143: closing date (and the FY it derives) may be edited by Admin/Gerente/Socio/Director;
  // oficina/practica/funcion/engagement_code remain fully immutable after create.
  // Editar la fecha de cierre es parte de editar el encargo, así que se decide por
  // el mismo permiso que habilita el guardado (`canSave`, más abajo). Antes era una
  // banda del enum legacy (admin||manager||partner||director), que habilitaba el
  // campo a roles sin `engagement.update`: veían el campo editable y después no
  // tenían botón de guardar. No cambia lo que nadie PUEDE hacer — solo deja de
  // ofrecer una edición que no se puede persistir.
  const canEditClosing = can("engagement.update");
  // FEAT 0602-135: control del estado del encargo, ahora en el encabezado de "Información
  // Básica" — Admin edita con <Select> (los 9 estados + "Automático"); el resto ve un badge
  // de solo lectura (0722-157: se retira el toggle de congelar/descongelar del Gerente).
  const savedEffectiveState = engagement
    ? effectiveEngagementState(engagement, engagement.work_order)
    : null;
  // Decisión A: en estados terminales/congelado (6 Cancelado, 7 Finalizado, 9 Congelado) NO se
  // editan las fechas. Excepción: el Admin sí (necesario para reabrir un Finalizado extendiendo la
  // fecha fin — Política 6, Opción 1).
  const datesLockedByState =
    isEdit &&
    !isAdmin &&
    (savedEffectiveState === EngagementState.Cancelado ||
      savedEffectiveState === EngagementState.Finalizado ||
      savedEffectiveState === EngagementState.Congelado);

  const { data: clients } = useClients();
  const { data: allServices } = useServices();
  const { data: allTaxonomies } = useTaxonomies();
  const { data: societies } = useSocieties();
  const { partnerOptions, managerOptions, hasPartnerCategory, hasManagerCategory, allActiveStaff } = useCategoryStaff();
  const { staffRecord } = useCurrentStaff();

  const activeServiceOptions = useMemo(
    () => (allServices ?? []).filter((s) => s.is_active || s.code === engagement?.practica),
    [allServices, engagement?.practica]
  );

  const serviceSelectDisabled = isEdit || roleLoading || !isAdmin;

  const activeTaxonomyOptions = useMemo(
    () =>
      (allTaxonomies ?? [])
        .filter((tx) => tx.is_active || tx.taxonomy_id === engagement?.taxonomy_id)
        // 0722-157 (feedback): ordenar por nombre (A-Z), no por código.
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allTaxonomies, engagement?.taxonomy_id]
  );

  const serviceNameByCode = useMemo(() => {
    const map: Record<number, string> = {};
    (allServices ?? []).forEach((s) => { map[s.code] = s.name; });
    return map;
  }, [allServices]);
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

  // FEAT 0714-155 (review fix): unlike clients/taxonomies (fetched in full, filtered
  // client-side), useSocieties() filters is_active=true server-side — reused as-is per
  // plan (no crear hook nuevo). Filtering that already-active-only list can never surface
  // a historical (now-inactive) sociedad, so it's merged in explicitly from the engagement
  // embed instead, keeping the same "stay visible when editing" guarantee as the siblings.
  const societyOptions = useMemo(() => {
    const active = societies ?? [];
    const historicalSociety = engagement?.society;
    if (historicalSociety && !active.some(s => s.society_id === historicalSociety.society_id)) {
      return [...active, historicalSociety];
    }
    return active;
  }, [societies, engagement?.society]);

  const initializedEngagementIdRef = useRef<string | null>(null);

  // Build missing categories message
  const missingCategories: string[] = [];
  if (!hasPartnerCategory) missingCategories.push(t("engagement.partner"));
  if (!hasManagerCategory) missingCategories.push(t("engagement.manager"));
  const hasMissingCategories = missingCategories.length > 0;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      engagement_name: "",
      anio_fiscal: suggestFiscalYear(),
      oficina: undefined,
      practica: undefined,
      funcion: undefined,
      taxonomy_id: undefined,
      society_id: undefined,
      client_id: "",
      partner_id: "",
      manager_id: "",
      status: "active",
      engagement_state_override: "auto",
      sqr_id: null,
      encargado_id: null,
      specialist_it_id: null,
      specialist_tax_id: null,
      closing_date_option: undefined,
      closing_date_custom: undefined,
      // BUG #0602-134: suggest today (≈ future created_at) as the default start date on create
      start_date: engagement ? undefined : startOfDay(new Date()),
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
    society: string;
    engagementId: string;
    // 0722-157 (feedback): "Ir a Matriz de Trabajo" solo tiene sentido para encargos de
    // Cliente — Administrativa/Capacitación/Control de Calidad no presupuestan horas ahí.
    isCliente: boolean;
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

  // BUG #0602-134: admin has no floor on start_date at all — create or edit
  const effectiveMinStartDate = isAdmin ? undefined : minStartDate;

  // Destructure isDirty before effects that depend on it
  const { isDirty } = form.formState;

  // 0625-148: auto-assign Auditoría (code=1) for non-admin users in create mode
  useEffect(() => {
    if (isEdit || isAdmin || roleLoading || !allServices) return;
    if (form.getValues("practica") === AUDITORIA_SERVICE_CODE) return;
    form.setValue("practica", AUDITORIA_SERVICE_CODE, { shouldDirty: false, shouldValidate: true });
  }, [isAdmin, roleLoading, isEdit, allServices, form]);

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
        taxonomy_id: engagement.taxonomy_id ?? undefined,
        society_id:  engagement.society_id  ?? undefined,
        client_id: engagement.client_id,
        partner_id: engagement.partner_id || "",
        manager_id: engagement.manager_id || "",
        status: engagement.status,
        engagement_state_override:
          engagement.engagement_state_override != null ? String(engagement.engagement_state_override) : "auto",
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

  // Fase 5 (bugs/scheduler/fase_5/plan_v2.md §6): StaffAssignmentsCard tiene su propio ciclo de
  // guardado (RPC directa) — el submit principal NUNCA lo ejecuta. Su dirty state SÍ participa
  // del page-leave lock combinado que ya consume EngagementEdit vía onDirtyChange.
  const [assignmentsDirty, setAssignmentsDirty] = useState(false);

  // Report combined dirty state to parent
  useEffect(() => {
    onDirtyChange?.(isDirty || assignmentsDirty);
  }, [isDirty, assignmentsDirty, onDirtyChange]);

  // Fase 5 O9: con assignments pendientes de guardar, cambiar servicio/fechas/partner/manager
  // puede invalidar segmentos existentes o revocar el permiso de escritura del usuario. `practica`
  // es inmutable en edición (omitida del payload de update) — sin advertencia de servicio.
  // Fuera de Borrador (Pendiente)/Rechazado el Admin cambia sin advertencia; cualquier otro
  // usuario recibe una advertencia (no bloqueante) al tocar fecha/partner/manager.
  const [wPartnerId, wManagerId, wStartDate, wEndDate] = form.watch([
    "partner_id",
    "manager_id",
    "start_date",
    "end_date",
  ]);
  const structuralFieldsChanged =
    isEdit &&
    !!engagement &&
    ((wPartnerId || "") !== (engagement.partner_id || "") ||
      (wManagerId || "") !== (engagement.manager_id || "") ||
      (!!wStartDate && !!engagement.start_date && format(wStartDate, "yyyy-MM-dd") !== engagement.start_date) ||
      (!!wEndDate && !!engagement.end_date && format(wEndDate, "yyyy-MM-dd") !== engagement.end_date));
  const showAssignmentsHeaderWarning =
    isEdit &&
    assignmentsDirty &&
    structuralFieldsChanged &&
    !isAdmin &&
    savedEffectiveState !== EngagementState.Pendiente &&
    savedEffectiveState !== EngagementState.Rechazado;

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

  // 0722-157: scroll + foco al primer campo inválido tras un submit fallido — cubre tanto los
  // errores del resolver de Zod (pasado como segundo argumento de `form.handleSubmit`) como los
  // `form.setError` manuales de más abajo. `requestAnimationFrame` espera a que React pinte el
  // `aria-invalid="true"` antes de buscarlo en el DOM.
  const formRef = useRef<HTMLFormElement>(null);
  const focusFirstInvalidField = () => {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    });
  };

  const onSubmit = async (data: FormData) => {
    // BUG #0206-19 + #0220-48: skip for internal engagements; BUG #0602-134: admin has no floor
    if (!isInternal && effectiveMinStartDate && data.start_date && isBefore(startOfDay(data.start_date), effectiveMinStartDate)) {
      form.setError("start_date", {
        message: t("engagement.startDateBeforeCreation"),
      });
      focusFirstInvalidField();
      return;
    }

    // REVIEW FIX (0604-143 it.1): moved out of the Zod schema (which has no access to `t()`, so it
    // could only carry a hardcoded English string) into a localized setError, mirroring the
    // required-code-field checks below.
    if (data.closing_date_option === "Otro" && !data.closing_date_custom) {
      form.setError("closing_date_custom", { message: t("engagement.requiredClosingDateCustom") });
      focusFirstInvalidField();
      return;
    }

    if (!isEdit) {
      let missingCodeField = false;
      if (data.anio_fiscal === undefined) { form.setError("anio_fiscal", { message: t("engagement.requiredAnioFiscal") }); missingCodeField = true; }
      if (data.oficina    === undefined) { form.setError("oficina",     { message: t("engagement.requiredOficina")    }); missingCodeField = true; }
      if (data.practica   === undefined) { form.setError("practica",    { message: t("engagement.requiredPractica")   }); missingCodeField = true; }
      if (data.funcion    === undefined) { form.setError("funcion",     { message: t("engagement.requiredFuncion")    }); missingCodeField = true; }
      if (data.society_id === undefined) { form.setError("society_id", { message: t("engagement.requiredSociety")    }); missingCodeField = true; }
      if (data.closing_date_option === undefined) { form.setError("closing_date_option", { message: t("engagement.requiredClosingDate") }); missingCodeField = true; }
      if (missingCodeField) { focusFirstInvalidField(); return; }
    }

    // BUG #0625-151: el contrato escaneado es obligatorio solo para encargos de cliente
    // (no aplica a internos). El archivo ya se subió a Storage al seleccionarlo, así que
    // solo validamos que exista una ruta antes de crear el encargo.
    if (!isEdit && !isInternal && !contractFilePath) {
      setContractError(t("engagement.contractRequired"));
      focusFirstInvalidField();
      return;
    }
    setContractError(null);

    // 0602-136: taxonomy is mandatory for Cliente engagements — "No aplica" does not
    // satisfy it (unlike other funciones, where it's a valid explicit opt-out).
    if (data.funcion === FUNCION_CLIENTE && (!data.taxonomy_id || data.taxonomy_id === NO_APLICA_VALUE)) {
      form.setError("taxonomy_id", { message: t("engagement.requiredTaxonomyCliente") });
      focusFirstInvalidField();
      return;
    }
    const taxonomyIdPayload = data.taxonomy_id && data.taxonomy_id !== NO_APLICA_VALUE
      ? data.taxonomy_id
      : null;

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
          taxonomy_id:         taxonomyIdPayload,
          // FEAT 0602-135 (0722-157: se retira el control del Gerente): solo el Admin
          // escribe el override manual del estado — el resto no renderiza el control.
          ...(isAdmin
            ? {
                engagement_state_override:
                  !data.engagement_state_override || data.engagement_state_override === "auto"
                    ? null
                    : Number(data.engagement_state_override),
              }
            : {}),
          // 0722-157: Sociedad es editable solo por Admin tras la creación (sin migración,
          // frontend-only); para el resto se omite del payload, igual que antes para todos.
          ...(isAdmin ? { society_id: data.society_id as string } : {}),
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
      // Fase 5 (plan_v2.md §6): con assignments sin guardar, el header nunca navega — el
      // Engagement y los assignments no se presentan como una única transacción. Solo se
      // resetea el baseline del FORM (limpia su propio isDirty); assignmentsDirty sigue
      // gobernando el page-leave lock combinado hasta que el usuario guarde/descarte la card.
      if (assignmentsDirty) {
        form.reset(data);
        toast.info(t("engagement.assignments.pendingChanges"));
        return;
      }
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
      society_id:          data.society_id as string,
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
      taxonomy_id:         taxonomyIdPayload,
      // BUG #0625-151 (Codex review): linked inside the RPC (SECURITY DEFINER) instead of a
      // separate client-side update — the old update() was subject to the "Team can update
      // engagements" RLS policy, which a creator who isn't the assigned partner/manager/admin
      // (e.g. a Director assigning others) would fail, silently saving a client engagement
      // without its mandatory contract. The file itself is already durably in Storage either way.
      contract_file_path:  !isInternal ? contractFilePath : null,
    });

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
        service: data.practica != null ? (serviceNameByCode[data.practica] ?? String(data.practica)) : "",
        funcion: data.funcion != null ? t(FUNCION_LABEL_KEYS[data.funcion]) : "",
        status: t(`status.${data.status}`),
        society: societyOptions.find((s) => s.society_id === data.society_id)?.name ?? "",
        engagementId: created.engagement_id,
        isCliente: data.funcion === FUNCION_CLIENTE,
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
      practica: isAdmin ? undefined : AUDITORIA_SERVICE_CODE,
      funcion: undefined,
      taxonomy_id: undefined,
      society_id: undefined,
      client_id: "",
      partner_id: "",
      manager_id: "",
      status: "active",
      engagement_state_override: "auto",
      sqr_id: null,
      encargado_id: null,
      specialist_it_id: null,
      specialist_tax_id: null,
      closing_date_option: undefined,
      closing_date_custom: undefined,
      start_date: startOfDay(new Date()),
    });
    setWorkOrderRequired(true);
    setActivityRequired(true);
    setIsInternal(false);
    setApprovalRequired(true);
    setOverrideOn(false);
    // BUG #0625-151 (Codex review): the previous engagement's contract was already uploaded
    // and linked — without this reset, the next engagement would start with that same file
    // "attached," pass the mandatory-contract check unnoticed, and link the same private
    // contract to a different engagement/team. Only clears local state, not the Storage object
    // (which correctly still belongs to the engagement just created).
    setContractFilePath(null);
    setContractFileName(null);
    setContractProgress(0);
    setContractError(null);
  };

  const handleGoToWorkMatrix = () => {
    const engagementId = createdInfo?.engagementId;
    setCreatedInfo(null);
    if (onGoToWorkMatrix) {
      onGoToWorkMatrix(engagementId);
    } else {
      navigate(engagementId ? `/worksheets/new?engagement=${encodeURIComponent(engagementId)}` : "/worksheets/new");
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
          <form ref={formRef} onSubmit={form.handleSubmit(onSubmit, focusFirstInvalidField)} className="space-y-6">

            <div className="border border-border bg-background/50 rounded-xl p-8">
              <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-medium text-lg">{t("common.basicInfo")}</h3>
                <div className="flex items-center gap-3">
                  {/* 0722-157 (feedback): el Código del Encargo se muestra junto al Estado en
                      el encabezado, en vez de ocupar un lugar en la grilla de Clasificación. */}
                  {isEdit ? (
                    <Input
                      data-testid="engagement-code-readonly"
                      aria-label={t("engagement.engagementCode")}
                      value={engagement?.engagement_code ?? ""}
                      readOnly
                      disabled
                      // 0722-157 (feedback): conservar el mismo dorado/warning de la vista de
                      // creación — antes esta vista solo tenía el borde, sin el relleno/texto.
                      className="h-8 w-40 font-mono border-warning/40 bg-warning/10 text-warning disabled:!opacity-100"
                    />
                  ) : (
                    <div className="space-y-0.5">
                      <div
                        data-testid="engagement-code-preview"
                        aria-label={t("engagement.engagementCode")}
                        className="flex h-8 items-center rounded-md border border-warning/30 bg-warning/10 px-3 text-xs"
                      >
                        {previewIncomplete ? (
                          <span className="text-muted-foreground">{t("engagement.engagementCode")}</span>
                        ) : (
                          <span className="font-mono text-warning">
                            {previewCodePrefix}
                            <span className="text-warning/60">---</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{t("engagement.codePreviewHelp")}</p>
                    </div>
                  )}

                  {/* FEAT 0602-135 (0722-157: movido al encabezado, sin el toggle del Gerente):
                      Admin edita con <Select> los 9 estados + Automático; el resto ve el badge de
                      solo lectura, reutilizando el patrón de la tabla de Encargos. */}
                  {isEdit && isAdmin ? (
                    <FormField
                      control={form.control}
                      name="engagement_state_override"
                      render={({ field }) => (
                        <FormItem className="space-y-0">
                          <Select onValueChange={field.onChange} value={field.value ?? "auto"}>
                            <FormControl>
                              <SelectTrigger
                                className="h-8 w-[180px] [&_svg]:text-info [&_svg]:opacity-100"
                                aria-label={t("engagement.status")}
                              >
                                {/* 0722-157 (feedback): cuando sigue el derivado de la OT
                                    ("auto"), mostrar el estado real vigente en vez de la
                                    palabra "Automático" — mucho más claro de un vistazo. */}
                                <SelectValue>
                                  {field.value && field.value !== "auto"
                                    ? t(engagementStateI18nKey(Number(field.value)))
                                    : savedEffectiveState
                                      ? t(engagementStateI18nKey(savedEffectiveState))
                                      : t("engagementState.auto")}
                                </SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="auto">{t("engagementState.auto")}</SelectItem>
                              {ENGAGEMENT_STATES.map((s) => (
                                <SelectItem key={s} value={String(s)}>
                                  {t(engagementStateI18nKey(s))}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  ) : savedEffectiveState ? (
                    <Badge variant="outline" className={engagementStateBadgeClass(savedEffectiveState)}>
                      {t(engagementStateI18nKey(savedEffectiveState))}
                    </Badge>
                  ) : (
                    // 0722-157 (feedback): al crear todavía no existe un encargo (ni OT), así
                    // que "Pendiente" (1) describe mejor el punto de partida que "Automático".
                    <Badge variant="outline" className={engagementStateBadgeClass(EngagementState.Pendiente)}>
                      {t(engagementStateI18nKey(EngagementState.Pendiente))}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("engagement.client")} <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="[&_svg]:text-info [&_svg]:opacity-100">
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

                <FormField control={form.control} name="society_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("engagement.society")} <span className="text-destructive">*</span></FormLabel>
                    <Select
                      disabled={isEdit && !isAdmin}
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl><SelectTrigger className="[&_svg]:text-info [&_svg]:opacity-100"><SelectValue placeholder={t("engagement.selectSociety")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {societyOptions.map((soc) => (
                          <SelectItem key={soc.society_id} value={soc.society_id}>
                            {soc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField
                  control={form.control}
                  name="taxonomy_id"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>
                        {t("engagement.taxonomy")}
                        {form.watch("funcion") === FUNCION_CLIENTE && (
                          <span className="text-destructive"> *</span>
                        )}
                      </FormLabel>
                      <TaxonomyCombobox
                        taxonomies={activeTaxonomyOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                        showNoAplica={form.watch("funcion") !== FUNCION_CLIENTE}
                        aria-invalid={!!fieldState.error}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="engagement_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("engagement.name")} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Annual Audit 2024" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showContractSection && (
                  <div className="space-y-2">
                    <Label className={cn(contractError && "text-destructive")}>
                      {t("engagement.contractScanned")}
                      {!isEdit && <span className="text-destructive"> *</span>}
                    </Label>

                    {!isEdit ? (
                      <div className="">
                        {contractFilePath ? (
                          <div className="flex h-10 items-center gap-2 px-3 border rounded-md bg-muted/50">
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
                          <div>
                            {/* 0722-157 (feedback): the hidden file input still counts as a
                                sibling for `space-y-*`, which was pushing the Button below the
                                height of "Nombre del Encargo" — no gap needed since it's hidden. */}
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
                              aria-invalid={!!contractError}
                              onClick={() => contractFileInputRef.current?.click()}
                              disabled={contractUploading}
                              className="h-10 w-full justify-start font-normal"
                            >
                              <Upload className="h-4 w-4 mr-2 text-info" />
                              {t("engagement.uploadContract")}
                            </Button>
                            {contractUploading && <Progress value={contractProgress} className="h-2 mt-2" />}
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
                        className="w-full justify-start font-normal"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        {t("engagement.downloadContract")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              </div>

            <div className="space-y-6 mt-6">
              {/* 0722-157 (feedback): se quita el h3 "Fechas" — la sección ya queda clara por
                  su posición inmediatamente debajo de Información Básica. */}
              {datesLockedByState && (
                <p className="text-xs text-muted-foreground">{t("engagement.datesLockedByState")}</p>
              )}
              <div className={cn(
                "grid grid-cols-1 sm:grid-cols-3 gap-4",
                wClosingOption === "Otro" ? "md:grid-cols-4" : "md:grid-cols-3"
              )}>

                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t("engagement.startDate")} <span className="text-destructive">*</span></FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              disabled={datesLockedByState}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "dd/MM/yyyy") : t("common.pickDate")}
                              <CalendarIcon className="ml-auto h-4 w-4 text-info" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={effectiveMinStartDate ? (date) => isBefore(startOfDay(date), effectiveMinStartDate) : undefined}
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
                      <FormLabel>{t("engagement.endDate")} <span className="text-destructive">*</span></FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              disabled={datesLockedByState}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "dd/MM/yyyy") : t("common.pickDate")}
                              <CalendarIcon className="ml-auto h-4 w-4 text-info" />
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
                    <FormLabel>{t("engagement.closingDate")} <span className="text-destructive">*</span></FormLabel>
                    <Select
                      disabled={isEdit && (!canEditClosing || (overrideOn && !isAdmin) || datesLockedByState)}
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl><SelectTrigger className="[&_svg]:text-info [&_svg]:opacity-100"><SelectValue placeholder={t("engagement.selectClosingDate")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {closingDateOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {format(opt.date, "dd/MM/yyyy")}
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
                        <FormLabel>{t("engagement.closingDateCustom")} <span className="text-destructive">*</span></FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={isEdit && (!canEditClosing || (overrideOn && !isAdmin) || datesLockedByState)}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? format(field.value, "dd/MM/yyyy") : t("common.pickDate")}
                                <CalendarIcon className="ml-auto h-4 w-4 text-info" />
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

              <div className="mt-8">
              {/* 0722-157 (feedback): se quita el h3 "Clasificación" — la separación con
                  Fechas la marca el `mt-8` de este bloque. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="anio_fiscal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("engagement.anioFiscal")} <span className="text-destructive">*</span></FormLabel>
                    {showOverrideSelect ? (
                      <Select
                        onValueChange={(v) => field.onChange(Number(v))}
                        value={field.value ? String(field.value) : ""}
                      >
                        <FormControl><SelectTrigger className="[&_svg]:text-info [&_svg]:opacity-100"><SelectValue placeholder={t("engagement.selectAnioFiscal")} /></SelectTrigger></FormControl>
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
                    <FormLabel>{t("engagement.oficina")} <span className="text-destructive">*</span></FormLabel>
                    <Select
                      disabled={isEdit}
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value != null ? String(field.value) : ""}
                    >
                      <FormControl><SelectTrigger className="[&_svg]:text-info [&_svg]:opacity-100"><SelectValue placeholder={t("engagement.selectOficina")} /></SelectTrigger></FormControl>
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
                    <FormLabel>{t("engagement.practica")} <span className="text-destructive">*</span></FormLabel>
                    <Select
                      disabled={serviceSelectDisabled}
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value != null ? String(field.value) : ""}
                    >
                      <FormControl><SelectTrigger className="[&_svg]:text-info [&_svg]:opacity-100"><SelectValue placeholder={t("engagement.selectPractica")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {activeServiceOptions.map((s) => (
                          <SelectItem key={s.code} value={String(s.code)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="funcion" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("engagement.funcion")} <span className="text-destructive">*</span></FormLabel>
                    <Select
                      disabled={isEdit}
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value !== undefined ? String(field.value) : ""}
                    >
                      <FormControl><SelectTrigger className="[&_svg]:text-info [&_svg]:opacity-100"><SelectValue placeholder={t("engagement.selectFuncion")} /></SelectTrigger></FormControl>
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
              </div>
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
                      label={t("engagement.partner")}
                      required
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
                      label={t("engagement.manager")}
                      required
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

            {/* Fase 5 (plan_v2.md §6): la administración de assignments SOLO se muestra para un
                Engagement ya persistido — EngagementNew nunca renderiza esta sección. Guardado
                independiente: la card tiene sus propios botones, el submit de arriba nunca la
                toca. */}
            {/* Fase 7 (plan v2 §B.4#4): con el flag apagado se omite la sección completa —
                ambas ramas dependen del Scheduler, dejar solo el placeholder sería un
                huérfano sin sentido. */}
            {isSchedulerEnabled() && (isEdit && engagement ? (
              <div className="border border-border bg-background/50 rounded-xl p-8 space-y-4">
                <StaffAssignmentsCard engagement={engagement} onDirtyChange={setAssignmentsDirty} />
                {showAssignmentsHeaderWarning && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t("engagement.assignments.warnings.headerChangeWithPending")}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <div className="border border-border bg-background/50 rounded-xl p-8">
                <h3 className="font-medium text-lg">{t("engagement.assignments.title")}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("engagement.assignments.availableAfterSave")}
                </p>
              </div>
            ))}

            {isAdmin && (
              <div className="border border-border bg-background/50 rounded-xl p-8">
                <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">{t("engagement.timesheetPolicy")}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            )}

            {!isEdit && (
              <p className="text-xs text-muted-foreground">{t("engagement.immutabilityHint")}</p>
            )}

            <p className="text-xs text-muted-foreground">{t("engagement.requiredFieldsLegend")}</p>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
              <Button type="button" variant="cancel" onClick={() => onCancel ? onCancel() : navigate("/engagements")} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                {t("common.cancel")}
              </Button>
              {canSave && (
                <LoadingButton
                  type="submit"
                  variant="default"
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                  loading={createMutation.isPending || updateMutation.isPending}
                  disabled={hasMissingCategories && !isEdit}
                >
                  {isEdit ? t("common.saveChanges") : t("engagement.createEngagement")}
                </LoadingButton>
              )}
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
        society={createdInfo?.society ?? ""}
        showGoToWorkMatrix={createdInfo?.isCliente ?? false}
        onClose={handleSuccessDialogClose}
        onCreateAnother={handleCreateAnother}
        onGoToWorkMatrix={handleGoToWorkMatrix}
      />
    </div>
  );
}
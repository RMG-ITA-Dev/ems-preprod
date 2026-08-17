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
import { StaffAssignmentsCard } from "@/components/engagements/StaffAssignmentsCard";
import { isSchedulerEnabled } from "@/lib/schedulerFeature";
import { TaxonomyCombobox, NO_APLICA_VALUE } from "@/components/forms/TaxonomyCombobox";
import { Engagement, useClients, useServices, useTaxonomies, useSocieties } from "@/hooks/useEmsData";
import { useEngagementTeamCandidates } from "@/hooks/useEngagementTeamCandidates";
import {
  filterByService,
  withSavedStaff,
  NO_SERVICE_FILTER,
  type ServiceFilter,
} from "@/lib/engagementTeamCandidates";
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
import { useAuthorization } from "@/hooks/useAuthorization";
import {
  ENGAGEMENT_STATES,
  engagementStateI18nKey,
  effectiveEngagementState,
  deriveEngagementState,
  EngagementState,
} from "@/lib/engagementStatus";
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
  onGoToWorkMatrix?: () => void;
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
  // FEAT 0602-135: control del estado del encargo.
  // - Admin: control total (los 9 estados + "Automático").
  // - Gerente: solo congelar/descongelar (Aprobado ↔ Congelado), y solo cuando el encargo
  //   ya está Aprobado o Congelado. El resto de estados los gobierna la OT / el Admin.
  // (canManageEngagementState se define más abajo: necesita `staffRecord` para
  //  resolver "el gerente DE ESTE encargo").
  const savedEffectiveState = engagement
    ? effectiveEngagementState(engagement, engagement.work_order)
    : null;
  const derivedState = engagement
    ? deriveEngagementState(engagement, engagement.work_order)
    : null;
  // El Gerente solo congela/descongela (null→9 o 9→null) cuando el estado DERIVADO de la OT es
  // Aprobado (4). No puede tocar overrides fijados por el Admin (4/5/6/7/8). Espejo exacto del guard
  // DB `authorize_engagement_state_override` (evita error de RLS y escalación de permiso).
  const savedOverride = engagement?.engagement_state_override ?? null;
  const canManagerFreeze =
    derivedState === EngagementState.Aprobado &&
    (savedOverride === null || savedOverride === EngagementState.Congelado);
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
  // BUG 0722-162: los seis selectores del bloque Equipo se alimentan de `role_key`, no de la
  // categoría del personal. `useCategoryStaff` ya no se usa acá (sus otros cuatro consumidores
  // —Engagements, SchedulerL1, WorkOrders, ClientEngagementsTable— quedan intactos).
  const {
    partnerDirectorOptions,
    managerRoleOptions,
    encargadoOptions,
    specialistItOptions,
    specialistTaxOptions,
    hasPartnerDirectorCandidates,
    hasManagerCandidates,
    isLoading: teamCandidatesLoading,
    isError: teamCandidatesError,
  } = useEngagementTeamCandidates();
  const { staffRecord } = useCurrentStaff();

  // FEAT 0602-135 — congelar/descongelar. Decisión de negocio (2026-07-30): además
  // del Admin, puede el GERENTE DE ESTE encargo, no cualquier usuario con rol
  // Gerente. Antes era `isAdmin || isManager` sobre el enum legacy, que habilitaba
  // el toggle a todo rol mapeado a `manager` (con el espejo de Fase 8 son siete:
  // manager, ita/tax_manager, it_security_manager, accounting_manager, hr_manager
  // y risk_supervisor) y sobre CUALQUIER encargo, no solo los suyos.
  const isEngagementManager =
    !!staffRecord?.staff_id && staffRecord.staff_id === engagement?.manager_id;
  const canFreezeAsManager = can("engagement.update") && isEngagementManager;
  const canManageEngagementState = isAdmin || canFreezeAsManager;

  const activeServiceOptions = useMemo(
    () => (allServices ?? []).filter((s) => s.is_active || s.code === engagement?.practica),
    [allServices, engagement?.practica]
  );

  const serviceSelectDisabled = isEdit || roleLoading || !isAdmin;

  const activeTaxonomyOptions = useMemo(
    () => (allTaxonomies ?? []).filter((tx) => tx.is_active || tx.taxonomy_id === engagement?.taxonomy_id),
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

  // BUG 0722-162: el aviso ahora se decide por candidatos con el ROL correspondiente, no por
  // presencia de categorías en cierto rango de display_order — si no, evaluaría un criterio
  // distinto al que filtra los selectores.
  //
  // Review de Codex: el mensaje también tenía que cambiar. `messages.missingCategories` manda a
  // agregar CATEGORÍAS en Configuración, y seguir esa instrucción ya no habilita nada: la
  // elegibilidad depende de `user_roles.role_key`. `messages.missingTeamRoles` dirige al lugar
  // correcto (Configuración → Roles de Usuario).
  // Review de Codex #2: "sin candidatos" y "no se pudieron cargar los candidatos" NO son lo
  // mismo. El hook devuelve buckets vacíos también cuando el RPC falla (p. ej. frontend
  // desplegado antes de aplicar la migración), y tratar eso como "faltan roles" manda al usuario
  // a asignar roles que quizá ya existen. Solo se concluye "faltan roles" sobre una respuesta
  // exitosa; el error se informa aparte y mientras carga no se afirma nada.
  const missingTeamRoles: string[] = [];
  if (!teamCandidatesLoading && !teamCandidatesError) {
    if (!hasPartnerDirectorCandidates) missingTeamRoles.push(t("engagement.partner"));
    if (!hasManagerCandidates) missingTeamRoles.push(t("engagement.manager"));
  }
  const hasMissingTeamRoles = missingTeamRoles.length > 0;
  // El botón Crear se bloquea en ambos casos (sin candidatos no se puede completar el Equipo),
  // pero el mensaje que se muestra es el que corresponde a cada causa.
  const teamBlocksCreation = hasMissingTeamRoles || teamCandidatesError;

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

  const onSubmit = async (data: FormData) => {
    // BUG #0206-19 + #0220-48: skip for internal engagements; BUG #0602-134: admin has no floor
    if (!isInternal && effectiveMinStartDate && data.start_date && isBefore(startOfDay(data.start_date), effectiveMinStartDate)) {
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
      if (data.society_id === undefined) { form.setError("society_id", { message: t("engagement.requiredSociety")    }); missingCodeField = true; }
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

    // 0602-136: taxonomy is mandatory for Cliente engagements — "No aplica" does not
    // satisfy it (unlike other funciones, where it's a valid explicit opt-out).
    if (data.funcion === FUNCION_CLIENTE && (!data.taxonomy_id || data.taxonomy_id === NO_APLICA_VALUE)) {
      form.setError("taxonomy_id", { message: t("engagement.requiredTaxonomyCliente") });
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
          // FEAT 0602-135: solo Admin/Gerente escriben el override manual del estado.
          ...(canManageEngagementState
            ? {
                engagement_state_override:
                  !data.engagement_state_override || data.engagement_state_override === "auto"
                    ? null
                    : Number(data.engagement_state_override),
              }
            : {}),
          // oficina, practica, funcion, engagement_code, society_id intentionally omitted — immutable after create
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

  // ── BUG 0722-162: opciones del bloque Equipo ──────────────────────────────────────────
  // Cada campo ofrece SOLO los roles que le corresponden (el RPC ya filtró por rol) y además se
  // restringe al servicio del encargo. `practica` es el CODE del servicio, así que el service_id
  // se resuelve contra el catálogo ya cargado. Reutiliza el `wPractica` del watch de arriba, y es
  // reactivo: si el Admin cambia el servicio, los seis selectores se re-filtran sin pedir datos.
  // Tres estados, no dos (review de Greptile): sin `practica` no hay servicio que aplicar y se
  // filtra solo por rol; con `practica` resuelta se restringe a ese servicio; y con `practica`
  // pero sin resolver (catálogo cargando/fallado, o code inexistente) se va a FAIL-CLOSED —
  // lista vacía — para no ofrecer personal de otros servicios en esa ventana.
  const serviceFilter = useMemo<ServiceFilter>(() => {
    if (wPractica == null) return NO_SERVICE_FILTER;
    return {
      apply: true,
      serviceId: (allServices ?? []).find((s) => s.code === wPractica)?.service_id ?? null,
    };
  }, [allServices, wPractica]);

  // `withSavedStaff` se aplica DESPUÉS del filtro por servicio: un asignado histórico que ya no
  // califica (por rol o por servicio) debe seguir viéndose en SU campo, o `StaffCombobox` no
  // encontraría el id en `options` y mostraría el placeholder en un campo obligatorio que sí está
  // lleno. Mismo patrón que societyOptions / clientOptions / activeServiceOptions.
  const partnerFieldOptions = useMemo(
    () => withSavedStaff(filterByService(partnerDirectorOptions, serviceFilter), engagement?.partner),
    [partnerDirectorOptions, serviceFilter, engagement?.partner]
  );
  const sqrFieldOptions = useMemo(
    () => withSavedStaff(filterByService(partnerDirectorOptions, serviceFilter), engagement?.sqr),
    [partnerDirectorOptions, serviceFilter, engagement?.sqr]
  );
  const managerFieldOptions = useMemo(
    () => withSavedStaff(filterByService(managerRoleOptions, serviceFilter), engagement?.manager),
    [managerRoleOptions, serviceFilter, engagement?.manager]
  );
  const encargadoFieldOptions = useMemo(
    () => withSavedStaff(filterByService(encargadoOptions, serviceFilter), engagement?.encargado),
    [encargadoOptions, serviceFilter, engagement?.encargado]
  );
  const specialistItFieldOptions = useMemo(
    () => withSavedStaff(filterByService(specialistItOptions, serviceFilter), engagement?.specialist_it),
    [specialistItOptions, serviceFilter, engagement?.specialist_it]
  );
  const specialistTaxFieldOptions = useMemo(
    () => withSavedStaff(filterByService(specialistTaxOptions, serviceFilter), engagement?.specialist_tax),
    [specialistTaxOptions, serviceFilter, engagement?.specialist_tax]
  );

  // Review de Codex (0722-162): quitar a alguien de `options` NO lo saca del formulario.
  //
  // En creación el Admin puede elegir personal ANTES de fijar la práctica (sin servicio elegido
  // solo se filtra por rol) y después cambiar el servicio. Los memos de arriba dejan de ofrecer a
  // esa gente, pero su UUID seguiría en React Hook Form: el combobox mostraría el placeholder, la
  // validación de "string no vacío" pasaría igual, y `create_engagement_with_code` NO valida
  // alineación staff/servicio ni el rol de los `*_id` (solo oficina/practica/funcion/año fiscal/
  // fecha de cierre/sociedad/taxonomía). Se persistiría una asignación cruzada de servicio.
  //
  // Por eso, cuando el servicio queda resuelto, se limpia todo valor que dejó de ser elegible.
  // Los dos campos obligatorios quedan vacíos y el submit los bloquea, así que el usuario tiene
  // que volver a elegir de forma consciente.
  //
  // Guardas: solo en creación (en edición `practica` es inmutable —`serviceSelectDisabled`— y el
  // asignado histórico se preserva a propósito vía `withSavedStaff`), y solo con los candidatos
  // ya cargados y el servicio resuelto — si no, se borrarían valores válidos durante la carga,
  // justo cuando el fail-closed vacía las listas.
  useEffect(() => {
    if (isEdit) return;
    if (teamCandidatesLoading || teamCandidatesError) return;
    if (!serviceFilter.apply || serviceFilter.serviceId == null) return;

    const isStale = (current: string | null | undefined, options: { value: string }[]) =>
      !!current && !options.some((o) => o.value === current);

    // Obligatorios: se vacían con "" (lo que espera el `min(1)` del schema para marcar faltante).
    if (isStale(form.getValues("partner_id"), partnerFieldOptions)) {
      form.setValue("partner_id", "", { shouldDirty: false, shouldValidate: false });
    }
    if (isStale(form.getValues("manager_id"), managerFieldOptions)) {
      form.setValue("manager_id", "", { shouldDirty: false, shouldValidate: false });
    }
    // Opcionales: null es su "No Aplica".
    if (isStale(form.getValues("sqr_id"), sqrFieldOptions)) {
      form.setValue("sqr_id", null, { shouldDirty: false, shouldValidate: false });
    }
    if (isStale(form.getValues("encargado_id"), encargadoFieldOptions)) {
      form.setValue("encargado_id", null, { shouldDirty: false, shouldValidate: false });
    }
    if (isStale(form.getValues("specialist_it_id"), specialistItFieldOptions)) {
      form.setValue("specialist_it_id", null, { shouldDirty: false, shouldValidate: false });
    }
    if (isStale(form.getValues("specialist_tax_id"), specialistTaxFieldOptions)) {
      form.setValue("specialist_tax_id", null, { shouldDirty: false, shouldValidate: false });
    }
  }, [
    isEdit,
    teamCandidatesLoading,
    teamCandidatesError,
    serviceFilter,
    partnerFieldOptions,
    sqrFieldOptions,
    managerFieldOptions,
    encargadoFieldOptions,
    specialistItFieldOptions,
    specialistTaxFieldOptions,
    form,
  ]);

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

      {/* Review de Codex: SIN el guard `!isEdit`, a diferencia del aviso de roles faltantes de
          abajo. Un fallo de carga importa igual o más en edición: los selectores quedan vacíos
          (solo `withSavedStaff` rescata al asignado actual), así que el editor no puede elegir
          reemplazo — y sin este mensaje no tendría ninguna explicación de por qué. */}
      {teamCandidatesError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("messages.teamCandidatesLoadError")}</AlertDescription>
        </Alert>
      )}

      {hasMissingTeamRoles && !isEdit && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t("messages.missingTeamRoles", { roles: missingTeamRoles.join(", ") })}
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
                      disabled={serviceSelectDisabled}
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value != null ? String(field.value) : ""}
                    >
                      <FormControl><SelectTrigger><SelectValue placeholder={t("engagement.selectPractica")} /></SelectTrigger></FormControl>
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

                <FormField control={form.control} name="society_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("engagement.society")} *</FormLabel>
                    <Select
                      disabled={isEdit}
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl><SelectTrigger><SelectValue placeholder={t("engagement.selectSociety")} /></SelectTrigger></FormControl>
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

                {/* FEAT 0602-135: control del estado del encargo. "Automático" = derivado de la OT.
                    El campo `status` legacy queda en 'active' por defecto. */}
                {isEdit && isAdmin ? (
                  // Admin: control total de los 9 estados + Automático.
                  <FormField
                    control={form.control}
                    name="engagement_state_override"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("engagement.status")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? "auto"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : isEdit && canFreezeAsManager ? (
                  // Gerente: solo congelar/descongelar, habilitado únicamente cuando el encargo
                  // está Aprobado o Congelado. ON => override 9 (Congelado); OFF => Automático (vuelve a Aprobado).
                  <FormField
                    control={form.control}
                    name="engagement_state_override"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("engagement.status")}</FormLabel>
                        <div className="flex items-center gap-3 h-10">
                          <Switch
                            checked={field.value === "9"}
                            disabled={!canManagerFreeze}
                            onCheckedChange={(on) => field.onChange(on ? "9" : "auto")}
                            aria-label={t("engagement.freezeToggle")}
                          />
                          <span className="text-sm font-medium">{t("engagement.freezeToggle")}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {canManagerFreeze ? t("engagement.freezeHint") : t("engagement.freezeUnavailable")}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  // Otros roles (o creación): estado efectivo en solo lectura.
                  <FormItem>
                    <FormLabel>{t("engagement.status")}</FormLabel>
                    <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                      {savedEffectiveState
                        ? t(engagementStateI18nKey(savedEffectiveState))
                        : t("engagementState.auto")}
                    </div>
                  </FormItem>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="taxonomy_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("engagement.taxonomy")}
                        {form.watch("funcion") === FUNCION_CLIENTE && " *"}
                      </FormLabel>
                      <TaxonomyCombobox
                        taxonomies={activeTaxonomyOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                        showNoAplica={form.watch("funcion") !== FUNCION_CLIENTE}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-lg">{t("common.dates")}</h3>
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
                      <FormLabel>{t("engagement.startDate")} *</FormLabel>
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
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
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
                      <FormLabel>{t("engagement.endDate")} *</FormLabel>
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
                      disabled={isEdit && (!canEditClosing || (overrideOn && !isAdmin) || datesLockedByState)}
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl><SelectTrigger><SelectValue placeholder={t("engagement.selectClosingDate")} /></SelectTrigger></FormControl>
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
                        <FormLabel>{t("engagement.closingDateCustom")} *</FormLabel>
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
                      options={partnerFieldOptions}
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
                      options={sqrFieldOptions}
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
                      options={managerFieldOptions}
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
                      options={encargadoFieldOptions}
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
                      options={specialistItFieldOptions}
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
                      options={specialistTaxFieldOptions}
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
              {canSave && (
                <LoadingButton
                  type="submit"
                  variant="default"
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                  loading={createMutation.isPending || updateMutation.isPending}
                  disabled={teamBlocksCreation && !isEdit}
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
        onClose={handleSuccessDialogClose}
        onCreateAnother={handleCreateAnother}
        onGoToWorkMatrix={handleGoToWorkMatrix}
      />
    </div>
  );
}
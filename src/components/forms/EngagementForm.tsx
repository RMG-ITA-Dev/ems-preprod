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
import { Engagement, useClients, useServices } from "@/hooks/useEmsData";
import { useCategoryStaff } from "@/hooks/useCategoryStaff";
import { useCreateEngagement, useUpdateEngagement, useDeleteEngagement } from "@/hooks/mutations";
import { Trash2, CalendarIcon, AlertCircle, ChevronsUpDown, Check } from "lucide-react";
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

const formSchema = z.object({
  engagement_name: z.string()
    .min(5, "Engagement name must be at least 5 characters")
    .max(200, "Engagement name cannot exceed 200 characters"),
  anio_fiscal: z.number().int().min(2020).max(2100, "Invalid fiscal year").optional(),
  oficina:     z.number().int().min(0).max(2,   "Invalid office").optional(),
  practica:    z.number().int().min(0).max(9,   "Invalid practice").optional(),
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const isEdit = !!engagement;

  const { data: clients } = useClients();
  const { data: allServices } = useServices();
  const { partnerOptions, managerOptions, hasPartnerCategory, hasManagerCategory, allActiveStaff } = useCategoryStaff();

  const activeServiceOptions = useMemo(
    () => (allServices ?? []).filter((s) => s.is_active || s.code === engagement?.practica),
    [allServices, engagement?.practica]
  );

  const serviceNameByCode = useMemo(() => {
    const map: Record<number, string> = {};
    (allServices ?? []).forEach((s) => { map[s.code] = s.name; });
    return map;
  }, [allServices]);
  const createMutation = useCreateEngagement();
  const updateMutation = useUpdateEngagement();
  const deleteMutation = useDeleteEngagement();

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
      });
      setWorkOrderRequired(engagement.work_order_required ?? true);
      setActivityRequired(engagement.activity_required ?? true);
      setIsInternal(engagement.is_internal ?? false);
      setApprovalRequired(engagement.approval_required ?? true);
    }
  }, [engagement, clients, form, isDirty]);

  // Report dirty state to parent
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSubmit = async (data: FormData) => {
    // BUG #0206-19 + #0220-48: skip for internal engagements
    if (!isInternal && minStartDate && data.start_date && isBefore(startOfDay(data.start_date), minStartDate)) {
      form.setError("start_date", {
        message: t("engagement.startDateBeforeCreation"),
      });
      return;
    }

    if (!isEdit) {
      let missingCodeField = false;
      if (data.anio_fiscal === undefined) { form.setError("anio_fiscal", { message: t("engagement.requiredAnioFiscal") }); missingCodeField = true; }
      if (data.oficina    === undefined) { form.setError("oficina",     { message: t("engagement.requiredOficina")    }); missingCodeField = true; }
      if (data.practica   === undefined) { form.setError("practica",    { message: t("engagement.requiredPractica")   }); missingCodeField = true; }
      if (data.funcion    === undefined) { form.setError("funcion",     { message: t("engagement.requiredFuncion")    }); missingCodeField = true; }
      if (missingCodeField) return;
    }

    if (isEdit && engagement) {
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
          // oficina, practica, funcion, anio_fiscal intentionally omitted — immutable after create
        },
      });
      if (onSaveSuccess) {
        onSaveSuccess();
      } else {
        navigate("/engagements");
      }
      return;
    }

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
      work_order_required: workOrderRequired,
      activity_required:   activityRequired,
      is_internal:         isInternal,
      approval_required:   approvalRequired,
      sqr_id:              data.sqr_id ?? null,
      encargado_id:        data.encargado_id ?? null,
      specialist_it_id:    data.specialist_it_id ?? null,
      specialist_tax_id:   data.specialist_tax_id ?? null,
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
  const previewIncomplete =
    wAnio == null || wOficina == null || wPractica == null || wFuncion == null;
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
    });
    setWorkOrderRequired(true);
    setActivityRequired(true);
    setIsInternal(false);
    setApprovalRequired(true);
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
                    <Select
                      disabled={isEdit}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
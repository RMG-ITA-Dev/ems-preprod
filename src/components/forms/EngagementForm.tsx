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
import { Engagement, useClients } from "@/hooks/useEmsData";
import { useCategoryStaff } from "@/hooks/useCategoryStaff";
import { useCreateEngagement, useUpdateEngagement, useDeleteEngagement } from "@/hooks/mutations";
import { Trash2, CalendarIcon, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useUserRole } from "@/hooks/useUserRole";

const formSchema = z.object({
  engagement_name: z.string()
    .min(5, "Engagement name must be at least 5 characters")
    .max(200, "Engagement name cannot exceed 200 characters"),
  engagement_code: z.string()
    .min(1, "Engagement code is required")
    .max(20, "Code cannot exceed 20 characters")
    .regex(/^[A-Za-z0-9._-]+$/, "Code can only contain letters, numbers, dots, and hyphens"),
  client_id: z.string().min(1, "Client is required"),
  partner_id: z.string().min(1, "Partner/Director is required"),
  manager_id: z.string().min(1, "Manager is required"),
  start_date: z.date({ required_error: "Start date is required" }),
  end_date: z.date({ required_error: "End date is required" }),
  status: z.string(),
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
}

export function EngagementForm({ engagement, onDirtyChange, onCancel, onSaveSuccess }: EngagementFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const isEdit = !!engagement;

  const { data: clients } = useClients();
  const { partners, managerOptions, hasPartnerCategory, hasManagerCategory } = useCategoryStaff();
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
      engagement_code: "",
      client_id: "",
      partner_id: "",
      manager_id: "",
      status: "active",
    },
  });

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
        engagement_code: engagement.engagement_code || "",
        client_id: engagement.client_id,
        partner_id: engagement.partner_id || "",
        manager_id: engagement.manager_id || "",
        status: engagement.status,
        start_date: engagement.start_date ? parseDateLocal(engagement.start_date) : undefined,
        end_date: engagement.end_date ? parseDateLocal(engagement.end_date) : undefined,
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

    // Duplicate engagement code check
    const { data: existingByCode } = await supabase
      .from("engagements")
      .select("engagement_id, engagement_name")
      .eq("engagement_code", data.engagement_code)
      .neq("engagement_id", engagement?.engagement_id || "")
      .maybeSingle();

    if (existingByCode) {
      toast.error(t("engagement.duplicateCode", {
        code: data.engagement_code,
        name: existingByCode.engagement_name,
      }));
      return;
    }

    const payload = {
      engagement_name: data.engagement_name,
      engagement_code: data.engagement_code,
      client_id: data.client_id,
      partner_id: data.partner_id || undefined,
      manager_id: data.manager_id || undefined,
      start_date: data.start_date ? format(data.start_date, "yyyy-MM-dd") : undefined,
      end_date: data.end_date ? format(data.end_date, "yyyy-MM-dd") : undefined,
      status: data.status,
      work_order_required: workOrderRequired,
      activity_required: activityRequired,
      is_internal: isInternal,
      approval_required: approvalRequired,
    };
    if (isEdit && engagement) {
      await updateMutation.mutateAsync({ id: engagement.engagement_id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
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
                <AlertDialogAction onClick={handleDelete} className="bg-destructive/80 text-destructive-foreground hover:bg-destructive">
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

                <FormField
                  control={form.control}
                  name="engagement_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("engagement.engagementCode")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="ENG-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
              <h3 className="font-medium text-lg">{t("common.team")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="partner_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("engagement.partner")} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("engagement.selectPartner")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {partners?.map((p) => (
                            <SelectItem key={p.staff_id} value={p.staff_id}>
                              {p.first_name} {p.last_name}
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
                  name="manager_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("engagement.manager")} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("engagement.selectManager")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {managerOptions.map((opt) => (
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

            {isAdmin && (
              <div className="space-y-4 pt-2">
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
    </div>
  );
}
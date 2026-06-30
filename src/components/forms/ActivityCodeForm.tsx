import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
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
import { ActivityCode } from "@/hooks/useEmsData";
import { useServices } from "@/hooks/useEmsData";
import {
  useCreateActivityCode,
  useUpdateActivityCode,
  useDeleteActivityCode,
  useDeactivateServiceActivity,
  useReactivateServiceActivity,
} from "@/hooks/mutations";
import { Trash2, RotateCcw } from "lucide-react";

const formSchema = z.object({
  activity_code: z.string().max(10, "Max 10 characters"),
  description: z.string().min(1, "Description is required"),
  is_active: z.boolean(),
  service_id: z.string().nullable(),
});

type FormData = z.infer<typeof formSchema>;

interface ActivityCodeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityCode?: ActivityCode | null;
}

export function ActivityCodeForm({ open, onOpenChange, activityCode }: ActivityCodeFormProps) {
  const { t } = useTranslation();
  const isEdit = !!activityCode;
  const isServiceLinked = !!activityCode?.service_id;
  const isActive = activityCode?.is_active ?? true;

  const createMutation = useCreateActivityCode();
  const updateMutation = useUpdateActivityCode();
  const deleteMutation = useDeleteActivityCode();
  const deactivateMutation = useDeactivateServiceActivity();
  const reactivateMutation = useReactivateServiceActivity();

  const { data: services } = useServices();
  // Only services that require extra configuration (allows_rates_activities)
  // and have an abbreviation can host service-linked activities.
  const activeServices = (services ?? []).filter(
    (s) => s.is_active && s.abbreviation && s.allows_rates_activities
  );

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      activity_code: "",
      description: "",
      is_active: true,
      service_id: null,
    },
  });

  const watchedServiceId = form.watch("service_id");
  const selectedService = activeServices.find((s) => s.service_id === watchedServiceId);

  // Derive a preview code for a NEW service-linked activity.
  const derivedCodePreview = (() => {
    if (!watchedServiceId || !selectedService?.abbreviation) return "";
    return `${selectedService.abbreviation}-A?`;
  })();

  useEffect(() => {
    if (open) {
      form.reset({
        activity_code: activityCode?.activity_code || "",
        description: activityCode?.description || "",
        is_active: activityCode?.is_active ?? true,
        service_id: activityCode?.service_id ?? null,
      });
    }
  }, [open, activityCode, form]);

  const onSubmit = async (data: FormData) => {
    if (isEdit && activityCode) {
      // Only description can be edited for service-linked activities.
      await updateMutation.mutateAsync({
        id: activityCode.activity_id,
        data: { description: data.description },
      });
    } else if (data.service_id) {
      // New service-linked activity: code derived by RPC.
      await createMutation.mutateAsync({
        service_id:  data.service_id,
        description: data.description,
        entity_type: "A",
      });
    } else {
      // Legacy heredada path: manual code.
      if (!data.activity_code) {
        form.setError("activity_code", { message: t("activity.codeRequired") });
        return;
      }
      await createMutation.mutateAsync({
        activity_code: data.activity_code.toUpperCase(),
        description:   data.description,
        is_active:     data.is_active,
      });
    }
    onOpenChange(false);
    form.reset();
  };

  const handleDelete = async () => {
    if (!activityCode) return;
    await deleteMutation.mutateAsync(activityCode.activity_id);
    onOpenChange(false);
  };

  const handleDeactivate = async () => {
    if (!activityCode) return;
    await deactivateMutation.mutateAsync(activityCode.activity_id);
    onOpenChange(false);
  };

  const handleReactivate = async () => {
    if (!activityCode) return;
    await reactivateMutation.mutateAsync(activityCode.activity_id);
    onOpenChange(false);
  };

  const isServiceLinkedNew = !isEdit && !!watchedServiceId;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? t("activity.editActivity") : t("activity.newActivity")}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            {/* Service selector — only for new activities */}
            {!isEdit && (
              <FormField
                control={form.control}
                name="service_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("activity.service")}</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                      value={field.value ?? "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="activity-service-select">
                          <SelectValue placeholder={t("activity.selectService")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">{t("common.none")}</SelectItem>
                        {activeServices.map((s) => (
                          <SelectItem key={s.service_id} value={s.service_id}>
                            {s.name} ({s.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>{t("activity.serviceDescription")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Show current service in edit mode */}
            {isEdit && isServiceLinked && activityCode?.service && (
              <FormItem>
                <FormLabel>{t("activity.service")}</FormLabel>
                <Input
                  value={`${activityCode.service.name} (${activityCode.service.abbreviation})`}
                  disabled
                  data-testid="activity-service-readonly"
                />
              </FormItem>
            )}

            {/* Code field: read-only for service-linked; manual for legacy; preview for new linked */}
            <FormField
              control={form.control}
              name="activity_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity.code")} {!isServiceLinked && !isServiceLinkedNew ? "*" : ""}</FormLabel>
                  <FormControl>
                    {isServiceLinked || isServiceLinkedNew ? (
                      <Input
                        value={isEdit ? activityCode?.activity_code ?? "" : derivedCodePreview}
                        disabled
                        data-testid="activity-code-readonly"
                        placeholder={t("activity.codeAutoGenerated")}
                      />
                    ) : (
                      <Input
                        placeholder="e.g., PLN"
                        maxLength={10}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    )}
                  </FormControl>
                  {(isServiceLinked || isServiceLinkedNew) && (
                    <FormDescription>{t("activity.codeAutoGeneratedDescription")}</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity.description")} *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Planning" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* is_active toggle only for legacy (non-service-linked) activities */}
            {!isServiceLinked && !isServiceLinkedNew && (
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t("common.active")}</FormLabel>
                      <FormDescription>
                        {t("activity.activeDescription")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            <SheetFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
              <Button type="button" variant="cancel" onClick={() => onOpenChange(false)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                {t("common.cancel")}
              </Button>

              {isEdit && isServiceLinked && isActive && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" className="w-full sm:w-auto min-h-[44px] sm:min-h-0" data-testid="deactivate-button">
                      <Trash2 className="h-4 w-4" />
                      {t("activity.deactivate")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("activity.deactivateTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("activity.deactivateDescription", { code: activityCode?.activity_code })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeactivate} className="bg-destructive/70 text-destructive-foreground hover:bg-destructive">
                        {t("activity.deactivate")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {isEdit && isServiceLinked && !isActive && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" className="w-full sm:w-auto min-h-[44px] sm:min-h-0" data-testid="activate-button">
                      <RotateCcw className="h-4 w-4" />
                      {t("activity.activate")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("activity.activateTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("activity.activateDescription", { code: activityCode?.activity_code })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleReactivate}>
                        {t("activity.activate")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {isEdit && !isServiceLinked && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                      <Trash2 className="h-4 w-4" />
                      {t("common.delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("activity.deleteActivity")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("common.confirmDelete", { name: activityCode?.activity_code })} {t("common.deleteWarning")}
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

              <LoadingButton
                type="submit"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {isEdit ? t("common.saveChanges") : t("activity.createActivity")}
              </LoadingButton>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

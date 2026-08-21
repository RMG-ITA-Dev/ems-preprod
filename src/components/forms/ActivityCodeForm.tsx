import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
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
  SheetDescription,
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
import { useServices, useAllActivityCodes } from "@/hooks/useEmsData";
import {
  useCreateActivityCode,
  useUpdateActivityCode,
  useDeactivateServiceActivity,
  useReactivateServiceActivity,
} from "@/hooks/mutations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";

// Soft recommendation: services usually keep 1–9 activities, but it is not enforced.
const RECOMMENDED_MAX_ACTIVITIES = 9;

const formSchema = z.object({
  description: z.string().min(1, "Description is required"),
  service_id: z.string().min(1, "validation.categoryServiceRequired"),
});

type FormData = z.infer<typeof formSchema>;

interface ActivityCodeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityCode?: ActivityCode | null;
  /** Default práctica for a new activity (the currently selected práctica). */
  serviceId?: string;
  /** When true, the práctica is fixed to `serviceId` and rendered read-only on create. */
  lockService?: boolean;
}

export function ActivityCodeForm({ open, onOpenChange, activityCode, serviceId, lockService }: ActivityCodeFormProps) {
  const { t } = useTranslation();
  const isEdit = !!activityCode;
  const isActive = activityCode?.is_active ?? true;
  // 0817-177 (review follow-up): the 8 legacy codes backfilled to a práctica
  // (PLN/FLD/REV/DOC/ADM/MTG/TRV/TRN) predate the {abrev}-{entity_type}{n}
  // ordinal scheme; deactivate_service_activity/reactivate_service_activity
  // reject them (see 20260820120000_0817-177_guard_legacy_activity_codes.sql),
  // so hide "Deactivate"/"Activate" instead of offering actions that always
  // fail. Matches both the active ordinal suffix (digits, e.g. AUD-A1) and
  // the inactive marker deactivate_service_activity assigns (AUD-AX) — an
  // inactive real activity must still show "Activate".
  const isOrdinalScheme = !activityCode || /^[A-Z]{2,5}-[A-Z](\d+|X)$/.test(activityCode.activity_code);

  const createMutation = useCreateActivityCode();
  const updateMutation = useUpdateActivityCode();
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
      description: "",
      service_id: "",
    },
  });

  const { data: allActivities } = useAllActivityCodes();

  const watchedServiceId = form.watch("service_id");
  const selectedService = activeServices.find((s) => s.service_id === watchedServiceId)
    ?? (activityCode?.service ?? null);

  // Active activities already linked to the selected service (for the soft
  // recommendation note when creating a new one).
  const activeCountForService = watchedServiceId
    ? (allActivities ?? []).filter((a) => a.service_id === watchedServiceId && a.is_active).length
    : 0;

  // Derive a preview code for a NEW activity.
  const derivedCodePreview = (() => {
    if (!watchedServiceId || !selectedService?.abbreviation) return "";
    return `${selectedService.abbreviation}-A?`;
  })();

  useEffect(() => {
    if (open) {
      form.reset({
        description: activityCode?.description || "",
        service_id: activityCode?.service_id || serviceId || "",
      });
    }
  }, [open, activityCode, serviceId, form]);

  const onSubmit = async (data: FormData) => {
    if (isEdit && activityCode) {
      // Práctica is immutable on edit — only description is editable (code is
      // managed by RPCs).
      await updateMutation.mutateAsync({
        id: activityCode.activity_id,
        data: { description: data.description },
      });
    } else {
      await createMutation.mutateAsync({
        service_id: data.service_id,
        description: data.description,
        entity_type: "A",
      });
    }
    onOpenChange(false);
    form.reset();
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

  const isNewLocked = !isEdit && lockService;
  const isServiceLinkedNew = !isEdit && !!watchedServiceId;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? t("activity.editActivity") : t("activity.newActivity")}</SheetTitle>
          <SheetDescription>{t("activity.formDescription")}</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            {/* Práctica: locked read-only when created from the unified Settings
                tab; free selector otherwise. Never shown/editable on edit. */}
            {!isEdit && isNewLocked && (
              <FormItem>
                <FormLabel>{t("activity.service")}</FormLabel>
                <Input
                  value={selectedService ? `${selectedService.name} (${selectedService.abbreviation})` : ""}
                  disabled
                  data-testid="activity-service-readonly"
                />
              </FormItem>
            )}

            {!isEdit && !isNewLocked && (
              <FormField
                control={form.control}
                name="service_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("activity.service")} *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="activity-service-select">
                          <SelectValue placeholder={t("activity.selectService")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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

            {/* Non-blocking recommendation: 1–9 activities per service. */}
            {isServiceLinkedNew && activeCountForService >= RECOMMENDED_MAX_ACTIVITIES && (
              <Alert data-testid="activity-recommended-max">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t("activity.recommendedMaxHint")}</AlertDescription>
              </Alert>
            )}

            {/* Show current práctica in edit mode (always service-linked, immutable) */}
            {isEdit && activityCode?.service && (
              <FormItem>
                <FormLabel>{t("activity.service")}</FormLabel>
                <Input
                  value={`${activityCode.service.name} (${activityCode.service.abbreviation})`}
                  disabled
                  data-testid="activity-service-readonly"
                />
              </FormItem>
            )}

            {/* Code field: always read-only/auto-generated (service-linked). Pure
                display — not a bound form field, since the code never submits. */}
            <FormItem>
              <FormLabel>{t("activity.code")}</FormLabel>
              <FormControl>
                <Input
                  value={isEdit ? activityCode?.activity_code ?? "" : derivedCodePreview}
                  disabled
                  data-testid="activity-code-readonly"
                  placeholder={t("activity.codeAutoGenerated")}
                />
              </FormControl>
              <FormDescription>{t("activity.codeAutoGeneratedDescription")}</FormDescription>
            </FormItem>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity.description")} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t("activity.descriptionPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
              <Button type="button" variant="cancel" onClick={() => onOpenChange(false)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                {t("common.cancel")}
              </Button>

              {isEdit && isActive && isOrdinalScheme && (
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

              {isEdit && !isActive && isOrdinalScheme && (
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

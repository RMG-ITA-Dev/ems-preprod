import { useEffect, useMemo } from "react";
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
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { Service, useAllActivityCodes } from "@/hooks/useEmsData";
import { useCreateService, useUpdateService } from "@/hooks/mutations";

const ALL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

type FormData = {
  name: string;
  code: number;
  abbreviation: string;
  allows_rates_activities: boolean;
  is_active: boolean;
};

interface ServiceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
  usedCodes: number[];
}

export function ServiceForm({ open, onOpenChange, service, usedCodes }: ServiceFormProps) {
  const { t } = useTranslation();
  const isEdit = !!service;

  const formSchema = z.object({
    name: z.string().min(1, t("service.nameRequired")),
    code: z.number().int().min(0).max(9),
    abbreviation: z
      .string()
      .regex(/^[A-Z]{2,5}$/, t("service.abbreviationInvalid"))
      .or(z.literal("")),
    allows_rates_activities: z.boolean(),
    is_active: z.boolean(),
  });
  const createMutation = useCreateService();
  const updateMutation = useUpdateService();

  // A service with linked activities cannot have its abbreviation cleared: the
  // activity codes keep their prefix and the RPCs would build a NULL code.
  const { data: allActivities } = useAllActivityCodes();
  const hasLinkedActivities =
    isEdit && (allActivities ?? []).some((a) => a.practica_id === service?.practica_id);

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [pendingData, setPendingData] = useState<FormData | null>(null);

  const availableDigits = useMemo(() => {
    const taken = new Set(isEdit ? usedCodes.filter(c => c !== service.code) : usedCodes);
    return ALL_DIGITS.filter(d => !taken.has(d));
  }, [isEdit, service, usedCodes]);

  const noDigitsLeft = !isEdit && availableDigits.length === 0;

  const defaultCode = useMemo(() => {
    if (isEdit) return service.code;
    return availableDigits[0] ?? 0;
  }, [isEdit, service, availableDigits]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      code: defaultCode,
      abbreviation: "",
      allows_rates_activities: false,
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: service?.name ?? "",
        code: isEdit ? (service.code ?? defaultCode) : defaultCode,
        abbreviation: service?.abbreviation ?? "",
        allows_rates_activities: service?.allows_rates_activities ?? false,
        is_active: service?.is_active ?? true,
      });
      setDeactivateOpen(false);
      setPendingData(null);
    }
  }, [open, service, isEdit, defaultCode, form]);

  const commitSubmit = async (data: FormData) => {
    const abbreviation = data.abbreviation.trim() || null;
    if (isEdit && service) {
      await updateMutation.mutateAsync({
        id: service.practica_id,
        data: {
          name: data.name,
          abbreviation,
          allows_rates_activities: data.allows_rates_activities,
          is_active: data.is_active,
        },
      });
    } else {
      await createMutation.mutateAsync({
        name: data.name,
        code: data.code,
        abbreviation,
        allows_rates_activities: data.allows_rates_activities,
        is_active: data.is_active,
      });
    }
    onOpenChange(false);
    form.reset();
  };

  const onSubmit = async (data: FormData) => {
    // Block clearing the abbreviation when the service has linked activities.
    if (hasLinkedActivities && !data.abbreviation.trim()) {
      form.setError("abbreviation", { message: t("service.abbreviationRequiredLinked") });
      return;
    }
    // Flipping active → inactive requires confirmation.
    if (isEdit && service?.is_active && !data.is_active) {
      setPendingData(data);
      setDeactivateOpen(true);
      return;
    }
    await commitSubmit(data);
  };

  const handleDeactivateConfirm = async () => {
    setDeactivateOpen(false);
    if (pendingData) await commitSubmit(pendingData);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {isEdit ? t("service.editService") : t("service.newService")}
            </SheetTitle>
            <SheetDescription>{t("service.formDescription")}</SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("service.name")} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t("service.namePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="abbreviation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("service.abbreviation")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("service.abbreviationPlaceholder")}
                        maxLength={5}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        data-testid="service-abbreviation-input"
                      />
                    </FormControl>
                    <FormDescription>{t("service.abbreviationDescription")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("service.code")} *</FormLabel>
                    {isEdit ? (
                      <Input
                        value={String(service.code)}
                        disabled
                        className="font-mono max-w-[80px]"
                        data-testid="service-code-readonly"
                      />
                    ) : noDigitsLeft ? (
                      <p className="text-sm text-destructive" data-testid="no-digits-message">
                        {t("service.noDigitsAvailable")}
                      </p>
                    ) : (
                      <Select
                        onValueChange={(v) => field.onChange(Number(v))}
                        value={String(field.value)}
                      >
                        <FormControl>
                          <SelectTrigger className="max-w-[80px]" data-testid="code-select-trigger">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableDigits.map((d) => (
                            <SelectItem key={d} value={String(d)}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allows_rates_activities"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        {t("service.allowsRatesActivities")}
                      </FormLabel>
                      <FormDescription>
                        {t("service.allowsRatesActivitiesDescription")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t("common.active")}</FormLabel>
                      <FormDescription>{t("service.activeDescription")}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <SheetFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
                <Button
                  type="button"
                  variant="cancel"
                  onClick={() => onOpenChange(false)}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                >
                  {t("common.cancel")}
                </Button>
                <LoadingButton
                  type="submit"
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                  loading={createMutation.isPending || updateMutation.isPending}
                  disabled={noDigitsLeft}
                >
                  {isEdit ? t("common.saveChanges") : t("service.createService")}
                </LoadingButton>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("service.deactivateConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("service.deactivateConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivateConfirm}>
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

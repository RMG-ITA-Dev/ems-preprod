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
import { Service } from "@/hooks/useEmsData";
import { useCreateService, useUpdateService } from "@/hooks/mutations";

const ALL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.number().int().min(0).max(9),
  allows_rates_activities: z.boolean(),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface ServiceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
  usedCodes: number[];
}

export function ServiceForm({ open, onOpenChange, service, usedCodes }: ServiceFormProps) {
  const { t } = useTranslation();
  const isEdit = !!service;
  const createMutation = useCreateService();
  const updateMutation = useUpdateService();

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [pendingData, setPendingData] = useState<FormData | null>(null);

  const availableDigits = useMemo(() => {
    const taken = new Set(isEdit ? usedCodes.filter(c => c !== service.code) : usedCodes);
    return ALL_DIGITS.filter(d => !taken.has(d));
  }, [isEdit, service, usedCodes]);

  const defaultCode = useMemo(() => {
    if (isEdit) return service.code;
    return availableDigits[0] ?? 0;
  }, [isEdit, service, availableDigits]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      code: defaultCode,
      allows_rates_activities: false,
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: service?.name ?? "",
        code: isEdit ? (service.code ?? defaultCode) : defaultCode,
        allows_rates_activities: service?.allows_rates_activities ?? false,
        is_active: service?.is_active ?? true,
      });
      setDeactivateOpen(false);
      setPendingData(null);
    }
  }, [open, service, isEdit, defaultCode, form]);

  const commitSubmit = async (data: FormData) => {
    if (isEdit && service) {
      await updateMutation.mutateAsync({
        id: service.service_id,
        data: {
          name: data.name,
          allows_rates_activities: data.allows_rates_activities,
          is_active: data.is_active,
        },
      });
    } else {
      await createMutation.mutateAsync({
        name: data.name,
        code: data.code,
        allows_rates_activities: data.allows_rates_activities,
        is_active: data.is_active,
      });
    }
    onOpenChange(false);
    form.reset();
  };

  const onSubmit = async (data: FormData) => {
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
                      <Input placeholder="e.g., Auditoría" {...field} />
                    </FormControl>
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
                    ) : (
                      <Select
                        onValueChange={(v) => field.onChange(Number(v))}
                        value={String(field.value)}
                      >
                        <FormControl>
                          <SelectTrigger className="max-w-[80px]">
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

import { useEffect, useMemo, useState } from "react";
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
import { Taxonomy, useServices } from "@/hooks/useEmsData";
import { useCreateTaxonomy, useUpdateTaxonomy } from "@/hooks/mutations";

const GLOBAL_SERVICE_VALUE = "__global__";

type FormData = {
  code: string;
  name: string;
  practica_id: string | null;
  is_active: boolean;
};

interface TaxonomyFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taxonomy?: Taxonomy | null;
  usedCodes: string[];
}

export function TaxonomyForm({ open, onOpenChange, taxonomy, usedCodes }: TaxonomyFormProps) {
  const { t } = useTranslation();
  const isEdit = !!taxonomy;
  const { data: allServices } = useServices();

  const otherCodes = useMemo(() => {
    const currentLower = taxonomy?.code?.trim().toLowerCase();
    return usedCodes
      .filter((c) => c.trim().toLowerCase() !== currentLower)
      .map((c) => c.trim().toLowerCase());
  }, [usedCodes, taxonomy]);

  const formSchema = z.object({
    code: z
      .string()
      .trim()
      .min(1, t("taxonomy.codeRequired"))
      .max(10, t("taxonomy.codeTooLong"))
      .refine((v) => !otherCodes.includes(v.toLowerCase()), t("taxonomy.codeInUse")),
    name: z.string().min(1, t("taxonomy.nameRequired")),
    practica_id: z.string().nullable(),
    is_active: z.boolean(),
  });

  const createMutation = useCreateTaxonomy();
  const updateMutation = useUpdateTaxonomy();

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [pendingData, setPendingData] = useState<FormData | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      name: "",
      practica_id: null,
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        code: taxonomy?.code ?? "",
        name: taxonomy?.name ?? "",
        practica_id: taxonomy?.practica_id ?? null,
        is_active: taxonomy?.is_active ?? true,
      });
      setDeactivateOpen(false);
      setPendingData(null);
    }
  }, [open, taxonomy, form]);

  const commitSubmit = async (data: FormData) => {
    const payload = {
      code: data.code.trim(),
      name: data.name.trim(),
      practica_id: data.practica_id,
      is_active: data.is_active,
    };
    if (isEdit && taxonomy) {
      await updateMutation.mutateAsync({ id: taxonomy.taxonomy_id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
    form.reset();
  };

  const onSubmit = async (data: FormData) => {
    // Flipping active → inactive requires confirmation.
    if (isEdit && taxonomy?.is_active && !data.is_active) {
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
              {isEdit ? t("taxonomy.editTaxonomy") : t("taxonomy.newTaxonomy")}
            </SheetTitle>
            <SheetDescription>{t("taxonomy.formDescription")}</SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("taxonomy.code")} *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("taxonomy.codePlaceholder")}
                        maxLength={10}
                        className="max-w-[160px] font-mono uppercase"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("taxonomy.name")} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t("taxonomy.namePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="practica_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("taxonomy.service")}</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === GLOBAL_SERVICE_VALUE ? null : v)}
                      value={field.value ?? GLOBAL_SERVICE_VALUE}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={GLOBAL_SERVICE_VALUE}>{t("taxonomy.global")}</SelectItem>
                        {(allServices ?? []).map((s) => (
                          <SelectItem key={s.practica_id} value={s.practica_id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>{t("taxonomy.serviceDescription")}</FormDescription>
                    <FormMessage />
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
                      <FormDescription>{t("taxonomy.activeDescription")}</FormDescription>
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
                  {isEdit ? t("common.saveChanges") : t("taxonomy.createTaxonomy")}
                </LoadingButton>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("taxonomy.deactivateConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("taxonomy.deactivateConfirmBody")}
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

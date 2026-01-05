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
import { Industry } from "@/hooks/useEmsData";
import { useCreateIndustry, useUpdateIndustry, useDeleteIndustry } from "@/hooks/mutations";
import { Trash2 } from "lucide-react";

const fiscalYearOptions = [
  "December 31",
  "March 31",
  "June 30",
  "September 30",
];

const formSchema = z.object({
  industry_name: z.string().min(1, "Industry name is required"),
  fiscal_year_end: z.string().min(1, "Fiscal year-end is required"),
});

type FormData = z.infer<typeof formSchema>;

interface IndustryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  industry?: Industry | null;
}

export function IndustryForm({ open, onOpenChange, industry }: IndustryFormProps) {
  const { t } = useTranslation();
  const isEdit = !!industry;
  const createMutation = useCreateIndustry();
  const updateMutation = useUpdateIndustry();
  const deleteMutation = useDeleteIndustry();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      industry_name: "",
      fiscal_year_end: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        industry_name: industry?.industry_name || "",
        fiscal_year_end: industry?.fiscal_year_end || "",
      });
    }
  }, [open, industry, form]);

  const onSubmit = async (data: FormData) => {
    if (isEdit && industry) {
      await updateMutation.mutateAsync({ id: industry.industry_id, data: { industry_name: data.industry_name, fiscal_year_end: data.fiscal_year_end } });
    } else {
      await createMutation.mutateAsync({ industry_name: data.industry_name, fiscal_year_end: data.fiscal_year_end });
    }
    onOpenChange(false);
    form.reset();
  };

  const handleDelete = async () => {
    if (industry) {
      await deleteMutation.mutateAsync(industry.industry_id);
      onOpenChange(false);
    }
  };

  const isHighSeason = form.watch("fiscal_year_end")?.includes("December");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? t("industry.editIndustry") : t("industry.newIndustry")}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <FormField
              control={form.control}
              name="industry_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("industry.name")} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t("industry.placeholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fiscal_year_end"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("industry.fiscalYearEnd")} *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("industry.selectFiscalYear")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fiscalYearOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("fiscal_year_end") && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {t("industry.defaultSeason")}:{" "}
                  <span className={isHighSeason ? "text-accent font-medium" : "text-foreground"}>
                    {isHighSeason ? t("industry.highSeason") : t("industry.lowSeason")}
                  </span>
                </p>
              </div>
            )}

            <SheetFooter className="flex gap-2 pt-4">
              {isEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" size="icon">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("industry.deleteIndustry")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("common.confirmDelete", { name: industry?.industry_name })} {t("common.deleteWarning")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                        {t("common.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <LoadingButton
                type="submit"
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {isEdit ? t("common.saveChanges") : t("industry.createIndustry")}
              </LoadingButton>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
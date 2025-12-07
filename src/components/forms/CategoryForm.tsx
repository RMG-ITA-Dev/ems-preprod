import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
import { Category } from "@/hooks/useEmsData";
import { useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/useEmsMutations";
import { Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const formSchema = z.object({
  category_name: z.string().min(1, "Category name is required"),
  display_order: z.coerce.number().int().min(0),
  rate_high_bob: z.coerce.number().min(0, "Rate must be positive"),
  rate_low_bob: z.coerce.number().min(0, "Rate must be positive"),
  rate_high_usd: z.coerce.number().min(0, "Rate must be positive"),
  rate_low_usd: z.coerce.number().min(0, "Rate must be positive"),
  can_approve_wo: z.boolean().default(false),
  can_approve_timesheets: z.boolean().default(false),
});

type FormData = z.infer<typeof formSchema>;

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
}

export function CategoryForm({ open, onOpenChange, category }: CategoryFormProps) {
  const { t } = useTranslation();
  const isEdit = !!category;
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category_name: "",
      display_order: 0,
      rate_high_bob: 0,
      rate_low_bob: 0,
      rate_high_usd: 0,
      rate_low_usd: 0,
      can_approve_wo: false,
      can_approve_timesheets: false,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        category_name: category?.category_name || "",
        display_order: category?.display_order || 0,
        rate_high_bob: category?.rate_high_bob || 0,
        rate_low_bob: category?.rate_low_bob || 0,
        rate_high_usd: category?.rate_high_usd || 0,
        rate_low_usd: category?.rate_low_usd || 0,
        can_approve_wo: category?.can_approve_wo || false,
        can_approve_timesheets: (category as any)?.can_approve_timesheets || false,
      });
    }
  }, [open, category, form]);

  const onSubmit = async (data: FormData) => {
    const payload = {
      category_name: data.category_name,
      display_order: data.display_order,
      rate_high_bob: data.rate_high_bob,
      rate_low_bob: data.rate_low_bob,
      rate_high_usd: data.rate_high_usd,
      rate_low_usd: data.rate_low_usd,
      can_approve_wo: data.can_approve_wo,
      can_approve_timesheets: data.can_approve_timesheets,
    };
    if (isEdit && category) {
      await updateMutation.mutateAsync({ id: category.category_id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
    form.reset();
  };

  const handleDelete = async () => {
    if (category) {
      await deleteMutation.mutateAsync(category.category_id);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? t("category.editCategory") : t("category.newCategory")}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("category.name")} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t("category.placeholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="display_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("category.displayOrder")}</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">{t("category.bobRates")}</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="rate_high_bob"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("industry.highSeason")} *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rate_low_bob"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("industry.lowSeason")} *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">{t("category.usdRates")}</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="rate_high_usd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("industry.highSeason")} *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rate_low_usd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("industry.lowSeason")} *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Permissions Section */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h4 className="font-medium text-sm text-muted-foreground">{t("category.permissions")}</h4>
              <FormField
                control={form.control}
                name="can_approve_wo"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>{t("category.canApproveWO")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("category.canApproveWOHelp")}
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="can_approve_timesheets"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>{t("category.canApproveTimesheets")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("category.canApproveTimesheetsHelp")}
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            </div>

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
                      <AlertDialogTitle>{t("category.deleteCategory")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("common.confirmDelete", { name: category?.category_name })} {t("common.deleteWarning")}
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
              <Button
                type="submit"
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {isEdit ? t("common.saveChanges") : t("category.createCategory")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
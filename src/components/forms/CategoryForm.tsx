import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/mutations";
import { Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const NO_DEFAULT_ROLE = "__none__";

const formSchema = z.object({
  category_name: z.string().min(1, "Category name is required"),
  display_order: z.coerce.number().int().min(0),
  rate_high_bob: z.coerce.number().positive("Rate must be greater than 0"),
  rate_low_bob: z.coerce.number().positive("Rate must be greater than 0"),
  rate_high_usd: z.coerce.number().positive("Rate must be greater than 0"),
  rate_low_usd: z.coerce.number().positive("Rate must be greater than 0"),
  can_approve_wo: z.boolean().default(false),
  can_approve_timesheets: z.boolean().default(false),
  default_app_role: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
}

const ROLES: AppRole[] = [
  "admin",
  "partner",
  "director",
  "manager",
  "senior",
  "semisenior",
  "staff",
  "viewer",
  "sqr",
  "specialist_it",
  "specialist_tax",
];

export function CategoryForm({ open, onOpenChange, category }: CategoryFormProps) {
  const { t, i18n } = useTranslation();
  const numericLocale = i18n.language === "es" ? "es" : "en";
  const isEdit = !!category;
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category_name: "",
      display_order: 0,
      rate_high_bob: undefined as unknown as number,
      rate_low_bob: undefined as unknown as number,
      rate_high_usd: undefined as unknown as number,
      rate_low_usd: undefined as unknown as number,
      can_approve_wo: false,
      can_approve_timesheets: false,
      default_app_role: "__none__",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        category_name: category?.category_name || "",
        display_order: category?.display_order || 0,
        rate_high_bob: category?.rate_high_bob ?? (undefined as unknown as number),
        rate_low_bob: category?.rate_low_bob ?? (undefined as unknown as number),
        rate_high_usd: category?.rate_high_usd ?? (undefined as unknown as number),
        rate_low_usd: category?.rate_low_usd ?? (undefined as unknown as number),
        can_approve_wo: category?.can_approve_wo || false,
        can_approve_timesheets: category?.can_approve_timesheets || false,
        default_app_role: category?.default_app_role || "__none__",
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
      default_app_role: (data.default_app_role === "__none__" ? null : data.default_app_role as AppRole) ?? null,
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
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? t("category.editCategory") : t("category.newCategory")}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <NumericInput 
                        decimals={0} 
                        locale="en" 
                        min={0} 
                        value={field.value} 
                        onChange={field.onChange} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">{t("category.bobRates")}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="rate_high_bob"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("industry.highSeason")} *</FormLabel>
                      <FormControl>
                        <NumericInput decimals={2} locale={numericLocale} min={0} value={field.value} onChange={field.onChange} />
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
                        <NumericInput decimals={2} locale={numericLocale} min={0} value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">{t("category.usdRates")}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="rate_high_usd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("industry.highSeason")} *</FormLabel>
                      <FormControl>
                        <NumericInput decimals={2} locale={numericLocale} min={0} value={field.value} onChange={field.onChange} />
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
                        <NumericInput decimals={2} locale={numericLocale} min={0} value={field.value} onChange={field.onChange} />
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
                name="default_app_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("category.defaultAppRole")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || NO_DEFAULT_ROLE}>

                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("form.selectOption")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_DEFAULT_ROLE}>{t("common.none")}</SelectItem>

                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {t(`userRoles.roles.${role}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t("category.defaultAppRoleHelp")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="can_approve_wo"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 mt-4">
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

            <SheetFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
              <Button type="button" variant="cancel" onClick={() => onOpenChange(false)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                {t("common.cancel")}
              </Button>
              {isEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4">
                      <Trash2 className="h-4 w-4" /> {t("common.delete")}
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
                {isEdit ? t("common.saveChanges") : t("category.createCategory")}
              </LoadingButton>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

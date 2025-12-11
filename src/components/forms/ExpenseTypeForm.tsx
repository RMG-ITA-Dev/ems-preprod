import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
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
import { ExpenseType } from "@/hooks/useEmsData";
import { useCreateExpenseType, useUpdateExpenseType, useDeleteExpenseType } from "@/hooks/useEmsMutations";
import { Trash2 } from "lucide-react";

const formSchema = z.object({
  expense_name: z.string().min(1, "Expense name is required"),
  default_unit_cost: z.coerce.number().min(0, "Cost must be positive"),
});

type FormData = z.infer<typeof formSchema>;

interface ExpenseTypeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseType?: ExpenseType | null;
}

export function ExpenseTypeForm({ open, onOpenChange, expenseType }: ExpenseTypeFormProps) {
  const { t } = useTranslation();
  const isEdit = !!expenseType;
  const createMutation = useCreateExpenseType();
  const updateMutation = useUpdateExpenseType();
  const deleteMutation = useDeleteExpenseType();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      expense_name: "",
      default_unit_cost: 0,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        expense_name: expenseType?.expense_name || "",
        default_unit_cost: expenseType?.default_unit_cost || 0,
      });
    }
  }, [open, expenseType, form]);

  const onSubmit = async (data: FormData) => {
    const payload = {
      expense_name: data.expense_name,
      default_unit_cost: data.default_unit_cost,
    };
    if (isEdit && expenseType) {
      await updateMutation.mutateAsync({ id: expenseType.expense_type_id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
    form.reset();
  };

  const handleDelete = async () => {
    if (expenseType) {
      await deleteMutation.mutateAsync(expenseType.expense_type_id);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? t("expense.editExpenseType") : t("expense.newExpenseType")}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <FormField
              control={form.control}
              name="expense_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("expense.name")} *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Taxi, Hotel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="default_unit_cost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("expense.defaultUnitCost")}</FormLabel>
                  <FormControl>
                    <NumericInput decimals={2} locale="en" min={0} placeholder="0.00" value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                      <AlertDialogTitle>{t("expense.deleteExpenseType")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("common.confirmDelete", { name: expenseType?.expense_name })} {t("common.deleteWarning")}
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
                {isEdit ? t("common.saveChanges") : t("expense.createExpenseType")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
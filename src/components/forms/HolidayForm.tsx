import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { CalendarIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCreateHoliday,
  useUpdateHoliday,
  useDeleteHoliday,
} from "@/hooks/mutations/useHolidayMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import type { Holiday } from "@/hooks/useHolidays";

const formSchema = z.object({
  holiday_date: z.string().min(1, "Date is required"),
  holiday_name: z.string().min(1, "Name is required"),
  oficina: z.number().int().min(0).max(2),
});

type FormData = z.infer<typeof formSchema>;

interface HolidayFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holiday: Holiday | null;
}

export function HolidayForm({ open, onOpenChange, holiday }: HolidayFormProps) {
  const { t } = useTranslation();
  const { staffRecord } = useCurrentStaff();
  const isEdit = !!holiday;
  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      holiday_date: "",
      holiday_name: "",
      oficina: 0,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        holiday_date: holiday?.holiday_date ?? "",
        holiday_name: holiday?.holiday_name ?? "",
        oficina: holiday?.oficina ?? 0,
      });
    }
  }, [open, holiday, form]);

  const onSubmit = async (data: FormData) => {
    const payload = {
      holiday_date: data.holiday_date,
      holiday_name: data.holiday_name.trim(),
      oficina: data.oficina,
    };
    if (isEdit && holiday) {
      await updateHoliday.mutateAsync({ holiday_id: holiday.holiday_id, ...payload });
    } else {
      if (!staffRecord?.staff_id) return;
      await createHoliday.mutateAsync({ ...payload, created_by: staffRecord.staff_id });
    }
    onOpenChange(false);
    form.reset();
  };

  const handleDelete = async () => {
    if (holiday) {
      await deleteHoliday.mutateAsync(holiday.holiday_id);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? t("holiday.editHoliday") : t("holiday.addHoliday")}
          </SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <FormField
              control={form.control}
              name="holiday_date"
              render={({ field }) => {
                const selectedDate = field.value
                  ? new Date(field.value + "T12:00:00")
                  : undefined;
                return (
                  <FormItem>
                    <FormLabel>{t("holiday.date")} *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedDate
                              ? format(selectedDate, "dd/MM/yyyy")
                              : t("common.pickDate")}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) =>
                            field.onChange(date ? format(date, "yyyy-MM-dd") : "")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="holiday_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("holiday.name")} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t("holiday.name")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="oficina"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("holiday.oficina")} *</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(Number(v))}
                    value={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("engagement.selectOficina")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="0">{t("engagement.oficina_ambos")}</SelectItem>
                      <SelectItem value="1">{t("engagement.oficina_laPaz")}</SelectItem>
                      <SelectItem value="2">{t("engagement.oficina_santaCruz")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
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
              {isEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("common.delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("holiday.deleteHoliday")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("common.confirmDelete", { name: holiday?.holiday_name })}{" "}
                        {t("common.deleteWarning")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive/70 text-destructive-foreground hover:bg-destructive"
                      >
                        {t("common.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <LoadingButton
                type="submit"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                loading={createHoliday.isPending || updateHoliday.isPending}
              >
                {isEdit ? t("common.saveChanges") : t("common.save")}
              </LoadingButton>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

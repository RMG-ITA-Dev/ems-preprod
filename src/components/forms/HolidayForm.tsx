import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
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
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateHoliday, useUpdateHoliday, useDeleteHoliday } from "@/hooks/mutations/useHolidayMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import type { Holiday } from "@/hooks/useHolidays";

interface HolidayFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holiday: Holiday | null;
}

export function HolidayForm({ open, onOpenChange, holiday }: HolidayFormProps) {
  const { t } = useTranslation();
  const { staffRecord } = useCurrentStaff();
  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();

  const [date, setDate] = useState<Date | undefined>();
  const [name, setName] = useState("");

  useEffect(() => {
    if (holiday) {
      setDate(new Date(holiday.holiday_date + "T12:00:00"));
      setName(holiday.holiday_name);
    } else {
      setDate(undefined);
      setName("");
    }
  }, [holiday, open]);

  const handleSubmit = () => {
    if (!date || !name.trim()) return;

    const dateStr = format(date, "yyyy-MM-dd");

    if (holiday) {
      updateHoliday.mutate(
        { holiday_id: holiday.holiday_id, holiday_date: dateStr, holiday_name: name.trim() },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      if (!staffRecord?.staff_id) return;
      createHoliday.mutate(
        { holiday_date: dateStr, holiday_name: name.trim(), created_by: staffRecord.staff_id },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const handleDelete = () => {
    if (!holiday) return;
    deleteHoliday.mutate(holiday.holiday_id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const isPending = createHoliday.isPending || updateHoliday.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {holiday ? t("holiday.editHoliday") : t("holiday.addHoliday")}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("holiday.date")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "dd/MM/yyyy") : t("common.pickDate")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>{t("holiday.name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("holiday.name")}
            />
          </div>
        </div>

        <SheetFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
          <Button variant="cancel" onClick={() => onOpenChange(false)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
            {t("common.cancel")}
          </Button>
          {holiday && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("common.delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("holiday.deleteHoliday")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("holiday.deleteConfirm")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive/70 text-destructive-foreground hover:bg-destructive/90">
                    {t("common.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <LoadingButton onClick={handleSubmit} disabled={!date || !name.trim()} loading={isPending} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
            {t("common.save")}
          </LoadingButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

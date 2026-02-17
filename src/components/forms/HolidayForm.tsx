import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateHoliday, useUpdateHoliday } from "@/hooks/mutations/useHolidayMutations";
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

  const isPending = createHoliday.isPending || updateHoliday.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {holiday ? t("holiday.editHoliday") : t("holiday.addHoliday")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!date || !name.trim() || isPending}
          >
            {isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

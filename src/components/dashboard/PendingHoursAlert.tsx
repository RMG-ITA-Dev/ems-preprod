import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { AlertCircle, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface PendingWeek {
  week_start: string;
  expected_hours: number;
  actual_hours: number;
  gap: number;
}

const MAX_DETAIL = 12;

export function PendingHoursAlert() {
  const { t, i18n } = useTranslation();
  const { staffRecord } = useCurrentStaff();
  const dateLocale = i18n.language === "es" ? es : enUS;
  const [open, setOpen] = useState(false);

  const { data: pendingWeeks } = useQuery({
    queryKey: ["pending-hours", staffRecord?.staff_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_pending_hours", {
        p_staff_id: staffRecord!.staff_id,
      });
      if (error) throw error;
      return (data as unknown as PendingWeek[]) || [];
    },
    enabled: !!staffRecord?.staff_id,
    staleTime: 5 * 60 * 1000,
  });

  if (!pendingWeeks || pendingWeeks.length === 0) return null;

  const totalGap = pendingWeeks.reduce((s, w) => s + w.gap, 0);
  const weeksCount = pendingWeeks.length;
  const displayWeeks = pendingWeeks.slice(-MAX_DETAIL).reverse();
  const moreCount = weeksCount > MAX_DETAIL ? weeksCount - MAX_DETAIL : 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="py-4">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-start gap-3 text-left focus:outline-none"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-warning mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {t("dashboard.personal.pendingHours.title")}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t("dashboard.personal.pendingHours.summary", {
                    weeks: weeksCount,
                    hours: totalGap.toFixed(1),
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/timesheet">
                    {t("dashboard.personal.pendingHours.goToTimesheet")}
                  </Link>
                </Button>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    open && "rotate-180"
                  )}
                />
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3">
            <div className="rounded-md border">
              <Table className="table-dense">
                <TableHeader>
                  <TableRow>
                    <TableHead>{i18n.language === "es" ? "Semana" : "Week"}</TableHead>
                    <TableHead className="text-right">{t("dashboard.personal.pendingHours.expected")}</TableHead>
                    <TableHead className="text-right">{t("dashboard.personal.pendingHours.logged")}</TableHead>
                    <TableHead className="text-right">{t("dashboard.personal.pendingHours.missing")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayWeeks.map((week) => (
                    <TableRow key={week.week_start}>
                      <TableCell>
                        {t("dashboard.personal.pendingHours.weekOf", {
                          date: format(parseISO(week.week_start), "d MMM yyyy", { locale: dateLocale }),
                        })}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {week.expected_hours.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {week.actual_hours.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-warning">
                        {week.gap.toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {moreCount > 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {t("dashboard.personal.pendingHours.andMore", { count: moreCount })}
              </p>
            )}
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}

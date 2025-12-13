import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Grid3X3, CheckCircle2, Clock, AlertCircle, Circle } from 'lucide-react';
import { format, subWeeks, startOfWeek, isBefore, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface TimesheetMapProps {
  staffId: string;
}

type WeekStatus = 'submitted' | 'draft' | 'not_started' | 'overdue';

interface WeekData {
  weekStart: Date;
  status: WeekStatus;
  hours: number;
  isCurrentWeek: boolean;
}

export function TimesheetMap({ staffId }: TimesheetMapProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'es' ? es : enUS;

  const { data: weeks, isLoading } = useQuery({
    queryKey: ['timesheet-map', staffId],
    queryFn: async (): Promise<WeekData[]> => {
      const today = new Date();
      const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weeksData: WeekData[] = [];

      // Generate 12 weeks (current + 11 previous)
      for (let i = 0; i < 12; i++) {
        const weekStart = subWeeks(currentWeekStart, i);
        weeksData.push({
          weekStart,
          status: 'not_started',
          hours: 0,
          isCurrentWeek: i === 0,
        });
      }

      // Fetch timesheet periods for these weeks
      const weekStartDates = weeksData.map(w => format(w.weekStart, 'yyyy-MM-dd'));
      
      const { data: periods } = await supabase
        .from('timesheet_periods')
        .select('week_start_date, submitted_at, total_hours, deadline')
        .eq('staff_id', staffId)
        .in('week_start_date', weekStartDates);

      // Map periods to weeks
      const periodMap = new Map(periods?.map(p => [p.week_start_date, p]) || []);

      return weeksData.map((week): WeekData => {
        const weekKey = format(week.weekStart, 'yyyy-MM-dd');
        const period = periodMap.get(weekKey);

        if (!period) {
          // No period record - check if overdue (past week with no data)
          const isPast = isBefore(week.weekStart, currentWeekStart);
          return {
            ...week,
            status: isPast ? 'overdue' as WeekStatus : 'not_started' as WeekStatus,
          };
        }

        if (period.submitted_at) {
          return {
            ...week,
            status: 'submitted' as WeekStatus,
            hours: Number(period.total_hours) || 0,
          };
        }

        // Has period but not submitted
        const deadline = period.deadline ? parseISO(period.deadline) : null;
        const isOverdue = deadline && isBefore(deadline, today);

        return {
          ...week,
          status: (isOverdue ? 'overdue' : 'draft') as WeekStatus,
          hours: Number(period.total_hours) || 0,
        };
      }).reverse(); // Oldest first
    },
    enabled: !!staffId,
  });

  const getStatusColor = (status: WeekStatus, isCurrentWeek: boolean) => {
    if (isCurrentWeek) return 'bg-primary/30 border-primary';
    switch (status) {
      case 'submitted': return 'bg-success/70';
      case 'draft': return 'bg-warning/70';
      case 'overdue': return 'bg-destructive/70';
      case 'not_started': return 'bg-muted';
    }
  };

  const getStatusIcon = (status: WeekStatus) => {
    switch (status) {
      case 'submitted': return <CheckCircle2 className="h-3 w-3" />;
      case 'draft': return <Clock className="h-3 w-3" />;
      case 'overdue': return <AlertCircle className="h-3 w-3" />;
      case 'not_started': return <Circle className="h-3 w-3" />;
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm border-border">
        <CardContent className="p-4">
          <div className="flex gap-1">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="w-8 h-8 rounded bg-muted animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Grid3X3 className="h-4 w-4" />
          {t('dashboard.personal.timesheetMap')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="flex gap-1 flex-wrap">
            {weeks?.map((week, idx) => (
              <Tooltip key={idx}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "w-8 h-8 rounded flex items-center justify-center cursor-default transition-all",
                      getStatusColor(week.status, week.isCurrentWeek),
                      week.isCurrentWeek && "border-2"
                    )}
                  >
                    {getStatusIcon(week.status)}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="font-medium">
                    {format(week.weekStart, 'd MMM', { locale: dateLocale })}
                  </div>
                  <div className="text-muted-foreground">
                    {t(`dashboard.personal.mapLegend.${week.status}`)} • {week.hours.toFixed(1)}h
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>

        {/* Legend */}
        <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-success/70" />
            {t('dashboard.personal.mapLegend.submitted')}
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-warning/70" />
            {t('dashboard.personal.mapLegend.draft')}
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-muted" />
            {t('dashboard.personal.mapLegend.not_started')}
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-destructive/70" />
            {t('dashboard.personal.mapLegend.overdue')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}